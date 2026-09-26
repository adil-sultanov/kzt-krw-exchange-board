"""Exchange requests: posting, the Board, request details, and the author's edits, extensions
and closing; plus the expiry job."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import aiosqlite

from app.db import Database, utc_iso, utc_now
from app.models import BoardFilters, RequestCreate, RequestOut, RequestUpdate, User
from app.services.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
)
from app.services.rates import get_reference_rate

MAX_OPEN_REQUESTS = 5
MAX_CREATED_PER_HOUR = 5
MATCHES_LIMIT = 5
# The author's own requests stay listed (as expired) this long after they expire.
RECENTLY_EXPIRED = timedelta(hours=24)

logger = logging.getLogger(__name__)

# Columns for RequestOut. :ref is the reference rate (NULL if unknown), :viewer the caller.
_SELECT = """
SELECT r.id, r.direction, r.amount, r.rate_value,
       r.status, r.created_at, r.expires_at,
       u.completed_deals AS author_completed_deals,
       r.user_id = :viewer AS is_own,
       d.id AS my_deal_id, d.status AS my_deal_status,
       CASE WHEN r.user_id = :viewer THEN
           (SELECT COUNT(*) FROM deals p WHERE p.request_id = r.id AND p.status = 'pending')
       END AS pending_count,
       :ref * (1 + r.rate_value / 100.0) AS effective_rate
FROM requests r
JOIN users u ON u.telegram_id = r.user_id
LEFT JOIN deals d ON d.request_id = r.id AND d.responder_id = :viewer
"""

# Open, not yet expired, not the viewer's own, author not banned.
_VISIBLE_ON_BOARD = """
r.status = 'open' AND r.expires_at > :now AND r.user_id != :viewer AND u.is_banned = 0
"""

_BOARD_ORDER = {
    "newest": "r.id DESC",
    "amount_asc": "r.amount ASC, r.id DESC",
    "amount_desc": "r.amount DESC, r.id DESC",
    # Best for whoever takes it first. Every rate is the market rate plus an offset, and a
    # higher rate (more KRW per KZT) is better for the taker of a KRW_KZT request, who pays KZT.
    "best_rate": (
        "CASE r.direction WHEN 'KRW_KZT' THEN r.rate_value ELSE -r.rate_value END DESC, r.id DESC"
    ),
}


def _to_out(row: aiosqlite.Row, now: str) -> RequestOut:
    data = dict(row)
    data["is_own"] = bool(data["is_own"])
    # Until the expiry job has run, a past-due open request is already expired to viewers,
    # and a pending response to it (which can no longer be accepted) is declined.
    if data["status"] == "open" and data["expires_at"] <= now:
        data["status"] = "expired"
        if data["my_deal_status"] == "pending":
            data["my_deal_status"] = "declined"
        if data["pending_count"] is not None:
            data["pending_count"] = 0
    return RequestOut.model_validate(data)


async def _reference(db: Database) -> float | None:
    rate = await get_reference_rate(db)
    return rate.rate if rate is not None else None


async def _count(conn: aiosqlite.Connection, sql: str, params: tuple[Any, ...]) -> int:
    async with conn.execute(sql, params) as cursor:
        row = await cursor.fetchone()
    assert row is not None
    return int(row[0])


async def create_request(db: Database, user: User, data: RequestCreate) -> RequestOut:
    if user.is_banned:
        raise PermissionDeniedError("user_banned")
    if not user.username:
        raise PermissionDeniedError("username_required")

    now_dt = datetime.now(UTC)
    now = utc_iso(now_dt)
    expires_at = utc_iso(now_dt + timedelta(days=data.duration_days))
    hour_ago = utc_iso(now_dt - timedelta(hours=1))
    async with db.transaction() as conn:
        open_count = await _count(
            conn,
            "SELECT COUNT(*) FROM requests WHERE user_id = ? AND "
            "(status = 'in_progress' OR (status = 'open' AND expires_at > ?))",
            (user.telegram_id, now),
        )
        if open_count >= MAX_OPEN_REQUESTS:
            raise ConflictError("too_many_open_requests")
        recent_count = await _count(
            conn,
            "SELECT COUNT(*) FROM requests WHERE user_id = ? AND created_at > ?",
            (user.telegram_id, hour_ago),
        )
        if recent_count >= MAX_CREATED_PER_HOUR:
            raise RateLimitedError("rate_limited")
        cursor = await conn.execute(
            """
            INSERT INTO requests (user_id, direction, amount, rate_type, rate_value,
                                  created_at, updated_at, expires_at)
            VALUES (?, ?, ?, 'market', ?, ?, ?, ?)
            """,
            (
                user.telegram_id,
                data.direction,
                data.amount,
                data.rate_value,
                now,
                now,
                expires_at,
            ),
        )
        request_id = cursor.lastrowid
    assert request_id is not None
    return await get_request(db, user.telegram_id, request_id)


async def get_request(db: Database, viewer_id: int, request_id: int) -> RequestOut:
    """Any request by id. Requests of banned authors are hidden from everyone but the author."""
    now = utc_iso(datetime.now(UTC))
    params = {"viewer": viewer_id, "ref": await _reference(db), "id": request_id}
    async with db.conn.execute(
        _SELECT + " WHERE r.id = :id AND (u.is_banned = 0 OR r.user_id = :viewer)", params
    ) as cursor:
        row = await cursor.fetchone()
    if row is None:
        raise NotFoundError("request_not_found")
    return _to_out(row, now)


async def list_my_requests(db: Database, viewer_id: int) -> list[RequestOut]:
    """The viewer's own requests on the Board now, and those that expired in the last
    24 hours (status `expired`, for the in-app expiry notice), newest first."""
    now_dt = datetime.now(UTC)
    now = utc_iso(now_dt)
    params = {
        "viewer": viewer_id,
        "ref": await _reference(db),
        "since": utc_iso(now_dt - RECENTLY_EXPIRED),
    }
    async with db.conn.execute(
        _SELECT + " WHERE r.user_id = :viewer AND r.status IN ('open', 'expired') "
        "AND r.expires_at > :since ORDER BY r.id DESC",
        params,
    ) as cursor:
        rows = await cursor.fetchall()
    return [_to_out(row, now) for row in rows]


async def close_request(db: Database, actor_id: int, request_id: int) -> RequestOut:
    """The author takes their open request off the Board ("Cancel request" in the app).
    Its pending responders are declined.

    A request in progress can't be closed: its accepted deal ends only when both sides confirm.
    """
    now = utc_now()
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT r.user_id, u.is_banned "
            "FROM requests r JOIN users u ON u.telegram_id = r.user_id WHERE r.id = ?",
            (request_id,),
        ) as cursor:
            request = await cursor.fetchone()
        if request is None or (request["is_banned"] and request["user_id"] != actor_id):
            raise NotFoundError("request_not_found")
        if request["user_id"] != actor_id:
            raise PermissionDeniedError("not_request_author")
        cursor = await conn.execute(
            "UPDATE requests SET status = 'closed', updated_at = ? "
            "WHERE id = ? AND status = 'open' AND expires_at > ?",
            (now, request_id, now),
        )
        if cursor.rowcount != 1:
            raise ConflictError("request_not_open")
        await conn.execute(
            "UPDATE deals SET status = 'declined', updated_at = ? "
            "WHERE request_id = ? AND status = 'pending'",
            (now, request_id),
        )
    return await get_request(db, actor_id, request_id)


async def update_request(
    db: Database, user: User, request_id: int, data: RequestUpdate
) -> RequestOut:
    """The author edits the amount or rate of their open request, or extends it.

    Changing the terms is refused while anyone is waiting for an answer: they took the
    request as it was. Extending doesn't change the terms, so it's always allowed.
    """
    if user.is_banned:
        raise PermissionDeniedError("user_banned")
    now_dt = datetime.now(UTC)
    now = utc_iso(now_dt)
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT user_id, status, expires_at, amount, rate_value FROM requests WHERE id = ?",
            (request_id,),
        ) as cursor:
            request = await cursor.fetchone()
        if request is None:
            raise NotFoundError("request_not_found")
        if request["user_id"] != user.telegram_id:
            raise PermissionDeniedError("not_request_author")
        if request["status"] != "open" or request["expires_at"] <= now:
            raise ConflictError("request_not_open")

        changes: dict[str, Any] = {}
        if data.amount is not None and data.amount != request["amount"]:
            changes["amount"] = data.amount
        if data.rate_value is not None and data.rate_value != request["rate_value"]:
            changes["rate_value"] = data.rate_value
        if changes:
            pending = await _count(
                conn,
                "SELECT COUNT(*) FROM deals WHERE request_id = ? AND status = 'pending'",
                (request_id,),
            )
            if pending:
                raise ConflictError("request_has_responders")
        if data.extend_days is not None:
            expires_at = utc_iso(now_dt + timedelta(days=data.extend_days))
            if expires_at <= request["expires_at"]:
                raise ConflictError("already_extended")
            changes["expires_at"] = expires_at

        if changes:
            # Column names come from the fixed keys above, never from input.
            assignments = ", ".join(f"{column} = :{column}" for column in changes)
            cursor = await conn.execute(
                f"UPDATE requests SET {assignments}, updated_at = :now "
                "WHERE id = :id AND status = 'open' AND expires_at > :now",
                {**changes, "now": now, "id": request_id},
            )
            if cursor.rowcount != 1:
                raise ConflictError("request_not_open")
    return await get_request(db, user.telegram_id, request_id)


async def expire_due(db: Database) -> int:
    """Marks past-due open requests expired and declines their pending deals (the job).

    Requests in progress don't expire. Returns how many requests expired.
    """
    now = utc_now()
    async with db.transaction() as conn:
        await conn.execute(
            "UPDATE deals SET status = 'declined', updated_at = ? WHERE status = 'pending' "
            "AND request_id IN (SELECT id FROM requests WHERE status = 'open' AND expires_at <= ?)",
            (now, now),
        )
        cursor = await conn.execute(
            "UPDATE requests SET status = 'expired', updated_at = ? "
            "WHERE status = 'open' AND expires_at <= ?",
            (now, now),
        )
        expired = cursor.rowcount
    if expired:
        logger.info("Expired %d requests", expired)
    return expired


async def get_requests_by_ids(
    db: Database, viewer_id: int, request_ids: list[int]
) -> dict[int, RequestOut]:
    """Requests by id, including those of banned authors (for deal participants)."""
    if not request_ids:
        return {}
    now = utc_iso(datetime.now(UTC))
    params: dict[str, Any] = {"viewer": viewer_id, "ref": await _reference(db)}
    params.update({f"id{i}": request_id for i, request_id in enumerate(request_ids)})
    placeholders = ", ".join(f":id{i}" for i in range(len(request_ids)))
    async with db.conn.execute(_SELECT + f" WHERE r.id IN ({placeholders})", params) as cursor:
        rows = await cursor.fetchall()
    return {row["id"]: _to_out(row, now) for row in rows}


async def list_board(db: Database, viewer_id: int, filters: BoardFilters) -> list[RequestOut]:
    now = utc_iso(datetime.now(UTC))
    params: dict[str, Any] = {
        "viewer": viewer_id,
        "ref": await _reference(db),
        "now": now,
        "limit": filters.limit,
        "offset": filters.offset,
    }
    where = [_VISIBLE_ON_BOARD]
    if filters.direction is not None:
        where.append("r.direction = :direction")
        params["direction"] = filters.direction
    if filters.min_amount is not None:
        where.append("r.amount >= :min_amount")
        params["min_amount"] = filters.min_amount
    if filters.max_amount is not None:
        where.append("r.amount <= :max_amount")
        params["max_amount"] = filters.max_amount

    sql = (
        _SELECT
        + " WHERE "
        + " AND ".join(f"({clause.strip()})" for clause in where)
        + f" ORDER BY {_BOARD_ORDER[filters.sort]} LIMIT :limit OFFSET :offset"
    )
    async with db.conn.execute(sql, params) as cursor:
        rows = await cursor.fetchall()
    return [_to_out(row, now) for row in rows]


def _kzt_value(direction: str, amount: int, rate: float | None) -> float | None:
    """Size of a request in KZT, to compare requests in opposite directions."""
    if direction == "KZT_KRW":
        return float(amount)
    return amount / rate if rate else None


async def find_matches(
    db: Database, author_id: int, request: RequestOut, limit: int = MATCHES_LIMIT
) -> list[RequestOut]:
    """Open requests in the opposite direction, closest in size first.

    Sizes are compared in KZT, converting KRW amounts at each request's own rate
    (or the reference rate). Requests whose size can't be converted come last.
    """
    now = utc_iso(datetime.now(UTC))
    ref = await _reference(db)
    params: dict[str, Any] = {
        "viewer": author_id,
        "ref": ref,
        "now": now,
        "opposite": "KRW_KZT" if request.direction == "KZT_KRW" else "KZT_KRW",
        "target": _kzt_value(request.direction, request.amount, request.effective_rate or ref),
        "limit": limit,
    }
    # distance is NULL for every row when :target is NULL, which leaves newest first.
    sql = f"""
    SELECT m.*,
           ABS(CASE m.direction
                   WHEN 'KZT_KRW' THEN m.amount
                   ELSE m.amount / COALESCE(m.effective_rate, :ref)
               END - :target) AS distance
    FROM ({_SELECT} WHERE ({_VISIBLE_ON_BOARD.strip()}) AND r.direction = :opposite) AS m
    ORDER BY distance IS NULL, distance, m.id DESC
    LIMIT :limit
    """
    async with db.conn.execute(sql, params) as cursor:
        rows = await cursor.fetchall()
    return [_to_out(row, now) for row in rows]


async def list_matches(db: Database, viewer_id: int, request_id: int) -> list[RequestOut]:
    """Matches for the author's own request while it's on the Board (see find_matches)."""
    request = await get_request(db, viewer_id, request_id)
    if not request.is_own:
        raise PermissionDeniedError("not_request_author")
    if request.status != "open":
        return []
    return await find_matches(db, viewer_id, request)

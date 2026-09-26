"""Exchange requests: posting, the Board, request details, and closing one's own."""

from datetime import UTC, datetime, timedelta
from typing import Any

import aiosqlite

from app.db import Database, utc_iso, utc_now
from app.models import BoardFilters, RequestCreate, RequestOut, User
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

# Columns for RequestOut. :ref is the reference rate (NULL if unknown), :viewer the caller.
_SELECT = """
SELECT r.id, r.direction, r.amount, r.rate_value,
       r.status, r.created_at, r.expires_at,
       u.completed_deals AS author_completed_deals,
       r.user_id = :viewer AS is_own,
       d.id AS my_deal_id, d.status AS my_deal_status,
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
    # Every rate is the market rate plus an offset, so the offset orders them.
    "rate_asc": "r.rate_value ASC, r.id DESC",
    "rate_desc": "r.rate_value DESC, r.id DESC",
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


async def list_my_open_requests(db: Database, viewer_id: int) -> list[RequestOut]:
    """The viewer's own requests that are on the Board now, newest first."""
    now = utc_iso(datetime.now(UTC))
    params = {"viewer": viewer_id, "ref": await _reference(db), "now": now}
    async with db.conn.execute(
        _SELECT + " WHERE r.user_id = :viewer AND r.status = 'open' AND r.expires_at > :now "
        "ORDER BY r.id DESC",
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

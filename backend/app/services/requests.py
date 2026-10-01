"""Exchange requests: posting, the Board, request details, and the author's edits, extensions
and closing; plus the expiry job."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import aiosqlite

from app.db import Database, utc_iso, utc_now
from app.models import BoardFilters, Profile, RequestCreate, RequestOut, RequestUpdate, User
from app.services.errors import (
    ConflictError,
    InvalidInputError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
)
from app.services.notifications import Notifier
from app.services.rates import get_reference_rate

MAX_OPEN_REQUESTS = 5
MAX_CREATED_PER_HOUR = 5
MATCHES_LIMIT = 5
# The author's own requests stay listed (as expired) this long after they expire.
RECENTLY_EXPIRED = timedelta(hours=24)

logger = logging.getLogger(__name__)

# Whether an admin took request `r` off the board (see requests.close_reason), as RequestOut's
# `removed_by_admin`. Requests that aren't closed have no reason, which reads as false.
REMOVED_BY_ADMIN = "COALESCE(r.close_reason, 'author') != 'author'"

# A deal that still counts as its responder's response to the request: any but an accepted
# counter offer. That part is their deal, and the rest of the request is open to them like to
# anyone else. Unqualified columns of `deals`.
COUNTS_AS_RESPONSE = "NOT (partial = 1 AND status IN ('accepted', 'completed'))"

# How many offers (takes or counter offers) one person may send on a request, counting those
# they cancelled. Only cancelling frees them to send another; see deals.take_request.
MAX_OFFERS_PER_REQUEST = 3

# Columns for RequestOut. :ref is the reference rate (NULL if unknown), :viewer the caller.
_SELECT = f"""
SELECT r.id, r.direction, r.amount, r.rate_value, r.min_counter_amount, r.kzt_bank,
       r.status, {REMOVED_BY_ADMIN} AS removed_by_admin, r.created_at, r.expires_at,
       u.completed_deals AS author_completed_deals, u.username AS author_username,
       u.profile_first_name, u.profile_last_name, u.university, u.enrollment_year,
       r.user_id = :viewer AS is_own,
       d.id AS my_deal_id, d.status AS my_deal_status,
       CASE WHEN r.user_id != :viewer THEN MAX(0, {MAX_OFFERS_PER_REQUEST} - (
           SELECT COUNT(*) FROM deals o WHERE o.request_id = r.id AND o.responder_id = :viewer
           AND NOT (o.partial = 1 AND o.status IN ('accepted', 'completed'))
       )) END AS offers_left,
       CASE WHEN r.user_id = :viewer THEN
           (SELECT COUNT(*) FROM deals p WHERE p.request_id = r.id AND p.status = 'pending')
       END AS pending_count,
       :ref * (1 + r.rate_value / 100.0) AS effective_rate
FROM requests r
JOIN users u ON u.telegram_id = r.user_id
LEFT JOIN deals d ON d.id = (
    SELECT id FROM deals WHERE request_id = r.id AND responder_id = :viewer
    AND {COUNTS_AS_RESPONSE} ORDER BY id DESC LIMIT 1
)
"""

# Open, not yet expired, not the viewer's own, author not banned.
_VISIBLE_ON_BOARD = """
r.status = 'open' AND r.expires_at > :now AND r.user_id != :viewer AND u.is_banned = 0
"""

# Each key's descending order; ascending flips it. Ties go newest first either way.
_BOARD_ORDER = {
    "date": "r.id",
    # Within a tab, the amount you'd get. Across both, amounts in different currencies don't
    # compare, so a KRW amount counts as KZT at the request's own rate (unknown without a
    # reference rate: those come last).
    "amount": "CASE WHEN :direction IS NOT NULL OR r.direction = 'KZT_KRW' THEN r.amount"
    " ELSE r.amount / (:ref * (1 + r.rate_value / 100.0)) END",
    # Best for whoever takes it first. Every rate is the market rate plus an offset, and a
    # higher rate (more KRW per KZT) is better for the taker of a KRW_KZT request, who pays KZT.
    "rate": "CASE r.direction WHEN 'KRW_KZT' THEN r.rate_value ELSE -r.rate_value END",
}


def _to_out(row: aiosqlite.Row, now: str) -> RequestOut:
    data = dict(row)
    data["is_own"] = bool(data["is_own"])
    data["author_profile"] = Profile.from_row(row)
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


async def create_request(
    db: Database, user: User, data: RequestCreate, notifier: Notifier
) -> RequestOut:
    if user.is_banned:
        raise PermissionDeniedError("user_banned")
    if not user.username:
        raise PermissionDeniedError("username_required")
    if not user.has_profile:
        raise PermissionDeniedError("profile_required")

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
                                  min_counter_amount, kzt_bank, created_at, updated_at,
                                  expires_at)
            VALUES (?, ?, ?, 'market', ?, ?, ?, ?, ?, ?)
            """,
            (
                user.telegram_id,
                data.direction,
                data.amount,
                data.rate_value,
                data.min_counter_amount,
                data.kzt_bank,
                now,
                now,
                expires_at,
            ),
        )
        request_id = cursor.lastrowid
        if data.remember_kzt_bank is not None:
            saved = data.kzt_bank if data.remember_kzt_bank else None
            await conn.execute(
                "UPDATE users SET saved_kzt_bank = ?, updated_at = ? "
                "WHERE telegram_id = ? AND saved_kzt_bank IS NOT ?",
                (saved, now, user.telegram_id, saved),
            )
    assert request_id is not None
    notifier.request_posted(request_id)
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


async def close_request(
    db: Database, actor_id: int, request_id: int, notifier: Notifier
) -> RequestOut:
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
        if not await close_open_request(conn, request_id, now, closed_by=actor_id, reason="author"):
            raise ConflictError("request_not_open")
    notifier.requests_left_board()
    return await get_request(db, actor_id, request_id)


async def close_open_request(
    conn: aiosqlite.Connection,
    request_id: int,
    now: str,
    *,
    closed_by: int,
    reason: Literal["author", "admin"],
) -> bool:
    """Take a request off the Board if it's still open, declining its pending responders, and
    record who did it (its author, or an admin). Returns whether it was open. Runs inside the
    caller's transaction.
    """
    cursor = await conn.execute(
        "UPDATE requests SET status = 'closed', close_reason = ?, closed_by = ?, updated_at = ? "
        "WHERE id = ? AND status = 'open' AND expires_at > ?",
        (reason, closed_by, now, request_id, now),
    )
    if cursor.rowcount != 1:
        return False
    await conn.execute(
        "UPDATE deals SET status = 'declined', updated_at = ? "
        "WHERE request_id = ? AND status = 'pending'",
        (now, request_id),
    )
    return True


async def update_request(
    db: Database, user: User, request_id: int, data: RequestUpdate
) -> RequestOut:
    """The author edits the amount, rate, smallest counter offer or preferred KZT bank of their
    open request, or extends it.

    Changing the terms is refused while anyone is waiting for an answer: they took the
    request as it was. Extending doesn't change the terms, so it's always allowed.
    """
    if user.is_banned:
        raise PermissionDeniedError("user_banned")
    now_dt = datetime.now(UTC)
    now = utc_iso(now_dt)
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT user_id, status, expires_at, amount, rate_value, min_counter_amount, "
            "kzt_bank FROM requests WHERE id = ?",
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
        if (
            "min_counter_amount" in data.model_fields_set
            and data.min_counter_amount != request["min_counter_amount"]
        ):
            changes["min_counter_amount"] = data.min_counter_amount
        if "kzt_bank" in data.model_fields_set and data.kzt_bank != request["kzt_bank"]:
            changes["kzt_bank"] = data.kzt_bank
        minimum = changes.get("min_counter_amount", request["min_counter_amount"])
        if minimum is not None and minimum > changes.get("amount", request["amount"]):
            raise InvalidInputError("counter_minimum_too_large")
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


async def expire_due(db: Database, notifier: Notifier) -> int:
    """Marks past-due open requests expired and declines their pending deals (the job), and
    has alerts about any request that left the board crossed out.

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
    # Every run, not only when some expired: this also catches alerts that weren't crossed
    # out before a restart.
    notifier.requests_left_board()
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
    params["direction"] = filters.direction
    if filters.direction is not None:
        where.append("r.direction = :direction")

    sql = (
        _SELECT
        + " WHERE "
        + " AND ".join(f"({clause.strip()})" for clause in where)
        + f" ORDER BY {_BOARD_ORDER[filters.sort]} {filters.order.upper()} NULLS LAST, r.id DESC"
        + " LIMIT :limit OFFSET :offset"
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

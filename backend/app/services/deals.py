"""Deals: taking a request, accepting / declining responders, confirming payment
received, contact links.

Every state change runs in one transaction with the expected status in the UPDATE's
WHERE clause, so double taps and races between two open copies of the app are harmless.
The bot messages the author when their request is taken and the responder when they're
accepted, after the transaction commits; everything else is shown only in the app.

An accepted deal can't be cancelled: once contacts are exchanged, money may already have
moved, and cancelling would let one side back out after being paid. It ends only when
both sides confirm they received the money.

Finished deals are deleted a month after they end (the cleanup job); completed-deal counts
are kept on users, so they don't change.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import aiosqlite

from app.db import Database, utc_iso, utc_now
from app.models import (
    ContactOut,
    Currency,
    DealOut,
    DealRole,
    Direction,
    Profile,
    RequestOut,
    User,
)
from app.services.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.services.notifications import Notifier
from app.services.requests import get_requests_by_ids

logger = logging.getLogger(__name__)

# Finished deals are deleted this long after their last change.
DEAL_RETENTION_DAYS = 30

MY_DEALS_LIMIT = 100

# A deal with its request's current state.
_LOAD_DEAL = """
SELECT d.id, d.request_id, d.author_id, d.responder_id, d.status,
       d.author_confirmed, d.responder_confirmed,
       r.status AS request_status, r.expires_at, r.direction
FROM deals d
JOIN requests r ON r.id = d.request_id
WHERE d.id = ?
"""

# Columns for DealOut, except `request`. :viewer is the caller.
_SELECT_DEALS = """
SELECT d.id, d.status, d.request_id, d.created_at, d.updated_at,
       CASE WHEN d.author_id = :viewer THEN 'author' ELSE 'responder' END AS role,
       CASE WHEN d.author_id = :viewer THEN d.author_confirmed
            ELSE d.responder_confirmed END AS my_confirmed,
       CASE WHEN d.author_id = :viewer THEN d.responder_confirmed
            ELSE d.author_confirmed END AS other_confirmed,
       EXISTS (SELECT 1 FROM reports rp WHERE rp.deal_id = d.id AND rp.reporter_id = :viewer
               AND rp.resolved = 0) AS my_report_open,
       o.completed_deals AS other_completed_deals,
       o.profile_first_name, o.profile_last_name, o.university, o.enrollment_year
FROM deals d
JOIN users o ON o.telegram_id =
    CASE WHEN d.author_id = :viewer THEN d.responder_id ELSE d.author_id END
WHERE (d.author_id = :viewer OR d.responder_id = :viewer)
"""


async def _fetchone(
    conn: aiosqlite.Connection, sql: str, params: tuple[Any, ...]
) -> aiosqlite.Row | None:
    async with conn.execute(sql, params) as cursor:
        return await cursor.fetchone()


async def _update_one(
    conn: aiosqlite.Connection, sql: str, params: tuple[Any, ...] | dict[str, Any]
) -> None:
    """Run a guarded UPDATE that must change exactly one row (else the transaction rolls back)."""
    cursor = await conn.execute(sql, params)
    if cursor.rowcount != 1:
        raise ConflictError("deal_state_changed")


async def _load_for(
    conn: aiosqlite.Connection, deal_id: int, actor_id: int, role: Literal["author", "any"]
) -> aiosqlite.Row:
    """The deal, if `actor_id` may act on it. Non-participants get not-found."""
    deal = await _fetchone(conn, _LOAD_DEAL, (deal_id,))
    if deal is None or actor_id not in (deal["author_id"], deal["responder_id"]):
        raise NotFoundError("deal_not_found")
    if role == "author" and actor_id != deal["author_id"]:
        raise PermissionDeniedError("not_request_author")
    return deal


async def _username(conn: aiosqlite.Connection, telegram_id: int) -> str | None:
    row = await _fetchone(conn, "SELECT username FROM users WHERE telegram_id = ?", (telegram_id,))
    return row["username"] if row is not None else None


def gives_currency(direction: Direction, role: DealRole) -> Currency:
    """The currency this side of a deal pays. The author gives the request's currency."""
    author_gives: Currency = "KZT" if direction == "KZT_KRW" else "KRW"
    if role == "author":
        return author_gives
    return "KRW" if author_gives == "KZT" else "KZT"


async def _receive_details(
    conn: aiosqlite.Connection, telegram_id: int, currency: Currency
) -> tuple[str | None, str | None]:
    """Where this user receives `currency`, as (bank, account). Sensitive: never log."""
    prefix = "receive_kzt" if currency == "KZT" else "receive_krw"
    row = await _fetchone(
        conn,
        f"SELECT {prefix}_bank AS bank, {prefix}_account AS account "
        "FROM users WHERE telegram_id = ?",
        (telegram_id,),
    )
    return (row["bank"], row["account"]) if row is not None else (None, None)


# --- Reading ---


async def _deals_for(
    db: Database, viewer_id: int, extra_where: str = "", params: dict[str, Any] | None = None
) -> list[DealOut]:
    sql = _SELECT_DEALS + extra_where + " ORDER BY d.updated_at DESC, d.id DESC LIMIT :limit"
    all_params = {"viewer": viewer_id, "limit": MY_DEALS_LIMIT, **(params or {})}
    async with db.conn.execute(sql, all_params) as cursor:
        rows = await cursor.fetchall()
    requests = await get_requests_by_ids(db, viewer_id, [row["request_id"] for row in rows])
    return [_to_out(row, requests[row["request_id"]]) for row in rows]


def _to_out(row: aiosqlite.Row, request: RequestOut) -> DealOut:
    data = {**dict(row), "request": request, "other_profile": Profile.from_row(row)}
    # Expiring a request declines its pending deals; until the expiry job has run, a pending
    # deal on a past-due request (which can no longer be accepted) is already declined.
    if data["status"] == "pending" and request.status == "expired":
        data["status"] = "declined"
    return DealOut.model_validate(data)


async def get_deal(db: Database, viewer_id: int, deal_id: int) -> DealOut:
    """A deal, for its participants only."""
    deals = await _deals_for(db, viewer_id, " AND d.id = :id", {"id": deal_id})
    if not deals:
        raise NotFoundError("deal_not_found")
    return deals[0]


async def list_my_deals(db: Database, viewer_id: int) -> list[DealOut]:
    """Deals the viewer is part of, on either side, most recently changed first."""
    return await _deals_for(db, viewer_id)


async def get_contact(db: Database, viewer_id: int, deal_id: int) -> ContactOut:
    """The other side's current Telegram link and where to pay them, once the deal is accepted."""
    deal = await _load_for(db.conn, deal_id, viewer_id, "any")
    if deal["status"] not in ("accepted", "completed"):
        raise ConflictError("contact_unavailable")
    role: DealRole = "author" if viewer_id == deal["author_id"] else "responder"
    other_id = deal["responder_id"] if role == "author" else deal["author_id"]
    username = await _username(db.conn, other_id)
    if not username:
        raise ConflictError("contact_no_username")
    pay_currency = gives_currency(deal["direction"], role)
    pay_bank, pay_account = await _receive_details(db.conn, other_id, pay_currency)
    return ContactOut(
        username=username,
        url=f"https://t.me/{username}",
        pay_currency=pay_currency,
        pay_bank=pay_bank,
        pay_account=pay_account,
    )


# --- State changes ---


async def take_request(db: Database, user: User, request_id: int, notifier: Notifier) -> DealOut:
    """Create a pending deal on someone else's open request, with the caller as responder."""
    if user.is_banned:
        raise PermissionDeniedError("user_banned")
    if not user.username:
        raise PermissionDeniedError("username_required")
    if not user.has_profile:
        raise PermissionDeniedError("profile_required")

    now = utc_now()
    async with db.transaction() as conn:
        request = await _fetchone(
            conn,
            "SELECT r.user_id, r.status, r.expires_at, u.is_banned "
            "FROM requests r JOIN users u ON u.telegram_id = r.user_id WHERE r.id = ?",
            (request_id,),
        )
        if request is None or (request["is_banned"] and request["user_id"] != user.telegram_id):
            raise NotFoundError("request_not_found")
        if request["user_id"] == user.telegram_id:
            raise PermissionDeniedError("own_request")
        existing = await _fetchone(
            conn,
            "SELECT 1 FROM deals WHERE request_id = ? AND responder_id = ?",
            (request_id, user.telegram_id),
        )
        if existing is not None:
            raise ConflictError("already_responded")
        if request["status"] != "open" or request["expires_at"] <= now:
            raise ConflictError("request_not_open")
        cursor = await conn.execute(
            """
            INSERT INTO deals (request_id, author_id, responder_id, created_at, updated_at)
            SELECT id, user_id, ?, ?, ? FROM requests
            WHERE id = ? AND status = 'open' AND expires_at > ?
            """,
            (user.telegram_id, now, now, request_id, now),
        )
        if cursor.rowcount != 1 or cursor.lastrowid is None:
            raise ConflictError("request_not_open")
        deal_id = cursor.lastrowid
        author_id = request["user_id"]

    notifier.deal_requested(author_id, await get_deal(db, author_id, deal_id))
    return await get_deal(db, user.telegram_id, deal_id)


async def accept_deal(db: Database, actor_id: int, deal_id: int, notifier: Notifier) -> DealOut:
    """Author accepts a responder: the request goes in progress, other responders are declined."""
    now = utc_now()
    async with db.transaction() as conn:
        deal = await _load_for(conn, deal_id, actor_id, "author")
        if deal["status"] != "pending":
            raise ConflictError("deal_not_pending")
        if deal["request_status"] != "open" or deal["expires_at"] <= now:
            raise ConflictError("request_not_open")
        request_id = deal["request_id"]
        await _update_one(
            conn,
            "UPDATE deals SET status = 'accepted', updated_at = ? "
            "WHERE id = ? AND status = 'pending'",
            (now, deal_id),
        )
        await _update_one(
            conn,
            "UPDATE requests SET status = 'in_progress', updated_at = ? "
            "WHERE id = ? AND status = 'open' AND expires_at > ?",
            (now, request_id, now),
        )
        await conn.execute(
            "UPDATE deals SET status = 'declined', updated_at = ? "
            "WHERE request_id = ? AND status = 'pending'",
            (now, request_id),
        )
        responder_id = deal["responder_id"]

    notifier.deal_accepted(responder_id, await get_deal(db, responder_id, deal_id))
    return await get_deal(db, actor_id, deal_id)


async def decline_deal(db: Database, actor_id: int, deal_id: int) -> DealOut:
    """Author declines a pending responder."""
    now = utc_now()
    async with db.transaction() as conn:
        deal = await _load_for(conn, deal_id, actor_id, "author")
        if deal["status"] != "pending":
            raise ConflictError("deal_not_pending")
        await _update_one(
            conn,
            "UPDATE deals SET status = 'declined', updated_at = ? "
            "WHERE id = ? AND status = 'pending'",
            (now, deal_id),
        )

    return await get_deal(db, actor_id, deal_id)


async def confirm_received(db: Database, actor_id: int, deal_id: int) -> DealOut:
    """The caller received the other side's payment. Once both have, the deal completes:
    deal and request -> completed, and both users' completed_deals += 1.

    Confirming twice is a no-op.
    """
    now = utc_now()
    async with db.transaction() as conn:
        deal = await _load_for(conn, deal_id, actor_id, "any")
        if deal["status"] != "accepted":
            raise ConflictError("deal_not_accepted")
        column: Literal["author_confirmed", "responder_confirmed"] = (
            "author_confirmed" if actor_id == deal["author_id"] else "responder_confirmed"
        )
        if not deal[column]:
            await _confirm(conn, deal, column, now)
    return await get_deal(db, actor_id, deal_id)


async def _confirm(
    conn: aiosqlite.Connection,
    deal: aiosqlite.Row,
    column: Literal["author_confirmed", "responder_confirmed"],
    now: str,
) -> None:
    """Set one side's confirmation; complete the deal if both are set."""
    deal_id = deal["id"]
    await _update_one(
        conn,
        f"UPDATE deals SET {column} = 1, updated_at = ? "
        f"WHERE id = ? AND status = 'accepted' AND {column} = 0",
        (now, deal_id),
    )
    cursor = await conn.execute(
        "UPDATE deals SET status = 'completed', updated_at = ? "
        "WHERE id = ? AND status = 'accepted' "
        "AND author_confirmed = 1 AND responder_confirmed = 1",
        (now, deal_id),
    )
    if cursor.rowcount != 1:
        return
    await _update_one(
        conn,
        "UPDATE requests SET status = 'completed', updated_at = ? "
        "WHERE id = ? AND status = 'in_progress'",
        (now, deal["request_id"]),
    )
    await conn.execute(
        "UPDATE users SET completed_deals = completed_deals + 1, updated_at = ? "
        "WHERE telegram_id IN (?, ?)",
        (now, deal["author_id"], deal["responder_id"]),
    )


async def delete_old_deals(db: Database, now: datetime | None = None) -> int:
    """Delete completed, declined and cancelled deals that ended over a month ago (the job).

    Deals in progress stay, and so do reported ones: admins may still need them. So do deals
    on a request still on the board: a declined one keeps its responder from taking it again.
    Returns how many deals were deleted.
    """
    cutoff = utc_iso((now or datetime.now(UTC)) - timedelta(days=DEAL_RETENTION_DAYS))
    async with db.transaction() as conn:
        cursor = await conn.execute(
            """
            DELETE FROM deals
            WHERE status IN ('completed', 'declined', 'cancelled') AND updated_at < ?
              AND NOT EXISTS (SELECT 1 FROM reports WHERE deal_id = deals.id)
              AND NOT EXISTS (
                  SELECT 1 FROM requests WHERE id = deals.request_id AND status = 'open'
              )
            """,
            (cutoff,),
        )
        deleted = cursor.rowcount
    if deleted:
        logger.info("Deleted %d old deals", deleted)
    return deleted

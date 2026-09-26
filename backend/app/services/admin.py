"""Admin tools: review reports, ban and unban users. Owner tools: add and remove admins,
and delete any deal.

Every function checks that the actor is an admin (owner included) or the owner.
Admins see the current usernames of the people in a report, never their receiving details.
"""

from typing import Any

import aiosqlite

from app.config import Settings
from app.db import Database, utc_now
from app.models import (
    AdminDealOut,
    AdminOut,
    AdminReportOut,
    AdminRequestOut,
    AdminSource,
    AdminUserOut,
    OwnerDealOut,
    User,
)
from app.services.errors import ConflictError, NotFoundError, PermissionDeniedError

REPORTS_LIMIT = 100
OWNER_DEALS_LIMIT = 100

_SELECT_REPORTS = """
SELECT rp.id, rp.category, rp.reason AS note, rp.created_at, rp.resolved, rp.resolved_at,
       rp.reporter_id, rp.reported_id, rp.request_id, rp.deal_id,
       r.user_id AS author_id, r.direction, r.amount, r.status AS request_status,
       d.status AS deal_status, d.author_confirmed, d.responder_confirmed
FROM reports rp
JOIN requests r ON r.id = rp.request_id
LEFT JOIN deals d ON d.id = rp.deal_id
WHERE rp.resolved = :resolved
ORDER BY COALESCE(rp.resolved_at, rp.created_at) DESC, rp.id DESC
LIMIT :limit
"""

# Explicit columns: receiving details must never reach admin output.
_SELECT_USERS = """
SELECT u.telegram_id, u.username, u.first_name, u.completed_deals, u.is_banned, u.is_admin,
       u.admin_granted,
       (SELECT COUNT(*) FROM reports WHERE reported_id = u.telegram_id AND resolved = 0)
           AS open_reports
FROM users u
"""


def _require_admin(actor: User) -> None:
    if not actor.is_admin:
        raise PermissionDeniedError("admin_only")


def _require_owner(actor: User, settings: Settings) -> None:
    if not settings.is_owner(actor.telegram_id):
        raise PermissionDeniedError("owner_only")


async def _users(conn: aiosqlite.Connection, ids: set[int]) -> dict[int, AdminUserOut]:
    if not ids:
        return {}
    placeholders = ", ".join("?" * len(ids))
    async with conn.execute(
        _SELECT_USERS + f" WHERE u.telegram_id IN ({placeholders})", tuple(ids)
    ) as cursor:
        rows = await cursor.fetchall()
    return {row["telegram_id"]: AdminUserOut.model_validate(dict(row)) for row in rows}


async def list_reports(db: Database, actor: User, *, resolved: bool) -> list[AdminReportOut]:
    """Open (or resolved) reports, most recent first, with the people and request involved."""
    _require_admin(actor)
    params: dict[str, Any] = {"resolved": int(resolved), "limit": REPORTS_LIMIT}
    async with db.conn.execute(_SELECT_REPORTS, params) as cursor:
        rows = await cursor.fetchall()
    user_ids = {row["reporter_id"] for row in rows}
    user_ids |= {row["reported_id"] for row in rows if row["reported_id"] is not None}
    users = await _users(db.conn, user_ids)
    return [_report_out(row, users) for row in rows]


def _report_out(row: aiosqlite.Row, users: dict[int, AdminUserOut]) -> AdminReportOut:
    deal = None
    if row["deal_id"] is not None:
        deal = AdminDealOut(
            id=row["deal_id"],
            status=row["deal_status"],
            author_confirmed=row["author_confirmed"],
            responder_confirmed=row["responder_confirmed"],
        )
    return AdminReportOut(
        id=row["id"],
        category=row["category"],
        note=row["note"],
        created_at=row["created_at"],
        resolved=row["resolved"],
        resolved_at=row["resolved_at"],
        reporter=users[row["reporter_id"]],
        reported=users.get(row["reported_id"]) if row["reported_id"] is not None else None,
        request=AdminRequestOut(
            id=row["request_id"],
            author_id=row["author_id"],
            direction=row["direction"],
            amount=row["amount"],
            status=row["request_status"],
        ),
        deal=deal,
    )


async def resolve_report(db: Database, actor: User, report_id: int) -> None:
    """Mark a report handled. Resolving it twice (two admins at once) is a conflict."""
    _require_admin(actor)
    async with db.transaction() as conn:
        cursor = await conn.execute(
            "UPDATE reports SET resolved = 1, resolved_at = ?, resolved_by = ? "
            "WHERE id = ? AND resolved = 0",
            (utc_now(), actor.telegram_id, report_id),
        )
        if cursor.rowcount == 1:
            return
        async with conn.execute("SELECT 1 FROM reports WHERE id = ?", (report_id,)) as check:
            exists = await check.fetchone() is not None
    raise ConflictError("report_already_resolved") if exists else NotFoundError("report_not_found")


async def ban_user(db: Database, actor: User, user_id: int) -> AdminUserOut:
    """Ban a user: they can't post or take requests, their open requests close, and their
    pending deals (on either side) are declined. Accepted deals are left alone: they still
    end only when both sides confirm, and the other side can report them.
    """
    _require_admin(actor)
    now = utc_now()
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT is_admin FROM users WHERE telegram_id = ?", (user_id,)
        ) as cursor:
            target = await cursor.fetchone()
        if target is None:
            raise NotFoundError("user_not_found")
        if target["is_admin"]:
            raise PermissionDeniedError("cannot_ban_admin")
        await conn.execute(
            "UPDATE users SET is_banned = 1, updated_at = ? "
            "WHERE telegram_id = ? AND is_banned = 0",
            (now, user_id),
        )
        await conn.execute(
            "UPDATE requests SET status = 'closed', updated_at = ? "
            "WHERE user_id = ? AND status = 'open'",
            (now, user_id),
        )
        await conn.execute(
            "UPDATE deals SET status = 'declined', updated_at = ? "
            "WHERE status = 'pending' AND (author_id = ? OR responder_id = ?)",
            (now, user_id, user_id),
        )
        return (await _users(conn, {user_id}))[user_id]


async def unban_user(db: Database, actor: User, user_id: int) -> AdminUserOut:
    """Lift a ban. Requests closed by the ban stay closed."""
    _require_admin(actor)
    async with db.transaction() as conn:
        await conn.execute(
            "UPDATE users SET is_banned = 0, updated_at = ? "
            "WHERE telegram_id = ? AND is_banned = 1",
            (utc_now(), user_id),
        )
        users = await _users(conn, {user_id})
    if user_id not in users:
        raise NotFoundError("user_not_found")
    return users[user_id]


# --- Owner: admins ---


def _admin_source(settings: Settings, telegram_id: int) -> AdminSource:
    if settings.is_owner(telegram_id):
        return "owner"
    return "config" if settings.is_admin(telegram_id) else "granted"


def _admin_out(settings: Settings, user: AdminUserOut) -> AdminOut:
    return AdminOut(**user.model_dump(), source=_admin_source(settings, user.telegram_id))


async def list_admins(db: Database, actor: User, settings: Settings) -> list[AdminOut]:
    """Everyone with admin rights who has used the app: the owner, then ADMIN_IDS, then the
    admins added in the app. Configured admins who never opened the app aren't listed.
    """
    _require_owner(actor, settings)
    config_ids = {*settings.admin_ids, *([settings.owner_id] if settings.owner_id else [])}
    placeholders = ", ".join("?" * len(config_ids))
    where = f" WHERE u.admin_granted = 1 OR u.telegram_id IN ({placeholders})"
    async with db.conn.execute(_SELECT_USERS + where, tuple(config_ids)) as cursor:
        rows = await cursor.fetchall()
    admins = [_admin_out(settings, AdminUserOut.model_validate(dict(row))) for row in rows]
    order: list[AdminSource] = ["owner", "config", "granted"]
    return sorted(admins, key=lambda a: (order.index(a.source), (a.username or "").lower()))


async def add_admin(db: Database, actor: User, settings: Settings, username: str) -> AdminOut:
    """Make the user who currently has this username an admin. They must have used the app or
    the bot (that's how their username is known), and not be banned.
    """
    _require_owner(actor, settings)
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT telegram_id, is_banned, admin_granted FROM users "
            "WHERE username = ? COLLATE NOCASE",
            (username,),
        ) as cursor:
            target = await cursor.fetchone()
        if target is None:
            raise NotFoundError("username_not_found")
        user_id = target["telegram_id"]
        if target["admin_granted"] or settings.is_admin(user_id):
            raise ConflictError("already_admin")
        if target["is_banned"]:
            raise ConflictError("cannot_promote_banned")
        await conn.execute(
            "UPDATE users SET admin_granted = 1, is_admin = 1, updated_at = ? "
            "WHERE telegram_id = ? AND admin_granted = 0",
            (utc_now(), user_id),
        )
        user = (await _users(conn, {user_id}))[user_id]
    return _admin_out(settings, user)


async def remove_admin(db: Database, actor: User, settings: Settings, user_id: int) -> None:
    """Take back admin rights the owner gave in the app. Admins in ADMIN_IDS / OWNER_ID can
    only be removed there.
    """
    _require_owner(actor, settings)
    if settings.is_admin(user_id):
        raise PermissionDeniedError("admin_in_config")
    async with db.transaction() as conn:
        cursor = await conn.execute(
            "UPDATE users SET admin_granted = 0, is_admin = 0, updated_at = ? "
            "WHERE telegram_id = ? AND admin_granted = 1",
            (utc_now(), user_id),
        )
        if cursor.rowcount == 1:
            return
    raise NotFoundError("admin_not_found")


# --- Owner: deals ---

_SELECT_OWNER_DEALS = """
SELECT d.id, d.status, d.author_confirmed, d.responder_confirmed, d.created_at, d.updated_at,
       d.author_id, d.responder_id, d.request_id,
       r.direction, r.amount, r.status AS request_status
FROM deals d
JOIN requests r ON r.id = d.request_id
WHERE d.status IN ({statuses})
ORDER BY d.updated_at {order}, d.id {order}
LIMIT ?
"""


async def list_deals(
    db: Database, actor: User, settings: Settings, *, active: bool
) -> list[OwnerDealOut]:
    """Active deals (pending or accepted), least recently changed first, so stale ones lead;
    or finished ones (completed or declined), most recent first.
    """
    _require_owner(actor, settings)
    sql = _SELECT_OWNER_DEALS.format(
        statuses="'pending', 'accepted'" if active else "'completed', 'declined'",
        order="ASC" if active else "DESC",
    )
    async with db.conn.execute(sql, (OWNER_DEALS_LIMIT,)) as cursor:
        rows = await cursor.fetchall()
    users = await _users(
        db.conn, {row["author_id"] for row in rows} | {row["responder_id"] for row in rows}
    )
    return [
        OwnerDealOut(
            id=row["id"],
            status=row["status"],
            author_confirmed=row["author_confirmed"],
            responder_confirmed=row["responder_confirmed"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            request=AdminRequestOut(
                id=row["request_id"],
                author_id=row["author_id"],
                direction=row["direction"],
                amount=row["amount"],
                status=row["request_status"],
            ),
            author=users[row["author_id"]],
            responder=users[row["responder_id"]],
        )
        for row in rows
    ]


async def delete_deal(db: Database, actor: User, settings: Settings, deal_id: int) -> None:
    """Delete any deal, e.g. one left stuck when a side disappeared. Nobody is notified; the
    deal just disappears from both sides' My deals.

    Deleting an accepted deal closes its request (in progress until now), since nobody else can
    take it. Completed-deal counts don't change. Reports on the deal stay, as reports on its
    request.
    """
    _require_owner(actor, settings)
    now = utc_now()
    async with db.transaction() as conn:
        async with conn.execute(
            "SELECT request_id, status FROM deals WHERE id = ?", (deal_id,)
        ) as cursor:
            deal = await cursor.fetchone()
        if deal is None:
            raise NotFoundError("deal_not_found")
        await conn.execute("UPDATE reports SET deal_id = NULL WHERE deal_id = ?", (deal_id,))
        await conn.execute("DELETE FROM deals WHERE id = ?", (deal_id,))
        if deal["status"] == "accepted":
            await conn.execute(
                "UPDATE requests SET status = 'closed', updated_at = ? "
                "WHERE id = ? AND status = 'in_progress'",
                (now, deal["request_id"]),
            )

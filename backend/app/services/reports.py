"""Reports: users flag a request, or the other side of their accepted deal, for admin review.

A report on a deal is how a user gets help when the other side disappears or doesn't pay:
an accepted deal can't be cancelled, so it stays `accepted` and an admin reviews it.
Reports never notify anyone by bot; admins see them in the app.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import aiosqlite

from app.db import Database, utc_iso
from app.models import ReportCreate, ReportOut
from app.services.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
)

MAX_REPORTS_PER_DAY = 5


async def _fetchone(
    conn: aiosqlite.Connection, sql: str, params: tuple[Any, ...]
) -> aiosqlite.Row | None:
    async with conn.execute(sql, params) as cursor:
        return await cursor.fetchone()


async def report_request(
    db: Database, reporter_id: int, request_id: int, data: ReportCreate
) -> ReportOut:
    """Report someone else's request. Requests of banned authors are hidden, so not found."""
    async with db.transaction() as conn:
        request = await _fetchone(
            conn,
            "SELECT r.user_id, u.is_banned "
            "FROM requests r JOIN users u ON u.telegram_id = r.user_id WHERE r.id = ?",
            (request_id,),
        )
        if request is None or (request["is_banned"] and request["user_id"] != reporter_id):
            raise NotFoundError("request_not_found")
        if request["user_id"] == reporter_id:
            raise PermissionDeniedError("own_request")
        duplicate = await _fetchone(
            conn,
            "SELECT 1 FROM reports WHERE reporter_id = ? AND request_id = ? "
            "AND deal_id IS NULL AND resolved = 0",
            (reporter_id, request_id),
        )
        if duplicate is not None:
            raise ConflictError("already_reported")
        return await _insert(conn, reporter_id, request["user_id"], request_id, None, data)


async def report_deal(
    db: Database, reporter_id: int, deal_id: int, data: ReportCreate
) -> ReportOut:
    """Report the other side of the caller's accepted deal. The deal itself doesn't change."""
    async with db.transaction() as conn:
        deal = await _fetchone(
            conn,
            "SELECT request_id, author_id, responder_id, status FROM deals WHERE id = ?",
            (deal_id,),
        )
        if deal is None or reporter_id not in (deal["author_id"], deal["responder_id"]):
            raise NotFoundError("deal_not_found")
        if deal["status"] != "accepted":
            raise ConflictError("deal_not_accepted")
        other_id = deal["responder_id"] if reporter_id == deal["author_id"] else deal["author_id"]
        duplicate = await _fetchone(
            conn,
            "SELECT 1 FROM reports WHERE reporter_id = ? AND deal_id = ? AND resolved = 0",
            (reporter_id, deal_id),
        )
        if duplicate is not None:
            raise ConflictError("already_reported")
        return await _insert(conn, reporter_id, other_id, deal["request_id"], deal_id, data)


async def _insert(
    conn: aiosqlite.Connection,
    reporter_id: int,
    reported_id: int,
    request_id: int,
    deal_id: int | None,
    data: ReportCreate,
) -> ReportOut:
    """Insert a report, within the daily limit (in the caller's transaction)."""
    now_dt = datetime.now(UTC)
    now = utc_iso(now_dt)
    recent = await _fetchone(
        conn,
        "SELECT COUNT(*) FROM reports WHERE reporter_id = ? AND created_at > ?",
        (reporter_id, utc_iso(now_dt - timedelta(days=1))),
    )
    assert recent is not None
    if recent[0] >= MAX_REPORTS_PER_DAY:
        raise RateLimitedError("too_many_reports")
    cursor = await conn.execute(
        "INSERT INTO reports (reporter_id, reported_id, request_id, deal_id, category, reason, "
        "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (reporter_id, reported_id, request_id, deal_id, data.category, data.note, now),
    )
    assert cursor.lastrowid is not None
    return ReportOut(
        id=cursor.lastrowid,
        category=data.category,
        request_id=request_id,
        deal_id=deal_id,
        created_at=now,
    )

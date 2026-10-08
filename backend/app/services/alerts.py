"""Alerts: the bot messages people about new requests in the Board tabs they have alerts on
for (off by default; on for both tabs for those whose first contact is the bot, see
services/users.py), and crosses those messages out once the request leaves the board.

Sending runs in the background after the request's transaction commits (see
app/bot/alerts.py); this module decides who gets what and keeps track of what was sent.
Alert messages carry no names or usernames: only amounts and a button to open the request.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from app.db import Database, utc_iso, utc_now
from app.models import AlertsUpdate, Currency, Direction, User
from app.services.rates import get_reference_rate
from app.services.requests import amount_currency_sql

# The users column for each direction's tab, by what whoever takes the request gets.
_COLUMN: dict[Direction, str] = {"KRW_KZT": "alerts_buy_krw", "KZT_KRW": "alerts_buy_kzt"}

# A request on the board (as in services/requests.py), with its author as `u`.
_ON_BOARD = "r.status = 'open' AND r.expires_at > :now AND u.is_banned = 0"


@dataclass(frozen=True)
class Alert:
    """A new request, for the alert about it."""

    request_id: int
    direction: Direction
    # Fixed, in `amount_currency` (what its author buys or gives).
    amount: int
    amount_currency: Currency
    # KRW per 1 KZT at the current reference rate (None while none is available).
    effective_rate: float | None
    # Who has alerts on for its tab: not its author, and nobody banned.
    recipients: list[int]


@dataclass(frozen=True)
class SentAlert:
    request_id: int
    chat_id: int
    message_id: int
    text: str


async def set_alerts(db: Database, user_id: int, update: AlertsUpdate) -> User:
    """Turn a tab's alerts on or off. Any call marks the Alerts panel seen."""
    fields = {"alerts_seen": True}
    if update.buy_krw is not None:
        fields["alerts_buy_krw"] = update.buy_krw
    if update.buy_kzt is not None:
        fields["alerts_buy_kzt"] = update.buy_kzt
    # Column names come from the fixed keys above, never from input.
    assignments = ", ".join(f"{name} = :{name}" for name in sorted(fields))
    async with db.transaction() as conn:
        await conn.execute(
            f"UPDATE users SET {assignments}, updated_at = :now WHERE telegram_id = :id",
            {**fields, "now": utc_now(), "id": user_id},
        )
        async with conn.execute("SELECT * FROM users WHERE telegram_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
    assert row is not None
    return User.from_row(row)


async def load_alert(db: Database, request_id: int) -> Alert | None:
    """The alert about a request, or None once it's no longer on the board."""
    params = {"id": request_id, "now": utc_iso(datetime.now(UTC))}
    async with db.conn.execute(
        f"SELECT r.user_id, r.direction, r.amount, {amount_currency_sql()} AS amount_currency, "
        "r.rate_value FROM requests r "
        f"JOIN users u ON u.telegram_id = r.user_id WHERE r.id = :id AND {_ON_BOARD}",
        params,
    ) as cursor:
        request = await cursor.fetchone()
    if request is None:
        return None
    column = _COLUMN[request["direction"]]
    async with db.conn.execute(
        f"SELECT telegram_id FROM users WHERE {column} = 1 AND is_banned = 0 "
        "AND telegram_id != ? ORDER BY telegram_id",
        (request["user_id"],),
    ) as cursor:
        recipients = [row["telegram_id"] for row in await cursor.fetchall()]
    rate = await get_reference_rate(db)
    return Alert(
        request_id=request_id,
        direction=request["direction"],
        amount=request["amount"],
        amount_currency=request["amount_currency"],
        effective_rate=rate.rate * (1 + request["rate_value"] / 100) if rate else None,
        recipients=recipients,
    )


async def on_board(db: Database, request_id: int) -> bool:
    params = {"id": request_id, "now": utc_iso(datetime.now(UTC))}
    async with db.conn.execute(
        "SELECT 1 FROM requests r JOIN users u ON u.telegram_id = r.user_id "
        f"WHERE r.id = :id AND {_ON_BOARD}",
        params,
    ) as cursor:
        return await cursor.fetchone() is not None


async def record_alert(db: Database, alert: SentAlert) -> None:
    async with db.transaction() as conn:
        await conn.execute(
            "INSERT OR REPLACE INTO alert_messages (request_id, chat_id, message_id, text) "
            "VALUES (?, ?, ?, ?)",
            (alert.request_id, alert.chat_id, alert.message_id, alert.text),
        )


async def gone_alerts(db: Database) -> list[SentAlert]:
    """Alerts about requests no longer on the board, to cross out (then `forget_alert`)."""
    params = {"now": utc_iso(datetime.now(UTC))}
    async with db.conn.execute(
        "SELECT a.request_id, a.chat_id, a.message_id, a.text FROM alert_messages a "
        "JOIN requests r ON r.id = a.request_id JOIN users u ON u.telegram_id = r.user_id "
        f"WHERE NOT ({_ON_BOARD}) ORDER BY a.request_id, a.chat_id",
        params,
    ) as cursor:
        rows = await cursor.fetchall()
    return [SentAlert(**dict(row)) for row in rows]


async def forget_alert(db: Database, alert: SentAlert) -> None:
    async with db.transaction() as conn:
        await conn.execute(
            "DELETE FROM alert_messages WHERE request_id = ? AND chat_id = ?",
            (alert.request_id, alert.chat_id),
        )


async def turn_off_alerts(db: Database, user_id: int) -> None:
    """The bot can't message them (they blocked it or never started it): stop trying."""
    async with db.transaction() as conn:
        await conn.execute(
            "UPDATE users SET alerts_buy_krw = 0, alerts_buy_kzt = 0, updated_at = ? "
            "WHERE telegram_id = ? AND (alerts_buy_krw = 1 OR alerts_buy_kzt = 1)",
            (utc_now(), user_id),
        )

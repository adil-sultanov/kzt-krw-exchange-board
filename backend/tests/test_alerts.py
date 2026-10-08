from typing import Any

import pytest
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.methods import SendMessage
from fastapi.testclient import TestClient

from app.bot import alerts as bot_alerts
from app.bot import texts
from app.bot.alerts import AlertSender
from app.db import Database
from app.models import RequestCreate, TelegramUser, User
from app.services import alerts, requests
from app.services.alerts import Alert
from app.services.membership import Membership
from app.services.notifications import NullNotifier
from app.services.rates import save_reference_rate
from app.services.users import upsert_user
from tests.conftest import ADMIN_ID, FakeNotifier
from tests.helpers import AIDA, BEK, DANA, VALID, auth_as, create, fill_profile, with_profile
from tests.test_deals import act, taken

ADMIN = {"id": ADMIN_ID, "first_name": "Admin", "username": "admin"}


def set_alerts(client: TestClient, user: dict[str, Any], **body: Any) -> Any:
    return client.patch("/api/me/alerts", json=body, headers=auth_as(user))


# --- Settings ---


def test_alerts_are_off_until_turned_on(client: TestClient) -> None:
    me = client.get("/api/me", headers=auth_as(BEK)).json()
    assert (me["alerts_buy_krw"], me["alerts_buy_kzt"], me["alerts_seen"]) == (False, False, False)

    # Opening the panel marks it seen and changes nothing else.
    me = set_alerts(client, BEK).json()
    assert (me["alerts_buy_krw"], me["alerts_buy_kzt"], me["alerts_seen"]) == (False, False, True)

    me = set_alerts(client, BEK, buy_krw=True).json()
    assert (me["alerts_buy_krw"], me["alerts_buy_kzt"]) == (True, False)
    me = set_alerts(client, BEK, buy_kzt=True).json()
    assert (me["alerts_buy_krw"], me["alerts_buy_kzt"]) == (True, True)
    me = set_alerts(client, BEK, buy_krw=False).json()
    assert (me["alerts_buy_krw"], me["alerts_buy_kzt"]) == (False, True)


@pytest.mark.parametrize("body", [{"buy_krw": "yes"}, {"buy_krw": 1}, {"seen": True}])
def test_alerts_update_is_validated(client: TestClient, body: dict[str, Any]) -> None:
    assert set_alerts(client, BEK, **body).status_code == 422


# --- When alerts are sent and crossed out ---


def test_posting_sends_alerts(client: TestClient, notifier: FakeNotifier) -> None:
    request_id = create(client, AIDA)["id"]
    assert notifier.posted == [request_id]


def test_leaving_the_board_crosses_alerts_out(client: TestClient, notifier: FakeNotifier) -> None:
    # Cancelled by its author.
    request_id = create(client, AIDA)["id"]
    client.post(f"/api/requests/{request_id}/close", headers=auth_as(AIDA))
    assert notifier.left_board == 1

    # A counter offer accepted: the rest stays on the board.
    request_id = create(client, AIDA, min_counter_amount=10_000)["id"]
    fill_profile(client, BEK)
    counter = client.post(
        f"/api/requests/{request_id}/counter", json={"amount": 40_000}, headers=auth_as(BEK)
    )
    assert act(client, AIDA, counter.json()["id"], "accept").status_code == 200
    assert notifier.left_board == 1

    # Accepted for what's left.
    deal_id = taken(client, DANA, request_id)["id"]
    assert act(client, AIDA, deal_id, "accept").status_code == 200
    assert notifier.left_board == 2

    # Removed by an admin, or closed by its author's ban.
    request_id = create(client, AIDA)["id"]
    client.post(f"/api/admin/requests/{request_id}/remove", headers=auth_as(ADMIN))
    assert notifier.left_board == 3
    create(client, AIDA)
    client.post(f"/api/admin/users/{AIDA['id']}/ban", headers=auth_as(ADMIN))
    assert notifier.left_board == 4


# --- Who gets them ---


async def add_user(db: Database, telegram_id: int, **alert_columns: int) -> None:
    await upsert_user(
        db, TelegramUser(id=telegram_id, username=f"u{telegram_id}"), config_admin=False
    )
    for column, value in alert_columns.items():
        async with db.transaction() as conn:
            await conn.execute(
                f"UPDATE users SET {column} = ? WHERE telegram_id = ?", (value, telegram_id)
            )


async def post_request(db: Database, author_id: int, **overrides: Any) -> int:
    async with db.conn.execute("SELECT * FROM users WHERE telegram_id = ?", (author_id,)) as c:
        row = await c.fetchone()
    assert row is not None
    author = with_profile(User.from_row(row))
    data = RequestCreate.model_validate({**VALID, **overrides})
    return (await requests.create_request(db, author, data, NullNotifier())).id


async def test_recipients(db: Database) -> None:
    await add_user(db, 1, alerts_buy_krw=1, alerts_buy_kzt=1)  # the author
    await add_user(db, 2, alerts_buy_kzt=1)
    await add_user(db, 3, alerts_buy_krw=1)
    await add_user(db, 4, alerts_buy_kzt=1, is_banned=1)
    await add_user(db, 5)

    # KZT_KRW: whoever takes it gets KZT, the Buy KZT tab.
    alert = await alerts.load_alert(db, await post_request(db, 1))
    assert alert is not None
    assert alert.recipients == [2]
    alert = await alerts.load_alert(db, await post_request(db, 1, direction="KRW_KZT"))
    assert alert is not None
    assert alert.recipients == [3]


async def test_no_alert_once_off_the_board(db: Database) -> None:
    await add_user(db, 1)
    request_id = await post_request(db, 1)
    await requests.close_request(db, 1, request_id, NullNotifier())
    assert await alerts.load_alert(db, request_id) is None


# --- Texts ---


def make_alert(direction: str, rate: float | None = 3.7, currency: str | None = None) -> Alert:
    """An alert for 500,000 in `currency`, by default what its author buys."""
    return Alert(
        request_id=7,
        direction=direction,  # type: ignore[arg-type]
        amount=500_000,
        amount_currency=currency or ("KZT" if direction == "KRW_KZT" else "KRW"),  # type: ignore[arg-type]
        effective_rate=rate,
        recipients=[],
    )


def test_alert_text() -> None:
    # KRW_KZT: its author buys 500,000 ₸, so whoever takes it pays that and gets KRW.
    assert texts.request_alert(make_alert("KRW_KZT")) == "Pay 500,000 ₸ → Get ≈ 1,850,000 ₩"
    # KZT_KRW: they pay 500,000 ₩ and get KZT.
    assert texts.request_alert(make_alert("KZT_KRW")) == "Pay 500,000 ₩ → Get ≈ 135,135 ₸"
    assert texts.request_alert(make_alert("KZT_KRW", rate=None)) == "Pay 500,000 ₩, get KZT ₸"
    # Fixed in what its author gives: whoever takes it gets that, and pays ≈ the rest.
    assert (
        texts.request_alert(make_alert("KRW_KZT", currency="KRW"))
        == "Pay ≈ 135,135 ₸ → Get 500,000 ₩"
    )
    assert (
        texts.request_alert(make_alert("KRW_KZT", rate=None, currency="KRW"))
        == "Pay in KZT ₸, get 500,000 ₩"
    )


def test_crossed_out_text_is_escaped() -> None:
    assert texts.alert_gone("a < b") == "<s>a &lt; b</s>\nNo longer available"


# --- Sending ---


class FakeMessage:
    def __init__(self, message_id: int) -> None:
        self.message_id = message_id


class FakeBot:
    def __init__(self, fail: dict[int, Exception] | None = None) -> None:
        self.fail = fail or {}
        self.sent: list[tuple[int, str, Any]] = []
        self.edited: list[tuple[int, int, str]] = []
        self.on_send: Any = None

    async def send_message(self, chat_id: int, text: str, reply_markup: Any = None) -> FakeMessage:
        if chat_id in self.fail:
            raise self.fail.pop(chat_id)
        self.sent.append((chat_id, text, reply_markup))
        if self.on_send is not None:
            await self.on_send()
        return FakeMessage(100 + len(self.sent))

    async def edit_message_text(
        self, text: str, *, chat_id: int, message_id: int, parse_mode: str
    ) -> None:
        assert parse_mode == "HTML"
        self.edited.append((chat_id, message_id, text))


def sender_with(bot: FakeBot, db: Database, membership: Membership | None = None) -> AlertSender:
    return AlertSender(
        bot,  # type: ignore[arg-type]  # duck-typed Bot
        "https://example.test",
        db,
        membership or Membership(None, None),
        lambda _: False,
    )


@pytest.fixture(autouse=True)
def no_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bot_alerts, "SEND_INTERVAL", 0)


async def drain(sender: AlertSender) -> None:
    await sender._jobs.join()


async def alert_rows(db: Database) -> list[tuple[int, int, int]]:
    async with db.conn.execute(
        "SELECT request_id, chat_id, message_id FROM alert_messages ORDER BY chat_id"
    ) as cursor:
        return [tuple(row) for row in await cursor.fetchall()]


async def test_sends_and_crosses_out(db: Database) -> None:
    await save_reference_rate(db, 3.7, "test")
    await add_user(db, 1)
    await add_user(db, 2, alerts_buy_kzt=1)
    await add_user(db, 3, alerts_buy_kzt=1)
    request_id = await post_request(db, 1)
    bot = FakeBot()
    sender = sender_with(bot, db)

    sender.request_posted(request_id)
    await drain(sender)
    assert [chat_id for chat_id, _, _ in bot.sent] == [2, 3]
    _, text, markup = bot.sent[0]
    # VALID: buying 100,000 ₩ at the market rate.
    assert text == "Pay 100,000 ₩ → Get ≈ 27,027 ₸"
    [[button]] = markup.inline_keyboard
    assert button.text == "Open request"
    assert button.web_app.url == f"https://example.test?startapp=req_{request_id}"
    assert await alert_rows(db) == [(request_id, 2, 101), (request_id, 3, 102)]

    # Still on the board: nothing to cross out.
    sender.requests_left_board()
    await drain(sender)
    assert bot.edited == []

    await requests.close_request(db, 1, request_id, NullNotifier())
    sender.requests_left_board()
    await drain(sender)
    assert bot.edited == [
        (2, 101, f"<s>{text}</s>\nNo longer available"),
        (3, 102, f"<s>{text}</s>\nNo longer available"),
    ]
    assert await alert_rows(db) == []
    await sender.aclose()


async def test_stops_when_taken_while_sending(db: Database) -> None:
    await add_user(db, 1)
    for telegram_id in (2, 3, 4):
        await add_user(db, telegram_id, alerts_buy_kzt=1)
    request_id = await post_request(db, 1)
    bot = FakeBot()

    async def close_after_first() -> None:
        bot.on_send = None
        async with db.transaction() as conn:
            await conn.execute(
                "UPDATE requests SET status = 'in_progress' WHERE id = ?", (request_id,)
            )

    bot.on_send = close_after_first
    sender = sender_with(bot, db)
    sender.request_posted(request_id)
    await drain(sender)
    # The first one went out and was crossed out right after; nobody else got one.
    assert [chat_id for chat_id, _, _ in bot.sent] == [2]
    assert [chat_id for chat_id, _, _ in bot.edited] == [2]
    assert await alert_rows(db) == []
    await sender.aclose()


async def test_blocked_bot_turns_alerts_off(db: Database, caplog: Any) -> None:
    await add_user(db, 1)
    await add_user(db, 2, alerts_buy_krw=1, alerts_buy_kzt=1)
    await add_user(db, 3, alerts_buy_kzt=1)
    request_id = await post_request(db, 1)
    method = SendMessage(chat_id=2, text="")
    bot = FakeBot({2: TelegramForbiddenError(method, "Forbidden: bot was blocked by the user")})
    sender = sender_with(bot, db)

    sender.request_posted(request_id)
    await drain(sender)
    assert [chat_id for chat_id, _, _ in bot.sent] == [3]
    async with db.conn.execute(
        "SELECT alerts_buy_krw, alerts_buy_kzt FROM users WHERE telegram_id = 2"
    ) as cursor:
        assert tuple(await cursor.fetchone()) == (0, 0)
    assert f"request {request_id}: TelegramForbiddenError" in caplog.text
    assert "blocked" not in caplog.text
    await sender.aclose()


async def test_waits_when_rate_limited(db: Database, monkeypatch: pytest.MonkeyPatch) -> None:
    await add_user(db, 1)
    await add_user(db, 2, alerts_buy_kzt=1)
    request_id = await post_request(db, 1)
    method = SendMessage(chat_id=2, text="")
    bot = FakeBot({2: TelegramRetryAfter(method, "Too Many Requests", retry_after=3)})
    waits: list[float] = []
    real_sleep = bot_alerts.asyncio.sleep

    async def fake_sleep(seconds: float) -> None:
        waits.append(seconds)
        await real_sleep(0)

    monkeypatch.setattr(bot_alerts.asyncio, "sleep", fake_sleep)
    sender = sender_with(bot, db)
    sender.request_posted(request_id)
    await drain(sender)
    assert [chat_id for chat_id, _, _ in bot.sent] == [2]
    assert 3 in waits
    await sender.aclose()


async def test_only_group_members_get_alerts(db: Database) -> None:
    await add_user(db, 1)
    await add_user(db, 2, alerts_buy_kzt=1)
    await add_user(db, 3, alerts_buy_kzt=1)
    request_id = await post_request(db, 1)

    async def lookup(group_id: int, user_id: int) -> bool:
        return user_id != 3  # left the group

    bot = FakeBot()
    sender = sender_with(bot, db, Membership(-100, lookup))
    sender.request_posted(request_id)
    await drain(sender)
    assert [chat_id for chat_id, _, _ in bot.sent] == [2]
    await sender.aclose()

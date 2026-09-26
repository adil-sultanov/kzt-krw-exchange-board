from typing import Any

from app.bot.notifier import BotNotifier, deal_url
from app.models import DealOut, RequestOut


class FakeBot:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[tuple[int, str, Any]] = []

    async def send_message(self, chat_id: int, text: str, reply_markup: Any = None) -> None:
        if self.fail:
            raise RuntimeError("Forbidden: bot was blocked by the user")
        self.sent.append((chat_id, text, reply_markup))


def make_deal(role: str = "author", direction: str = "KZT_KRW") -> DealOut:
    request = RequestOut(
        id=7,
        direction=direction,  # type: ignore[arg-type]
        amount=150_000,
        rate_value=0,
        effective_rate=2.7,
        status="open",
        author_completed_deals=0,
        is_own=role == "author",
        my_deal_id=None,
        my_deal_status=None,
        created_at="2026-01-01T00:00:00+00:00",
        expires_at="2026-01-04T00:00:00+00:00",
    )
    return DealOut(
        id=42,
        status="pending",
        role=role,  # type: ignore[arg-type]
        other_completed_deals=3,
        my_confirmed=False,
        other_confirmed=False,
        request=request,
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )


def notifier_with(bot: FakeBot, webapp_url: str = "https://example.test") -> BotNotifier:
    return BotNotifier(bot, webapp_url)  # type: ignore[arg-type]  # duck-typed Bot


def test_deal_url() -> None:
    assert deal_url("https://example.test", 5) == "https://example.test?startapp=deal_5"
    assert deal_url("https://example.test/?v=2", 5) == "https://example.test/?v=2&startapp=deal_5"


async def test_deal_requested_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_requested(1, make_deal())
    await notifier.aclose()

    [(chat_id, text, markup)] = bot.sent
    assert chat_id == 1
    assert "buy KRW 🇰🇷 for 150,000 ₸" in text
    assert "3 completed deals" in text
    [[button]] = markup.inline_keyboard
    assert button.web_app.url == "https://example.test?startapp=deal_42"


async def test_deal_accepted_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_accepted(2, make_deal("responder", "KRW_KZT"))
    await notifier.aclose()

    [(chat_id, text, _)] = bot.sent
    assert chat_id == 2
    assert "you get 150,000 ₩ 🇰🇷 and pay in KZT 🇰🇿" in text


async def test_no_button_without_https() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot, "http://localhost:5173")
    notifier.deal_requested(1, make_deal())
    await notifier.aclose()
    assert bot.sent[0][2] is None


async def test_failed_send_is_swallowed(caplog: Any) -> None:
    notifier = notifier_with(FakeBot(fail=True))
    notifier.deal_requested(1, make_deal())
    await notifier.aclose()
    assert "deal 42: RuntimeError" in caplog.text
    assert "blocked" not in caplog.text

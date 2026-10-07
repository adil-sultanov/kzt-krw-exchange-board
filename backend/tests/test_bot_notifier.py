from typing import Any

from app.bot.notifier import BotNotifier, deal_url
from app.models import DealOut, Profile, RequestOut


class FakeBot:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[tuple[int, str, Any]] = []

    async def send_message(self, chat_id: int, text: str, reply_markup: Any = None) -> None:
        if self.fail:
            raise RuntimeError("Forbidden: bot was blocked by the user")
        self.sent.append((chat_id, text, reply_markup))


def make_deal(
    role: str = "author",
    direction: str = "KZT_KRW",
    other_profile: Profile | None = None,
    amount: int = 150_000,
    rate: float | None = None,
) -> DealOut:
    request = RequestOut(
        id=7,
        direction=direction,  # type: ignore[arg-type]
        amount=150_000,
        effective_rate=2.7,
        min_counter_amount=None,
        kzt_bank=None,
        offers_left=3,
        status="open",
        removed_by_admin=False,
        author_completed_deals=0,
        author_profile=None,
        author_username=None,
        is_own=role == "author",
        my_deal_id=None,
        my_deal_status=None,
        pending_count=None,
        created_at="2026-01-01T00:00:00+00:00",
        expires_at="2026-01-04T00:00:00+00:00",
    )
    return DealOut(
        id=42,
        status="pending",
        role=role,  # type: ignore[arg-type]
        amount=amount,
        partial=amount < request.amount,
        request_amount=request.amount,
        other_completed_deals=3,
        other_profile=other_profile,
        my_confirmed=False,
        other_confirmed=False,
        my_report_open=False,
        request=request,
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
        accepted_at=None,
        rate=rate,
    )


def notifier_with(bot: FakeBot, webapp_url: str = "https://example.test") -> BotNotifier:
    return BotNotifier(bot, webapp_url)  # type: ignore[arg-type]  # duck-typed Bot


def test_deal_url() -> None:
    assert deal_url("https://example.test", 5) == "https://example.test?startapp=deal_5"
    assert deal_url("https://example.test/?v=2", 5) == "https://example.test/?v=2&startapp=deal_5"


async def test_deal_requested_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    taker = Profile(
        first_name="Adil", last_name="Sultanov", university="UNIST", enrollment_year=2022
    )
    notifier.deal_requested(1, make_deal(other_profile=taker))
    await notifier.aclose()

    [(chat_id, text, markup)] = bot.sent
    assert chat_id == 1
    assert text.startswith("🔔 Adil Sultanov, UNIST, 2022 wants to take your request: ")
    # The amount is what the author buys; what they pay follows the rate until accepted.
    assert "you get 150,000 ₩ 🇰🇷 and pay ≈ 55,556 ₸ 🇰🇿." in text
    assert "3 completed deals" in text
    [[button]] = markup.inline_keyboard
    assert button.web_app.url == "https://example.test?startapp=deal_42"


async def test_counter_offer_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_requested(1, make_deal(amount=50_000))
    await notifier.aclose()
    [(_, text, _)] = bot.sent
    assert text.startswith(
        "🔔 Someone sent a counter offer: you get 50,000 ₩ 🇰🇷 and pay ≈ 18,519 ₸ 🇰🇿 "
        "(part of the 150,000 ₩ you're buying)."
    )


async def test_deal_requested_without_a_profile() -> None:
    # Takers need a profile now, but it can be cleared after taking.
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_requested(1, make_deal())
    await notifier.aclose()
    [(_, text, _)] = bot.sent
    assert text.startswith("🔔 Someone wants to take your request: ")


async def test_deal_accepted_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_accepted(2, make_deal("responder", "KRW_KZT", rate=2.7))
    await notifier.aclose()

    [(chat_id, text, _)] = bot.sent
    assert chat_id == 2
    # Locked at acceptance: both amounts are exact.
    assert "you get 405,000 ₩ 🇰🇷 and pay 150,000 ₸ 🇰🇿." in text


async def test_payment_reminder_messages() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.payment_reminder(1, make_deal("author", rate=2.7))
    notifier.payment_reminder(
        2, make_deal("responder", rate=2.7).model_copy(update={"other_confirmed": True})
    )
    await notifier.aclose()

    [(author, neither, markup), (responder, other_confirmed, _)] = sorted(bot.sent)
    assert author == 1 and responder == 2
    assert neither.startswith(
        "⏰ Your deal isn't finished yet: you get 150,000 ₩ 🇰🇷 and pay 55,556 ₸ 🇰🇿."
    )
    assert "tap “Received payment”" in neither
    assert other_confirmed.startswith(
        "⏰ They confirmed receiving your payment (you get 55,556 ₸ 🇰🇿 and pay 150,000 ₩ 🇰🇷)."
    )
    assert "report a problem" in other_confirmed
    [[button]] = markup.inline_keyboard
    assert button.web_app.url == "https://example.test?startapp=deal_42"


async def test_counter_offer_accepted_message() -> None:
    bot = FakeBot()
    notifier = notifier_with(bot)
    notifier.deal_accepted(2, make_deal("responder", "KRW_KZT", amount=40_000, rate=2.7))
    await notifier.aclose()
    [(_, text, _)] = bot.sent
    assert "you get 108,000 ₩ 🇰🇷 and pay 40,000 ₸ 🇰🇿." in text


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

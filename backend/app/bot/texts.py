"""User-facing bot message strings."""

import html

from app.models import Currency, DealOut, Direction, Profile
from app.services.alerts import Alert

AUTHOR = "@moonpie24"
TERMS_URL = "https://github.com/adil-sultanov/kzt-krw-exchange-board/blob/main/TERMS.md"


def welcome(alerts_on: bool) -> str:
    """The /start reply (HTML), with whether they get alerts about new requests."""
    alerts = (
        "🔔 Alerts are on: you'll get each new request here. Turn off: <b>Alerts</b> on the Board."
        if alerts_on
        else "🔔 Want each new request here? Turn on <b>Alerts</b> on the Board."
    )
    return (
        "Free KZT ↔ KRW noticeboard for students. Post a request or take one; "
        "payments go directly between users, the app never handles money.\n\n"
        f"{alerts}\n\n"
        f'By {AUTHOR} · <a href="{TERMS_URL}">Terms</a>'
    )


NOT_MEMBER = (
    "This board is only for members of our group chat. "
    "Ask a member to add you, then send /start again."
)
OPEN_APP_BUTTON = "Open exchange board"
OPEN_DEAL_BUTTON = "Open deal"
OPEN_REQUEST_BUTTON = "Open request"
# The deal screen's button, as frontend/src/i18n.ts names it.
CONFIRM_BUTTON = "Received payment"
ALERT_GONE = "No longer available"
MENU_BUTTON = "Board"
START_COMMAND_DESCRIPTION = "Open the exchange board"

FLAG: dict[Currency, str] = {"KZT": "🇰🇿", "KRW": "🇰🇷"}
SYMBOL: dict[Currency, str] = {"KZT": "₸", "KRW": "₩"}


def _money(amount: int, currency: Currency) -> str:
    return f"{amount:,} {SYMBOL[currency]}"


def _deals(count: int) -> str:
    return "1 completed deal" if count == 1 else f"{count} completed deals"


def _profile(profile: Profile | None) -> str | None:
    """ "Adil Sultanov, UNIST, 2022", as the app shows it (whatever parts are filled in)."""
    if profile is None:
        return None
    name = " ".join(part for part in (profile.first_name, profile.last_name) if part)
    year = str(profile.enrollment_year) if profile.enrollment_year else None
    return ", ".join(part for part in (name, profile.university, year) if part) or None


def _author_currencies(direction: Direction) -> tuple[Currency, Currency]:
    """(gives, buys) for the author of a request."""
    return ("KZT", "KRW") if direction == "KZT_KRW" else ("KRW", "KZT")


def _convert(amount: int, from_currency: Currency, rate: float) -> int:
    """An amount in the other currency at `rate` (KRW per 1 KZT)."""
    return round(amount * rate if from_currency == "KZT" else amount / rate)


def _other(currency: Currency) -> Currency:
    return "KRW" if currency == "KZT" else "KZT"


def _deal_terms(deal: DealOut) -> str:
    """ "you get 500,000 ₩ 🇰🇷 and pay 169,568 ₸ 🇰🇿", from the viewer's side. The deal's amount
    is fixed; the other side's is exact once the rate is locked (accepted), ≈ before that."""
    gives, buys = _author_currencies(deal.request.direction)
    fixed, other = deal.amount_currency, _other(deal.amount_currency)
    sides = {fixed: f"{_money(deal.amount, fixed)} {FLAG[fixed]}"}
    rate = deal.rate or deal.request.effective_rate
    if rate:
        approx = "" if deal.rate else "≈ "
        sides[other] = f"{approx}{_money(_convert(deal.amount, fixed, rate), other)} {FLAG[other]}"
    get, pay = (buys, gives) if deal.role == "author" else (gives, buys)
    return (
        f"you get {sides.get(get, f'{get} {FLAG[get]}')} "
        f"and pay {sides.get(pay, f'in {pay} {FLAG[pay]}')}"
    )


def deal_requested(deal: DealOut) -> str:
    """To the author. `deal` is as they see it, so `other_*` is the person who took it."""
    _, buys = _author_currencies(deal.request.direction)
    verb = "buying" if deal.amount_currency == buys else "selling"
    who = _profile(deal.other_profile)
    wants = (
        f"sent a counter offer: {_deal_terms(deal)} "
        f"(part of the {_money(deal.request_amount, deal.amount_currency)} you're {verb})"
        if deal.partial
        else f"wants to take your request: {_deal_terms(deal)}"
    )
    return (
        f"🔔 {who or 'Someone'} {wants}.\n"
        f"They have {_deals(deal.other_completed_deals)}. "
        "Open the deal to accept or decline."
    )


def deal_accepted(deal: DealOut) -> str:
    """To the responder. `deal` is as they see it, with its rate locked."""
    return (
        f"✅ Your deal was accepted: {_deal_terms(deal)}.\n"
        "Open the deal to message them and see where to pay."
    )


def payment_reminder(deal: DealOut) -> str:
    """To a side of an accepted deal that hasn't confirmed receiving the money. `deal` is as
    they see it."""
    terms = _deal_terms(deal)
    if deal.other_confirmed:
        return (
            f"⏰ They confirmed receiving your payment ({terms}).\n"
            f"Once theirs is in your account, open the deal and tap “{CONFIRM_BUTTON}”. "
            "If it hasn't arrived, report a problem there."
        )
    return (
        f"⏰ Your deal isn't finished yet: {terms}.\n"
        f"Once their payment is in your account, open the deal and tap “{CONFIRM_BUTTON}”. "
        "It completes when you both confirm."
    )


def request_alert(alert: Alert) -> str:
    """A new request, from the side of whoever takes it, e.g. "Pay 500,000 ₩ → Get ≈ 169,568 ₸"."""
    # Whoever takes it gets what the author gives, and pays what they buy.
    gets, pays = _author_currencies(alert.direction)
    fixed, other = alert.amount_currency, _other(alert.amount_currency)
    sides = {fixed: _money(alert.amount, fixed)}
    rate = alert.effective_rate
    if rate:
        sides[other] = f"≈ {_money(_convert(alert.amount, fixed, rate), other)}"
        return f"Pay {sides[pays]} → Get {sides[gets]}"
    pay = sides.get(pays, f"in {pays} {SYMBOL[pays]}")
    return f"Pay {pay}, get {sides.get(gets, f'{gets} {SYMBOL[gets]}')}"


def alert_gone(text: str) -> str:
    """An alert crossed out once its request left the board (HTML)."""
    return f"<s>{html.escape(text)}</s>\n{ALERT_GONE}"

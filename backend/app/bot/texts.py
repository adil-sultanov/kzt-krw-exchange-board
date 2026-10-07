"""User-facing bot message strings."""

import html

from app.models import Currency, DealOut, Direction, Profile
from app.services.alerts import Alert

AUTHOR = "@moonpie24"
TERMS_URL = "https://github.com/adil-sultanov/kzt-krw-exchange-board/blob/main/TERMS.md"

WELCOME = (
    "A free noticeboard for students exchanging KZT ↔ KRW.\n\n"
    "Post a request or take one from the board. Payments are made directly between users; "
    "the app never handles money.\n\n"
    f"Made by {AUTHOR}\n"
    f"Terms: {TERMS_URL}"
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
    """(gives, buys) for the author of a request; its amount is in what they buy."""
    return ("KZT", "KRW") if direction == "KZT_KRW" else ("KRW", "KZT")


def _convert(amount: int, from_currency: Currency, rate: float) -> int:
    """An amount in the other currency at `rate` (KRW per 1 KZT)."""
    return round(amount * rate if from_currency == "KZT" else amount / rate)


def _deal_terms(deal: DealOut) -> str:
    """ "you get 500,000 ₩ 🇰🇷 and pay 169,568 ₸ 🇰🇿", from the viewer's side. The deal's amount
    is fixed; the other side's is exact once the rate is locked (accepted), ≈ before that."""
    gives, buys = _author_currencies(deal.request.direction)
    fixed = f"{_money(deal.amount, buys)} {FLAG[buys]}"
    rate = deal.rate or deal.request.effective_rate
    if rate:
        approx = "" if deal.rate else "≈ "
        other = f"{approx}{_money(_convert(deal.amount, buys, rate), gives)} {FLAG[gives]}"
    else:
        other = None
    if deal.role == "author":
        return f"you get {fixed} and pay {other or f'in {gives} {FLAG[gives]}'}"
    return f"you get {other or f'{gives} {FLAG[gives]}'} and pay {fixed}"


def deal_requested(deal: DealOut) -> str:
    """To the author. `deal` is as they see it, so `other_*` is the person who took it."""
    _, buys = _author_currencies(deal.request.direction)
    who = _profile(deal.other_profile)
    wants = (
        f"sent a counter offer: {_deal_terms(deal)} "
        f"(part of the {_money(deal.request.amount, buys)} you're buying)"
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
    # The amount is what the author buys, so whoever takes it pays that, and gets the rest.
    gets, pays = _author_currencies(alert.direction)
    pay = _money(alert.amount, pays)
    rate = alert.effective_rate
    if rate:
        return f"Pay {pay} → Get ≈ {_money(_convert(alert.amount, pays, rate), gets)}"
    return f"Pay {pay}, get {gets} {SYMBOL[gets]}"


def alert_gone(text: str) -> str:
    """An alert crossed out once its request left the board (HTML)."""
    return f"<s>{html.escape(text)}</s>\n{ALERT_GONE}"

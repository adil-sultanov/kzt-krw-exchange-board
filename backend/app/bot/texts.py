"""User-facing bot message strings."""

import html

from app.models import Currency, DealOut, Profile
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


def deal_requested(deal: DealOut) -> str:
    """To the author. `deal` is as they see it, so `other_*` is the person who took it."""
    request = deal.request
    gives: Currency = "KZT" if request.direction == "KZT_KRW" else "KRW"
    buys: Currency = "KRW" if gives == "KZT" else "KZT"
    who = _profile(deal.other_profile)
    wants = (
        f"sent a counter offer: {_money(deal.amount, gives)} of the "
        f"{_money(request.amount, gives)} you're exchanging for {buys} {FLAG[buys]}"
        if deal.partial
        else f"wants to take your request: buy {buys} {FLAG[buys]} for {_money(deal.amount, gives)}"
    )
    return (
        f"🔔 {who or 'Someone'} {wants}.\n"
        f"They have {_deals(deal.other_completed_deals)}. "
        "Open the deal to accept or decline."
    )


def deal_accepted(deal: DealOut) -> str:
    request = deal.request
    # The responder gets the currency the author gives.
    gets: Currency = "KZT" if request.direction == "KZT_KRW" else "KRW"
    pays: Currency = "KRW" if gets == "KZT" else "KZT"
    return (
        "✅ Your deal was accepted: "
        f"you get {_money(deal.amount, gets)} {FLAG[gets]} and pay in {pays} {FLAG[pays]}.\n"
        "Open the deal to message them and see where to pay."
    )


def request_alert(alert: Alert) -> str:
    """A new request, from the side of whoever takes it, e.g.
    "Pay ≈ 1,850,000 ₸ → Get 500,000 ₩" and "1.5% better rate"."""
    # The author gives the request's currency, so whoever takes it gets that.
    gets: Currency = "KZT" if alert.direction == "KZT_KRW" else "KRW"
    pays: Currency = "KRW" if gets == "KZT" else "KZT"
    get = _money(alert.amount, gets)
    rate = alert.effective_rate
    if rate:
        paid = alert.amount * rate if gets == "KZT" else alert.amount / rate
        line = f"Pay ≈ {_money(round(paid), pays)} → Get {get}"
    else:
        line = f"Get {get}, pay in {pays} {SYMBOL[pays]}"
    # A higher rate (more KRW per KZT) is better for whoever pays KZT.
    gain = alert.rate_value if pays == "KZT" else -alert.rate_value
    if gain == 0:
        return f"{line}\nMarket rate"
    return f"{line}\n{abs(gain):g}% {'better' if gain > 0 else 'worse'} rate"


def alert_gone(text: str) -> str:
    """An alert crossed out once its request left the board (HTML)."""
    return f"<s>{html.escape(text)}</s>\n{ALERT_GONE}"

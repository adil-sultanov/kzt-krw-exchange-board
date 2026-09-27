"""User-facing bot message strings."""

from app.models import Currency, DealOut

AUTHOR = "@moonpie24"
TERMS_URL = "https://github.com/adil-sultanov/kzt-krw-exchange-board/blob/main/TERMS.md"

WELCOME = (
    "A free noticeboard for students exchanging KZT ↔ KRW.\n\n"
    "Post a request or take one from the board. Payments are made directly between users; "
    "the app never handles money.\n\n"
    f"Made by {AUTHOR}\n"
    f"Terms: {TERMS_URL}"
)
OPEN_APP_BUTTON = "Open exchange board"
OPEN_DEAL_BUTTON = "Open deal"
MENU_BUTTON = "Board"
START_COMMAND_DESCRIPTION = "Open the exchange board"

FLAG: dict[Currency, str] = {"KZT": "🇰🇿", "KRW": "🇰🇷"}
SYMBOL: dict[Currency, str] = {"KZT": "₸", "KRW": "₩"}


def _money(amount: int, currency: Currency) -> str:
    return f"{amount:,} {SYMBOL[currency]}"


def _deals(count: int) -> str:
    return "1 completed deal" if count == 1 else f"{count} completed deals"


def deal_requested(deal: DealOut) -> str:
    request = deal.request
    gives: Currency = "KZT" if request.direction == "KZT_KRW" else "KRW"
    buys: Currency = "KRW" if gives == "KZT" else "KZT"
    return (
        "🔔 Someone wants to take your request: "
        f"buy {buys} {FLAG[buys]} for {_money(request.amount, gives)}.\n"
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
        f"you get {_money(request.amount, gets)} {FLAG[gets]} and pay in {pays} {FLAG[pays]}.\n"
        "Open the deal to message them and see where to pay."
    )

"""Pydantic schemas."""

import math
from typing import Annotated, Literal, Self

import aiosqlite
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TelegramUser(BaseModel):
    """A Telegram user from initData or a bot update (only the fields we use)."""

    model_config = ConfigDict(extra="ignore")

    id: int
    first_name: str = ""
    username: str | None = None
    is_bot: bool = False


class User(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str
    completed_deals: int
    is_banned: bool
    is_admin: bool
    receive_kzt_bank: str | None
    receive_kzt_account: str | None
    receive_krw_bank: str | None
    receive_krw_account: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: aiosqlite.Row) -> Self:
        return cls.model_validate(dict(row))


MAX_BANK_LENGTH = 100
MAX_ACCOUNT_LENGTH = 100


class MeOut(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str
    completed_deals: int
    is_banned: bool
    is_admin: bool
    # Where the user receives each currency: bank (and account holder), and account number.
    # Sensitive: never log.
    receive_kzt_bank: str | None
    receive_kzt_account: str | None
    receive_krw_bank: str | None
    receive_krw_account: str | None


class MeUpdate(BaseModel):
    """Receiving details. A field left out is unchanged; an empty string clears it."""

    model_config = ConfigDict(extra="forbid")

    receive_kzt_bank: str | None = None
    receive_kzt_account: str | None = None
    receive_krw_bank: str | None = None
    receive_krw_account: str | None = None

    @field_validator("receive_kzt_bank", "receive_krw_bank")
    @classmethod
    def _clean_bank(cls, value: str | None) -> str | None:
        return _clean_detail(value, MAX_BANK_LENGTH)

    @field_validator("receive_kzt_account", "receive_krw_account")
    @classmethod
    def _clean_account(cls, value: str | None) -> str | None:
        return _clean_detail(value, MAX_ACCOUNT_LENGTH)


def _clean_detail(value: str | None, max_length: int) -> str:
    value = (value or "").strip()
    if len(value) > max_length:
        raise ValueError("receiving details too long")
    return value


# --- Exchange requests ---

Direction = Literal["KZT_KRW", "KRW_KZT"]
Currency = Literal["KZT", "KRW"]
RequestStatus = Literal["open", "in_progress", "completed", "closed", "expired"]
BoardSort = Literal["newest", "amount_asc", "amount_desc", "best_rate"]
DealStatus = Literal["pending", "accepted", "declined", "completed"]
DealRole = Literal["author", "responder"]

MAX_AMOUNT = 100_000_000
MAX_MARKET_OFFSET = 20.0  # percent


Amount = Annotated[int, Field(gt=0, le=MAX_AMOUNT, strict=True)]
DurationDays = Literal[1, 3]


def _check_offset(value: float) -> float:
    """A percent offset from the reference rate, rounded to 2 decimals."""
    if not math.isfinite(value):
        raise ValueError("rate must be finite")
    if not -MAX_MARKET_OFFSET <= value <= MAX_MARKET_OFFSET:
        raise ValueError("market offset out of range")
    return round(value, 2)


class RequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    direction: Direction
    amount: Amount
    # Percent offset from the reference (market) rate: 0 is the market rate itself.
    rate_value: float = 0
    duration_days: DurationDays

    @model_validator(mode="after")
    def _check_rate(self) -> Self:
        self.rate_value = _check_offset(self.rate_value)
        return self


class RequestUpdate(BaseModel):
    """The author's changes to their open request. A field left out is unchanged.

    `extend_days` moves the expiry to that many days from now (it never shortens it).
    """

    model_config = ConfigDict(extra="forbid")

    amount: Amount | None = None
    rate_value: float | None = None
    extend_days: DurationDays | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.rate_value is not None:
            self.rate_value = _check_offset(self.rate_value)
        if self.amount is None and self.rate_value is None and self.extend_days is None:
            raise ValueError("nothing to change")
        return self


class RequestOut(BaseModel):
    """A request as any viewer may see it. Never includes the author's identity."""

    id: int
    direction: Direction
    amount: int
    # Percent offset from the reference rate.
    rate_value: float
    # KRW per 1 KZT at the current reference rate (null while none is available).
    effective_rate: float | None
    status: RequestStatus
    author_completed_deals: int
    is_own: bool
    # The viewer's own response to this request, if they took it.
    my_deal_id: int | None
    my_deal_status: DealStatus | None
    # For the author only: how many responders are waiting for an answer (null for others).
    pending_count: int | None
    created_at: str
    expires_at: str


class BoardFilters(BaseModel):
    direction: Direction | None = None
    min_amount: Annotated[int, Field(ge=0)] | None = None
    max_amount: Annotated[int, Field(ge=0)] | None = None
    sort: BoardSort = "newest"
    limit: Annotated[int, Field(ge=1, le=100)] = 50
    offset: Annotated[int, Field(ge=0)] = 0


class CreatedRequestOut(BaseModel):
    request: RequestOut
    # Open requests in the opposite direction, closest in amount first.
    matches: list[RequestOut]


class RateOut(BaseModel):
    rate: float | None
    source: str | None
    fetched_at: str | None


# --- Deals ---


class DealOut(BaseModel):
    """A deal as one of its two participants sees it. Never includes usernames."""

    id: int
    status: DealStatus
    # The viewer's side: 'author' posted the request, 'responder' took it.
    role: DealRole
    other_completed_deals: int
    # Whether each side confirmed receiving the other's payment.
    my_confirmed: bool
    other_confirmed: bool
    request: RequestOut
    created_at: str
    updated_at: str


class ContactOut(BaseModel):
    username: str
    url: str
    # Where the viewer should send their money: the other side's receiving details
    # for the currency the viewer gives (null if they haven't added them).
    pay_currency: Currency
    pay_bank: str | None
    pay_account: str | None

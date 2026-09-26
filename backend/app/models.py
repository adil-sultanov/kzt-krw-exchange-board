"""Pydantic schemas."""

import math
import re
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
    # The app's owner (OWNER_ID): the only one who can edit the About page.
    is_owner: bool
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
BoardSort = Literal["date", "rate", "amount"]
# "desc" is newest, best rate for the viewer, or largest first.
SortOrder = Literal["desc", "asc"]
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
    sort: BoardSort = "date"
    order: SortOrder = "desc"
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
    # The viewer reported this deal and no admin has resolved it yet.
    my_report_open: bool
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


# --- Reports ---

ReportCategory = Literal["scam", "no_payment", "disappeared", "spam", "other"]
MAX_REPORT_NOTE_LENGTH = 500


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: ReportCategory
    note: str = ""

    @field_validator("note")
    @classmethod
    def _clean_note(cls, value: str) -> str:
        value = value.strip()
        if len(value) > MAX_REPORT_NOTE_LENGTH:
            raise ValueError("note too long")
        return value


class ReportOut(BaseModel):
    """A report as its sender sees it."""

    id: int
    category: ReportCategory
    request_id: int
    deal_id: int | None
    created_at: str


# --- Admin ---


class AdminUserOut(BaseModel):
    """A user as admins see them in a report. Never includes receiving details."""

    telegram_id: int
    username: str | None
    first_name: str
    completed_deals: int
    is_banned: bool
    is_admin: bool
    # Unresolved reports about this user.
    open_reports: int


class AdminRequestOut(BaseModel):
    id: int
    author_id: int
    direction: Direction
    amount: int
    status: RequestStatus


class AdminDealOut(BaseModel):
    id: int
    status: DealStatus
    author_confirmed: bool
    responder_confirmed: bool


class AdminReportOut(BaseModel):
    id: int
    category: ReportCategory
    note: str
    created_at: str
    resolved: bool
    resolved_at: str | None
    reporter: AdminUserOut
    # Null only for reports made before `reported_id` was recorded, about a deleted user.
    reported: AdminUserOut | None
    request: AdminRequestOut
    deal: AdminDealOut | None


# Where someone's admin rights come from: OWNER_ID, ADMIN_IDS, or the owner adding them in
# the app. Only the last can be removed in the app.
AdminSource = Literal["owner", "config", "granted"]


class AdminOut(AdminUserOut):
    source: AdminSource


class AdminAdd(BaseModel):
    """The owner adds an admin by their Telegram username (with or without the @)."""

    model_config = ConfigDict(extra="forbid")

    username: str

    @field_validator("username")
    @classmethod
    def _clean_username(cls, value: str) -> str:
        value = value.strip().removeprefix("@")
        if not re.fullmatch(r"[A-Za-z0-9_]{4,32}", value):
            raise ValueError("not a Telegram username")
        return value


class OwnerDealOut(BaseModel):
    """Any deal, as the owner sees it in the deal list. Never includes receiving details."""

    id: int
    status: DealStatus
    author_confirmed: bool
    responder_confirmed: bool
    created_at: str
    updated_at: str
    request: AdminRequestOut
    author: AdminUserOut
    responder: AdminUserOut


# --- About page ---

MAX_DONATE_OPTIONS = 6
MAX_DONATE_LABEL_LENGTH = 40
MAX_DONATE_VALUE_LENGTH = 200
MAX_DONATE_NOTE_LENGTH = 300


class DonateOption(BaseModel):
    """A way to donate: a label ("Kaspi") and a link or number to copy."""

    model_config = ConfigDict(extra="forbid")

    label: str
    value: str

    @field_validator("label")
    @classmethod
    def _clean_label(cls, value: str) -> str:
        return _required_text(value, MAX_DONATE_LABEL_LENGTH)

    @field_validator("value")
    @classmethod
    def _clean_value(cls, value: str) -> str:
        return _required_text(value, MAX_DONATE_VALUE_LENGTH)


def _required_text(value: str, max_length: int) -> str:
    value = value.strip()
    if not value or len(value) > max_length:
        raise ValueError("text empty or too long")
    return value


class AboutUpdate(BaseModel):
    """The owner's donate section: replaces the whole thing."""

    model_config = ConfigDict(extra="forbid")

    donate_note: str = ""
    donate_options: Annotated[list[DonateOption], Field(max_length=MAX_DONATE_OPTIONS)] = []

    @field_validator("donate_note")
    @classmethod
    def _clean_note(cls, value: str) -> str:
        value = value.strip()
        if len(value) > MAX_DONATE_NOTE_LENGTH:
            raise ValueError("note too long")
        return value


class AboutOut(BaseModel):
    donate_note: str
    donate_options: list[DonateOption]
    # Null until the owner first saves it.
    updated_at: str | None

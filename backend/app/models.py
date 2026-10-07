"""Pydantic schemas."""

import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, Self

import aiosqlite
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TelegramUser(BaseModel):
    """A Telegram user from initData or a bot update (only the fields we use)."""

    model_config = ConfigDict(extra="ignore")

    id: int
    first_name: str = ""
    username: str | None = None
    is_bot: bool = False


class Profile(BaseModel):
    """What a user tells others about themselves, shown as a tag on their requests and deals
    ("Adil Sultanov, UNIST, 2022"). Typed in the app, unlike the Telegram `first_name`.
    """

    first_name: str | None
    last_name: str | None
    university: str | None
    enrollment_year: int | None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Profile | None":
        """From a row with the users table's profile columns; None if they're all empty."""
        profile = cls(
            first_name=row["profile_first_name"],
            last_name=row["profile_last_name"],
            university=row["university"],
            enrollment_year=row["enrollment_year"],
        )
        return profile if any(profile.model_dump().values()) else None


# The users table's profile columns, e.g. to select an author's or other side's profile.
PROFILE_COLUMNS = ("profile_first_name", "profile_last_name", "university", "enrollment_year")


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
    profile_first_name: str | None
    profile_last_name: str | None
    university: str | None
    enrollment_year: int | None
    # Alerts about new requests in each Board tab (see AlertsUpdate).
    alerts_buy_krw: bool
    alerts_buy_kzt: bool
    alerts_seen: bool
    # The preferred KZT bank New request remembers for their next request (see RequestCreate).
    saved_kzt_bank: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: aiosqlite.Row) -> Self:
        return cls.model_validate(dict(row))

    @property
    def has_profile(self) -> bool:
        """The whole profile is filled in, as posting or taking a request needs."""
        return all(getattr(self, column) for column in PROFILE_COLUMNS)


MAX_BANK_LENGTH = 100
MAX_ACCOUNT_LENGTH = 100
MAX_NAME_LENGTH = 40
MAX_KZT_BANK_LENGTH = 40
MAX_UNIVERSITY_LENGTH = 60
MIN_ENROLLMENT_YEAR = 2000
# Besides letters (and digits, in a university's name). No commas: the tag separates with them.
# U+2019 is the apostrophe phone keyboards type.
_NAME_PUNCTUATION = frozenset(" -'\u2019.")
_UNIVERSITY_PUNCTUATION = frozenset(" -'\u2019.&()")
# A bank, or a few of them ("Kaspi, Halyk").
_KZT_BANK_PUNCTUATION = frozenset(" -'\u2019.&()/,+")


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
    # The profile shown on the user's requests and deals (see Profile).
    profile_first_name: str | None
    profile_last_name: str | None
    university: str | None
    enrollment_year: int | None
    # Whether the bot messages them about new requests in each Board tab, and whether they've
    # opened the Alerts panel (which clears its "new" dot).
    alerts_buy_krw: bool
    alerts_buy_kzt: bool
    alerts_seen: bool
    # Filled in as the preferred KZT bank on their next request.
    saved_kzt_bank: str | None


class MeUpdate(BaseModel):
    """Profile and receiving details. A field left out is unchanged; an empty string (or a null
    year) clears it."""

    model_config = ConfigDict(extra="forbid")

    receive_kzt_bank: str | None = None
    receive_kzt_account: str | None = None
    receive_krw_bank: str | None = None
    receive_krw_account: str | None = None
    profile_first_name: str | None = None
    profile_last_name: str | None = None
    university: str | None = None
    enrollment_year: Annotated[int, Field(strict=True)] | None = None

    @field_validator("profile_first_name", "profile_last_name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str:
        value = _clean_profile_text(value, MAX_NAME_LENGTH, _NAME_PUNCTUATION, digits=False)
        # "adil" -> "Adil", "zhan-ai" -> "Zhan-Ai"; the rest stays as typed ("McKay").
        return re.sub(r"(^|[ -])(\w)", lambda m: m.group(1) + m.group(2).upper(), value)

    @field_validator("university")
    @classmethod
    def _clean_university(cls, value: str | None) -> str:
        return _clean_profile_text(
            value, MAX_UNIVERSITY_LENGTH, _UNIVERSITY_PUNCTUATION, digits=True
        )

    @field_validator("enrollment_year")
    @classmethod
    def _check_year(cls, value: int | None) -> int | None:
        if value is not None and not MIN_ENROLLMENT_YEAR <= value <= datetime.now(UTC).year + 1:
            raise ValueError("enrollment year out of range")
        return value

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


def _clean_profile_text(
    value: str | None, max_length: int, punctuation: frozenset[str], *, digits: bool
) -> str:
    """Trimmed, with inner spaces collapsed. Shown to everyone on the board, so only letters
    (digits if allowed) and a little punctuation: no links, emoji or line breaks."""
    value = " ".join((value or "").split())
    if len(value) > max_length:
        raise ValueError("too long")
    if not all(ch.isalpha() or (digits and ch.isdigit()) or ch in punctuation for ch in value):
        raise ValueError("unexpected characters")
    return value


def _clean_kzt_bank(value: str | None) -> str | None:
    """A request's preferred KZT bank, shown to everyone on the board; empty is none."""
    value = _clean_profile_text(value, MAX_KZT_BANK_LENGTH, _KZT_BANK_PUNCTUATION, digits=True)
    return value or None


class AlertsUpdate(BaseModel):
    """Turn alerts for a Board tab on or off (a field left out is unchanged). Any call also
    marks the Alerts panel seen, so opening it sends an empty one."""

    model_config = ConfigDict(extra="forbid")

    buy_krw: Annotated[bool, Field(strict=True)] | None = None
    buy_kzt: Annotated[bool, Field(strict=True)] | None = None


# --- Exchange requests ---

Direction = Literal["KZT_KRW", "KRW_KZT"]
Currency = Literal["KZT", "KRW"]
RequestStatus = Literal["open", "in_progress", "completed", "closed", "expired"]
BoardSort = Literal["date", "amount"]
# "desc" is newest or largest first.
SortOrder = Literal["desc", "asc"]
# `cancelled`: its responder cancelled it while it was pending.
DealStatus = Literal["pending", "accepted", "declined", "cancelled", "completed"]
DealRole = Literal["author", "responder"]

MAX_AMOUNT = 100_000_000


Amount = Annotated[int, Field(gt=0, le=MAX_AMOUNT, strict=True)]
DurationDays = Literal[1, 3]


class RequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    direction: Direction
    # In the currency the author buys (KRW for KZT_KRW, KZT for KRW_KZT): what they get is
    # fixed, and what they pay follows the market rate until a deal is accepted.
    amount: Amount
    # Always at the market rate: there's no offset to choose (`requests.rate_value` is 0).
    duration_days: DurationDays
    # The smallest counter offer the author accepts, in the request's currency (at most the
    # amount). Null turns counter offers off.
    min_counter_amount: Amount | None = None
    # The bank the author would rather use for the KZT side ("Kaspi"); null or empty: none.
    kzt_bank: str | None = None
    # Whether to remember `kzt_bank` for their next request (false forgets the one remembered);
    # null leaves what's remembered as it is.
    remember_kzt_bank: Annotated[bool, Field(strict=True)] | None = None

    @field_validator("kzt_bank")
    @classmethod
    def _clean_bank(cls, value: str | None) -> str | None:
        return _clean_kzt_bank(value)

    @model_validator(mode="after")
    def _check_minimum(self) -> Self:
        if self.min_counter_amount is not None and self.min_counter_amount > self.amount:
            raise ValueError("minimum counter offer above the amount")
        return self


class RequestUpdate(BaseModel):
    """The author's changes to their open request. A field left out is unchanged.

    `extend_days` moves the expiry to that many days from now (it never shortens it).
    `min_counter_amount` set to null turns counter offers off; `kzt_bank` set to null or empty
    removes the preferred bank.
    """

    model_config = ConfigDict(extra="forbid")

    amount: Amount | None = None
    min_counter_amount: Amount | None = None
    kzt_bank: str | None = None
    extend_days: DurationDays | None = None

    @field_validator("kzt_bank")
    @classmethod
    def _clean_bank(cls, value: str | None) -> str | None:
        return _clean_kzt_bank(value)

    @model_validator(mode="after")
    def _check(self) -> Self:
        if (
            self.amount is None
            and self.extend_days is None
            and "min_counter_amount" not in self.model_fields_set
            and "kzt_bank" not in self.model_fields_set
        ):
            raise ValueError("nothing to change")
        return self


class RequestOut(BaseModel):
    """A request as any viewer may see it: the author's profile and current Telegram username
    (so people can check who they'd trade with), never their Telegram ID."""

    id: int
    direction: Direction
    # In the currency the author buys (see RequestCreate).
    amount: int
    # KRW per 1 KZT at the current reference rate (null while none is available). Requests
    # posted before every request was at the market rate keep their offset here.
    effective_rate: float | None
    # The smallest counter offer the author accepts (null: counter offers are off).
    min_counter_amount: int | None
    # The bank the author would rather use for the KZT side (null: no preference).
    kzt_bank: str | None
    status: RequestStatus
    # An admin took it off the board (status `closed`), or it was closed by its author's ban.
    removed_by_admin: bool
    author_completed_deals: int
    author_profile: Profile | None
    # Read from the users table at load time (never stored with the request); null if none.
    author_username: str | None
    is_own: bool
    # The viewer's latest response to this request, if they took it or sent a counter offer.
    my_deal_id: int | None
    my_deal_status: DealStatus | None
    # How many more offers the viewer may send on it, once their latest is cancelled (null on
    # their own request).
    offers_left: int | None
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


class CounterOfferCreate(BaseModel):
    """Part of someone else's request, in its currency (what the responder gets)."""

    model_config = ConfigDict(extra="forbid")

    amount: Amount


class DealOut(BaseModel):
    """A deal as one of its two participants sees it. Never includes usernames."""

    id: int
    status: DealStatus
    # The viewer's side: 'author' posted the request, 'responder' took it.
    role: DealRole
    # What the deal is for, in the request's currency (what the author buys): the whole
    # request, or the part a counter offer asked for. `partial`: less than the whole request,
    # whose rest stays on the board once it's accepted.
    amount: int
    partial: bool
    # The whole request the deal is part of, in its currency: what's on the board now while the
    # deal is pending, else what it was when the deal was accepted (or declined).
    request_amount: int
    other_completed_deals: int
    other_profile: Profile | None
    # Whether each side confirmed receiving the other's payment.
    my_confirmed: bool
    other_confirmed: bool
    # The viewer reported this deal and no admin has resolved it yet.
    my_report_open: bool
    request: RequestOut
    created_at: str
    updated_at: str
    # When the author accepted it (null while pending, and for deals never accepted).
    accepted_at: str | None
    # KRW per 1 KZT, locked when the author accepted it: both amounts are exact from then on.
    # Null while pending (the request's current rate applies) or if no rate was known then.
    rate: float | None


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
    profile: Profile | None
    completed_deals: int
    is_banned: bool
    is_admin: bool
    # Unresolved reports about this user.
    open_reports: int

    @classmethod
    def from_row(cls, row: aiosqlite.Row) -> Self:
        return cls.model_validate({**dict(row), "profile": Profile.from_row(row)})


class AdminRequestOut(BaseModel):
    id: int
    author_id: int
    direction: Direction
    amount: int
    status: RequestStatus
    removed_by_admin: bool


class AdminDealOut(BaseModel):
    id: int
    status: DealStatus
    # A counter offer for part of the request (whose amount is then the deal's).
    partial: bool
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


class ListedDealOut(BaseModel):
    """Any deal, as admins see it in All deals. Never includes receiving details. The
    request's `amount` is the deal's (part of it, for a counter offer)."""

    id: int
    status: DealStatus
    partial: bool
    author_confirmed: bool
    responder_confirmed: bool
    created_at: str
    updated_at: str
    request: AdminRequestOut
    author: AdminUserOut
    responder: AdminUserOut


# Why a request was taken off the board: its author cancelled it, an admin removed it, a ban
# closed it, or the owner deleted its accepted deal.
CloseReason = Literal["author", "admin", "ban", "deal_deleted"]


class CancelledRequestOut(BaseModel):
    """A request taken off the board, as admins see it in All deals. Never includes receiving
    details."""

    id: int
    direction: Direction
    amount: int
    created_at: str
    closed_at: str
    # Null for requests closed before this was recorded.
    close_reason: CloseReason | None
    # The author, or the admin who removed it, banned its author or deleted its deal.
    closed_by: AdminUserOut | None
    author: AdminUserOut
    # People who had taken it (their deals were declined when it closed), first taker first.
    takers: list[AdminUserOut]
    # Unresolved reports about this request.
    open_reports: int


class AdminBoardRequestOut(BaseModel):
    """A request on the board, as admins see it. Never includes receiving details."""

    id: int
    direction: Direction
    amount: int
    effective_rate: float | None
    created_at: str
    expires_at: str
    author: AdminUserOut
    # Waiting for the author's answer, first taker first.
    responders: list[AdminUserOut]
    # Unresolved reports about this request.
    open_reports: int


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

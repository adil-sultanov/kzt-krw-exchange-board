// Mirrors the backend schemas in backend/app/models.py.

export type Direction = "KZT_KRW" | "KRW_KZT";
export type RequestStatus = "open" | "in_progress" | "completed" | "closed" | "expired";
export type BoardSort = "date" | "amount";
/** "desc" is newest or largest first. */
export type SortOrder = "desc" | "asc";
export type Currency = "KZT" | "KRW";
/** `cancelled`: its responder cancelled their offer before the author answered. */
export type DealStatus = "pending" | "accepted" | "declined" | "cancelled" | "completed";
export type DealRole = "author" | "responder";

export const CURRENCIES: Currency[] = ["KRW", "KZT"];
export const BOARD_SORTS: BoardSort[] = ["date", "amount"];
export const DURATIONS = [1, 3] as const;
export type DurationDays = (typeof DURATIONS)[number];

// Limits enforced by the backend.
export const MAX_AMOUNT = 100_000_000;
export const MAX_BANK_LENGTH = 100;
export const MAX_ACCOUNT_LENGTH = 100;
export const MAX_NAME_LENGTH = 40;
export const MAX_UNIVERSITY_LENGTH = 60;
export const MAX_KZT_BANK_LENGTH = 40;
export const MIN_ENROLLMENT_YEAR = 2000;
export const MAX_REPORT_NOTE_LENGTH = 500;
export const MAX_DONATE_OPTIONS = 6;
export const MAX_DONATE_LABEL_LENGTH = 40;
export const MAX_DONATE_VALUE_LENGTH = 200;
export const MAX_DONATE_NOTE_LENGTH = 300;

export interface Me {
  telegram_id: number;
  username: string | null;
  first_name: string;
  completed_deals: number;
  is_banned: boolean;
  is_admin: boolean;
  /** The app's owner: the only one who can edit the About page. */
  is_owner: boolean;
  /** Where this user receives each currency (shown only to an accepted deal's other side). */
  receive_kzt_bank: string | null;
  receive_kzt_account: string | null;
  receive_krw_bank: string | null;
  receive_krw_account: string | null;
  /** The profile shown on this user's requests and deals (see Profile). */
  profile_first_name: string | null;
  profile_last_name: string | null;
  university: string | null;
  enrollment_year: number | null;
  /** Whether the bot messages them about each new request in a Board tab (off by default). */
  alerts_buy_krw: boolean;
  alerts_buy_kzt: boolean;
  /** They've opened the Alerts panel, which clears its "new" dot. */
  alerts_seen: boolean;
  /** Filled in as the preferred KZT bank on their next request (New request remembers it). */
  saved_kzt_bank: string | null;
}

/** Turns a Board tab's alerts on or off; any update (even an empty one) marks the panel seen. */
export interface AlertsUpdate {
  buy_krw?: boolean;
  buy_kzt?: boolean;
}

/** Whether `me` gets alerts about new requests in the Board tab for buying `currency`. */
export function alertsOn(me: Me, currency: Currency): boolean {
  return currency === "KRW" ? me.alerts_buy_krw : me.alerts_buy_kzt;
}

/** Profile and receiving details to save. A field left out is unchanged; "" or null clears it. */
export type MeUpdate = Partial<
  Pick<
    Me,
    | "receive_kzt_bank"
    | "receive_kzt_account"
    | "receive_krw_bank"
    | "receive_krw_account"
    | "profile_first_name"
    | "profile_last_name"
    | "university"
    | "enrollment_year"
  >
>;

/** What a user tells others about themselves, shown as a tag: "Adil Sultanov, UNIST, 2022". */
export interface Profile {
  first_name: string | null;
  last_name: string | null;
  university: string | null;
  enrollment_year: number | null;
}

/** Posting or taking a request needs the whole profile. */
export function hasProfile(me: Me): boolean {
  return Boolean(me.profile_first_name && me.profile_last_name && me.university && me.enrollment_year);
}

export interface Rate {
  rate: number | null;
  source: string | null;
  fetched_at: string | null;
}

export interface ExchangeRequest {
  id: number;
  direction: Direction;
  /** In the currency the author buys (see `amountCurrency`): what they get is fixed. */
  amount: number;
  /** KRW per 1 KZT at the current reference rate (null while none is available). */
  effective_rate: number | null;
  /**
   * Not from the API: set on a deal's terms (see `dealTerms`) once its rate was locked at
   * acceptance, when `effective_rate` is that rate and both amounts are exact.
   */
  rate_locked?: boolean;
  /** The smallest counter offer the author accepts, in `amount`'s currency (null: they don't). */
  min_counter_amount: number | null;
  /** The bank the author would rather use for the KZT side, e.g. "Kaspi" (null: no preference). */
  kzt_bank: string | null;
  status: RequestStatus;
  /** An admin took it off the board (status `closed`), or its author's ban did. */
  removed_by_admin: boolean;
  author_completed_deals: number;
  author_profile: Profile | null;
  /** The author's current Telegram username (null if they have none). */
  author_username: string | null;
  is_own: boolean;
  /** The viewer's latest response to this request, if they took it or sent a counter offer. */
  my_deal_id: number | null;
  my_deal_status: DealStatus | null;
  /** How many more offers the viewer may send on it once their latest is cancelled (null on their own). */
  offers_left: number | null;
  /** For the author only: how many responders are waiting for an answer. */
  pending_count: number | null;
  created_at: string;
  expires_at: string;
}

/** A deal as one of its participants sees it. */
export interface Deal {
  id: number;
  status: DealStatus;
  role: DealRole;
  /**
   * What the deal is for, in the request's currency: all of it, or the part a counter offer
   * asked for. `partial`: less than the whole request, whose rest stays on the board once accepted.
   */
  amount: number;
  partial: boolean;
  /**
   * The whole request the deal is part of: what's on the board now while it's pending, else what
   * it was when the deal was accepted (or declined).
   */
  request_amount: number;
  other_completed_deals: number;
  other_profile: Profile | null;
  /** Whether each side confirmed receiving the other's payment. */
  my_confirmed: boolean;
  other_confirmed: boolean;
  /** The viewer reported this deal and no admin has resolved it yet. */
  my_report_open: boolean;
  request: ExchangeRequest;
  created_at: string;
  updated_at: string;
  /** When the author accepted it (null while pending, and for deals never accepted). */
  accepted_at: string | null;
  /**
   * KRW per 1 KZT, locked when the author accepted it (null while pending, when the request's
   * current rate applies, or if no rate was known then).
   */
  rate: number | null;
}

export type ReportCategory = "scam" | "no_payment" | "disappeared" | "spam" | "other";
export const REPORT_CATEGORIES: ReportCategory[] = ["scam", "no_payment", "disappeared", "spam", "other"];

export interface ReportCreate {
  category: ReportCategory;
  note: string;
}

/** What a report is about: someone else's request, or the viewer's accepted deal. */
export type ReportTarget = { kind: "request"; id: number } | { kind: "deal"; id: number };

/** A way to donate: a link to open, or anything else (a card number) to copy. */
export interface DonateOption {
  label: string;
  value: string;
}

export interface About {
  donate_note: string;
  donate_options: DonateOption[];
  updated_at: string | null;
}

export type AboutUpdate = Omit<About, "updated_at">;

/** A user as admins see them in a report (never their receiving details). */
export interface AdminUser {
  telegram_id: number;
  username: string | null;
  first_name: string;
  profile: Profile | null;
  completed_deals: number;
  is_banned: boolean;
  is_admin: boolean;
  /** Unresolved reports about this user. */
  open_reports: number;
}

/** Why a request left the board early: its author, an admin, a ban, or the owner deleting its deal. */
export type CloseReason = "author" | "admin" | "ban" | "deal_deleted";

/** A request taken off the board, as admins see it in All deals. */
export interface CancelledRequest {
  id: number;
  direction: Direction;
  amount: number;
  created_at: string;
  closed_at: string;
  /** Null for requests closed before this was recorded. */
  close_reason: CloseReason | null;
  /** The author, or the admin who removed it, banned its author or deleted its deal. */
  closed_by: AdminUser | null;
  author: AdminUser;
  /** People who had taken it (declined when it closed), first taker first. */
  takers: AdminUser[];
  open_reports: number;
}

/** A request on the board, as admins see it. */
export interface AdminBoardRequest {
  id: number;
  direction: Direction;
  amount: number;
  effective_rate: number | null;
  created_at: string;
  expires_at: string;
  author: AdminUser;
  /** Waiting for the author's answer, first taker first. */
  responders: AdminUser[];
  /** Unresolved reports about this request. */
  open_reports: number;
}

export interface AdminRequest {
  id: number;
  author_id: number;
  direction: Direction;
  amount: number;
  status: RequestStatus;
  removed_by_admin: boolean;
}

export interface AdminReport {
  id: number;
  category: ReportCategory;
  note: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  reporter: AdminUser;
  reported: AdminUser | null;
  request: AdminRequest;
  /** `partial`: a counter offer, whose amount is the request's here. */
  deal: {
    id: number;
    status: DealStatus;
    partial: boolean;
    author_confirmed: boolean;
    responder_confirmed: boolean;
  } | null;
}

/** Where admin rights come from: OWNER_ID, ADMIN_IDS, or the owner adding them in the app. */
export type AdminSource = "owner" | "config" | "granted";

export interface AdminEntry extends AdminUser {
  source: AdminSource;
}

/** The tabs of All deals: pending or accepted; completed; declined or cancelled by their sender. */
export type DealListState = "active" | "completed" | "cancelled";

/** Any deal, as admins see it in All deals. The request's `amount` is the deal's. */
export interface ListedDeal {
  id: number;
  status: DealStatus;
  /** A counter offer for part of the request. */
  partial: boolean;
  /** Whether each side confirmed receiving the other's payment. */
  author_confirmed: boolean;
  responder_confirmed: boolean;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  /**
   * KRW per 1 KZT: locked when the deal was accepted (`rate_locked`), else its request's rate
   * now (null while no reference rate is known).
   */
  rate: number | null;
  rate_locked: boolean;
  request: AdminRequest;
  author: AdminUser;
  responder: AdminUser;
}

/** What each side of a deal pays: the responder the (fixed) amount, the author the other currency at the rate. */
export function listedDealSides(deal: ListedDeal): { author: Side; responder: Side } {
  const currency = amountCurrency(deal.request.direction);
  return {
    author: {
      currency: giveCurrency(deal.request.direction),
      amount: deal.rate === null ? null : Math.round(convert(deal.request.amount, currency, deal.rate)),
      approx: !deal.rate_locked,
    },
    responder: { currency, amount: deal.request.amount, approx: false },
  };
}

/** Admin: users lists everyone, those with open reports about them, or banned users. */
export type UserListFilter = "all" | "reported" | "banned";

export interface AdminUserListItem extends AdminUser {
  created_at: string;
  /** When they last used the app or the bot, to within a few minutes. */
  last_seen_at: string | null;
}

/** The users matching a search, most recently seen first, and counts over everyone. */
export interface AdminUsers {
  users: AdminUserListItem[];
  total: number;
  seen_this_week: number;
  reported: number;
  banned: number;
}

export interface AdminUserRequest {
  id: number;
  direction: Direction;
  amount: number;
  status: RequestStatus;
  removed_by_admin: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

/** A user's page in Admin: users. Never their receiving details: only whether they added them. */
export interface AdminUserDetail extends AdminUserListItem {
  alerts_buy_krw: boolean;
  alerts_buy_kzt: boolean;
  has_receive_kzt: boolean;
  has_receive_krw: boolean;
  /** Their requests on the board now, and their deals pending or accepted. */
  open_requests: number;
  active_deals: number;
  /** Reports about them (open or not), and reports they sent. */
  reports_total: number;
  reports_sent: number;
  /** The latest ones, newest first. */
  requests: AdminUserRequest[];
  deals: ListedDeal[];
}

export interface Contact {
  username: string;
  url: string;
  /** The currency the viewer pays, and the other side's details for receiving it. */
  pay_currency: Currency;
  pay_bank: string | null;
  pay_account: string | null;
}

export interface RequestCreate {
  direction: Direction;
  amount: number;
  duration_days: DurationDays;
  /** The smallest counter offer to accept (at most `amount`); null turns counter offers off. */
  min_counter_amount: number | null;
  /** The preferred KZT bank; null for none. */
  kzt_bank: string | null;
  /** Remember `kzt_bank` for the next request (false forgets the one remembered). */
  remember_kzt_bank: boolean;
}

/**
 * The author's changes to their open request. `extend_days` moves the expiry to that many days
 * from now; `min_counter_amount: null` turns counter offers off, `kzt_bank: null` removes the bank.
 */
export interface RequestUpdate {
  amount?: number;
  min_counter_amount?: number | null;
  kzt_bank?: string | null;
  extend_days?: DurationDays;
}

/** A request's terms, e.g. to post an expired one again. */
export type RequestTerms = Pick<
  ExchangeRequest,
  "direction" | "amount" | "min_counter_amount" | "kzt_bank"
>;

/**
 * A preferred KZT bank as the backend stores it: inner spaces collapsed, empty for none. It's
 * shown to everyone, so only letters, digits, spaces and a little punctuation ("Kaspi, Halyk").
 */
export function cleanKztBank(text: string): { value: string | null; valid: boolean } {
  const value = text.split(/\s+/).filter(Boolean).join(" ");
  return { value: value || null, valid: /^[\p{L}\p{N} \-'\u2019.&()/,+]*$/u.test(value) };
}

export interface CreatedRequest {
  request: ExchangeRequest;
  matches: ExchangeRequest[];
}

export interface BoardFilters {
  direction: Direction;
  sort: BoardSort;
  order: SortOrder;
}

/** The currency the author gives (and whoever takes the request gets). */
export function giveCurrency(direction: Direction): Currency {
  return direction === "KZT_KRW" ? "KZT" : "KRW";
}

/** The currency the author gets (and whoever takes the request pays). */
export function getCurrency(direction: Direction): Currency {
  return direction === "KZT_KRW" ? "KRW" : "KZT";
}

/**
 * The currency a request's `amount` is in (and its counter offer minimum, and its deals'
 * amounts): what its author buys. That side is fixed; the other follows the market rate until
 * a deal is accepted.
 */
export function amountCurrency(direction: Direction): Currency {
  return getCurrency(direction);
}

// The UI always speaks from the viewer's side: what *you* pay and get. The author of a
// request gets its `amount`; whoever takes it pays that amount.

/** Requests on the Board that get the viewer `currency` when they take one. */
export function boardDirection(currency: Currency): Direction {
  return currency === "KZT" ? "KZT_KRW" : "KRW_KZT";
}

/** The direction of a new request whose author wants to get `currency`. */
export function postDirection(currency: Currency): Direction {
  return currency === "KRW" ? "KZT_KRW" : "KRW_KZT";
}

/** An amount in the other currency at `rate` (KRW per 1 KZT). */
export function convert(amount: number, from: Currency, rate: number): number {
  return from === "KZT" ? amount * rate : amount / rate;
}

/** One side of an exchange. `amount` is null while there's no reference rate to convert at. */
export interface Side {
  currency: Currency;
  amount: number | null;
  /** Converted at the current market rate, so it moves with it (until a deal locks it). */
  approx: boolean;
}

/**
 * What the viewer pays and gets: as its author, or by taking it. The amount (what the author
 * gets, so what a taker pays) is fixed; the other side is converted at the rate.
 */
export function viewerSides(request: ExchangeRequest): { pay: Side; get: Side } {
  const currency = amountCurrency(request.direction);
  const fixed: Side = { currency, amount: request.amount, approx: false };
  const converted: Side = {
    currency: giveCurrency(request.direction),
    amount:
      request.effective_rate === null ? null : Math.round(convert(request.amount, currency, request.effective_rate)),
    approx: !request.rate_locked,
  };
  return request.is_own ? { pay: converted, get: fixed } : { pay: fixed, get: converted };
}

/**
 * Whether someone else can respond to the request: it's open, and the viewer hasn't yet, or
 * cancelled their last offer and has offers left (at most 3 on a request, one at a time).
 */
export function canRespond(request: ExchangeRequest): boolean {
  const free = request.my_deal_id === null || request.my_deal_status === "cancelled";
  return !request.is_own && request.status === "open" && free && (request.offers_left ?? 0) > 0;
}

/** Whether the viewer can respond to requests at all: posting and taking need a username and a profile. */
export function mayRespond(me: Me): boolean {
  return !me.is_banned && Boolean(me.username) && hasProfile(me);
}

/** Whether someone can offer to take part of the request rather than all of it. */
export function takesCounterOffers(request: ExchangeRequest): boolean {
  return request.min_counter_amount !== null && request.min_counter_amount < request.amount;
}

/**
 * The request as a deal covers it: its amount is the deal's (a part of it, for a counter offer),
 * at the deal's locked rate once accepted.
 */
export function dealTerms(deal: Deal): ExchangeRequest {
  return { ...lockedRate(deal), amount: deal.amount };
}

/** For a counter offer, the whole request it's part of (see `Deal.request_amount`); else null. */
export function dealWhole(deal: Deal): ExchangeRequest | null {
  return deal.partial ? { ...lockedRate(deal), amount: deal.request_amount } : null;
}

function lockedRate(deal: Deal): ExchangeRequest {
  return deal.rate === null ? deal.request : { ...deal.request, effective_rate: deal.rate, rate_locked: true };
}

/** Whether the viewer has saved where they receive a currency. */
export function hasReceiveDetails(me: Me, currency: Currency): boolean {
  return Boolean(currency === "KZT" ? me.receive_kzt_account : me.receive_krw_account);
}

/** Whether the viewer can cancel their offer: they sent it, and the author hasn't answered yet. */
export function canCancelOffer(deal: Deal): boolean {
  return deal.role === "responder" && deal.status === "pending";
}

/** Deals still going: waiting for the author's answer, or accepted and not yet completed. */
export function isActiveDeal(deal: Deal): boolean {
  return deal.status === "pending" || deal.status === "accepted";
}

/** Most urgent first: deals in progress, then ones waiting on the viewer, then the rest. */
export function sortDeals(deals: Deal[]): Deal[] {
  const rank = (deal: Deal) => (deal.status === "accepted" ? 0 : needsMyAction(deal) ? 1 : 2);
  // Array.prototype.sort is stable, so the server's most-recent-first order is kept within a rank.
  return [...deals].sort((a, b) => rank(a) - rank(b));
}

const HOUR_MS = 60 * 60 * 1000;
/** An own request this close to expiring asks its author to extend it. */
const EXPIRING_SOON_MS = 6 * HOUR_MS;
/** Extending must keep a request up at least this much longer to be offered. */
const MIN_EXTENSION_MS = HOUR_MS;

/** Whether an open request leaves the board within a few hours. */
export function expiresSoon(request: ExchangeRequest, now: number = Date.now()): boolean {
  const left = new Date(request.expires_at).getTime() - now;
  return request.status === "open" && left > 0 && left < EXPIRING_SOON_MS;
}

/** The extensions (days from now) that would keep an open request up noticeably longer. */
export function extendOptions(request: ExchangeRequest, now: number = Date.now()): DurationDays[] {
  const expires = new Date(request.expires_at).getTime();
  if (request.status !== "open" || expires <= now) return [];
  return DURATIONS.filter((days) => now + days * 24 * HOUR_MS > expires + MIN_EXTENSION_MS);
}

/**
 * An accepted deal the viewer hasn't confirmed this long after acceptance is waiting on them
 * (the bot reminds them once then too: CONFIRM_REMINDER_DELAY in backend services/deals.py).
 */
const CONFIRM_REMINDER_MS = 3 * HOUR_MS;

/**
 * Whether the viewer should confirm receiving the money on an accepted deal: the other side
 * already has, or it was accepted a while ago (they've had time to pay each other).
 */
export function awaitsMyConfirmation(deal: Deal, now: number = Date.now()): boolean {
  if (deal.status !== "accepted" || deal.my_confirmed) return false;
  if (deal.other_confirmed) return true;
  return deal.accepted_at !== null && now - new Date(deal.accepted_at).getTime() >= CONFIRM_REMINDER_MS;
}

/** Whether a deal is waiting on the viewer: answering a responder, or confirming a payment. */
export function needsMyAction(deal: Deal): boolean {
  if (deal.status === "pending") return deal.role === "author";
  return awaitsMyConfirmation(deal);
}

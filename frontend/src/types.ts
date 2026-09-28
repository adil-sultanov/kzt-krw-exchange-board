// Mirrors the backend schemas in backend/app/models.py.

export type Direction = "KZT_KRW" | "KRW_KZT";
export type RequestStatus = "open" | "in_progress" | "completed" | "closed" | "expired";
export type BoardSort = "date" | "rate" | "amount";
/** "desc" is newest, best rate for the viewer, or largest first. */
export type SortOrder = "desc" | "asc";
export type Currency = "KZT" | "KRW";
export type DealStatus = "pending" | "accepted" | "declined" | "completed";
export type DealRole = "author" | "responder";

export const CURRENCIES: Currency[] = ["KRW", "KZT"];
export const BOARD_SORTS: BoardSort[] = ["date", "amount", "rate"];
export const DURATIONS = [1, 3] as const;
export type DurationDays = (typeof DURATIONS)[number];

// Limits enforced by the backend.
export const MAX_AMOUNT = 100_000_000;
export const MAX_MARKET_OFFSET = 20;
export const MAX_BANK_LENGTH = 100;
export const MAX_ACCOUNT_LENGTH = 100;
export const MAX_NAME_LENGTH = 40;
export const MAX_UNIVERSITY_LENGTH = 60;
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
  amount: number;
  /** Percent offset from the reference (market) rate. */
  rate_value: number;
  /** KRW per 1 KZT at the current reference rate (null while none is available). */
  effective_rate: number | null;
  /** The smallest counter offer the author accepts, in `amount`'s currency (null: they don't). */
  min_counter_amount: number | null;
  status: RequestStatus;
  /** An admin took it off the board (status `closed`), or its author's ban did. */
  removed_by_admin: boolean;
  author_completed_deals: number;
  author_profile: Profile | null;
  /** The author's current Telegram username (null if they have none). */
  author_username: string | null;
  is_own: boolean;
  /** The viewer's own response to this request, if they took it. */
  my_deal_id: number | null;
  my_deal_status: DealStatus | null;
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
  rate_value: number;
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
  rate_value: number;
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

/** Any deal, as admins see it in All deals. The request's `amount` is the deal's. */
export interface ListedDeal {
  id: number;
  status: DealStatus;
  /** A counter offer for part of the request. */
  partial: boolean;
  author_confirmed: boolean;
  responder_confirmed: boolean;
  created_at: string;
  updated_at: string;
  request: AdminRequest;
  author: AdminUser;
  responder: AdminUser;
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
  /** Percent offset from the reference (market) rate; 0 is the market rate. */
  rate_value: number;
  duration_days: DurationDays;
  /** The smallest counter offer to accept (at most `amount`); null turns counter offers off. */
  min_counter_amount: number | null;
}

/**
 * The author's changes to their open request. `extend_days` moves the expiry to that many days
 * from now; `min_counter_amount: null` turns counter offers off.
 */
export interface RequestUpdate {
  amount?: number;
  rate_value?: number;
  min_counter_amount?: number | null;
  extend_days?: DurationDays;
}

/** A request's terms, e.g. to post an expired one again. */
export type RequestTerms = Pick<ExchangeRequest, "direction" | "amount" | "rate_value" | "min_counter_amount">;

export interface CreatedRequest {
  request: ExchangeRequest;
  matches: ExchangeRequest[];
}

export interface BoardFilters {
  direction: Direction;
  sort: BoardSort;
  order: SortOrder;
}

/** The currency the author gives; `amount` is in this currency. */
export function giveCurrency(direction: Direction): Currency {
  return direction === "KZT_KRW" ? "KZT" : "KRW";
}

export function getCurrency(direction: Direction): Currency {
  return direction === "KZT_KRW" ? "KRW" : "KZT";
}

// The UI always speaks from the viewer's side: what *you* pay and get. The author of a
// request pays its `amount` in the give currency; whoever takes it gets that amount.

/** Requests on the Board that get the viewer `currency` when they take one. */
export function boardDirection(currency: Currency): Direction {
  return currency === "KZT" ? "KZT_KRW" : "KRW_KZT";
}

/** The direction of a new request whose author wants to get `currency`. */
export function postDirection(currency: Currency): Direction {
  return currency === "KRW" ? "KZT_KRW" : "KRW_KZT";
}

/** What the author gets for their amount at `rate` (KRW per 1 KZT). */
export function convert(amount: number, from: Currency, rate: number): number {
  return from === "KZT" ? amount * rate : amount / rate;
}

/** One side of an exchange. `amount` is null while there's no reference rate to convert at. */
export interface Side {
  currency: Currency;
  amount: number | null;
  /** Converted at the current market rate, so it moves with it. */
  approx: boolean;
}

/** What the viewer pays and gets: as its author, or by taking it. */
export function viewerSides(request: ExchangeRequest): { pay: Side; get: Side } {
  const give = giveCurrency(request.direction);
  const fixed: Side = { currency: give, amount: request.amount, approx: false };
  const converted: Side = {
    currency: getCurrency(request.direction),
    amount: request.effective_rate === null ? null : convert(request.amount, give, request.effective_rate),
    approx: true,
  };
  return request.is_own ? { pay: fixed, get: converted } : { pay: converted, get: fixed };
}

/**
 * How much better (positive) or worse than the market rate the request is for the viewer,
 * in percent. The author of a KZT_KRW request gets KRW, so a higher rate is better for them.
 */
export function viewerRateGain(request: Pick<ExchangeRequest, "direction" | "rate_value" | "is_own">): number {
  const authorGain = request.direction === "KZT_KRW" ? request.rate_value : -request.rate_value;
  return request.is_own ? authorGain : -authorGain;
}

/** Whether someone else can respond to the request: it's open and the viewer hasn't yet. */
export function canRespond(request: ExchangeRequest): boolean {
  return !request.is_own && request.status === "open" && request.my_deal_id === null;
}

/** Whether the viewer can respond to requests at all: posting and taking need a username and a profile. */
export function mayRespond(me: Me): boolean {
  return !me.is_banned && Boolean(me.username) && hasProfile(me);
}

/** Whether someone can offer to take part of the request rather than all of it. */
export function takesCounterOffers(request: ExchangeRequest): boolean {
  return request.min_counter_amount !== null && request.min_counter_amount < request.amount;
}

/** The request as a deal covers it: its amount is the deal's (a part of it, for a counter offer). */
export function dealTerms(deal: Deal): ExchangeRequest {
  return { ...deal.request, amount: deal.amount };
}

/** For a counter offer, the whole request it's part of (see `Deal.request_amount`); else null. */
export function dealWhole(deal: Deal): ExchangeRequest | null {
  return deal.partial ? { ...deal.request, amount: deal.request_amount } : null;
}

/** Whether the viewer has saved where they receive a currency. */
export function hasReceiveDetails(me: Me, currency: Currency): boolean {
  return Boolean(currency === "KZT" ? me.receive_kzt_account : me.receive_krw_account);
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

/** Whether a deal is waiting on the viewer: answering a responder, or confirming a payment. */
export function needsMyAction(deal: Deal): boolean {
  if (deal.status === "pending") return deal.role === "author";
  return deal.status === "accepted" && deal.other_confirmed && !deal.my_confirmed;
}

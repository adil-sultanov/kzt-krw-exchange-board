// Mirrors the backend schemas in backend/app/models.py.

export type Direction = "KZT_KRW" | "KRW_KZT";
export type RequestStatus = "open" | "in_progress" | "completed" | "closed" | "expired";
export type BoardSort = "newest" | "best_rate" | "amount_desc" | "amount_asc";
export type Currency = "KZT" | "KRW";
export type DealStatus = "pending" | "accepted" | "declined" | "completed";
export type DealRole = "author" | "responder";

export const CURRENCIES: Currency[] = ["KRW", "KZT"];
export const BOARD_SORTS: BoardSort[] = ["newest", "best_rate", "amount_desc", "amount_asc"];
/** Amounts of different currencies don't compare, so these need a direction picked. */
export const AMOUNT_SORTS: BoardSort[] = ["amount_desc", "amount_asc"];
export const DURATIONS = [1, 3] as const;
export type DurationDays = (typeof DURATIONS)[number];

// Limits enforced by the backend.
export const MAX_AMOUNT = 100_000_000;
export const MAX_MARKET_OFFSET = 20;
export const MAX_BANK_LENGTH = 100;
export const MAX_ACCOUNT_LENGTH = 100;

export interface Me {
  telegram_id: number;
  username: string | null;
  first_name: string;
  completed_deals: number;
  is_banned: boolean;
  is_admin: boolean;
  /** Where this user receives each currency (shown only to an accepted deal's other side). */
  receive_kzt_bank: string | null;
  receive_kzt_account: string | null;
  receive_krw_bank: string | null;
  receive_krw_account: string | null;
}

/** Receiving details to save. A field left out is unchanged; "" or null clears it. */
export type MeUpdate = Partial<
  Pick<Me, "receive_kzt_bank" | "receive_kzt_account" | "receive_krw_bank" | "receive_krw_account">
>;

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
  status: RequestStatus;
  author_completed_deals: number;
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
  other_completed_deals: number;
  /** Whether each side confirmed receiving the other's payment. */
  my_confirmed: boolean;
  other_confirmed: boolean;
  request: ExchangeRequest;
  created_at: string;
  updated_at: string;
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
}

/** The author's changes to their open request. `extend_days` moves the expiry to that many days from now. */
export interface RequestUpdate {
  amount?: number;
  rate_value?: number;
  extend_days?: DurationDays;
}

/** A request's terms, e.g. to post an expired one again. */
export type RequestTerms = Pick<ExchangeRequest, "direction" | "amount" | "rate_value">;

export interface CreatedRequest {
  request: ExchangeRequest;
  matches: ExchangeRequest[];
}

export interface BoardFilters {
  direction: Direction | null;
  minAmount: number | null;
  maxAmount: number | null;
  sort: BoardSort;
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

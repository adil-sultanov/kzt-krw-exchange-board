// Mirrors the backend schemas in backend/app/models.py.

export type Direction = "KZT_KRW" | "KRW_KZT";
export type RequestStatus = "open" | "in_progress" | "completed" | "closed" | "expired";
export type BoardSort = "newest" | "amount_asc" | "amount_desc" | "rate_asc" | "rate_desc";
export type Currency = "KZT" | "KRW";
export type DealStatus = "pending" | "accepted" | "declined" | "completed";
export type DealRole = "author" | "responder";

export const DIRECTIONS: Direction[] = ["KZT_KRW", "KRW_KZT"];
export const BOARD_SORTS: BoardSort[] = ["newest", "amount_asc", "amount_desc", "rate_asc", "rate_desc"];
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

/** The currency one side of a deal receives. The author receives what the request wants. */
export function dealReceives(direction: Direction, role: DealRole): Currency {
  return role === "author" ? getCurrency(direction) : giveCurrency(direction);
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

/** Whether a deal is waiting on the viewer: answering a responder, or confirming a payment. */
export function needsMyAction(deal: Deal): boolean {
  if (deal.status === "pending") return deal.role === "author";
  return deal.status === "accepted" && deal.other_confirmed && !deal.my_confirmed;
}

import { tg } from "./telegram";
import type {
  BoardFilters,
  Contact,
  CreatedRequest,
  Deal,
  ExchangeRequest,
  Me,
  MeUpdate,
  Rate,
  RequestCreate,
} from "./types";

/** An API failure. `code` is the backend's machine code (see i18n.ts for messages). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `tma ${tg?.initData ?? ""}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network_error", 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ApiError(typeof detail === "string" ? detail : "unknown_error", response.status);
  }
  return data as T;
}

export type DealAction = "accept" | "decline" | "confirm";

export const BOARD_PAGE_SIZE = 30;

export function boardQuery(filters: BoardFilters, offset: number, limit: number): string {
  const params = new URLSearchParams({
    sort: filters.sort,
    limit: String(limit),
    offset: String(offset),
  });
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.minAmount !== null) params.set("min_amount", String(filters.minAmount));
  if (filters.maxAmount !== null) params.set("max_amount", String(filters.maxAmount));
  return params.toString();
}

export const api = {
  me: () => call<Me>("GET", "/me"),
  updateMe: (body: MeUpdate) => call<Me>("PATCH", "/me", body),
  rate: () => call<Rate>("GET", "/rate"),
  board: (filters: BoardFilters, offset = 0, limit = BOARD_PAGE_SIZE) =>
    call<ExchangeRequest[]>("GET", `/requests?${boardQuery(filters, offset, limit)}`),
  request: (id: number) => call<ExchangeRequest>("GET", `/requests/${id}`),
  createRequest: (body: RequestCreate) => call<CreatedRequest>("POST", "/requests", body),
  takeRequest: (id: number) => call<Deal>("POST", `/requests/${id}/take`),
  /** Takes the viewer's own open request off the board ("Cancel request"). */
  closeRequest: (id: number) => call<ExchangeRequest>("POST", `/requests/${id}/close`),
  /** The viewer's own requests that are on the board now. */
  myRequests: () => call<ExchangeRequest[]>("GET", "/my/requests"),
  myDeals: () => call<Deal[]>("GET", "/my/deals"),
  deal: (id: number) => call<Deal>("GET", `/deals/${id}`),
  dealAction: (id: number, action: DealAction) =>
    call<Deal>("POST", `/deals/${id}/${action}`),
  contact: (id: number) => call<Contact>("GET", `/deals/${id}/contact`),
};

/** The machine code of any thrown error, for errorMessage(). */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "unknown_error";
}

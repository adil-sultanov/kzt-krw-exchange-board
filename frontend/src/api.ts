import { tg } from "./telegram";
import type {
  About,
  AboutUpdate,
  AdminEntry,
  AdminReport,
  AdminUser,
  BoardFilters,
  Contact,
  CreatedRequest,
  Deal,
  ExchangeRequest,
  Me,
  MeUpdate,
  OwnerDeal,
  Rate,
  ReportCreate,
  ReportTarget,
  RequestCreate,
  RequestUpdate,
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
    direction: filters.direction,
    sort: filters.sort,
    order: filters.order,
    limit: String(limit),
    offset: String(offset),
  });
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
  /** Edits or extends the viewer's own open request. */
  updateRequest: (id: number, body: RequestUpdate) =>
    call<ExchangeRequest>("PATCH", `/requests/${id}`, body),
  takeRequest: (id: number) => call<Deal>("POST", `/requests/${id}/take`),
  /** Takes the viewer's own open request off the board ("Cancel request"). */
  closeRequest: (id: number) => call<ExchangeRequest>("POST", `/requests/${id}/close`),
  /** The viewer's own requests on the board now, and those that expired in the last day. */
  myRequests: () => call<ExchangeRequest[]>("GET", "/my/requests"),
  myDeals: () => call<Deal[]>("GET", "/my/deals"),
  deal: (id: number) => call<Deal>("GET", `/deals/${id}`),
  dealAction: (id: number, action: DealAction) =>
    call<Deal>("POST", `/deals/${id}/${action}`),
  contact: (id: number) => call<Contact>("GET", `/deals/${id}/contact`),
  /** Opposite requests for the viewer's own open request, closest in size first. */
  requestMatches: (id: number) => call<ExchangeRequest[]>("GET", `/requests/${id}/matches`),
  report: (target: ReportTarget, body: ReportCreate) =>
    call<unknown>("POST", `/${target.kind === "deal" ? "deals" : "requests"}/${target.id}/report`, body),
  about: () => call<About>("GET", "/about"),
  /** Owner only. */
  updateAbout: (body: AboutUpdate) => call<About>("PUT", "/admin/about", body),
  adminReports: (resolved: boolean) => call<AdminReport[]>("GET", `/admin/reports?resolved=${resolved}`),
  resolveReport: (id: number) => call<null>("POST", `/admin/reports/${id}/resolve`),
  setBanned: (userId: number, banned: boolean) =>
    call<AdminUser>("POST", `/admin/users/${userId}/${banned ? "ban" : "unban"}`),
  /** Owner only. */
  admins: () => call<AdminEntry[]>("GET", "/admin/admins"),
  addAdmin: (username: string) => call<AdminEntry>("POST", "/admin/admins", { username }),
  removeAdmin: (userId: number) => call<null>("DELETE", `/admin/admins/${userId}`),
  /** Owner only: active deals (stalest first) or finished ones (newest first). */
  ownerDeals: (active: boolean) => call<OwnerDeal[]>("GET", `/admin/deals?active=${active}`),
  deleteDeal: (id: number) => call<null>("DELETE", `/admin/deals/${id}`),
};

/** The machine code of any thrown error, for errorMessage(). */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "unknown_error";
}

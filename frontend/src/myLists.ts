// The viewer's deals and own requests, as last loaded. The Board loads them for its badge, so
// My deals opens showing them (and refreshes them) instead of flashing a loading placeholder.
import { api } from "./api";
import type { Deal, ExchangeRequest } from "./types";

export interface MyLists {
  deals: Deal[];
  /** The viewer's own requests on the board, and those that expired in the last day. */
  requests: ExchangeRequest[];
}

let last: MyLists | null = null;

export function lastMyLists(): MyLists | null {
  return last;
}

export async function loadMyLists(): Promise<MyLists> {
  const [deals, requests] = await Promise.all([api.myDeals(), api.myRequests()]);
  last = { deals, requests };
  return last;
}

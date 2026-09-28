// A small in-app navigation stack. The Mini App lives at a single URL (Telegram uses the
// URL hash for launch data), so screens are React state rather than routes.
import { createContext, useContext, useEffect, useRef } from "react";
import type { CreatedRequest, ExchangeRequest, ReportTarget, RequestTerms } from "./types";

export type Route =
  | { name: "board" }
  | { name: "new"; prefill?: RequestTerms }
  | { name: "edit"; request: ExchangeRequest }
  | { name: "created"; result: CreatedRequest }
  | { name: "request"; id: number }
  | { name: "deal"; id: number }
  | { name: "deals" }
  | { name: "profile" }
  | { name: "report"; target: ReportTarget }
  | { name: "about" }
  | { name: "admin" }
  | { name: "boardRequests" }
  | { name: "admins" }
  | { name: "allDeals" };

export interface Nav {
  push(route: Route): void;
  replace(route: Route): void;
  pop(): void;
  /** Back to the Board, dropping every other screen. */
  home(): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("useNav outside NavContext");
  return nav;
}

/** Initial stack, honoring deep links like `startapp=req_123` or `startapp=deal_45`. */
export function initialStack(startParam: string | undefined): Route[] {
  const match = startParam?.match(/^(req|deal)_(\d+)$/);
  if (!match) return [{ name: "board" }];
  const id = Number(match[2]);
  return match[1] === "req"
    ? [{ name: "board" }, { name: "request", id }]
    : [{ name: "board" }, { name: "deals" }, { name: "deal", id }];
}

/**
 * Calls `onReactivate` when a screen that stayed mounted underneath becomes the top one
 * again, so it can refresh data that may have changed meanwhile.
 */
export function useReactivated(active: boolean, onReactivate: () => void): void {
  const callback = useRef(onReactivate);
  callback.current = onReactivate;
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) callback.current();
    wasActive.current = active;
  }, [active]);
}

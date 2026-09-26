// Keeps the open screen current without a manual refresh. Only the screen on top polls, and
// only while the app is in view, so even a few hundred users are a light load on the server.
import { useEffect, useRef } from "react";
import { tg } from "./telegram";

/** Screens where someone is waiting on the other side: a deal, My deals. */
export const FAST_POLL_MS = 5_000;
/** The Board and request details. */
export const SLOW_POLL_MS = 10_000;

function inView(): boolean {
  return document.visibilityState === "visible" && tg?.isActive !== false;
}

/**
 * Calls `poll` every `intervalMs` while `active`, pausing while the app is hidden or
 * minimized and polling right away when it's back. `poll` should keep what's shown if it
 * fails (the next tick retries), rather than show an error.
 */
export function usePolling(active: boolean, intervalMs: number, poll: () => Promise<unknown>): void {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    let inFlight = false;
    let stopped = false;

    const tick = async () => {
      window.clearTimeout(timer);
      // Out of view the chain stops, and `onShow` starts it again.
      if (stopped || inFlight || !inView()) return;
      inFlight = true;
      try {
        await pollRef.current();
      } catch {
        // Try again on the next tick.
      } finally {
        inFlight = false;
      }
      // A timeout per tick (not setInterval), so a slow response never stacks up requests.
      if (!stopped) timer = window.setTimeout(() => void tick(), intervalMs);
    };
    const onShow = () => {
      if (inView()) void tick();
    };

    timer = window.setTimeout(() => void tick(), intervalMs);
    document.addEventListener("visibilitychange", onShow);
    tg?.onEvent("activated", onShow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      tg?.offEvent("activated", onShow);
    };
  }, [active, intervalMs]);
}

import { useCallback, useEffect, useRef, useState } from "react";
import { errorCode } from "./api";
import { useReactivated } from "./nav";

export interface TabList<T, Item> {
  /** What to show: the current tab's items, or the previous tab's while those load (`stale`). */
  items: Item[] | null;
  stale: boolean;
  /** The tab `items` are for. */
  shownTab: T | null;
  /** Nothing loaded yet: show a skeleton. */
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/**
 * A list loaded per tab, e.g. open / resolved reports. Like the Board: on a new tab, what's
 * shown stays up (dimmed if it takes a moment, see `.results.stale`) until the new list is
 * in, instead of blinking through a skeleton. Reloads when the screen is back on top.
 */
export function useTabList<T, Item>(tab: T, fetch: (tab: T) => Promise<Item[]>, active: boolean): TabList<T, Item> {
  const [shown, setShown] = useState<{ tab: T; items: Item[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  // Responses to superseded loads (e.g. for the other tab) are ignored.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const items = await fetchRef.current(tab);
      if (seq !== loadSeq.current) return;
      setShown({ tab, items });
      setError(null);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorCode(e));
    }
  }, [tab]);

  useEffect(() => void load(), [load]);
  useReactivated(active, () => void load());

  const stale = shown !== null && shown.tab !== tab;
  return {
    // If the new tab fails to load, the old list is hidden rather than passed off as its.
    items: stale && error ? null : (shown?.items ?? null),
    stale,
    shownTab: stale && error ? null : (shown?.tab ?? null),
    loading: shown === null && error === null,
    error,
    load,
  };
}

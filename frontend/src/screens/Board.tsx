import { useCallback, useEffect, useRef, useState } from "react";
import { api, BOARD_PAGE_SIZE, errorCode } from "../api";
import { DealsIcon, ProfileIcon } from "../components/icons";
import { RequestCard } from "../components/RequestCard";
import { AmountInput, ErrorBox, Loading, RefreshButton, Segmented } from "../components/ui";
import { formatKst, formatRate, parseAmount } from "../format";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import { SLOW_POLL_MS, usePolling } from "../polling";
import { openLink, useMainButton } from "../telegram";
import {
  BOARD_SORTS,
  type BoardFilters,
  type BoardSort,
  type Direction,
  DIRECTIONS,
  type ExchangeRequest,
  giveCurrency,
  needsMyAction,
  type Rate,
} from "../types";

const RATE_SOURCE_URL = "https://www.exchangerate-api.com";
const MAX_RELOAD = 100; // the API's page size limit
const AMOUNT_DEBOUNCE_MS = 400;

const NO_FILTERS: BoardFilters = {
  direction: null,
  minAmount: null,
  maxAmount: null,
  sort: "newest",
};

export function Board(props: { active: boolean }) {
  const nav = useNav();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [items, setItems] = useState<ExchangeRequest[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  // Deals waiting on the viewer (the bot messages only about new and accepted deals).
  const [actionCount, setActionCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");

  // Responses to superseded loads (e.g. after a filter change) are ignored.
  const loadSeq = useRef(0);
  const shownCount = useRef(0);
  shownCount.current = items?.length ?? 0;

  /** A quiet load (polling) keeps the list if it fails; the next one retries. */
  const load = useCallback(
    async (count: number, quiet = false) => {
      const seq = ++loadSeq.current;
      const limit = Math.min(Math.max(count, BOARD_PAGE_SIZE), MAX_RELOAD);
      try {
        const page = await api.board(filters, 0, limit);
        if (seq !== loadSeq.current) return;
        setItems(page);
        setHasMore(page.length === limit);
        setError(null);
      } catch (e) {
        if (seq === loadSeq.current && !quiet) setError(errorCode(e));
      }
    },
    [filters],
  );

  const loadRate = useCallback(() => api.rate().then(setRate, () => setRate(null)), []);
  const loadBadge = useCallback(
    () =>
      api.myDeals().then(
        (deals) => setActionCount(deals.filter(needsMyAction).length),
        () => undefined, // keep the last count
      ),
    [],
  );

  useEffect(() => {
    setItems(null);
    void load(BOARD_PAGE_SIZE);
  }, [load]);

  // Coming back to the board: refresh what's shown, and the reference rate.
  useReactivated(props.active, () => void load(shownCount.current));

  useEffect(() => {
    if (!props.active) return;
    void loadRate();
    void loadBadge();
  }, [props.active, loadRate, loadBadge]);

  // New and taken requests show up on their own. The rate changes hourly, so it's reloaded
  // only when coming back to the board or on Refresh.
  usePolling(props.active, SLOW_POLL_MS, async () => {
    if (loadingMore) return; // a reload now would drop the page being added
    await Promise.all([load(shownCount.current, true), loadBadge()]);
  });

  const refresh = () => Promise.all([load(shownCount.current), loadRate(), loadBadge()]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const minAmount = parseAmount(minText);
      const maxAmount = parseAmount(maxText);
      setFilters((f) =>
        f.minAmount === minAmount && f.maxAmount === maxAmount ? f : { ...f, minAmount, maxAmount },
      );
    }, AMOUNT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [minText, maxText]);

  const loadMore = async () => {
    if (!items) return;
    const seq = loadSeq.current;
    setLoadingMore(true);
    try {
      const page = await api.board(filters, items.length);
      if (seq !== loadSeq.current) return;
      // New requests may shift pages; skip any already shown.
      const seen = new Set(items.map((item) => item.id));
      setItems([...items, ...page.filter((item) => !seen.has(item.id))]);
      setHasMore(page.length === BOARD_PAGE_SIZE);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorCode(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const setDirection = (direction: Direction | null) => {
    // Amounts are in the currency being given, so they don't carry over between directions.
    setMinText("");
    setMaxText("");
    setFilters((f) => ({ ...f, direction, minAmount: null, maxAmount: null }));
  };

  useMainButton(
    props.active ? { text: t.board.newRequest, onClick: () => nav.push({ name: "new" }) } : null,
  );

  const activeFilterCount =
    (filters.minAmount !== null ? 1 : 0) +
    (filters.maxAmount !== null ? 1 : 0) +
    (filters.sort !== "newest" ? 1 : 0);

  return (
    <div className="screen">
      <div className="nav-buttons">
        <button type="button" className="nav-button" onClick={() => nav.push({ name: "deals" })}>
          <DealsIcon />
          <span>{t.board.myDeals}</span>
          {actionCount > 0 && (
            <span className="count-badge" aria-label={t.board.needsAction(actionCount)}>
              {actionCount}
            </span>
          )}
        </button>
        <button type="button" className="nav-button" onClick={() => nav.push({ name: "profile" })}>
          <ProfileIcon />
          <span>{t.board.profile}</span>
        </button>
      </div>
      <div className="rate-card">
        <div className="hint small">{t.rate.reference}</div>
        {rate?.rate ? (
          <>
            <div className="rate-value">{t.rate.perKzt(formatRate(rate.rate))}</div>
            <div className="rate-value">{t.rate.perKrw(formatRate(1 / rate.rate))}</div>
          </>
        ) : (
          <div className="hint">{rate ? t.rate.unavailable : t.loading}</div>
        )}
        {rate?.fetched_at && (
          <div className="hint small">
            {t.rate.updated(formatKst(rate.fetched_at))} ·{" "}
            <button type="button" className="link-button" onClick={() => openLink(RATE_SOURCE_URL)}>
              {t.rate.attribution}
            </button>
          </div>
        )}
      </div>

      <Segmented<Direction | "all">
        options={[
          { value: "all", label: t.board.all },
          ...DIRECTIONS.map((d) => ({ value: d, label: t.direction[d] })),
        ]}
        value={filters.direction ?? "all"}
        onChange={(value) => setDirection(value === "all" ? null : value)}
      />

      <div className="toolbar">
        <button type="button" className="link-button filters-toggle" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? t.board.hideFilters : t.board.filters}
          {!showFilters && activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
        <RefreshButton onRefresh={refresh} />
      </div>

      {showFilters && (
        <div className="filters">
          <label className="field">
            <span className="field-label">{t.board.sortBy}</span>
            <select
              className="input"
              value={filters.sort}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value as BoardSort })}
            >
              {BOARD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t.board.sort[sort]}
                </option>
              ))}
            </select>
          </label>
          {filters.direction ? (
            <div className="field-row">
              <AmountInput
                label={t.board.minAmount(giveCurrency(filters.direction))}
                value={minText}
                onChange={setMinText}
              />
              <AmountInput
                label={t.board.maxAmount(giveCurrency(filters.direction))}
                value={maxText}
                onChange={setMaxText}
              />
            </div>
          ) : (
            <p className="hint small">{t.board.amountNeedsDirection}</p>
          )}
        </div>
      )}

      {error && <ErrorBox code={error} onRetry={() => void load(shownCount.current)} />}
      {!items && !error && <Loading />}
      {items && items.length === 0 && (
        <div className="empty">
          <p>{t.board.empty}</p>
          <p className="hint">{t.board.emptyHint}</p>
        </div>
      )}
      {items && (
        <div className="list">
          {items.map((item) => (
            <RequestCard
              key={item.id}
              request={item}
              onOpen={() => nav.push({ name: "request", id: item.id })}
            />
          ))}
        </div>
      )}
      {items && hasMore && (
        <button type="button" className="secondary-button" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? t.loading : t.board.loadMore}
        </button>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { api, BOARD_PAGE_SIZE, errorCode } from "../api";
import { DealsIcon, FiltersIcon, ProfileIcon } from "../components/icons";
import { RequestCard } from "../components/RequestCard";
import { AmountInput, Empty, ErrorBox, RefreshButton, Segmented, SkeletonList } from "../components/ui";
import { formatKstShort, formatRate, formatRatePair, parseAmount, SYMBOL } from "../format";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import { SLOW_POLL_MS, usePolling } from "../polling";
import { openLink, useMainButton } from "../telegram";
import {
  AMOUNT_SORTS,
  BOARD_SORTS,
  type BoardFilters,
  boardDirection,
  type Currency,
  CURRENCIES,
  type ExchangeRequest,
  expiresSoon,
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

function RateCard(props: { rate: Rate | null }) {
  const { rate } = props;
  return (
    <div className="rate-card">
      <div className="rate-head">
        <span className="rate-title">{t.rate.title}</span>
        {rate?.fetched_at && (
          <span className="hint small">
            {formatKstShort(rate.fetched_at)} ·{" "}
            <button type="button" className="link-button" onClick={() => openLink(RATE_SOURCE_URL)}>
              {t.rate.attribution}
            </button>
          </span>
        )}
      </div>
      {rate?.rate ? (
        <div className="rate-pair">
          <span className="rate-value">{formatRatePair(rate.rate)}</span>
          <span className="rate-inverse">{t.rate.inverse(formatRate(1 / rate.rate))}</span>
        </div>
      ) : (
        <span className="hint">{rate ? t.rate.unavailable : t.loading}</span>
      )}
    </div>
  );
}

export function Board(props: { active: boolean }) {
  const nav = useNav();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [items, setItems] = useState<ExchangeRequest[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  // Deals waiting on the viewer (the bot messages only about new and accepted deals), and
  // their requests about to leave the board.
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
      Promise.all([api.myDeals(), api.myRequests()]).then(
        ([deals, requests]) =>
          setActionCount(deals.filter(needsMyAction).length + requests.filter((r) => expiresSoon(r)).length),
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

  /** The tab is the currency the viewer wants to get by taking a request. */
  const setTab = (currency: Currency | null) => {
    // Amounts are in the currency you get, so they don't carry over between tabs; nor does
    // sorting by amount, which needs one currency.
    setMinText("");
    setMaxText("");
    setFilters((f) => ({
      ...f,
      direction: currency && boardDirection(currency),
      minAmount: null,
      maxAmount: null,
      sort: !currency && AMOUNT_SORTS.includes(f.sort) ? "newest" : f.sort,
    }));
  };

  const clearFilters = () => {
    setMinText("");
    setMaxText("");
    setFilters((f) => ({ ...f, minAmount: null, maxAmount: null, sort: "newest" }));
  };

  useMainButton(
    props.active ? { text: t.board.newRequest, onClick: () => nav.push({ name: "new" }) } : null,
  );

  const getting = filters.direction && giveCurrency(filters.direction);
  const sorts = getting ? BOARD_SORTS : BOARD_SORTS.filter((sort) => !AMOUNT_SORTS.includes(sort));
  const activeFilterCount =
    (filters.minAmount !== null || filters.maxAmount !== null ? 1 : 0) + (filters.sort !== "newest" ? 1 : 0);

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

      <RateCard rate={rate} />

      <Segmented<Currency | "all">
        options={[
          { value: "all", label: t.board.all },
          ...CURRENCIES.map((currency) => ({ value: currency, label: t.buy[currency] })),
        ]}
        value={getting ?? "all"}
        onChange={(value) => setTab(value === "all" ? null : value)}
      />

      <div className="toolbar">
        <button
          type="button"
          className={showFilters || activeFilterCount > 0 ? "chip-button on" : "chip-button"}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FiltersIcon />
          {t.board.filters}
          {activeFilterCount > 0 && <span className="chip-count">{activeFilterCount}</span>}
        </button>
        <RefreshButton onRefresh={refresh} />
      </div>

      {showFilters && (
        <div className="filters">
          <div className="field">
            <span className="field-label">{t.board.sortBy}</span>
            <Segmented
              label={t.board.sortBy}
              options={sorts.map((sort) => ({ value: sort, label: t.board.sort[sort] }))}
              value={filters.sort}
              onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
            />
          </div>
          {getting ? (
            <div className="field">
              <span className="field-label">{t.board.amount(getting)}</span>
              <div className="field-row">
                <AmountInput
                  label={t.board.from}
                  placeholder={t.board.any}
                  value={minText}
                  onChange={setMinText}
                  suffix={SYMBOL[getting]}
                />
                <AmountInput
                  label={t.board.to}
                  placeholder={t.board.any}
                  value={maxText}
                  onChange={setMaxText}
                  suffix={SYMBOL[getting]}
                />
              </div>
            </div>
          ) : (
            <p className="hint small">{t.board.amountNeedsDirection}</p>
          )}
          {activeFilterCount > 0 && (
            <button type="button" className="link-button small" onClick={clearFilters}>
              {t.board.clear}
            </button>
          )}
        </div>
      )}

      {error && <ErrorBox code={error} onRetry={() => void load(shownCount.current)} />}
      {!items && !error && <SkeletonList />}
      {items && items.length === 0 && (
        <Empty
          title={activeFilterCount > 0 ? t.board.emptyFiltered : t.board.empty}
          hint={t.board.emptyHint}
        />
      )}
      {items && items.length > 0 && (
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

import { useCallback, useEffect, useRef, useState } from "react";
import { api, BOARD_PAGE_SIZE, errorCode } from "../api";
import { BellIcon, DealsIcon, FiltersIcon, ProfileIcon, SortOrderIcon } from "../components/icons";
import { RequestCard } from "../components/RequestCard";
import { Collapse, Empty, ErrorBox, RefreshButton, Segmented, SkeletonList, useTabEnter } from "../components/ui";
import { formatKstShort, formatRate, formatRatePair, formatSide } from "../format";
import { errorMessage, t } from "../i18n";
import { useMe, useSetMe } from "../me";
import { loadMyLists } from "../myLists";
import { useNav, useReactivated } from "../nav";
import { SLOW_POLL_MS, usePolling } from "../polling";
import { alert, confirm, haptic, openLink, useMainButton } from "../telegram";
import {
  alertsOn,
  BOARD_SORTS,
  type BoardFilters,
  boardDirection,
  canRespond,
  type Currency,
  CURRENCIES,
  type ExchangeRequest,
  expiresSoon,
  giveCurrency,
  mayRespond,
  needsMyAction,
  type Rate,
  takesCounterOffers,
  viewerSides,
} from "../types";

// By the `source` the backend stores with the rate.
const RATE_SOURCE_URLS: Partial<Record<string, string>> = {
  "currency-api": "https://github.com/fawazahmed0/exchange-api",
  "open.er-api.com": "https://www.exchangerate-api.com",
};
const MAX_RELOAD = 100; // the API's page size limit

/** A loaded page of the board, and the filters it's for. */
interface Results {
  filters: BoardFilters;
  items: ExchangeRequest[];
}

// Opens on Buy KRW: most people on the board are in Korea and need won.
const DEFAULT_FILTERS: BoardFilters = {
  direction: boardDirection("KRW"),
  sort: "date",
  order: "desc",
};

function RateCard(props: { rate: Rate | null }) {
  const { rate } = props;
  const sourceUrl = rate?.source ? RATE_SOURCE_URLS[rate.source] : undefined;
  const sourceLabel = rate?.source ? t.rate.attribution[rate.source] : undefined;
  return (
    <div className="rate-card">
      <div className="rate-head">
        <span className="rate-title">{t.rate.title}</span>
        {rate?.fetched_at && (
          <span className="hint small">
            {formatKstShort(rate.fetched_at)}
            {sourceUrl && sourceLabel && (
              <>
                {" · "}
                <button type="button" className="link-button" onClick={() => openLink(sourceUrl)}>
                  {sourceLabel}
                </button>
              </>
            )}
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

/** Which panel is open under the toolbar. */
type Panel = "filters" | "alerts";

/**
 * Turns alerts about new requests in the current tab on or off. The switch flips at once; if
 * saving fails, it flips back.
 */
function AlertsPanel(props: { getting: Currency }) {
  const me = useMe();
  const setMe = useSetMe();
  const on = alertsOn(me, props.getting);
  const change = async (value: "on" | "off") => {
    const field = props.getting === "KRW" ? "buy_krw" : "buy_kzt";
    setMe({ ...me, [`alerts_${field}`]: value === "on" });
    try {
      setMe(await api.updateAlerts({ [field]: value === "on" }));
    } catch (e) {
      setMe(me);
      haptic("error");
      await alert(errorMessage(errorCode(e)));
    }
  };
  return (
    <div className="filters">
      <div className="field">
        <span className="field-label">{t.board.alertsFor(t.buy[props.getting])}</span>
        <Segmented
          label={t.board.alertsFor(t.buy[props.getting])}
          options={(["off", "on"] as const).map((value) => ({ value, label: t.board.alertsState[value] }))}
          value={on ? "on" : "off"}
          onChange={(value) => void change(value)}
        />
      </div>
      <p className="hint small">{t.board.alertsHint}</p>
    </div>
  );
}

/**
 * A request on the board, with Counter offer (if its author takes them) and Take request under it
 * while the viewer can respond. Without a username or profile, both open the request, which says
 * what's missing.
 */
function BoardCard(props: {
  request: ExchangeRequest;
  busy: boolean;
  disabled: boolean;
  onTake: () => void;
}) {
  const me = useMe();
  const nav = useNav();
  const { request } = props;
  const open = () => nav.push({ name: "request", id: request.id });
  const card = <RequestCard request={request} onOpen={open} />;
  if (!canRespond(request)) return card;
  const ready = mayRespond(me);
  return (
    <div className="card-stack">
      {card}
      <div className="card-actions">
        {props.busy ? (
          <button type="button" className="card-action" disabled>
            {t.loading}
          </button>
        ) : (
          <>
            {takesCounterOffers(request) && (
              <button
                type="button"
                className="card-action neutral"
                disabled={props.disabled}
                onClick={() => (ready ? nav.push({ name: "counter", request }) : open())}
              >
                {t.board.counterOffer}
              </button>
            )}
            <button
              type="button"
              className="card-action neutral strong"
              disabled={props.disabled}
              onClick={() => (ready ? props.onTake() : open())}
            >
              {t.board.take}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Board(props: { active: boolean }) {
  const nav = useNav();
  const me = useMe();
  const setMe = useSetMe();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [shown, setShown] = useState<Results | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  // Deals waiting on the viewer (the bot messages only about new and accepted deals), and
  // their requests about to leave the board.
  const [actionCount, setActionCount] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  // The request being taken from its card.
  const [taking, setTaking] = useState<number | null>(null);

  // Responses to superseded loads (e.g. after a filter change) are ignored.
  const loadSeq = useRef(0);
  const shownCount = useRef(0);
  shownCount.current = shown?.items.length ?? 0;

  /** A quiet load (polling) keeps the list if it fails; the next one retries. */
  const load = useCallback(
    async (count: number, quiet = false) => {
      const seq = ++loadSeq.current;
      const limit = Math.min(Math.max(count, BOARD_PAGE_SIZE), MAX_RELOAD);
      try {
        const page = await api.board(filters, 0, limit);
        if (seq !== loadSeq.current) return;
        setShown({ filters, items: page });
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
      loadMyLists().then(
        ({ deals, requests }) =>
          setActionCount(deals.filter(needsMyAction).length + requests.filter((r) => expiresSoon(r)).length),
        () => undefined, // keep the last count
      ),
    [],
  );

  // New filters: what's shown stays up until their results are in (see `stale`).
  useEffect(() => {
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

  const take = async (request: ExchangeRequest) => {
    if (taking !== null) return;
    const { pay, get } = viewerSides(request);
    if (!(await confirm(t.detail.takeConfirm(formatSide(get), formatSide(pay))))) return;
    setTaking(request.id);
    try {
      const deal = await api.takeRequest(request.id);
      haptic("success");
      nav.push({ name: "deal", id: deal.id });
    } catch (e) {
      haptic("error");
      // A popup: the card may be far down the list, away from any inline message.
      await alert(errorMessage(errorCode(e)));
    } finally {
      setTaking(null);
      void load(shownCount.current, true);
    }
  };

  const loadMore = async () => {
    if (!shown) return;
    const seq = loadSeq.current;
    setLoadingMore(true);
    try {
      const page = await api.board(filters, shown.items.length);
      if (seq !== loadSeq.current) return;
      // New requests may shift pages; skip any already shown.
      const seen = new Set(shown.items.map((item) => item.id));
      setShown({ ...shown, items: [...shown.items, ...page.filter((item) => !seen.has(item.id))] });
      setHasMore(page.length === BOARD_PAGE_SIZE);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorCode(e));
    } finally {
      setLoadingMore(false);
    }
  };

  /** The tab is the currency the viewer wants to get by taking a request; the sort carries over. */
  const setTab = (currency: Currency) => setFilters((f) => ({ ...f, direction: boardDirection(currency) }));

  const clearSort = () => setFilters((f) => ({ ...f, sort: DEFAULT_FILTERS.sort, order: DEFAULT_FILTERS.order }));

  useMainButton(
    props.active ? { text: t.board.newRequest, onClick: () => nav.push({ name: "new" }) } : null,
  );

  const togglePanel = (next: Panel) => setPanel(panel === next ? null : next);

  const toggleAlerts = () => {
    togglePanel("alerts");
    // The first look at the panel clears the "new" dot, for good (kept on the server).
    if (!me.alerts_seen) {
      setMe({ ...me, alerts_seen: true });
      api.updateAlerts({}).then(setMe, () => undefined); // the dot comes back next launch
    }
  };

  const getting = giveCurrency(filters.direction);
  const alerting = alertsOn(me, getting);
  const sorted = filters.sort !== DEFAULT_FILTERS.sort || filters.order !== DEFAULT_FILTERS.order;
  // Results for the previous tab or filters, while the new ones load. If that fails, they're
  // hidden rather than passed off as the new ones.
  const stale = shown !== null && shown.filters !== filters;
  const results = stale && error ? null : shown;
  // New results for another tab slide in from its side; for a new sort, they fade in.
  const resultsKey = results ? `${results.filters.direction}-${results.filters.sort}-${results.filters.order}` : null;
  const tabEnter = useTabEnter(
    resultsKey,
    results ? CURRENCIES.indexOf(giveCurrency(results.filters.direction)) : 0,
  );

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

      <Segmented
        options={CURRENCIES.map((currency) => ({ value: currency, label: t.buy[currency] }))}
        value={getting}
        onChange={setTab}
      />

      <div className="toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className={panel === "filters" || sorted ? "chip-button on" : "chip-button"}
            aria-expanded={panel === "filters"}
            onClick={() => togglePanel("filters")}
          >
            <FiltersIcon />
            {t.board.filters}
          </button>
          <button
            type="button"
            className={panel === "alerts" || alerting ? "chip-button on" : "chip-button"}
            aria-expanded={panel === "alerts"}
            onClick={toggleAlerts}
          >
            <BellIcon on={alerting} />
            {t.board.alerts}
            {!me.alerts_seen && <span className="new-dot" aria-label={t.board.alertsNew} />}
          </button>
        </div>
        <RefreshButton onRefresh={refresh} />
      </div>

      <Collapse open={panel === "alerts"}>
        <AlertsPanel getting={getting} />
      </Collapse>

      <Collapse open={panel === "filters"}>
        <div className="filters">
          <div className="field">
            <div className="sort-head">
              <span className="field-label">{t.board.sortBy}</span>
              <button
                type="button"
                className="sort-order-button"
                onClick={() => {
                  haptic("selection");
                  setFilters((f) => ({ ...f, order: f.order === "desc" ? "asc" : "desc" }));
                }}
              >
                <SortOrderIcon up={filters.order === "asc"} />
                {t.board.order[filters.sort][filters.order]}
              </button>
            </div>
            <Segmented
              label={t.board.sortBy}
              options={BOARD_SORTS.map((sort) => ({ value: sort, label: t.board.sort[sort] }))}
              value={filters.sort}
              onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
            />
          </div>
          <Collapse open={sorted}>
            <button type="button" className="link-button small" onClick={clearSort}>
              {t.board.clear}
            </button>
          </Collapse>
        </div>
      </Collapse>

      {error && <ErrorBox code={error} onRetry={() => void load(shownCount.current)} />}
      {!shown && !error && <SkeletonList />}
      {results && (
        // Stays up for new filters (dimmed while they load). What's inside is keyed by the
        // filters it's for, so new results slide in while a reload of the same ones doesn't.
        <div className={stale ? "results stale" : "results"} aria-busy={stale}>
          {results.items.length === 0 ? (
            <Empty key={resultsKey} title={t.board.empty} hint={t.board.emptyHint} />
          ) : (
            <div key={resultsKey} className={`list tab-content ${tabEnter}`}>
              {results.items.map((item) => (
                <BoardCard
                  key={item.id}
                  request={item}
                  busy={taking === item.id}
                  disabled={taking !== null}
                  onTake={() => void take(item)}
                />
              ))}
            </div>
          )}
          {hasMore && (
            <button type="button" className="secondary-button" disabled={loadingMore || stale} onClick={loadMore}>
              {loadingMore ? t.loading : t.board.loadMore}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

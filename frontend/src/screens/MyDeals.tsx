import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { type CardStatus, RequestCard } from "../components/RequestCard";
import { ChevronIcon } from "../components/icons";
import { Collapse, Empty, ErrorBox, SkeletonList, TitleWithRefresh } from "../components/ui";
import { askExtendDays } from "../extend";
import { acceptQuestion } from "./Deal";
import { timeLeft } from "../format";
import { t } from "../i18n";
import { lastMyLists, loadMyLists, type MyLists } from "../myLists";
import { useNav, useReactivated } from "../nav";
import { FAST_POLL_MS, usePolling } from "../polling";
import { confirm, haptic } from "../telegram";
import {
  canCancelOffer,
  type Deal,
  dealTerms,
  dealWhole,
  type ExchangeRequest,
  expiresSoon,
  extendOptions,
  isActiveDeal,
  needsMyAction,
  sortDeals,
} from "../types";

/** "Counter offer · …" on a counter offer's card. */
function marked(deal: Deal, text: string): string {
  return deal.partial ? t.myDeals.counter(text) : text;
}

/**
 * The status line on a deal's card. Completed and declined deals are grouped under their status,
 * so it isn't repeated on each; cancelled ones share a group with declined ones, so they say so.
 */
function dealStatus(deal: Deal): CardStatus | null {
  if (needsMyAction(deal)) {
    const text = deal.status === "pending" ? t.deal.needsAnswer : t.deal.needsConfirm;
    return { text: marked(deal, text), tone: "action" };
  }
  if (deal.status === "cancelled") return { text: t.dealStatus.cancelled, tone: "muted" };
  return isActiveDeal(deal) ? { text: marked(deal, t.dealStatus[deal.status]), tone: "active" } : null;
}

/** On the author's own request: someone took it, or it's about to leave the board. */
function ownRequestStatus(request: ExchangeRequest, taker: Deal | undefined): CardStatus | null {
  if (taker) return { text: marked(taker, t.deal.needsAnswer), tone: "action" };
  const left = timeLeft(request.expires_at);
  return left && expiresSoon(request) ? { text: t.myDeals.expiresSoon(left), tone: "action" } : null;
}

/**
 * The first one to take the viewer's own request among those still waiting for an answer: its
 * card opens that deal (after answering it, the next one's up). Deals come most recent first.
 */
function firstTaker(deals: Deal[], requestId: number): Deal | undefined {
  return deals
    .filter((deal) => deal.role === "author" && deal.status === "pending" && deal.request.id === requestId)
    .at(-1);
}

/** An active deal, or one of the viewer's requests on the board with whoever took it first. */
type ActiveItem = { deal: Deal } | { request: ExchangeRequest; taker: Deal | undefined };

function Group(props: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{props.title}</h2>
      <div className="list">{props.children}</div>
    </section>
  );
}

// Whether the viewer folded the Completed or Declined list, remembered on this device.
const FOLDED_KEYS = {
  completed: "myDeals.completedFolded",
  declined: "myDeals.declinedFolded",
} as const;

function readFolded(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A group the viewer can hide and show by tapping its title, which shows how many it holds. The
 * choice is remembered under `storageKey`.
 */
function FoldableGroup(props: { title: string; count: number; storageKey: string; children: ReactNode }) {
  const [folded, setFolded] = useState(() => readFolded(props.storageKey));
  const toggle = () => {
    haptic("selection");
    setFolded(!folded);
    try {
      localStorage.setItem(props.storageKey, folded ? "0" : "1");
    } catch {
      // Not remembered then; it still folds.
    }
  };
  return (
    <section className="section">
      <button type="button" className="section-title section-toggle" aria-expanded={!folded} onClick={toggle}>
        <span>
          {props.title} · {props.count}
        </span>
        <span className="section-toggle-hint">
          {folded ? t.myDeals.show : t.myDeals.hide}
          <ChevronIcon open={!folded} />
        </span>
      </button>
      <Collapse open={!folded}>
        <div className="list">{props.children}</div>
      </Collapse>
    </section>
  );
}

/**
 * Every deal the viewer is part of, on either side, and their requests on the board. Active
 * first: deals in progress (highlighted), then what's waiting on the viewer, then the rest.
 * Each request on the board shows up once, with Extend and Cancel: the deals of people who
 * took it are answered from it rather than listed apart; the viewer's own offers waiting for an
 * answer can be cancelled from theirs. Then completed deals, then declined and cancelled ones;
 * last, their requests that expired in the last day (which they can post again).
 */
export function MyDeals(props: { active: boolean }) {
  const nav = useNav();
  // What the Board last loaded shows right away, rather than a placeholder that the lists
  // replace a moment later (a flicker); it's refreshed at once.
  const [lists, setLists] = useState<MyLists | null>(lastMyLists);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // What an action is running on: a request (extend or cancel) or a deal (accept, decline or
  // cancel the offer).
  const [busy, setBusy] = useState<string | null>(null);
  // Responses to superseded loads are ignored.
  const loadSeq = useRef(0);

  /** A quiet load (polling) keeps what's shown if it fails; the next one retries. */
  const fetchLists = useCallback(async (quiet: boolean) => {
    const seq = ++loadSeq.current;
    if (!quiet) setError(null);
    try {
      const loaded = await loadMyLists();
      if (seq === loadSeq.current) setLists(loaded);
    } catch (e) {
      if (seq === loadSeq.current && !quiet) setError(errorCode(e));
    }
  }, []);
  const load = useCallback(() => fetchLists(false), [fetchLists]);

  useEffect(() => {
    void load();
  }, [load]);

  useReactivated(props.active, load);
  usePolling(props.active, FAST_POLL_MS, () => fetchLists(true));

  /** Runs `action`, then `onDone` if it worked, and reloads the lists either way. */
  const runAction = async (key: string, action: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      haptic("success");
      onDone?.();
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    }
    await load();
    setBusy(null);
  };

  const cancelRequest = async (id: number) => {
    if (busy !== null || !(await confirm(t.cancelRequest.confirm))) return;
    await runAction(`request-${id}`, () => api.closeRequest(id));
  };

  const cancelOffer = async (deal: Deal) => {
    if (busy !== null || !(await confirm(t.deal.cancelOfferConfirm(deal.request.offers_left ?? 0)))) return;
    await runAction(`deal-${deal.id}`, () => api.dealAction(deal.id, "cancel"));
  };

  // Accepting opens the deal: that's where the contacts and where to pay are.
  const acceptDeal = async (deal: Deal) => {
    if (busy !== null || !(await confirm(acceptQuestion(deal)))) return;
    await runAction(
      `deal-${deal.id}`,
      () => api.dealAction(deal.id, "accept"),
      () => nav.push({ name: "deal", id: deal.id }),
    );
  };

  const declineDeal = async (deal: Deal) => {
    if (busy !== null || !(await confirm(t.deal.declineConfirm))) return;
    await runAction(`deal-${deal.id}`, () => api.dealAction(deal.id, "decline"));
  };

  /** Accept and Decline: their own buttons, floating under the card of a deal waiting for the viewer's answer. */
  const answerActions = (deal: Deal) => (
    <div className="answer-actions">
      {busy === `deal-${deal.id}` ? (
        <button type="button" className="answer-button" disabled>
          {t.loading}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="answer-button accept"
            disabled={busy !== null}
            onClick={() => void acceptDeal(deal)}
          >
            {t.deal.accept}
          </button>
          <button
            type="button"
            className="answer-button decline"
            disabled={busy !== null}
            onClick={() => void declineDeal(deal)}
          >
            {t.deal.decline}
          </button>
        </>
      )}
    </div>
  );

  const extendRequest = async (request: ExchangeRequest) => {
    if (busy !== null) return;
    const days = await askExtendDays(request);
    if (days !== null) {
      await runAction(`request-${request.id}`, () => api.updateRequest(request.id, { extend_days: days }));
    }
  };

  const dealCard = (deal: Deal) => {
    const card = (
      <RequestCard
        key={deal.id}
        request={dealTerms(deal)}
        whole={dealWhole(deal)}
        status={dealStatus(deal)}
        highlight={deal.status === "accepted"}
        profile={deal.other_profile}
        deals={deal.other_completed_deals}
        time={deal.status === "pending"}
        onOpen={() => nav.push({ name: "deal", id: deal.id })}
      />
    );
    if (deal.role === "author" && deal.status === "pending") {
      return (
        <div key={deal.id} className="answer-stack">
          {card}
          {answerActions(deal)}
        </div>
      );
    }
    if (!canCancelOffer(deal)) return card;
    return (
      <div key={deal.id} className="card-stack">
        {card}
        <button
          type="button"
          className="card-action"
          disabled={busy !== null}
          onClick={() => void cancelOffer(deal)}
        >
          {busy === `deal-${deal.id}` ? t.loading : t.deal.cancelOffer}
        </button>
      </div>
    );
  };

  const requestCard = (request: ExchangeRequest, taker: Deal | undefined) => (
    <div key={`request-${request.id}`} className="answer-stack">
      <div className="card-stack">
        <RequestCard
          // Someone's counter offer waiting for an answer: what it asks for, over the whole request.
          request={taker?.partial ? dealTerms(taker) : request}
          whole={taker?.partial ? request : null}
          status={ownRequestStatus(request, taker)}
          profile={taker ? taker.other_profile : undefined}
          deals={taker ? taker.other_completed_deals : undefined}
          onOpen={() => nav.push(taker ? { name: "deal", id: taker.id } : { name: "request", id: request.id })}
        />
        <div className="card-actions">
          {busy === `request-${request.id}` ? (
            <button type="button" className="card-action" disabled>
              {t.loading}
            </button>
          ) : (
            <>
              {extendOptions(request).length > 0 && (
                <button
                  type="button"
                  className="card-action neutral"
                  disabled={busy !== null}
                  onClick={() => void extendRequest(request)}
                >
                  {t.extend.button}
                </button>
              )}
              <button
                type="button"
                className="card-action"
                disabled={busy !== null}
                onClick={() => void cancelRequest(request.id)}
              >
                {t.cancelRequest.button}
              </button>
            </>
          )}
        </div>
      </div>
      {taker && answerActions(taker)}
    </div>
  );

  const deals = lists ? sortDeals(lists.deals) : [];
  const completed = deals.filter((deal) => deal.status === "completed");
  const declined = deals.filter((deal) => deal.status === "declined" || deal.status === "cancelled");
  const onBoard = lists?.requests.filter((request) => request.status === "open") ?? [];
  const expired = lists?.requests.filter((request) => request.status === "expired") ?? [];
  const onBoardIds = new Set(onBoard.map((request) => request.id));

  // Pending deals on a request on the board are answered from its card. (Closing a request
  // declines them, so they're all there; any other one keeps its own card, just in case.)
  // Accepted counter offers on it are listed as deals of their own.
  const rank = (item: ActiveItem) => {
    if ("deal" in item) return item.deal.status === "accepted" ? 0 : needsMyAction(item.deal) ? 1 : 2;
    return item.taker || expiresSoon(item.request) ? 1 : 3;
  };
  const active: ActiveItem[] = [
    ...deals
      .filter(
        (deal) =>
          isActiveDeal(deal) &&
          !(deal.status === "pending" && deal.role === "author" && onBoardIds.has(deal.request.id)),
      )
      .map((deal) => ({ deal })),
    ...onBoard.map((request) => ({ request, taker: firstTaker(lists?.deals ?? [], request.id) })),
  ].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="screen">
      <TitleWithRefresh title={t.myDeals.title} onRefresh={load} />
      {error && <ErrorBox code={error} onRetry={load} />}
      {actionError && <ErrorBox code={actionError} />}
      {!lists && !error && <SkeletonList count={2} />}
      {lists && deals.length === 0 && lists.requests.length === 0 && (
        <Empty title={t.myDeals.empty} hint={t.myDeals.emptyHint} />
      )}

      {lists && (active.length > 0 || deals.length > 0) && (
        <Group title={t.myDeals.active}>
          {active.length > 0 ? (
            active.map((item) => ("deal" in item ? dealCard(item.deal) : requestCard(item.request, item.taker)))
          ) : (
            <p className="hint small section-note">{t.myDeals.noActive}</p>
          )}
        </Group>
      )}
      {completed.length > 0 && (
        <FoldableGroup title={t.myDeals.completed} count={completed.length} storageKey={FOLDED_KEYS.completed}>
          {completed.map(dealCard)}
        </FoldableGroup>
      )}
      {declined.length > 0 && (
        <FoldableGroup title={t.myDeals.declined} count={declined.length} storageKey={FOLDED_KEYS.declined}>
          {declined.map(dealCard)}
        </FoldableGroup>
      )}
      {expired.length > 0 && (
        <Group title={t.myDeals.expired}>
          {expired.map((request) => (
            <div key={request.id} className="card-stack">
              <RequestCard
                request={request}
                status={{ text: t.status.expired, tone: "muted" }}
                onOpen={() => nav.push({ name: "request", id: request.id })}
              />
              <button
                type="button"
                className="card-action neutral"
                onClick={() => nav.push({ name: "new", prefill: request })}
              >
                {t.detail.postAgain}
              </button>
            </div>
          ))}
        </Group>
      )}
    </div>
  );
}

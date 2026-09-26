import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { RequestCard } from "../components/RequestCard";
import { ErrorBox, Loading, TitleWithRefresh } from "../components/ui";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import { FAST_POLL_MS, usePolling } from "../polling";
import { confirm, haptic } from "../telegram";
import { type Deal, type ExchangeRequest, isActiveDeal, needsMyAction, sortDeals } from "../types";

function statusLine(deal: Deal): string {
  let status: string = t.dealStatus[deal.status];
  if (needsMyAction(deal)) status = deal.status === "pending" ? t.deal.needsAnswer : t.deal.needsConfirm;
  return `${t.dealRole[deal.role]} · ${status}`;
}

interface Lists {
  deals: Deal[];
  /** The viewer's own requests on the board. */
  requests: ExchangeRequest[];
}

function Group(props: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{props.title}</h2>
      <div className="list">{props.children}</div>
    </section>
  );
}

/**
 * The viewer's requests on the board (which they can cancel), then every deal they're part
 * of, on either side: active ones (in progress first, highlighted), completed, declined.
 */
export function MyDeals(props: { active: boolean }) {
  const nav = useNav();
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  // Responses to superseded loads are ignored.
  const loadSeq = useRef(0);

  /** A quiet load (polling) keeps what's shown if it fails; the next one retries. */
  const fetchLists = useCallback(async (quiet: boolean) => {
    const seq = ++loadSeq.current;
    if (!quiet) setError(null);
    try {
      const [deals, requests] = await Promise.all([api.myDeals(), api.myRequests()]);
      if (seq === loadSeq.current) setLists({ deals, requests });
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

  const cancelRequest = async (id: number) => {
    if (cancelling !== null || !(await confirm(t.cancelRequest.confirm))) return;
    setCancelling(id);
    setActionError(null);
    try {
      await api.closeRequest(id);
      haptic("success");
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    }
    await load();
    setCancelling(null);
  };

  const dealCard = (deal: Deal) => (
    <RequestCard
      key={deal.id}
      request={deal.request}
      status={statusLine(deal)}
      highlight={deal.status === "accepted"}
      onOpen={() => nav.push({ name: "deal", id: deal.id })}
    />
  );

  const deals = lists ? sortDeals(lists.deals) : [];
  const active = deals.filter(isActiveDeal);
  const completed = deals.filter((deal) => deal.status === "completed");
  const declined = deals.filter((deal) => deal.status === "declined");

  return (
    <div className="screen">
      <TitleWithRefresh title={t.myDeals.title} onRefresh={load} />
      {error && <ErrorBox code={error} onRetry={load} />}
      {actionError && <ErrorBox code={actionError} />}
      {!lists && !error && <Loading />}
      {lists && deals.length === 0 && lists.requests.length === 0 && (
        <div className="empty">
          <p>{t.myDeals.empty}</p>
          <p className="hint">{t.myDeals.emptyHint}</p>
        </div>
      )}

      {lists && lists.requests.length > 0 && (
        <Group title={t.myDeals.onBoard}>
          {lists.requests.map((request) => (
            <div key={request.id} className="card-stack">
              <RequestCard request={request} onOpen={() => nav.push({ name: "request", id: request.id })} />
              <button
                type="button"
                className="card-action"
                disabled={cancelling !== null}
                onClick={() => void cancelRequest(request.id)}
              >
                {cancelling === request.id ? t.loading : t.cancelRequest.button}
              </button>
            </div>
          ))}
        </Group>
      )}
      {lists && deals.length > 0 && (
        <Group title={t.myDeals.active}>
          {active.length > 0 ? active.map(dealCard) : <p className="hint small">{t.myDeals.noActive}</p>}
        </Group>
      )}
      {completed.length > 0 && <Group title={t.myDeals.completed}>{completed.map(dealCard)}</Group>}
      {declined.length > 0 && <Group title={t.myDeals.declined}>{declined.map(dealCard)}</Group>}
    </div>
  );
}

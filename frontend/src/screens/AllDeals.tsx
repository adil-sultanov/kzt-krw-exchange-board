import { useState } from "react";
import { api, errorCode } from "../api";
import { displayName, Person } from "../components/AdminPerson";
import { Empty, ErrorBox, Segmented, SkeletonList, TitleWithRefresh, useTabEnter } from "../components/ui";
import { formatKst, formatMoney, requestStatus } from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useTabList } from "../tabList";
import { confirm, haptic } from "../telegram";
import { type CancelledRequest, getCurrency, giveCurrency, type ListedDeal } from "../types";

type Tab = "active" | "finished" | "cancelled";

function isCancelled(item: ListedDeal | CancelledRequest): item is CancelledRequest {
  return "close_reason" in item;
}

function DealCard(props: { deal: ListedDeal; busy: boolean; onDelete: (() => void) | null }) {
  const { deal, busy } = props;
  const { request } = deal;
  return (
    <div className="card">
      <div className="admin-head">
        <strong>
          {t.admin.deal(deal.id)} · {t.dealStatus[deal.status]}
          {deal.partial && ` · ${t.admin.counterOffer}`}
        </strong>
        <span className="hint small">{formatKst(deal.updated_at)}</span>
      </div>
      <p className="small">
        {t.admin.request(request.id)} · {formatMoney(request.amount, giveCurrency(request.direction))} ·{" "}
        {requestStatus(request)}
        {deal.status === "accepted" && (
          <>
            <br />
            <span className="hint">
              {t.admin.paid(t.admin.author, deal.author_confirmed)} ·{" "}
              {t.admin.paid(t.admin.responder, deal.responder_confirmed)}
            </span>
          </>
        )}
      </p>
      <Person user={deal.author} role={t.admin.author} />
      <Person user={deal.responder} role={t.admin.responder} />
      {props.onDelete && (
        <button type="button" className="secondary-button destructive" disabled={busy} onClick={props.onDelete}>
          {t.allDeals.delete}
        </button>
      )}
    </div>
  );
}

/** Who took it off the board, and how. */
function closedBy(request: CancelledRequest): string {
  if (!request.close_reason) return t.allDeals.closedUnknown;
  // Only requests closed before admins were recorded lack one (migration 010).
  if (!request.closed_by) return request.close_reason === "author" ? t.status.closed : t.allDeals.closedByAdmin;
  return t.allDeals.closedBy[request.close_reason](displayName(request.closed_by));
}

function CancelledCard(props: { request: CancelledRequest }) {
  const { request } = props;
  const byAdmin = request.closed_by !== null && request.close_reason !== "author";
  return (
    <div className="card">
      <div className="admin-head">
        <strong>{t.admin.request(request.id)}</strong>
        <span className="hint small">{t.allDeals.closedAt(formatKst(request.closed_at))}</span>
      </div>
      <p className="small">
        <strong>{closedBy(request)}</strong>
        <br />
        {t.allDeals.authorPays(
          formatMoney(request.amount, giveCurrency(request.direction)),
          getCurrency(request.direction),
        )}
        {request.open_reports > 0 && (
          <>
            <br />
            <span className="rate-tag worse">{t.admin.reportsOnRequest(request.open_reports)}</span>
          </>
        )}
      </p>
      <Person label={t.boardRequests.author} user={request.author} />
      {byAdmin && request.closed_by && <Person label={t.allDeals.closer} user={request.closed_by} />}
      {request.takers.length > 0 && (
        <>
          <span className="hint small">{t.allDeals.takers(request.takers.length)}</span>
          {request.takers.map((taker) => (
            <Person key={taker.telegram_id} user={taker} />
          ))}
        </>
      )}
    </div>
  );
}

const HINTS: Record<Tab, string> = {
  active: t.allDeals.activeHint,
  finished: t.allDeals.finishedHint,
  cancelled: t.allDeals.cancelledHint,
};

const TABS: Tab[] = ["active", "finished", "cancelled"];

function load(tab: Tab): Promise<(ListedDeal | CancelledRequest)[]> {
  return tab === "cancelled" ? api.cancelledRequests() : api.allDeals(tab === "active");
}

/** Admins see every deal, and every request taken off the board; the owner can delete stuck deals. */
export function AllDeals(props: { active: boolean }) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("active");
  const list = useTabList(tab, load, props.active);
  const { items } = list;
  const tabEnter = useTabEnter(list.shownTab, list.shownTab ? TABS.indexOf(list.shownTab) : 0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (deal: ListedDeal) => {
    if (busy || !(await confirm(t.allDeals.deleteConfirm(deal.id, deal.status === "accepted" && !deal.partial)))) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteDeal(deal.id);
      haptic("success");
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    } finally {
      setBusy(false);
      void list.load();
    }
  };

  return (
    <div className="screen">
      <TitleWithRefresh title={t.allDeals.title} onRefresh={list.load} />
      <Segmented
        options={TABS.map((value) => ({ value, label: t.allDeals[value] }))}
        value={tab}
        onChange={setTab}
      />
      <p className="hint small">{HINTS[tab]}</p>
      {actionError && <ErrorBox code={actionError} />}
      {list.error && <ErrorBox code={list.error} onRetry={() => void list.load()} />}
      {list.loading && <SkeletonList />}
      {items && (
        // Stays up for a new tab (see useTabList); what's inside is keyed by its tab and slides in.
        <div className={list.stale ? "results stale" : "results"} aria-busy={list.stale}>
          {items.length === 0 ? (
            <Empty key={list.shownTab} title={tab === "cancelled" ? t.allDeals.emptyCancelled : t.allDeals.empty} />
          ) : (
            <div key={list.shownTab} className={`list tab-content ${tabEnter}`}>
              {items.map((item) =>
                isCancelled(item) ? (
                  <CancelledCard key={`request-${item.id}`} request={item} />
                ) : (
                  <DealCard
                    key={`deal-${item.id}`}
                    deal={item}
                    busy={busy}
                    onDelete={me.is_owner ? () => void remove(item) : null}
                  />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

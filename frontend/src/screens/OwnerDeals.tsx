import { useState } from "react";
import { api, errorCode } from "../api";
import { Person } from "../components/AdminPerson";
import { Empty, ErrorBox, Segmented, SkeletonList, TitleWithRefresh } from "../components/ui";
import { formatKst, formatMoney } from "../format";
import { t } from "../i18n";
import { useTabList } from "../tabList";
import { confirm, haptic } from "../telegram";
import { giveCurrency, type OwnerDeal } from "../types";

type Tab = "active" | "finished";

function DealCard(props: { deal: OwnerDeal; busy: boolean; onDelete: () => void }) {
  const { deal, busy } = props;
  const { request } = deal;
  return (
    <div className="card">
      <div className="admin-head">
        <strong>
          {t.admin.deal(deal.id)} · {t.dealStatus[deal.status]}
        </strong>
        <span className="hint small">{formatKst(deal.updated_at)}</span>
      </div>
      <p className="small">
        {t.admin.request(request.id)} · {formatMoney(request.amount, giveCurrency(request.direction))} ·{" "}
        {t.status[request.status]}
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
      <button type="button" className="secondary-button destructive" disabled={busy} onClick={props.onDelete}>
        {t.ownerDeals.delete}
      </button>
    </div>
  );
}

/** The owner's view of every deal, to delete stuck ones. */
export function OwnerDeals(props: { active: boolean }) {
  const [tab, setTab] = useState<Tab>("active");
  const list = useTabList(tab, (tab) => api.ownerDeals(tab === "active"), props.active);
  const { items: deals, load } = list;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (deal: OwnerDeal) => {
    if (busy || !(await confirm(t.ownerDeals.deleteConfirm(deal.id, deal.status === "accepted")))) return;
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
      void load();
    }
  };

  return (
    <div className="screen">
      <TitleWithRefresh title={t.ownerDeals.title} onRefresh={load} />
      <Segmented
        options={[
          { value: "active", label: t.ownerDeals.active },
          { value: "finished", label: t.ownerDeals.finished },
        ]}
        value={tab}
        onChange={setTab}
      />
      <p className="hint small">{tab === "active" ? t.ownerDeals.activeHint : t.ownerDeals.finishedHint}</p>
      {actionError && <ErrorBox code={actionError} />}
      {list.error && <ErrorBox code={list.error} onRetry={() => void load()} />}
      {list.loading && <SkeletonList />}
      {deals && (
        // Updates in place (see useTabList): remounting it would replay its fade-in.
        <div className={list.stale ? "results stale" : "results"} aria-busy={list.stale}>
          {deals.length === 0 ? (
            <Empty title={t.ownerDeals.empty} />
          ) : (
            <div className="list">
              {deals.map((deal) => (
                <DealCard key={deal.id} deal={deal} busy={busy} onDelete={() => void remove(deal)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

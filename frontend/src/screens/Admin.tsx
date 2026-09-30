import { useState } from "react";
import { api, errorCode } from "../api";
import { displayName, Person } from "../components/AdminPerson";
import { Empty, ErrorBox, Segmented, SkeletonList, TitleWithRefresh, useTabEnter } from "../components/ui";
import { formatKst, formatMoney, requestStatus } from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useTabList } from "../tabList";
import { confirm, haptic } from "../telegram";
import { type AdminReport, type AdminUser, giveCurrency } from "../types";

type Tab = "open" | "resolved";

function ReportCard(props: { report: AdminReport; busy: boolean; onAction: (action: () => Promise<unknown>) => void }) {
  const { report, busy, onAction } = props;
  const { request, deal, reported } = report;
  const me = useMe();
  const roleOf = (user: AdminUser) =>
    deal ? (user.telegram_id === request.author_id ? t.admin.author : t.admin.responder) : null;

  const setBanned = async (user: AdminUser, banned: boolean) => {
    const name = displayName(user);
    if (!(await confirm(banned ? t.admin.banConfirm(name) : t.admin.unbanConfirm(name)))) return;
    onAction(() => api.setBanned(user.telegram_id, banned));
  };

  const deleteDeal = async (id: number, accepted: boolean) => {
    if (!(await confirm(t.allDeals.deleteConfirm(id, accepted)))) return;
    onAction(() => api.deleteDeal(id));
  };

  return (
    <div className="card">
      <div className="admin-head">
        <strong>{t.report.categories[report.category]}</strong>
        <span className="hint small">{formatKst(report.created_at)}</span>
      </div>
      {report.note && <p className="admin-note">{report.note}</p>}
      <p className="small">
        {t.admin.request(request.id)} · {formatMoney(request.amount, giveCurrency(request.direction))} ·{" "}
        {requestStatus(request)}
        {deal && (
          <>
            <br />
            {t.admin.deal(deal.id)} · {t.dealStatus[deal.status]}
            {deal.partial && ` · ${t.admin.counterOffer}`}
            <br />
            <span className="hint">
              {t.admin.paid(t.admin.author, deal.author_confirmed)} ·{" "}
              {t.admin.paid(t.admin.responder, deal.responder_confirmed)}
            </span>
          </>
        )}
      </p>
      <Person label={t.admin.from} user={report.reporter} role={roleOf(report.reporter)} />
      {reported && <Person label={t.admin.about} user={reported} role={roleOf(reported)} />}
      {report.resolved_at && <p className="hint small">{t.admin.resolvedAt(formatKst(report.resolved_at))}</p>}
      <div className="button-row">
        {!report.resolved && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => onAction(() => api.resolveReport(report.id))}
          >
            {t.admin.resolve}
          </button>
        )}
        {reported && !reported.is_admin && (
          <button
            type="button"
            className={reported.is_banned ? "secondary-button" : "secondary-button destructive"}
            disabled={busy}
            onClick={() => void setBanned(reported, !reported.is_banned)}
          >
            {reported.is_banned ? t.admin.unban : t.admin.ban}
          </button>
        )}
        {deal && me.is_owner && (
          <button
            type="button"
            className="secondary-button destructive"
            disabled={busy}
            onClick={() => void deleteDeal(deal.id, deal.status === "accepted" && !deal.partial)}
          >
            {t.allDeals.delete}
          </button>
        )}
      </div>
    </div>
  );
}

/** Admins review reports: resolve them, and ban or unban the reported user. */
export function Admin(props: { active: boolean }) {
  const [tab, setTab] = useState<Tab>("open");
  const list = useTabList(tab, (tab) => api.adminReports(tab === "resolved"), props.active);
  const { items: reports, load } = list;
  const tabEnter = useTabEnter(list.shownTab, list.shownTab === "resolved" ? 1 : 0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
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
      <TitleWithRefresh title={t.admin.title} onRefresh={load} />
      <Segmented
        options={[
          { value: "open", label: t.admin.open },
          { value: "resolved", label: t.admin.resolved },
        ]}
        value={tab}
        onChange={setTab}
      />
      {actionError && <ErrorBox code={actionError} />}
      {list.error && <ErrorBox code={list.error} onRetry={() => void load()} />}
      {list.loading && <SkeletonList />}
      {reports && (
        // Stays up for a new tab (see useTabList); what's inside is keyed by its tab and slides in.
        <div className={list.stale ? "results stale" : "results"} aria-busy={list.stale}>
          {reports.length === 0 ? (
            <Empty key={list.shownTab} title={tab === "open" ? t.admin.empty : t.admin.emptyResolved} />
          ) : (
            <div key={list.shownTab} className={`list tab-content ${tabEnter}`}>
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} busy={busy} onAction={(action) => void act(action)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

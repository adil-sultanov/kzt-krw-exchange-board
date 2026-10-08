import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { AdminDealCard, RemovedRequestCard } from "../components/AdminDeal";
import { CheckIcon, ClockIcon, CrossIcon, DealsIcon, ListIcon } from "../components/icons";
import { EmptyCard, ErrorBox, FoldableGroup, Segmented, SkeletonList, TitleWithRefresh, useTabEnter } from "../components/ui";
import { t } from "../i18n";
import { useMe } from "../me";
import { useReactivated } from "../nav";
import { confirm, haptic } from "../telegram";
import type { CancelledRequest, DealListState, ListedDeal } from "../types";

const TABS: DealListState[] = ["active", "completed", "cancelled"];
// Completed deals are split into the last week's and earlier ones.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Every tab at once, so switching is instant and each tab shows its count. */
interface Lists {
  active: ListedDeal[];
  completed: ListedDeal[];
  cancelled: ListedDeal[];
  /** Requests taken off the board early (in the Cancelled tab, with the declined deals). */
  removed: CancelledRequest[];
}

async function loadLists(): Promise<Lists> {
  const [active, completed, cancelled, removed] = await Promise.all([
    api.allDeals("active"),
    api.allDeals("completed"),
    api.allDeals("cancelled"),
    api.cancelledRequests(),
  ]);
  return { active, completed, cancelled, removed };
}

function count(lists: Lists, tab: DealListState): number {
  return tab === "cancelled" ? lists.cancelled.length + lists.removed.length : lists[tab].length;
}

const EMPTY: Record<DealListState, { icon: ReactNode; title: string }> = {
  active: { icon: <DealsIcon />, title: t.allDeals.emptyActive },
  completed: { icon: <CheckIcon />, title: t.allDeals.emptyCompleted },
  cancelled: { icon: <CrossIcon />, title: t.allDeals.emptyCancelled },
};

/**
 * Admins see every deal: Active (in progress, then waiting for the author's answer; stalest
 * first), Completed, and Cancelled (requests taken off the board early, and declined or
 * withdrawn offers). Each side of a deal opens their page in Admin: users; the owner can delete
 * deals.
 */
export function AllDeals(props: { active: boolean }) {
  const me = useMe();
  const [tab, setTab] = useState<DealListState>("active");
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Responses to superseded loads are ignored.
  const loadSeq = useRef(0);
  const tabEnter = useTabEnter(lists ? tab : null, TABS.indexOf(tab));

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const loaded = await loadLists();
      if (seq !== loadSeq.current) return;
      setLists(loaded);
      setError(null);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorCode(e));
    }
  }, []);
  useEffect(() => void load(), [load]);
  useReactivated(props.active, () => void load());

  const remove = async (deal: ListedDeal) => {
    if (busy || !(await confirm(t.allDeals.deleteConfirm(deal.status === "accepted" && !deal.partial)))) return;
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

  const dealCards = (deals: ListedDeal[]) =>
    deals.map((deal) => (
      <AdminDealCard
        key={deal.id}
        deal={deal}
        busy={busy}
        // Declined and withdrawn offers are cleaned up on their own (30 days).
        onDelete={me.is_owner && deal.status !== "declined" && deal.status !== "cancelled" ? () => void remove(deal) : null}
      />
    ));

  // Every group folds under its row (remembered on this device), like My deals' History.
  const content = (lists: Lists) => {
    if (count(lists, tab) === 0) return <EmptyCard icon={EMPTY[tab].icon} title={EMPTY[tab].title} />;
    if (tab === "active") {
      const accepted = lists.active.filter((deal) => deal.status === "accepted");
      const pending = lists.active.filter((deal) => deal.status === "pending");
      return (
        <section className="section">
          <p className="hint small section-note">{t.allDeals.activeHint}</p>
          {accepted.length > 0 && (
            <FoldableGroup
              title={t.allDeals.inProgress}
              count={accepted.length}
              icon={<DealsIcon />}
              storageKey="allDeals.inProgressFolded"
            >
              {dealCards(accepted)}
            </FoldableGroup>
          )}
          {pending.length > 0 && (
            <FoldableGroup
              title={t.allDeals.waiting}
              count={pending.length}
              icon={<ClockIcon />}
              storageKey="allDeals.waitingFolded"
            >
              {dealCards(pending)}
            </FoldableGroup>
          )}
        </section>
      );
    }
    if (tab === "completed") {
      const weekAgo = Date.now() - WEEK_MS;
      const recent = lists.completed.filter((deal) => new Date(deal.updated_at).getTime() >= weekAgo);
      const earlier = lists.completed.filter((deal) => new Date(deal.updated_at).getTime() < weekAgo);
      return (
        <section className="section">
          <p className="hint small section-note">{t.allDeals.completedHint}</p>
          {recent.length > 0 && (
            <FoldableGroup
              title={t.allDeals.lastWeek}
              count={recent.length}
              icon={<CheckIcon />}
              tone="positive"
              storageKey="allDeals.completedRecentFolded"
            >
              {dealCards(recent)}
            </FoldableGroup>
          )}
          {earlier.length > 0 && (
            <FoldableGroup
              title={t.allDeals.earlier}
              count={earlier.length}
              icon={<CheckIcon />}
              tone="muted"
              storageKey="allDeals.completedEarlierFolded"
            >
              {dealCards(earlier)}
            </FoldableGroup>
          )}
        </section>
      );
    }
    return (
      <section className="section">
        {lists.removed.length > 0 && (
          <FoldableGroup
            title={t.allDeals.removed}
            count={lists.removed.length}
            icon={<ListIcon />}
            tone="muted"
            storageKey="allDeals.removedFolded"
          >
            {lists.removed.map((request) => (
              <RemovedRequestCard key={request.id} request={request} />
            ))}
          </FoldableGroup>
        )}
        {lists.cancelled.length > 0 && (
          <FoldableGroup
            title={t.allDeals.declined}
            count={lists.cancelled.length}
            icon={<CrossIcon />}
            tone="muted"
            storageKey="allDeals.declinedFolded"
          >
            {dealCards(lists.cancelled)}
          </FoldableGroup>
        )}
      </section>
    );
  };

  return (
    <div className="screen">
      <TitleWithRefresh title={t.allDeals.title} onRefresh={load} />
      <Segmented
        options={TABS.map((value) => ({
          value,
          label: t.allDeals.tabs[value],
          count: lists ? count(lists, value) : undefined,
        }))}
        value={tab}
        onChange={setTab}
      />
      {actionError && <ErrorBox code={actionError} />}
      {error && <ErrorBox code={error} onRetry={() => void load()} />}
      {!lists && !error && <SkeletonList count={2} />}
      {lists && (
        // Keyed by its tab: it slides in from the side of the tab picked.
        <div key={tab} className={`results tab-content ${tabEnter}`}>
          {content(lists)}
        </div>
      )}
    </div>
  );
}

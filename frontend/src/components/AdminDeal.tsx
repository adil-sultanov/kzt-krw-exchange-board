import { formatKstShort, formatMoney, formatRatePair, timeAgo } from "../format";
import { t } from "../i18n";
import { amountCurrency, type CancelledRequest, giveCurrency, type ListedDeal, listedDealSides } from "../types";
import { AdminParty, displayName } from "./AdminPerson";
import type { StatusTone } from "./RequestCard";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Accepted over a day ago and still not finished: someone may need a nudge (or a report). */
export function isStuck(deal: ListedDeal, now: number = Date.now()): boolean {
  return deal.status === "accepted" && deal.accepted_at !== null && now - new Date(deal.accepted_at).getTime() > DAY_MS;
}

function statusTone(deal: ListedDeal): StatusTone {
  if (isStuck(deal)) return "action";
  return deal.status === "declined" || deal.status === "cancelled" ? "muted" : "active";
}

/**
 * A deal as admins see it: its status, both sides (who they are, what each pays, and on an
 * accepted deal whether each confirmed receiving the other's money), the rate and when it
 * started. Tapping a side opens their page. `onDelete` (the owner's) adds Delete deal under it.
 */
export function AdminDealCard(props: {
  deal: ListedDeal;
  busy?: boolean;
  onDelete?: (() => void) | null;
  /** On a user's page: their own row doesn't open it again. */
  currentUser?: number;
}) {
  const { deal } = props;
  const sides = listedDealSides(deal);
  const accepted = deal.status === "accepted";
  const status = t.allDeals.status[deal.status];
  const when =
    accepted && deal.accepted_at ? t.allDeals.acceptedAgo(timeAgo(deal.accepted_at)) : timeAgo(deal.updated_at);
  const card = (
    <div className={accepted ? "card admin-card highlight" : "card admin-card"}>
      <div className="admin-card-head">
        <span className={`card-status ${statusTone(deal)}`}>{deal.partial ? t.allDeals.counter(status) : status}</span>
        <span className="admin-card-time">{when}</span>
      </div>
      <div className="parties">
        <AdminParty
          user={deal.author}
          role={t.allDeals.author}
          pays={sides.author}
          received={accepted ? deal.author_confirmed : null}
          current={deal.author.telegram_id === props.currentUser}
        />
        <AdminParty
          user={deal.responder}
          role={t.allDeals.taker}
          pays={sides.responder}
          received={accepted ? deal.responder_confirmed : null}
          current={deal.responder.telegram_id === props.currentUser}
        />
      </div>
      <span className="card-meta">
        {deal.rate !== null && <span>{t.allDeals.rate(formatRatePair(deal.rate), deal.rate_locked)}</span>}
        <span className="card-time">{t.allDeals.started(formatKstShort(deal.created_at))}</span>
      </span>
    </div>
  );
  if (!props.onDelete) return card;
  return (
    <div className="card-stack">
      {card}
      <button type="button" className="card-action" disabled={props.busy} onClick={props.onDelete}>
        {t.allDeals.delete}
      </button>
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

/**
 * A request taken off the board early: how and when, what its author wanted, the author, and
 * the people who had taken it (declined when it closed).
 */
export function RemovedRequestCard(props: { request: CancelledRequest }) {
  const { request } = props;
  const byAdmin = request.closed_by !== null && request.close_reason !== "author";
  return (
    <div className="card admin-card">
      <div className="admin-card-head">
        <span className={byAdmin ? "card-status" : "card-status muted"}>{closedBy(request)}</span>
        <span className="admin-card-time">{timeAgo(request.closed_at)}</span>
      </div>
      <span className="admin-card-terms">
        {t.allDeals.wanted(
          formatMoney(request.amount, amountCurrency(request.direction)),
          giveCurrency(request.direction),
        )}
      </span>
      {request.open_reports > 0 && (
        <span className="flag danger admin-card-flag">{t.admin.reportsOnRequest(request.open_reports)}</span>
      )}
      <div className="parties">
        <AdminParty user={request.author} role={t.allDeals.author} />
        {byAdmin && request.closed_by && request.closed_by.telegram_id !== request.author.telegram_id && (
          <AdminParty user={request.closed_by} role={t.allDeals.closer} />
        )}
      </div>
      {request.takers.length > 0 && (
        <>
          <span className="admin-card-label">{t.allDeals.takers(request.takers.length)}</span>
          <div className="parties">
            {request.takers.map((taker) => (
              <AdminParty key={taker.telegram_id} user={taker} role={t.allDeals.taker} />
            ))}
          </div>
        </>
      )}
      <span className="card-meta">
        <span>{t.adminUsers.posted(formatKstShort(request.created_at))}</span>
      </span>
    </div>
  );
}

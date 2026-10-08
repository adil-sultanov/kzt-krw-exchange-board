import { type ReactNode, useCallback, useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { AdminDealCard } from "../components/AdminDeal";
import { displayName, personName } from "../components/AdminPerson";
import { CheckIcon, DealsIcon, ListIcon } from "../components/icons";
import type { StatusTone } from "../components/RequestCard";
import { CopyButton, ErrorBox, FoldableGroup, Loading, Notice, RefreshButton, Row } from "../components/ui";
import { UsernameTag } from "../components/UsernameTag";
import { formatKst, formatKstShort, formatMoney, requestStatus, timeAgo, timeLeft } from "../format";
import { t } from "../i18n";
import { useReactivated } from "../nav";
import { confirm, haptic, openTelegramLink } from "../telegram";
import { type AdminUserDetail, type AdminUserRequest, amountCurrency, giveCurrency } from "../types";

function requestTone(request: AdminUserRequest): StatusTone {
  return request.status === "closed" || request.status === "expired" ? "muted" : "active";
}

/** One of their requests: its status, what they wanted, when it was posted and how long it's left. */
function RequestRow(props: { request: AdminUserRequest }) {
  const { request } = props;
  const left = request.status === "open" ? timeLeft(request.expires_at) : null;
  return (
    <div className="card admin-card">
      <div className="admin-card-head">
        <span className={`card-status ${requestTone(request)}`}>{requestStatus(request)}</span>
        <span className="admin-card-time">{timeAgo(request.updated_at)}</span>
      </div>
      <span className="admin-card-terms">
        {t.adminUsers.request(
          formatMoney(request.amount, amountCurrency(request.direction)),
          giveCurrency(request.direction),
        )}
      </span>
      <span className="card-meta">
        <span>{t.adminUsers.posted(formatKstShort(request.created_at))}</span>
        {left && <span className="card-time">{t.card.timeLeft(left)}</span>}
      </span>
    </div>
  );
}

/** A label / value list in a card, under a section title. */
function Details(props: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{props.title}</h2>
      <div className="detail">{props.children}</div>
    </section>
  );
}

function Value(props: { value: string | number | null | undefined }) {
  return props.value === null || props.value === undefined || props.value === "" ? (
    <span className="hint">{t.adminUsers.notFilled}</span>
  ) : (
    <span>{props.value}</span>
  );
}

/**
 * One user's page, for admins helping them or checking on them: who they are (account and
 * profile, laid out like the Profile), what they're doing (counts, latest deals and requests),
 * reports, and Ban / Unban. Whether they added receiving details, never the details.
 */
export function AdminUser(props: { id: number; active: boolean }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUser(await api.adminUser(props.id));
      setError(null);
    } catch (e) {
      setError(errorCode(e));
    }
  }, [props.id]);
  useEffect(() => void load(), [load]);
  useReactivated(props.active, () => void load());

  if (!user) {
    return (
      <div className="screen">{error ? <ErrorBox code={error} onRetry={() => void load()} /> : <Loading />}</div>
    );
  }

  const setBanned = async (banned: boolean) => {
    const name = displayName(user);
    if (busy || !(await confirm(banned ? t.admin.banConfirm(name) : t.admin.unbanConfirm(name)))) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.setBanned(user.telegram_id, banned);
      haptic("success");
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    } finally {
      setBusy(false);
      void load();
    }
  };

  const name = personName(user);
  const profile = user.profile;
  const complete = Boolean(profile?.first_name && profile.last_name && profile.university && profile.enrollment_year);
  const alerts = [user.alerts_buy_krw && t.buy.KRW, user.alerts_buy_kzt && t.buy.KZT].filter(Boolean).join(", ");
  return (
    <div className="screen">
      <div className="profile-head">
        <span className="head-refresh">
          <RefreshButton onRefresh={load} />
        </span>
        <span className="avatar" aria-hidden="true">
          {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
        </span>
        <h1 className="title">{name}</h1>
        <span className="head-line">
          {user.username && <UsernameTag username={user.username} />}
          <span className="hint small">{t.deals(user.completed_deals)}</span>
        </span>
        <span className="pill-row">
          <span className={complete ? "status-pill done" : "status-pill missing"}>
            {complete && <CheckIcon />}
            {complete ? t.profile.complete : t.profile.incomplete}
          </span>
          {user.is_banned && <span className="status-pill missing">{t.admin.banned}</span>}
          {user.is_admin && <span className="status-pill admin">{t.admin.isAdmin}</span>}
        </span>
      </div>

      {user.is_banned && (
        <Notice tone="warning">
          <p>{t.adminUsers.bannedNotice}</p>
        </Notice>
      )}
      {!user.username && (
        <Notice tone="warning">
          <p>{t.adminUsers.noUsername}</p>
        </Notice>
      )}
      {actionError && <ErrorBox code={actionError} />}
      {error && <ErrorBox code={error} onRetry={() => void load()} />}

      <div className="deals-summary">
        <div className="deals-stat">
          <span className="deals-stat-value">{user.open_requests}</span>
          <span className="deals-stat-label">{t.adminUsers.activity.onBoard}</span>
        </div>
        <div className="deals-stat">
          <span className="deals-stat-value">{user.active_deals}</span>
          <span className="deals-stat-label">{t.adminUsers.activity.active}</span>
        </div>
        <div className="deals-stat">
          <span className="deals-stat-value">{user.completed_deals}</span>
          <span className="deals-stat-label">{t.adminUsers.activity.completed}</span>
        </div>
      </div>

      <Details title={t.adminUsers.account}>
        <Row label={t.adminUsers.telegramId}>
          <span className="id-value">
            {user.telegram_id}
            <CopyButton text={String(user.telegram_id)} />
          </span>
        </Row>
        <Row label={t.adminUsers.telegramName}>
          <Value value={user.first_name} />
        </Row>
        <Row label={t.adminUsers.username}>
          {user.username ? <span>@{user.username}</span> : <span className="hint">{t.adminUsers.none}</span>}
        </Row>
        <Row label={t.adminUsers.joined}>{formatKst(user.created_at)}</Row>
        <Row label={t.adminUsers.lastSeen}>
          {user.last_seen_at ? (
            <>
              <span>{timeAgo(user.last_seen_at)}</span>
              <span className="hint small">{formatKst(user.last_seen_at)}</span>
            </>
          ) : (
            <span className="hint">{t.adminUsers.neverSeen}</span>
          )}
        </Row>
        <Row label={t.adminUsers.alerts}>{alerts || <span className="hint">{t.adminUsers.alertsOff}</span>}</Row>
        <Row label={t.adminUsers.receiving}>{t.adminUsers.receivingState(user.has_receive_kzt, user.has_receive_krw)}</Row>
        <Row label={t.adminUsers.reportsAbout}>
          <span className={user.open_reports > 0 ? "danger-text" : undefined}>
            {t.adminUsers.reportsAboutValue(user.open_reports, user.reports_total)}
          </span>
        </Row>
        <Row label={t.adminUsers.reportsSent}>{user.reports_sent}</Row>
      </Details>

      <Details title={t.adminUsers.profile}>
        <Row label={t.profile.firstName}>
          <Value value={profile?.first_name} />
        </Row>
        <Row label={t.profile.lastName}>
          <Value value={profile?.last_name} />
        </Row>
        <Row label={t.profile.university}>
          <Value value={profile?.university} />
        </Row>
        <Row label={t.profile.year}>
          <Value value={profile?.enrollment_year} />
        </Row>
      </Details>

      {(user.deals.length > 0 || user.requests.length > 0) && (
        // Each list folds under its row (remembered on this device), like My deals' History.
        <section className="section">
          {user.deals.length > 0 && (
            <FoldableGroup
              title={t.adminUsers.deals}
              count={user.deals.length}
              icon={<DealsIcon />}
              storageKey="adminUser.dealsFolded"
            >
              {user.deals.map((deal) => (
                <AdminDealCard key={deal.id} deal={deal} currentUser={user.telegram_id} />
              ))}
            </FoldableGroup>
          )}
          {user.requests.length > 0 && (
            <FoldableGroup
              title={t.adminUsers.requests}
              count={user.requests.length}
              icon={<ListIcon />}
              storageKey="adminUser.requestsFolded"
            >
              {user.requests.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </FoldableGroup>
          )}
        </section>
      )}

      <div className="button-row">
        {user.username && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => openTelegramLink(`https://t.me/${user.username}`)}
          >
            {t.adminUsers.message(user.username)}
          </button>
        )}
        {!user.is_admin && (
          <button
            type="button"
            className={user.is_banned ? "secondary-button" : "secondary-button destructive"}
            disabled={busy}
            onClick={() => void setBanned(!user.is_banned)}
          >
            {user.is_banned ? t.admin.unban : t.admin.ban}
          </button>
        )}
      </div>
    </div>
  );
}

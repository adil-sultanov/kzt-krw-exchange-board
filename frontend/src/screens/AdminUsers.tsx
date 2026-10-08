import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { PersonFlags, personName } from "../components/AdminPerson";
import { UsersIcon } from "../components/icons";
import { EmptyCard, ErrorBox, Segmented, SkeletonList, TitleWithRefresh, useTabEnter } from "../components/ui";
import { timeAgo } from "../format";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import type { AdminUserListItem, AdminUsers as Users, UserListFilter } from "../types";

const FILTERS: UserListFilter[] = ["all", "reported", "banned"];
// The most the server lists at once (USERS_LIMIT in backend services/admin.py).
const USERS_LIMIT = 200;
const SEARCH_DELAY_MS = 250;

/** One user, as a row like the Profile's menu: initial, name and flags, who they are, when last seen. */
function UserRow(props: { user: AdminUserListItem }) {
  const { user } = props;
  const nav = useNav();
  const name = personName(user);
  const details = [
    user.username && `@${user.username}`,
    [user.profile?.university, user.profile?.enrollment_year].filter(Boolean).join(", "),
    t.card.deals(user.completed_deals),
  ].filter(Boolean);
  return (
    <button type="button" className="menu-row user-row" onClick={() => nav.push({ name: "adminUser", id: user.telegram_id })}>
      <span className="party-avatar" aria-hidden="true">
        {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
      </span>
      <span className="menu-label">
        <span className="user-row-text">
          <span className="user-row-name">{name}</span>
          <span className="party-sub">{details.join(" · ")}</span>
          <PersonFlags user={user} />
        </span>
        <span className="user-row-end">
          <span className="user-row-seen">
            {user.last_seen_at ? timeAgo(user.last_seen_at) : t.adminUsers.neverSeen}
          </span>
          <span className="menu-chevron" aria-hidden="true">
            ›
          </span>
        </span>
      </span>
    </button>
  );
}

/** Counts over everyone, on top like My deals' summary. */
function Summary(props: { users: Users }) {
  const { users } = props;
  const stat = (value: number, label: string, alert = false) => (
    <div className={alert && value > 0 ? "deals-stat alert" : "deals-stat"}>
      <span className="deals-stat-value">{value}</span>
      <span className="deals-stat-label">{label}</span>
    </div>
  );
  return (
    <div className="deals-summary">
      {stat(users.total, t.adminUsers.stats.total)}
      {stat(users.seen_this_week, t.adminUsers.stats.week)}
      {stat(users.reported, t.adminUsers.stats.reported, true)}
    </div>
  );
}

/**
 * Admins find anyone who has used the app or the bot: search by name, @username, university
 * or Telegram ID, or list only reported or banned users. Most recently seen first; each opens
 * their page (AdminUser), to help them or ban them.
 */
export function AdminUsers(props: { active: boolean }) {
  const [show, setShow] = useState<UserListFilter>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // What's shown, and for which filter and search: the old results stay up (dimmed if it
  // takes a moment) until the new ones are in, as on the Board. The list slides in by the tab
  // it's for, once it's there; keying it by the tab just picked would slide the old list in,
  // then swap the new one in under it (a flicker).
  const [shown, setShown] = useState<{ show: UserListFilter; search: string; users: Users } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const shownShow = shown?.show ?? null;
  const tabEnter = useTabEnter(shownShow, shownShow ? FILTERS.indexOf(shownShow) : 0);

  // Searches once typing pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const users = await api.adminUsers(search, show);
      if (seq !== loadSeq.current) return;
      setShown({ show, search, users });
      setError(null);
    } catch (e) {
      if (seq === loadSeq.current) setError(errorCode(e));
    }
  }, [search, show]);
  useEffect(() => void load(), [load]);
  useReactivated(props.active, () => void load());

  const users = shown?.users ?? null;
  const stale = shown !== null && (shown.show !== show || shown.search !== search);
  return (
    <div className="screen">
      <TitleWithRefresh title={t.adminUsers.title} onRefresh={load} />
      {users && <Summary users={users} />}
      <input
        className="input search-input"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={64}
        placeholder={t.adminUsers.search}
        aria-label={t.adminUsers.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Segmented
        options={FILTERS.map((value) => ({
          value,
          label: t.adminUsers.show[value],
          count: users && value !== "all" ? users[value] : undefined,
        }))}
        value={show}
        onChange={setShow}
      />
      {error && <ErrorBox code={error} onRetry={() => void load()} />}
      {!users && !error && <SkeletonList count={3} />}
      {users && (
        <div className={stale ? "results stale" : "results"} aria-busy={stale}>
          <div key={shownShow} className={`tab-content ${tabEnter}`}>
            {users.users.length === 0 ? (
              <EmptyCard icon={<UsersIcon />} title={shown?.search ? t.adminUsers.emptySearch : t.adminUsers.empty} />
            ) : (
              <div className="menu user-list">
                {users.users.map((user) => (
                  <UserRow key={user.telegram_id} user={user} />
                ))}
              </div>
            )}
          </div>
          {users.users.length >= USERS_LIMIT && (
            <p className="hint small section-note">{t.adminUsers.more(USERS_LIMIT)}</p>
          )}
        </div>
      )}
    </div>
  );
}

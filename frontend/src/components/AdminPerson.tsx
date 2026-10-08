import { formatProfile, formatSide } from "../format";
import { t } from "../i18n";
import { useNav } from "../nav";
import { openTelegramLink } from "../telegram";
import type { AdminUser, Side } from "../types";
import { CheckIcon } from "./icons";
import { UsernameTag } from "./UsernameTag";

export function displayName(user: AdminUser): string {
  return user.username ? `@${user.username}` : user.first_name || String(user.telegram_id);
}

/** Their name: as in their profile, else their Telegram name, username or ID. */
export function personName(user: AdminUser): string {
  const profileName = [user.profile?.first_name, user.profile?.last_name].filter(Boolean).join(" ");
  return profileName || user.first_name || (user.username ? `@${user.username}` : String(user.telegram_id));
}

/** Banned / Admin / open reports, as small tags (none for most people). */
export function PersonFlags(props: { user: AdminUser }) {
  const { user } = props;
  if (!user.is_banned && !user.is_admin && user.open_reports === 0) return null;
  return (
    <span className="person-flags">
      {user.is_banned && <span className="flag danger">{t.admin.banned}</span>}
      {user.open_reports > 0 && <span className="flag danger">{t.admin.openReports(user.open_reports)}</span>}
      {user.is_admin && <span className="flag">{t.admin.isAdmin}</span>}
    </span>
  );
}

/**
 * One side of a deal (or a request's author or taker) on an admin's card: an initial, their name
 * and @username, their role, university and record. `pays` adds what they pay; `received`
 * whether they confirmed getting the other side's money (on an accepted deal). Tapping it opens
 * their page in Admin: users; the @username opens their Telegram profile.
 */
export function AdminParty(props: {
  user: AdminUser;
  role?: string;
  pays?: Side;
  received?: boolean | null;
  /** The page shown is theirs already (Admin: users): tapping it does nothing. */
  current?: boolean;
}) {
  const { user } = props;
  const nav = useNav();
  const name = personName(user);
  const details = [
    props.role,
    [user.profile?.university, user.profile?.enrollment_year].filter(Boolean).join(", "),
    t.card.deals(user.completed_deals),
  ].filter((part): part is string => Boolean(part));
  const open = () => nav.push({ name: "adminUser", id: user.telegram_id });
  if (props.current) {
    return (
      <div className="party current">
        <PartyBody {...props} name={name} details={details} />
      </div>
    );
  }
  return (
    // A div, not a button: the username inside it is a button of its own.
    <div
      role="button"
      tabIndex={0}
      className="party"
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        open();
      }}
    >
      <PartyBody {...props} name={name} details={details} />
    </div>
  );
}

/** What a party row shows: initial, name and @username, details and flags, and what they pay. */
function PartyBody(props: { user: AdminUser; name: string; details: string[]; pays?: Side; received?: boolean | null }) {
  const { user, name, details } = props;
  return (
    <>
      <span className="party-avatar" aria-hidden="true">
        {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
      </span>
      <span className="party-text">
        <span className="party-name">
          <span>{name}</span>
          {user.username && <UsernameTag username={user.username} />}
        </span>
        <span className="party-sub">{details.join(" · ")}</span>
        <PersonFlags user={user} />
        {props.pays && (
          <span className="party-money">
            <span>
              <span className="party-pays">{t.allDeals.pays}</span>{" "}
              <span className="party-amount">{formatSide(props.pays)}</span>
            </span>
            {props.received != null && (
              <span className={props.received ? "party-check done" : "party-check"}>
                {props.received && <CheckIcon />}
                {props.received ? t.allDeals.received : t.allDeals.notReceived}
              </span>
            )}
          </span>
        )}
      </span>
    </>
  );
}

/** One person, as admins see them: their chat link (if they have a username), record and flags. */
export function Person(props: { label?: string; user: AdminUser; role?: string | null }) {
  const { user } = props;
  const nav = useNav();
  const tags = [
    props.role,
    t.deals(user.completed_deals),
    user.open_reports > 0 ? t.admin.openReports(user.open_reports) : null,
  ].filter(Boolean);
  const profile = formatProfile(user.profile);
  return (
    <div className="admin-person">
      {props.label && <span className="hint small">{props.label}</span>}
      <span className="admin-person-name">
        {user.username ? (
          <button
            type="button"
            className="link-button"
            onClick={() => openTelegramLink(`https://t.me/${user.username}`)}
          >
            @{user.username}
          </button>
        ) : (
          <span>
            {user.first_name} <span className="hint small">({t.admin.noUsername})</span>
          </span>
        )}
        {user.is_banned && <span className="rate-tag worse">{t.admin.banned}</span>}
        {user.is_admin && <span className="rate-tag market">{t.admin.isAdmin}</span>}
        <button
          type="button"
          className="link-button subtle small"
          onClick={() => nav.push({ name: "adminUser", id: user.telegram_id })}
        >
          {t.adminUsers.open} ›
        </button>
      </span>
      {profile && <span className="small">{profile}</span>}
      <span className="hint small">
        {tags.join(" · ")} · ID {user.telegram_id}
      </span>
    </div>
  );
}

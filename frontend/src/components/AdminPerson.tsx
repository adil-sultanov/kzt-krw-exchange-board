import { formatProfile } from "../format";
import { t } from "../i18n";
import { openTelegramLink } from "../telegram";
import type { AdminUser } from "../types";

export function displayName(user: AdminUser): string {
  return user.username ? `@${user.username}` : user.first_name || String(user.telegram_id);
}

/** One person, as admins see them: their chat link (if they have a username), record and flags. */
export function Person(props: { label?: string; user: AdminUser; role?: string | null }) {
  const { user } = props;
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
      </span>
      {profile && <span className="small">{profile}</span>}
      <span className="hint small">
        {tags.join(" · ")} · ID {user.telegram_id}
      </span>
    </div>
  );
}

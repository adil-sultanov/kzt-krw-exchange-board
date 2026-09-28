import type { MouseEvent } from "react";
import { t } from "../i18n";
import { openTelegramLink } from "../telegram";

/** "@aida": opens their Telegram profile, so the viewer can check who they'd trade with. */
export function UsernameTag(props: { username: string }) {
  const open = (event: MouseEvent) => {
    // Inside a tappable card: open the profile, not the card.
    event.stopPropagation();
    openTelegramLink(`https://t.me/${props.username}`);
  };
  return (
    <button type="button" className="username-tag" aria-label={t.card.openProfile(props.username)} onClick={open}>
      @{props.username}
    </button>
  );
}

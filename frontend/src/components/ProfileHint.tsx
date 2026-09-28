import { t } from "../i18n";
import { useNav } from "../nav";
import { Notice } from "./ui";

/** Why the viewer can't post or take a request yet, with a way to fix it. */
export function ProfileRequired(props: { text: string }) {
  const nav = useNav();
  return (
    <Notice tone="warning">
      <p>{props.text}</p>
      <button type="button" className="link-button" onClick={() => nav.push({ name: "profile" })}>
        {t.profileHint.open}
      </button>
    </Notice>
  );
}

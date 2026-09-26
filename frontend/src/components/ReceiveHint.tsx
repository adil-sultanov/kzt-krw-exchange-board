import { t } from "../i18n";
import { useMe } from "../me";
import { useNav } from "../nav";
import { type Currency, hasReceiveDetails } from "../types";
import { Notice } from "./ui";

/** Nudges the viewer to add where they receive `currency`, if they haven't yet. */
export function ReceiveHint(props: { currency: Currency }) {
  const me = useMe();
  const nav = useNav();
  if (hasReceiveDetails(me, props.currency)) return null;
  return (
    <Notice>
      <p>{t.receiveHint.missing(props.currency)}</p>
      <button type="button" className="link-button" onClick={() => nav.push({ name: "profile" })}>
        {t.receiveHint.open}
      </button>
    </Notice>
  );
}

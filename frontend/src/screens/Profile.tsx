import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { CheckIcon } from "../components/icons";
import { ErrorBox, Section } from "../components/ui";
import { t } from "../i18n";
import { useMe, useSetMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import { type Currency, MAX_ACCOUNT_LENGTH, MAX_BANK_LENGTH, type Me, type MeUpdate } from "../types";

type DetailsKey = keyof MeUpdate & keyof Me;
const DETAILS_KEYS: DetailsKey[] = [
  "receive_kzt_bank",
  "receive_kzt_account",
  "receive_krw_bank",
  "receive_krw_account",
];
type Details = Record<DetailsKey, string>;

const SAVED_MS = 2500;

function savedDetails(me: Me): Details {
  return {
    receive_kzt_bank: me.receive_kzt_bank ?? "",
    receive_kzt_account: me.receive_kzt_account ?? "",
    receive_krw_bank: me.receive_krw_bank ?? "",
    receive_krw_account: me.receive_krw_account ?? "",
  };
}

function TextField(props: {
  label: string;
  placeholder: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        className="input"
        maxLength={props.maxLength}
        autoComplete="off"
        inputMode={props.numeric ? "tel" : "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

/** Bank and account number for receiving one currency. */
function CurrencyDetails(props: {
  currency: Currency;
  details: Details;
  onChange: (key: DetailsKey, value: string) => void;
}) {
  const prefix = props.currency === "KZT" ? "receive_kzt" : "receive_krw";
  const bankKey: DetailsKey = `${prefix}_bank`;
  const accountKey: DetailsKey = `${prefix}_account`;
  const text = t.profile.details[props.currency];
  return (
    <div className="details-group">
      <h3 className="details-title">{text.title}</h3>
      <TextField
        label={t.profile.bank}
        placeholder={text.bankPlaceholder}
        maxLength={MAX_BANK_LENGTH}
        value={props.details[bankKey]}
        onChange={(value) => props.onChange(bankKey, value)}
      />
      <TextField
        label={t.profile.account}
        placeholder={text.accountPlaceholder}
        maxLength={MAX_ACCOUNT_LENGTH}
        value={props.details[accountKey]}
        onChange={(value) => props.onChange(accountKey, value)}
        numeric
      />
    </div>
  );
}

export function Profile(props: { active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const setMe = useSetMe();
  const [details, setDetails] = useState<Details>(() => savedDetails(me));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = savedDetails(me);
  const changed = DETAILS_KEYS.some((key) => details[key].trim() !== current[key]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const save = async () => {
    if (saving || !changed) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateMe(details);
      setMe(updated);
      setDetails(savedDetails(updated));
      setSaved(true);
      haptic("success");
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
    } finally {
      setSaving(false);
    }
  };

  // Shown only while there's something to save.
  useMainButton(
    props.active && (changed || saving) ? { text: t.profile.save, onClick: save, loading: saving } : null,
  );

  const edit = (key: DetailsKey, value: string) => {
    setSaved(false);
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const name = me.first_name || me.username || "";
  return (
    <div className="screen">
      <div className="profile-head">
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="profile-name">
          <h1 className="title">{name}</h1>
          <span className="hint small">
            {me.username && `@${me.username} · `}
            {t.deals(me.completed_deals)}
          </span>
        </div>
      </div>

      <Section title={t.profile.receiving}>
        <p className="hint small">{t.profile.receivingHint}</p>
        <CurrencyDetails currency="KZT" details={details} onChange={edit} />
        <CurrencyDetails currency="KRW" details={details} onChange={edit} />
      </Section>
      {saved && (
        <p className="saved" role="status">
          <CheckIcon />
          {t.profile.saved}
        </p>
      )}
      {error && <ErrorBox code={error} />}

      <Section title={t.profile.more}>
        <div className="menu">
          <button type="button" className="menu-row" onClick={() => nav.push({ name: "about" })}>
            {t.profile.about}
            <span className="menu-chevron" aria-hidden="true">›</span>
          </button>
          {me.is_admin && (
            <button type="button" className="menu-row" onClick={() => nav.push({ name: "admin" })}>
              {t.profile.admin}
              <span className="menu-chevron" aria-hidden="true">›</span>
            </button>
          )}
        </div>
      </Section>

      {me.is_owner && (
        <Section title={t.profile.owner}>
          <div className="menu">
            <button type="button" className="menu-row" onClick={() => nav.push({ name: "admins" })}>
              {t.profile.admins}
              <span className="menu-chevron" aria-hidden="true">›</span>
            </button>
            <button type="button" className="menu-row" onClick={() => nav.push({ name: "ownerDeals" })}>
              {t.profile.ownerDeals}
              <span className="menu-chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

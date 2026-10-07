import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { CheckIcon } from "../components/icons";
import { ErrorBox, Section } from "../components/ui";
import { formatProfile } from "../format";
import { t } from "../i18n";
import { useMe, useSetMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  type Currency,
  MAX_ACCOUNT_LENGTH,
  MAX_BANK_LENGTH,
  MAX_NAME_LENGTH,
  MAX_UNIVERSITY_LENGTH,
  type Me,
  type MeUpdate,
  MIN_ENROLLMENT_YEAR,
} from "../types";

type DetailsKey = keyof MeUpdate & keyof Me;
const DETAILS_KEYS: DetailsKey[] = [
  "profile_first_name",
  "profile_last_name",
  "university",
  "enrollment_year",
  "receive_kzt_bank",
  "receive_kzt_account",
  "receive_krw_bank",
  "receive_krw_account",
];
/** The form, every field as text (the year too, "" for none). */
type Details = Record<DetailsKey, string>;

const SAVED_MS = 2500;

// Newest first: from next year (people enrolling soon) back to the earliest the backend takes.
const LAST_YEAR = new Date().getFullYear() + 1;
const YEARS = Array.from({ length: LAST_YEAR - MIN_ENROLLMENT_YEAR + 1 }, (_, index) => LAST_YEAR - index);

function savedDetails(me: Me): Details {
  return {
    profile_first_name: me.profile_first_name ?? "",
    profile_last_name: me.profile_last_name ?? "",
    university: me.university ?? "",
    enrollment_year: me.enrollment_year?.toString() ?? "",
    receive_kzt_bank: me.receive_kzt_bank ?? "",
    receive_kzt_account: me.receive_kzt_account ?? "",
    receive_krw_bank: me.receive_krw_bank ?? "",
    receive_krw_account: me.receive_krw_account ?? "",
  };
}

function toUpdate(details: Details): MeUpdate {
  const { enrollment_year: year, ...text } = details;
  return { ...text, enrollment_year: year ? Number(year) : null };
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

/** Name, university and year of enrollment: the tag on the viewer's requests and deals. */
function ProfileFields(props: { details: Details; onChange: (key: DetailsKey, value: string) => void }) {
  const { details, onChange } = props;
  const tag = formatProfile({
    first_name: details.profile_first_name.trim(),
    last_name: details.profile_last_name.trim(),
    university: details.university.trim(),
    enrollment_year: details.enrollment_year ? Number(details.enrollment_year) : null,
  });
  return (
    <div className="details-group">
      <div className="field-pair">
        <TextField
          label={t.profile.firstName}
          placeholder={t.profile.firstNamePlaceholder}
          maxLength={MAX_NAME_LENGTH}
          value={details.profile_first_name}
          onChange={(value) => onChange("profile_first_name", value)}
        />
        <TextField
          label={t.profile.lastName}
          placeholder={t.profile.lastNamePlaceholder}
          maxLength={MAX_NAME_LENGTH}
          value={details.profile_last_name}
          onChange={(value) => onChange("profile_last_name", value)}
        />
      </div>
      <TextField
        label={t.profile.university}
        placeholder={t.profile.universityPlaceholder}
        maxLength={MAX_UNIVERSITY_LENGTH}
        value={details.university}
        onChange={(value) => onChange("university", value)}
      />
      <label className="field">
        <span className="field-label">{t.profile.year}</span>
        <select
          className="input"
          value={details.enrollment_year}
          onChange={(event) => onChange("enrollment_year", event.target.value)}
        >
          <option value="">{t.profile.yearPlaceholder}</option>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      {tag && <p className="hint small">{t.profile.preview(tag)}</p>}
    </div>
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
      const updated = await api.updateMe(toUpdate(details));
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

  const profileName = [me.profile_first_name, me.profile_last_name].filter(Boolean).join(" ");
  const name = profileName || me.first_name || me.username || "";
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

      <Section title={t.profile.you}>
        <p className="hint small">{t.profile.youHint}</p>
        <ProfileFields details={details} onChange={edit} />
      </Section>

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
      {error === "invalid_input" ? (
        <div className="notice error" role="alert">
          <p>{t.profile.invalid}</p>
        </div>
      ) : (
        error && <ErrorBox code={error} />
      )}

      <Section title={t.profile.more}>
        <div className="menu">
          <button type="button" className="menu-row" onClick={() => nav.push({ name: "guide" })}>
            {t.profile.guide}
            <span className="menu-chevron" aria-hidden="true">›</span>
          </button>
          <button type="button" className="menu-row" onClick={() => nav.push({ name: "about" })}>
            {t.profile.about}
            <span className="menu-chevron" aria-hidden="true">›</span>
          </button>
          {me.is_admin && (
            <>
              <button type="button" className="menu-row" onClick={() => nav.push({ name: "admin" })}>
                {t.profile.admin}
                <span className="menu-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" className="menu-row" onClick={() => nav.push({ name: "boardRequests" })}>
                {t.profile.boardRequests}
                <span className="menu-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" className="menu-row" onClick={() => nav.push({ name: "allDeals" })}>
                {t.profile.allDeals}
                <span className="menu-chevron" aria-hidden="true">›</span>
              </button>
            </>
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
          </div>
        </Section>
      )}
    </div>
  );
}

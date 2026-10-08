import { type ReactNode, useEffect, useState } from "react";
import { api, errorCode } from "../api";
import {
  CheckIcon,
  ChevronIcon,
  DealsIcon,
  FlagIcon,
  HeartIcon,
  InfoIcon,
  ListIcon,
  ProfileIcon,
  ShieldIcon,
  UsersIcon,
} from "../components/icons";
import { ErrorBox, Notice, Section } from "../components/ui";
import { formatProfile } from "../format";
import { t } from "../i18n";
import { useMe, useSetMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  type Currency,
  hasProfile,
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

/** A field's label; a required one is marked, and turns red (with its input) while empty. */
function FieldLabel(props: { label: string; required?: boolean }) {
  return (
    <span className="field-label">
      {props.label}
      {props.required && (
        <span className="field-required" title={t.profile.required} aria-hidden="true">
          *
        </span>
      )}
    </span>
  );
}

function fieldClass(missing: boolean): string {
  return missing ? "field missing" : "field";
}

function TextField(props: {
  label: string;
  placeholder: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  required?: boolean;
}) {
  const missing = Boolean(props.required) && !props.value.trim();
  return (
    <label className={fieldClass(missing)}>
      <FieldLabel label={props.label} required={props.required} />
      <input
        className="input"
        required={props.required}
        aria-invalid={missing || undefined}
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
          required
          onChange={(value) => onChange("profile_first_name", value)}
        />
        <TextField
          label={t.profile.lastName}
          placeholder={t.profile.lastNamePlaceholder}
          maxLength={MAX_NAME_LENGTH}
          value={details.profile_last_name}
          required
          onChange={(value) => onChange("profile_last_name", value)}
        />
      </div>
      <TextField
        label={t.profile.university}
        placeholder={t.profile.universityPlaceholder}
        maxLength={MAX_UNIVERSITY_LENGTH}
        value={details.university}
        required
        onChange={(value) => onChange("university", value)}
      />
      <label className={fieldClass(!details.enrollment_year)}>
        <FieldLabel label={t.profile.year} required />
        <span className="select-wrap">
          <select
            className={details.enrollment_year ? "input" : "input empty"}
            required
            aria-invalid={!details.enrollment_year || undefined}
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
          <ChevronIcon open />
        </span>
      </label>
      {tag && (
        <div className="profile-preview">
          <span className="hint small">{t.profile.preview}</span>
          <span className="profile-preview-tag">
            <ProfileIcon />
            {tag}
          </span>
        </div>
      )}
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

/** A row in a menu: an icon in a tinted square, the label and a chevron. */
function MenuRow(props: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={props.onClick}>
      <span className="menu-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span className="menu-label">
        {props.label}
        <span className="menu-chevron" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
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
  const complete = hasProfile(me);
  return (
    <div className="screen">
      <div className="profile-head">
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="title">{name}</h1>
        <span className="hint small">
          {me.username && `@${me.username} · `}
          {t.deals(me.completed_deals)}
        </span>
        <span className={complete ? "status-pill done" : "status-pill missing"}>
          {complete && <CheckIcon />}
          {complete ? t.profile.complete : t.profile.incomplete}
        </span>
        {!complete && <p className="hint small profile-head-hint">{t.profile.incompleteHint}</p>}
      </div>

      {!me.username && (
        <Notice tone="warning">
          <p>{t.profile.usernameMissing}</p>
        </Notice>
      )}

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
          <MenuRow icon={<InfoIcon />} label={t.profile.guide} onClick={() => nav.push({ name: "guide" })} />
          <MenuRow icon={<HeartIcon />} label={t.profile.about} onClick={() => nav.push({ name: "about" })} />
          {me.is_admin && (
            <>
              <MenuRow icon={<FlagIcon />} label={t.profile.admin} onClick={() => nav.push({ name: "admin" })} />
              <MenuRow icon={<UsersIcon />} label={t.profile.users} onClick={() => nav.push({ name: "adminUsers" })} />
              <MenuRow
                icon={<ListIcon />}
                label={t.profile.boardRequests}
                onClick={() => nav.push({ name: "boardRequests" })}
              />
              <MenuRow
                icon={<DealsIcon />}
                label={t.profile.allDeals}
                onClick={() => nav.push({ name: "allDeals" })}
              />
            </>
          )}
        </div>
      </Section>

      {me.is_owner && (
        <Section title={t.profile.owner}>
          <div className="menu">
            <MenuRow icon={<ShieldIcon />} label={t.profile.admins} onClick={() => nav.push({ name: "admins" })} />
          </div>
        </Section>
      )}
    </div>
  );
}

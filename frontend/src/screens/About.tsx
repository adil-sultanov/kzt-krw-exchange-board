import { useCallback, useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { CheckIcon, HeartIcon } from "../components/icons";
import { CopyButton, ErrorBox, Loading, Row } from "../components/ui";
import { t } from "../i18n";
import { AUTHOR_NAME, AUTHOR_URL, AUTHOR_USERNAME, PRIVACY_URL, REPO_URL, TERMS_URL } from "../links";
import { useMe } from "../me";
import { haptic, openLink, openTelegramLink, useMainButton } from "../telegram";
import {
  type About as AboutData,
  type DonateOption,
  MAX_DONATE_LABEL_LENGTH,
  MAX_DONATE_NOTE_LENGTH,
  MAX_DONATE_OPTIONS,
  MAX_DONATE_VALUE_LENGTH,
} from "../types";

const SAVED_MS = 2500;

function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

interface Draft {
  note: string;
  options: DonateOption[];
}

/** Rows left fully empty are dropped; a half-filled one blocks saving. */
function cleanDraft(draft: Draft): { note: string; options: DonateOption[]; complete: boolean } {
  const options = draft.options
    .map((option) => ({ label: option.label.trim(), value: option.value.trim() }))
    .filter((option) => option.label || option.value);
  return {
    note: draft.note.trim(),
    options,
    complete: options.every((option) => option.label && option.value),
  };
}

function DonateList(props: { about: AboutData }) {
  return (
    <>
      {props.about.donate_note && <p className="small">{props.about.donate_note}</p>}
      {props.about.donate_options.map((option, index) => (
        <div key={index} className="pay-to">
          <span className="pay-to-label">{option.label}</span>
          <div className="pay-to-row">
            <span className="pay-to-value donate-value">{option.value}</span>
            {isLink(option.value) ? (
              <button type="button" className="copy-button" onClick={() => openLink(option.value)}>
                {t.about.open}
              </button>
            ) : (
              <CopyButton text={option.value} />
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function DonateEditor(props: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { draft, onChange } = props;
  const setOption = (index: number, change: Partial<DonateOption>) =>
    onChange({
      ...draft,
      options: draft.options.map((option, i) => (i === index ? { ...option, ...change } : option)),
    });
  return (
    <>
      <label className="field">
        <span className="field-label">{t.about.note}</span>
        <textarea
          className="input textarea"
          rows={2}
          maxLength={MAX_DONATE_NOTE_LENGTH}
          placeholder={t.about.notePlaceholder}
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </label>
      {draft.options.map((option, index) => (
        <div key={index} className="details-group">
          <label className="field">
            <span className="field-label">{t.about.label}</span>
            <input
              className="input"
              maxLength={MAX_DONATE_LABEL_LENGTH}
              autoComplete="off"
              placeholder={t.about.labelPlaceholder}
              value={option.label}
              onChange={(event) => setOption(index, { label: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t.about.value}</span>
            <input
              className="input"
              maxLength={MAX_DONATE_VALUE_LENGTH}
              autoComplete="off"
              placeholder={t.about.valuePlaceholder}
              value={option.value}
              onChange={(event) => setOption(index, { value: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="link-button destructive-text"
            onClick={() => onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
          >
            {t.about.remove}
          </button>
        </div>
      ))}
      {draft.options.length < MAX_DONATE_OPTIONS && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange({ ...draft, options: [...draft.options, { label: "", value: "" }] })}
        >
          {t.about.add}
        </button>
      )}
    </>
  );
}

/** What the app is, who made it, where the code lives, and how to support it. */
export function About(props: { active: boolean }) {
  const me = useMe();
  const [about, setAbout] = useState<AboutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.about().then(setAbout, (e: unknown) => setError(errorCode(e)));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const cleaned = draft ? cleanDraft(draft) : null;
  const save = async () => {
    if (saving || !cleaned?.complete) return;
    setSaving(true);
    setSaveError(null);
    try {
      setAbout(await api.updateAbout({ donate_note: cleaned.note, donate_options: cleaned.options }));
      setDraft(null);
      setSaved(true);
      haptic("success");
    } catch (e) {
      haptic("error");
      setSaveError(errorCode(e));
    } finally {
      setSaving(false);
    }
  };

  useMainButton(
    props.active && draft
      ? { text: t.about.save, onClick: () => void save(), enabled: cleaned?.complete, loading: saving }
      : null,
  );

  const startEditing = () => {
    if (!about) return;
    setSaved(false);
    setSaveError(null);
    const options = about.donate_options.length > 0 ? about.donate_options : [{ label: "", value: "" }];
    setDraft({ note: about.donate_note, options });
  };

  const hasDonateInfo = about !== null && (about.donate_note !== "" || about.donate_options.length > 0);
  return (
    <div className="screen">
      <h1 className="title">{t.about.title}</h1>
      <p className="small">{t.about.body}</p>

      <div className="detail">
        <Row label={t.about.madeBy}>
          <span>{AUTHOR_NAME}</span>
          <button type="button" className="link-button small" onClick={() => openTelegramLink(AUTHOR_URL)}>
            @{AUTHOR_USERNAME}
          </button>
        </Row>
        <Row label={t.about.source}>
          <button type="button" className="link-button" onClick={() => openLink(REPO_URL)}>
            {t.about.github}
          </button>
        </Row>
      </div>
      <div className="about-links small">
        <button type="button" className="link-button" onClick={() => openLink(TERMS_URL)}>
          {t.about.terms}
        </button>
        <button type="button" className="link-button" onClick={() => openLink(PRIVACY_URL)}>
          {t.about.privacy}
        </button>
      </div>

      {error && <ErrorBox code={error} onRetry={load} />}
      {!about && !error && <Loading />}
      {about && (hasDonateInfo || me.is_owner) && (
        <section className="section">
          <div className="support-head">
            <span className="support-icon">
              <HeartIcon />
            </span>
            <span>
              <h2 className="support-title">{t.about.support}</h2>
              <span className="support-tagline">{t.about.supportTagline}</span>
            </span>
          </div>
          <div className="section-body">
            {draft ? (
              <>
                <DonateEditor draft={draft} onChange={setDraft} />
                {cleaned && !cleaned.complete && <p className="field-error">{t.about.incomplete}</p>}
                {saveError && <ErrorBox code={saveError} />}
                <button type="button" className="link-button center" onClick={() => setDraft(null)}>
                  {t.about.cancel}
                </button>
              </>
            ) : (
              <>
                {hasDonateInfo ? <DonateList about={about} /> : <p className="hint small">{t.about.noOptions}</p>}
                <p className="hint small">{t.about.supportHint}</p>
                {saved && (
                  <p className="saved" role="status">
                    <CheckIcon />
                    {t.about.saved}
                  </p>
                )}
                {me.is_owner && (
                  <button type="button" className="secondary-button" onClick={startEditing}>
                    {t.about.edit}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

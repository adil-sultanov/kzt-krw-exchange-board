import { useState } from "react";
import { api, errorCode } from "../api";
import { CheckIcon } from "../components/icons";
import { ErrorBox, Notice } from "../components/ui";
import { t } from "../i18n";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import { MAX_REPORT_NOTE_LENGTH, type ReportCategory, type ReportTarget } from "../types";

// A request can only be fake or a scam; paying and replying happen once a deal is accepted.
const CATEGORIES: Record<ReportTarget["kind"], ReportCategory[]> = {
  request: ["scam", "spam", "other"],
  deal: ["no_payment", "disappeared", "scam", "other"],
};

/** Report someone else's request, or the other side of the viewer's accepted deal, to admins. */
export function Report(props: { target: ReportTarget; active: boolean }) {
  const nav = useNav();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDeal = props.target.kind === "deal";

  const send = async () => {
    if (sending || !category) return;
    setSending(true);
    setError(null);
    try {
      await api.report(props.target, { category, note: note.trim() });
      haptic("success");
      setSent(true);
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
    } finally {
      setSending(false);
    }
  };

  useMainButton(
    !props.active
      ? null
      : sent
        ? { text: t.report.done, onClick: nav.pop }
        : { text: t.report.submit, onClick: () => void send(), enabled: category !== null, loading: sending },
  );

  if (sent) {
    return (
      <div className="screen">
        <div className="success-head">
          <span className="success-icon">
            <CheckIcon />
          </span>
          <h1 className="title">{t.report.sent}</h1>
          <p className="hint">{t.report.sentBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="title">{isDeal ? t.report.titleDeal : t.report.title}</h1>
      <Notice>{isDeal ? t.report.introDeal : t.report.introRequest}</Notice>

      <section className="section">
        <h2 className="section-title">{t.report.reason}</h2>
        <div className="choice-list" role="radiogroup" aria-label={t.report.reason}>
          {CATEGORIES[props.target.kind].map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={category === option}
              className={category === option ? "choice selected" : "choice"}
              onClick={() => {
                haptic("selection");
                setCategory(option);
              }}
            >
              <span className="choice-mark" aria-hidden="true" />
              {t.report.categories[option]}
            </button>
          ))}
        </div>
      </section>

      <label className="field">
        <span className="field-label">{t.report.note}</span>
        <textarea
          className="input textarea"
          rows={4}
          maxLength={MAX_REPORT_NOTE_LENGTH}
          placeholder={t.report.notePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error && <ErrorBox code={error} />}
    </div>
  );
}

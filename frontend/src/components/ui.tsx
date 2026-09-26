import { type ReactNode, useState } from "react";
import { formatAmountInput } from "../format";
import { errorMessage, t } from "../i18n";
import { AUTHOR_URL, AUTHOR_USERNAME } from "../links";
import { haptic, openTelegramLink } from "../telegram";
import { RefreshIcon } from "./icons";

interface Option<T> {
  value: T;
  label: string;
}

/** Pick exactly one option. */
export function Segmented<T extends string | number>(props: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {props.options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          className={option.value === props.value ? "selected" : ""}
          onClick={() => {
            if (option.value !== props.value) haptic("selection");
            props.onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Section(props: { title?: string; children: ReactNode }) {
  return (
    <section className="section">
      {props.title && <h2 className="section-title">{props.title}</h2>}
      <div className="section-body">{props.children}</div>
    </section>
  );
}

export function Loading() {
  return <p className="hint center">{t.loading}</p>;
}

export function ErrorBox(props: { code: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{errorMessage(props.code)}</p>
      {props.onRetry && (
        <button type="button" className="link-button" onClick={props.onRetry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}

/** Whole-number input with thousands separators and a numeric keyboard. */
export function AmountInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  label: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        className={props.invalid ? "input invalid" : "input"}
        inputMode="numeric"
        autoComplete="off"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(formatAmountInput(event.target.value))}
      />
    </label>
  );
}

// Keeps the spinner up long enough to see, even when the reload is instant.
const MIN_SPIN_MS = 500;

/** A refresh button that spins until `onRefresh` settles. */
export function RefreshButton(props: { onRefresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    haptic("selection");
    await Promise.all([props.onRefresh(), new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS))]);
    setBusy(false);
  };
  return (
    <button type="button" className="refresh-button" disabled={busy} onClick={() => void refresh()}>
      <RefreshIcon spinning={busy} />
      {t.refresh}
    </button>
  );
}

/** Screen title with a refresh button next to it. */
export function TitleWithRefresh(props: { title: string; onRefresh: () => Promise<unknown> }) {
  return (
    <div className="title-row">
      <h1 className="title">{props.title}</h1>
      <RefreshButton onRefresh={props.onRefresh} />
    </div>
  );
}

/** A label / value line inside a `.detail` block. */
export function Row(props: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="hint">{props.label}</span>
      <span className="detail-value">{props.children}</span>
    </div>
  );
}

/** Small author credit under every screen. */
export function Footer() {
  return (
    <footer className="footer">
      <button type="button" className="footer-link" onClick={() => openTelegramLink(AUTHOR_URL)}>
        {t.footer.madeBy(AUTHOR_USERNAME)}
      </button>
    </footer>
  );
}

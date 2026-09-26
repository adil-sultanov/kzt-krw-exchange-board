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
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
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
  return (
    <div className="loading" role="status" aria-label={t.loading}>
      <span className="spinner" />
    </div>
  );
}

/** Placeholder cards while a list loads. */
export function SkeletonList(props: { count?: number }) {
  return (
    <div className="list" role="status" aria-label={t.loading}>
      {Array.from({ length: props.count ?? 3 }, (_, index) => (
        <div key={index} className="card skeleton">
          <span className="skeleton-line short" />
          <span className="skeleton-line" />
          <span className="skeleton-line shorter" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox(props: { code: string; onRetry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <p>{errorMessage(props.code)}</p>
      {props.onRetry && (
        <button type="button" className="link-button" onClick={props.onRetry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}

/** A short message in a tinted box: `info` for guidance, `warning` for what blocks an action. */
export function Notice(props: { children: ReactNode; tone?: "info" | "warning" }) {
  return <div className={`notice ${props.tone ?? "info"}`}>{props.children}</div>;
}

export function Empty(props: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{props.title}</p>
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}

/** Whole-number input with thousands separators, a numeric keyboard and a currency suffix. */
export function AmountInput(props: {
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  placeholder?: string;
  invalid?: boolean;
  label: string;
  large?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <span className={`input-wrap${props.invalid ? " invalid" : ""}${props.large ? " large" : ""}`}>
        <input
          className="input-bare"
          inputMode="numeric"
          autoComplete="off"
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(formatAmountInput(event.target.value))}
        />
        <span className="input-suffix">{props.suffix}</span>
      </span>
    </label>
  );
}

// Keeps the spinner up long enough to see, even when the reload is instant.
const MIN_SPIN_MS = 500;

/** A round refresh button that spins until `onRefresh` settles. */
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
    <button
      type="button"
      className="icon-button"
      aria-label={t.refresh}
      title={t.refresh}
      disabled={busy}
      onClick={() => void refresh()}
    >
      <RefreshIcon spinning={busy} />
    </button>
  );
}

/** Screen title (with an optional small label above it) and a refresh button next to it. */
export function TitleWithRefresh(props: {
  title: string;
  eyebrow?: string;
  onRefresh: () => Promise<unknown>;
}) {
  return (
    <div className="title-row">
      <div className="title-block">
        {props.eyebrow && <span className="eyebrow">{props.eyebrow}</span>}
        <h1 className="title">{props.title}</h1>
      </div>
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

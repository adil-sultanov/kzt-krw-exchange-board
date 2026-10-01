import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { errorMessage, t } from "../i18n";
import { AUTHOR_URL, AUTHOR_USERNAME } from "../links";
import { copyText, haptic, openTelegramLink } from "../telegram";
import { CheckIcon, RefreshIcon } from "./icons";

interface Option<T> {
  value: T;
  label: string;
}

/** Pick exactly one option. The highlight slides over to the one picked. */
export function Segmented<T extends string | number>(props: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const index = props.options.findIndex((option) => option.value === props.value);
  const thumb = { "--count": props.options.length, "--index": index } as CSSProperties;
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {index >= 0 && <span className="segmented-thumb" style={thumb} aria-hidden="true" />}
      {props.options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          className={option.value === props.value ? "selected" : ""}
          onClick={() => {
            if (option.value === props.value) return;
            haptic("selection");
            props.onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A checkbox with its label; the box fills in and the check pops in when it's ticked. */
export function Checkbox(props: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className={props.checked ? "checkbox checked" : "checkbox"}>
      <input
        type="checkbox"
        className="checkbox-input"
        checked={props.checked}
        onChange={(event) => {
          haptic("selection");
          props.onChange(event.target.checked);
        }}
      />
      <span className="checkbox-box" aria-hidden="true">
        {props.checked && <CheckIcon />}
      </span>
      <span>{props.children}</span>
    </label>
  );
}

/**
 * Content that folds away smoothly (height and fade) rather than popping in and out. It stays
 * mounted while folded, out of reach of taps and focus.
 */
export function Collapse(props: { open: boolean; children: ReactNode }) {
  return (
    <div className={props.open ? "collapse open" : "collapse"} aria-hidden={!props.open || undefined} inert={!props.open}>
      <div className="collapse-inner">{props.children}</div>
    </div>
  );
}

/**
 * The class for a tab's content, keyed by `tab` so it remounts on a new one: it slides in from
 * the side of the tab picked (by `index`, its place among the tabs), or fades in when the tab
 * is the same (e.g. a new sort). `null` while nothing is shown; the first tab shown plays nothing.
 */
export function useTabEnter(tab: string | null, index: number): string {
  const [state, setState] = useState<{ tab: string | null; index: number; enter: string }>({ tab, index, enter: "" });
  if (state.tab !== tab) {
    const enter =
      state.tab === null || tab === null
        ? ""
        : index > state.index
          ? "from-right"
          : index < state.index
            ? "from-left"
            : "fade";
    setState({ tab, index, enter });
  }
  return state.tab === tab ? state.enter : "";
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

/**
 * A round refresh button that spins until `onRefresh` settles. The spin always ends on a full
 * turn (so at least one, even when the reload is instant): stopping mid-turn would snap it back.
 */
export function RefreshButton(props: { onRefresh: () => Promise<unknown> }) {
  const [spinning, setSpinning] = useState(false);
  const loading = useRef(false);
  const refresh = async () => {
    if (spinning) return;
    loading.current = true;
    setSpinning(true);
    haptic("selection");
    try {
      await props.onRefresh();
    } finally {
      loading.current = false;
    }
  };
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={t.refresh}
      title={t.refresh}
      disabled={spinning}
      onClick={() => void refresh()}
      onAnimationIteration={() => {
        if (!loading.current) setSpinning(false);
      }}
    >
      <RefreshIcon spinning={spinning} />
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

const COPIED_MS = 2000;

/** Copies `text`, then reads "Copied" for a moment. */
export function CopyButton(props: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    if (await copyText(props.text)) {
      setCopied(true);
      haptic("success");
    } else {
      haptic("error");
    }
  };
  return (
    <button type="button" className={copied ? "copy-button copied" : "copy-button"} onClick={() => void copy()}>
      {copied ? t.deal.copied : t.deal.copy}
    </button>
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

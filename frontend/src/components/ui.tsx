import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { errorMessage, t } from "../i18n";
import { AUTHOR_URL, AUTHOR_USERNAME } from "../links";
import { copyText, haptic, openTelegramLink } from "../telegram";
import { CheckIcon, ChevronIcon, RefreshIcon } from "./icons";

interface Option<T> {
  value: T;
  label: string;
  /** How many it holds, after the label. */
  count?: number;
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
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
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

/** A group of cards under its title, with how many it holds (e.g. My deals' Active). */
export function Group(props: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">
        {props.title}
        <span className="section-count">{props.count}</span>
      </h2>
      {props.children}
    </section>
  );
}

function readFolded(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A group of cards the viewer can hide and show (e.g. My deals' Completed, a user's recent deals
 * in Admin: users): a row like the Profile's menu (an icon tinted by `tone`, blue by default; the
 * title, how many it holds and a chevron), the cards under it. Open at first; the choice is
 * remembered on this device under `storageKey`.
 */
export function FoldableGroup(props: {
  title: string;
  count: number;
  icon: ReactNode;
  tone?: "positive" | "muted";
  storageKey: string;
  children: ReactNode;
}) {
  const [folded, setFolded] = useState(() => readFolded(props.storageKey));
  const toggle = () => {
    haptic("selection");
    setFolded(!folded);
    try {
      localStorage.setItem(props.storageKey, folded ? "0" : "1");
    } catch {
      // Not remembered then; it still folds.
    }
  };
  return (
    <div className="history-group">
      <button type="button" className="history-row" aria-expanded={!folded} onClick={toggle}>
        <span className={props.tone ? `menu-icon ${props.tone}` : "menu-icon"} aria-hidden="true">
          {props.icon}
        </span>
        <span className="history-label">{props.title}</span>
        <span className="history-count">{props.count}</span>
        <ChevronIcon open={!folded} />
      </button>
      <Collapse open={!folded}>
        <div className="list">{props.children}</div>
      </Collapse>
    </div>
  );
}

/** Nothing to show: a centered card like the Profile's head, with an icon. */
export function EmptyCard(props: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="deals-empty">
      <span className="hero-icon" aria-hidden="true">
        {props.icon}
      </span>
      <p className="empty-title">{props.title}</p>
      {props.hint && <p className="hint small">{props.hint}</p>}
    </div>
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

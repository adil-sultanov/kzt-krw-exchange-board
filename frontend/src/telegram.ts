// Typed access to the Telegram Mini App SDK (loaded by telegram-web-app.js in index.html).
// Only the parts this app uses are declared. https://core.telegram.org/bots/webapps
import { useEffect, useRef } from "react";

interface BottomButton {
  setParams(params: { text?: string; color?: string; is_active?: boolean; is_visible?: boolean }): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface BackButton {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface PopupButton {
  id?: string;
  type?: "default" | "ok" | "close" | "cancel" | "destructive";
  text?: string;
}

interface ThemeParams {
  button_color?: string;
  hint_color?: string;
  secondary_bg_color?: string;
}

interface WebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  version: string;
  /** Bot API 8.0+: false while the Mini App is minimized. */
  isActive?: boolean;
  themeParams: ThemeParams;
  MainButton: BottomButton;
  BackButton: BackButton;
  HapticFeedback: {
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  isVersionAtLeast(version: string): boolean;
  /** "activated" (Bot API 8.0+) fires when a minimized Mini App is opened again. */
  onEvent(event: "activated", callback: () => void): void;
  offEvent(event: "activated", callback: () => void): void;
  ready(): void;
  expand(): void;
  disableVerticalSwipes(): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showConfirm(message: string, callback: (confirmed: boolean) => void): void;
  showPopup(
    params: { title?: string; message: string; buttons?: PopupButton[] },
    callback?: (buttonId: string) => void,
  ): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

export const tg: WebApp | undefined = window.Telegram?.WebApp;

/** True when opened from Telegram with signed launch data. */
export const insideTelegram = Boolean(tg?.initData);

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Stops a downward swipe on long lists from closing the app.
  if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();
}

/**
 * Which screen to open at launch, e.g. `deal_45`. Direct links (`t.me/bot/app?startapp=`)
 * put it in initData; the bot's web_app buttons can't, so they pass `?startapp=` in the URL.
 */
export function startParam(): string | undefined {
  return tg?.initDataUnsafe.start_param ?? new URLSearchParams(window.location.search).get("startapp") ?? undefined;
}

export function haptic(type: "error" | "success" | "warning" | "selection"): void {
  if (!tg?.isVersionAtLeast("6.1")) return;
  if (type === "selection") tg.HapticFeedback.selectionChanged();
  else tg.HapticFeedback.notificationOccurred(type);
}

export function openLink(url: string): void {
  if (tg) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Opens a t.me link inside Telegram (e.g. a user's chat) without leaving the app awkwardly. */
export function openTelegramLink(url: string): void {
  if (tg?.isVersionAtLeast("6.1")) tg.openTelegramLink(url);
  else openLink(url);
}

/**
 * Copies text to the clipboard; resolves false if it couldn't. Some Telegram webviews
 * lack the async clipboard API, so this falls back to a hidden textarea.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** Native confirm popup; resolves true if the user agreed. */
export function confirm(message: string): Promise<boolean> {
  if (!tg?.isVersionAtLeast("6.2")) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => tg.showConfirm(message, resolve));
}

/**
 * Native popup with a button per option (at most two) plus Cancel; resolves the chosen
 * option's id, or null. Without popups, falls back to confirming the last option.
 */
export function choose<T extends string>(message: string, options: { id: T; text: string }[]): Promise<T | null> {
  if (!tg?.isVersionAtLeast("6.2")) {
    const last = options[options.length - 1];
    return Promise.resolve(last && window.confirm(`${message}\n\n${last.text}`) ? last.id : null);
  }
  const buttons: PopupButton[] = options.map((option) => ({ id: option.id, text: option.text }));
  buttons.push({ type: "cancel" });
  return new Promise((resolve) =>
    tg.showPopup({ message, buttons }, (id) => resolve(options.find((option) => option.id === id)?.id ?? null)),
  );
}

export interface MainButtonConfig {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  loading?: boolean;
}

/**
 * Shows Telegram's MainButton while `config` is non-null. Only the active screen
 * should pass a config: React runs all effect cleanups (hide) before new effects
 * (show), so switching screens hands the button over cleanly.
 */
export function useMainButton(config: MainButtonConfig | null): void {
  const onClickRef = useRef(config?.onClick);
  onClickRef.current = config?.onClick;
  const shown = config !== null;

  useEffect(() => {
    if (!tg || !shown) return;
    const button = tg.MainButton;
    const handler = () => onClickRef.current?.();
    button.onClick(handler);
    button.show();
    return () => {
      button.offClick(handler);
      button.hideProgress();
      button.hide();
    };
  }, [shown]);

  const text = config?.text;
  const enabled = config?.enabled ?? true;
  const loading = config?.loading ?? false;
  useEffect(() => {
    if (!tg || text === undefined) return;
    const theme = tg.themeParams;
    tg.MainButton.setParams({
      text,
      is_active: enabled && !loading,
      color: enabled ? theme.button_color : (theme.hint_color ?? theme.button_color),
    });
    if (loading) tg.MainButton.showProgress(false);
    else tg.MainButton.hideProgress();
  }, [text, enabled, loading]);
}

/** Shows Telegram's BackButton while `onBack` is non-null. */
export function useBackButton(onBack: (() => void) | null): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const shown = onBack !== null;

  useEffect(() => {
    if (!tg || !shown) return;
    const handler = () => onBackRef.current?.();
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
    return () => {
      tg.BackButton.offClick(handler);
      tg.BackButton.hide();
    };
  }, [shown]);
}

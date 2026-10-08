import { t } from "./i18n";
import type { Currency, Profile, RequestStatus, Side } from "./types";

export const SYMBOL: Record<Currency, string> = { KZT: "₸", KRW: "₩" };

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const kstFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const kstTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
});
const kstDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", dateStyle: "short" });

export function formatNumber(value: number): string {
  return integer.format(value);
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${integer.format(amount)} ${SYMBOL[currency]}`;
}

/** An amount someone pays or gets, e.g. "≈ 270,450 ₩" when it follows the market rate. */
export function formatSide(side: Side): string {
  if (side.amount === null) return t.side.unknown(SYMBOL[side.currency]);
  const money = formatMoney(side.amount, side.currency);
  return side.approx ? t.side.approx(money) : money;
}

/** A request's status, telling an admin's removal apart from its author cancelling it. */
export function requestStatus(request: { status: RequestStatus; removed_by_admin: boolean }): string {
  return request.status === "closed" && request.removed_by_admin ? t.removedStatus : t.status[request.status];
}

/** "Adil Sultanov, UNIST, 2022", or whatever part of it is filled in (null if none). */
export function formatProfile(profile: Profile | null): string | null {
  if (!profile) return null;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const parts = [name, profile.university, profile.enrollment_year?.toString()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatRate(rate: number): string {
  return rateFormat.format(rate);
}

/** "1 ₸ = 2.70 ₩". Rates are always KRW per 1 KZT. */
export function formatRatePair(rate: number): string {
  return t.rate.pair(formatRate(rate));
}

/** Timestamps are UTC in the API and shown in Korea time. */
export function formatKst(iso: string): string {
  return t.time.kst(kstFormat.format(new Date(iso)));
}

/** Just the time if it's today in Korea, else the date and time. */
export function formatKstShort(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  const today = kstDay.format(date) === kstDay.format(new Date(now));
  return t.time.kst((today ? kstTime : kstFormat).format(date));
}

/** How long ago, roughly: "just now", "5m ago", "3h ago", "2d ago"; past a month, the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t.time.justNow;
  if (minutes < 60) return t.time.ago(t.time.minutes(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.time.ago(t.time.hours(hours));
  const days = Math.floor(hours / 24);
  return days <= 30 ? t.time.ago(t.time.days(days)) : formatKstShort(iso, now);
}

export function timeLeft(expiresAt: string, now: number = Date.now()): string | null {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  if (days > 0) return `${t.time.days(days)} ${t.time.hours(hours)}`;
  if (hours > 0) return `${t.time.hours(hours)} ${t.time.minutes(minutes % 60)}`;
  return t.time.minutes(Math.max(minutes, 1));
}

const MAX_AMOUNT_DIGITS = 9;

/** Keeps only digits and adds thousands separators, for amount inputs. */
export function formatAmountInput(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_AMOUNT_DIGITS);
  return digits ? integer.format(Number(digits)) : "";
}

export function parseAmount(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}


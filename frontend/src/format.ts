import { t } from "./i18n";
import type { Currency, Side } from "./types";

export const SYMBOL: Record<Currency, string> = { KZT: "₸", KRW: "₩" };

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const percentFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
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

export function formatRate(rate: number): string {
  return rateFormat.format(rate);
}

/** "1 ₸ = 2.7045 ₩". Rates are always KRW per 1 KZT. */
export function formatRatePair(rate: number): string {
  return t.rate.pair(formatRate(rate));
}

export function formatPercent(percent: number): string {
  return `${percentFormat.format(percent)}%`;
}

export type RateTone = "market" | "better" | "worse";

/** How the rate compares to the market for the viewer (see viewerRateGain). */
export function rateTone(gain: number): RateTone {
  return gain > 0 ? "better" : gain < 0 ? "worse" : "market";
}

export function describeRateGain(gain: number): string {
  const tone = rateTone(gain);
  return tone === "market" ? t.rate.market : t.rate[tone](formatPercent(Math.abs(gain)));
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

/** Keeps a decimal number as typed (comma accepted), with at most `decimals` places. */
export function formatDecimalInput(text: string, decimals: number): string {
  const [whole = "", ...rest] = text.replace(/,/g, ".").replace(/[^\d.]/g, "").split(".");
  if (rest.length === 0) return whole.slice(0, 3);
  return `${whole.slice(0, 3) || "0"}.${rest.join("").slice(0, decimals)}`;
}

export function parseDecimal(text: string): number | null {
  if (!text || text === ".") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

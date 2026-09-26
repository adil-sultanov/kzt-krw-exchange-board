import { t } from "./i18n";
import type { Currency, ExchangeRequest } from "./types";

const SYMBOL: Record<Currency, string> = { KZT: "₸", KRW: "₩" };

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const kstFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatNumber(value: number): string {
  return integer.format(value);
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${integer.format(amount)} ${SYMBOL[currency]}`;
}

export function formatRate(rate: number): string {
  return rateFormat.format(rate);
}

export function formatPercent(percent: number): string {
  return `${percent}%`;
}

/** How the request's rate reads, e.g. "Market rate (≈ 2.70)" or "1.5% above market (≈ 2.74)". */
export function describeRate(request: Pick<ExchangeRequest, "rate_value" | "effective_rate">): string {
  const offset = request.rate_value;
  const base =
    offset > 0
      ? t.rate.above(formatPercent(offset))
      : offset < 0
        ? t.rate.below(formatPercent(-offset))
        : t.rate.market;
  return request.effective_rate === null ? base : t.rate.now(base, formatRate(request.effective_rate));
}

/** What the author gets for their amount at `rate` (KRW per 1 KZT). */
export function convert(amount: number, from: Currency, rate: number): number {
  return from === "KZT" ? amount * rate : amount / rate;
}

/** Timestamps are UTC in the API and shown in Korea time. */
export function formatKst(iso: string): string {
  return t.time.kst(kstFormat.format(new Date(iso)));
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

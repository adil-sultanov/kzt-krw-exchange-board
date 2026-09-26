import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { ExchangeBox, ExchangeRow } from "../components/Exchange";
import { ErrorBox, Notice, Section, Segmented } from "../components/ui";
import {
  formatAmountInput,
  formatDecimalInput,
  formatRatePair,
  formatSide,
  parseAmount,
  parseDecimal,
} from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  convert,
  type Currency,
  CURRENCIES,
  DURATIONS,
  type DurationDays,
  giveCurrency,
  MAX_AMOUNT,
  MAX_MARKET_OFFSET,
  postDirection,
  type RequestCreate,
} from "../types";

/**
 * The rate compared to the market, from the author's side: asking for more than the market
 * gives them more of what they get; offering more gives the other side a better rate.
 */
type RateChoice = "market" | "ask" | "offer";
const RATE_CHOICES: RateChoice[] = ["market", "ask", "offer"];

interface FormErrors {
  amount?: string;
  rate?: string;
}

export function NewRequest(props: { active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const [buy, setBuy] = useState<Currency>("KRW");
  const [amountText, setAmountText] = useState("");
  const [rateChoice, setRateChoice] = useState<RateChoice>("market");
  const [percentText, setPercentText] = useState("");
  const [duration, setDuration] = useState<DurationDays>(3);
  const [referenceRate, setReferenceRate] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rate().then((r) => setReferenceRate(r.rate), () => setReferenceRate(null));
  }, []);

  const direction = postDirection(buy);
  const pay = giveCurrency(direction);
  const amount = parseAmount(amountText);
  const percent = rateChoice === "market" ? 0 : parseDecimal(percentText);
  // The offset is on the rate (KRW per 1 KZT): more KRW per KZT is more for whoever gets KRW.
  const gainSign = rateChoice === "offer" ? -1 : 1;
  const offset = (buy === "KRW" ? gainSign : -gainSign) * (percent ?? 0);
  const effectiveRate = referenceRate !== null ? referenceRate * (1 + offset / 100) : null;

  const errors: FormErrors = {};
  if (amount === null || amount <= 0) errors.amount = t.form.errors.amount;
  else if (amount > MAX_AMOUNT) errors.amount = t.form.errors.amountTooLarge;
  if (rateChoice !== "market") {
    if (percent === null || percent <= 0) errors.rate = t.form.errors.percent;
    else if (percent > MAX_MARKET_OFFSET) errors.rate = t.form.errors.percentRange(MAX_MARKET_OFFSET);
  }
  const valid = Object.keys(errors).length === 0;

  const submit = async () => {
    if (!valid || amount === null) {
      setShowErrors(true);
      haptic("error");
      return;
    }
    const body: RequestCreate = {
      direction,
      amount,
      rate_value: offset,
      duration_days: duration,
    };
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createRequest(body);
      haptic("success");
      nav.replace({ name: "created", result });
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
      setSubmitting(false);
    }
  };

  const blocked = me.is_banned ? t.form.banned : !me.username ? t.form.usernameRequired : null;

  useMainButton(
    props.active && !blocked
      ? { text: t.form.submit, onClick: submit, enabled: valid || !showErrors, loading: submitting }
      : null,
  );

  if (blocked) {
    return (
      <div className="screen">
        <h1 className="title">{t.form.title}</h1>
        <Notice tone="warning">{blocked}</Notice>
      </div>
    );
  }

  const shown = showErrors ? errors : {};
  const gets =
    amount !== null && effectiveRate !== null && !errors.amount && !errors.rate
      ? convert(amount, pay, effectiveRate)
      : null;
  return (
    <div className="screen">
      <h1 className="title">{t.form.title}</h1>

      <Segmented
        options={CURRENCIES.map((currency) => ({ value: currency, label: t.buy[currency] }))}
        value={buy}
        onChange={setBuy}
      />

      <ExchangeBox
        pay={
          <ExchangeRow label={t.side.pay} currency={pay}>
            <input
              className={shown.amount ? "exchange-input invalid" : "exchange-input"}
              inputMode="numeric"
              autoComplete="off"
              aria-label={t.side.pay}
              aria-invalid={Boolean(shown.amount)}
              placeholder={t.form.amountPlaceholder}
              value={amountText}
              onChange={(event) => setAmountText(formatAmountInput(event.target.value))}
            />
          </ExchangeRow>
        }
        get={
          <ExchangeRow label={t.side.get} currency={buy} emphasis>
            <span className={gets === null ? "hint" : undefined}>
              {/* "≈ 0" until there's an amount; "—" without a market rate to convert at. */}
              {formatSide({ currency: buy, amount: gets ?? (referenceRate === null ? null : 0), approx: true })}
            </span>
          </ExchangeRow>
        }
      />
      {shown.amount && <p className="field-error">{shown.amount}</p>}

      <Section title={t.form.rate}>
        <Segmented
          options={RATE_CHOICES.map((choice) => ({ value: choice, label: t.form.rateChoice[choice] }))}
          value={rateChoice}
          onChange={setRateChoice}
        />
        {rateChoice !== "market" && (
          <label className="inline-field">
            <span>{t.form.percentLabel}</span>
            <span className={shown.rate ? "input-wrap compact invalid" : "input-wrap compact"}>
              <input
                className="input-bare"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t.form.percentPlaceholder}
                value={percentText}
                onChange={(event) => setPercentText(formatDecimalInput(event.target.value, 2))}
              />
              <span className="input-suffix">%</span>
            </span>
          </label>
        )}
        {shown.rate && <p className="field-error">{shown.rate}</p>}
        <p className="hint small">
          {t.form.rateHint[rateChoice]}{" "}
          {effectiveRate === null
            ? t.rate.unavailable
            : !errors.rate && <span className="nowrap">{t.form.rateNow(formatRatePair(effectiveRate))}</span>}
        </p>
      </Section>

      <Section title={t.form.duration}>
        <Segmented
          options={DURATIONS.map((d) => ({ value: d, label: t.form.days(d) }))}
          value={duration}
          onChange={setDuration}
        />
        <p className="hint small">{t.form.durationHint}</p>
      </Section>

      {error && <ErrorBox code={error} />}
      <p className="hint small center">{t.form.disclaimer}</p>
    </div>
  );
}

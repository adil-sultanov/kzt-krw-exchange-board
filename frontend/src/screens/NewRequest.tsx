import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { AmountInput, ErrorBox, Section, Segmented } from "../components/ui";
import { convert, formatDecimalInput, formatMoney, formatRate, parseAmount, parseDecimal } from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  type Direction,
  DIRECTIONS,
  DURATIONS,
  type DurationDays,
  getCurrency,
  giveCurrency,
  MAX_AMOUNT,
  MAX_MARKET_OFFSET,
  type RequestCreate,
} from "../types";

/** The rate relative to the reference (market) rate. */
type RateChoice = "market" | "above" | "below";
const RATE_CHOICES: RateChoice[] = ["market", "above", "below"];

interface FormErrors {
  amount?: string;
  rate?: string;
}

export function NewRequest(props: { active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const [direction, setDirection] = useState<Direction>("KZT_KRW");
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

  const give = giveCurrency(direction);
  const amount = parseAmount(amountText);
  const percent = rateChoice === "market" ? 0 : parseDecimal(percentText);
  const offset = (rateChoice === "below" ? -1 : 1) * (percent ?? 0);
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
        <p className="notice">{blocked}</p>
      </div>
    );
  }

  const shown = showErrors ? errors : {};
  return (
    <div className="screen">
      <h1 className="title">{t.form.title}</h1>

      <Section title={t.form.direction}>
        <Segmented
          options={DIRECTIONS.map((d) => ({ value: d, label: t.direction[d] }))}
          value={direction}
          onChange={setDirection}
        />
        <AmountInput
          label={t.form.amount(give)}
          value={amountText}
          onChange={setAmountText}
          placeholder={t.form.amountPlaceholder}
          invalid={Boolean(shown.amount)}
        />
        {shown.amount && <p className="field-error">{shown.amount}</p>}
        {amount !== null && effectiveRate !== null && effectiveRate > 0 && !errors.amount && (
          <p className="hint small">
            {t.form.amountHint(formatMoney(convert(amount, give, effectiveRate), getCurrency(direction)))}
          </p>
        )}
      </Section>

      <Section title={t.form.rate}>
        <Segmented
          options={RATE_CHOICES.map((choice) => ({ value: choice, label: t.form.rateChoice[choice] }))}
          value={rateChoice}
          onChange={setRateChoice}
        />
        {rateChoice !== "market" && (
          <label className="field">
            <span className="field-label">{t.form.percentLabel[rateChoice]}</span>
            <input
              className={shown.rate ? "input invalid" : "input"}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t.form.percentPlaceholder}
              value={percentText}
              onChange={(event) => setPercentText(formatDecimalInput(event.target.value, 2))}
            />
          </label>
        )}
        {shown.rate && <p className="field-error">{shown.rate}</p>}
        {!errors.rate && (
          <p className="hint small">
            {effectiveRate !== null ? t.form.rateHint(formatRate(effectiveRate)) : t.rate.unavailable}
          </p>
        )}
        <p className="hint small">{t.form.rateExplainer}</p>
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
      <p className="hint small">{t.form.disclaimer}</p>
    </div>
  );
}

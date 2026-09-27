import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { ExchangeBox, ExchangeRow } from "../components/Exchange";
import { ErrorBox, Notice, Section, Segmented } from "../components/ui";
import {
  formatAmountInput,
  formatDecimalInput,
  formatRatePair,
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
  type ExchangeRequest,
  getCurrency,
  giveCurrency,
  MAX_AMOUNT,
  MAX_MARKET_OFFSET,
  postDirection,
  type RequestCreate,
  type RequestTerms,
  viewerRateGain,
} from "../types";

/**
 * The rate compared to the market, from the author's side: asking for more than the market
 * gives them more of what they get; offering more gives the other side a better rate.
 */
type RateChoice = "market" | "ask" | "offer";
const RATE_CHOICES: RateChoice[] = ["market", "ask", "offer"];

/** The side whose amount the viewer typed; the other is converted from it at the request's rate. */
type TypedSide = "pay" | "get";

interface FormErrors {
  amount?: string;
  rate?: string;
}

interface FormValues {
  buy: Currency;
  amountText: string;
  rateChoice: RateChoice;
  percentText: string;
}

/** The form showing an existing request's terms, from its author's side. */
function formValues(terms: RequestTerms): FormValues {
  const gain = viewerRateGain({ ...terms, is_own: true });
  return {
    buy: getCurrency(terms.direction),
    amountText: formatAmountInput(String(terms.amount)),
    rateChoice: gain > 0 ? "ask" : gain < 0 ? "offer" : "market",
    percentText: gain === 0 ? "" : formatDecimalInput(String(Math.abs(gain)), 2),
  };
}

/**
 * Posts a new request, optionally prefilled (`prefill`, "Post again"), or edits the amount and
 * rate of the viewer's open request (`edit`; its direction and expiry stay as they are).
 */
export function NewRequest(props: { active: boolean; prefill?: RequestTerms; edit?: ExchangeRequest }) {
  const me = useMe();
  const nav = useNav();
  const { edit } = props;
  const [initial] = useState(() => {
    const terms = edit ?? props.prefill;
    return terms ? formValues(terms) : null;
  });
  const [buy, setBuy] = useState<Currency>(initial?.buy ?? "KRW");
  const [typed, setTyped] = useState<TypedSide>("pay");
  const [amountText, setAmountText] = useState(initial?.amountText ?? "");
  const [rateChoice, setRateChoice] = useState<RateChoice>(initial?.rateChoice ?? "market");
  const [percentText, setPercentText] = useState(initial?.percentText ?? "");
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
  const typedAmount = parseAmount(amountText);
  const percent = rateChoice === "market" ? 0 : parseDecimal(percentText);
  // The offset is on the rate (KRW per 1 KZT): more KRW per KZT is more for whoever gets KRW.
  const gainSign = rateChoice === "offer" ? -1 : 1;
  const offset = (buy === "KRW" ? gainSign : -gainSign) * (percent ?? 0);
  const effectiveRate = referenceRate !== null ? referenceRate * (1 + offset / 100) : null;
  const converted = (value: number | null, from: Currency) =>
    value !== null && effectiveRate !== null ? Math.round(convert(value, from, effectiveRate)) : null;
  // The request's amount is always what the author pays.
  const amount = typed === "pay" ? typedAmount : converted(typedAmount, buy);
  const gets = typed === "get" ? typedAmount : converted(amount, pay);

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
    setSubmitting(true);
    setError(null);
    try {
      if (edit) {
        await api.updateRequest(edit.id, { amount, rate_value: offset });
        haptic("success");
        nav.pop();
        return;
      }
      const body: RequestCreate = {
        direction,
        amount,
        rate_value: offset,
        duration_days: duration,
      };
      const result = await api.createRequest(body);
      haptic("success");
      nav.replace({ name: "created", result });
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
      setSubmitting(false);
    }
  };

  // A username is needed to be contacted, which an existing request's author already was.
  const blocked = me.is_banned ? t.form.banned : !me.username && !edit ? t.form.usernameRequired : null;
  const title = edit ? t.form.editTitle : t.form.title;

  useMainButton(
    props.active && !blocked
      ? {
          text: edit ? t.form.save : t.form.submit,
          onClick: submit,
          enabled: valid || !showErrors,
          loading: submitting,
        }
      : null,
  );

  if (blocked) {
    return (
      <div className="screen">
        <h1 className="title">{title}</h1>
        <Notice tone="warning">{blocked}</Notice>
      </div>
    );
  }

  const shown = showErrors ? errors : {};
  const amountInput = (side: TypedSide) => {
    const value = side === typed ? amountText : formatAmountInput(String((side === "pay" ? amount : gets) ?? ""));
    const invalid = Boolean(shown.amount) && side === typed;
    const label = side === "pay" ? t.side.pay : t.side.get;
    // Without a market rate, only the amount paid can be entered.
    const disabled = side === "get" && effectiveRate === null;
    return (
      <input
        className={invalid ? "exchange-input invalid" : "exchange-input"}
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        placeholder={disabled ? t.side.unknown("").trim() : t.form.amountPlaceholder}
        value={value}
        onChange={(event) => {
          setTyped(side);
          setAmountText(formatAmountInput(event.target.value));
        }}
      />
    );
  };
  return (
    <div className="screen">
      {edit ? (
        <div className="title-block">
          <span className="eyebrow">{t.buy[buy]}</span>
          <h1 className="title">{title}</h1>
        </div>
      ) : (
        <>
          <h1 className="title">{title}</h1>
          <Segmented
            options={CURRENCIES.map((currency) => ({ value: currency, label: t.buy[currency] }))}
            value={buy}
            onChange={setBuy}
          />
        </>
      )}

      <ExchangeBox
        pay={
          <ExchangeRow label={t.side.pay} currency={pay}>
            {amountInput("pay")}
          </ExchangeRow>
        }
        get={
          <ExchangeRow label={t.side.get} currency={buy} emphasis>
            {amountInput("get")}
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

      {!edit && (
        <Section title={t.form.duration}>
          <Segmented
            options={DURATIONS.map((d) => ({ value: d, label: t.form.days(d) }))}
            value={duration}
            onChange={setDuration}
          />
          <p className="hint small">{t.form.durationHint}</p>
        </Section>
      )}

      {error && <ErrorBox code={error} />}
      <p className="hint small center">{t.form.disclaimer}</p>
    </div>
  );
}

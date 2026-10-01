import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { AmountInput, ExchangeBox, ExchangeRow } from "../components/Exchange";
import { ProfileRequired } from "../components/ProfileHint";
import { Checkbox, Collapse, ErrorBox, Notice, Section, Segmented } from "../components/ui";
import {
  formatAmountInput,
  formatDecimalInput,
  formatMoney,
  formatRatePair,
  parseAmount,
  parseDecimal,
  SYMBOL,
} from "../format";
import { t } from "../i18n";
import { useMe, useSetMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  cleanKztBank,
  convert,
  type Currency,
  CURRENCIES,
  DURATIONS,
  type DurationDays,
  type ExchangeRequest,
  getCurrency,
  giveCurrency,
  hasProfile,
  MAX_AMOUNT,
  MAX_KZT_BANK_LENGTH,
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
  minCounter?: string;
  kztBank?: string;
}

interface FormValues {
  buy: Currency;
  amountText: string;
  rateChoice: RateChoice;
  percentText: string;
  minCounterText: string;
  kztBankText: string;
}

/** The form showing an existing request's terms, from its author's side. */
function formValues(terms: RequestTerms): FormValues {
  const gain = viewerRateGain({ ...terms, is_own: true });
  return {
    buy: getCurrency(terms.direction),
    amountText: formatAmountInput(String(terms.amount)),
    rateChoice: gain > 0 ? "ask" : gain < 0 ? "offer" : "market",
    percentText: gain === 0 ? "" : formatDecimalInput(String(Math.abs(gain)), 2),
    minCounterText: formatAmountInput(String(terms.min_counter_amount ?? "")),
    kztBankText: terms.kzt_bank ?? "",
  };
}

/**
 * Posts a new request, optionally prefilled (`prefill`, "Post again"), or edits the amount, rate,
 * smallest counter offer and preferred KZT bank of the viewer's open request (`edit`; its
 * direction and expiry stay as they are). A new request without a prefill starts with the bank
 * the viewer asked to remember.
 */
export function NewRequest(props: { active: boolean; prefill?: RequestTerms; edit?: ExchangeRequest }) {
  const me = useMe();
  const setMe = useSetMe();
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
  // Empty: counter offers are off.
  const [minCounterText, setMinCounterText] = useState(initial?.minCounterText ?? "");
  const [kztBankText, setKztBankText] = useState(initial?.kztBankText ?? me.saved_kzt_bank ?? "");
  const [rememberKztBank, setRememberKztBank] = useState(me.saved_kzt_bank !== null);
  const [duration, setDuration] = useState<DurationDays>(1);
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
  // In what the author pays, like the amount. formatAmountInput keeps it a positive integer.
  const minCounter = parseAmount(minCounterText);
  const kztBank = cleanKztBank(kztBankText);

  const errors: FormErrors = {};
  if (amount === null || amount <= 0) errors.amount = t.form.errors.amount;
  else if (amount > MAX_AMOUNT) errors.amount = t.form.errors.amountTooLarge;
  if (rateChoice !== "market") {
    if (percent === null || percent <= 0) errors.rate = t.form.errors.percent;
    else if (percent > MAX_MARKET_OFFSET) errors.rate = t.form.errors.percentRange(MAX_MARKET_OFFSET);
  }
  if (minCounter !== null && amount !== null && minCounter > amount) {
    errors.minCounter = t.form.errors.counterAboveAmount;
  }
  if (!kztBank.valid) errors.kztBank = t.form.errors.kztBank;
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
        await api.updateRequest(edit.id, {
          amount,
          rate_value: offset,
          min_counter_amount: minCounter,
          kzt_bank: kztBank.value,
        });
        haptic("success");
        nav.pop();
        return;
      }
      const body: RequestCreate = {
        direction,
        amount,
        rate_value: offset,
        duration_days: duration,
        min_counter_amount: minCounter,
        kzt_bank: kztBank.value,
        remember_kzt_bank: rememberKztBank,
      };
      const result = await api.createRequest(body);
      haptic("success");
      setMe({ ...me, saved_kzt_bank: rememberKztBank ? kztBank.value : null });
      nav.replace({ name: "created", result });
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
      setSubmitting(false);
    }
  };

  // A username is needed to be contacted, which an existing request's author already was.
  const blocked = me.is_banned ? t.form.banned : !me.username && !edit ? t.form.usernameRequired : null;
  const needsProfile = !blocked && !edit && !hasProfile(me);
  const title = edit ? t.form.editTitle : t.form.title;

  useMainButton(
    props.active && !blocked && !needsProfile
      ? {
          text: edit ? t.form.save : t.form.submit,
          onClick: submit,
          enabled: valid || !showErrors,
          loading: submitting,
        }
      : null,
  );

  if (blocked || needsProfile) {
    return (
      <div className="screen">
        <h1 className="title">{title}</h1>
        {blocked ? <Notice tone="warning">{blocked}</Notice> : <ProfileRequired text={t.form.profileRequired} />}
      </div>
    );
  }

  const shown = showErrors ? errors : {};
  const amountInput = (side: TypedSide) => {
    const value = side === typed ? amountText : formatAmountInput(String((side === "pay" ? amount : gets) ?? ""));
    return (
      <AmountInput
        label={side === "pay" ? t.side.pay : t.side.get}
        value={value}
        invalid={Boolean(shown.amount) && side === typed}
        // Without a market rate, only the amount paid can be entered.
        disabled={side === "get" && effectiveRate === null}
        onChange={(text) => {
          setTyped(side);
          setAmountText(text);
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
        <Collapse open={rateChoice !== "market"}>
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
        </Collapse>
        {shown.rate && <p className="field-error">{shown.rate}</p>}
        <p className="hint small">
          {t.form.rateHint[rateChoice]}{" "}
          {effectiveRate === null
            ? t.rate.unavailable
            : !errors.rate && <span className="nowrap">{t.form.rateNow(formatRatePair(effectiveRate))}</span>}
        </p>
      </Section>

      <Section title={t.form.kztBank}>
        <input
          className={shown.kztBank ? "input invalid" : "input"}
          maxLength={MAX_KZT_BANK_LENGTH}
          autoComplete="off"
          aria-label={t.form.kztBank}
          aria-invalid={Boolean(shown.kztBank)}
          placeholder={t.form.kztBankPlaceholder}
          value={kztBankText}
          onChange={(event) => setKztBankText(event.target.value)}
        />
        {shown.kztBank && <p className="field-error">{shown.kztBank}</p>}
        <p className="hint small">{t.form.kztBankHint}</p>
        {!edit && (
          <Checkbox checked={rememberKztBank} onChange={setRememberKztBank}>
            {t.form.kztBankRemember}
          </Checkbox>
        )}
      </Section>

      <section className="section">
        <h2 className="section-title">{t.form.counter}</h2>
        <div className="section-body counter-box">
          <p className="small">{t.form.counterHint}</p>
          <label className="inline-field">
            <span>{t.form.counterLabel}</span>
            <span className={shown.minCounter ? "input-wrap compact wide invalid" : "input-wrap compact wide"}>
              <input
                className="input-bare"
                inputMode="numeric"
                autoComplete="off"
                placeholder={t.form.counterPlaceholder}
                value={minCounterText}
                onChange={(event) => setMinCounterText(formatAmountInput(event.target.value))}
              />
              <span className="input-suffix">{SYMBOL[pay]}</span>
            </span>
          </label>
          {shown.minCounter && <p className="field-error">{shown.minCounter}</p>}
          {minCounter !== null && amount !== null && !errors.minCounter && (
            <p className="hint small">{t.form.counterRange(formatMoney(minCounter, pay), formatMoney(amount, pay))}</p>
          )}
        </div>
      </section>

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

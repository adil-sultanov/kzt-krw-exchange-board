import { useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { AmountInput, ExchangeBox, ExchangeRow } from "../components/Exchange";
import { ProfileRequired } from "../components/ProfileHint";
import { Checkbox, ErrorBox, Notice, Section, Segmented } from "../components/ui";
import { formatAmountInput, formatMoney, formatRatePair, parseAmount, SYMBOL } from "../format";
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
  postDirection,
  type RequestCreate,
  type RequestTerms,
} from "../types";

/** The side whose amount the viewer typed; the other is converted from it at the market rate. */
type TypedSide = "pay" | "get";

interface FormErrors {
  amount?: string;
  minCounter?: string;
  kztBank?: string;
}

interface FormValues {
  buy: Currency;
  amountText: string;
  minCounterText: string;
  kztBankText: string;
}

/** The form showing an existing request's terms, from its author's side. */
function formValues(terms: RequestTerms): FormValues {
  return {
    buy: getCurrency(terms.direction),
    amountText: formatAmountInput(String(terms.amount)),
    minCounterText: formatAmountInput(String(terms.min_counter_amount ?? "")),
    kztBankText: terms.kzt_bank ?? "",
  };
}

/**
 * Posts a new request, optionally prefilled (`prefill`, "Post again"), or edits the amount,
 * smallest counter offer and preferred KZT bank of the viewer's open request (`edit`; its
 * direction and expiry stay as they are). A new request without a prefill starts buying `buy`
 * (the Board tab it came from) and with the bank the viewer asked to remember.
 */
export function NewRequest(props: {
  active: boolean;
  prefill?: RequestTerms;
  buy?: Currency;
  edit?: ExchangeRequest;
}) {
  const me = useMe();
  const setMe = useSetMe();
  const nav = useNav();
  const { edit } = props;
  const [initial] = useState(() => {
    const terms = edit ?? props.prefill;
    return terms ? formValues(terms) : null;
  });
  const [buy, setBuy] = useState<Currency>(initial?.buy ?? props.buy ?? "KRW");
  // The amount the author gets is the request's (fixed) amount, so that's what they type first.
  const [typed, setTyped] = useState<TypedSide>("get");
  const [amountText, setAmountText] = useState(initial?.amountText ?? "");
  // Empty: counter offers are off.
  const [minCounterText, setMinCounterText] = useState(initial?.minCounterText ?? "");
  const [kztBankText, setKztBankText] = useState(initial?.kztBankText ?? me.saved_kzt_bank ?? "");
  const [rememberKztBank, setRememberKztBank] = useState(me.saved_kzt_bank !== null);
  const [duration, setDuration] = useState<DurationDays>(1);
  // Requests are always at the market rate.
  const [rate, setRate] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rate().then((r) => setRate(r.rate), () => setRate(null));
  }, []);

  const direction = postDirection(buy);
  const pay = giveCurrency(direction);
  const typedAmount = parseAmount(amountText);
  const converted = (value: number | null, from: Currency) =>
    value !== null && rate !== null ? Math.round(convert(value, from, rate)) : null;
  // The request's amount is always what the author gets: fixed, while what they pay follows
  // the rate. Typing what they pay works it out at today's rate.
  const amount = typed === "get" ? typedAmount : converted(typedAmount, pay);
  const pays = typed === "pay" ? typedAmount : converted(amount, buy);
  // In what the author gets, like the amount. formatAmountInput keeps it a positive integer.
  const minCounter = parseAmount(minCounterText);
  const kztBank = cleanKztBank(kztBankText);

  const errors: FormErrors = {};
  if (amount === null || amount <= 0) errors.amount = t.form.errors.amount;
  else if (amount > MAX_AMOUNT) errors.amount = t.form.errors.amountTooLarge;
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
    const value = side === typed ? amountText : formatAmountInput(String((side === "pay" ? pays : amount) ?? ""));
    return (
      <AmountInput
        label={side === "pay" ? t.side.payApprox : t.side.get}
        value={value}
        invalid={Boolean(shown.amount) && side === typed}
        // Without a market rate, only the amount the author gets can be entered.
        disabled={side === "pay" && rate === null}
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
          <ExchangeRow label={t.side.payApprox} currency={pay}>
            {amountInput("pay")}
          </ExchangeRow>
        }
        get={
          <ExchangeRow label={t.side.get} currency={buy} emphasis>
            {amountInput("get")}
          </ExchangeRow>
        }
      />
      {shown.amount ? (
        <p className="field-error">{shown.amount}</p>
      ) : (
        <p className="hint small section-note">
          {rate === null ? t.rate.unavailable : t.form.rateNow(formatRatePair(rate))}
        </p>
      )}

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
        {!edit && (
          <Checkbox checked={rememberKztBank} onChange={setRememberKztBank}>
            {t.form.kztBankRemember}
          </Checkbox>
        )}
      </Section>

      <Section title={t.form.counter}>
        <p className="small">{t.form.counterHint}</p>
        <span className={shown.minCounter ? "input-wrap invalid" : "input-wrap"}>
          <input
            className="input-bare"
            inputMode="numeric"
            autoComplete="off"
            aria-label={t.form.counterLabel}
            aria-invalid={Boolean(shown.minCounter)}
            placeholder={t.form.counterPlaceholder}
            value={minCounterText}
            onChange={(event) => setMinCounterText(formatAmountInput(event.target.value))}
          />
          <span className="input-suffix">{SYMBOL[buy]}</span>
        </span>
        {shown.minCounter && <p className="field-error">{shown.minCounter}</p>}
        {minCounter !== null && amount !== null && !errors.minCounter && (
          <p className="hint small">{t.form.counterRange(formatMoney(minCounter, buy), formatMoney(amount, buy))}</p>
        )}
      </Section>

      {!edit && (
        <Section title={t.form.duration}>
          <Segmented
            options={DURATIONS.map((d) => ({ value: d, label: t.form.days(d) }))}
            value={duration}
            onChange={setDuration}
          />
        </Section>
      )}

      {error && <ErrorBox code={error} />}
    </div>
  );
}

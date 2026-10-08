import { useCallback, useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { AmountInput, ExchangeBox, ExchangeRow } from "../components/Exchange";
import { ReceiveHint } from "../components/ReceiveHint";
import { RequestCard } from "../components/RequestCard";
import { ErrorBox, Notice } from "../components/ui";
import { formatAmountInput, formatMoney, parseAmount } from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useNav } from "../nav";
import { haptic, useMainButton } from "../telegram";
import {
  canRespond,
  convert,
  type Currency,
  type ExchangeRequest,
  getCurrency,
  giveCurrency,
  mayRespond,
  takesCounterOffers,
} from "../types";

/** The side whose amount the viewer typed; the other is converted from it at the request's rate. */
type TypedSide = "pay" | "get";

/**
 * Asks for part of someone else's request. The offer is in the request's amount currency (what
 * the viewer pays or gets): at least the author's minimum, at most the whole amount. Either side
 * can be typed.
 */
export function CounterOffer(props: { request: ExchangeRequest; active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const [request, setRequest] = useState(props.request);
  // The offer is a part of the request's amount, so that side is typed first.
  const [typed, setTyped] = useState<TypedSide>(() =>
    props.request.amount_currency === getCurrency(props.request.direction) ? "pay" : "get",
  );
  const [amountText, setAmountText] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the Board showed may be out of date, e.g. another offer on it was accepted since.
  const requestId = props.request.id;
  const reload = useCallback(() => api.request(requestId).then(setRequest, () => undefined), [requestId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const get = giveCurrency(request.direction);
  const pay = getCurrency(request.direction);
  // The offer is in the request's amount currency (fixed); the other side follows the rate until
  // the author accepts.
  const fixed = request.amount_currency;
  const fixedSide: TypedSide = fixed === pay ? "pay" : "get";
  const other = fixed === pay ? get : pay;
  const rate = request.effective_rate;
  const typedAmount = parseAmount(amountText);
  const converted = (value: number | null, from: Currency) =>
    value !== null && rate !== null ? Math.round(convert(value, from, rate)) : null;
  const amount = typed === fixedSide ? typedAmount : converted(typedAmount, other);
  const otherAmount = typed === fixedSide ? converted(amount, fixed) : typedAmount;
  const minimum = request.min_counter_amount ?? request.amount;

  let invalid: string | null = null;
  if (amount === null || amount <= 0) invalid = t.counter.errors.amount;
  else if (amount < minimum) invalid = t.counter.errors.belowMinimum(formatMoney(minimum, fixed));
  else if (amount > request.amount) invalid = t.counter.errors.aboveAmount(formatMoney(request.amount, fixed));

  const submit = async () => {
    if (invalid !== null || amount === null) {
      setShowErrors(true);
      haptic("error");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const deal = await api.counterOffer(request.id, amount);
      haptic("success");
      nav.replace({ name: "deal", id: deal.id });
    } catch (e) {
      haptic("error");
      setError(errorCode(e));
      setSending(false);
      void reload();
    }
  };

  const blocked = me.is_banned
    ? t.detail.banned
    : !me.username
      ? t.detail.usernameRequired
      : !mayRespond(me)
        ? t.detail.profileRequired
        : !canRespond(request)
          ? t.counter.unavailable
          : !takesCounterOffers(request)
            ? t.counter.off
            : null;

  useMainButton(
    props.active && !blocked
      ? { text: t.counter.submit, onClick: submit, enabled: invalid === null || !showErrors, loading: sending }
      : null,
  );

  const label = (side: TypedSide) =>
    side === fixedSide ? t.side[side] : side === "pay" ? t.side.payApprox : t.side.getApprox;
  const input = (side: TypedSide) => (
    <AmountInput
      label={label(side)}
      value={side === typed ? amountText : formatAmountInput(String((side === fixedSide ? amount : otherAmount) ?? ""))}
      invalid={showErrors && invalid !== null && side === typed}
      // Without a market rate, only the request's amount currency can be entered.
      disabled={side !== fixedSide && rate === null}
      onChange={(text) => {
        setTyped(side);
        setAmountText(text);
      }}
    />
  );
  return (
    <div className="screen">
      <div className="title-block">
        <span className="eyebrow">{t.counter.title}</span>
        <h1 className="title">{t.buy[get]}</h1>
      </div>
      {blocked && <Notice tone="warning">{blocked}</Notice>}

      <RequestCard request={request} onOpen={() => nav.push({ name: "request", id: request.id })} />

      {!blocked && (
        <section className="section">
          <h2 className="section-title">{t.counter.yourOffer}</h2>
          <ExchangeBox
            pay={
              <ExchangeRow label={label("pay")} currency={pay}>
                {input("pay")}
              </ExchangeRow>
            }
            get={
              <ExchangeRow label={label("get")} currency={get} emphasis>
                {input("get")}
              </ExchangeRow>
            }
          />
          {showErrors && invalid !== null ? (
            <p className="field-error">{invalid}</p>
          ) : (
            <p className="hint small section-note">
              {t.counter.range(formatMoney(minimum, fixed), formatMoney(request.amount, fixed))}
            </p>
          )}
        </section>
      )}
      {!blocked && <ReceiveHint currency={get} />}
      {error && <ErrorBox code={error} />}
    </div>
  );
}

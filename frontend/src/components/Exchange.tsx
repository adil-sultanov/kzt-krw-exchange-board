import type { ReactNode } from "react";
import { formatAmountInput, formatSide } from "../format";
import { t } from "../i18n";
import type { Currency, ExchangeRequest } from "../types";
import { viewerSides } from "../types";
import { ArrowIcon } from "./icons";

const FLAG: Record<Currency, string> = { KZT: "🇰🇿", KRW: "🇰🇷" };

function CurrencyChip(props: { currency: Currency }) {
  return (
    <span className="currency-chip">
      <span aria-hidden="true">{FLAG[props.currency]}</span> {props.currency}
    </span>
  );
}

/** One side of the exchange box: a label, the amount (or an input), and the currency. */
export function ExchangeRow(props: {
  label: string;
  currency: Currency;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={props.emphasis ? "exchange-row emphasis" : "exchange-row"}>
      <span className="exchange-label">{props.label}</span>
      <div className="exchange-line">
        <div className="exchange-value">{props.children}</div>
        <CurrencyChip currency={props.currency} />
      </div>
    </div>
  );
}

/**
 * An amount typed into the exchange box, with thousands separators. Disabled (e.g. a side that
 * can't be converted without a market rate), it shows a dash.
 */
export function AmountInput(props: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      className={props.invalid ? "exchange-input invalid" : "exchange-input"}
      inputMode="numeric"
      autoComplete="off"
      aria-label={props.label}
      aria-invalid={props.invalid}
      disabled={props.disabled}
      placeholder={props.disabled ? t.side.unknown("").trim() : t.form.amountPlaceholder}
      value={props.value}
      onChange={(event) => props.onChange(formatAmountInput(event.target.value))}
    />
  );
}

/** "You pay" above "You get", with an arrow between. */
export function ExchangeBox(props: { pay: ReactNode; get: ReactNode }) {
  return (
    <div className="exchange">
      {props.pay}
      <div className="exchange-divider">
        <span className="exchange-arrow">
          <ArrowIcon down />
        </span>
      </div>
      {props.get}
    </div>
  );
}

/** What the viewer pays and gets for a request, as its author or by taking it. */
export function RequestExchange(props: { request: ExchangeRequest }) {
  const { pay, get } = viewerSides(props.request);
  return (
    <ExchangeBox
      pay={
        <ExchangeRow label={t.side.pay} currency={pay.currency}>
          {formatSide(pay)}
        </ExchangeRow>
      }
      get={
        <ExchangeRow label={t.side.get} currency={get.currency} emphasis>
          {formatSide(get)}
        </ExchangeRow>
      }
    />
  );
}

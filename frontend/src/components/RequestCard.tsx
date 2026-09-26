import { convert, describeRate, formatMoney, timeLeft } from "../format";
import { t } from "../i18n";
import { type ExchangeRequest, getCurrency, giveCurrency } from "../types";

/**
 * `status` is an optional highlighted line, e.g. the viewer's deal on this request.
 * `highlight` outlines the card, e.g. for a deal in progress.
 */
export function RequestCard(props: {
  request: ExchangeRequest;
  onOpen: () => void;
  status?: string;
  highlight?: boolean;
}) {
  const { request } = props;
  const status =
    props.status ?? (request.my_deal_status ? t.dealStatus[request.my_deal_status] : undefined);
  const give = giveCurrency(request.direction);
  // Time left only matters while it's on the board; otherwise show where it ended up.
  const left = request.status === "open" ? timeLeft(request.expires_at) : null;
  const ended = request.status === "open" ? "expired" : request.status;
  return (
    <button type="button" className={props.highlight ? "card highlight" : "card"} onClick={props.onOpen}>
      {status && <div className="card-status">{status}</div>}
      <div className="card-row">
        <span className="card-amount">{formatMoney(request.amount, give)}</span>
        <span className="badge">{t.direction[request.direction]}</span>
      </div>
      {request.effective_rate !== null && (
        <div className="hint">
          {t.card.wants(
            formatMoney(
              convert(request.amount, give, request.effective_rate),
              getCurrency(request.direction),
            ),
          )}
        </div>
      )}
      <div className="card-rate">{describeRate(request)}</div>
      <div className="card-row hint small">
        <span>{t.card.deals(request.author_completed_deals)}</span>
        <span>{left ? t.card.timeLeft(left) : t.status[ended]}</span>
      </div>
    </button>
  );
}

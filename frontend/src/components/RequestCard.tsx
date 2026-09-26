import { describeRateGain, formatSide, rateTone, timeLeft } from "../format";
import { t } from "../i18n";
import { type ExchangeRequest, viewerRateGain, viewerSides } from "../types";
import { ArrowIcon } from "./icons";

/** `action` needs the viewer, `active` is under way, `muted` is over. */
export type StatusTone = "action" | "active" | "muted";

export interface CardStatus {
  text: string;
  tone: StatusTone;
}

/**
 * A request as the viewer sees it: what they pay and get, the rate compared to the market,
 * the other side's record and the time left.
 *
 * `status` is an optional line on top, e.g. the viewer's deal on this request; `highlight`
 * outlines the card, e.g. for a deal in progress. `deals` is the other side's completed-deal
 * count (by default the author's, hidden on the viewer's own requests). `time` shows the time
 * left while the request is on the board.
 */
export function RequestCard(props: {
  request: ExchangeRequest;
  onOpen: () => void;
  status?: CardStatus;
  highlight?: boolean;
  deals?: number | null;
  time?: boolean;
}) {
  const { request } = props;
  const status: CardStatus | undefined =
    props.status ??
    (request.my_deal_status
      ? {
          text: t.dealStatus[request.my_deal_status],
          tone: request.my_deal_status === "declined" ? "muted" : "active",
        }
      : undefined);
  const { pay, get } = viewerSides(request);
  const gain = viewerRateGain(request);
  const deals = props.deals !== undefined ? props.deals : request.is_own ? null : request.author_completed_deals;
  const left = (props.time ?? true) && request.status === "open" ? timeLeft(request.expires_at) : null;
  return (
    <button type="button" className={props.highlight ? "card highlight" : "card"} onClick={props.onOpen}>
      {status && <span className={`card-status ${status.tone}`}>{status.text}</span>}
      <span className="card-amounts">
        <span className="card-side">
          <span className="side-label">{t.side.pay}</span>
          <span className="side-value">{formatSide(pay)}</span>
        </span>
        <ArrowIcon />
        <span className="card-side">
          <span className="side-label">{t.side.get}</span>
          <span className="side-value get">{formatSide(get)}</span>
        </span>
      </span>
      <span className="card-meta">
        <span className={`rate-tag ${rateTone(gain)}`}>{describeRateGain(gain)}</span>
        {deals !== null && <span>{t.card.deals(deals)}</span>}
        {left && <span className="card-time">{t.card.timeLeft(left)}</span>}
      </span>
    </button>
  );
}

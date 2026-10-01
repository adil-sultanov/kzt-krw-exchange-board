import { describeRateGain, formatProfile, formatSide, rateTone, timeLeft } from "../format";
import { t } from "../i18n";
import { type ExchangeRequest, type Profile, viewerRateGain, viewerSides } from "../types";

/** The whole request under a counter offer's amounts, dimmed. */
export function WholeRequest(props: { request: ExchangeRequest; className?: string }) {
  const { pay, get } = viewerSides(props.request);
  return (
    <span className={props.className ? `whole-request ${props.className}` : "whole-request"}>
      {t.card.whole(formatSide(pay), formatSide(get))}
    </span>
  );
}
import { ArrowIcon } from "./icons";
import { UsernameTag } from "./UsernameTag";

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
 * The author's username (on someone else's request) opens their Telegram profile, so the viewer
 * can check who they'd trade with.
 *
 * `status` is an optional line on top, e.g. the viewer's deal on this request (by default their
 * deal's status, if any; `null` shows none); `highlight`
 * outlines the card, e.g. for a deal in progress. `profile` and `deals` are the other side's
 * profile tag ("Adil Sultanov, UNIST, 2022") and completed-deal count (by default the author's,
 * hidden on the viewer's own requests). `time` shows the time left while the request is on the
 * board. `whole` is the whole request under a counter offer's amounts (shown dimmed below them).
 * The author's preferred KZT bank, if any, goes under the rate.
 */
export function RequestCard(props: {
  request: ExchangeRequest;
  onOpen: () => void;
  status?: CardStatus | null;
  highlight?: boolean;
  profile?: Profile | null;
  deals?: number | null;
  time?: boolean;
  whole?: ExchangeRequest | null;
}) {
  const { request } = props;
  const fallback: CardStatus | null = request.my_deal_status
    ? {
        text: t.dealStatus[request.my_deal_status],
        tone: request.my_deal_status === "declined" || request.my_deal_status === "cancelled" ? "muted" : "active",
      }
    : null;
  const status = props.status !== undefined ? props.status : fallback;
  const { pay, get } = viewerSides(request);
  const gain = viewerRateGain(request);
  const profile = props.profile !== undefined ? props.profile : request.is_own ? null : request.author_profile;
  const tag = formatProfile(profile);
  const username = request.is_own ? null : request.author_username;
  const deals = props.deals !== undefined ? props.deals : request.is_own ? null : request.author_completed_deals;
  const left = (props.time ?? true) && request.status === "open" ? timeLeft(request.expires_at) : null;
  return (
    // A div, not a button: the username inside it is a button of its own.
    <div
      role="button"
      tabIndex={0}
      className={props.highlight ? "card tappable highlight" : "card tappable"}
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        props.onOpen();
      }}
    >
      {status && <span className={`card-status ${status.tone}`}>{status.text}</span>}
      {(tag || username) && (
        <span className="card-author">
          {tag && <span>{tag}</span>}
          {username && <UsernameTag username={username} />}
        </span>
      )}
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
      {props.whole && <WholeRequest request={props.whole} />}
      <span className="card-meta">
        <span className={`rate-tag ${rateTone(gain)}`}>{describeRateGain(gain)}</span>
        {deals !== null && <span>{t.card.deals(deals)}</span>}
        {left && <span className="card-time">{t.card.timeLeft(left)}</span>}
      </span>
      {request.kzt_bank && (
        <span className="card-bank">
          {t.card.kztBank} <span className="card-bank-name">{request.kzt_bank}</span>
        </span>
      )}
    </div>
  );
}

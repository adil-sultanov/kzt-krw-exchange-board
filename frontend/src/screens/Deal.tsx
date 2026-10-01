import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DealAction, errorCode } from "../api";
import { RequestExchange } from "../components/Exchange";
import { CheckIcon, FlagIcon } from "../components/icons";
import { ReceiveHint } from "../components/ReceiveHint";
import { WholeRequest } from "../components/RequestCard";
import { Collapse, CopyButton, ErrorBox, Loading, Notice, Row, TitleWithRefresh } from "../components/ui";
import {
  describeRateGain,
  formatKst,
  formatMoney,
  formatProfile,
  formatRatePair,
  formatSide,
  rateTone,
} from "../format";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import { FAST_POLL_MS, usePolling } from "../polling";
import { confirm, haptic, type MainButtonConfig, openTelegramLink, useMainButton } from "../telegram";
import {
  canCancelOffer,
  canRespond,
  type Contact,
  type Deal,
  dealTerms,
  dealWhole,
  giveCurrency,
  isActiveDeal,
  viewerRateGain,
  viewerSides,
} from "../types";

type Busy = DealAction | "contact" | null;
/** `action` asks something of the viewer, `neutral` is waiting or over. */
type BannerTone = "action" | "neutral" | "success";

/** What the viewer is told about the deal's state. */
function banner(deal: Deal): { text: { title: string; body: string }; tone: BannerTone } {
  const b = t.deal.banner;
  switch (deal.status) {
    case "pending": {
      if (deal.role !== "author") return { text: b.responderPending, tone: "neutral" };
      if (!deal.partial) return { text: b.authorPending, tone: "action" };
      // The request's amount is what's still on the board, all of which the author pays.
      const currency = giveCurrency(deal.request.direction);
      const body = b.authorCounter.body(formatMoney(deal.amount, currency), formatMoney(deal.request.amount, currency));
      return { text: { title: b.authorCounter.title, body }, tone: "action" };
    }
    case "accepted":
      if (deal.my_confirmed) return { text: b.waitingForThem, tone: "neutral" };
      return { text: deal.other_confirmed ? b.otherConfirmed : b.accepted, tone: "action" };
    case "declined": {
      const author = deal.role === "author";
      if (deal.request.status === "closed" && deal.request.removed_by_admin) {
        return { text: b.removed, tone: "neutral" };
      }
      if (deal.request.status === "closed") {
        return { text: author ? b.cancelledAuthor : b.cancelledResponder, tone: "neutral" };
      }
      if (deal.request.status === "expired") return { text: b.expired, tone: "neutral" };
      return { text: author ? b.declinedAuthor : b.declinedResponder, tone: "neutral" };
    }
    case "cancelled": {
      if (deal.role === "author") return { text: b.offerCancelledAuthor, tone: "neutral" };
      const left = deal.request.status === "open" ? (deal.request.offers_left ?? 0) : 0;
      const { title, body } = b.offerCancelledResponder;
      return { text: { title, body: body(left) }, tone: "neutral" };
    }
    case "completed":
      return { text: b.completed, tone: "success" };
  }
}

function Check(props: { done: boolean; children: string }) {
  return (
    <div className={props.done ? "check-row done" : "check-row"}>
      <span className="check-mark">{props.done && <CheckIcon />}</span>
      <span>{props.children}</span>
    </div>
  );
}

export function DealScreen(props: { id: number; active: boolean }) {
  const nav = useNav();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Where to pay the other side; loaded once the deal is accepted.
  const [contact, setContact] = useState<Contact | null>(null);
  // Responses to superseded loads (e.g. a poll sent before an action) are ignored.
  const loadSeq = useRef(0);

  /** A quiet load (polling) keeps what's shown if it fails; the next one retries. */
  const fetchDeal = useCallback(
    async (quiet: boolean, withContact: boolean) => {
      const seq = ++loadSeq.current;
      if (!quiet) setError(null);
      try {
        const loaded = await api.deal(props.id);
        if (seq !== loadSeq.current) return;
        setDeal(loaded);
        if (withContact && (loaded.status === "accepted" || loaded.status === "completed")) {
          // A missing username only hides the link, so ignore failures here.
          api.contact(props.id).then(setContact, () => setContact(null));
        }
      } catch (e) {
        if (seq === loadSeq.current && !quiet) setError(errorCode(e));
      }
    },
    [props.id],
  );
  const load = useCallback(() => fetchDeal(false, true), [fetchDeal]);

  useEffect(() => {
    void load();
  }, [load]);

  // The other side may have acted while this screen was hidden.
  useReactivated(props.active, load);
  // ...or while it's open: follow the deal until it's completed or declined.
  usePolling(props.active && deal !== null && isActiveDeal(deal), FAST_POLL_MS, () =>
    fetchDeal(true, contact === null),
  );

  const act = async (action: DealAction, question: string) => {
    if (busy || !(await confirm(question))) return;
    setBusy(action);
    setActionError(null);
    try {
      const updated = await api.dealAction(props.id, action);
      loadSeq.current++; // a poll sent before this is now stale
      setDeal(updated);
      haptic("success");
      if (action === "accept") void load(); // fetch where to pay
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
      void load();
    } finally {
      setBusy(null);
    }
  };

  const openContact = async () => {
    setBusy("contact");
    setActionError(null);
    try {
      // Fetched on tap so the link uses the other person's current username.
      openTelegramLink((await api.contact(props.id)).url);
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    } finally {
      setBusy(null);
    }
  };

  const authorPending = deal?.role === "author" && deal.status === "pending";
  const accepted = deal?.status === "accepted";
  let mainButton: MainButtonConfig | null = null;
  if (authorPending) {
    const left = deal.request.amount - deal.amount;
    const question = deal.partial
      ? t.deal.acceptCounterConfirm(formatMoney(left, giveCurrency(deal.request.direction)))
      : t.deal.acceptConfirm;
    mainButton = {
      text: t.deal.accept,
      onClick: () => void act("accept", question),
      loading: busy === "accept",
    };
  } else if (accepted) {
    mainButton = { text: t.deal.contact, onClick: openContact, loading: busy === "contact" };
  }
  useMainButton(props.active ? mainButton : null);

  if (error) return <div className="screen"><ErrorBox code={error} onRetry={load} /></div>;
  if (!deal) return <div className="screen"><Loading /></div>;

  const terms = dealTerms(deal);
  const whole = dealWhole(deal);
  const { pay, get } = viewerSides(terms);
  const gain = viewerRateGain(terms);
  const { text, tone } = banner(deal);
  const otherTag = formatProfile(deal.other_profile);
  return (
    <div className="screen">
      <TitleWithRefresh
        eyebrow={deal.partial ? t.deal.counterTitle : t.deal.title}
        title={t.buy[get.currency]}
        onRefresh={load}
      />

      {/* Keyed by status, so a new one fades in rather than swapping in place. */}
      <div key={deal.status} className={`banner ${tone}`}>
        <p className="banner-title">{text.title}</p>
        <p className="banner-body">{text.body}</p>
      </div>
      {actionError && <ErrorBox code={actionError} />}
      {isActiveDeal(deal) && <ReceiveHint currency={get.currency} />}

      <RequestExchange request={terms} />
      {whole && <WholeRequest request={whole} className="center" />}

      {accepted && contact && (
        <div className="pay-to">
          <span className="pay-to-label">{t.deal.payTo(formatSide(pay))}</span>
          {contact.pay_account ? (
            <>
              {contact.pay_bank && <span className="pay-to-bank">{contact.pay_bank}</span>}
              <div className="pay-to-row">
                <span className="pay-to-value">{contact.pay_account}</span>
                <CopyButton text={contact.pay_account} />
              </div>
            </>
          ) : (
            <p className="small">{t.deal.payToMissing(contact.pay_currency)}</p>
          )}
        </div>
      )}

      {accepted && (
        <div className="detail">
          <Check done={deal.other_confirmed}>{t.deal.progress.theyReceived(pay.currency)}</Check>
          <Check done={deal.my_confirmed}>{t.deal.progress.youReceived(get.currency)}</Check>
        </div>
      )}

      <div className="detail">
        <Row label={t.detail.rate}>
          {deal.request.effective_rate !== null && <span>{formatRatePair(deal.request.effective_rate)}</span>}
          <span className={`rate-tag ${rateTone(gain)}`}>{describeRateGain(gain)}</span>
        </Row>
        {deal.request.kzt_bank && <Row label={t.detail.kztBank}>{deal.request.kzt_bank}</Row>}
        {otherTag && <Row label={t.deal.them}>{otherTag}</Row>}
        <Row label={t.deal.theirDeals}>{t.deals(deal.other_completed_deals)}</Row>
        <Row label={t.deal.started}>{formatKst(deal.created_at)}</Row>
      </div>

      {/* Folds away once cancelled (or answered) instead of vanishing. */}
      <Collapse open={canCancelOffer(deal)}>
        <button
          type="button"
          className="secondary-button destructive"
          disabled={busy !== null}
          onClick={() => void act("cancel", t.deal.cancelOfferConfirm(deal.request.offers_left ?? 0))}
        >
          {busy === "cancel" ? t.loading : t.deal.cancelOffer}
        </button>
      </Collapse>
      {/* After cancelling, while they may send another: back to the request to do it. */}
      {deal.role === "responder" && deal.status === "cancelled" && canRespond(deal.request) && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => nav.push({ name: "request", id: deal.request.id })}
        >
          {t.deal.newOffer}
        </button>
      )}
      {authorPending && (
        <button
          type="button"
          className="secondary-button destructive"
          disabled={busy !== null}
          onClick={() => void act("decline", t.deal.declineConfirm)}
        >
          {t.deal.decline}
        </button>
      )}
      {accepted && !deal.my_confirmed && (
        <button
          type="button"
          className="secondary-button strong"
          disabled={busy !== null}
          onClick={() => void act("confirm", t.deal.confirmQuestion)}
        >
          <CheckIcon />
          {t.deal.confirm}
        </button>
      )}
      {accepted && <p className="hint small center">{t.deal.noCancel}</p>}
      {accepted &&
        (deal.my_report_open ? (
          <Notice>{t.deal.reported}</Notice>
        ) : (
          <button
            type="button"
            className="secondary-button danger"
            onClick={() => nav.push({ name: "report", target: { kind: "deal", id: deal.id } })}
          >
            <FlagIcon />
            {t.deal.report}
          </button>
        ))}
    </div>
  );
}

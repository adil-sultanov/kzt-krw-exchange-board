import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type DealAction, errorCode } from "../api";
import { RequestExchange } from "../components/Exchange";
import { ChatIcon, CheckIcon, ChevronIcon, FlagIcon } from "../components/icons";
import { ReceiveHint } from "../components/ReceiveHint";
import { WholeRequest } from "../components/RequestCard";
import { Collapse, CopyButton, ErrorBox, Loading, Notice, Row, TitleWithRefresh } from "../components/ui";
import {
  formatKst,
  formatMoney,
  formatProfile,
  formatRatePair,
  formatSide,
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
  getCurrency,
  isActiveDeal,
  viewerSides,
} from "../types";

type Busy = DealAction | "contact" | null;

/** What the author is asked before accepting a deal (a counter offer leaves the rest up). */
export function acceptQuestion(deal: Deal): string {
  if (!deal.partial) return t.deal.acceptConfirm;
  const left = deal.request.amount - deal.amount;
  return t.deal.acceptCounterConfirm(formatMoney(left, deal.amount_currency));
}
/** `action` asks something of the viewer, `neutral` is waiting or over. */
type BannerTone = "action" | "neutral" | "success";

/** What the viewer is told about the deal's state. */
function banner(deal: Deal): { text: { title: string; body: string }; tone: BannerTone } {
  const b = t.deal.banner;
  switch (deal.status) {
    case "pending": {
      if (deal.role !== "author") return { text: b.responderPending, tone: "neutral" };
      if (!deal.partial) return { text: b.authorPending, tone: "action" };
      // The request's amount is what's still on the board, in the deal's currency while it's pending.
      const currency = deal.amount_currency;
      const body = b.authorCounter.body(
        formatMoney(deal.amount, currency),
        formatMoney(deal.request.amount, currency),
        currency === getCurrency(deal.request.direction),
      );
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

/** The status, with (on an accepted deal) who has confirmed receiving the money. */
function StatusCard(props: { deal: Deal }) {
  const { deal } = props;
  const { text, tone } = banner(deal);
  const { pay, get } = viewerSides(dealTerms(deal));
  return (
    // Keyed by status, so a new one fades in rather than swapping in place.
    <div key={deal.status} className={`banner ${tone}`}>
      <p className="banner-title">{text.title}</p>
      <p className="banner-body">{text.body}</p>
      {deal.status === "accepted" && (
        <div className="banner-checks">
          <Check done={deal.other_confirmed}>{t.deal.progress.theyReceived(pay.currency)}</Check>
          <Check done={deal.my_confirmed}>{t.deal.progress.youReceived(get.currency)}</Check>
        </div>
      )}
    </div>
  );
}

/**
 * Who the deal is with and their record; once accepted, a button to message them and where to
 * send them the money.
 */
function PersonCard(props: {
  deal: Deal;
  contact: Contact | null;
  messaging: boolean;
  onMessage: (() => void) | null;
}) {
  const { deal, contact } = props;
  const { pay } = viewerSides(dealTerms(deal));
  const accepted = deal.status === "accepted";
  return (
    <div className="person-card">
      <div className="person-head">
        <div className="person-text">
          <span className="pay-to-label">{t.deal.them}</span>
          <span className="person-name">{formatProfile(deal.other_profile) ?? t.deal.noProfile}</span>
          <span className="hint small">{t.deals(deal.other_completed_deals)}</span>
        </div>
        {props.onMessage && (
          <button type="button" className="pill-button" disabled={props.messaging} onClick={props.onMessage}>
            <ChatIcon />
            {props.messaging ? t.loading : t.deal.message}
          </button>
        )}
      </div>
      {accepted && contact && (
        <div className="person-pay">
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
            <p className="small hint">{t.deal.payToMissing(contact.pay_currency)}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The rest of the deal's terms and dates, folded away until asked for. */
function DetailsFold(props: { deal: Deal }) {
  const { deal } = props;
  const [open, setOpen] = useState(false);
  const whole = dealWhole(deal);
  const terms = dealTerms(deal);
  return (
    <div className="detail fold">
      <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t.deal.details}</span>
        <ChevronIcon open={open} />
      </button>
      <Collapse open={open}>
        <div className="fold-body">
          <Row label={t.detail.rate}>
            {terms.effective_rate !== null && <span>{formatRatePair(terms.effective_rate)}</span>}
              {terms.rate_locked && <span className="hint small">{t.deal.rateLocked}</span>}
          </Row>
          {deal.request.kzt_bank && <Row label={t.detail.kztBank}>{deal.request.kzt_bank}</Row>}
          {whole && (
            <Row label={t.deal.wholeRequest}>
              <WholeRequest request={whole} />
            </Row>
          )}
          <Row label={t.deal.started}>{formatKst(deal.created_at)}</Row>
          {deal.accepted_at && <Row label={t.deal.acceptedAt}>{formatKst(deal.accepted_at)}</Row>}
          {deal.status === "accepted" && <p className="hint small fold-note">{t.deal.noCancel}</p>}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * The accepted deal's two actions, pinned to the bottom of the screen: report a problem, and
 * confirm receiving the money. Rendered into <body> (a fixed bar inside a sliding screen would
 * slide with it), only while the deal screen is on top; the page leaves room for it below.
 */
function DealDock(props: {
  deal: Deal;
  confirming: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onReport: () => void;
}) {
  const { deal } = props;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("has-dock");
    return () => root.classList.remove("has-dock");
  }, []);
  return createPortal(
    <div className="dock">
      <div className="dock-inner">
        <button
          type="button"
          className="dock-button report"
          disabled={deal.my_report_open}
          onClick={props.onReport}
        >
          <FlagIcon />
          {deal.my_report_open ? t.deal.reportedShort : t.deal.reportShort}
        </button>
        <button
          type="button"
          className="dock-button confirm"
          disabled={deal.my_confirmed || props.disabled}
          onClick={props.onConfirm}
        >
          <CheckIcon />
          {props.confirming ? t.loading : deal.my_confirmed ? t.deal.confirmed : t.deal.confirm}
        </button>
      </div>
    </div>,
    document.body,
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
    mainButton = {
      text: t.deal.accept,
      onClick: () => void act("accept", acceptQuestion(deal)),
      loading: busy === "accept",
    };
  }
  useMainButton(props.active ? mainButton : null);

  if (error) return <div className="screen"><ErrorBox code={error} onRetry={load} /></div>;
  if (!deal) return <div className="screen"><Loading /></div>;

  const terms = dealTerms(deal);
  const { get } = viewerSides(terms);
  return (
    <div className="screen">
      <TitleWithRefresh
        eyebrow={deal.partial ? t.deal.counterTitle : t.deal.title}
        title={t.buy[get.currency]}
        onRefresh={load}
      />

      <StatusCard deal={deal} />
      {actionError && <ErrorBox code={actionError} />}
      {accepted && deal.my_report_open && <Notice>{t.deal.reported}</Notice>}

      <RequestExchange request={terms} />
      <PersonCard
        deal={deal}
        contact={contact}
        messaging={busy === "contact"}
        onMessage={accepted ? () => void openContact() : null}
      />
      {isActiveDeal(deal) && <ReceiveHint currency={get.currency} />}
      <DetailsFold deal={deal} />

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

      {accepted && props.active && (
        <DealDock
          deal={deal}
          confirming={busy === "confirm"}
          disabled={busy !== null}
          onConfirm={() => void act("confirm", t.deal.confirmQuestion)}
          onReport={() => nav.push({ name: "report", target: { kind: "deal", id: deal.id } })}
        />
      )}
    </div>
  );
}

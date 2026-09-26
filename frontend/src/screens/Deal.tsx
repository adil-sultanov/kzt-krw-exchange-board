import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DealAction, errorCode } from "../api";
import { RequestExchange } from "../components/Exchange";
import { CheckIcon } from "../components/icons";
import { ReceiveHint } from "../components/ReceiveHint";
import { ErrorBox, Loading, Row, TitleWithRefresh } from "../components/ui";
import { describeRateGain, formatKst, formatRatePair, formatSide, rateTone } from "../format";
import { t } from "../i18n";
import { useReactivated } from "../nav";
import { FAST_POLL_MS, usePolling } from "../polling";
import { confirm, copyText, haptic, type MainButtonConfig, openTelegramLink, useMainButton } from "../telegram";
import { type Contact, type Deal, isActiveDeal, viewerRateGain, viewerSides } from "../types";

type Busy = DealAction | "contact" | null;
/** `action` asks something of the viewer, `neutral` is waiting or over. */
type BannerTone = "action" | "neutral" | "success";

const COPIED_MS = 2000;

/** What the viewer is told about the deal's state. */
function banner(deal: Deal): { text: { title: string; body: string }; tone: BannerTone } {
  const b = t.deal.banner;
  switch (deal.status) {
    case "pending":
      return deal.role === "author"
        ? { text: b.authorPending, tone: "action" }
        : { text: b.responderPending, tone: "neutral" };
    case "accepted":
      if (deal.my_confirmed) return { text: b.waitingForThem, tone: "neutral" };
      return { text: deal.other_confirmed ? b.otherConfirmed : b.accepted, tone: "action" };
    case "declined": {
      const author = deal.role === "author";
      if (deal.request.status === "closed") {
        return { text: author ? b.cancelledAuthor : b.cancelledResponder, tone: "neutral" };
      }
      if (deal.request.status === "expired") return { text: b.expired, tone: "neutral" };
      return { text: author ? b.declinedAuthor : b.declinedResponder, tone: "neutral" };
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
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Where to pay the other side; loaded once the deal is accepted.
  const [contact, setContact] = useState<Contact | null>(null);
  const [copied, setCopied] = useState(false);
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

  const copyAccount = async (text: string) => {
    if (await copyText(text)) {
      setCopied(true);
      haptic("success");
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } else {
      haptic("error");
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
      onClick: () => void act("accept", t.deal.acceptConfirm),
      loading: busy === "accept",
    };
  } else if (accepted) {
    mainButton = { text: t.deal.contact, onClick: openContact, loading: busy === "contact" };
  }
  useMainButton(props.active ? mainButton : null);

  if (error) return <div className="screen"><ErrorBox code={error} onRetry={load} /></div>;
  if (!deal) return <div className="screen"><Loading /></div>;

  const { pay, get } = viewerSides(deal.request);
  const gain = viewerRateGain(deal.request);
  const { text, tone } = banner(deal);
  return (
    <div className="screen">
      <TitleWithRefresh eyebrow={t.deal.title} title={t.buy[get.currency]} onRefresh={load} />

      <div className={`banner ${tone}`}>
        <p className="banner-title">{text.title}</p>
        <p className="banner-body">{text.body}</p>
      </div>
      {actionError && <ErrorBox code={actionError} />}
      {isActiveDeal(deal) && <ReceiveHint currency={get.currency} />}

      <RequestExchange request={deal.request} />

      {accepted && contact && (
        <div className="pay-to">
          <span className="pay-to-label">{t.deal.payTo(formatSide(pay))}</span>
          {contact.pay_account ? (
            <>
              {contact.pay_bank && <span className="pay-to-bank">{contact.pay_bank}</span>}
              <div className="pay-to-row">
                <span className="pay-to-value">{contact.pay_account}</span>
                <button
                  type="button"
                  className={copied ? "copy-button copied" : "copy-button"}
                  onClick={() => void copyAccount(contact.pay_account ?? "")}
                >
                  {copied ? t.deal.copied : t.deal.copy}
                </button>
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
        <Row label={t.deal.theirDeals}>{t.deals(deal.other_completed_deals)}</Row>
        <Row label={t.deal.started}>{formatKst(deal.created_at)}</Row>
      </div>

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
    </div>
  );
}

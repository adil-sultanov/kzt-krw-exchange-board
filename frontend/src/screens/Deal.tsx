import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DealAction, errorCode } from "../api";
import { ReceiveHint } from "../components/ReceiveHint";
import { RequestCard } from "../components/RequestCard";
import { ErrorBox, Loading, Row, TitleWithRefresh } from "../components/ui";
import { formatKst } from "../format";
import { t } from "../i18n";
import { useNav, useReactivated } from "../nav";
import { FAST_POLL_MS, usePolling } from "../polling";
import { confirm, copyText, haptic, type MainButtonConfig, openTelegramLink, useMainButton } from "../telegram";
import { type Contact, type Deal, dealReceives, isActiveDeal } from "../types";

type Busy = DealAction | "contact" | null;

const COPIED_MS = 2000;

/** What the viewer is told about the deal's state. */
function explain(deal: Deal): string {
  switch (deal.status) {
    case "pending":
      return deal.role === "author"
        ? t.deal.authorPending(t.card.deals(deal.other_completed_deals))
        : t.deal.responderPending;
    case "accepted":
      if (deal.my_confirmed) return t.deal.waitingForThem;
      return deal.other_confirmed ? t.deal.otherConfirmed : t.deal.accepted;
    case "declined":
      if (deal.request.status === "closed") {
        return deal.role === "author" ? t.deal.cancelledAuthor : t.deal.cancelledResponder;
      }
      if (deal.request.status === "expired") return t.deal.expired;
      return deal.role === "author" ? t.deal.declinedAuthor : t.deal.declinedResponder;
    case "completed":
      return t.deal.completed;
  }
}

export function DealScreen(props: { id: number; active: boolean }) {
  const nav = useNav();
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

  return (
    <div className="screen">
      <TitleWithRefresh title={t.deal.title} onRefresh={load} />
      <p className="notice">{explain(deal)}</p>
      {actionError && <ErrorBox code={actionError} />}
      {authorPending && <ReceiveHint currency={dealReceives(deal.request.direction, deal.role)} />}

      {accepted && contact && (
        <div className="pay-to">
          <span className="hint small">{t.deal.payTo(contact.pay_currency)}</span>
          {contact.pay_account ? (
            <>
              {contact.pay_bank && <span className="pay-to-bank">{contact.pay_bank}</span>}
              <div className="pay-to-row">
                <span className="pay-to-value">{contact.pay_account}</span>
                <button
                  type="button"
                  className="copy-button"
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

      <RequestCard
        request={deal.request}
        status={t.dealRole[deal.role]}
        highlight={accepted}
        onOpen={() => nav.push({ name: "request", id: deal.request.id })}
      />

      <div className="detail">
        <Row label={t.deal.theirDeals}>{t.card.deals(deal.other_completed_deals)}</Row>
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
          className="secondary-button"
          disabled={busy !== null}
          onClick={() => void act("confirm", t.deal.confirmQuestion)}
        >
          {t.deal.confirm}
        </button>
      )}
    </div>
  );
}

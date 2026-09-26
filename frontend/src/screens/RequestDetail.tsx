import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { RequestExchange } from "../components/Exchange";
import { ReceiveHint } from "../components/ReceiveHint";
import { RequestCard } from "../components/RequestCard";
import { ErrorBox, Loading, Notice, Row } from "../components/ui";
import { askExtendDays } from "../extend";
import { describeRateGain, formatKst, formatRatePair, formatSide, rateTone, timeLeft } from "../format";
import { t } from "../i18n";
import { useMe } from "../me";
import { useNav, useReactivated } from "../nav";
import { SLOW_POLL_MS, usePolling } from "../polling";
import { confirm, haptic, type MainButtonConfig, useMainButton } from "../telegram";
import {
  type ExchangeRequest,
  expiresSoon,
  extendOptions,
  viewerRateGain,
  viewerSides,
} from "../types";

export function RequestDetail(props: { id: number; active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const [request, setRequest] = useState<ExchangeRequest | null>(null);
  // On the viewer's own open request: requests going the other way they could take.
  const [matches, setMatches] = useState<ExchangeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [extending, setExtending] = useState(false);
  // Responses to superseded loads (e.g. a poll sent before an action) are ignored.
  const loadSeq = useRef(0);

  /** A quiet load (polling) keeps what's shown if it fails; the next one retries. */
  const fetchRequest = useCallback(
    async (quiet: boolean) => {
      const seq = ++loadSeq.current;
      if (!quiet) setError(null);
      try {
        const loaded = await api.request(props.id);
        if (seq !== loadSeq.current) return;
        setRequest(loaded);
        if (loaded.is_own && loaded.status === "open") {
          const found = await api.requestMatches(props.id).catch(() => null);
          if (found && seq === loadSeq.current) setMatches(found);
        } else {
          setMatches([]);
        }
      } catch (e) {
        if (seq === loadSeq.current && !quiet) setError(errorCode(e));
      }
    },
    [props.id],
  );
  const load = useCallback(() => fetchRequest(false), [fetchRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back (e.g. from the deal screen): the request or our deal may have changed.
  useReactivated(props.active, load);
  // Someone else may take it meanwhile.
  usePolling(props.active && request?.status === "open", SLOW_POLL_MS, () => fetchRequest(true));

  const take = async () => {
    if (!request) return;
    const { pay, get } = viewerSides(request);
    if (!(await confirm(t.detail.takeConfirm(formatSide(get), formatSide(pay))))) return;
    setTaking(true);
    setActionError(null);
    try {
      const deal = await api.takeRequest(props.id);
      haptic("success");
      loadSeq.current++; // a poll sent before this is now stale
      setRequest(deal.request);
      nav.push({ name: "deal", id: deal.id });
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
      void load();
    } finally {
      setTaking(false);
    }
  };

  const cancel = async () => {
    if (cancelling || !(await confirm(t.cancelRequest.confirm))) return;
    setCancelling(true);
    setActionError(null);
    try {
      const closed = await api.closeRequest(props.id);
      haptic("success");
      loadSeq.current++;
      setRequest(closed);
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
      void load();
    } finally {
      setCancelling(false);
    }
  };

  const extend = async () => {
    if (!request || extending) return;
    const days = await askExtendDays(request);
    if (days === null) return;
    setExtending(true);
    setActionError(null);
    try {
      const extended = await api.updateRequest(props.id, { extend_days: days });
      haptic("success");
      loadSeq.current++;
      setRequest(extended);
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
      void load();
    } finally {
      setExtending(false);
    }
  };

  const canTake =
    request !== null &&
    !request.is_own &&
    request.status === "open" &&
    request.my_deal_id === null &&
    !me.is_banned &&
    Boolean(me.username);
  const myDealId = request?.my_deal_id ?? null;
  let mainButton: MainButtonConfig | null = null;
  if (canTake) mainButton = { text: t.detail.take, onClick: take, loading: taking };
  else if (myDealId !== null) {
    mainButton = { text: t.detail.openDeal, onClick: () => nav.push({ name: "deal", id: myDealId }) };
  }
  useMainButton(props.active ? mainButton : null);

  if (error) return <div className="screen"><ErrorBox code={error} onRetry={load} /></div>;
  if (!request) return <div className="screen"><Loading /></div>;

  const { get } = viewerSides(request);
  const gain = viewerRateGain(request);
  const open = request.status === "open";
  const left = open ? timeLeft(request.expires_at) : null;
  const pending = request.pending_count ?? 0;
  const ownOpen = request.is_own && open;
  // Why a request someone else posted can't be taken by this user.
  const blocked =
    request.is_own || !open || request.my_deal_id !== null
      ? null
      : me.is_banned
        ? t.detail.banned
        : !me.username
          ? t.detail.usernameRequired
          : null;
  return (
    <div className="screen">
      <div className="title-block">
        {request.is_own && <span className="eyebrow">{t.detail.yours}</span>}
        <h1 className="title">{t.buy[get.currency]}</h1>
      </div>

      {request.my_deal_status ? (
        <Notice>{t.detail.responded[request.my_deal_status]}</Notice>
      ) : !open ? (
        <Notice tone="warning">{t.detail.notOpen}</Notice>
      ) : request.is_own ? (
        <Notice>{pending > 0 ? t.detail.ownPending : t.detail.own}</Notice>
      ) : null}
      {ownOpen && expiresSoon(request) && <Notice tone="warning">{t.detail.expiresSoon}</Notice>}
      {blocked && <Notice tone="warning">{blocked}</Notice>}
      {actionError && <ErrorBox code={actionError} />}

      <RequestExchange request={request} />

      <div className="detail">
        <Row label={t.detail.rate}>
          {request.effective_rate !== null && <span>{formatRatePair(request.effective_rate)}</span>}
          <span className={`rate-tag ${rateTone(gain)}`}>{describeRateGain(gain)}</span>
        </Row>
        {!request.is_own && <Row label={t.detail.author}>{t.deals(request.author_completed_deals)}</Row>}
        {left ? (
          <Row label={t.detail.timeLeft}>
            <span>{left}</span>
            <span className="hint small">{t.detail.until(formatKst(request.expires_at))}</span>
          </Row>
        ) : (
          !open && <Row label={t.detail.status}>{t.status[request.status]}</Row>
        )}
      </div>

      {/* Taking it means receiving the currency the author gives. */}
      {canTake && <ReceiveHint currency={get.currency} />}

      {ownOpen && (
        <>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={pending > 0}
              onClick={() => nav.push({ name: "edit", request })}
            >
              {t.detail.edit}
            </button>
            {extendOptions(request).length > 0 && (
              <button
                type="button"
                className="secondary-button"
                disabled={extending}
                onClick={() => void extend()}
              >
                {extending ? t.loading : t.extend.button}
              </button>
            )}
          </div>
          {pending > 0 && <p className="hint small">{t.detail.editLocked}</p>}
          <button
            type="button"
            className="secondary-button destructive"
            disabled={cancelling}
            onClick={() => void cancel()}
          >
            {cancelling ? t.loading : t.cancelRequest.button}
          </button>
        </>
      )}
      {ownOpen && matches.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t.detail.matches}</h2>
          <div className="list">
            {matches.map((match) => (
              <RequestCard
                key={match.id}
                request={match}
                onOpen={() => nav.push({ name: "request", id: match.id })}
              />
            ))}
          </div>
        </section>
      )}
      {request.is_own && request.status === "expired" && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => nav.push({ name: "new", prefill: request })}
        >
          {t.detail.postAgain}
        </button>
      )}
      {!request.is_own && (
        <button
          type="button"
          className="link-button subtle center"
          onClick={() => nav.push({ name: "report", target: { kind: "request", id: request.id } })}
        >
          {t.detail.report}
        </button>
      )}
    </div>
  );
}

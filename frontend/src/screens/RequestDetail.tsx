import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorCode } from "../api";
import { ErrorBox, Loading, Row } from "../components/ui";
import { convert, describeRate, formatKst, formatMoney, timeLeft } from "../format";
import { t } from "../i18n";
import { ReceiveHint } from "../components/ReceiveHint";
import { useMe } from "../me";
import { useNav, useReactivated } from "../nav";
import { SLOW_POLL_MS, usePolling } from "../polling";
import { confirm, haptic, type MainButtonConfig, useMainButton } from "../telegram";
import { type ExchangeRequest, getCurrency, giveCurrency } from "../types";

export function RequestDetail(props: { id: number; active: boolean }) {
  const me = useMe();
  const nav = useNav();
  const [request, setRequest] = useState<ExchangeRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Responses to superseded loads (e.g. a poll sent before an action) are ignored.
  const loadSeq = useRef(0);

  /** A quiet load (polling) keeps what's shown if it fails; the next one retries. */
  const fetchRequest = useCallback(
    async (quiet: boolean) => {
      const seq = ++loadSeq.current;
      if (!quiet) setError(null);
      try {
        const loaded = await api.request(props.id);
        if (seq === loadSeq.current) setRequest(loaded);
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
    if (!(await confirm(t.detail.takeConfirm))) return;
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

  const give = giveCurrency(request.direction);
  const left = timeLeft(request.expires_at);
  // Why a request someone else posted can't be taken by this user.
  const blocked =
    request.is_own || request.status !== "open" || request.my_deal_id !== null
      ? null
      : me.is_banned
        ? t.detail.banned
        : !me.username
          ? t.detail.usernameRequired
          : null;
  return (
    <div className="screen">
      <h1 className="title">{t.directionLong[request.direction]}</h1>

      {request.my_deal_status && (
        <p className="notice">{t.detail.responded(t.dealStatus[request.my_deal_status])}</p>
      )}
      {request.status !== "open" && (
        <p className="notice">{t.detail.notOpen(t.status[request.status])}</p>
      )}
      {request.is_own && request.status === "open" && <p className="notice">{t.detail.own}</p>}
      {blocked && <p className="notice">{blocked}</p>}
      {/* Taking it means receiving the currency the author gives. */}
      {canTake && <ReceiveHint currency={give} />}
      {actionError && <ErrorBox code={actionError} />}

      <div className="detail">
        <Row label={t.detail.gives}>
          <strong>{formatMoney(request.amount, give)}</strong>
        </Row>
        {request.effective_rate !== null && (
          <Row label={t.detail.wants}>
            {formatMoney(
              convert(request.amount, give, request.effective_rate),
              getCurrency(request.direction),
            )}
          </Row>
        )}
        <Row label={t.detail.rate}>{describeRate(request)}</Row>
        <Row label={t.detail.author}>{t.card.deals(request.author_completed_deals)}</Row>
        <Row label={t.detail.posted}>{formatKst(request.created_at)}</Row>
        {request.status === "open" && (
          <Row label={t.detail.expires}>
            {formatKst(request.expires_at)}
            {left && <span className="hint"> · {t.card.timeLeft(left)}</span>}
          </Row>
        )}
      </div>

      {request.is_own && request.status === "open" && (
        <button
          type="button"
          className="secondary-button destructive"
          disabled={cancelling}
          onClick={() => void cancel()}
        >
          {cancelling ? t.loading : t.cancelRequest.button}
        </button>
      )}
    </div>
  );
}

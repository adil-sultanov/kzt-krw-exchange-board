import { useState } from "react";
import { api, errorCode } from "../api";
import { Person } from "../components/AdminPerson";
import { Empty, ErrorBox, SkeletonList, TitleWithRefresh } from "../components/ui";
import { describeRateGain, formatKstShort, formatMoney, formatRatePair, formatSide, rateTone, timeLeft } from "../format";
import { t } from "../i18n";
import { useTabList } from "../tabList";
import { confirm, haptic } from "../telegram";
import { type AdminBoardRequest, convert, getCurrency, giveCurrency, viewerRateGain } from "../types";

function RequestCard(props: { request: AdminBoardRequest; busy: boolean; onRemove: () => void }) {
  const { request, busy } = props;
  const give = giveCurrency(request.direction);
  const pay = formatMoney(request.amount, give);
  const get = formatSide({
    currency: getCurrency(request.direction),
    amount: request.effective_rate === null ? null : convert(request.amount, give, request.effective_rate),
    approx: true,
  });
  // The rate as its author sees it.
  const gain = viewerRateGain({ ...request, is_own: true });
  const left = timeLeft(request.expires_at);
  return (
    <div className="card">
      <div className="admin-head">
        <strong>{t.admin.request(request.id)}</strong>
        <span className="hint small">{t.boardRequests.posted(formatKstShort(request.created_at))}</span>
      </div>
      <p className="small">
        {t.boardRequests.exchange(pay, get)}
        <br />
        <span className="hint">
          {request.effective_rate !== null && `${formatRatePair(request.effective_rate)} · `}
          <span className={`rate-tag ${rateTone(gain)}`}>{describeRateGain(gain)}</span>
          {left && ` · ${t.boardRequests.leaves(left)}`}
        </span>
        {request.open_reports > 0 && (
          <>
            <br />
            <span className="rate-tag worse">{t.admin.reportsOnRequest(request.open_reports)}</span>
          </>
        )}
      </p>
      <Person label={t.boardRequests.author} user={request.author} />
      {request.responders.length > 0 && (
        <>
          <span className="hint small">{t.boardRequests.waiting(request.responders.length)}</span>
          {request.responders.map((responder) => (
            <Person key={responder.telegram_id} user={responder} />
          ))}
        </>
      )}
      <button type="button" className="secondary-button destructive" disabled={busy} onClick={props.onRemove}>
        {t.boardRequests.remove}
      </button>
    </div>
  );
}

/** Admins see every request on the board, and can take any of them off it. */
export function BoardRequests(props: { active: boolean }) {
  // One list, no tabs: useTabList still gives the reload-on-return and stale handling.
  const list = useTabList("all", () => api.boardRequests(), props.active);
  const { items: requests, load } = list;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (request: AdminBoardRequest) => {
    if (busy || !(await confirm(t.boardRequests.removeConfirm(request.id, request.responders.length)))) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.removeRequest(request.id);
      haptic("success");
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
    } finally {
      setBusy(false);
      void load();
    }
  };

  return (
    <div className="screen">
      <TitleWithRefresh title={t.boardRequests.title} onRefresh={load} />
      {requests && requests.length > 0 && <p className="hint small">{t.boardRequests.hint(requests.length)}</p>}
      {actionError && <ErrorBox code={actionError} />}
      {list.error && <ErrorBox code={list.error} onRetry={() => void load()} />}
      {list.loading && <SkeletonList />}
      {requests &&
        (requests.length === 0 ? (
          <Empty title={t.boardRequests.empty} />
        ) : (
          <div className="list">
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                busy={busy}
                onRemove={() => void remove(request)}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

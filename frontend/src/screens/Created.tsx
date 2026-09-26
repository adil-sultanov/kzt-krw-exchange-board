import { CheckIcon } from "../components/icons";
import { RequestCard } from "../components/RequestCard";
import { t } from "../i18n";
import { useNav } from "../nav";
import { useMainButton } from "../telegram";
import type { CreatedRequest } from "../types";

/** Shown right after posting: the new request and matching requests going the other way. */
export function Created(props: { active: boolean; result: CreatedRequest }) {
  const nav = useNav();
  const { request, matches } = props.result;

  useMainButton(props.active ? { text: t.created.done, onClick: nav.home } : null);

  return (
    <div className="screen">
      <div className="success-head">
        <span className="success-icon">
          <CheckIcon />
        </span>
        <h1 className="title">{t.created.title}</h1>
        <p className="hint">{t.created.body}</p>
      </div>
      <RequestCard request={request} onOpen={() => nav.push({ name: "request", id: request.id })} />

      <section className="section">
        <h2 className="section-title">{t.created.matches}</h2>
        {matches.length === 0 ? (
          <p className="hint small section-note">{t.created.noMatches}</p>
        ) : (
          <div className="list">
            {matches.map((match) => (
              <RequestCard
                key={match.id}
                request={match}
                onOpen={() => nav.push({ name: "request", id: match.id })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

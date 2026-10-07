import { t } from "../i18n";

/**
 * How the board works, in short points: what the other screens no longer spell out (posting,
 * taking, deals, alerts, who sees what). Opened from Profile and from New request.
 */
export function Guide() {
  return (
    <div className="screen">
      <h1 className="title">{t.guide.title}</h1>
      {t.guide.sections.map((section) => (
        <section key={section.title} className="section">
          <h2 className="section-title">{section.title}</h2>
          <ul className="section-body guide-list">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

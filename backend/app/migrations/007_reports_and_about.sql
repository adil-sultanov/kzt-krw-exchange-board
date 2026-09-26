-- Reports (milestone 6). A report is about a request, or about an accepted deal on it (then
-- `deal_id` is set too); `reported_id` is the user it's about. `reason` is now the reporter's
-- optional note ('' when left empty), next to a preset `category`.
ALTER TABLE reports ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('scam', 'no_payment', 'disappeared', 'spam', 'other'));
ALTER TABLE reports ADD COLUMN reported_id INTEGER REFERENCES users (telegram_id);
ALTER TABLE reports ADD COLUMN resolved_at TEXT;
ALTER TABLE reports ADD COLUMN resolved_by INTEGER REFERENCES users (telegram_id);
UPDATE reports SET reported_id = (SELECT user_id FROM requests WHERE id = reports.request_id);
CREATE INDEX idx_reports_reporter ON reports (reporter_id, created_at);
CREATE INDEX idx_reports_reported ON reports (reported_id, resolved);

-- The About page's donate section, edited by the owner (OWNER_ID). A single row.
-- donate_options: JSON list of {"label": ..., "value": ...} (a link or e.g. a card number).
CREATE TABLE about (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    donate_note    TEXT    NOT NULL DEFAULT '' CHECK (length(donate_note) <= 300),
    donate_options TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(donate_options)),
    updated_at     TEXT    NOT NULL
);

-- When the deal was accepted: 3 h later, each side that hasn't confirmed receiving the
-- other's payment gets one bot reminder (`*_reminded` records that it was sent). Deals
-- accepted before this get their last change instead, so ones still in progress are reminded
-- once.
ALTER TABLE deals ADD COLUMN accepted_at TEXT;
UPDATE deals SET accepted_at = updated_at WHERE status IN ('accepted', 'completed');
ALTER TABLE deals ADD COLUMN author_reminded INTEGER NOT NULL DEFAULT 0
    CHECK (author_reminded IN (0, 1));
ALTER TABLE deals ADD COLUMN responder_reminded INTEGER NOT NULL DEFAULT 0
    CHECK (responder_reminded IN (0, 1));

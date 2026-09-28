-- Once someone's counter offer is accepted, that part is their deal, and the rest of the request
-- is open to them like to anyone else: they may take it or send another counter offer. So a
-- person can have several deals on one request, and UNIQUE (request_id, responder_id) gives way
-- to a check in the app: one response at a time, and none after being declined.
--
-- SQLite can't drop a constraint, so the table is rebuilt (the runner turns foreign keys off
-- and checks them before committing). This also adds `request_amount`: the request's amount
-- the deal was part of, when it was made and again when it was accepted, to show a counter
-- offer next to the whole request after the request's amount has moved on. Counter offers
-- accepted before this get what was left of their request plus their own part.
CREATE TABLE deals_new (
    id                  INTEGER PRIMARY KEY,
    request_id          INTEGER NOT NULL REFERENCES requests (id),
    author_id           INTEGER NOT NULL REFERENCES users (telegram_id),
    responder_id        INTEGER NOT NULL REFERENCES users (telegram_id),
    status              TEXT    NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
    author_confirmed    INTEGER NOT NULL DEFAULT 0 CHECK (author_confirmed IN (0, 1)),
    responder_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (responder_confirmed IN (0, 1)),
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL,
    amount              INTEGER CHECK (amount IS NULL OR amount > 0),
    partial             INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1)),
    request_amount      INTEGER CHECK (request_amount IS NULL OR request_amount > 0),
    CHECK (author_id != responder_id)
);
INSERT INTO deals_new (id, request_id, author_id, responder_id, status, author_confirmed,
                       responder_confirmed, created_at, updated_at, amount, partial,
                       request_amount)
SELECT d.id, d.request_id, d.author_id, d.responder_id, d.status, d.author_confirmed,
       d.responder_confirmed, d.created_at, d.updated_at, d.amount, d.partial,
       CASE WHEN d.partial = 1 AND d.status IN ('accepted', 'completed') THEN r.amount + d.amount
            ELSE MAX(r.amount, d.amount) END
FROM deals d
JOIN requests r ON r.id = d.request_id;
DROP TABLE deals;
ALTER TABLE deals_new RENAME TO deals;
CREATE INDEX idx_deals_author ON deals (author_id, status);
CREATE INDEX idx_deals_responder ON deals (responder_id, status);
CREATE INDEX idx_deals_request ON deals (request_id, responder_id);

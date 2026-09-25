-- Initial schema. All timestamps are UTC ISO 8601 strings.
-- Users are identified only by telegram_id; username is a nullable, non-unique cache.

CREATE TABLE users (
    telegram_id     INTEGER PRIMARY KEY,
    username        TEXT,
    first_name      TEXT    NOT NULL DEFAULT '',
    completed_deals INTEGER NOT NULL DEFAULT 0 CHECK (completed_deals >= 0),
    is_banned       INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1)),
    is_admin        INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
CREATE INDEX idx_users_username ON users (username COLLATE NOCASE);

-- amount: whole units of the currency being given. rate_value: KRW per 1 KZT for
-- 'fixed', or a percentage offset from the reference rate for 'market'.
CREATE TABLE requests (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users (telegram_id),
    direction       TEXT    NOT NULL CHECK (direction IN ('KZT_KRW', 'KRW_KZT')),
    amount          INTEGER NOT NULL CHECK (amount > 0),
    rate_type       TEXT    NOT NULL CHECK (rate_type IN ('fixed', 'market')),
    rate_value      REAL    NOT NULL,
    payment_methods TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(payment_methods)),
    note            TEXT    CHECK (note IS NULL OR length(note) <= 200),
    status          TEXT    NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'completed', 'closed', 'expired')),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    expires_at      TEXT    NOT NULL,
    reminder_sent   INTEGER NOT NULL DEFAULT 0 CHECK (reminder_sent IN (0, 1))
);
CREATE INDEX idx_requests_board ON requests (status, direction, created_at);
CREATE INDEX idx_requests_user ON requests (user_id, status);
CREATE INDEX idx_requests_expiry ON requests (status, expires_at);

CREATE TABLE deals (
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
    UNIQUE (request_id, responder_id),
    CHECK (author_id != responder_id)
);
CREATE INDEX idx_deals_author ON deals (author_id, status);
CREATE INDEX idx_deals_responder ON deals (responder_id, status);
-- Safety net: a request can have at most one accepted/completed deal.
CREATE UNIQUE INDEX idx_deals_one_active ON deals (request_id)
    WHERE status IN ('accepted', 'completed');

CREATE TABLE alerts (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (telegram_id),
    direction  TEXT    NOT NULL CHECK (direction IN ('KZT_KRW', 'KRW_KZT')),
    min_amount INTEGER CHECK (min_amount IS NULL OR min_amount >= 0),
    max_amount INTEGER CHECK (max_amount IS NULL OR max_amount >= 0),
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT    NOT NULL,
    CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
);
CREATE INDEX idx_alerts_match ON alerts (active, direction);
CREATE INDEX idx_alerts_user ON alerts (user_id);

CREATE TABLE reports (
    id          INTEGER PRIMARY KEY,
    reporter_id INTEGER NOT NULL REFERENCES users (telegram_id),
    request_id  INTEGER NOT NULL REFERENCES requests (id),
    deal_id     INTEGER REFERENCES deals (id),
    reason      TEXT    NOT NULL CHECK (length(reason) <= 500),
    created_at  TEXT    NOT NULL,
    resolved    INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1))
);
CREATE INDEX idx_reports_open ON reports (resolved, created_at);

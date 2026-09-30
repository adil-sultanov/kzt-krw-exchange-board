-- Alerts: the bot messages a user about every new request in a Board tab they turned alerts
-- on for (off by default). Named by the tab: `alerts_buy_krw` covers KRW_KZT requests (taking
-- one gets you KRW), `alerts_buy_kzt` covers KZT_KRW. `alerts_seen`: they've opened the Alerts
-- panel once, which clears its "new" dot.
ALTER TABLE users ADD COLUMN alerts_buy_krw INTEGER NOT NULL DEFAULT 0
    CHECK (alerts_buy_krw IN (0, 1));
ALTER TABLE users ADD COLUMN alerts_buy_kzt INTEGER NOT NULL DEFAULT 0
    CHECK (alerts_buy_kzt IN (0, 1));
ALTER TABLE users ADD COLUMN alerts_seen INTEGER NOT NULL DEFAULT 0
    CHECK (alerts_seen IN (0, 1));

-- Alert messages the bot sent about requests still on the board, so it can cross them out
-- ("No longer available") once a request leaves it; the rows go then. `text` is what was sent.
CREATE TABLE alert_messages (
    request_id INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
    chat_id    INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    text       TEXT    NOT NULL,
    PRIMARY KEY (request_id, chat_id)
);

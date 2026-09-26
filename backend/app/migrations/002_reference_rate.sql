-- Latest reference rate (KRW per 1 KZT), used for display and for 'market' requests.
-- A single row, replaced on every successful refresh.

CREATE TABLE reference_rate (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    rate       REAL    NOT NULL CHECK (rate > 0),
    source     TEXT    NOT NULL,
    fetched_at TEXT    NOT NULL
);

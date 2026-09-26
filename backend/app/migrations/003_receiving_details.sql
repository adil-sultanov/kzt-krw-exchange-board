-- Where each user receives money, per currency (free text, e.g. "Kaspi +7 707 ...").
-- Sensitive: shown only to the other side of an accepted deal, never logged.

ALTER TABLE users ADD COLUMN receive_kzt TEXT
    CHECK (receive_kzt IS NULL OR length(receive_kzt) <= 200);
ALTER TABLE users ADD COLUMN receive_krw TEXT
    CHECK (receive_krw IS NULL OR length(receive_krw) <= 200);

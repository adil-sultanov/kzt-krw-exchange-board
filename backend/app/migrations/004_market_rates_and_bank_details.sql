-- Receiving details are split into a bank (with the account holder's name) and an account
-- number, so the number can be copied on its own. Existing free-text details become the
-- account number. Sensitive: shown only to the other side of an accepted deal, never logged.
ALTER TABLE users RENAME COLUMN receive_kzt TO receive_kzt_account;
ALTER TABLE users RENAME COLUMN receive_krw TO receive_krw_account;
ALTER TABLE users ADD COLUMN receive_kzt_bank TEXT
    CHECK (receive_kzt_bank IS NULL OR length(receive_kzt_bank) <= 100);
ALTER TABLE users ADD COLUMN receive_krw_bank TEXT
    CHECK (receive_krw_bank IS NULL OR length(receive_krw_bank) <= 100);

-- Requests are priced only relative to the market rate now (rate_type is always 'market',
-- rate_value a percent offset), and notes are no longer collected. Fixed rates existed
-- only before launch; they become the plain market rate.
UPDATE requests SET rate_type = 'market', rate_value = 0 WHERE rate_type = 'fixed';

-- The bank the author would rather send or receive KZT with ("Kaspi"), shown on the request
-- to everyone who sees it; NULL: no preference. `users.saved_kzt_bank` is the one they asked
-- New request to remember, filled in on their next request.
ALTER TABLE requests ADD COLUMN kzt_bank TEXT CHECK (kzt_bank IS NULL OR length(kzt_bank) <= 40);
ALTER TABLE users ADD COLUMN saved_kzt_bank TEXT
    CHECK (saved_kzt_bank IS NULL OR length(saved_kzt_bank) <= 40);

-- Deals' `cancelled` status is used again: a responder cancels their offer (taking a request,
-- or a counter offer) while it's still pending. Accepted deals still can't be cancelled.
-- The status was already allowed, so nothing changes in the schema.

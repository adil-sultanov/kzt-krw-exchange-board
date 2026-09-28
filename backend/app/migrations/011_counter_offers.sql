-- Counter offers: instead of taking a whole request, someone asks for part of it. Its author
-- sets the smallest part they'll accept (`min_counter_amount`, in the request's currency; NULL
-- turns counter offers off, as for every request posted before this). Accepting a counter offer
-- keeps the request on the board with its `amount` reduced by that part, so a request can now
-- have several accepted and completed deals.
ALTER TABLE requests ADD COLUMN min_counter_amount INTEGER
    CHECK (min_counter_amount IS NULL OR min_counter_amount > 0);
-- What the deal is for, in the request's currency: the whole request (its amount when taken)
-- or the part a counter offer asked for. `partial`: less than the whole request, so accepting
-- it leaves the rest on the board (fixed once accepted).
ALTER TABLE deals ADD COLUMN amount INTEGER CHECK (amount IS NULL OR amount > 0);
ALTER TABLE deals ADD COLUMN partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1));
UPDATE deals SET amount = (SELECT amount FROM requests WHERE id = deals.request_id);
DROP INDEX idx_deals_one_active;

-- A request's amount is fixed in whichever currency its author typed last when posting (or
-- editing) it: what they buy ('buy', as every request before this) or what they give
-- ('sell'). The other side follows the market rate until a deal is accepted. Its smallest
-- counter offer is in the same currency.
ALTER TABLE requests ADD COLUMN amount_side TEXT NOT NULL DEFAULT 'buy'
    CHECK (amount_side IN ('buy', 'sell'));

-- A deal's amounts (`amount`, `request_amount`) are in its request's amount currency when the
-- deal was made, kept here since an edit may change the request's later.
ALTER TABLE deals ADD COLUMN amount_side TEXT NOT NULL DEFAULT 'buy'
    CHECK (amount_side IN ('buy', 'sell'));

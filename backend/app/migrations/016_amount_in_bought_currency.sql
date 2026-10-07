-- A request's amount is now in the currency its author buys (KRW for 'KZT_KRW', KZT for
-- 'KRW_KZT'), so what they get is fixed and what they pay follows the market rate. Before,
-- it was in the currency they give. The same goes for its smallest counter offer and its
-- deals' amounts.
--
-- And a deal's rate (KRW per 1 KZT) is locked when it's accepted: `deals.rate`, NULL while
-- it's pending (or if no reference rate was known then). Deals already accepted or completed
-- are locked at today's rate.
ALTER TABLE deals ADD COLUMN rate REAL CHECK (rate IS NULL OR rate > 0);

UPDATE deals SET rate = (
    SELECT ref.rate * (1 + r.rate_value / 100.0)
    FROM requests r, reference_rate ref
    WHERE r.id = deals.request_id
)
WHERE status IN ('accepted', 'completed');

-- Existing amounts are converted at each deal's locked rate, else at its request's rate
-- today. Without any reference rate yet there's nothing to convert with, and they stay as
-- they are.
UPDATE deals SET
    amount = COALESCE(MAX(1, CAST(ROUND(CASE (SELECT direction FROM requests WHERE id = deals.request_id)
        WHEN 'KZT_KRW' THEN amount * COALESCE(deals.rate, (
            SELECT ref.rate * (1 + r.rate_value / 100.0)
            FROM requests r JOIN reference_rate ref ON ref.id = 1 WHERE r.id = deals.request_id
        ))
        ELSE amount / COALESCE(deals.rate, (
            SELECT ref.rate * (1 + r.rate_value / 100.0)
            FROM requests r JOIN reference_rate ref ON ref.id = 1 WHERE r.id = deals.request_id
        )) END) AS INTEGER)), amount),
    request_amount = COALESCE(MAX(1, CAST(ROUND(CASE (SELECT direction FROM requests WHERE id = deals.request_id)
        WHEN 'KZT_KRW' THEN request_amount * COALESCE(deals.rate, (
            SELECT ref.rate * (1 + r.rate_value / 100.0)
            FROM requests r JOIN reference_rate ref ON ref.id = 1 WHERE r.id = deals.request_id
        ))
        ELSE request_amount / COALESCE(deals.rate, (
            SELECT ref.rate * (1 + r.rate_value / 100.0)
            FROM requests r JOIN reference_rate ref ON ref.id = 1 WHERE r.id = deals.request_id
        )) END) AS INTEGER)), request_amount);

UPDATE requests SET
    amount = COALESCE((
        SELECT MAX(1, CAST(ROUND(CASE requests.direction
            WHEN 'KZT_KRW' THEN requests.amount * ref.rate * (1 + requests.rate_value / 100.0)
            ELSE requests.amount / (ref.rate * (1 + requests.rate_value / 100.0)) END) AS INTEGER))
        FROM reference_rate ref WHERE ref.id = 1
    ), amount),
    min_counter_amount = COALESCE((
        SELECT MAX(1, CAST(ROUND(CASE requests.direction
            WHEN 'KZT_KRW'
                THEN requests.min_counter_amount * ref.rate * (1 + requests.rate_value / 100.0)
            ELSE requests.min_counter_amount / (ref.rate * (1 + requests.rate_value / 100.0))
            END) AS INTEGER))
        FROM reference_rate ref WHERE ref.id = 1
    ), min_counter_amount);

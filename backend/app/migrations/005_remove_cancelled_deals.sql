-- Deals can no longer be cancelled (an accepted deal ends only when both sides confirm), so
-- the ones cancelled before that rule are removed. The status CHECK still allows
-- 'cancelled' (changing it would mean rebuilding the table); nothing sets it any more.
UPDATE reports SET deal_id = NULL
WHERE deal_id IN (SELECT id FROM deals WHERE status = 'cancelled');
DELETE FROM deals WHERE status = 'cancelled';

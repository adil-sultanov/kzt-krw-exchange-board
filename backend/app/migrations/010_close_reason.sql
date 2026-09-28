-- Why and by whom a request was taken off the board (status 'closed'), for the admins' list
-- of cancelled requests: its author cancelled it ('author'), an admin removed it ('admin'), a
-- ban closed it ('ban'), or the owner deleted its accepted deal ('deal_deleted'). `closed_by`
-- is the user who did it (the author, or the admin). This replaces `removed_by_admin`
-- (migration 009): any reason but 'author' means an admin did it. Requests closed before
-- this was recorded keep NULL, except those 009 marked as an admin's.
ALTER TABLE requests ADD COLUMN close_reason TEXT
    CHECK (close_reason IS NULL OR close_reason IN ('author', 'admin', 'ban', 'deal_deleted'));
ALTER TABLE requests ADD COLUMN closed_by INTEGER REFERENCES users (telegram_id);
UPDATE requests SET close_reason = 'admin' WHERE removed_by_admin = 1;
ALTER TABLE requests DROP COLUMN removed_by_admin;
CREATE INDEX idx_requests_closed ON requests (status, updated_at);

-- When the user last used the app or the bot, for admins helping them (Admin: users). It's
-- refreshed at most every few minutes rather than on every request, and doesn't touch
-- `updated_at`. Existing users start from their last change.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
UPDATE users SET last_seen_at = updated_at;

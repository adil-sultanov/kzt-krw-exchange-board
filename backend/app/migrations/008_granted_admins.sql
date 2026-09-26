-- Admins the owner added in the app (by username), next to the ones in ADMIN_IDS / OWNER_ID.
-- `is_admin` stays the effective flag: set from the config on every request, or kept by this.
ALTER TABLE users ADD COLUMN admin_granted INTEGER NOT NULL DEFAULT 0
    CHECK (admin_granted IN (0, 1));

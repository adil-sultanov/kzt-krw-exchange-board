-- A profile each user fills in (needed to post or take a request), shown as a tag on their
-- requests and deals: "Adil Sultanov, UNIST, 2022". Unlike `first_name` (Telegram's, a
-- cache), the user types it in the app.
ALTER TABLE users ADD COLUMN profile_first_name TEXT
    CHECK (profile_first_name IS NULL OR length(profile_first_name) <= 40);
ALTER TABLE users ADD COLUMN profile_last_name TEXT
    CHECK (profile_last_name IS NULL OR length(profile_last_name) <= 40);
ALTER TABLE users ADD COLUMN university TEXT
    CHECK (university IS NULL OR length(university) <= 60);
ALTER TABLE users ADD COLUMN enrollment_year INTEGER
    CHECK (enrollment_year IS NULL OR enrollment_year BETWEEN 1990 AND 2100);

-- Admins can take any request off the board (and a ban closes the user's requests): then
-- both sides are told an admin removed it, not that its author cancelled it.
ALTER TABLE requests ADD COLUMN removed_by_admin INTEGER NOT NULL DEFAULT 0
    CHECK (removed_by_admin IN (0, 1));

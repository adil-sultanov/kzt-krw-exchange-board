-- People whose first contact is the bot start with alerts on for both Board tabs (see
-- services/users.py). Existing users who show no sign of having used the app (no profile,
-- never opened the Alerts panel, no requests or deals) get the same. Anyone the bot can't
-- message has them turned off again on the first failed alert.
UPDATE users SET alerts_buy_krw = 1, alerts_buy_kzt = 1
WHERE alerts_seen = 0
    AND profile_first_name IS NULL
    AND is_banned = 0
    AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.user_id = users.telegram_id)
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.responder_id = users.telegram_id);

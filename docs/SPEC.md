# Product spec — KZT ↔ KRW Exchange Board

Detailed behavior. CLAUDE.md holds the always-on rules; the schema lives in `backend/app/migrations/`.

## Screens (Mini App)
- **Board** — open requests, filterable by direction (KZT→KRW / KRW→KZT),
  amount range, payment method; sortable by amount, rate, newest.
  Shows the current reference rate at the top. Hides the viewer's own requests
  and requests from banned users.
- **Request detail** — amount, rate, payment methods, note, author's completed-deals count,
  time left. Buttons: **I'll take it** (creates a pending deal, see Deal flow), **Report**.
  Usernames are never shown before the author accepts.
- **New request** — form: direction, amount, rate (fixed value, or market ± %),
  payment methods (multi-select: Kaspi, Halyk, Toss, KakaoBank, other),
  duration (1 / 3 / 7 days), optional short note (max 200 chars).
  Show matching opposite requests right after creation.
- **My requests** — two tabs:
  - *Posted*: edit, extend, close; see pending responders with Accept / Decline.
  - *Deals*: requests I took or deals I accepted, with status, a **Contact** button
    once accepted, and **Completed** / **Cancel** actions.
- **Alerts** — subscribe to notifications, e.g. "KRW→KZT over 300,000 KRW".
- **Profile / About** — completed deals count, disclaimer, donation info.

Use Telegram theme params (`themeParams`, CSS vars) so the UI matches the user's
light/dark theme. Use `MainButton` for primary form actions and `BackButton`
for navigation where natural. Deep links into a screen use the Mini App `startapp`
parameter (e.g. `req_123`, `deal_45`).

## Bot notifications (DMs)
- New request matches your open opposite request or one of your alerts
- Request expires in 24h → inline buttons: Extend / Close
- Someone wants to take your request (shows their completed-deals count) → Accept / Decline
- Your response was accepted / declined / the request was taken by someone else
- Deal accepted → both sides get a **Contact** button linking to the other's Telegram account
- The other side marked the deal completed → Confirm / Dispute
- Every notification includes a button that opens the Mini App at the relevant screen

If a DM fails because the user blocked the bot, log it (without user data) and move on;
never let a failed notification roll back a state change.

## Deal flow
1. B opens A's request and taps **I'll take it**. The backend creates a `pending` deal
   with B's `telegram_id` taken from B's verified initData (never from the request body).
2. The bot DMs A with Accept / Decline. A can have several pending responders on one request.
3. **Accept**: deal → `accepted`, request → `in_progress` (hidden from the Board);
   other pending deals on that request → `declined`, and those users are notified.
   Both A and B get a Contact button: `https://t.me/<current username>`, opened in the
   Mini App via `Telegram.WebApp.openTelegramLink`. They arrange the exchange privately.
4. **Decline**: deal → `declined`, B is notified.
5. After the exchange, either side taps **Completed**; the other gets Confirm / Dispute.
   Both confirmed → deal and request → `completed`, both users' `completed_deals` += 1.
   **Dispute** leaves the deal `accepted` and creates a report for admin review.
6. Either side can **Cancel** an accepted deal → deal `cancelled`; request returns to `open`
   (or `expired` if `expires_at` has passed). The other side is notified.
7. A user cannot take their own request or have two pending deals on the same request.
8. Closing or expiring a request declines all its pending deals and notifies responders.
   Requests that are `in_progress` do not expire.

All state transitions happen in a single DB transaction with a status check in the
`WHERE` clause (e.g. `UPDATE deals SET status='accepted' WHERE id=? AND status='pending'`),
so double taps and races between the app and bot buttons are harmless.

## Identity and usernames
- Users are identified **only** by `telegram_id` (permanent). All foreign keys use it.
- `username` is a nullable, non-unique cache: refresh it from initData on every API
  request and from every bot update. If another row holds the same username,
  set that row's `username` to NULL.
- Always read the current username at render/send time; never store usernames in
  deals, requests, or messages.
- A username is required to create or take a request (the Contact link needs it).
  Explain this in the UI to users without one. Do not rely on `tg://user?id=` links.

## Trust and moderation
- Completed-deal count shown on requests and responder notifications
  (counts only when both sides confirm)
- Reports stored for admin review; admins can ban users (banned users can't post or
  take requests, and their open requests are closed)
- Limits: at most 5 open requests per user and a small rate limit on creating requests
  and reports, to keep the board clean

## API
All routes require valid initData.
- `GET  /api/me`
- `GET  /api/rate`
- `GET  /api/requests` (filters as query params)
- `POST /api/requests`
- `GET  /api/requests/{id}`
- `PATCH /api/requests/{id}` (edit / extend / close — author only)
- `GET  /api/my/requests` (includes pending responders for each request)
- `POST /api/requests/{id}/take` (creates a pending deal for the caller)
- `POST /api/requests/{id}/report`
- `GET  /api/my/deals`
- `POST /api/deals/{id}/accept` | `/decline` (request author only)
- `POST /api/deals/{id}/complete` | `/confirm` | `/dispute` | `/cancel` (deal participants only)
- `GET  /api/deals/{id}/contact` (returns the other side's current `t.me` link;
  only when the deal is `accepted` or `completed` and the caller is a participant)
- `GET/POST/DELETE /api/alerts`
- Admin only: `GET /api/admin/reports`, `POST /api/admin/reports/{id}/resolve`,
  `POST /api/admin/users/{id}/ban` | `/unban`

Errors return `{"detail": "<machine_code>"}` with a proper HTTP status; the frontend maps
codes to strings in `i18n.ts`.

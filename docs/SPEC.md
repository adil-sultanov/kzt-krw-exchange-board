# Product spec — KZT ↔ KRW Exchange Board

Detailed behavior. CLAUDE.md holds the always-on rules; the schema lives in `backend/app/migrations/`.

## Screens (Mini App)
- **Board** — open requests, filterable by direction ("Buy KRW 🇰🇷" = `KZT_KRW`,
  "Buy KZT 🇰🇿" = `KRW_KZT`; a request is named by what its author buys) and amount range;
  sortable by amount, rate, newest. Shows the reference rate both ways at the top
  (1 KZT = X KRW and 1 KRW = Y KZT). Large **My deals** and **Profile** buttons with icons,
  and a **Refresh** button next to Filters. Hides the viewer's own requests and requests from
  banned users.
- **Request detail** — amount, rate, author's completed-deals count,
  time left. Buttons: **I'll take it** (creates a pending deal, see Deal flow), **Report**;
  on the author's own open request, **Cancel request**.
  Usernames are never shown before the author accepts.
- **New request** — form: direction, amount, rate (Market (default) / Above market % /
  Below market %, up to 20%; always relative to the reference rate, no fixed rates),
  duration (1 / 3 days), with a note that the request leaves the board once the author accepts
  someone or cancels it, or when the time runs out. No free-text note, no payment methods
  (where to pay comes from the receiving details once a deal is accepted).
  Show matching opposite requests right after creation.
- **My requests** — two tabs:
  - *Posted*: edit, extend; see pending responders with Accept / Decline. (Closing is
    already on My deals and the request screen, as **Cancel request**.)
  - *Deals*: requests I took or deals I accepted, with status, a **Contact** button
    once accepted, the other side's receiving details, and **I received the money**.
- **My deals** — first the viewer's requests on the board (open, not expired), each with
  **Cancel request**. Then every deal the user is part of, in sections: *Active deals*
  (`pending` or `accepted`; deals in progress come first and are outlined, then deals waiting
  on the viewer, then the rest), *Completed*, *Declined*. My deals and the deal screen have a
  **Refresh** button.
- **Alerts** — saved searches, e.g. "KRW→KZT over 300,000 KRW"; new matching requests are
  highlighted in the app (no bot message).
- **Profile / About** — completed deals count, receiving details per currency (KZT, KRW): bank
  and account holder, and account / card / phone number (max 100 chars each), disclaimer,
  author, links to Terms and Privacy.
- The Board's **My deals** link shows a badge with the number of deals waiting on the viewer
  (a pending responder to answer, or a payment to confirm once the other side has).
- A small gray "Made by @moonpie24" footer under every screen.

**Auto-refresh**: the screen on top re-fetches its data while the app is in view (paused while
it's hidden or minimized, and refreshed right away when it's back): the deal screen and My
deals every 5 s, the Board (with the My deals badge) and request details every 10 s. The deal
screen stops once the deal is completed or declined. A failed background refresh keeps what's
shown. Auth skips its write when nothing about the user changed, so polling is read-only.

Use Telegram theme params (`themeParams`, CSS vars) so the UI matches the user's
light/dark theme. Use `MainButton` for primary form actions and `BackButton`
for navigation where natural. Deep links into a screen use the Mini App `startapp`
parameter (e.g. `req_123`, `deal_45`).

## Bot messages
The bot answers `/start` with a button that opens the Mini App, sets the chat menu button, and
sends exactly two notifications, each with an **Open deal** button (a `web_app` button whose URL
carries `?startapp=deal_<id>`):
- to the author, when someone takes their request (amount, direction, the responder's
  completed-deal count);
- to the responder, when the author accepts their deal.

They're sent in the background after the deal's transaction commits. A failed send (the user
never started or blocked the bot) is logged with the deal id and error type only, and never
fails or rolls back the action. Everything else (declines, confirmations) is shown only in the
app, on the deal screen and in My deals, with the badge on the Board. Future reminders,
matches, and alerts are in-app too.

## Deal flow
1. B opens A's request and taps **I'll take it**. The backend creates a `pending` deal
   with B's `telegram_id` taken from B's verified initData (never from the request body).
2. A sees B in My deals with Accept / Decline. A can have several pending responders on one request.
3. **Accept**: deal → `accepted`, request → `in_progress` (hidden from the Board);
   other pending deals on that request → `declined`.
   Both A and B get a Contact button: `https://t.me/<current username>`, opened in the
   Mini App via `Telegram.WebApp.openTelegramLink`. They arrange the exchange privately.
   Each side also sees where to pay: the other side's receiving details for the currency
   they give (the author gives the request's currency; the responder gives the other one),
   with a copy button for the account number.
4. **Decline**: deal → `declined`.
5. Each side taps **I received the money** once the other's payment is in their account
   (sets `author_confirmed` / `responder_confirmed`; repeating it is a no-op). Once both have
   confirmed, the deal and request become `completed`, and both users' `completed_deals` += 1, in the same transaction.
   Planned (milestone 6): **Dispute** leaves the deal `accepted` and creates a report for
   admin review.
6. An accepted deal **can't be cancelled**: once contacts are exchanged, money may already
   have moved, and a cancel would let someone back out after being paid. It ends only when
   both sides confirm (disputes, milestone 6, will handle a side that disappears). Deals
   cancelled before this rule were deleted (migration 005); the status is no longer used.
7. A user cannot take their own request, and responds to a request at most once
   (enforced by `UNIQUE (request_id, responder_id)`): after a decline they can't
   take the same request again.
8. Closing (the author's **Cancel request**, only while `open`) or expiring a request declines
   all its pending deals; until the expiry job runs, a pending deal on a past-due request is
   already shown as declined. Requests that are `in_progress` can't be closed and don't expire.

All state transitions happen in a single DB transaction with a status check in the
`WHERE` clause (e.g. `UPDATE deals SET status='accepted' WHERE id=? AND status='pending'`),
so double taps and races between two open copies of the app are harmless.

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
- Completed-deal count shown on requests and on the author's view of each responder
  (counts only when both sides confirm)
- Reports stored for admin review; admins can ban users (banned users can't post or
  take requests, and their open requests are closed)
- Limits: at most 5 open requests per user and a small rate limit on creating requests
  and reports, to keep the board clean

## API
All routes require valid initData.
- `GET  /api/me` · `PATCH /api/me` (receiving details: `receive_kzt_bank`, `receive_kzt_account`,
  `receive_krw_bank`, `receive_krw_account`)
- `GET  /api/rate`
- `GET  /api/requests` (filters as query params)
- `POST /api/requests`
- `GET  /api/requests/{id}`
- `PATCH /api/requests/{id}` (edit / extend — author only)
- `POST /api/requests/{id}/close` ("Cancel request"; author only, `open` requests only)
- `GET  /api/my/requests` (the caller's requests on the board; pending responders for each
  request planned for milestone 4)
- `POST /api/requests/{id}/take` (creates a pending deal for the caller)
- `POST /api/requests/{id}/report`
- `GET  /api/my/deals`
- `GET  /api/deals/{id}` (participants only; used by the `deal_45` deep link)
- `POST /api/deals/{id}/accept` | `/decline` (request author only)
- `POST /api/deals/{id}/confirm` ("I received the money"; deal participants only);
  `/dispute` planned for milestone 6
- `GET  /api/deals/{id}/contact` (returns the other side's current `t.me` link and their
  receiving details (`pay_bank`, `pay_account`) for the currency the caller pays; only when the deal is `accepted` or
  `completed` and the caller is a participant)
- `GET/POST/DELETE /api/alerts`
- Admin only: `GET /api/admin/reports`, `POST /api/admin/reports/{id}/resolve`,
  `POST /api/admin/users/{id}/ban` | `/unban`

Errors return `{"detail": "<machine_code>"}` with a proper HTTP status; the frontend maps
codes to strings in `i18n.ts`.

# Product spec — KZT ↔ KRW Exchange Board

Detailed behavior. CLAUDE.md holds the always-on rules; the schema lives in `backend/app/migrations/`.

## Screens (Mini App)
- Every screen speaks from the viewer's side: a request shows **You pay** / **You get** (for its
  author, or for whoever takes it), and its rate as better / worse than the market *for them*
  (or "Market rate"). The amount converted at the market rate is marked "≈".
- **Board** — open requests in two tabs by what the viewer would buy by taking one ("Buy KRW
  🇰🇷", the default, lists `KRW_KZT` requests; "Buy KZT 🇰🇿" lists `KZT_KRW`). **Filters**
  (highlighted while not the default) sorts by date, amount they'd get or rate for the viewer,
  descending (newest / largest / best first) or ascending via an arrow toggle.
  Cards show pay / get, the rate compared to the market, the author's completed deals
  and time left. Shows the reference rate both ways at the top (1 ₸ = X ₩ and 1 ₩ = Y ₸).
  Large **My deals** and **Profile** buttons with icons, and a **Refresh** button next to
  Filters. Hides the viewer's own requests and requests from banned users.
- **Request detail** — what the viewer pays and gets, rate, author's completed-deals count,
  time left. Buttons: **I'll take it** (creates a pending deal, see Deal flow), **Report this
  request** (not on your own);
  on the author's own open request, **Edit**, **Extend** and **Cancel request** (and how many
  people are waiting for an answer, and the requests going the other way they could take,
  closest in size first); on their own expired request, **Post again**.
  Usernames are never shown before the author accepts.
- **New request** — form: what the author buys ("Buy KRW" posts `KZT_KRW`, "Buy KZT" posts
  `KRW_KZT`), the amount they pay or the amount they get (either can be typed; the other is
  converted at the request's rate, and the request stores what they pay, rounded), rate (Market (default) /
  Ask more % (better for the author) / Offer more % (better for whoever takes it), up to 20%;
  always relative to the reference rate, no fixed rates),
  duration (1 / 3 days), with a note that the request leaves the board once the author accepts
  someone or cancels it, or when the time runs out. No free-text note, no payment methods
  (where to pay comes from the receiving details once a deal is accepted).
  Show matching opposite requests right after creation.
- **My requests** (no separate screen: they're on My deals and the request screen):
  - **Edit** changes the amount or rate (the direction and expiry stay). It's refused
    (`request_has_responders`) while anyone's deal on it is pending, since they took the old
    terms; they're answered in My deals.
  - **Extend** keeps it on the board 1 or 3 days from now (a Telegram popup), only if that's
    later than its current expiry. Pending responders stay.
  - **Cancel request** (see Deal flow).
  - Requests that expired in the last 24 h are listed with **Post again**: New request
    prefilled with the same terms, subject to the usual limits.
- **My deals** — sections *Active*, *Completed*, *Declined*, then *Expired in the last day*
  (with **Post again**). *Active* holds the user's `pending` / `accepted` deals and their
  requests on the board (open, not expired), each request once, with **Extend** and **Cancel
  request**: a pending deal on it isn't listed apart. When someone took it, the card reads
  "Waiting for your answer" and opens that deal (the first taker's; after answering, the next
  one's); otherwise it's marked when it leaves the board within 6 h. Order: deals in progress
  (outlined), then what's waiting on the viewer, then the rest, their idle requests last.
  Cards under *Completed* and *Declined* carry no status tag (the section says it).
  *Completed* folds and unfolds by tapping its title (which shows the count); the choice is
  remembered on the device. My deals and the deal screen have a **Refresh** button.
- **Profile** — name, username and completed deals count, receiving details per
  currency (KZT, KRW): bank and account holder, and account / card / phone number (max 100 chars
  each), then links to **About & support** and (admins only) **Admin: reports**. The owner also
  gets an *Owner* section with **Admins** and **All deals**.
- **About & support** — what the app is and the disclaimer, "Made by Adil Sultanov (@moonpie24)",
  a link to the GitHub repo, Terms and Privacy. **Support the project**: the owner's note and up
  to 6 donate options (label + value; a `http(s)://` value opens as a link, anything else gets a
  Copy button), with a line saying donations are voluntary and unlock nothing. Hidden while
  empty, except for the owner, who gets **Edit** (note, add / remove options, MainButton Save).
- **Report** — from **Report this request** on someone else's request, or **Report a problem**
  on an accepted deal: pick a reason (request: scam / spam or fake / other; deal: didn't pay /
  stopped replying / scam / other), add an optional note (max 500 chars), MainButton **Send
  report**. Once sent, the deal screen says so instead of offering it again.
- **Admin: reports** (admins only) — Open / Resolved tabs of reports, newest first: reason,
  note, the request (and deal, with who confirmed payment), the reporter and the reported user
  (chat link, completed deals, open-report count, banned / admin tags, Telegram ID). Buttons:
  **Resolve**, and **Ban** / **Unban** for the reported user (with a confirm popup). On a deal
  report the owner also gets **Delete deal**.
- **Admins** (owner only) — everyone with admin rights: the owner, `ADMIN_IDS`, and those added
  in the app (only these have **Remove admin**). Add one by Telegram username (with or without
  the @; MainButton **Add admin**): it must belong to someone who has used the app or the bot.
- **All deals** (owner only) — Active (pending / accepted, least recently changed first, so
  stale ones lead) / Finished (completed / declined, newest first) tabs, up to 100 each: the
  deal and its request, who confirmed payment, both sides (as on reports), and **Delete deal**
  (with a confirm popup).
- The Board's **My deals** link shows a badge with the number of things waiting on the viewer:
  a pending responder to answer, a payment to confirm once the other side has, or one of
  their requests leaving the board within 6 h (the in-app expiry notice).
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
The bot answers `/start` (in private chats only) with a button that opens the Mini App, or
without one for non-members of the group (see Group members only), sets the chat menu button, and
sends exactly two notifications, each with an **Open deal** button (a `web_app` button whose URL
carries `?startapp=deal_<id>`):
- to the author, when someone takes their request (amount, direction, the responder's
  completed-deal count);
- to the responder, when the author accepts their deal.

They're sent in the background after the deal's transaction commits. A failed send (the user
never started or blocked the bot) is logged with the deal id and error type only, and never
fails or rolls back the action. Everything else (declines, confirmations) is shown only in the
app, on the deal screen and in My deals, with the badge on the Board. Expiry notices and
matches are in-app too.

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
   **Report a problem** (either side) leaves the deal `accepted` and creates a report on the
   deal for admin review; this is what's meant by a "dispute".
6. An accepted deal **can't be cancelled**: once contacts are exchanged, money may already
   have moved, and a cancel would let someone back out after being paid. It ends only when
   both sides confirm; if the other side disappears, **Report a problem** brings in an admin. Deals
   cancelled before this rule were deleted (migration 005); the status is no longer used.
7. A user cannot take their own request, and responds to a request at most once
   (enforced by `UNIQUE (request_id, responder_id)`): after a decline they can't
   take the same request again.
8. Closing (the author's **Cancel request**, only while `open`) or expiring a request declines
   all its pending deals. A background job marks past-due open requests `expired` every
   5 minutes; until it runs, a past-due request already shows as expired and a pending deal on
   it as declined. Requests that are `in_progress` can't be closed, edited or extended, and
   don't expire.
9. A daily job deletes `completed`, `declined` and `cancelled` deals whose last change is over
   30 days old, except deals with a report and deals on a request still `open` (a declined one
   keeps its responder from taking that request again). Users' `completed_deals` counts stay.

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

## Group members only
- With `GROUP_ID` set, only members of that Telegram group chat can use the board: every API
  request checks membership (`getChatMember`) before anything else, and non-members get
  `not_group_member` (403) and no user row. `ADMIN_IDS` / `OWNER_ID` are always allowed.
- A confirmed member is cached for 10 minutes, but any change to someone's membership in the
  group (a `chat_member` update: joining, leaving, removal, restriction) drops them from the
  cache, so leaving ends access at once. Non-members aren't cached, so joining works on the next try. If Telegram can't be reached,
  a previously confirmed member keeps access and anyone else gets `membership_check_failed`.
- The bot is in the group as an admin with no permissions (non-admin bots may not see every
  member). It never posts there and ignores the group's messages; it only logs the group's
  ID when it's added and uses membership changes to update the cache. `/start` from a non-member gets a short "members only" reply, no button.
- Unset (`GROUP_ID=`): open to everyone, as in development.

## Trust and moderation
- Completed-deal count shown on requests and on the author's view of each responder
  (counts only when both sides confirm)
- Admins are the users in `ADMIN_IDS`, the owner (`OWNER_ID`, the author), and those the owner
  adds in the app by username (`users.admin_granted`; not banned users). Only the owner can edit
  the About page, add and remove admins (only the ones added in the app), and delete deals.
  Admins can't be banned.
- **Deleting a deal** (owner, any status; e.g. one stuck because a side disappeared), in one
  transaction: the deal is gone for both sides, with no message. An accepted deal's request is
  closed (no one else can take it). Reports on it stay, as reports on the request. Completed-deal
  counts don't change.
- Reports are about someone else's request (reported user: its author) or the other side of
  the reporter's accepted deal. They're stored for admin review; the reported user isn't told.
  One unresolved report per reporter per request / deal (`already_reported`), and at most 5
  reports per user per 24 h (`too_many_reports`). No bot message: admins check the app.
- A **ban** (one transaction): the user can't post or take requests, their open requests are
  closed, and pending deals on either side are declined. Accepted deals carry on (they end
  when both confirm). **Unban** lifts it; closed requests stay closed.
- Limits: at most 5 open requests per user and a small rate limit on creating requests, to
  keep the board clean

## API
All routes require valid initData.
- `GET  /api/me` · `PATCH /api/me` (receiving details: `receive_kzt_bank`, `receive_kzt_account`,
  `receive_krw_bank`, `receive_krw_account`)
- `GET  /api/rate`
- `GET  /api/requests` (filters as query params)
- `POST /api/requests`
- `GET  /api/requests/{id}`
- `PATCH /api/requests/{id}` (author only, `open` only: `amount` / `rate_value` to edit,
  `extend_days` (1 or 3) to extend)
- `POST /api/requests/{id}/close` ("Cancel request"; author only, `open` requests only)
- `GET  /api/my/requests` (the caller's requests on the board, then those expired in the last
  24 h; each with `pending_count`, which only the author sees)
- `POST /api/requests/{id}/take` (creates a pending deal for the caller)
- `POST /api/requests/{id}/report` (`{category, note}`; not the author)
- `GET  /api/my/deals`
- `GET  /api/deals/{id}` (participants only; used by the `deal_45` deep link)
- `POST /api/deals/{id}/accept` | `/decline` (request author only)
- `POST /api/deals/{id}/confirm` ("I received the money"; deal participants only)
- `POST /api/deals/{id}/report` ("Report a problem"; participants, `accepted` deals only)
- `GET  /api/deals/{id}/contact` (returns the other side's current `t.me` link and their
  receiving details (`pay_bank`, `pay_account`) for the currency the caller pays; only when the deal is `accepted` or
  `completed` and the caller is a participant)
- `GET  /api/requests/{id}/matches` (author only; empty once the request is off the board)
- `GET  /api/about` (the donate section)
- Admin only: `GET /api/admin/reports?resolved=false|true`, `POST /api/admin/reports/{id}/resolve`,
  `POST /api/admin/users/{id}/ban` | `/unban`
- Owner only: `PUT /api/admin/about` (`{donate_note, donate_options: [{label, value}]}`),
  `GET /api/admin/admins`, `POST /api/admin/admins` (`{username}`), `DELETE /api/admin/admins/{id}`,
  `GET /api/admin/deals?active=true|false`, `DELETE /api/admin/deals/{id}`

Errors return `{"detail": "<machine_code>"}` with a proper HTTP status; the frontend maps
codes to strings in `i18n.ts`.

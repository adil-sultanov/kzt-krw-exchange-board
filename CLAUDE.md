# CLAUDE.md — KZT ↔ KRW Exchange Board (Telegram Mini App)

## What this project is

A Telegram Mini App where students from Kazakhstan in South Korea post and find
requests to exchange money between KZT and KRW. It replaces a busy Telegram
group chat where older, still-active requests get lost.

The app is a **noticeboard and matchmaker only**:
- It never holds, transfers, or processes money. Users agree and pay each other privately.
- It is **free**. No fees, commissions, or per-exchange charges, ever
  (legal risk under Korea's Foreign Exchange Transactions Act and student-visa rules).
  Hosting is covered by voluntary donations only. Never add features that monetize exchanges.
- No group chat integration. Everything happens inside the Mini App and the bot's DMs.

## Architecture

Three parts, one repo:

1. **Mini App frontend** — the main UI, opened inside Telegram.
   No slash-command UX; the bot only has `/start`, which opens the app.
2. **Backend API** — serves the frontend's data, validates Telegram auth, owns the database.
3. **Bot** — launches the Mini App (menu button + `/start` reply with a Web App button)
   and sends notifications as DMs, using inline buttons for actions.
   Runs in the same process as the API.

Business logic lives in `services/`. API routes and bot inline-button handlers are thin
wrappers that call the same service functions, so every rule is enforced in one place.

### Stack
- Backend: Python 3.12, FastAPI, aiosqlite, Pydantic v2
- Bot: aiogram 3 (long polling), same process as FastAPI
- Database: SQLite, WAL mode (`PRAGMA journal_mode=WAL;`, `PRAGMA foreign_keys=ON;`), single file
- Frontend: React + Vite + TypeScript, Telegram's `telegram-web-app.js`
  (`window.Telegram.WebApp`)
- Scheduler: APScheduler (expiry checks, reminders, rate refresh)
- Exchange rate: free public API, cached ~1 hour, display only (never used to settle anything)
- Deployment: Docker. The Mini App must be served over **HTTPS**
  (e.g. VPS + domain + Caddy for automatic certificates, or a Cloudflare Tunnel;
  frontend may be hosted separately on a static host).
- Local dev: expose the frontend/API over HTTPS with `cloudflared` or `ngrok`
  and point the bot's menu button at that URL.

### Layout
```
backend/
  app/
    main.py          # FastAPI app + bot startup (lifespan)
    config.py        # settings from env
    bot/             # aiogram handlers, notification senders
    api/             # routes (thin; call services)
    auth.py          # initData validation
    db.py            # connection, migration runner
    migrations/      # 001_init.sql, 002_..., applied in order
    models.py        # Pydantic schemas
    services/        # requests, deals, matching, expiry, rates, users
  tests/
frontend/
  src/
    screens/
    components/
    api.ts           # typed API client, adds the Authorization header
    i18n.ts          # all UI strings in one place
docker-compose.yml
.env.example
```

### Commands
Fill these in as the code lands; keep them accurate.
- Backend dev: `cd backend && uvicorn app.main:app --reload`
- Backend tests / lint: `cd backend && pytest` · `ruff check . && ruff format .`
- Frontend dev / build: `cd frontend && npm run dev` · `npm run build`

## Conventions
- **Rate** is always expressed as **KRW per 1 KZT**, regardless of direction.
- **Amount** is an integer in whole units of the currency the author is *giving*
  (`KZT_KRW` → KZT, `KRW_KZT` → KRW). Show the approximate counter-amount using the rate.
- **Market rate requests** store the offset in `rate_value` as a percentage (e.g. `-1.5`);
  the effective rate is computed at render time from the cached reference rate.
- Timestamps are stored in UTC (ISO 8601); display them in the user's local time (default KST).

## Features

### Screens (Mini App)
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

### Bot notifications (DMs)
- New request matches your open opposite request or one of your alerts
- Request expires in 24h → inline buttons: Extend / Close
- Someone wants to take your request (shows their completed-deals count) → Accept / Decline
- Your response was accepted / declined / the request was taken by someone else
- Deal accepted → both sides get a **Contact** button linking to the other's Telegram account
- The other side marked the deal completed → Confirm / Dispute
- Every notification includes a button that opens the Mini App at the relevant screen

If a DM fails because the user blocked the bot, log it (without user data) and move on;
never let a failed notification roll back a state change.

### Deal flow
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

### Identity and usernames
- Users are identified **only** by `telegram_id` (permanent). All foreign keys use it.
- `username` is a nullable, non-unique cache: refresh it from initData on every API
  request and from every bot update. If another row holds the same username,
  set that row's `username` to NULL.
- Always read the current username at render/send time; never store usernames in
  deals, requests, or messages.
- A username is required to create or take a request (the Contact link needs it).
  Explain this in the UI to users without one. Do not rely on `tg://user?id=` links.

### Trust and moderation
- Completed-deal count shown on requests and responder notifications
  (counts only when both sides confirm)
- Reports stored for admin review; admins can ban users (banned users can't post or
  take requests, and their open requests are closed)
- Limits: at most 5 open requests per user and a small rate limit on creating requests
  and reports, to keep the board clean

## Data model (SQLite)

- `users`: telegram_id (PK), username (nullable, NOT unique, cache), first_name,
  completed_deals, is_banned, is_admin, created_at, updated_at
- `requests`: id, user_id, direction (`KZT_KRW` | `KRW_KZT`), amount (integer),
  rate_type (`fixed` | `market`), rate_value, payment_methods (JSON array), note,
  status (`open` | `in_progress` | `completed` | `closed` | `expired`),
  created_at, updated_at, expires_at, reminder_sent
- `deals`: id, request_id, author_id, responder_id,
  status (`pending` | `accepted` | `declined` | `cancelled` | `completed`),
  author_confirmed, responder_confirmed, created_at, updated_at;
  unique (request_id, responder_id)
- `alerts`: id, user_id, direction, min_amount, max_amount, active, created_at
- `reports`: id, reporter_id, request_id, deal_id (nullable), reason, created_at, resolved

All timestamps UTC, ISO 8601. Keep schema changes in numbered migration files;
never edit a migration that has already been applied.

## API (all routes require valid initData)
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

## Security rules
- **Validate `initData` on every API request** using Telegram's HMAC-SHA256 scheme
  (secret key = HMAC-SHA256(key="WebAppData", msg=bot_token)); compare hashes in
  constant time; reject `auth_date` older than 24h. Never trust a user ID sent by the frontend.
- Frontend sends raw initData in an `Authorization: tma <initData>` header.
- Authorization checks on every mutation (only authors edit their requests, etc.).
- Bot callback handlers verify that the pressing user is allowed to act on that deal/request.
- Never log initData, tokens, or full user records.

## Repo rules
- Bot token and secrets live in `.env` only; commit `.env.example`, never `.env`.
- Never commit the database, backups, or any file with user data (`*.db`, `backups/` in `.gitignore`).
- Daily automated backup of the SQLite file to off-server storage (use SQLite's backup API,
  not a plain file copy, because of WAL).
- Python: type hints, ruff for lint/format, pytest. Test matching, expiry, initData
  validation, deal state transitions, and username refresh.
- TypeScript: strict mode, no `any` without reason.
- UI language is English only. Keep all UI strings in `frontend/src/i18n.ts` anyway.
- Keep the README current: problem, screenshots, stack, setup, usage stats.

## Milestones
1. Backend skeleton: DB + migrations, initData auth, `/api/me`, bot `/start` with Web App button
2. Mini App: Board + New request + Request detail; username refresh on every request
3. Deal flow: take → accept/decline → contact buttons (app + bot DMs)
4. My requests (edit / extend / close) + expiry job with bot reminders
5. Matching notifications + Alerts
6. Completion confirmation + completed-deal counts + reports / bans
7. Docker deployment with HTTPS, backups, README with screenshots

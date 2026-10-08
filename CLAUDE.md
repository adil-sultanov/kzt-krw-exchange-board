# KZT ↔ KRW Exchange Board (Telegram Mini App)

Noticeboard where Kazakh students in Korea post/find KZT↔KRW exchange requests.
**Read `docs/SPEC.md` before working on screens, deal flow, notifications, or API routes.**
Schema source of truth: `backend/app/migrations/`.

## Hard rules
- Never holds or moves money; users pay each other privately. **Free forever**: no fees or
  monetization (Korean FX law / visa risk). The only exception is voluntary donations on the
  About page, which never unlock features. No group-chat integration beyond the membership check
  (`GROUP_ID`): the bot never posts in, or stores anything from, the group.
- The bot sends only: "someone took your request" (to the author), "your deal was accepted"
  (to the responder), one "did you get the money?" reminder per side of an accepted deal 3 h
  after acceptance (if they haven't confirmed), opt-in alerts about new requests (crossed out once the request leaves
  the board), and its `/start` reply. Every other update is in-app only.
- Users identified only by `telegram_id`. `username` is a nullable, non-unique cache refreshed
  on every API request/bot update; never store usernames elsewhere. Username and a full profile
  (`users.profile_{first,last}_name`, `university`, `enrollment_year`) required to post/take.
- Admins = `ADMIN_IDS` + `OWNER_ID` (`Settings.is_admin`) + those the owner adds in the app
  (`users.admin_granted`). Any admin can take any request off the board (Board requests), see
  All deals (incl. cancelled requests) and look up any user (Admin: users; never their receiving
  details, only whether they're set); only the owner edits the About page, manages admins and
  deletes deals.
- Validate initData (`Authorization: tma <initData>`) on every API route; never trust client
  user IDs. Check authorization on every mutation and bot callback. Never log initData/tokens/user records.
- Receiving details (`users.receive_{kzt,krw}_{bank,account}`) are sensitive: never log them; only the other side
  of an accepted/completed deal may see them.
- Business logic in `services/`; API routes and bot buttons are thin wrappers over it.
- State changes: one transaction, status check in `WHERE` (race-safe). A failed DM never rolls back.
- Schema changes = new numbered migration; never edit an applied one.
- Secrets only in `.env` (never commit it, `*.db`, or backups). Dev and prod use different bots.

## Ownership
All rights reserved (see `LICENSE`); author @moonpie24. Keep `TERMS.md` / `PRIVACY.md` accurate
when stored data or behavior changes.

## Conventions
- Rate = KRW per 1 KZT. Amount = integer, in the currency the author **buys** (KRW for
  `KZT_KRW`): that side is fixed, the other follows the rate until a deal is accepted, which
  locks it (`deals.rate`). Requests are always at the reference (market) rate: no offsets,
  fixed rates, notes or payment methods (`rate_value` is 0 for new requests; older ones may
  carry an offset).
- UI speaks from the viewer's side: a request reads as what *you* pay and get. "Buy KRW" = you get
  KRW: the Board's tab lists `KRW_KZT` requests (taking one gets you KRW); New request posts `KZT_KRW`.
- Timestamps UTC ISO 8601; display in KST.
- API errors: `{"detail": "<machine_code>"}`; frontend maps codes in `frontend/src/i18n.ts`.
- UI English only; all UI strings in `i18n.ts`. Use Telegram theme vars, MainButton, BackButton.
- Python 3.12, type hints, ruff, pytest. TypeScript strict, no unexplained `any`.
- Keep README current (features, setup, deploy, screenshots).

## Stack
FastAPI + aiosqlite (SQLite, WAL) + aiogram 3 polling in one process; APScheduler; React + Vite + TS.
Docker + HTTPS for deploy; `cloudflared` tunnel for local dev.

## Commands (from `backend/`)
- Run: `.venv/bin/uvicorn app.main:create_app --factory --reload` (reads repo-root `.env`; `RUN_BOT=false` runs without the bot)
- Test/lint: `.venv/bin/pytest -q` · `.venv/bin/ruff check . && .venv/bin/ruff format .`
- Setup: `python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"`

## Dev bot (repo root)
Recurring problem: after a restart or change the Mini App doesn't load (nothing reaches the
server) because the quick tunnel's URL, `WEBAPP_URL`, the frontend build and the bot's menu
button disagree. Before telling the user the dev bot is ready (and after every restart or
rebuild), run `scripts/dev-check.sh` and fix any FAIL; then tell them to send `/start` and use
the new reply's button. `getChatMenuButton` is cached for a while: don't trust its read-back.

## Commands (deploy, repo root; see README "Deploy")
- `docker compose up -d --build` · backup now: `docker compose exec -u app app python -m app.backup`

## Commands (from `frontend/`)
- Dev: `npm run dev` (port 5173, proxies `/api` to 8000) · Check: `npm run typecheck` · Build: `npm run build`
  (backend serves `frontend/dist` at `/` when it exists)

## Milestones (update when one is done)
1. ✅ Backend skeleton: migrations, initData auth, `/api/me`, bot `/start`
2. ✅ Board + New request + Request detail (frontend scaffold)
3. ✅ Deal flow: take → accept/decline → contact (+ My deals; accepted deals can't be cancelled)
4. ✅ My requests (edit/extend/cancel on My deals + request screen), expiry job, in-app expiry notices
5. ✅ In-app matches (after posting, on own request). Alerts (saved searches) were dropped
   (migration 006); opt-in per-tab alerts came later (migration 013)
6. ✅ Reports (on requests and accepted deals; "disputes" are deal reports), in-app admin
   screen (resolve, ban/unban), owner-editable About & support page
7. ✅ Docker + HTTPS deploy (Compose + Caddy), daily backups (SQLite backup API).
   Deployed to production; README screenshots

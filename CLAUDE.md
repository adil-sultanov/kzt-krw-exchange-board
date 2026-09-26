# KZT ↔ KRW Exchange Board (Telegram Mini App)

Noticeboard where Kazakh students in Korea post/find KZT↔KRW exchange requests.
**Read `docs/SPEC.md` before working on screens, deal flow, notifications, or API routes.**
Schema source of truth: `backend/app/migrations/`.

## Hard rules
- Never holds or moves money; users pay each other privately. **Free forever**: no fees or
  monetization (Korean FX law / visa risk). No group-chat integration.
- The bot sends only two messages: "someone took your request" (to the author) and "your deal
  was accepted" (to the responder), plus its `/start` reply. Every other update is in-app only.
- Users identified only by `telegram_id`. `username` is a nullable, non-unique cache refreshed
  on every API request/bot update; never store usernames elsewhere. Username required to post/take.
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
- Rate = KRW per 1 KZT. Amount = integer, currency being given. Requests are market-rate only:
  `rate_value` is a ±% offset from the reference rate (no fixed rates, notes or payment methods).
- UI speaks from the viewer's side: a request reads as what *you* pay and get. "Buy KRW" = you get
  KRW: the Board's tab lists `KRW_KZT` requests (taking one gets you KRW); New request posts `KZT_KRW`.
- Timestamps UTC ISO 8601; display in KST.
- API errors: `{"detail": "<machine_code>"}`; frontend maps codes in `frontend/src/i18n.ts`.
- UI English only; all UI strings in `i18n.ts`. Use Telegram theme vars, MainButton, BackButton.
- Python 3.12, type hints, ruff, pytest. TypeScript strict, no unexplained `any`.
- Keep README current (setup, screenshots, roadmap).

## Stack
FastAPI + aiosqlite (SQLite, WAL) + aiogram 3 polling in one process; APScheduler; React + Vite + TS.
Docker + HTTPS for deploy; `cloudflared` tunnel for local dev.

## Commands (from `backend/`)
- Run: `.venv/bin/uvicorn app.main:create_app --factory --reload` (reads repo-root `.env`; `RUN_BOT=false` runs without the bot)
- Test/lint: `.venv/bin/pytest -q` · `.venv/bin/ruff check . && .venv/bin/ruff format .`
- Setup: `python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"`

## Commands (from `frontend/`)
- Dev: `npm run dev` (port 5173, proxies `/api` to 8000) · Check: `npm run typecheck` · Build: `npm run build`
  (backend serves `frontend/dist` at `/` when it exists)

## Milestones (update when one is done)
1. ✅ Backend skeleton: migrations, initData auth, `/api/me`, bot `/start`
2. ✅ Board + New request + Request detail (frontend scaffold)
3. ✅ Deal flow: take → accept/decline → contact (+ My deals; accepted deals can't be cancelled)
4. ✅ My requests (edit/extend/cancel on My deals + request screen), expiry job, in-app expiry notices
5. In-app matches + Alerts (✅ done early: matches shown right after posting)
6. Reports, disputes, admin bans (✅ done early: completion confirmation, deal counts,
   receiving details, ban enforcement, open-request and posting limits)
7. Docker + HTTPS deploy, daily backups (SQLite backup API), README screenshots

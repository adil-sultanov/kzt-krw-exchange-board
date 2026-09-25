# KZT ↔ KRW Exchange Board (Telegram Mini App)

Noticeboard where Kazakh students in Korea post/find KZT↔KRW exchange requests.
**Read `docs/SPEC.md` before working on screens, deal flow, notifications, or API routes.**
Schema source of truth: `backend/app/migrations/`.

## Hard rules
- Never holds or moves money; users pay each other privately. **Free forever**: no fees or
  monetization (Korean FX law / visa risk). No group-chat integration.
- Users identified only by `telegram_id`. `username` is a nullable, non-unique cache refreshed
  on every API request/bot update; never store usernames elsewhere. Username required to post/take.
- Validate initData (`Authorization: tma <initData>`) on every API route; never trust client
  user IDs. Check authorization on every mutation and bot callback. Never log initData/tokens/user records.
- Business logic in `services/`; API routes and bot buttons are thin wrappers over it.
- State changes: one transaction, status check in `WHERE` (race-safe). A failed DM never rolls back.
- Schema changes = new numbered migration; never edit an applied one.
- Secrets only in `.env` (never commit it, `*.db`, or backups). Dev and prod use different bots.

## Conventions
- Rate = KRW per 1 KZT. Amount = integer, currency being given. Market rate stores ±% offset.
- Timestamps UTC ISO 8601; display in KST.
- API errors: `{"detail": "<machine_code>"}`; frontend maps codes in `frontend/src/i18n.ts`.
- UI English only; all UI strings in `i18n.ts`. Use Telegram theme vars, MainButton, BackButton.
- Python 3.12, type hints, ruff, pytest. TypeScript strict, no unexplained `any`.
- Keep README current (setup, screenshots, roadmap).

## Stack
FastAPI + aiosqlite (SQLite, WAL) + aiogram 3 polling in one process; APScheduler; React + Vite + TS.
Docker + HTTPS for deploy; `cloudflared` tunnel for local dev.

## Commands (from `backend/`)
- Run: `.venv/bin/uvicorn app.main:create_app --factory --reload` (reads repo-root `.env`; `RUN_BOT=false` for API only)
- Test/lint: `.venv/bin/pytest -q` · `.venv/bin/ruff check . && .venv/bin/ruff format .`
- Setup: `python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"`

## Milestones (update when one is done)
1. ✅ Backend skeleton: migrations, initData auth, `/api/me`, bot `/start`
2. Board + New request + Request detail (frontend scaffold)
3. Deal flow: take → accept/decline → contact
4. My requests (edit/extend/close) + expiry reminders
5. Matching notifications + Alerts
6. Completion confirmation, deal counts, reports/bans
7. Docker + HTTPS deploy, daily backups (SQLite backup API), README screenshots

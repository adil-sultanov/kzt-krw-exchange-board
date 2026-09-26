# KZT ↔ KRW Exchange Board

**Author:** Adil Sultanov ([@moonpie24](https://t.me/moonpie24)) · © 2026, all rights reserved

A Telegram Mini App where students from Kazakhstan living in South Korea post and find
requests to exchange money between **KZT** and **KRW**.

> **Status:** early development. Nothing is deployed yet.

## The problem

Today these exchanges are arranged in a busy Telegram group chat. New messages bury older
requests that are still open, so people post again, miss matches, and have no way to tell
who has reliably completed exchanges before.

## What it does

- **Board** of open requests ("Buy KRW 🇰🇷" / "Buy KZT 🇰🇿"), each showing what *you* would
  pay and get and whether its rate is better or worse than the market for you; filter by amount,
  sort by best rate, with the reference exchange rate both ways at the top
- **Post a request**: what you buy, how much you pay (with a live "you get ≈" preview), the
  market rate or asking / offering a few % more, and how long it stays up (1 / 3 days). While
  it's on the board you can edit it (until someone takes it), extend it or cancel it; a
  request about to expire is flagged in the app, and an expired one can be posted again.
- **Take a request**: the author accepts or declines, and only then do both sides get
  each other's Telegram contact
- **Bot notifications** only when someone takes your request and when your deal is accepted;
  everything else is in the app, which refreshes itself every few seconds while open. A badge
  on **My deals** shows the deals waiting on you. My deals lists your requests on the board,
  then active deals (in progress highlighted at the top), completed and declined ones.
- **Receiving details**: save your bank and account number for KZT and KRW. Once a deal is
  accepted, the other person sees the details for the currency they pay, with a copy button.
- **Completing a deal**: each side taps "I received the money". When both have, the deal is
  completed. An accepted deal can't be cancelled, so nobody can back out after being paid.
- **Trust**: each user's count of completed deals (confirmed by both sides), plus reports
  and bans

## What it does *not* do

The app is a noticeboard and matchmaker only. It **never holds, transfers or processes
money**, and it is **free**, with no fees or commissions. Users agree on terms and pay
each other privately. Hosting is covered by voluntary donations.

## Stack

| Part | Tech |
|------|------|
| Backend API | Python 3.12, FastAPI, aiosqlite, Pydantic |
| Bot | aiogram 3 (long polling, same process as the API) |
| Database | SQLite (WAL mode) |
| Frontend | React, Vite, TypeScript, Telegram Web App SDK |
| Jobs | APScheduler (expiry, reminders, rate refresh) |
| Deployment | Docker, served over HTTPS |

## Setup

Requirements: Python 3.12, Node.js 20+, a Telegram bot token from
[@BotFather](https://t.me/BotFather) (use a separate test bot for development), and
`cloudflared` or `ngrok` for HTTPS.

```bash
# 1. Configure: copy the example and fill in BOT_TOKEN, WEBAPP_URL, ADMIN_IDS
cp .env.example .env

# 2. Install the backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# 3. Run the API and the bot (serves on port 8000)
.venv/bin/uvicorn app.main:create_app --factory --reload

# 4. In another terminal: install and run the frontend (Vite, port 5173, proxies /api to 8000)
cd frontend
npm install
npm run dev

# 5. In a third terminal: expose the frontend over HTTPS and put the URL in WEBAPP_URL,
#    then restart the backend so the bot's menu button uses it
cloudflared tunnel --url http://localhost:5173
```

Send `/start` to your bot and tap **Open exchange board**. Frontend changes reload live.

To serve everything from one port instead (as in production), run `npm run build` in
`frontend/`: the backend serves `frontend/dist` at `/`, so you can tunnel port 8000 and skip
the Vite dev server. The app only works inside Telegram, since it needs signed launch data.

Backend tests: `.venv/bin/pytest`; lint: `.venv/bin/ruff check .`.
Frontend type check: `npm run typecheck`.

The reference rate comes from [Currency API](https://github.com/fawazahmed0/exchange-api)
(closest to the rate Google shows), falling back to [ExchangeRate-API](https://www.exchangerate-api.com)'s
free endpoint, and is refreshed hourly.

## Roadmap

- [x] Backend skeleton: database, migrations, Telegram auth, bot `/start`
- [x] Board, new request, request detail
- [x] Deal flow: take → accept / decline → contact, bot notifications, and a My deals list
- [x] My requests: edit / extend / cancel, with in-app expiry notices
- [x] Matches (right after posting and on your own request), shown in the app
- [x] Completion confirmation ("I received the money" from both sides), completed-deal counts,
      receiving details per currency
- [ ] Reports, disputes and admin bans (bans are already enforced; open-request and posting
      limits are done)
- [ ] Docker deployment with HTTPS, backups, screenshots

## Disclaimer

This project only helps people find each other. Exchanges happen directly between users,
at their own risk and responsibility.

## License & authorship

Copyright © 2026 Adil Sultanov ([@moonpie24](https://t.me/moonpie24)). **All rights
reserved.** This code is published for viewing only. You may not copy, modify, host, or
redistribute it without written permission. See [LICENSE](LICENSE).

Using the bot and the app is subject to the [Terms of Use](TERMS.md) and the
[Privacy Policy](PRIVACY.md).

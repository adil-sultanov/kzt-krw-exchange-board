# KZT ↔ KRW Exchange Board

A Telegram Mini App where students from Kazakhstan living in South Korea post and find
requests to exchange money between **KZT** and **KRW**.

> **Status:** early development. Nothing is deployed yet.

## The problem

Today these exchanges are arranged in a busy Telegram group chat. New messages bury older
requests that are still open, so people post again, miss matches, and have no way to tell
who has reliably completed exchanges before.

## What it does

- **Board** of open requests, filterable by direction, amount and payment method,
  with a reference exchange rate at the top
- **Post a request**: amount, a fixed rate or market ± %, payment methods
  (Kaspi, Halyk, Toss, KakaoBank, …), and how long it stays up (1 / 3 / 7 days)
- **Take a request**: the author accepts or declines, and only then do both sides get
  each other's Telegram contact
- **Bot notifications** in DMs: matches, new responders, expiry reminders, deal updates
- **Alerts** for requests you care about, e.g. "KRW→KZT over 300,000 KRW"
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

Requirements: Python 3.12, a Telegram bot token from [@BotFather](https://t.me/BotFather)
(use a separate test bot for development), and `cloudflared` or `ngrok` for HTTPS.

```bash
# 1. Configure: copy the example and fill in BOT_TOKEN, WEBAPP_URL, ADMIN_IDS
cp .env.example .env

# 2. Install the backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[dev]"

# 3. Expose port 8000 over HTTPS (in another terminal) and put the URL in WEBAPP_URL
cloudflared tunnel --url http://localhost:8000

# 4. Run the API and the bot
.venv/bin/uvicorn app.main:create_app --factory --reload
```

Send `/start` to your bot and tap **Open exchange board**. Until the frontend exists, this
opens a small test page that greets you by name if Telegram login works.

Run the tests with `.venv/bin/pytest`, and lint with `.venv/bin/ruff check .`.

## Roadmap

- [x] Backend skeleton: database, migrations, Telegram auth, bot `/start`
- [ ] Board, new request, request detail
- [ ] Deal flow: take → accept / decline → contact
- [ ] My requests (edit / extend / close) and expiry reminders
- [ ] Matching notifications and alerts
- [ ] Completion confirmation, completed-deal counts, reports and bans
- [ ] Docker deployment with HTTPS, backups, screenshots

## Disclaimer

This project only helps people find each other. Exchanges happen directly between users,
at their own risk and responsibility.

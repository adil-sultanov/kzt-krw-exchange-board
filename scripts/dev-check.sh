#!/usr/bin/env bash
# Checks that the dev Mini App will actually load in Telegram. Run it after starting the tunnel
# and the backend (and after every restart or rebuild), before opening the app.
#
# Why: a cloudflared quick tunnel gets a new URL each time it starts. When WEBAPP_URL, the
# tunnel, the frontend build and the bot's menu button disagree, Telegram opens a page that
# never reaches the server, and the app just doesn't load, with nothing in the server log.
#
# Fixes what it safely can (re-sets the bot's menu button); otherwise says what to do.
# Never prints the bot token.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
failed=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n        -> %s\n' "$1" "$2"; failed=1; }

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

[ -f "$ENV_FILE" ] || { echo "No .env at $ENV_FILE"; exit 1; }
URL="$(env_value WEBAPP_URL)"
URL="${URL%/}"
TOKEN="$(env_value BOT_TOKEN)"
HOST="${URL#https://}"
HOST="${HOST%%/*}"

echo "Dev Mini App check for ${URL:-<WEBAPP_URL unset>}"

# 1. WEBAPP_URL: Telegram only opens HTTPS.
if [[ "$URL" == https://* ]]; then ok "WEBAPP_URL is HTTPS"
else bad "WEBAPP_URL isn't an https:// URL" "put the tunnel's URL in .env, then restart the backend"; fi

# Settings prefer the environment over .env, so a stale export silently wins.
if [ -n "${WEBAPP_URL:-}" ] && [ "${WEBAPP_URL%/}" != "$URL" ]; then
  bad "the shell exports a different WEBAPP_URL, which overrides .env" "unset WEBAPP_URL, then restart the backend"
fi

# 2. The backend is up.
if curl -fsS -m 5 http://localhost:8000/health >/dev/null 2>&1; then ok "backend answers on :8000"
else bad "backend isn't answering on :8000" "start it: cd backend && .venv/bin/uvicorn app.main:create_app --factory"; fi

# 3. The frontend: Vite on :5173, or the build the backend serves (must be newer than the source).
if curl -fsS -m 2 -o /dev/null http://localhost:5173/ 2>/dev/null; then
  ok "Vite dev server on :5173 (tunnel should point at it)"
else
  DIST="$ROOT/frontend/dist/index.html"
  if [ ! -f "$DIST" ]; then
    bad "no frontend build" "cd frontend && npm run build"
  else
    newer="$(find "$ROOT/frontend/src" "$ROOT/frontend/index.html" -newer "$DIST" -type f 2>/dev/null | head -1)"
    if [ -n "$newer" ]; then bad "frontend build is older than the source (${newer#"$ROOT"/})" "cd frontend && npm run build, then reopen the app"
    else ok "frontend build is up to date"; fi
  fi
fi

# 4. The hostname resolves on public DNS (a brand-new quick tunnel can take a moment; a phone
#    that looked it up too early caches the failure for a while).
if [ -n "$HOST" ]; then
  for ns in 1.1.1.1 8.8.8.8; do
    if [ -n "$(dig +short +time=3 +tries=1 @"$ns" "$HOST" A 2>/dev/null | head -1)" ]; then ok "$HOST resolves on $ns"
    else bad "$HOST doesn't resolve on $ns" "wait a minute and re-run; if it persists, restart the tunnel and update WEBAPP_URL"; fi
  done
fi

# 5. The tunnel reaches this backend (an old tunnel URL or a dead tunnel fails here).
if [ -n "$URL" ]; then
  if curl -fsS -m 10 "$URL/health" >/dev/null 2>&1; then ok "tunnel reaches the backend ($URL/health)"
  else bad "$URL/health doesn't reach the backend" "is cloudflared running, and is WEBAPP_URL its current URL?"; fi
  code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$URL/")"
  if [ "$code" = "200" ]; then ok "the app's page loads through the tunnel"
  else bad "$URL/ returned HTTP $code" "check the frontend (build, or Vite) behind the tunnel"; fi
fi

# 6. The bot's menu button opens WEBAPP_URL. The backend sets it on startup, but Telegram's
#    read-back is cached for a while, so set it again rather than trusting a read.
if [ "$failed" = 0 ] && [ -n "$TOKEN" ]; then
  body="{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Board\",\"web_app\":{\"url\":\"$URL\"}}}"
  if curl -fsS -m 10 -X POST "https://api.telegram.org/bot$TOKEN/setChatMenuButton" \
      -H 'Content-Type: application/json' -d "$body" 2>/dev/null | grep -q '"ok":true'; then
    ok "bot menu button set to $URL"
  else
    bad "couldn't set the bot's menu button" "check BOT_TOKEN in .env"
  fi
fi

echo
if [ "$failed" = 0 ]; then
  echo "All good. In Telegram: send /start to the bot and open the app from the NEW reply's"
  echo "button. Buttons in older messages keep old tunnel URLs; if the menu button still opens"
  echo "the old one, close the chat and reopen it (or restart Telegram)."
else
  echo "Fix the FAIL lines above, then run this again."
fi
exit "$failed"

import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import urlencode

BOT_TOKEN = "123456:TEST-token-for-tests"


def make_init_data(
    user: dict[str, Any] | None,
    *,
    bot_token: str = BOT_TOKEN,
    auth_date: int | None = None,
    extra: dict[str, str] | None = None,
) -> str:
    """Build initData signed the way Telegram does (written independently of app.auth)."""
    fields = {
        "auth_date": str(int(time.time()) if auth_date is None else auth_date),
        "query_id": "AAHtest",
    }
    if user is not None:
        fields["user"] = json.dumps(user, separators=(",", ":"), ensure_ascii=False)
    fields.update(extra or {})
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)

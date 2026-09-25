"""Telegram Mini App initData validation.

https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from pydantic import ValidationError

from app.models import TelegramUser

# How far in the future auth_date may be, to tolerate small clock differences.
MAX_CLOCK_SKEW = 60


class InitDataError(Exception):
    """initData failed validation. `code` is returned to the client as the error detail."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class InitData:
    user: TelegramUser
    auth_date: int
    start_param: str | None


def validate_init_data(
    init_data: str, bot_token: str, *, max_age: int, now: float | None = None
) -> InitData:
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError:
        raise InitDataError("init_data_invalid") from None
    fields = dict(pairs)
    if len(fields) != len(pairs):  # duplicate keys
        raise InitDataError("init_data_invalid")

    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise InitDataError("init_data_invalid")
    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_hash.encode(), received_hash.encode()):
        raise InitDataError("init_data_invalid")

    try:
        auth_date = int(fields["auth_date"])
    except (KeyError, ValueError):
        raise InitDataError("init_data_invalid") from None
    now = time.time() if now is None else now
    if now - auth_date > max_age:
        raise InitDataError("init_data_expired")
    if auth_date - now > MAX_CLOCK_SKEW:
        raise InitDataError("init_data_invalid")

    try:
        user = TelegramUser.model_validate_json(fields["user"])
    except (KeyError, ValidationError):
        raise InitDataError("init_data_invalid") from None

    return InitData(user=user, auth_date=auth_date, start_param=fields.get("start_param"))

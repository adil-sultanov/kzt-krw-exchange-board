import time
from urllib.parse import parse_qsl, urlencode

import pytest

from app.auth import InitDataError, validate_init_data
from tests.helpers import BOT_TOKEN, make_init_data

USER = {"id": 42, "first_name": "Aida", "username": "aida_kz", "language_code": "en"}
MAX_AGE = 86400


def validate(init_data: str, **kwargs: object) -> object:
    return validate_init_data(init_data, BOT_TOKEN, max_age=MAX_AGE, **kwargs)  # type: ignore[arg-type]


def assert_rejected(init_data: str, code: str = "init_data_invalid") -> None:
    with pytest.raises(InitDataError) as exc_info:
        validate(init_data)
    assert exc_info.value.code == code


def test_valid_init_data() -> None:
    result = validate_init_data(
        make_init_data(USER, extra={"start_param": "req_7"}), BOT_TOKEN, max_age=MAX_AGE
    )
    assert result.user.id == 42
    assert result.user.username == "aida_kz"
    assert result.user.first_name == "Aida"
    assert result.start_param == "req_7"


def test_unicode_and_extra_fields_including_signature() -> None:
    # Telegram adds fields over time (e.g. `signature`); all but `hash` are signed.
    user = {**USER, "first_name": "Айдана"}
    result = validate_init_data(
        make_init_data(user, extra={"signature": "abc", "chat_type": "private"}),
        BOT_TOKEN,
        max_age=MAX_AGE,
    )
    assert result.user.first_name == "Айдана"


def test_wrong_bot_token() -> None:
    assert_rejected(make_init_data(USER, bot_token="999:other-bot"))


def test_tampered_user() -> None:
    fields = dict(parse_qsl(make_init_data(USER)))
    fields["user"] = fields["user"].replace('"id":42', '"id":43')
    assert_rejected(urlencode(fields))


def test_missing_hash() -> None:
    fields = dict(parse_qsl(make_init_data(USER)))
    del fields["hash"]
    assert_rejected(urlencode(fields))


def test_duplicate_keys() -> None:
    assert_rejected(make_init_data(USER) + "&auth_date=1")


@pytest.mark.parametrize("raw", ["", "garbage", "hash=", "a=1&&b"])
def test_malformed(raw: str) -> None:
    assert_rejected(raw)


def test_expired() -> None:
    old = int(time.time()) - MAX_AGE - 10
    assert_rejected(make_init_data(USER, auth_date=old), "init_data_expired")


def test_auth_date_in_future() -> None:
    assert_rejected(make_init_data(USER, auth_date=int(time.time()) + 3600))


def test_missing_user() -> None:
    assert_rejected(make_init_data(None))


def test_malformed_user_json() -> None:
    assert_rejected(make_init_data(None, extra={"user": "{not json"}))

from unittest.mock import AsyncMock

from aiogram.types import Chat
from aiogram.types import User as AiogramUser

from app.bot.middleware import UserRefreshMiddleware
from app.config import Settings
from app.db import Database
from app.models import TelegramUser, User
from app.services.membership import Membership
from app.services.users import upsert_user


async def username_of(db: Database, telegram_id: int) -> str | None:
    async with db.conn.execute(
        "SELECT username FROM users WHERE telegram_id = ?", (telegram_id,)
    ) as cursor:
        row = await cursor.fetchone()
    assert row is not None
    return row[0]


async def test_creates_user(db: Database) -> None:
    user = await upsert_user(
        db, TelegramUser(id=1, first_name="Aida", username="aida"), config_admin=False
    )
    assert user.telegram_id == 1
    assert user.username == "aida"
    assert user.completed_deals == 0
    assert not user.is_banned
    assert not user.is_admin


async def test_updates_username_and_name(db: Database) -> None:
    await upsert_user(db, TelegramUser(id=1, first_name="Aida", username="old"), config_admin=False)
    user = await upsert_user(
        db, TelegramUser(id=1, first_name="Aidana", username="new"), config_admin=False
    )
    assert (user.username, user.first_name) == ("new", "Aidana")


async def test_removed_username_becomes_null(db: Database) -> None:
    await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    user = await upsert_user(db, TelegramUser(id=1, username=None), config_admin=False)
    assert user.username is None


async def test_username_taken_over_clears_previous_owner(db: Database) -> None:
    await upsert_user(db, TelegramUser(id=1, username="shared"), config_admin=False)
    # User 2 now owns the name (Telegram usernames are case-insensitive).
    await upsert_user(db, TelegramUser(id=2, username="Shared"), config_admin=False)
    assert await username_of(db, 1) is None
    assert await username_of(db, 2) == "Shared"


async def test_unchanged_user_keeps_updated_at(db: Database) -> None:
    first = await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    await db.conn.execute("UPDATE users SET updated_at = 'marker' WHERE telegram_id = 1")
    second = await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    assert second.updated_at == "marker"
    assert second.created_at == first.created_at


async def test_admin_flag_follows_config(db: Database) -> None:
    assert (await upsert_user(db, TelegramUser(id=1), config_admin=True)).is_admin
    assert not (await upsert_user(db, TelegramUser(id=1), config_admin=False)).is_admin


async def test_admins_added_in_the_app_stay_admins(db: Database) -> None:
    await upsert_user(db, TelegramUser(id=1), config_admin=False)
    await db.conn.execute("UPDATE users SET admin_granted = 1, is_admin = 1 WHERE telegram_id = 1")
    assert (await upsert_user(db, TelegramUser(id=1), config_admin=False)).is_admin
    # Rights removed from the config don't drop rights granted in the app.
    await upsert_user(db, TelegramUser(id=1), config_admin=True)
    assert (await upsert_user(db, TelegramUser(id=1), config_admin=False)).is_admin


BEK_BOT_USER = AiogramUser(id=5, is_bot=False, first_name="Bek", username="bek_new")


async def run_middleware(
    db: Database, settings: Settings, chat_type: str, membership: Membership
) -> dict[str, object]:
    """Runs the middleware for an update from Bek; returns the data the handler got."""
    handler = AsyncMock(return_value="handled")
    data = {
        "event_from_user": BEK_BOT_USER,
        "event_chat": Chat(id=5, type=chat_type),
        "db": db,
        "settings": settings,
        "membership": membership,
    }
    assert await UserRefreshMiddleware()(handler, object(), data) == "handled"
    handler.assert_awaited_once()
    return handler.await_args.args[1]


def fixed_lookup(member: bool) -> Membership:
    async def lookup(group_id: int, user_id: int) -> bool:
        return member

    return Membership(-100, lookup)


async def test_bot_middleware_refreshes_user(db: Database, settings: Settings) -> None:
    data = await run_middleware(db, settings, "private", Membership(None, None))
    assert data["is_member"] is True
    assert await username_of(db, 5) == "bek_new"


async def alerts_of(db: Database, telegram_id: int) -> tuple[bool, bool]:
    async with db.conn.execute(
        "SELECT alerts_buy_krw, alerts_buy_kzt FROM users WHERE telegram_id = ?", (telegram_id,)
    ) as cursor:
        row = await cursor.fetchone()
    assert row is not None
    return bool(row[0]), bool(row[1])


async def test_bot_first_turns_alerts_on(db: Database, settings: Settings) -> None:
    data = await run_middleware(db, settings, "private", Membership(None, None))
    assert await alerts_of(db, 5) == (True, True)
    user = data["db_user"]
    assert isinstance(user, User) and user.alerts_buy_krw and user.alerts_buy_kzt


async def test_app_first_leaves_alerts_off(db: Database, settings: Settings) -> None:
    await upsert_user(db, TelegramUser(id=5, first_name="Bek"), config_admin=False)
    await run_middleware(db, settings, "private", Membership(None, None))
    assert await alerts_of(db, 5) == (False, False)


async def test_bot_keeps_alerts_turned_off(db: Database, settings: Settings) -> None:
    await run_middleware(db, settings, "private", Membership(None, None))
    await db.conn.execute("UPDATE users SET alerts_buy_krw = 0 WHERE telegram_id = 5")
    await db.conn.commit()
    await run_middleware(db, settings, "private", Membership(None, None))
    assert await alerts_of(db, 5) == (False, True)


async def test_bot_middleware_ignores_group_updates(db: Database, settings: Settings) -> None:
    data = await run_middleware(db, settings, "supergroup", Membership(None, None))
    assert data["is_member"] is False
    async with db.conn.execute("SELECT COUNT(*) FROM users") as cursor:
        assert (await cursor.fetchone())[0] == 0


async def test_bot_middleware_skips_non_members(db: Database, settings: Settings) -> None:
    data = await run_middleware(db, settings, "private", fixed_lookup(False))
    assert data["is_member"] is False
    assert data["db_user"] is None
    async with db.conn.execute("SELECT COUNT(*) FROM users") as cursor:
        assert (await cursor.fetchone())[0] == 0
    data = await run_middleware(db, settings, "private", fixed_lookup(True))
    assert data["is_member"] is True
    assert await username_of(db, 5) == "bek_new"


async def last_seen(db: Database, telegram_id: int) -> str | None:
    async with db.conn.execute(
        "SELECT last_seen_at FROM users WHERE telegram_id = ?", (telegram_id,)
    ) as cursor:
        row = await cursor.fetchone()
    assert row is not None
    return row[0]


async def test_last_seen_is_refreshed_now_and_then(db: Database) -> None:
    await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    assert await last_seen(db, 1) is not None
    # Seen a moment ago: no write. Long ago: refreshed, without touching updated_at.
    await db.conn.execute("UPDATE users SET last_seen_at = '9999', updated_at = 'marker'")
    await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    assert await last_seen(db, 1) == "9999"
    await db.conn.execute("UPDATE users SET last_seen_at = '2000-01-01T00:00:00+00:00'")
    user = await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    assert (await last_seen(db, 1) or "") > "2000-01-01T00:00:00+00:00"
    assert user.updated_at == "marker"

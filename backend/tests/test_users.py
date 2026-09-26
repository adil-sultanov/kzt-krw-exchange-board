from unittest.mock import AsyncMock

from aiogram.types import User as AiogramUser

from app.bot.middleware import UserRefreshMiddleware
from app.config import Settings
from app.db import Database
from app.models import TelegramUser
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


async def test_bot_middleware_refreshes_user(db: Database, settings: Settings) -> None:
    handler = AsyncMock(return_value="handled")
    from_user = AiogramUser(id=5, is_bot=False, first_name="Bek", username="bek_new")
    result = await UserRefreshMiddleware()(
        handler, object(), {"event_from_user": from_user, "db": db, "settings": settings}
    )
    assert result == "handled"
    handler.assert_awaited_once()
    assert await username_of(db, 5) == "bek_new"

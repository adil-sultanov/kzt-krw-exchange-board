from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject
from aiogram.types import User as AiogramUser

from app.config import Settings
from app.db import Database
from app.models import TelegramUser
from app.services.users import upsert_user


class UserRefreshMiddleware(BaseMiddleware):
    """Refresh the sender's user row (and username cache) on every bot update."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        from_user: AiogramUser | None = data.get("event_from_user")
        if from_user is not None and not from_user.is_bot:
            settings: Settings = data["settings"]
            db: Database = data["db"]
            tg_user = TelegramUser(
                id=from_user.id, first_name=from_user.first_name, username=from_user.username
            )
            await upsert_user(db, tg_user, config_admin=settings.is_admin(from_user.id))
        return await handler(event, data)

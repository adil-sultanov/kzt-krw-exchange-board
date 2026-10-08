from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.enums import ChatType
from aiogram.types import Chat, TelegramObject
from aiogram.types import User as AiogramUser

from app.config import Settings
from app.db import Database
from app.models import TelegramUser, User
from app.services.errors import ServiceError
from app.services.membership import Membership
from app.services.users import upsert_user


class UserRefreshMiddleware(BaseMiddleware):
    """Refresh the sender's user row (and username cache) on every private bot update.

    Sets `is_member` for handlers: whether the sender may use the board, and `db_user`: their
    user row (None unless they're a member). Non-members of the
    group get no user row. Updates from group chats are left alone: the bot may see the
    group's messages (as its admin) but never stores or acts on them.
    """

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        from_user: AiogramUser | None = data.get("event_from_user")
        chat: Chat | None = data.get("event_chat")
        private = chat is not None and chat.type == ChatType.PRIVATE
        data["is_member"] = False
        data["db_user"] = None
        if from_user is not None and not from_user.is_bot and private:
            data["db_user"] = await _refresh_member(from_user, data)
            data["is_member"] = data["db_user"] is not None
        return await handler(event, data)


async def _refresh_member(from_user: AiogramUser, data: dict[str, Any]) -> User | None:
    """Their refreshed user row, or None if they may not use the board."""
    settings: Settings = data["settings"]
    db: Database = data["db"]
    membership: Membership = data["membership"]
    config_admin = settings.is_admin(from_user.id)
    try:
        allowed = await membership.is_allowed(from_user.id, config_admin=config_admin)
    except ServiceError:
        return None  # logged by the membership check
    if not allowed:
        return None
    tg_user = TelegramUser(
        id=from_user.id, first_name=from_user.first_name, username=from_user.username
    )
    return await upsert_user(db, tg_user, config_admin=config_admin, from_bot=True)

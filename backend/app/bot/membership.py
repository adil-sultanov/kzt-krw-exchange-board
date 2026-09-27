"""Asks Telegram whether a user is in the group chat (see `app.services.membership`)."""

from aiogram import Bot
from aiogram.enums import ChatMemberStatus
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import ChatMemberRestricted

from app.services.membership import MemberLookup

MEMBER_STATUSES = {
    ChatMemberStatus.CREATOR,
    ChatMemberStatus.ADMINISTRATOR,
    ChatMemberStatus.MEMBER,
}


def telegram_member_lookup(bot: Bot) -> MemberLookup:
    async def lookup(group_id: int, user_id: int) -> bool:
        try:
            member = await bot.get_chat_member(group_id, user_id)
        except TelegramBadRequest as exc:
            # A wrong GROUP_ID, or the bot isn't in the group: a setup error, not a non-member.
            if "chat not found" in exc.message.lower():
                raise
            # e.g. "user not found" for someone who was never in the group.
            return False
        if isinstance(member, ChatMemberRestricted):
            return member.is_member
        return member.status in MEMBER_STATUSES

    return lookup

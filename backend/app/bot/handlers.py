import logging

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import CommandStart
from aiogram.types import (
    ChatMemberUpdated,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LinkPreviewOptions,
    Message,
    WebAppInfo,
)

from app.bot import texts
from app.config import Settings
from app.models import User
from app.services.membership import Membership

logger = logging.getLogger(__name__)

router = Router()
# The bot answers only in private chats; in the group it only checks who's a member.
router.message.filter(F.chat.type == ChatType.PRIVATE)


def open_app_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    button = InlineKeyboardButton(text=texts.OPEN_APP_BUTTON, web_app=WebAppInfo(url=webapp_url))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


@router.message(CommandStart())
async def start(message: Message, settings: Settings, db_user: User | None) -> None:
    if db_user is None:
        await message.answer(texts.NOT_MEMBER)
        return
    await message.answer(
        texts.welcome(db_user.alerts_buy_krw or db_user.alerts_buy_kzt),
        parse_mode="HTML",
        link_preview_options=LinkPreviewOptions(is_disabled=True),
        reply_markup=open_app_keyboard(settings.webapp_url),
    )


@router.my_chat_member(F.chat.type.in_({ChatType.GROUP, ChatType.SUPERGROUP}))
async def added_to_group(update: ChatMemberUpdated, settings: Settings) -> None:
    """Logs a group's ID when the bot joins it, for setting GROUP_ID."""
    if update.new_chat_member.status in {"member", "administrator"}:
        current = " (current GROUP_ID)" if update.chat.id == settings.group_id else ""
        logger.info("Bot is in group %r: GROUP_ID=%s%s", update.chat.title, update.chat.id, current)


@router.chat_member()
async def group_member_changed(update: ChatMemberUpdated, membership: Membership) -> None:
    """Someone joined, left, or was removed or restricted in the group: check them again on
    their next request, so leaving ends access at once instead of when the cache expires."""
    if update.chat.id == membership.group_id:
        membership.forget(update.new_chat_member.user.id)

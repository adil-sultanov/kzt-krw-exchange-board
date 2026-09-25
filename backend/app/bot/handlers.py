from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.bot import texts
from app.config import Settings

router = Router()


def open_app_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    button = InlineKeyboardButton(text=texts.OPEN_APP_BUTTON, web_app=WebAppInfo(url=webapp_url))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


@router.message(CommandStart())
async def start(message: Message, settings: Settings) -> None:
    await message.answer(texts.WELCOME, reply_markup=open_app_keyboard(settings.webapp_url))

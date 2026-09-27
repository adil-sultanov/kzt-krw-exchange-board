# Copyright (c) 2026 Adil Sultanov (@moonpie24). All rights reserved. See LICENSE.
"""FastAPI app factory. Run with: uvicorn app.main:create_app --factory"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from aiogram import Bot
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.bot.membership import telegram_member_lookup
from app.bot.notifier import BotNotifier
from app.bot.runner import BotRunner
from app.config import Settings, get_settings
from app.db import Database
from app.jobs import build_scheduler
from app.services.errors import ServiceError
from app.services.membership import Membership
from app.services.notifications import NullNotifier


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = Database(settings.db_path)
        await db.connect()
        await db.migrate()
        app.state.db = db
        # The membership check needs the Bot API even when the bot itself isn't running.
        needs_bot = settings.run_bot or settings.group_id is not None
        bot = Bot(settings.bot_token.get_secret_value()) if needs_bot else None
        membership = Membership(
            settings.group_id, telegram_member_lookup(bot) if bot is not None else None
        )
        app.state.membership = membership
        notifier = BotNotifier(bot, settings.webapp_url) if bot and settings.run_bot else None
        app.state.notifier = notifier or NullNotifier()
        scheduler = build_scheduler(db, settings) if settings.run_jobs else None
        bot_runner = BotRunner(settings, db, bot, membership) if bot and settings.run_bot else None
        try:
            if scheduler is not None:
                scheduler.start()
            if bot_runner is not None:
                await bot_runner.start()
            yield
        finally:
            if bot_runner is not None:
                await bot_runner.stop()
            if scheduler is not None:
                scheduler.shutdown(wait=False)
            if notifier is not None:
                await notifier.aclose()
            if bot is not None:
                await bot.session.close()
            await db.close()

    app = FastAPI(title="KZT ↔ KRW Exchange Board", lifespan=lifespan)
    app.state.settings = settings
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["*"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.exception_handler(ServiceError)
    async def service_error(request: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse({"detail": exc.code}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # The frontend validates forms itself; this is a fallback, so one code is enough.
        return JSONResponse({"detail": "invalid_input"}, status_code=422)

    app.include_router(api_router)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    if (settings.frontend_dist / "index.html").is_file():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
    else:

        @app.get("/", include_in_schema=False)
        async def frontend_missing() -> PlainTextResponse:
            return PlainTextResponse(
                "Frontend not built. Run `npm run build` in frontend/, "
                "or use the Vite dev server (see README).",
                status_code=503,
            )

    return app

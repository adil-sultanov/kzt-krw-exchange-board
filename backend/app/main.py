"""FastAPI app factory. Run with: uvicorn app.main:create_app --factory"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.router import api_router
from app.bot.runner import BotRunner
from app.config import Settings, get_settings
from app.db import Database

DEV_PAGE = Path(__file__).parent / "dev_page.html"


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
        bot_runner = BotRunner(settings, db) if settings.run_bot else None
        try:
            if bot_runner is not None:
                await bot_runner.start()
            yield
        finally:
            if bot_runner is not None:
                await bot_runner.stop()
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
    app.include_router(api_router)

    @app.get("/health", include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # Placeholder Mini App page for checking auth end to end; replaced by the
    # React frontend in milestone 2.
    @app.get("/", include_in_schema=False)
    async def dev_page() -> FileResponse:
        return FileResponse(DEV_PAGE)

    return app

"""Settings loaded from environment variables and the repo-root `.env` file."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    bot_token: SecretStr
    webapp_url: str
    db_path: Path = Path("data/exchange.db")
    admin_ids: Annotated[list[int], NoDecode] = []
    # The app's owner: always an admin, and the only one who can edit the About page.
    owner_id: int | None = None
    cors_origins: Annotated[list[str], NoDecode] = []
    init_data_max_age: int = 24 * 60 * 60
    run_bot: bool = True
    run_jobs: bool = True
    # Daily database backups go here (none if unset); older ones are deleted.
    backup_dir: Path | None = None
    backup_keep_days: int = 14
    # Built frontend (`npm run build` in frontend/), served at `/` if present.
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"

    def is_admin(self, telegram_id: int) -> bool:
        return telegram_id in self.admin_ids or telegram_id == self.owner_id

    def is_owner(self, telegram_id: int) -> bool:
        return self.owner_id is not None and telegram_id == self.owner_id

    @field_validator("admin_ids", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("backup_dir", mode="before")
    @classmethod
    def _empty_is_none(cls, value: Any) -> Any:
        return None if isinstance(value, str) and not value.strip() else value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from the environment

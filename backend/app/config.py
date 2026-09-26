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
    cors_origins: Annotated[list[str], NoDecode] = []
    init_data_max_age: int = 24 * 60 * 60
    run_bot: bool = True
    run_jobs: bool = True
    # Built frontend (`npm run build` in frontend/), served at `/` if present.
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"

    @field_validator("admin_ids", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from the environment

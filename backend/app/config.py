from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Q"
    environment: str = "development"

    # Async URL used by the app at runtime
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/q"
    # Sync URL used by Alembic migrations
    database_url_sync: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/q"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    public_base_url: str = "http://localhost:3000"

    whatsapp_api_url: str | None = None
    whatsapp_api_token: str | None = None
    whatsapp_phone_id: str | None = None

    sms_api_url: str | None = None
    sms_api_token: str | None = None

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Per-IP rate limits. Login is intentionally tight to make password
    # spraying expensive on top of bcrypt cost; join is loose enough for a
    # busy in-store rush but tight enough to deter capacity-flooding bots.
    rate_limit_login: str = "10/minute"
    rate_limit_join: str = "30/minute"

    @model_validator(mode="after")
    def _reject_default_secret_in_prod(self) -> "Settings":
        # In production an unset/default jwt_secret means anyone with the
        # source can mint valid tokens. Fail loud at import time.
        if self.environment == "production" and self.jwt_secret == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "jwt_secret must be set to a strong random value when environment=production"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Q"
    environment: str = "development"

    # Async URL used by the app at runtime
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/q"
    # Sync URL used by Alembic migrations
    database_url_sync: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/q"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    public_base_url: str = "http://localhost:3000"

    whatsapp_api_url: str | None = None
    whatsapp_api_token: str | None = None
    whatsapp_phone_id: str | None = None

    sms_api_url: str | None = None
    sms_api_token: str | None = None

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

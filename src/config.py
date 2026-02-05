"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = Field(
        ...,
        description="PostgreSQL connection string",
    )

    # Transfer Gov
    transfer_gov_url: str = Field(
        default="https://dd-publico.serpro.gov.br/extensions/gestao-transferencias/gestao-transferencias.html",
        description="Transfer Gov panel URL",
    )

    # Telegram
    telegram_bot_token: str = Field(
        ...,
        description="Telegram Bot API token",
    )
    telegram_chat_id: str = Field(
        ...,
        description="Telegram chat/group ID for alerts",
    )

    # Scheduler
    extraction_hour: int = Field(
        default=9,
        description="Hour to run extraction (0-23)",
    )
    extraction_minute: int = Field(
        default=15,
        description="Minute to run extraction (0-59)",
    )

    # Retry
    max_retries: int = Field(
        default=3,
        description="Max retry attempts for downloads",
    )
    retry_base_delay: int = Field(
        default=2,
        description="Base delay in seconds for exponential backoff",
    )

    # Health Check
    health_port: int = Field(
        default=8080,
        description="Port for health check endpoint",
    )

    # Data
    raw_data_dir: str = Field(
        default="data/raw",
        description="Directory for raw downloaded files",
    )
    raw_retention_days: int = Field(
        default=30,
        description="Days to retain raw files before cleanup",
    )

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

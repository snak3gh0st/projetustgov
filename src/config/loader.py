"""Configuration loader for PROJETUS.

Loads configuration from YAML file with environment variable substitution
and validates using Pydantic models.
"""

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field, field_validator

T = TypeVar("T")

# Load .env file at module import time
load_dotenv()


def substitute_env_vars(obj: Any) -> Any:
    """Recursively substitute ${VAR_NAME} with environment variable values.

    Args:
        obj: Any object (dict, list, str, etc.) to process

    Returns:
        Object with environment variables substituted
    """
    if isinstance(obj, dict):
        return {k: substitute_env_vars(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_env_vars(item) for item in obj]
    elif isinstance(obj, str):
        # Match ${VAR_NAME} pattern
        pattern = r"\$\{([^}]+)\}"

        def replace_var(match: re.Match) -> str:
            var_name = match.group(1)
            env_value = os.getenv(var_name)
            if env_value is None:
                # Return original placeholder if env var not set
                return match.group(0)
            return env_value

        return re.sub(pattern, replace_var, obj)
    else:
        return obj


class TelegramConfig(BaseModel):
    """Telegram alerting configuration."""

    enabled: bool = Field(default=True, description="Enable Telegram alerts")
    bot_token: str = Field(..., description="Telegram Bot API token")
    chat_id: str = Field(..., description="Telegram chat/group ID for alerts")


class EmailConfig(BaseModel):
    """Email alerting configuration."""

    enabled: bool = Field(default=False, description="Enable email alerts")
    smtp_host: str | None = Field(default=None, description="SMTP server hostname")
    smtp_port: int = Field(default=587, description="SMTP server port")
    from_: str = Field(
        default="alerts@projetus.com", alias="from", description="From email address"
    )
    to: list[EmailStr] = Field(
        default_factory=list, description="List of recipient email addresses"
    )

    model_config = {"populate_by_name": True}


class AlertingConfig(BaseModel):
    """Alerting configuration section."""

    telegram: TelegramConfig = Field(default_factory=TelegramConfig)
    email: EmailConfig = Field(default_factory=EmailConfig)


class ReconciliationConfig(BaseModel):
    """Reconciliation configuration section."""

    volume_tolerance_percent: int = Field(
        default=10,
        ge=0,
        le=100,
        description="Maximum allowed percentage change in volume before alerting",
    )
    alert_on_mismatch: bool = Field(
        default=True,
        description="Send alert when reconciliation mismatch detected",
    )
    alert_on_scheduler_miss: bool = Field(
        default=True,
        description="Send alert when scheduler misses expected run time",
    )


class ExtractionConfig(BaseModel):
    """Extraction configuration section."""

    hour: int = Field(
        default=9,
        ge=0,
        le=23,
        description="Hour to run extraction (0-23)",
    )
    minute: int = Field(
        default=15,
        ge=0,
        le=59,
        description="Minute to run extraction (0-59)",
    )
    timezone: str = Field(
        default="America/Sao_Paulo",
        description="Timezone for extraction scheduling",
    )
    dry_run_default: bool = Field(
        default=False,
        description="Default dry-run mode (True = don't write to database)",
    )


class LineageConfig(BaseModel):
    """Data lineage configuration section."""

    enabled: bool = Field(
        default=True,
        description="Enable data lineage tracking",
    )
    track_pipeline_version: bool = Field(
        default=True,
        description="Track pipeline version in lineage records",
    )


class DatabaseConfig(BaseModel):
    """Database configuration section."""

    url: str = Field(..., description="PostgreSQL connection URL")


class AppConfig(BaseModel):
    """Root application configuration."""

    alerting: AlertingConfig = Field(default_factory=AlertingConfig)
    reconciliation: ReconciliationConfig = Field(default_factory=ReconciliationConfig)
    extraction: ExtractionConfig = Field(default_factory=ExtractionConfig)
    lineage: LineageConfig = Field(default_factory=LineageConfig)
    database: DatabaseConfig = Field(..., description="Database configuration")


@lru_cache(maxsize=1)
def get_config(config_path: str | Path | None = None) -> AppConfig:
    """Load and validate configuration from YAML file.

    This function is cached - subsequent calls return the same AppConfig instance.

    Args:
        config_path: Path to config.yaml file. If None, looks for config.yaml
                    in current directory and project root.

    Returns:
        Validated AppConfig instance

    Raises:
        FileNotFoundError: If config file not found
        ValueError: If config validation fails
    """
    if config_path is None:
        # Try current directory first, then project root
        current_dir = Path.cwd()
        project_root = Path(__file__).parent.parent.parent

        for path in [current_dir / "config.yaml", project_root / "config.yaml"]:
            if path.exists():
                config_path = path
                break

        if config_path is None:
            raise FileNotFoundError(
                "config.yaml not found in current directory or project root"
            )

    config_path = Path(config_path)

    # Load raw YAML
    with open(config_path, "r", encoding="utf-8") as f:
        raw_config = yaml.safe_load(f)

    if raw_config is None:
        raise ValueError(f"Config file {config_path} is empty or invalid YAML")

    # Substitute environment variables
    config_with_env = substitute_env_vars(raw_config)

    # Validate with Pydantic
    app_config = AppConfig.model_validate(config_with_env)

    return app_config


def reload_config() -> AppConfig:
    """Reload configuration from file (bypasses cache).

    Useful for testing or when config file changes at runtime.

    Returns:
        Fresh AppConfig instance loaded from file
    """
    get_config.cache_clear()
    return get_config()


# Backward compatibility alias
get_settings = get_config

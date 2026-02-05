"""Structured logging configuration for Projetus."""

from loguru import logger


def configure_logging():
    """Configure Loguru for production: JSON to stderr, file rotation."""
    logger.remove()  # Remove default handler

    # Console: human-readable for development
    logger.add(
        "logs/projetus_{time:YYYY-MM-DD}.log",
        serialize=True,  # JSON output
        rotation="500 MB",
        retention="30 days",
        compression="zip",
        level="DEBUG",
        diagnose=False,  # Don't expose variables in production
    )

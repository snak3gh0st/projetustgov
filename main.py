"""Projetus - Transfer Gov Automation Entry Point."""

from src.config import get_settings
from src.monitor.logger import configure_logging


def main():
    """Main entry point for Projetus application."""
    # Configure structured logging
    configure_logging()

    # Load settings
    settings = get_settings()

    # TODO: Implement scheduler + health endpoint (Plan 06)
    print("Projetus starting...")


if __name__ == "__main__":
    main()

"""Projetus - Transfer Gov Automation Entry Point.

For production use, prefer running via the FastAPI app which includes
the scheduler and health check endpoints:
    uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000
"""

from src.config import get_settings
from src.monitor.logger import configure_logging


def main():
    """Main entry point - starts FastAPI server with integrated scheduler."""
    configure_logging()
    get_settings()

    import uvicorn
    from src.api.main import app

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()

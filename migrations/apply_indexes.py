#!/usr/bin/env python3
"""Apply performance indexes to Railway database.

This script connects to the Railway database and applies all performance
indexes defined in add_performance_indexes.sql.

Usage:
    python migrations/apply_indexes.py
"""

import sys
from pathlib import Path

from sqlalchemy import text

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.config import get_settings
from src.loader.database import create_db_engine
from src.monitor.logger import logger


def apply_indexes():
    """Apply performance indexes to database."""
    settings = get_settings()
    # AppConfig has database.url, not database_url
    db_url = settings.database.url if hasattr(settings, 'database') else settings.database_url
    engine = create_db_engine(db_url)

    # Read SQL file
    sql_file = Path(__file__).parent / "add_performance_indexes.sql"
    if not sql_file.exists():
        logger.error(f"SQL file not found: {sql_file}")
        return False

    sql_content = sql_file.read_text()

    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]

    logger.info(f"Applying {len(statements)} SQL statements...")

    try:
        with engine.connect() as conn:
            for i, statement in enumerate(statements, 1):
                logger.info(f"Executing statement {i}/{len(statements)}...")
                conn.execute(text(statement))
                conn.commit()

        logger.info("✅ All indexes applied successfully!")
        return True

    except Exception as e:
        logger.error(f"❌ Error applying indexes: {e}")
        return False


if __name__ == "__main__":
    success = apply_indexes()
    sys.exit(0 if success else 1)

"""Database connection factory and schema initialization.

This module provides:
- Engine creation with connection pooling
- Session factory for database operations
- Schema initialization (create_all)
- Convenience functions for common database access patterns

The pipeline uses synchronous SQLAlchemy (not async) because:
- Single-threaded ETL scheduler doesn't benefit from async
- Simpler error handling and debugging
- psycopg3 is used under the hood when available
"""

from typing import Generator

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import Session, sessionmaker

from src.config import get_settings
from src.loader.db_models import Base
from src.monitor.logger import logger


# Module-level engine cache for lazy initialization
_engine: Engine | None = None


def create_db_engine(database_url: str) -> Engine:
    """Create a SQLAlchemy engine with connection pooling.

    Args:
        database_url: PostgreSQL connection string (postgresql://...)

    Returns:
        Configured SQLAlchemy Engine instance
    """
    engine = create_engine(
        database_url,
        pool_size=5,  # Maintain 5 persistent connections
        max_overflow=10,  # Allow up to 10 additional connections under load
        pool_pre_ping=True,  # Verify connections before use (detects stale connections)
        echo=False,  # Don't log SQL by default (set True for debugging)
    )
    return engine


def create_session_factory(engine: Engine) -> sessionmaker:
    """Create a session factory bound to the given engine.

    Args:
        engine: SQLAlchemy Engine instance

    Returns:
        sessionmaker factory for creating Session instances
    """
    return sessionmaker(
        bind=engine,
        expire_on_commit=False,  # Prevent lazy loading issues after commit
    )


def init_db(engine: Engine) -> None:
    """Initialize database schema by creating all tables.

    This calls Base.metadata.create_all() to create all defined tables
    in the PostgreSQL database. Tables are only created if they don't
    already exist (CREATE TABLE IF NOT EXISTS behavior).

    Args:
        engine: SQLAlchemy Engine instance
    """
    Base.metadata.create_all(engine)
    logger.info("Database schema initialized")


def get_engine() -> Engine:
    """Get or create the cached database engine.

    Convenience function that reads database_url from settings and
    creates/caches an engine instance for repeated use.

    Returns:
        Cached SQLAlchemy Engine instance
    """
    global _engine

    if _engine is None:
        settings = get_settings()
        _engine = create_db_engine(settings.database_url)
        logger.debug("Created database engine")

    return _engine


def get_session() -> Generator[Session, None, None]:
    """Get a database session as a context manager.

    Convenience function that creates a new session from the cached
    engine. The caller should use this in a 'with' statement or
    explicitly close the session when done.

    Yields:
        SQLAlchemy Session instance

    Example:
        with get_session() as session:
            results = session.execute(text("SELECT 1"))
    """
    engine = get_engine()
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        yield session
    finally:
        session.close()

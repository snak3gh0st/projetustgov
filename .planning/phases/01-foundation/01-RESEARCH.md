# Phase 1: Foundation - Research

**Researched:** 2026-02-04
**Domain:** Python ETL Pipeline -- Web Scraping, Data Validation, PostgreSQL, Scheduling, Alerting
**Confidence:** HIGH

## Summary

Phase 1 delivers a complete end-to-end ETL pipeline that extracts 4 files (propostas, apoiadores, emendas, programas) from Transfer Gov daily at 9:15 AM, validates and transforms data, loads into PostgreSQL with enforced relationships, and alerts via Telegram on success or failure. This research synthesizes findings from the project-level research (STACK.md, ARCHITECTURE.md, PITFALLS.md, FEATURES.md) and adds phase-specific technical depth needed to plan concrete implementation tasks.

The standard approach is a monolithic Python 3.11+ application using Playwright for browser automation, Polars for data processing, SQLAlchemy 2.0+ for database operations, Pydantic v2 for validation, Loguru for logging, Tenacity for retry logic, APScheduler for scheduling, and FastAPI for the health check endpoint. The architecture follows a Store-Then-Transform pattern: download raw files first, then parse/validate/load in stages. All database writes use upsert (ON CONFLICT DO UPDATE) for idempotency, wrapped in atomic transactions.

Key discoveries during research: (1) Polars supports `windows-1252` encoding in `read_csv` but only in eager mode (not lazy `scan_csv`) -- this is fine for our file sizes; (2) charset-normalizer (MIT license, 93 encodings) has replaced chardet as the standard encoding detection library; (3) Telegram alerts are simplest via direct HTTP POST to the Bot API -- no need for a heavy library; (4) APScheduler 3.11.x with SQLAlchemyJobStore provides restart-resilient scheduling; (5) Transfer Gov paineis are publicly accessible Qlik Sense dashboards hosted by SERPRO, with data export to Excel/CSV.

**Primary recommendation:** Build the pipeline as 6 sequential modules (config, crawler, parser, transformer, loader, orchestrator) plus 2 cross-cutting modules (monitor, alerter), with raw file storage in `data/raw/YYYY-MM-DD/` and a PostgreSQL schema using natural keys from Transfer Gov IDs for upsert operations.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.11+ | Runtime | ETL industry standard, 10-60% faster than 3.10, mature ecosystem |
| Playwright | 1.58.0 | Browser automation & file download | Direct browser protocol, auto-downloads browsers, handles JS-rendered government portals |
| Polars | 2.x (latest) | Excel/CSV parsing & data processing | 5-10x faster than Pandas, 30-60% less memory, native encoding support for windows-1252 |
| SQLAlchemy | 2.0+ | ORM & database layer | Industry standard, full ACID support, type-hinted, PostgreSQL dialect with ON CONFLICT support |
| psycopg | 3.x (psycopg3) | PostgreSQL driver | Async-ready, native prepared statements, auto-used by SQLAlchemy 2.0+ |
| PostgreSQL | 15+ | Relational database | ACID compliance, zero data loss, excellent Python ecosystem |
| Pydantic | 2.13+ | Data validation & schema enforcement | Rust-core validation (5-50x faster than v1), type-safe, catches anomalies before DB |
| Loguru | 0.7+ | Structured logging | Zero-config, serialize=True for JSON, custom sinks for Telegram, file rotation built-in |
| Tenacity | 8.5+ | Retry logic with backoff | Exponential backoff, configurable stop/wait strategies, exception filtering |
| APScheduler | 3.11.x | Daily scheduling | Cron-style syntax, SQLAlchemyJobStore for persistence, timezone-aware |
| FastAPI | 0.115+ | Health check HTTP endpoint | Minimal footprint, async, easy to add single /health endpoint |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| openpyxl | 3.1.4+ | Excel .xlsx parsing engine | Auto-used by Polars for .xlsx files, required for government Excel reports |
| charset-normalizer | 3.4+ | Encoding auto-detection | Detect file encoding before parsing, fallback chain UTF-8 > Latin-1 > Windows-1252 |
| python-dotenv | 1.0+ | Environment variable loading | Load credentials from .env for local dev, 12-factor app pattern |
| httpx | 0.27+ | HTTP client for Telegram API | Lightweight HTTP POST for Telegram alerts, simpler than full bot library |
| uvicorn | 0.34+ | ASGI server for FastAPI health endpoint | Run health check endpoint alongside scheduler |
| uv | latest | Package/environment manager | 80x faster than venv, manages Python versions, Rust-based |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polars | Pandas | Pandas is slower (5-10x) but has broader tutorial coverage; Polars is better for ETL |
| charset-normalizer | chardet | chardet is LGPL, slower, supports only 30 encodings vs 93; charset-normalizer is the modern replacement |
| httpx for Telegram | python-telegram-bot | Full bot library is overkill for one-way alert sending; httpx POST is simpler |
| FastAPI | Flask | Flask works but FastAPI is faster, async-native, auto-generates OpenAPI docs |
| APScheduler | system cron | Cron lacks Python-level state management, harder to test, no job persistence |

**Installation:**
```bash
# Install uv (modern package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create project
uv init projetus --python 3.11
cd projetus

# Core dependencies
uv add playwright polars sqlalchemy pydantic loguru tenacity apscheduler fastapi
uv add psycopg[binary] openpyxl charset-normalizer python-dotenv httpx uvicorn

# Development dependencies
uv add --dev pytest pytest-playwright ruff mypy

# Install Playwright browser (one-time)
playwright install chromium
```

## Architecture Patterns

### Recommended Project Structure
```
projetus/
├── src/
│   ├── __init__.py
│   ├── main.py                 # Entry point: starts scheduler + health endpoint
│   ├── config.py               # Settings from env vars via Pydantic BaseSettings
│   ├── crawler/
│   │   ├── __init__.py
│   │   ├── browser.py          # Playwright browser lifecycle management
│   │   ├── navigator.py        # Transfer Gov navigation & file download
│   │   └── downloader.py       # Raw file download orchestration
│   ├── parser/
│   │   ├── __init__.py
│   │   ├── encoding.py         # Auto-detect encoding with charset-normalizer
│   │   ├── excel_parser.py     # Polars read_excel for .xlsx files
│   │   ├── csv_parser.py       # Polars read_csv with encoding handling
│   │   └── schemas.py          # Expected column schemas per file type
│   ├── transformer/
│   │   ├── __init__.py
│   │   ├── validator.py        # Pydantic model validation per entity
│   │   ├── linker.py           # Establish relationships between entities
│   │   └── models.py           # Pydantic models: Proposta, Apoiador, Emenda, Programa
│   ├── loader/
│   │   ├── __init__.py
│   │   ├── database.py         # SQLAlchemy engine, session factory, connection pool
│   │   ├── db_models.py        # SQLAlchemy ORM models (tables)
│   │   ├── upsert.py           # Bulk upsert with ON CONFLICT DO UPDATE
│   │   └── migrations.py       # Schema creation/migration (create_all or Alembic)
│   ├── orchestrator/
│   │   ├── __init__.py
│   │   ├── pipeline.py         # Stage coordination: crawl > parse > transform > load
│   │   └── scheduler.py        # APScheduler setup with cron trigger at 9:15 AM
│   └── monitor/
│       ├── __init__.py
│       ├── logger.py           # Loguru configuration (JSON, file rotation, levels)
│       ├── alerter.py          # Telegram alert sender via httpx
│       └── health.py           # FastAPI /health endpoint
├── data/
│   └── raw/                    # Raw downloaded files organized by date
│       └── YYYY-MM-DD/         # e.g., 2026-02-04/
│           ├── propostas.xlsx
│           ├── apoiadores.xlsx
│           ├── emendas.xlsx
│           └── programas.xlsx
├── tests/
│   ├── fixtures/               # Sample Excel/CSV files for testing
│   ├── test_parser.py
│   ├── test_transformer.py
│   ├── test_loader.py
│   └── test_pipeline.py
├── .env.example                # Template for environment variables
├── .gitignore                  # Includes .env, data/raw/*, __pycache__
├── pyproject.toml
├── Dockerfile
└── docker-compose.yml          # App + PostgreSQL for local development
```

### Pattern 1: Store-Then-Transform (Raw File Preservation)
**What:** Download and save raw files to `data/raw/YYYY-MM-DD/` before any processing. Parse from stored files, never directly from network stream.
**When to use:** Always. This is non-negotiable for production ETL.
**Why:** Enables reprocessing when parser logic changes, provides audit trail, separates expensive crawling from cheap parsing.
```python
# Source: Architecture research + CONTEXT.md decision
import os
from datetime import date

def get_raw_dir(extraction_date: date | None = None) -> str:
    """Create and return date-organized raw file directory."""
    d = extraction_date or date.today()
    raw_dir = f"data/raw/{d.isoformat()}"
    os.makedirs(raw_dir, exist_ok=True)
    return raw_dir

# Crawler saves here, parser reads from here
# Retention: keep 30 days of raw files (Claude's discretion recommendation)
```

### Pattern 2: Encoding Detection Fallback Chain
**What:** Auto-detect file encoding before parsing, with explicit fallback chain.
**When to use:** Every file from Transfer Gov, since Brazilian government systems may use UTF-8, UTF-8-sig, ISO-8859-1, or Windows-1252.
**Why:** charset-normalizer detects 93 encodings; fallback chain ensures Portuguese characters (c, a, o, a) are never corrupted.
```python
# Source: charset-normalizer docs + Polars encoding support
from charset_normalizer import from_path

def detect_encoding(file_path: str) -> str:
    """Detect file encoding with fallback chain."""
    result = from_path(file_path)
    best = result.best()
    if best is not None:
        encoding = best.encoding
        # Normalize encoding names for Polars compatibility
        encoding_map = {
            "ascii": "utf8",
            "utf-8": "utf8",
            "iso-8859-1": "windows-1252",  # Polars uses windows-1252
            "latin-1": "windows-1252",
            "cp1252": "windows-1252",
        }
        return encoding_map.get(encoding.lower(), encoding)
    # Fallback: try UTF-8, if fails use windows-1252
    return "utf8"
```

### Pattern 3: Upsert with ON CONFLICT DO UPDATE
**What:** Use PostgreSQL's INSERT ... ON CONFLICT DO UPDATE for idempotent data loading.
**When to use:** Every database write operation. Critical for re-runs and retry safety.
```python
# Source: SQLAlchemy 2.0 PostgreSQL dialect docs
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

def upsert_records(session: Session, table, records: list[dict], conflict_column: str):
    """Bulk upsert records using ON CONFLICT DO UPDATE."""
    if not records:
        return 0

    stmt = insert(table).values(records)
    # Update all columns except the conflict column on duplicate
    update_cols = {
        col.name: stmt.excluded[col.name]
        for col in table.__table__.columns
        if col.name != conflict_column
    }
    # Always update updated_at
    update_cols["updated_at"] = stmt.excluded["updated_at"]

    stmt = stmt.on_conflict_do_update(
        index_elements=[conflict_column],
        set_=update_cols,
    )
    result = session.execute(stmt)
    return result.rowcount
```

### Pattern 4: Atomic Transaction per Extraction Run
**What:** Wrap all database operations for a single extraction run in one transaction. Commit only if all succeed, rollback on any failure.
**When to use:** Every pipeline execution.
**Note from CONTEXT.md:** User decided "Load valid rows, skip invalid ones" -- so validation happens BEFORE the transaction. Invalid rows are logged and skipped, but the transaction itself is atomic for all valid rows.
```python
# Source: SQLAlchemy 2.0 session management
from sqlalchemy.orm import Session

def load_extraction(session: Session, validated_data: dict):
    """Load all validated data in a single atomic transaction."""
    try:
        # Order matters: parent tables first, then children, then relationships
        upsert_records(session, Programa, validated_data["programas"], "transfer_gov_id")
        upsert_records(session, Proposta, validated_data["propostas"], "transfer_gov_id")
        upsert_records(session, Apoiador, validated_data["apoiadores"], "transfer_gov_id")
        upsert_records(session, Emenda, validated_data["emendas"], "transfer_gov_id")
        # Junction tables last
        upsert_records(session, PropostaApoiador, validated_data["proposta_apoiadores"], "id")
        upsert_records(session, PropostaEmenda, validated_data["proposta_emendas"], "id")

        session.commit()
    except Exception:
        session.rollback()
        raise
```

### Pattern 5: Partial File Processing
**What:** If one of the 4 files fails to download or parse, process the others successfully.
**When to use:** During extraction and parsing phases. Per CONTEXT.md decision: "Corrupted/empty file handling: Skip that file, process others."
```python
# Source: CONTEXT.md locked decision
from loguru import logger

def process_files(raw_dir: str) -> dict:
    """Parse all available files, skip failures."""
    results = {}
    file_types = ["propostas", "apoiadores", "emendas", "programas"]

    for file_type in file_types:
        try:
            data = parse_file(raw_dir, file_type)
            results[file_type] = data
            logger.info(f"Parsed {file_type}: {len(data)} rows")
        except Exception as e:
            logger.error(f"Failed to parse {file_type}: {e}")
            results[file_type] = []  # Empty but continue

    return results
```

### Anti-Patterns to Avoid
- **Parse and discard raw files:** Always keep raw files for at least 30 days. Reprocessing from raw saves re-crawling.
- **INSERT without ON CONFLICT:** Creates duplicates on re-run. Always use upsert.
- **Silent empty extraction:** Distinguish process success (exit 0) from data success (rows > 0). Alert if extraction yields 0 rows.
- **Hardcoded Transfer Gov selectors:** Use fallback selectors (CSS > XPath > text-based) with explicit failure when all fail.
- **Global exception swallowing:** Log AND alert on every exception. Never `except: pass`.
- **Blocking pipeline on single file failure:** Per user decision, skip failed files and process the rest.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encoding detection | Manual byte inspection or try/except chains | charset-normalizer | Supports 93 encodings, 2x faster than chardet, MIT license, handles Brazilian Portuguese perfectly |
| Retry logic | Custom while loops with sleep | tenacity decorator | Handles exponential backoff, jitter, exception filtering, max attempts, logging -- all declaratively |
| Excel parsing | openpyxl directly + manual DataFrame construction | Polars read_excel | Automatic type inference, memory-efficient, handles large files, schema_overrides for type control |
| Cron scheduling | system crontab or time.sleep loops | APScheduler BackgroundScheduler | Python-native, persistent job store via PostgreSQL, timezone-aware, testable, coalesce support |
| Telegram sending | python-telegram-bot (full async bot framework) | httpx POST to Bot API | We only send one-way alerts, no need for bot framework; 3 lines of code vs entire library |
| Data validation | Manual if/else chains for field checking | Pydantic BaseModel with validators | Type coercion, field_validator, model_validator, clear error messages, serialization built-in |
| Connection pooling | Manual connection management | SQLAlchemy create_engine pool_size | Built-in connection pooling, automatic reconnection, configurable pool parameters |
| JSON logging | Custom JSON formatters | Loguru serialize=True | One parameter enables JSON output, includes timestamp/level/message/exception automatically |
| Environment config | os.environ manual reads | Pydantic BaseSettings | Type-validated, .env file support, nested config, default values, environment variable binding |

**Key insight:** Every "simple" custom solution in ETL grows to handle edge cases. Libraries already handle hundreds of edge cases (encoding variants, network errors, database reconnection, timezone math). Hand-rolling any of these wastes time and introduces bugs.

## Common Pitfalls

### Pitfall 1: Polars Encoding Limitation with scan_csv
**What goes wrong:** Developer uses `pl.scan_csv()` (lazy mode) for performance, but it only supports UTF-8 encoding. Files from Transfer Gov in Windows-1252 fail silently or produce garbled text.
**Why it happens:** Polars' lazy CSV reader is optimized for UTF-8 only. The `encoding` parameter on `read_csv` works but triggers eager (full in-memory) reading for non-UTF-8.
**How to avoid:** Always use `pl.read_csv()` (eager mode) for Transfer Gov files. File sizes are small enough (~4,100 rows max) that eager mode has no performance impact. Detect encoding first with charset-normalizer, then pass explicit encoding to `pl.read_csv(encoding=detected)`.
**Warning signs:** Portuguese characters appear as garbage, `UnicodeDecodeError` exceptions, or silent question marks in data.

### Pitfall 2: APScheduler Job Duplication on Restart
**What goes wrong:** Application restarts and adds the same scheduled job again, resulting in duplicate job executions (pipeline runs twice at 9:15 AM).
**Why it happens:** When using persistent job stores (SQLAlchemyJobStore), jobs survive restarts. If init code calls `scheduler.add_job()` without `replace_existing=True`, a duplicate is created.
**How to avoid:** Always use explicit job IDs and `replace_existing=True`:
```python
scheduler.add_job(
    run_pipeline,
    trigger="cron",
    hour=9, minute=15,
    id="daily_extraction",  # Explicit ID
    replace_existing=True,  # Prevents duplicate
    timezone="America/Sao_Paulo",
)
```
**Warning signs:** Pipeline runs multiple times per day, duplicate records despite upsert, duplicate Telegram notifications.

### Pitfall 3: SQLAlchemy Session Management in Long-Running Scripts
**What goes wrong:** Using a single session for the entire pipeline execution. If any operation fails mid-way, the session enters a broken state and subsequent operations silently fail or use stale data.
**Why it happens:** ETL scripts often create one session and reuse it. Unlike web frameworks that create per-request sessions, long-running scripts need explicit session lifecycle management.
**How to avoid:** Use SQLAlchemy's session factory pattern. Create a fresh session per extraction run, commit on success, rollback on failure:
```python
from sqlalchemy.orm import sessionmaker
Session = sessionmaker(bind=engine)

def run_pipeline():
    session = Session()
    try:
        # ... all operations ...
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```
**Warning signs:** `sqlalchemy.exc.InvalidRequestError`, stale data after errors, "session is in a rollback state" errors.

### Pitfall 4: Transfer Gov Session/Download Timeouts
**What goes wrong:** Playwright times out waiting for Transfer Gov to generate and serve the Excel/CSV download. The default timeout (30 seconds) is often insufficient for government systems that generate reports on-the-fly.
**Why it happens:** Government portals often have slow backends, especially for report generation. Transfer Gov dashboards are Qlik Sense applications hosted by SERPRO, which may have variable response times.
**How to avoid:** Set generous timeouts for download operations specifically:
```python
# Long timeout for report generation/download
page.set_default_timeout(120_000)  # 2 minutes for general operations

with page.expect_download(timeout=300_000) as download_info:  # 5 min for downloads
    page.click("text=Exportar")
```
**Warning signs:** `TimeoutError` during download, partial files, 0-byte downloads.

### Pitfall 5: Orphaned Records from Partial File Processing
**What goes wrong:** One file (e.g., apoiadores) fails to download, but propostas loads successfully. Propostas now reference apoiadores that don't exist in the database.
**Why it happens:** Per CONTEXT.md decision, partial extraction is acceptable. But if foreign keys are enforced strictly, loading propostas without their related apoiadores causes constraint violations.
**How to avoid:** (Claude's discretion recommendation) Use DEFERRABLE foreign key constraints, and load records even if referenced entities are missing. Log orphaned references for reconciliation. In the next successful extraction, the missing entities will be loaded and relationships will resolve:
```sql
-- Foreign keys that allow temporary orphans
ALTER TABLE propostas
ADD CONSTRAINT fk_propostas_programa
FOREIGN KEY (programa_id) REFERENCES programas(transfer_gov_id)
DEFERRABLE INITIALLY DEFERRED;
```
Alternatively, remove FK constraints and handle referential integrity at the application level, logging warnings for orphaned records.
**Warning signs:** `ForeignKeyViolation` errors during partial loads, constraint violations after partial extraction.

### Pitfall 6: Telegram Rate Limiting
**What goes wrong:** Sending too many Telegram messages in rapid succession (e.g., one per validation error) causes HTTP 429 responses and messages are lost.
**Why it happens:** Telegram Bot API has rate limits (~30 messages/second per bot, ~20 messages/minute to same group).
**How to avoid:** Batch all notifications into a single summary message per pipeline run. Send one message with success/failure status, row counts, and any errors:
```python
def send_alert(status: str, details: dict):
    """Send a single summary message, never per-row alerts."""
    message = format_summary(status, details)
    httpx.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": message, "parse_mode": "HTML"},
    )
```
**Warning signs:** Missing Telegram notifications, 429 errors in logs, partial alert messages.

## Code Examples

Verified patterns from official sources:

### Telegram Alert via Direct HTTP POST
```python
# Source: Telegram Bot API docs + httpx
# Simplest approach -- no bot library needed for one-way alerts
import httpx
from loguru import logger

def send_telegram_alert(
    token: str,
    chat_id: str,
    message: str,
    parse_mode: str = "HTML",
) -> bool:
    """Send alert to Telegram. Returns True on success."""
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": parse_mode,
    }
    try:
        response = httpx.post(url, json=payload, timeout=30)
        response.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.error(f"Telegram alert failed: {e}")
        return False

# Usage: success message
def format_success_message(stats: dict) -> str:
    return (
        "<b>Extracao Transfer Gov - Sucesso</b>\n\n"
        f"Propostas: {stats['propostas']} registros\n"
        f"Apoiadores: {stats['apoiadores']} registros\n"
        f"Emendas: {stats['emendas']} registros\n"
        f"Programas: {stats['programas']} registros\n"
        f"Duracao: {stats['duration_seconds']:.1f}s"
    )
```

### Pydantic Validation Models for Transfer Gov Data
```python
# Source: Pydantic v2 docs + REQUIREMENTS.md ETL-04
from pydantic import BaseModel, field_validator, model_validator
from datetime import date, datetime
from typing import Optional

class PropostaValidation(BaseModel):
    """Validates a single proposta record from Transfer Gov."""
    transfer_gov_id: str
    titulo: str
    valor_total: Optional[float] = None
    data_publicacao: Optional[date] = None
    estado: Optional[str] = None
    municipio: Optional[str] = None
    status: Optional[str] = None
    programa_id: Optional[str] = None

    @field_validator("transfer_gov_id")
    @classmethod
    def id_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor_total")
    @classmethod
    def valor_must_be_reasonable(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError(f"valor_total cannot be negative: {v}")
        return v

    @field_validator("estado")
    @classmethod
    def estado_must_be_valid_uf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        valid_ufs = {
            "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
            "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
            "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
        }
        v_upper = v.strip().upper()
        if v_upper and v_upper not in valid_ufs:
            raise ValueError(f"Invalid estado UF: {v}")
        return v_upper if v_upper else None
```

### SQLAlchemy ORM Models with Audit Columns
```python
# Source: SQLAlchemy 2.0 docs + CONTEXT.md audit trail decision
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Index, func
from datetime import date, datetime
from typing import Optional

class Base(DeclarativeBase):
    pass

class Proposta(Base):
    __tablename__ = "propostas"

    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_gov_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    titulo: Mapped[Optional[str]] = mapped_column(String)
    valor_total: Mapped[Optional[float]] = mapped_column(Float)
    data_publicacao: Mapped[Optional[date]] = mapped_column(Date)
    estado: Mapped[Optional[str]] = mapped_column(String(2))
    municipio: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[Optional[str]] = mapped_column(String)
    programa_id: Mapped[Optional[str]] = mapped_column(String)

    # Audit columns (CONTEXT.md locked decision)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    extraction_date: Mapped[date] = mapped_column(Date)

    __table_args__ = (
        Index("ix_propostas_status", "status"),
        Index("ix_propostas_estado", "estado"),
        Index("ix_propostas_data_pub", "data_publicacao"),
    )

class ExtractionLog(Base):
    __tablename__ = "extraction_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(String)  # 'success', 'partial', 'failed'
    files_downloaded: Mapped[Optional[int]] = mapped_column()
    total_records: Mapped[Optional[int]] = mapped_column()
    records_inserted: Mapped[Optional[int]] = mapped_column()
    records_updated: Mapped[Optional[int]] = mapped_column()
    records_skipped: Mapped[Optional[int]] = mapped_column()
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    error_message: Mapped[Optional[str]] = mapped_column(String)
```

### APScheduler with PostgreSQL Job Store
```python
# Source: APScheduler 3.11.x docs
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
import pytz

def create_scheduler(database_url: str) -> BackgroundScheduler:
    """Create scheduler with persistent PostgreSQL job store."""
    jobstores = {
        "default": SQLAlchemyJobStore(url=database_url),
    }
    executors = {
        "default": ThreadPoolExecutor(1),  # Single thread -- one job at a time
    }
    job_defaults = {
        "coalesce": True,   # If missed, run once (not multiple times)
        "max_instances": 1,  # Never run same job concurrently
        "misfire_grace_time": 3600,  # Allow up to 1 hour late execution
    }
    scheduler = BackgroundScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
        timezone=pytz.timezone("America/Sao_Paulo"),
    )
    return scheduler

# Add daily job with explicit ID to prevent duplicates
scheduler = create_scheduler(DATABASE_URL)
scheduler.add_job(
    run_pipeline,
    trigger="cron",
    hour=9, minute=15,
    id="daily_transfer_gov_extraction",
    replace_existing=True,
    name="Transfer Gov Daily Extraction",
)
scheduler.start()
```

### Playwright File Download with Retry
```python
# Source: Playwright Python docs + Tenacity docs
from playwright.sync_api import sync_playwright, Download
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from loguru import logger
import os

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=8),
    retry=retry_if_exception_type((TimeoutError, Exception)),
    before_sleep=lambda retry_state: logger.warning(
        f"Retry attempt {retry_state.attempt_number} for download"
    ),
)
def download_file(page, selector: str, save_dir: str) -> str:
    """Download a file by clicking a selector. Returns saved file path."""
    with page.expect_download(timeout=300_000) as download_info:
        page.click(selector)
    download: Download = download_info.value

    filename = download.suggested_filename
    save_path = os.path.join(save_dir, filename)
    download.save_as(save_path)
    logger.info(f"Downloaded: {filename} -> {save_path}")
    return save_path
```

### FastAPI Health Check Endpoint
```python
# Source: FastAPI docs + requirements MON-07
from fastapi import FastAPI
from datetime import datetime
from typing import Optional

app = FastAPI(title="Projetus Health", docs_url=None, redoc_url=None)

# Shared state updated by pipeline
_last_execution: dict = {
    "status": "unknown",
    "timestamp": None,
    "records": 0,
    "error": None,
}

def update_health(status: str, records: int = 0, error: str | None = None):
    """Called by pipeline after each execution."""
    _last_execution.update({
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "records": records,
        "error": error,
    })

@app.get("/health")
async def health_check():
    return {
        "service": "projetus-transfer-gov",
        "status": _last_execution["status"],
        "last_execution": _last_execution["timestamp"],
        "records_processed": _last_execution["records"],
        "error": _last_execution["error"],
    }
```

### Loguru Configuration for Production
```python
# Source: Loguru docs + REQUIREMENTS.md MON-01
from loguru import logger
import sys

def configure_logging():
    """Configure Loguru for production: JSON to stderr, file rotation."""
    logger.remove()  # Remove default handler

    # Console: human-readable for development
    logger.add(
        sys.stderr,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{function}:{line} | {message}",
        level="INFO",
        colorize=True,
    )

    # File: JSON for machine parsing, with rotation
    logger.add(
        "logs/projetus_{time:YYYY-MM-DD}.log",
        serialize=True,  # JSON output
        rotation="500 MB",
        retention="30 days",
        compression="zip",
        level="DEBUG",
        diagnose=False,  # Don't expose variables in production
    )
```

### Pydantic BaseSettings for Configuration
```python
# Source: Pydantic docs + 12-factor app pattern
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    # Database
    database_url: str = Field(..., description="PostgreSQL connection string")

    # Transfer Gov
    transfer_gov_url: str = Field(
        default="https://dd-publico.serpro.gov.br/extensions/gestao-transferencias/gestao-transferencias.html",
        description="Transfer Gov panel URL",
    )

    # Telegram
    telegram_bot_token: str = Field(..., description="Telegram Bot API token")
    telegram_chat_id: str = Field(..., description="Telegram chat/group ID for alerts")

    # Scheduler
    extraction_hour: int = Field(default=9, description="Hour to run extraction (0-23)")
    extraction_minute: int = Field(default=15, description="Minute to run extraction (0-59)")

    # Retry
    max_retries: int = Field(default=3, description="Max retry attempts for downloads")
    retry_base_delay: int = Field(default=2, description="Base delay in seconds for exponential backoff")

    # Health Check
    health_port: int = Field(default=8080, description="Port for health check endpoint")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chardet for encoding detection | charset-normalizer | 2022+ (adopted by requests lib) | 2x faster, 93 vs 30 encodings, MIT license |
| Pandas for ETL | Polars for ETL | 2023+ (Polars 2.x stable) | 5-10x faster, 30-60% less memory, lazy evaluation |
| psycopg2 for PostgreSQL | psycopg3 (psycopg) | 2023+ (psycopg 3.x stable) | Async-ready, better prepared statement support, actively maintained |
| SQLAlchemy 1.x legacy API | SQLAlchemy 2.0 Mapped API | 2023 (SA 2.0 release) | Type-hinted models, 2.0-style queries, better IDE support |
| Pydantic v1 | Pydantic v2 | 2023 (v2 release) | Rust core, 5-50x faster validation, new validator syntax |
| requests library | httpx | 2023+ (httpx mature) | Async support, HTTP/2, timeout control, drop-in compatible |
| Selenium WebDriver | Playwright | 2022+ (Playwright stable) | Faster, auto-downloads browsers, better API, Microsoft-backed |
| APScheduler 3.x | APScheduler 3.11.x (4.x in beta) | 3.11.x stable; 4.x not ready | Stick with 3.11.x; 4.x has async rewrite but is still beta |

**Deprecated/outdated:**
- **chardet:** Still works but charset-normalizer is the modern replacement (used by requests internally)
- **Pandas for ETL:** Still functional but Polars is significantly faster for batch processing
- **psycopg2:** Maintenance mode; psycopg3 is the active development branch
- **APScheduler 4.0:** Beta only, do NOT use in production; stick with 3.11.x

## Open Questions

Things that couldn't be fully resolved:

1. **Transfer Gov exact file format and download mechanism**
   - What we know: Transfer Gov panels are Qlik Sense dashboards hosted by SERPRO at `dd-publico.serpro.gov.br`. They support Excel/CSV export. The site appears to be publicly accessible (no login required per REQUIREMENTS.md EXTR-01).
   - What's unclear: The exact button/selector for exporting data, whether files are .xlsx or .csv (possibly both), the exact sheet structure and column names, whether downloads are triggered by JavaScript clicks or direct URLs.
   - Recommendation: Budget 2-4 hours during crawler development to inspect the actual Transfer Gov panel. Save sample files to `tests/fixtures/` immediately for parser development. This is an implementation detail, not a planning blocker.

2. **Relationship keys between the 4 files**
   - What we know: PROJECT.md states "IDs/chaves claros entre entidades." Expected: proposta_id, apoiador_id, emenda_id, programa_id.
   - What's unclear: Exact column names in Transfer Gov exports, whether relationships are via shared IDs or require join keys, cardinality (1:N vs N:M).
   - Recommendation: Download actual files first, inspect column structure, then design schema. Start with assumed N:M relationships (junction tables) which can be simplified to 1:N if data reveals that.

3. **Whether Transfer Gov requires authentication**
   - What we know: REQUIREMENTS.md states "No Login Required" and the public panels are accessible at `dd-publico.serpro.gov.br`. However, PROJECT.md mentions "credenciais JA DISPONIVEIS."
   - What's unclear: Whether the specific data (propostas, apoiadores, emendas, programas) is in the public panel or requires authenticated access to `portal.transferegov.sistema.gov.br`.
   - Recommendation: Start with the public panel approach. If the specific data requires login, Playwright session management is already in the stack. Keep crawler module flexible for both scenarios.

4. **Exact data volume per extraction**
   - What we know: 4,100+ propostas per year, ~11 per day. But a full extraction may download ALL historical records each time.
   - What's unclear: Whether Transfer Gov exports incremental (today's new data only) or full dumps (all historical data). This affects upsert performance and storage.
   - Recommendation: Design for full dump (upsert all records). At 4,100 rows, even full upsert is fast (<10 seconds). If incremental, even better.

## Discretionary Recommendations

Per CONTEXT.md, these areas are Claude's discretion:

### Retry Strategy if Transfer Gov is Down
**Recommendation:** 3 attempts with exponential backoff: 2s, 4s, 8s wait between retries. After 3 failures, mark extraction as "failed" and send Telegram alert. Do NOT retry indefinitely -- if Transfer Gov is down for extended maintenance, manual intervention is appropriate.

### Raw File Retention Policy
**Recommendation:** Keep 30 days of raw files in `data/raw/YYYY-MM-DD/`. After 30 days, automatically delete (via a simple cleanup function called at start of each extraction). 30 days provides sufficient audit window for reprocessing without excessive storage use.

### Directory Structure for Downloaded Files
**Recommendation:** `data/raw/YYYY-MM-DD/{filename}` -- date-based organization makes it trivial to find files for a specific extraction, enables simple cleanup by date, and naturally prevents overwrites between runs.

### Encoding Auto-Detection Fallback Chain
**Recommendation:** Use charset-normalizer as primary detector. Fallback chain: detected encoding (trust charset-normalizer) > UTF-8 > UTF-8-sig > Windows-1252. Log detected encoding for each file for debugging.

### Schema Evolution Handling (New Columns from Source)
**Recommendation:** Log new/unexpected columns as WARNING but do not fail. Parse only the columns defined in schema. This allows forward compatibility while alerting on schema drift. New columns can be added to the schema in a future update without breaking current extraction.

### Orphaned Record Resolution Strategy
**Recommendation:** Use DEFERRABLE foreign keys or soft foreign keys (application-level checks, not database constraints). Log orphaned records as WARNING. In the next successful full extraction, orphaned records will naturally resolve when the missing parent records are loaded. Never fail an extraction due to orphaned records.

## Sources

### Primary (HIGH confidence)
- [Playwright Python Download API docs](https://playwright.dev/python/docs/downloads) - File download patterns, expect_download API
- [Polars Excel user guide](https://docs.pola.rs/user-guide/io/excel/) - read_excel engines, encoding support
- [Polars read_csv API docs](https://docs.pola.rs/api/python/stable/reference/api/polars.read_csv.html) - encoding parameter (utf8, windows-1252)
- [SQLAlchemy 2.0 PostgreSQL dialect](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html) - ON CONFLICT upsert support
- [SQLAlchemy 2.0 ORM DML guide](https://docs.sqlalchemy.org/en/20/orm/queryguide/dml.html) - ORM-level upsert
- [Pydantic v2 validators](https://docs.pydantic.dev/latest/concepts/validators/) - field_validator, model_validator
- [APScheduler 3.11.x user guide](https://apscheduler.readthedocs.io/en/3.x/userguide.html) - BackgroundScheduler, SQLAlchemyJobStore
- [charset-normalizer GitHub](https://github.com/jawah/charset_normalizer) - 93 encodings, 2x faster than chardet
- [Telegram Bot API](https://core.telegram.org/bots/api) - sendMessage endpoint
- [Loguru GitHub](https://github.com/Delgan/loguru) - serialize=True, custom sinks, file rotation

### Secondary (MEDIUM confidence)
- [Polars GitHub Issue #25423](https://github.com/pola-rs/polars/issues/25423) - scan_csv encoding limitation confirmed
- [Polars GitHub Issue #4425](https://github.com/pola-rs/polars/issues/4425) - Encoding support history
- [Transfer Gov Paineis Gerenciais](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/paineis-gerenciais) - Panel access points, SERPRO hosting
- [APScheduler PyPI](https://pypi.org/project/APScheduler/) - Version 3.11.2 confirmed
- [charset-normalizer PyPI](https://pypi.org/project/charset-normalizer/) - Version 3.4.3 confirmed

### Tertiary (LOW confidence)
- Transfer Gov exact download mechanism - needs validation during implementation
- Exact column names in Transfer Gov exports - needs validation with actual files
- Whether authentication is required for specific data views - conflicting signals from PROJECT.md vs REQUIREMENTS.md

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified via PyPI and official docs; compatibility confirmed
- Architecture: HIGH - Patterns from official docs (SQLAlchemy, Playwright, APScheduler); validated against project-level research
- Pitfalls: HIGH - Verified against official GitHub issues (Polars encoding, APScheduler duplication) and documentation
- Code examples: HIGH - All examples use verified API signatures from official documentation
- Transfer Gov specifics: LOW - Site-specific details need runtime validation during implementation

**Research date:** 2026-02-04
**Valid until:** 2026-03-06 (30 days -- stack is stable, Transfer Gov site structure may change)

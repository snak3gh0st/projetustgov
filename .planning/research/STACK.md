# Stack Research

**Domain:** Web Scraping / ETL Automation for Government Data
**Researched:** 2026-02-04
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Python** | 3.11+ | Primary language | Industry standard for ETL/scraping (51% developer adoption). Mature ecosystem, excellent library support, production-proven. 3.11+ offers 10-60% performance improvements over 3.10. |
| **Playwright** | 1.58.0 | Browser automation | Modern, fast, reliable. Direct browser protocol (vs WebDriver). Auto-downloads browser binaries. 80x faster environment setup than Selenium. Production-ready with native Python async support. Microsoft-backed. |
| **Polars** | 2.x (latest) | Data processing | 5-10x faster than Pandas for ETL workloads. 30-60% less memory usage. Rust-based with lazy evaluation. Perfect for complex CSV/Excel relationships. PyArrow-powered. |
| **SQLAlchemy** | 2.0+ | ORM/Database layer | Industry standard Python ORM. Full ACID guarantee support. Async-ready, type-hinted. Works seamlessly with PostgreSQL via psycopg3. Battle-tested in production. |
| **PostgreSQL** | 15+ | Relational database | Rock-solid ACID compliance. Zero data loss tolerance met. Free, open-source. Excellent Python ecosystem support. |
| **Pydantic** | 2.13+ | Data validation | Rust-core validation (fastest available). Type-safe schema definitions. Catches data anomalies before DB insertion. 100% type-hinted. Production standard. |
| **Loguru** | 0.7+ | Logging/monitoring | Zero-config production logging. Automatic JSON output. Exception catching built-in. Faster than stdlib logging. Most user-friendly API for reliability monitoring. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **openpyxl** | 3.1.4+ | Excel file parsing | Default engine for .xlsx/.xlsm files. Auto-used by Pandas/Polars. Essential for government Excel reports. |
| **tenacity** | 8.5+ | Retry logic | Exponential backoff for network failures. Handles transient site errors gracefully. Critical for production reliability—prevents single-point failures. |
| **python-dotenv** | 1.0+ | Configuration management | Load credentials from .env files. 12-factor app compliance. Keeps secrets out of code. Standard for local dev + production env vars. |
| **APScheduler** | 3.11+ | Cron scheduling | Pure Python scheduler. Cron-style syntax (e.g., "0 9 * * *"). Persistent job store for restart resilience. Lightweight alternative to Airflow for single-task automation. |
| **psycopg** (psycopg3) | 3.x | PostgreSQL driver | Async-ready. Auto-used by SQLAlchemy 2.0+. Faster than psycopg2. Native prepared statements for security. |
| **pytest** | 8.x | Testing framework | Industry standard (80% of data engineering teams). Essential for scraper reliability. Mock external dependencies with `responses` or `requests-mock`. |
| **responses** / **requests-mock** | Latest | HTTP mocking | Test scrapers without hitting real sites. `responses` is simpler; `requests-mock` has better pytest integration. Both prevent flaky tests. |
| **uv** | Latest | Package/environment manager | 80x faster than venv, 10x faster than Poetry. Manages Python versions automatically. Rust-based. Emerging as 2026 standard. Use for speed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Docker** | Containerization | Multi-stage builds reduce image size 70%+. Use `-slim` base images. Essential for Railway/Oracle Cloud deployment. Ensures dev/prod parity. |
| **pytest-playwright** | Browser testing | Official Playwright pytest plugin. Auto-fixtures for browser contexts. Enables test-driven scraper development. |
| **Ruff** | Linting + formatting | Rust-based, 10-100x faster than pylint/black. Replaces 6+ tools. Auto-fix most issues. Same team as `uv` (Astral). |
| **mypy** | Static type checking | Catch type errors pre-runtime. Essential with Pydantic models. Prevents production bugs from schema mismatches. |

## Installation

```bash
# Install uv (modern package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create project with Python 3.11+
uv init --python 3.11
cd your-project

# Core dependencies
uv add playwright polars sqlalchemy pydantic loguru
uv add python-dotenv tenacity apscheduler psycopg[binary]

# Excel/CSV parsing
uv add openpyxl

# Development dependencies
uv add --dev pytest pytest-playwright responses ruff mypy

# Install Playwright browsers (one-time setup)
playwright install chromium
```

**Alternative using Poetry (if team prefers):**
```bash
poetry add playwright polars sqlalchemy[asyncio] pydantic loguru
poetry add python-dotenv tenacity apscheduler psycopg[binary] openpyxl
poetry add --group dev pytest pytest-playwright responses ruff mypy
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Playwright** | Selenium | Enterprise legacy systems with 10+ year Selenium investment. Java-heavy orgs with JUnit/TestNG. Otherwise, Playwright is superior (faster, simpler, more reliable). |
| **Polars** | Pandas | Small datasets (<1M rows). Heavy integration with scikit-learn/matplotlib. For 4-file daily ETL with relationships, Polars' speed/memory wins. |
| **Polars** | DuckDB | SQL-first workflows. Analytical queries on GB+ data. DuckDB shines for ad-hoc SQL; Polars better for programmatic transformations. |
| **SQLAlchemy** | Raw psycopg3 | Microservices with 1-2 tables. Otherwise, ORM saves massive dev time and prevents SQL injection. |
| **APScheduler** | Apache Airflow | Multi-job DAGs, team orchestration, complex dependencies. Overkill for single daily 9am job. APScheduler is 90% simpler. |
| **uv** | Poetry | Publishing libraries to PyPI. Teams deeply invested in Poetry workflows. uv is faster but Poetry has mature plugin ecosystem. |
| **Loguru** | Structlog | When you need custom log processors or OpenTelemetry integration. Loguru is 95% sufficient for monitoring. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Scrapy** | Overkill for 4-file download task. Built for massive crawling (1000s of pages). Steep learning curve vs Playwright. | Playwright + Polars |
| **Beautiful Soup** | Cannot handle JavaScript-rendered content (government sites often use JS frameworks). Static parsing only. | Playwright (handles JS) |
| **Selenium** | Slower than Playwright (legacy WebDriver protocol). Requires manual browser driver management. Complex API. | Playwright |
| **Pandas** | 5-10x slower than Polars on ETL workloads. 2-3x more memory usage. No lazy evaluation. Becomes bottleneck with Excel parsing. | Polars |
| **csv module** | Manual parsing brittle with complex Excel relationships. No type inference. Error-prone. | Polars' read_excel/read_csv |
| **requests** | Cannot handle authenticated government portals with JavaScript navigation. Static downloads only. | Playwright (full browser) |
| **Celery** | Distributed task queue overkill for single scheduled job. Requires Redis/RabbitMQ broker. Complex deployment. | APScheduler |
| **cron** | No Python-level monitoring/logging. Harder to test locally. Environment variable handling fragile. | APScheduler (Python-native) |
| **Pipenv** | Abandoned by maintainers. Slow dependency resolution. Community moved to Poetry/uv. | uv or Poetry |

## Stack Patterns by Variant

**If government site requires complex multi-step authentication (e.g., 2FA, CAPTCHAs):**
- Add `playwright-stealth` to avoid bot detection
- Store session cookies with `playwright` context persistence
- Consider manual cookie extraction + `httpx` for subsequent downloads (faster)
- Rationale: Full browser automation expensive; hybrid approach optimizes performance

**If data volume grows beyond 4 files (future scaling):**
- Switch APScheduler → Apache Airflow
- Add DuckDB for analytical queries alongside PostgreSQL
- Because: Airflow's DAG model shines with 5+ dependent tasks; DuckDB handles OLAP workloads

**If deploying to Oracle Cloud Free Tier:**
- Use ARM64-compatible Docker images (`--platform linux/arm64`)
- Install PostgreSQL manually on compute instance (no managed DB in free tier)
- Limit memory usage with Polars' streaming mode (`scan_csv().sink_parquet()`)
- Because: Free tier is 1 OCPU ARM VM; must optimize for resource constraints

**If deploying to Railway:**
- Use Railway's built-in PostgreSQL add-on (managed)
- Configure APScheduler with `PostgreSQLJobStore` for persistence
- Set resource limits in `railway.toml` (RAM < 512MB for $5/mo tier)
- Because: Railway auto-provisions managed PostgreSQL; scheduler persistence prevents job loss on restart

**If site structure changes frequently (high maintenance risk):**
- Write pytest tests with mocked HTML responses
- Use CSS selectors over XPath (more robust to HTML changes)
- Add Pydantic validation to catch schema drift early
- Set up daily test runs with expected data samples
- Because: Government sites change without notice; tests catch breakage before client reports it

**If client needs real-time alerting on failures:**
- Add `Loguru` → Sentry integration (`pip install sentry-sdk`)
- Configure `tenacity` to log exhausted retries to Sentry
- Because: Loguru's exception catching + Sentry = instant Slack/email alerts

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| SQLAlchemy 2.0+ | psycopg 3.x | Use `postgresql+psycopg://` connection string (not `psycopg2`). Async requires `psycopg[binary,pool]`. |
| Playwright 1.58+ | Python 3.8-3.14 | Python 3.14 support added in Jan 2026. Use `playwright install` after pip install. |
| Polars 2.x | PyArrow 15+ | PyArrow auto-installed. If using with Pandas, ensure Pandas 2.0+ for Arrow interop. |
| Pydantic 2.13+ | Python 3.9+ | Breaking changes from Pydantic 1.x. Rust-core requires compiled binaries (slower first install). |
| uv | Python 3.8+ | Manages any Python version 3.8-3.14. Auto-downloads interpreters. No version conflicts. |
| APScheduler 3.11 | SQLAlchemy 1.4 or 2.0+ | For persistent job stores. APScheduler 4.0 (beta) has async rewrite—wait for stable release. |

## Infrastructure Recommendations

### PostgreSQL Schema Design
```python
# Use SQLAlchemy declarative models with explicit relationships
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from datetime import datetime

class Base(DeclarativeBase):
    pass

class ExtractLog(Base):
    """Track daily extraction runs"""
    __tablename__ = "extract_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_date: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    status: Mapped[str]  # 'success', 'failed', 'partial'
    error_message: Mapped[str | None]

class Entity(Base):
    """Main entity table (adjust to your domain)"""
    __tablename__ = "entities"
    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(unique=True)  # ID from Excel
    # ... other fields
    extract_log_id: Mapped[int] = mapped_column(ForeignKey("extract_logs.id"))
```

### Deployment Pattern (Docker Multi-Stage)
```dockerfile
# Build stage
FROM python:3.11-slim AS builder
WORKDIR /app
RUN pip install uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Production stage
FROM python:3.11-slim
WORKDIR /app
# Install Playwright browsers
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.venv /app/.venv
COPY . .
RUN .venv/bin/playwright install chromium --with-deps
ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "src/main.py"]
```

### Monitoring Stack
```python
# Configure Loguru for production JSON logging
from loguru import logger
import sys

logger.remove()  # Remove default handler
logger.add(
    sys.stderr,
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
    level="INFO",
    serialize=True,  # Output JSON for log aggregators
)

# Add file rotation
logger.add(
    "logs/app_{time:YYYY-MM-DD}.log",
    rotation="500 MB",
    retention="30 days",
    compression="zip",
)
```

## Error Handling Strategy

### Network Resilience (Tenacity)
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from playwright.sync_api import TimeoutError

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    retry=retry_if_exception_type(TimeoutError),
)
def navigate_to_panel(page):
    page.goto("https://transferegov.br/panel")
    page.wait_for_load_state("networkidle")
```

### Data Validation (Pydantic)
```python
from pydantic import BaseModel, field_validator
from datetime import date

class TransferRecord(BaseModel):
    transfer_id: str
    amount: float
    date: date

    @field_validator('amount')
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError('Amount must be positive')
        return v

# Catches schema drift before DB insertion
try:
    record = TransferRecord(**raw_excel_row)
except ValidationError as e:
    logger.error(f"Schema validation failed: {e}")
    # Alert/skip/retry logic
```

## Cost Analysis (Oracle Free Tier vs Railway)

| Factor | Oracle Cloud Free Tier | Railway |
|--------|------------------------|---------|
| **Compute** | Always Free: 1 OCPU ARM | $5/mo base + usage |
| **PostgreSQL** | Self-managed (install on VM) | Managed ($5/mo included) |
| **Storage** | 20 GB block + object storage | 5 GB included |
| **Network** | 10 TB/month egress | Varies by usage |
| **Effort** | High (manual setup) | Low (auto-provisioned) |
| **Uptime SLA** | None (free tier) | 99.9% |
| **Recommendation** | Use if budget = $0 AND you have sysadmin skills | Use for faster deployment + managed DB |

**Verdict:** Railway for "ASAP" delivery (client urgency). Oracle Free Tier for long-term cost savings if you can handle 1-2 day setup.

## Testing Strategy

### Unit Tests (Scrapers)
```python
import pytest
from responses import RequestsMock

@pytest.fixture
def mock_government_page():
    with open("tests/fixtures/panel.html") as f:
        return f.read()

def test_extract_download_links(mock_government_page):
    # Mock Playwright page response
    links = extract_links_from_html(mock_government_page)
    assert len(links) == 4
    assert all(link.endswith('.xlsx') for link in links)
```

### Integration Tests (Database)
```python
@pytest.fixture
def db_session():
    # Use in-memory SQLite for fast tests
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    yield Session()

def test_load_transfers(db_session, sample_excel_data):
    load_data_to_db(sample_excel_data, db_session)
    count = db_session.query(Transfer).count()
    assert count == 100  # Expected row count
```

### End-to-End Tests
```python
@pytest.mark.e2e
def test_full_pipeline(test_credentials):
    """Runs against staging environment weekly"""
    result = run_daily_extraction(test_credentials)
    assert result.status == "success"
    assert result.records_inserted > 0
```

## Security Considerations

1. **Credential Management**
   - Store Transfer Gov credentials in `.env` (local) or environment variables (production)
   - Never commit `.env` to git (`git secret` or `sops` for shared secrets)
   - Use Railway's environment variable UI or Oracle Cloud Vault

2. **SQL Injection Prevention**
   - SQLAlchemy ORM prevents SQL injection by default
   - Never use raw SQL with f-strings; use bound parameters

3. **Browser Security**
   - Run Playwright in non-headless mode for debugging only
   - Use `--disable-blink-features=AutomationControlled` if site has bot detection
   - Store session cookies encrypted (never plaintext)

4. **Dependency Scanning**
   - Run `safety check` (pip install safety) weekly
   - Use Dependabot/Renovate for automated dependency updates
   - Pin major versions in `pyproject.toml` (e.g., `polars = "^2.0"`)

## Migration Path (If Requirements Change)

### Scaling to Multi-Site Scraping
- **Current:** Single Transfer Gov site
- **If scaling to 5+ sites:**
  - Add `Scrapy` for distributed crawling
  - Switch to `Airflow` for multi-DAG orchestration
  - Use `Prefect` if team prefers Python-first workflow engine

### Real-Time Streaming (vs Daily Batch)
- **Current:** Daily 9am batch
- **If client needs hourly/real-time:**
  - Add `Apache Kafka` + `Faust` (stream processing)
  - Replace APScheduler with `Celery Beat` for minute-level scheduling
  - Use `DBT` for incremental transformations

## Sources

### Web Scraping & Browser Automation
- [Best Open-Source Web Scraping Libraries in 2026](https://www.firecrawl.dev/blog/best-open-source-web-scraping-libraries) — Playwright vs Selenium comparison
- [7 Best Python Web Scraping Libraries for 2026](https://www.scrapingbee.com/blog/best-python-web-scraping-libraries/) — Library landscape
- [Playwright vs. Selenium for web scraping](https://blog.apify.com/playwright-vs-selenium/) — Performance benchmarks
- [Playwright vs Selenium 2025 Comparison](https://www.browserless.io/blog/playwright-vs-selenium-2025-browser-automation-comparison) — Architecture differences
- [Playwright Python Release Notes](https://playwright.dev/python/docs/release-notes) — Version 1.58.0 confirmation
- [playwright · PyPI](https://pypi.org/project/playwright/) — Official package

### ETL & Data Processing
- [10 Best Python ETL Tools to Learn in 2026](https://airbyte.com/top-etl-tools-for-sources/python-etl-tools) — ETL tool landscape
- [Building an ETL Pipeline in Python](https://www.integrate.io/blog/building-an-etl-pipeline-in-python/) — Best practices
- [The Ultimate Guide to Data Transformation ETL/ELT Pipelines in Python](https://www.mage.ai/blog/the-ultimate-guide-to-data-transformation-etl-elt-pipelines-in-python) — Modern patterns
- [Python Data Processing 2026: Pandas, Polars, and DuckDB](https://dev.to/dataformathub/python-data-processing-2026-deep-dive-into-pandas-polars-and-duckdb-2c1) — Performance comparison
- [Pandas vs Polars Benchmarking](https://pipeline2insights.substack.com/p/pandas-vs-polars-benchmarking-dataframe) — 5-10x speed improvements

### Database & ORM
- [How Python Talks to PostgreSQL](https://leapcell.io/blog/python-postgres-psycopg-orm-guide) — psycopg3 + SQLAlchemy
- [SQLAlchemy 2.0 PostgreSQL Documentation](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html) — Official docs
- [Connecting PostgreSQL with SQLAlchemy](https://www.geeksforgeeks.org/connecting-postgresql-with-sqlalchemy-in-python/) — Setup guide

### Excel/CSV Parsing
- [openpyxl · PyPI](https://pypi.org/project/openpyxl/) — Version 3.1.4+
- [pandas.read_excel documentation](https://pandas.pydata.org/docs/reference/api/pandas.read_excel.html) — Pandas 2.3.3
- [Python Data Processing 2026](https://dev.to/dataformathub/python-data-processing-2026-deep-dive-into-pandas-polars-and-duckdb-2c1) — PyArrow engine performance

### Scheduling & Automation
- [Python Job Scheduling: Methods and Overview in 2026](https://research.aimultiple.com/python-job-scheduling/) — Scheduler comparison
- [APScheduler · PyPI](https://pypi.org/project/APScheduler/) — Version 3.11.2
- [Job Scheduling With Flask, Python APScheduler](https://www.redwood.com/article/job-scheduling-with-flask/) — Production patterns
- [APScheduler GitHub](https://github.com/agronholm/apscheduler) — v4.0 development status

### Logging & Monitoring
- [Logging in Python: A Comparison of the Top 6 Libraries](https://betterstack.com/community/guides/logging/best-python-logging-libraries/) — Loguru vs Structlog
- [Production-Grade Python Logging with Loguru](https://www.dash0.com/guides/python-logging-with-loguru) — Production setup
- [Python Logging with Structlog Guide](https://betterstack.com/community/guides/logging/structlog/) — Structured logging

### Error Handling & Resilience
- [How to Retry Failed Python Requests [2026]](https://www.zenrows.com/blog/python-requests-retry) — Tenacity patterns
- [Tenacity GitHub](https://github.com/jd/tenacity) — Official library
- [Python Retry Logic with Tenacity](https://python.useinstructor.com/concepts/retrying/) — Exponential backoff

### Data Validation
- [Welcome to Pydantic](https://docs.pydantic.dev/latest/) — Version 2.13+ docs
- [pydantic · PyPI](https://pypi.org/project/pydantic/) — Official package
- [Pydantic GitHub Releases](https://github.com/pydantic/pydantic/releases) — Rust-core validation

### Environment & Package Management
- [Poetry vs UV 2025 Comparison](https://medium.com/@hitorunajp/poetry-vs-uv-which-python-package-manager-should-you-use-in-2025-4212cb5e0a14) — 80x speed improvement
- [Poetry versus uv](https://www.loopwerk.io/articles/2024/python-poetry-vs-uv/) — Python version management
- [python-dotenv · PyPI](https://pypi.org/project/python-dotenv/) — Configuration management
- [python-dotenv GitHub](https://github.com/theskumar/python-dotenv) — 12-factor app compliance

### Docker & Deployment
- [Docker Multi-Stage Builds Documentation](https://docs.docker.com/get-started/docker-concepts/building-images/multi-stage-builds/) — Official guide
- [Docker Best Practices for Python Developers](https://testdriven.io/blog/docker-best-practices/) — Production patterns
- [Docker in 2026: Innovations and Best Practices](https://medium.com/devops-ai-decoded/docker-in-2026-top-10-must-see-innovations-and-best-practices-for-production-success-30a5e090e5d6) — 2026 trends
- [Multi-stage builds for Python](https://pythonspeed.com/articles/multi-stage-docker-python/) — Image optimization

### Testing
- [Building Reliable Python Scrapers with Pytest](https://laerciosantanna.medium.com/mastering-web-scraping-a-guide-to-crafting-reliable-python-scrapers-with-pytest-1d45db7af92b) — Testing strategies
- [Unit Testing Web Scrapers](https://johal.in/unit-testing-web-scrapers-beautifulsoup-and-selenium-automation-with-pytest-assertions/) — Mocking patterns
- [Testing APIs with PyTest: Mocks in Python](https://codilime.com/blog/testing-apis-with-pytest-mocks-in-python/) — Best practices

### Infrastructure
- [Railway Pricing 2026](https://railway.com/pricing) — No free tier, $5/mo minimum
- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) — Always Free limits
- [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) — Resource details
- [Installing Postgres on Oracle Cloud Always Free](https://medium.com/@ste.tuveri/finally-how-to-install-postgres-on-oracle-cloud-always-free-it-works-5c7afb741e46) — Manual setup guide

---
*Stack research for: Web Scraping / ETL Automation (Transfer Gov Brazilian Government Platform)*
*Researched: 2026-02-04*
*Confidence: HIGH (all versions verified via web search, not training data)*

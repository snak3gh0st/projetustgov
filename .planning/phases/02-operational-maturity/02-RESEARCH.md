---
phase: 02-operational-maturity
researcher: gsd-phase-researcher
model: sonnet
started: 2026-02-05
---

# Phase 2 Research: Operational Maturity

## Research Questions

1. Email alerting options for Python ETL pipelines
2. Configuration management patterns (YAML)
3. Data lineage tracking approaches
4. Reconciliation check patterns
5. Dry-run mode implementation
6. Monitoring best practices for scheduled ETL

---

## Email Alerting Options

### Option 1: SMTP Direct

**Pros:**
- No external dependencies
- Free, full control
- Works with any SMTP server (Gmail, SendGrid, self-hosted)

**Cons:**
- More setup code
- Need SMTP credentials
- Less reliable than managed service

**Implementation:**
```python
import smtplib
from email.mime.text import MIMEText

def send_email(subject, body, to_email):
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = SMTP_FROM
    msg['To'] = to_email
    
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
```

### Option 2: SendGrid / Mailgun

**Pros:**
- Reliable, managed service
- Easy API
- Good deliverability

**Cons:**
- Requires API key
- Cost at scale
- External dependency

**Implementation:**
```python
import httpx

def send_via_sendgrid(subject, body, to_email):
    response = httpx.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={"Authorization": f"Bearer {SENDGRID_API_KEY}"},
        json={
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": "alerts@projetus.com"},
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}]
        }
    )
    response.raise_for_status()
```

### Recommendation

**Use SMTP with Gmail App Password** for MVP:
- Zero cost
- Easy setup (app password)
- Reliable enough for monitoring alerts
- Can migrate to SendGrid later if volume increases

---

## Configuration Management (YAML)

### Pattern: External YAML + Pydantic Validation

**File: config.yaml**
```yaml
# Monitoring
alerting:
  telegram:
    enabled: true
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"
  email:
    enabled: true
    smtp_host: "${EMAIL_SMTP_HOST}"
    smtp_port: 587
    from: alerts@projetus.com
    to:
      - tito@projetus.com
      - philipe@projetus.com

# Reconciliation
reconciliation:
  volume_tolerance_percent: 10
  alert_on_mismatch: true

# Extraction
extraction:
  hour: 9
  timezone: America/Sao_Paulo
  files:
    - name: propostas
      required_columns:
        - id
        - titulo
        - valor
    - name: apoiadores
      required_columns:
        - id
        - proposta_id

# Data lineage
lineage:
  enabled: true
  track_pipeline_version: true
```

### Loading with Pydantic

```python
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from functools import lru_cache
import yaml
from pathlib import Path

class AlertingConfig(BaseModel):
    telegram: dict
    email: dict

class ReconciliationConfig(BaseModel):
    volume_tolerance_percent: int = 10
    alert_on_mismatch: bool = True

class ExtractionFileConfig(BaseModel):
    name: str
    required_columns: list[str]

class ExtractionConfig(BaseModel):
    hour: int
    timezone: str
    files: list[ExtractionFileConfig]

class LineageConfig(BaseModel):
    enabled: bool = True
    track_pipeline_version: bool = True

class AppConfig(BaseModel):
    alerting: AlertingConfig
    reconciliation: ReconciliationConfig
    extraction: ExtractionConfig
    lineage: LineageConfig

@lru_cache()
def load_config(config_path: Path = Path("config.yaml")) -> AppConfig:
    with open(config_path) as f:
        raw = yaml.safe_load(f)
    
    # Handle env var substitution
    raw = substitute_env_vars(raw)
    
    return AppConfig(**raw)
```

### Environment Variable Substitution

```python
import re
import os

def substitute_env_vars(obj):
    if isinstance(obj, str):
        # Match ${VAR_NAME} pattern
        return re.sub(r'\$\{([^}]+)\}', 
                      lambda m: os.getenv(m.group(1), m.group(0)), 
                      obj)
    elif isinstance(obj, dict):
        return {k: substitute_env_vars(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_env_vars(item) for item in obj]
    return obj
```

---

## Data Lineage Tracking

### Database Schema Addition

```sql
-- Add to extraction_logs table
ALTER TABLE extraction_logs ADD COLUMN IF NOT EXISTS source_file VARCHAR(255);
ALTER TABLE extraction_logs ADD COLUMN IF NOT EXISTS pipeline_version VARCHAR(50);
ALTER TABLE extraction_logs ADD COLUMN IF NOT EXISTS row_counts JSONB;
ALTER TABLE extraction_logs ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
```

### Per-Record Lineage

**Option 1: Shadow Columns (Simple)**

Add columns to each entity table:
```sql
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS source_file VARCHAR(255);
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMP;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS pipeline_version VARCHAR(50);
```

**Pros:** Simple, direct queries
**Cons:** Schema pollution, storage overhead

**Option 2: Separate Lineage Table (Recommended)**

```sql
CREATE TABLE IF NOT EXISTS data_lineage (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'proposta', 'apoiador', etc.
    entity_id VARCHAR(100) NOT NULL,
    source_file VARCHAR(255),
    extraction_timestamp TIMESTAMP,
    pipeline_version VARCHAR(50),
    record_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_data_lineage_entity ON data_lineage(entity_type, entity_id);
CREATE INDEX ix_data_lineage_source ON data_lineage(source_file);
```

**Pros:** Clean schema, flexible querying
**Cons:** Join required for lineage lookups

### Pipeline Version Tracking

```python
# src/monitor/lineage.py
from functools import lru_cache
from importlib.metadata import version

@lru_cache()
def get_pipeline_version() -> str:
    try:
        return version("projetus")
    except:
        return "dev"

def record_lineage(records: list[dict], source_file: str, pipeline_version: str = None):
    """Record lineage for batch of records."""
    import hashlib
    import json
    
    pipeline_version = pipeline_version or get_pipeline_version()
    
    lineage_entries = []
    for record in records:
        entity_type = record.get("_entity_type")
        entity_id = record.get("id") or record.get("transfer_gov_id")
        record_hash = hashlib.sha256(
            json.dumps(record, sort_keys=True).encode()
        ).hexdigest()
        
        lineage_entries.append({
            "entity_type": entity_type,
            "entity_id": entity_id,
            "source_file": source_file,
            "extraction_timestamp": "NOW()",
            "pipeline_version": pipeline_version,
            "record_hash": record_hash
        })
    
    return lineage_entries
```

---

## Reconciliation Checks

### Pattern: Source vs DB Comparison

```python
# src/monitor/reconciliation.py
from sqlalchemy import text
from typing import NamedTuple

class ReconciliationResult(NamedTuple):
    source_count: int
    db_count: int
    match: bool
    discrepancy: int | None

def reconcile_file(source_file: str, entity_type: str) -> ReconciliationResult:
    """Compare source file row count with DB insert count."""
    
    # Get source file row count
    source_count = count_source_rows(source_file)
    
    # Get DB count for this extraction
    db_count = query_db_count(entity_type, source_file)
    
    discrepancy = source_count - db_count
    
    return ReconciliationResult(
        source_count=source_count,
        db_count=db_count,
        match=discrepancy == 0,
        discrepancy=abs(discrepancy) if discrepancy != 0 else None
    )

def count_source_rows(file_path: str) -> int:
    """Count rows in source file."""
    import polars as pl
    df = pl.read_excel(file_path)
    return len(df)

def query_db_count(entity_type: str, source_file: str) -> int:
    """Count records in DB from this source file."""
    from sqlalchemy.orm import Session
    from src.loader.database import engine
    
    with Session(engine) as session:
        result = session.execute(
            text(f"SELECT COUNT(*) FROM {entity_type} WHERE source_file = :file"),
            {"file": source_file}
        )
        return result.scalar()
```

### Volume Anomaly Detection

```python
def check_volume_anomaly(
    current_count: int,
    previous_count: int,
    tolerance_percent: float = 10
) -> tuple[bool, str]:
    """Check if current volume differs significantly from previous."""
    
    if previous_count == 0:
        if current_count == 0:
            return True, "No records extracted (same as previous)"
        return False, f"Volume spike: {current_count} vs 0 previously"
    
    change_percent = abs(current_count - previous_count) / previous_count * 100
    
    if change_percent > tolerance_percent:
        return False, (
            f"Volume anomaly detected: {change_percent:.1f}% change "
            f"({previous_count} → {current_count})"
        )
    
    return True, f"Volume normal: {change_percent:.1f}% change"
```

### Scheduler Health Check

```python
def check_scheduler_health(expected_hour: int = 9) -> tuple[bool, str]:
    """Verify scheduler ran at expected time."""
    
    from datetime import datetime, timedelta
    from src.loader.database import get_last_extraction
    
    last_extraction = get_last_extraction()
    
    if not last_extraction:
        return False, "No extraction records found"
    
    last_time = last_extraction.timestamp
    expected_date = datetime.now().date() - timedelta(days=1)
    
    # Check if extraction ran yesterday (or today if after extraction time)
    if last_time.date() < expected_date:
        return False, (
            f"Scheduler miss: Last extraction was {last_time.date()}, "
            f"expected by {expected_date}"
        )
    
    return True, f"Scheduler healthy: Last ran at {last_time}"
```

---

## Dry-Run Mode Implementation

### Pattern: Preview Without DB Write

```python
# src/orchestrator/dry_run.py
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

@dataclass
class DryRunResult:
    file_path: str
    entities_found: dict[str, int]
    validation_errors: list[str]
    relationships_found: list[str]
    warnings: list[str]

def run_dry_run(
    raw_data_dir: Path = Path("data/raw"),
    config_path: Path = Path("config.yaml")
) -> DryRunResult:
    """
    Run extraction pipeline without writing to database.
    Validates everything, reports findings.
    """
    
    result = DryRunResult(
        file_path=str(raw_data_dir),
        entities_found={},
        validation_errors=[],
        relationships_found=[],
        warnings=[]
    )
    
    # 1. List available files
    files = list(raw_data_dir.glob("*.xlsx")) + list(raw_data_dir.glob("*.csv"))
    
    if not files:
        result.warnings.append("No files found in raw data directory")
        return result
    
    # 2. Parse and validate each file
    for file in sorted(files):
        entity_type = infer_entity_type(file.name)
        
        try:
            df = parse_file(file)
            result.entities_found[entity_type] = len(df)
            
            # Validate
            errors = validate_dataframe(df, entity_type)
            result.validation_errors.extend(
                f"{file.name}: {e}" for e in errors
            )
            
        except Exception as e:
            result.validation_errors.append(f"{file.name}: Parse error - {e}")
    
    # 3. Check relationships
    if "propostas" in result.entities_found and "apoiadores" in result.entities_found:
        result.relationships_found.append("propostas ↔ apoiadores (proposta_id)")
    
    if "propostas" in result.entities_found and "emendas" in result.entities_found:
        result.relationships_found.append("propostas ↔ emendas (proposta_id)")
    
    return result

def print_dry_run_report(result: DryRunResult):
    """Pretty print dry run results."""
    print("\n" + "=" * 60)
    print(" DRY RUN REPORT")
    print("=" * 60)
    
    print("\n📊 Entities Found:")
    for entity, count in result.entities_found.items():
        print(f"   {entity}: {count} records")
    
    if result.relationships_found:
        print("\n🔗 Relationships Detected:")
        for rel in result.relationships_found:
            print(f"   • {rel}")
    
    if result.validation_errors:
        print("\n⚠️  Validation Errors:")
        for error in result.validation_errors:
            print(f"   • {error}")
    
    if result.warnings:
        print("\n💡 Warnings:")
        for warning in result.warnings:
            print(f"   • {warning}")
    
    print("\n" + "=" * 60)
```

### CLI Entry Point

```python
# src/cli.py
import click
from pathlib import Path

@click.command()
@click.option(
    "--dry-run",
    is_flag=True,
    help="Run without writing to database"
)
@click.option(
    "--config",
    type=Path,
    default=Path("config.yaml"),
    help="Path to config file"
)
def main(dry_run: bool, config: Path):
    if dry_run:
        result = run_dry_run(config_path=config)
        print_dry_run_report(result)
        return
    
    # Normal run
    from src.orchestrator import run_pipeline
    run_pipeline(config)
```

---

## Monitoring Best Practices for ETL

### Alert Severity Levels

| Severity | Trigger | Example |
|----------|---------|---------|
| **CRITICAL** | Pipeline fails | Connection timeout, validation failure |
| **WARNING** | Anomaly detected | Volume drop >10%, missing expected file |
| **INFO** | Normal operation | Successful extraction with stats |

### Health Check Endpoint

```python
# src/api/health.py
from fastapi import APIRouter
from datetime import datetime
from src.loader.database import get_last_extraction

router = APIRouter()

@router.get("/health")
def health_check():
    """Return health status for monitoring systems."""
    
    last_extraction = get_last_extraction()
    
    if not last_extraction:
        return {
            "status": "unhealthy",
            "last_extraction": None,
            "message": "No extraction records found"
        }
    
    hours_since = (datetime.now() - last_extraction.timestamp).total_seconds() / 3600
    
    return {
        "status": "healthy" if hours_since < 25 else "degraded",
        "last_extraction": last_extraction.timestamp.isoformat(),
        "hours_since_last": round(hours_since, 1),
        "records_extracted": last_extraction.row_counts,
        "pipeline_version": last_extraction.pipeline_version
    }
```

### Metrics to Track

```python
# src/monitor/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# Counters
EXTRACTION_COUNTER = Counter(
    'projetus_extraction_total',
    'Total extractions',
    ['status', 'entity_type']
)

# Histograms
EXTRACTION_DURATION = Histogram(
    'projetus_extraction_duration_seconds',
    'Extraction duration',
    ['phase'],
    buckets=[10, 30, 60, 120, 300]
)

# Gauges
LAST_EXTRACTION_GAUGE = Gauge(
    'projetus_last_extraction_timestamp',
    'Timestamp of last successful extraction'
)

def record_extraction_success(entity_type: str, row_count: int, duration: float):
    EXTRACTION_COUNTER.labels(status='success', entity_type=entity_type).inc()
    EXTRACTION_DURATION.labels(phase=entity_type).observe(duration)
    LAST_EXTRACTION_GAUGE.set_to_current_time()
```

---

## Railway Deployment Considerations

### Project Structure for Railway

```
projetus/
├── Railway.json          # Railway deployment config
├── Dockerfile            # Container definition
├── docker-compose.yml    # Local development
├── config.yaml           # Application config
├── .env.example          # Environment template
├── src/
│   ├── crawler/
│   ├── parser/
│   ├── transformer/
│   ├── loader/
│   ├── orchestrator/
│   ├── monitor/
│   └── api/
│       └── main.py       # FastAPI + scheduler
├── tests/
└── requirements.txt
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ src/

# Copy config
COPY config.yaml .

# Set timezone
ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Run with scheduler
CMD ["python", "-m", "src.orchestrator.scheduler"]
```

### Railway Configuration

```json
// railway.json
{
  "$schema": "https://railway.app/schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Environment Variables on Railway

```
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional - Email (Gmail App Password)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_FROM=alerts@projetus.com
EMAIL_TO=tito@projetus.com
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Optional - Monitoring
PROMETHEUS_ENABLED=false
```

---

## Don't Hand-Roll

| Don't Build | Use Instead |
|-------------|-------------|
| Email sending from scratch | Python smtplib (simple) or SendGrid API |
| Configuration parsing | Pydantic with yaml.safe_load |
| Scheduler | APScheduler (already in use) |
| YAML parsing | PyYAML or ruamel.yaml |
| Prometheus metrics | prometheus_client library |
| Health check | FastAPI's built-in /health |

---

## Common Pitfalls

### 1. Lineage Table Explosion

**Problem:** Recording lineage for every row causes table to grow very large.

**Solution:**
- Index only frequently queried columns
- Consider TTL/purging old records after audit period
- Use table partitioning by date if needed

### 2. Reconciliation False Positives

**Problem:** Reconciliation fails because of timing (not yet committed).

**Solution:**
- Use transaction commit timestamps
- Add buffer window (5-10 seconds)
- Log reconciliation results, alert only on persistent mismatches

### 3. Dry-Run Confusion

**Problem:** Users run dry-run and expect data to be saved.

**Solution:**
- Clear console output indicating DRY RUN MODE
- Add confirmation prompt before real run
- Timestamp dry-run files separately

### 4. Alert Fatigue

**Problem:** Too many alerts cause users to ignore them.

**Solution:**
- Only alert on actual problems (not every run)
- Batch similar alerts
- Different severity levels (CRITICAL vs WARNING)

---

## Research Summary

### Recommended Stack

| Component | Recommendation |
|-----------|----------------|
| Email | SMTP with Gmail App Password |
| Configuration | YAML + Pydantic validation |
| Lineage | Separate lineage table with indexes |
| Reconciliation | Source count vs DB count + anomaly detection |
| Monitoring | Telegram alerts + health check endpoint |
| Deployment | Dockerfile + Railway |

### Files to Create

1. `config.yaml` - External configuration
2. `src/config/loader.py` - Config loading with Pydantic
3. `src/monitor/alerts.py` - Telegram + email alerting
4. `src/monitor/reconciliation.py` - Reconciliation checks
5. `src/monitor/lineage.py` - Data lineage tracking
6. `src/orchestrator/dry_run.py` - Dry-run mode
7. `src/api/main.py` - FastAPI + health check + scheduler
8. `Dockerfile` - Container for Railway

---

*Research completed: 2026-02-05*

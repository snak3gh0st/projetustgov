# PROJETUS - Transfer Gov Automation Platform

**Automated ETL pipeline for Brazilian federal transfer data (Transfer.gov.br)**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

---

## Overview

PROJETUS is an enterprise-grade data pipeline that automates the extraction, transformation, and loading (ETL) of Brazilian federal government transfer data from the Transfer.gov.br platform. The system provides enriched, validated, and analysis-ready data for business intelligence and strategic decision-making.

### Key Features

- **Automated Daily Extractions** - Scheduled data collection at 9:15 AM (São Paulo timezone)
- **Comprehensive Data Coverage** - Proposals (propostas), supporters (apoiadores), amendments (emendas), programs (programas), agreements (convênios), disbursements (desembolsos)
- **Proponent Enrichment** - Automatic enrichment with contact information (email, phone) and address data (street, neighborhood, postal code)
- **Brazilian Data Validation** - Native support for Brazilian date formats (DD/MM/YYYY), currency formats (comma decimal separator), and UF state codes
- **Performance Optimized** - Batch processing with PostgreSQL bulk operations, Railway-compatible timeouts
- **Production Ready** - Health checks, metrics endpoints, scheduler monitoring, Telegram alerts

---

## Architecture

```
┌─────────────────┐
│   Transfer.gov  │
│   (Data Source) │
└────────┬────────┘
         │
         ↓
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Extractor     │─────→│   Transformer    │─────→│     Loader      │
│  (Playwright)   │      │  (Polars/Pandas) │      │  (SQLAlchemy)   │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                                             │
                                                             ↓
                                                    ┌─────────────────┐
                                                    │   PostgreSQL    │
                                                    │    (Railway)    │
                                                    └─────────────────┘
```

### Technology Stack

- **Language**: Python 3.11+
- **Web Automation**: Playwright
- **Data Processing**: Polars, Pandas
- **Database**: PostgreSQL (Railway)
- **ORM**: SQLAlchemy 2.0
- **Validation**: Pydantic 2.0
- **Scheduling**: APScheduler
- **API**: FastAPI
- **Monitoring**: Loguru, custom health checks

---

## Installation

### Prerequisites

- Python 3.11 or higher
- PostgreSQL database
- Environment variables configured (see `.env.example`)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/snak3gh0st/projetustgov.git
   cd projetustgov
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Initialize database**
   ```bash
   python -m src.loader.database
   ```

5. **Run the application**
   ```bash
   python main.py
   # or
   uvicorn src.api.main:app --host 0.0.0.0 --port 8000
   ```

---

## Usage

### Automated Daily Runs

The scheduler automatically runs the pipeline daily at 9:15 AM (São Paulo timezone). No manual intervention required.

### Manual Execution

Trigger the pipeline manually via API:
```bash
curl -X POST http://localhost:8000/run-pipeline
```

Or via Python:
```python
from src.orchestrator.pipeline import run_pipeline
run_pipeline()
```

### Health Monitoring

- **Health Check**: `GET /health` - Pipeline status and last extraction
- **Readiness Check**: `GET /ready` - Database and scheduler health
- **Metrics**: `GET /metrics` - Extraction statistics

---

## Data Model

### Core Entities

- **Proponente** - Government entities (municipalities, NGOs, institutions)
  - Fields: CNPJ, name, email, phone, address, neighborhood, postal code
  - Enriched automatically from `siconv_proponentes.csv`

- **Proposta** - Funding proposals
  - Fields: ID, title, global value, transfer amount, counterpart, dates, status

- **Emenda** - Parliamentary amendments
  - Fields: Number, author, value, type, year

- **Programa** - Federal programs
  - Fields: Name, superior agency, modality, legal nature

- **Convênio** - Agreements between entities
  - Fields: Values, dates, disbursement tracking

- **Desembolso** - Financial disbursements
  - Fields: Date, amount, SIAFI reference

### Data Lineage

All records include:
- `created_at` - Initial insertion timestamp
- `updated_at` - Last modification timestamp
- `extraction_date` - Source data extraction date

---

## Configuration

Edit `config.yaml` to customize:

```yaml
extraction:
  hour: 9           # Extraction hour (0-23)
  minute: 15        # Extraction minute (0-59)
  timezone: America/Sao_Paulo

alerting:
  telegram:
    enabled: true
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"
```

---

## Performance

### Optimization Highlights

- **Proponent Enrichment**: 100x faster with PostgreSQL `UPDATE FROM VALUES`
- **Batch Processing**: 100 records per transaction
- **Filtered Updates**: Only processes existing CNPJs (2.7k of 66k records)
- **Execution Time**: ~3 minutes for full enrichment

### Benchmark Results

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Enrichment Time | 18+ hours (timeout) | 3 minutes | 360x faster |
| Database Calls | 66,450 UPDATEs | 27 batches | 2,461x reduction |
| Data Coverage | 0% (failed) | 100% email, 94% phone | Complete |

---

## License & Copyright

**© 2024-2026 Sigma. All Rights Reserved.**

This software is proprietary and confidential. Unauthorized copying, transfer, or reproduction of this software, via any medium, is strictly prohibited.

### Terms of Use

- This software is the exclusive property of **Sigma**
- Licensed for internal use only
- No distribution, modification, or reverse engineering permitted without written authorization
- All intellectual property rights reserved

For licensing inquiries, contact: [legal@sigma.com](mailto:legal@sigma.com)

---

## Support

### Technical Support

- **Email**: support@sigma.com
- **Documentation**: [Internal Wiki](https://wiki.sigma.com/projetus)
- **Issue Tracking**: [JIRA Project](https://sigma.atlassian.net/projects/PROJ)

### Development Team

- **Lead Developer**: Paulo Loureiro
- **Organization**: Sigma
- **Project**: PROJETUS Transfer Gov Automation

---

## Changelog

### Version 1.0.0 (2026-02-09)

**Features:**
- Complete proponent enrichment with contact and address data
- Brazilian data validation (dates, currency, UF codes)
- Automated daily scheduler with health monitoring
- FastAPI health check endpoints
- Telegram alerting integration

**Performance:**
- Optimized PostgreSQL batch operations
- 100x faster enrichment processing
- Railway-compatible timeout handling

**Data Coverage:**
- Proposals, supporters, amendments, programs
- Agreements, disbursements, status history
- Enriched proponent data with 100% email coverage

---

## Acknowledgments

Built with [Playwright](https://playwright.dev/), [Polars](https://pola.rs/), [SQLAlchemy](https://www.sqlalchemy.org/), and [FastAPI](https://fastapi.tiangolo.com/).

Data source: [Transfer.gov.br](https://transferegov.gov.br/) - Brazilian Federal Government

---

**PROJETUS** - Powering data-driven decisions for Brazilian federal transfers.

© 2024-2026 Sigma. All Rights Reserved.

# PROJETUS - Transfer Gov Automation Platform & CRM

**Automated ETL pipeline + Sales CRM for Brazilian federal transfer data (Transfer.gov.br)**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

PROJETUS is an integrated platform combining:
1. **ETL Pipeline** - Enterprise-grade data pipeline that automates the extraction, transformation, and loading (ETL) of Brazilian federal government transfer data
2. **Sales CRM** - Next.js web application for managing leads, tracking contacts, and monitoring sales pipeline for government contract opportunities

The system provides enriched, validated, and analysis-ready data while enabling sales teams to efficiently qualify and pursue federal funding opportunities.

### Key Features

#### ETL Pipeline
- **Automated Daily Extractions** - Scheduled data collection at 9:15 AM (São Paulo timezone)
- **Comprehensive Data Coverage** - Proposals, supporters, amendments, programs, agreements, disbursements
- **Proponent Enrichment** - Automatic enrichment with contact information (email, phone) and address data
- **Brazilian Data Validation** - Native support for Brazilian date/currency formats and UF state codes
- **Performance Optimized** - Batch processing with PostgreSQL bulk operations, Railway-compatible timeouts
- **Production Ready** - Health checks, metrics endpoints, scheduler monitoring, Telegram alerts

#### CRM Application
- **Authentication & Authorization** - Role-based access (gestor, vendedor, visualizador) with Auth.js v5
- **Lead Management** - Automatic lead distribution, CNPJ-based assignment with duplicate detection
- **Contact Tracking** - Timeline view of all interactions (calls, emails, meetings, WhatsApp)
- **Existing Clients Protection** - Upload and manage existing clients to prevent lead assignment conflicts
- **Commission System** - Automatic commission calculation for SDR (9%) and Closer (12%) roles
- **Priority Indicators** - Highlight never-registered CNPJs for maximum opportunity potential
- **Real-time Dashboard** - Pipeline metrics, vendor performance cards, activity feed
- **Inline Editing** - Quick phone/email updates with permission-aware controls

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
                         ┌───────────────────────────────────┴──────────┐
                         │                                              │
                         ↓                                              ↓
                ┌─────────────────┐                          ┌─────────────────┐
                │   PostgreSQL    │◄─────────────────────────│   Next.js CRM   │
                │    (Railway)    │                          │    (Vercel)     │
                └─────────────────┘                          └─────────────────┘
                                                                       │
                                                                       ↓
                                                              ┌─────────────────┐
                                                              │ Users (Gestors, │
                                                              │  Vendedores)    │
                                                              └─────────────────┘
```

### Technology Stack

#### Backend (ETL Pipeline)
- **Language**: Python 3.11+
- **Web Automation**: Playwright
- **Data Processing**: Polars, Pandas
- **Database**: PostgreSQL (Railway)
- **ORM**: SQLAlchemy 2.0
- **Validation**: Pydantic 2.0
- **Scheduling**: APScheduler
- **API**: FastAPI
- **Monitoring**: Loguru, custom health checks

#### Frontend (CRM)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript, React 18
- **Authentication**: Auth.js v5 (next-auth)
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (Railway) via pg driver
- **Charts**: Recharts
- **File Processing**: xlsx (Excel parsing)
- **Password Hashing**: bcryptjs
- **Deployment**: Vercel (iad1 region)

---

## CRM Application

### Features Overview

The PROJETUS CRM is a comprehensive sales management system designed specifically for tracking government contract opportunities from TransferênciaGov data.

#### User Roles

- **Gestor (Manager)** - Full access to all features, lead distribution, team management
- **Vendedor (Salesperson)** - Access to assigned leads, contact tracking, status updates
- **Visualizador (Viewer)** - Read-only access for leadership visibility

#### Core Functionality

1. **Lead Assignment**
   - Automatic round-robin distribution to vendedores
   - CNPJ-based assignment with duplicate detection
   - Manual assignment by gestores
   - Automatic exclusion of existing clients

2. **Contact Management**
   - 5-status pipeline: Não Contatado → Contactado → Proposta → Em Retorno → Fechado
   - Contact timeline with notes (calls, emails, WhatsApp, meetings)
   - Inline editing of phone/email fields
   - Contact history tracking with timestamps

3. **Existing Clients Protection**
   - Upload existing clients from Excel (CLIENTES.xlsx)
   - Automatic deduplication using `ON CONFLICT DO NOTHING`
   - Column validation (CNPJ + ENTIDADE required)
   - Prevents vendedores from receiving leads for existing clients

4. **Commission Tracking**
   - SDR role: 9% + R$50 bonus on contract value
   - Closer role: 12% on contract value
   - Automatic calculation on lead assignment
   - Commission dashboard by status breakdown

5. **Priority System**
   - Max priority flag for never-registered CNPJs
   - Visual indicators for high-value opportunities
   - Execution count tracking from historical data

#### Access URLs

- **Production**: https://projetustgov.vercel.app
- **Upload Existing Clients**: https://projetustgov.vercel.app/upload-clientes (gestor-only)
- **Commission Dashboard**: https://projetustgov.vercel.app/comissoes

---

## Installation

### Prerequisites

- **Backend**: Python 3.11+, PostgreSQL database
- **Frontend**: Node.js 18+, npm/yarn
- Environment variables configured

### Backend Setup (ETL Pipeline)

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

### Frontend Setup (CRM)

1. **Navigate to web directory**
   ```bash
   cd web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Add DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
   ```

4. **Initialize CRM tables**
   ```bash
   # Visit /api/setup-crm endpoint to create tables and seed users
   curl http://localhost:3000/api/setup-crm
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Build for production**
   ```bash
   npm run build
   npm start
   ```

### Default Users (after setup-crm)

| Name | Email | Password | Role |
|------|-------|----------|------|
| Philipe | philipe@projetus.org | philipe123 | gestor |
| Paulo | paulo@projetus.org | paulo123 | gestor |
| Tito | tito@projetus.org | tito123 | gestor |
| Elisson | elisson@projetus.org | elisson123 | vendedor |
| Wellington | wellington@projetus.org | wellington123 | vendedor |
| Gabriel | gabriel@projetus.org | gabriel123 | vendedor |
| Vitória | vitoria@projetus.org | vitoria123 | vendedor |

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

**© 2024-2026 Sigma**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

**Key Points:**
- ✅ Free to use, modify, and distribute
- ✅ Commercial use permitted
- ✅ Open source and transparent
- ✅ Attribution required (copyright notice must be included)
- ⚠️ Provided "as is" without warranty

For more information, see the full [MIT License](LICENSE) text.

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

### Version 3.0.0 (2026-02-12) - CRM Platform

**New CRM Application:**
- Next.js 14 web application with Auth.js authentication
- Role-based access control (gestor, vendedor, visualizador)
- Lead management with CNPJ-based assignment
- Contact tracking timeline (calls, emails, WhatsApp, meetings)
- Commission system (SDR 9%, Closer 12%)
- Priority indicators for never-registered CNPJs
- Real-time dashboard with pipeline metrics

**Existing Clients Management:**
- Upload existing clients from Excel (CLIENTES.xlsx) ✨ NEW
- Automatic deduplication with `ON CONFLICT DO NOTHING`
- Column validation (CNPJ + ENTIDADE required)
- Gestor-only access with clear upload instructions
- Prevents lead assignment conflicts for existing clients

**Phase 11 Features (Lead Management):**
- Inline editing for phone/email fields
- Contact notes with timeline view
- Visualizador read-only role for leadership
- 5-status pipeline system
- Existing clients exclusion from lead distribution

**Phase 10 Features (Auth Foundation):**
- Auth.js v5 with JWT sessions
- Credentials provider with bcrypt password hashing
- Protected API routes with middleware
- Login/logout flow with role persistence

### Version 2.0.0 (2026-02-11) - Next.js Migration

**Migration:**
- Migrated from Streamlit to Next.js 14
- New PostgreSQL schema for CRM tables
- Vercel deployment (iad1 region)
- React 18 with Tailwind CSS

### Version 1.0.0 (2026-02-09) - ETL Pipeline

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

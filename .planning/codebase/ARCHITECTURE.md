# Architecture

**Analysis Date:** 2026-02-17

## Pattern Overview

**Overall:** Hybrid monolithic architecture with decoupled frontend (Next.js) and backend (Python ETL + FastAPI).

**Key Characteristics:**
- Full-stack separation: Frontend (Next.js CRM) communicates with backend via REST API
- Backend uses event-driven pipeline orchestration (scheduled ETL runs)
- Database-centric data model with application-level foreign keys
- Multi-role authorization system (gestor, vendedor, gestor_vendedor, visualizador)
- Two independent data flows: incoming enrichment pipeline and outgoing API layer

## Layers

**Presentation Layer (Frontend):**
- Purpose: Web-based CRM interface for sales team management
- Location: `web/src/app/`
- Contains: Next.js pages, components, API route handlers
- Depends on: PostgreSQL database, NextAuth for authentication
- Used by: End users (sales, management)

**API Layer (Backend Web):**
- Purpose: REST endpoints for CRM operations (leads, commissions, assignments)
- Location: `web/src/app/api/`
- Contains: Route handlers that read/write vendedor_projetos, contact_notes, commission data
- Depends on: PostgreSQL, NextAuth session management
- Used by: Frontend pages and internal cron jobs

**ETL Pipeline (Backend Python):**
- Purpose: Extract Transfer Gov data, transform, validate, and load to database
- Location: `src/orchestrator/`, `src/parser/`, `src/transformer/`, `src/loader/`
- Contains: Scheduled pipeline coordination, file parsing, data validation, upsert logic
- Depends on: File system (data/raw/), PostgreSQL database, external APIs (crawler)
- Used by: FastAPI scheduler, CLI, cron jobs

**Enrichment Engine:**
- Purpose: Enrich missing contact data (email, telefone) using BrasilAPI
- Location: `src/enrichment/`
- Contains: Contact enrichment runner, Brasil API client, rate limiting
- Depends on: PostgreSQL database, BrasilAPI external service
- Used by: Pipeline (post-ETL), API endpoints

**Data Access Layer:**
- Purpose: Database abstraction and ORM models
- Location: `src/loader/db_models.py`, `web/src/lib/db.ts`
- Contains: SQLAlchemy ORM models (Python), pg client wrapper (TypeScript)
- Depends on: PostgreSQL
- Used by: All other layers

**Configuration Management:**
- Purpose: Load environment-specific settings and secrets
- Location: `src/config/`
- Contains: YAML config loader, env variable handling
- Depends on: Environment variables, config.yaml file
- Used by: API server, pipeline, CLI

**Monitoring & Observability:**
- Purpose: Track pipeline health, logging, scheduler status
- Location: `src/monitor/`
- Contains: Health checks, metrics, alerting, logger setup
- Depends on: Loguru for structured logging
- Used by: FastAPI health endpoints, pipeline execution

## Data Flow

**1. ETL Ingestion Flow:**

1. External trigger (cron: daily at 3 AM, or manual via CLI)
2. `run_pipeline()` in `src/orchestrator/pipeline.py` starts
3. Find latest data files in `data/raw/[YYYY-MM-DD]/`
4. Parse files: `src/parser/file_parser.py` reads Excel/CSV using Polars
5. Validate schema: `src/transformer/validator.py` checks required columns
6. Transform: Extract entities, normalize values, build relationships
7. Load: `src/loader/upsert.py` upserts 11 tables using transfer_gov_id as natural key
8. Post-ETL enrichment: `src/enrichment/enrichment_runner.py` calls BrasilAPI for missing contacts
9. Log execution: `src/loader/extraction_log.py` records timestamp, row counts, status
10. Return health status for monitoring

**2. CRM Lead Assignment Flow:**

1. User (gestor) navigates to `web/src/app/distribuir/page.tsx`
2. Frontend calls `/api/leads` to fetch unassigned leads
3. API route queries `vendedor_projetos` table with role-based filtering
4. User assigns leads to vendedor(s) via modal
5. Frontend calls `/api/leads/assign` (POST)
6. API inserts `vendedor_projetos` records and creates `contact_notes` entry
7. Vendedor receives assigned leads in their dashboard

**3. Commission Calculation Flow:**

1. Manual trigger: Gestor uploads spreadsheet via `/api/import-spreadsheet`
2. Route handler parses Excel with commission data
3. Updates `vendedor_projetos.comissao_percentual`, `comissao_valor`, `comissao_bonus`
4. Frontend displays commission summary on `/comissoes` page
5. Dashboard queries aggregate commission totals and calculates payouts

**4. Contact Enrichment Flow:**

1. Query: Find proponentes missing email or telefone
2. For each missing contact (batches of 50):
   - Call BrasilAPI to look up company registration
   - Extract email/telefone from registration data
   - Update `proponentes` table with new data
   - Rate limit: 1-second delay between batches
3. Log enrichment statistics (emails added, telefones added, API errors)

**State Management:**
- Application state: Stored in PostgreSQL tables (source of truth)
- Session state: Managed by NextAuth (JWT in secure cookies)
- UI state: React local state and URL search params (no client-side store)
- Pipeline state: Extraction logs track pipeline runs and last-execution timestamp

## Key Abstractions

**Pipeline Orchestrator:**
- Purpose: Coordinate ETL workflow steps (parse, validate, load, enrich)
- Examples: `src/orchestrator/pipeline.py`, `src/orchestrator/dry_run.py`
- Pattern: Procedural orchestration with error handling and logging

**File Parser:**
- Purpose: Read Excel/CSV files with encoding detection and schema validation
- Examples: `src/parser/file_parser.py`, `src/parser/schemas.py`
- Pattern: Format detection (xlsx vs csv) → Polars read → column mapping → validation

**Upsert Logic:**
- Purpose: Idempotent database writes using transfer_gov_id as natural key
- Examples: `src/loader/upsert.py` (11 table upsert functions)
- Pattern: Check if exists by ID → update or insert, with cascade handling

**API Data Access:**
- Purpose: SQL query builders for role-based lead filtering
- Examples: `web/src/app/api/leads/route.ts` (complex dynamic WHERE conditions)
- Pattern: Build query fragments based on user role, search params, filters

**Contact Enrichment:**
- Purpose: Async data enrichment with external API rate limiting
- Examples: `src/enrichment/enrichment_runner.py`, `src/enrichment/brasil_api.py`
- Pattern: Batch processing with configurable delays and error tolerance

**Authentication & Authorization:**
- Purpose: Session management and role-based access control
- Examples: `web/src/middleware.ts`, `web/src/lib/dal.ts`, `web/src/lib/auth.ts`
- Pattern: NextAuth middleware blocks unauthenticated routes; DAL helpers enforce role checks

## Entry Points

**Web Application:**
- Location: `web/src/app/layout.tsx` (root layout)
- Triggers: User navigates to website URL
- Responsibilities: Initialize theme, auth session, render sidebar navigation

**API Server:**
- Location: `src/api/main.py` (FastAPI app)
- Triggers: Manual start or Docker container launch
- Responsibilities: Start scheduler, expose health/metrics endpoints, handle cron payloads

**CLI:**
- Location: `src/cli.py`
- Triggers: Manual command execution: `python -m src.cli [--dry-run|--api]`
- Responsibilities: Parse options, setup logging, dispatch to pipeline/API/dry-run

**Scheduled Pipeline:**
- Location: `src/api/main.py` (BackgroundScheduler in lifespan)
- Triggers: Daily cron trigger (time configured in config.yaml)
- Responsibilities: Run full ETL pipeline, trigger enrichment, log execution

**Database Migrations:**
- Location: `migrations/` directory (SQL scripts)
- Triggers: Manual execution: `python migrations/apply_indexes.py`
- Responsibilities: Create tables, indexes, constraints

## Error Handling

**Strategy:** Fail-fast with comprehensive logging and graceful degradation

**Patterns:**

- **Parser errors:** `SchemaValidationError`, `EmptyFileError` caught in pipeline, logged and skipped
- **Database errors:** Connection retries (2 attempts in `web/src/lib/db.ts`), pool reset on connection errors
- **API errors:** HTTP exception handling, role-based 401s, validation errors return 400
- **Enrichment errors:** BrasilAPI failures counted in stats, processing continues with next record
- **Pipeline errors:** Caught at top level in `_run_pipeline_job()`, logged but don't crash scheduler

## Cross-Cutting Concerns

**Logging:**
- Python: `loguru` library with structured format `YYYY-MM-DD HH:mm:ss | LEVEL | message`
- TypeScript: `console.log/error/debug` for errors in route handlers
- Centralized in `src/monitor/logger.py`

**Validation:**
- Parser schema validation: Required columns checked before processing
- Transformer validator: Data type checks, NULL handling per column rules
- API validation: Zod schemas in `web/src/lib/validations.ts`
- Database constraints: Unique indexes on transfer_gov_id, CNPJ

**Authentication:**
- NextAuth provider with database adapter (`@auth/pg-adapter`)
- Middleware redirects unauthenticated users to `/login`
- API routes check session before executing queries
- DAL helpers (`verifySession`, `getApiSession`) used consistently

**Authorization:**
- Four roles: gestor (admin), vendedor (salesperson), gestor_vendedor (manager), visualizador (read-only)
- Applied at query level: leads filtered by vendedor_id for non-admin users
- Write permissions: Only gestor, vendedor, gestor_vendedor can modify leads
- Admin-only endpoints: `/api/setup-crm`, `/api/import-spreadsheet`, `/api/commission-config`

---

*Architecture analysis: 2026-02-17*

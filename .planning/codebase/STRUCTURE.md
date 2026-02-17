# Codebase Structure

**Analysis Date:** 2026-02-17

## Directory Layout

```
/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/
├── src/                           # Python backend (ETL, API, enrichment)
│   ├── api/                       # FastAPI application
│   ├── config/                    # Configuration management
│   ├── crawler/                   # File/web crawler for Transfer Gov
│   ├── dashboard/                 # Streamlit dashboard (deprecated)
│   ├── enrichment/                # Contact enrichment engine
│   ├── loader/                    # Database ORM models & upsert logic
│   ├── monitor/                   # Health checks, alerting, logging
│   ├── orchestrator/              # Pipeline orchestration
│   ├── parser/                    # File parsing (Excel/CSV)
│   ├── transformer/               # Data validation & transformation
│   ├── cli.py                     # Command-line interface
│   └── config.py                  # Top-level config module
├── web/                           # Next.js CRM frontend
│   ├── src/
│   │   ├── app/                   # Next.js App Router pages & API routes
│   │   ├── components/            # React components
│   │   ├── lib/                   # Utilities, database, auth, types
│   │   ├── types/                 # TypeScript type definitions
│   │   └── middleware.ts          # NextAuth middleware
│   ├── public/                    # Static assets
│   └── scripts/                   # Utility scripts (migrations, syncs)
├── migrations/                    # SQL migration scripts
├── data/                          # Data directory
│   └── raw/                       # Input data files (YYYY-MM-DD subdirs)
├── logs/                          # Application logs
├── tests/                         # Test files
│   └── fixtures/                  # Test data
├── .devcontainer/                 # Dev container config
├── .streamlit/                    # Streamlit config
├── config.yaml                    # Main configuration file
├── docker-compose.yml             # Local development
├── Dockerfile                     # Production container (Python)
├── Dockerfile.railway             # Railway deployment variant
└── package.json (web/)            # Next.js dependencies
```

## Directory Purposes

**src/ - Python Backend:**
- Purpose: ETL pipeline, data processing, API server, enrichment engine
- Contains: Python modules, entry points, configuration
- Key files: `cli.py`, `api/main.py`, `orchestrator/pipeline.py`

**src/api/ - FastAPI Server:**
- Purpose: REST API for health checks, metrics, cron job handling
- Contains: `main.py` (FastAPI app with lifespan), `simple_main.py`, `minimal.py`
- Used by: Monitoring systems, internal schedulers, frontend cron calls

**src/config/ - Configuration:**
- Purpose: Load application configuration from YAML and environment variables
- Contains: `loader.py` (config parser), `__init__.py`
- Key config: Extraction schedule, database URL, API keys, logging level

**src/crawler/ - Web Scraping:**
- Purpose: Download Transfer Gov files from portal or repository
- Contains: `downloader.py`, `navigator.py`, `browser.py`, `repository_downloader.py`
- Pattern: Selenium browser control, file detection, retry logic

**src/dashboard/ - Analytics UI (Deprecated):**
- Purpose: Streamlit-based analytics dashboard (legacy, mostly replaced by Next.js CRM)
- Contains: Queries, components, pages for data exploration
- Status: Not actively maintained

**src/enrichment/ - Contact Enrichment:**
- Purpose: Enrich missing proponente contact data using external APIs
- Contains: `enrichment_runner.py` (orchestrator), `brasil_api.py` (API client), `cli.py`
- Integration: BrasilAPI for company registration lookups
- Rate limiting: Configurable batch delays to respect API quotas

**src/loader/ - Data Access & Persistence:**
- Purpose: Database ORM, models, upsert operations, audit logging
- Contains:
  - `db_models.py` - SQLAlchemy models (11 tables: programas, propostas, proponentes, etc.)
  - `upsert.py` - Idempotent write logic using transfer_gov_id as natural key
  - `database.py` - Database engine factory, session management
  - `extraction_log.py` - Pipeline execution audit trail
- Key pattern: All foreign keys are application-level (no DB constraints)

**src/monitor/ - Observability:**
- Purpose: Health monitoring, alerting, scheduler inspection, lineage tracking
- Contains: `scheduler_health.py`, `alerting.py`, `logger.py`, `volume_alerts.py`, `reconciliation.py`
- Used by: FastAPI health endpoints, alerting systems, operational dashboards

**src/orchestrator/ - Pipeline Coordination:**
- Purpose: Coordinate complete ETL workflow from file detection to database load
- Contains:
  - `pipeline.py` - Main orchestration logic (find files, parse, validate, load, enrich)
  - `dry_run.py` - Non-destructive test mode (parse and validate without writing)
- Pattern: Sequential steps with error handling at each stage

**src/parser/ - File Parsing:**
- Purpose: Read and normalize data files (Excel, CSV) with encoding detection
- Contains: `file_parser.py` (main entry point), `encoding.py`, `schemas.py`
- Pattern: Format detection → Polars read → column mapping → validation

**src/transformer/ - Data Transformation:**
- Purpose: Validate and transform raw data into database-ready format
- Contains: `validator.py` (schema checks, type conversion), `models.py` (Pydantic models)
- Key checks: Required columns, data types, NULL handling per specification

**web/ - Next.js CRM Frontend:**
- Purpose: Web-based sales CRM for lead management, assignments, commissions
- Contains: React components, API route handlers, utilities
- Framework: Next.js 14.2, React 18.3, TailwindCSS
- Auth: NextAuth 5 with database session store

**web/src/app/ - Next.js Routes:**
- Purpose: Page routes and API endpoints using Next.js App Router
- Pages:
  - `page.tsx` - Dashboard home page
  - `leads/page.tsx` - Lead list and management
  - `lead/[cnpj]/page.tsx` - Individual lead detail view
  - `comissoes/page.tsx` - Commission tracking and payouts
  - `distribuir/page.tsx` - Lead assignment interface
  - `monitoramento/page.tsx` - Pipeline monitoring
  - `bi/page.tsx` - Business intelligence analytics
  - `upload/page.tsx` - Manual data upload
  - `cadastro-vendedor/page.tsx` - Salesperson registration
  - `(auth)/login/page.tsx` - Authentication

**web/src/app/api/ - API Routes:**
- Purpose: Backend endpoints handling CRUD operations and business logic
- Key endpoints:
  - `/api/leads` (GET) - Fetch leads with filters
  - `/api/leads/assign` (POST) - Assign leads to vendedor
  - `/api/leads/[cnpj]/` (GET) - Lead detail + related data
  - `/api/leads/[cnpj]/contacts` (GET/POST) - Contact information
  - `/api/leads/[cnpj]/notes` (GET/POST) - Contact notes
  - `/api/comissoes` (GET) - Commission aggregates
  - `/api/commission-config` (POST) - Update commission settings
  - `/api/dashboard` (GET) - KPI data for dashboard
  - `/api/setup-crm` (POST) - Initial CRM setup
  - `/api/enrich-contacts` (POST) - Backfill contact enrichment
  - `/api/cron/sync-leads` (POST) - Scheduled sync trigger
- Pattern: `NextRequest`/`NextResponse`, role-based filtering in SQL

**web/src/components/ - React Components:**
- Purpose: Reusable UI components for pages
- Key components:
  - `Sidebar.tsx` - Navigation sidebar with role-aware menu
  - `LeadTable.tsx` - Filterable/sortable lead list
  - `LeadSlideOver.tsx` - Side panel for lead details
  - `DashboardCharts.tsx` - Chart rendering with Recharts
  - `KPICard.tsx` / `KPIRow.tsx` - Key performance indicator displays
  - `LeadAssignmentModal.tsx` - Modal for assigning leads
  - `ContactNotesTimeline.tsx` - Activity timeline for contacts
  - `BrazilHeatmap.tsx` - Geographic visualization
- Pattern: Client components with server-side data fetching via API routes

**web/src/lib/ - Utilities & Data Access:**
- Purpose: Shared utilities, database access, authentication, type definitions
- Key files:
  - `db.ts` - PostgreSQL connection pooling and query helper
  - `dal.ts` - Data access layer (session verification, role checks)
  - `auth.ts` - NextAuth configuration and session helpers
  - `types.ts` - TypeScript interfaces (VendedorProjeto, DashboardStats, etc.)
  - `validations.ts` - Zod schemas for runtime validation
  - `format.ts` - Formatting utilities (currency, dates, etc.)
  - `repo-sync.ts` - Integration with external repository sync
  - `auth-actions.ts` - Server-side auth actions

**web/src/types/ - TypeScript Definitions:**
- Purpose: Ambient type declarations
- Contains: `next-auth.d.ts` (NextAuth session type extensions)

**migrations/ - Database Migrations:**
- Purpose: SQL scripts for schema creation and optimization
- Key files:
  - `apply_indexes.py` - Python script to apply index migrations
  - `add_performance_indexes.sql` - SQL indexes for query optimization
  - `README.md` - Migration documentation

**data/raw/ - Raw Input Data:**
- Purpose: Storage for Transfer Gov data files organized by date
- Structure: `data/raw/YYYY-MM-DD/[filename].xlsx`
- Auto-discovered by pipeline when finding latest dataset

**logs/ - Application Logs:**
- Purpose: Runtime logs from pipeline execution, API errors, scheduled jobs
- Managed by: Loguru (Python), console (Next.js)

**tests/ - Test Suite:**
- Purpose: Unit and integration tests (if any exist)
- Fixtures: `tests/fixtures/` contains test data files

## Key File Locations

**Entry Points:**
- `web/src/app/page.tsx` - Frontend home page
- `web/src/app/layout.tsx` - Root layout with auth session
- `src/api/main.py` - FastAPI app with scheduler
- `src/cli.py` - CLI entry point for manual pipeline runs

**Configuration:**
- `config.yaml` - Main app configuration (extraction schedule, database, API keys)
- `web/package.json` - Next.js dependencies and scripts
- `web/.env.example` - Environment variable template
- `.env` - Environment variables (git-ignored)

**Core Logic:**
- `src/orchestrator/pipeline.py` - ETL workflow orchestration
- `src/loader/upsert.py` - Database write operations
- `src/enrichment/enrichment_runner.py` - Contact enrichment workflow
- `web/src/app/api/leads/route.ts` - Lead listing and filtering

**Database Models:**
- `src/loader/db_models.py` - SQLAlchemy ORM models (11 tables)
  - Tables: programas, propostas, proponentes, apoiadores, emendas, proposta_apoiadores, proposta_emendas, convenios, desembolsos, historico_situacao, extraction_logs

**Testing:**
- `tests/fixtures/` - Sample data files for testing

## Naming Conventions

**Files:**
- Python: `snake_case.py` (e.g., `file_parser.py`, `enrichment_runner.py`)
- TypeScript: `camelCase.ts` or `PascalCase.tsx` for components (e.g., `LeadTable.tsx`, `dal.ts`)
- Directories: `snake_case/` (e.g., `src/api/`, `web/src/components/`)

**Functions:**
- Python: `snake_case()` (e.g., `run_pipeline()`, `enrich_missing_contacts()`)
- TypeScript: `camelCase()` (e.g., `getApiSession()`, `verifyLeadAccess()`)
- React components: `PascalCase` (e.g., `LeadTable`, `KPICard`)

**Variables:**
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `BATCH_SIZE`)
- Regular vars: `snake_case` (Python), `camelCase` (TypeScript)

**Types:**
- TypeScript interfaces: `PascalCase` with `Interface` prefix or no prefix (e.g., `VendedorProjeto`, `DashboardStats`)
- Database column names: Portuguese `snake_case` (e.g., `nome_programa`, `valor_emenda`)

**API Routes:**
- RESTful path segments: `/api/[resource]/` (e.g., `/api/leads/`, `/api/comissoes/`)
- Dynamic segments: `[param]` format (e.g., `/api/leads/[cnpj]/`)
- Query strings: `camelCase` parameters (e.g., `?vendedor_id=`, `?search=`, `?limit=`)

## Where to Add New Code

**New Feature:**
- Backend API: Create route in `web/src/app/api/[feature]/route.ts`
- Frontend page: Create page in `web/src/app/[feature]/page.tsx`
- Shared types: Add interface to `web/src/lib/types.ts`
- API validation: Add Zod schema to `web/src/lib/validations.ts`

**New Component/Module:**
- React component: Create in `web/src/components/[Component].tsx`
- Utility function: Add to `web/src/lib/[utility].ts` or new file
- Python module: Create in `src/[module_name]/` directory with `__init__.py`
- Database model: Add SQLAlchemy class to `src/loader/db_models.py`

**Utilities:**
- Shared helpers: `web/src/lib/format.ts`, `web/src/lib/validations.ts`
- Python utilities: `src/parser/`, `src/transformer/`, `src/monitor/` by functional area

**Database:**
- New table: Add ORM model to `src/loader/db_models.py` with appropriate relationships
- Indexes: Add to `migrations/add_performance_indexes.sql`
- Upsert logic: Add function to `src/loader/upsert.py` following existing patterns

**Enrichment:**
- New data source: Add method to `src/enrichment/brasil_api.py`
- New enrichment type: Create function in `src/enrichment/enrichment_runner.py`

**API Routes:**
- Query logic: Keep SQL parameterized in route handler or extract to `web/src/lib/dal.ts`
- Role checks: Use helpers from `web/src/lib/dal.ts` (isSeller, canModifyData, isAdmin)
- Error handling: Return appropriate HTTP status codes (401 unauthorized, 400 validation, 500 server error)

## Special Directories

**data/raw/ - Data Input:**
- Purpose: Stores raw Transfer Gov files
- Structure: Auto-organized by pipeline into date subdirectories
- Generated: Yes (by external data download/sync process)
- Committed: No (git-ignored, not version controlled)

**migrations/ - Schema Versioning:**
- Purpose: Track database schema changes
- Generated: No (manually maintained)
- Committed: Yes (part of version control)

**.next/ - Build Output:**
- Purpose: Next.js compiled output
- Generated: Yes (by `npm run build`)
- Committed: No (git-ignored)

**logs/ - Runtime Logs:**
- Purpose: Application execution logs
- Generated: Yes (at runtime)
- Committed: No (git-ignored)

**node_modules/ (web/) - Dependencies:**
- Purpose: npm package dependencies
- Generated: Yes (by `npm install`)
- Committed: No (git-ignored)

---

*Structure analysis: 2026-02-17*

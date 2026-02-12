# Projetus CRM - Complete Codebase Map

**Analysis Date:** 2026-02-11

---

## 1. Project Structure

The repo has **two main subsystems**:

### Root (`/`) - Python ETL Pipeline
A Python 3.11+ data pipeline that crawls TransferGov (Brazilian government transfer system), parses CSV/Excel files, validates data, and loads it into PostgreSQL.

### `web/` - Next.js CRM Web App
A Next.js 14 web application deployed on Vercel that serves as a sales CRM for the Sigma team to manage leads derived from government instrument data.

### Root-level files (non-exhaustive)

| File | Purpose |
|------|---------|
| `pyproject.toml` | Python deps: FastAPI, SQLAlchemy, Polars, Playwright, Streamlit, httpx |
| `main.py` | FastAPI entry point |
| `run_pipeline.py` | Runs the ETL pipeline |
| `config.yaml` | Pipeline configuration |
| `Dockerfile`, `Dockerfile.railway` | Docker configs for Railway deployment (Python API) |
| `docker-compose.yml` | Local dev PostgreSQL |
| `requirements.txt` | Fallback pip requirements |
| `reset_database.py` | Drops and recreates all pipeline tables |
| `load_qualified_leads.py` | Script to load qualified leads into DB |
| `load_propostas_fixed.py` | Fix script for propostas with programa_id |
| `mark_existing_clients.py` | Marks existing Projetus clients in proponentes |
| `check_database_status.py` | DB health check script |
| `extract_all.py` | Extracts all data from pipeline |

### `web/` files

| File | Purpose |
|------|---------|
| `web/package.json` | Next.js 14, next-auth 5 beta, pg, xlsx, recharts, zod, bcryptjs, jose |
| `web/vercel.json` | Vercel config: framework=nextjs, region=iad1 |
| `web/next.config.js` | `output: 'standalone'` |
| `web/schema.sql` | Reference SQL schema for pipeline tables (12 tables) |
| `web/migrate.sh` | Migration helper script |
| `web/tailwind.config.ts` | Custom Sigma brand colors + fonts |
| `web/tsconfig.json` | Path alias `@/*` -> `./src/*` |
| `web/.vercelignore` | Ignores for Vercel deploy |

---

## 2. Database Schema

There are **two separate schemas** sharing the same PostgreSQL database:

### Pipeline Tables (created by `web/schema.sql` / Python pipeline)

12 tables from TransferGov data:

| Table | Key Column | Purpose |
|-------|-----------|---------|
| `programas` | `transfer_gov_id` (unique) | Government programs |
| `proponentes` | `cnpj` (unique, 14 chars) | Organizations that submit proposals. Has `is_osc`, `is_existing_client`, `total_propostas`, `total_emendas`, `valor_total_emendas`, `email`, `telefone` |
| `propostas` | `transfer_gov_id` (unique) | Proposals submitted by proponentes. Has `proponente_cnpj`, `programa_id`, `situacao`, `valor_global`, `valor_repasse` |
| `apoiadores` | `transfer_gov_id` (unique) | Parliamentary supporters |
| `emendas` | `transfer_gov_id` (unique) | Parliamentary amendments. Has `numero`, `autor`, `valor`, `tipo`, `ano` |
| `proposta_apoiadores` | composite unique | Junction: proposta <-> apoiador |
| `proposta_emendas` | composite unique | Junction: proposta <-> emenda |
| `convenios` | `transfer_gov_id` (unique) | Signed agreements. Has `proposta_id`, `situacao`, `valor_global`, `valor_desembolsado`, `saldo_conta`, financial fields |
| `desembolsos` | `transfer_gov_id` (unique) | Disbursements tied to convenios |
| `historico_situacao` | composite unique | Status history for proposals/convenios |
| `extraction_logs` | `id` (serial) | ETL pipeline run logs |
| `data_lineage` | `id` (serial) | Data provenance tracking |

**Relationships:**
- `propostas.proponente_cnpj` -> `proponentes.cnpj`
- `propostas.programa_id` -> `programas.transfer_gov_id`
- `convenios.proposta_id` -> `propostas.transfer_gov_id`
- `desembolsos.convenio_id` -> `convenios.transfer_gov_id`
- `proposta_apoiadores` links `propostas` <-> `apoiadores`
- `proposta_emendas` links `propostas` <-> `emendas`

### CRM Tables (created by `web/src/app/api/setup-crm/route.ts` and `web/src/app/api/migrate/route.ts`)

| Table | Key Column | Purpose |
|-------|-----------|---------|
| `users` | `id` (UUID) | Auth users. Has `nome`, `email`, `password_hash`, `role` ('gestor'\|'vendedor'), `active` |
| `vendedor_projetos` | `id` (serial) | **THE MAIN CRM TABLE**. Each row = one lead/project assigned to a vendedor |
| `lead_assignments` | `id` (UUID) | Legacy table (created by migrate POST, but NOT used by current CRM) |
| `contact_notes` | `id` (UUID) | Legacy table (created by migrate POST, NOT used by current CRM) |
| `commissions` | `id` (UUID) | Legacy table (created by migrate POST, NOT used by current CRM) |

### `vendedor_projetos` - Full Column List

This is the central CRM table. Every lead/project row lives here:

```sql
id SERIAL PRIMARY KEY,
vendedor_id UUID REFERENCES users(id),    -- assigned vendedor (NULL = unassigned)
-- Programa
codigo_programa TEXT,
nome_programa TEXT,
link_externo TEXT,                         -- URL to TransfereGov
orgao_concedente VARCHAR(255),             -- ministry/organ
uf VARCHAR(5),                             -- state
municipio VARCHAR(255),
qualificacao TEXT,
nr_emenda TEXT,                            -- amendment number
parlamentar TEXT,                          -- parliament member name
-- Beneficiario (the lead)
cnpj VARCHAR(20) NOT NULL,                -- CNPJ of the organization
nome TEXT NOT NULL,                        -- organization name
natureza_juridica VARCHAR(255),
-- Financeiro
valor_emenda NUMERIC(15,2),
valor_global NUMERIC(15,2),
valor_empenhado NUMERIC(15,2),
valor_liberado NUMERIC(15,2),
-- Siconv extras
nr_convenio TEXT,
objeto TEXT,
modalidade VARCHAR(100),
situacao VARCHAR(100),
saldo_conta NUMERIC(15,2),
-- CRM fields
telefone VARCHAR(50),
email VARCHAR(500),
status_contato VARCHAR(50) DEFAULT 'Ainda Nao',  -- 4 statuses: 'Ainda Nao', 'Retorno', 'Proposta', 'Fechado'
observacoes TEXT,
-- Metadata
importado_de TEXT,                         -- 'siconv' or 'crm'
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

**Indexes:** `idx_vp_vendedor`, `idx_vp_cnpj`, `idx_vp_status_contato`, `idx_vp_uf`

**Important:** One CNPJ can have MULTIPLE rows in `vendedor_projetos` (one per project/instrument). The CRM groups by CNPJ when assigning leads to vendedores.

### Proponentes Table (from pipeline)

The `proponentes` table is used for **contact enrichment** during spreadsheet import. The import route queries:
```sql
SELECT identif_proponente as cnpj, nm_proponente as nome,
       email_proponente as email, telefone_proponente as telefone
FROM proponentes
WHERE email_proponente IS NOT NULL OR telefone_proponente IS NOT NULL
```

**Note:** The proponentes table column names are different from what `schema.sql` shows. The actual columns used in queries use `identif_proponente` and `nm_proponente` (which suggests the pipeline loads data with different column names than the schema). The `is_existing_client` field is also queried during import to flag existing clients.

---

## 3. All Pages and Routes

### Pages (Next.js App Router)

| Route | File | Description |
|-------|------|-------------|
| `/` | `web/src/app/page.tsx` | **CRM Dashboard** (gestor view). Shows global stats (total leads, assigned, unassigned, valor emendas), status pipeline bar (Ainda Nao/Retorno/Proposta/Fechado), per-vendedor cards, recent activity feed. Fetches from `/api/dashboard-crm`. |
| `/login` | `web/src/app/(auth)/login/page.tsx` | Login form. Uses server action `login()` from `auth-actions.ts`. Email + password. |
| `/leads` | `web/src/app/leads/page.tsx` | **Lead list table**. Filterable by search, status, vendedor. Inline-editable telefone, email, status, observacoes. Click row opens slide-over panel. Export CSV button. Vendedor sees only their leads. |
| `/lead/[cnpj]` | `web/src/app/lead/[cnpj]/page.tsx` | **Lead detail page**. Shows all projects for a CNPJ. Summary cards (valor global, project count, UF, vendedor). Per-project table with status/obs editing. |
| `/upload` | `web/src/app/upload/page.tsx` | **Spreadsheet import** (gestor only). Drag-and-drop .xlsx/.xls/.csv. Auto-detects Siconv or CRM format. Shows results with per-sheet breakdown. |
| `/distribuir` | `web/src/app/distribuir/page.tsx` | **Lead distribution** (gestor only). Shows unassigned leads. Select leads + vendedor, assign. CNPJ grouping: selecting one lead auto-includes all leads with same CNPJ. |
| `/cadastro-vendedor` | `web/src/app/cadastro-vendedor/page.tsx` | **Register vendedor** (gestor only). Form: nome, email, password. Lists existing vendedores. |
| `/monitoramento` | `web/src/app/monitoramento/page.tsx` | **Financial monitoring**. Shows convenios "Em execucao" with saldo > threshold. Priority classification (Alta/Media/Baixa). Filters by priority, saldo min, UF, search. Detail modal. |

### Layouts

| File | Purpose |
|------|---------|
| `web/src/app/layout.tsx` | Root layout. Checks session, shows Sidebar if authenticated. `ml-56` main padding when sidebar present. |
| `web/src/app/(auth)/layout.tsx` | Auth layout group (for login page, no sidebar). |

### API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/[...nextauth]` | GET/POST | Public | NextAuth.js handlers (session, csrf, signin, signout) |
| `/api/health` | GET | Public | Health check |
| `/api/setup-crm` | POST | Public | Creates `users` + `vendedor_projetos` tables, seeds vendedores (Wellington, Elisson, Gabriel, Vitoria) + gestor. Default password: `sigma2026` |
| `/api/migrate` | GET | Public | Shows sync status between Railway source DB and target DB, or migrates a specific table in batches |
| `/api/migrate` | POST | Public | Creates CRM tables (users, lead_assignments, contact_notes, commissions) + seeds gestor |
| `/api/import-spreadsheet` | POST | Public* | Imports .xlsx spreadsheet. Detects Siconv or CRM format. Deduplicates by (cnpj, nr_emenda). Auto-distributes via round-robin. Enriches contacts from proponentes table. Flags existing clients. |
| `/api/dashboard-crm` | GET | Auth | CRM dashboard data: global stats, per-vendedor aggregations, recent activity |
| `/api/dashboard` | GET | Auth | Alternative dashboard: per-vendedor stats with all projects |
| `/api/dashboard-enhanced` | GET | Auth | Enhanced dashboard: totals, by UF, by vendedor, by categoria, top clients, execution distribution |
| `/api/leads` | GET | Auth | List leads from vendedor_projetos. Filters: vendedor_id, search, status_contato, limit. Vendedor role auto-filtered. |
| `/api/leads/assign` | POST | Gestor | Assign leads to vendedor. Takes lead_ids + vendedor_id. Groups by CNPJ (assigns all leads for same CNPJ). |
| `/api/leads/[cnpj]` | PATCH | Auth | Update a lead: status_contato, observacoes, telefone, email. Vendedor can only update own leads. |
| `/api/leads/[cnpj]/emendas` | GET | Auth | Emendas for a CNPJ (from pipeline tables: propostas -> proposta_emendas -> emendas) |
| `/api/leads/[cnpj]/instruments` | GET | Auth | Convenios/instruments for a CNPJ (from pipeline tables) |
| `/api/leads/[cnpj]/instrument-summary` | GET | Auth | Summary of instruments for a CNPJ |
| `/api/leads/[cnpj]/ministerios` | GET | Auth | Ministerios for a CNPJ |
| `/api/leads/[cnpj]/programas` | GET | Auth | Programas for a CNPJ |
| `/api/leads/[cnpj]/propostas` | GET | Auth | Propostas for a CNPJ |
| `/api/vendedores` | GET | Auth | List active vendedores with lead counts |
| `/api/stats` | GET | Auth | Stats from proponentes table (pipeline data) |
| `/api/monitoramento` | GET | Auth | Convenios in execution with saldo. Computes priority. Filters by priority, saldo_min, UF, search. |
| `/api/filters/estados` | GET | Auth | List of estados for filter dropdowns |
| `/api/filters/natureza-juridica` | GET | Auth | List of natureza juridica values |
| `/api/chart/distribution` | GET | Auth | Chart data for distribution |
| `/api/chart/estados` | GET | Auth | Chart data by estado |
| `/api/chart/trend` | GET | Auth | Chart data for trends |

*Note: `/api/import-spreadsheet` is listed as public in middleware but practically requires knowing the endpoint exists. No auth check in the route itself.

---

## 4. Navigation Flow

### Sidebar (`web/src/components/Sidebar.tsx`)

Fixed left sidebar, 224px wide (`w-56`). Shows:
- PROJETUS logo + "Sigma CRM" subtitle
- Nav items (conditional on role)
- User info (name, role badge)
- Logout button

**Nav items:**

| All users | Gestor only |
|-----------|-------------|
| Pipeline (/) | Importar Planilha (/upload) |
| Leads (/leads) | Cadastrar Vendedor (/cadastro-vendedor) |

**Missing from sidebar but accessible via URL:**
- `/distribuir` - Lead distribution page (gestor only, no sidebar link)
- `/monitoramento` - Financial monitoring (no sidebar link)
- `/lead/[cnpj]` - Lead detail (accessed by clicking a lead)

### User flows:

1. **Login** -> `/login` -> redirects to `/` (dashboard)
2. **Gestor dashboard** -> `/` shows CRM overview -> can navigate to leads, upload, vendedor registration
3. **Vendedor** -> `/` shows same dashboard -> `/leads` shows only their assigned leads
4. **Lead management** -> `/leads` -> click row -> slide-over panel -> "Ver Detalhes" -> `/lead/[cnpj]`
5. **Import** -> `/upload` -> drag & drop spreadsheet -> auto-imports + distributes
6. **Distribution** -> `/distribuir` -> select unassigned leads -> assign to vendedor

---

## 5. Data Pipeline

### How Leads Get Into the System

There are **two paths**:

#### Path 1: Python ETL Pipeline (TransferGov data -> pipeline tables)

```
TransferGov website
    |
    v (Playwright crawler downloads CSV/Excel files)
src/crawler/downloader.py
src/crawler/repository_downloader.py
    |
    v (stored in data/raw/YYYY-MM-DD/)
src/parser/file_parser.py      -- parses CSV/Excel with Polars
src/parser/schemas.py          -- column normalization
    |
    v
src/transformer/validator.py   -- Pydantic validation
    |
    v
src/orchestrator/pipeline.py   -- orchestrates full ETL
    |
    v (upsert into PostgreSQL)
src/loader/upsert.py
src/loader/database.py         -- SQLAlchemy engine
    |
    v
Pipeline tables: programas, proponentes, propostas, emendas,
                 convenios, desembolsos, etc.
```

The pipeline:
1. Finds CSV/Excel files in `data/raw/` (latest dated subdirectory)
2. Infers entity type from filename
3. Parses with Polars
4. Validates with Pydantic
5. Extracts relationships (apoiadores, emendas, programa links)
6. Extracts proponentes from propostas
7. Upserts into PostgreSQL
8. Logs extraction results

#### Path 2: Spreadsheet Import (manual upload -> vendedor_projetos)

```
Gestor uploads .xlsx via /upload page
    |
    v
POST /api/import-spreadsheet
    |
    v (XLSX.js parses file)
Detects format: 'siconv' or 'crm'
    |
    v
Maps columns via SICONV_COLUMN_MAP or CRM_COLUMN_MAP
    |
    v
For each row:
  1. Clean CNPJ (pad to 14 digits)
  2. Dedup by (cnpj, nr_emenda) pair
  3. Determine vendedor:
     a. CRM format: sheet name maps to vendedor email
     b. CNPJ already assigned: use same vendedor
     c. Otherwise: round-robin (least-loaded vendedor)
  4. Enrich contacts from proponentes table
  5. Flag existing clients in observacoes
  6. INSERT INTO vendedor_projetos
    |
    v
vendedor_projetos table
```

**Siconv format columns:** N Instrumento, Link Externo, UF, Municipio, CNPJ, Nome Proponente, Modalidade, Emenda, Objeto, Situacao, Orgao Concedente, Natureza Juridica, Valor Global, Valor Emenda, Valor Empenhado, Valor Liberado, Saldo em Conta

**CRM format columns:** Codigo Programa, Nome Programa, Link Externo, Orgao Superior, UF Beneficiario, Municipio Beneficiario, Qualificacao, Nr Emenda Beneficiario, Parlamentar Beneficiario, CNPJ Beneficiario, Nome Beneficiario, Nat Jur Beneficiario

**Hardcoded vendedor mapping (CRM format):**
- Sheet "wellington" -> wellington@sigma.com
- Sheet "elisson" -> elisson@sigma.com
- Sheet "gabriel" -> gabriel@sigma.com
- Sheet "vitoria"/"vitoria" -> vitoria@sigma.com

#### Path 3: Data Migration (Railway -> Supabase)

`/api/migrate` GET migrates pipeline tables from a **hardcoded Railway PostgreSQL** source to the target DB (Supabase). This was used for initial data migration. The Railway connection string is **hardcoded in the route file** (security issue).

### Data Sources

| Source | Type | Used For |
|--------|------|----------|
| TransferGov (transferegov.sistema.gov.br) | Web scraping (Playwright) | Pipeline tables: programas, propostas, convenios, etc. |
| BrasilAPI (brasilapi.com.br) | REST API | CNPJ enrichment: email, telefone, address |
| Manual spreadsheets (.xlsx) | File upload | vendedor_projetos (CRM leads) |
| Railway PostgreSQL | Database | Source for migration to Supabase |

---

## 6. Authentication

### Stack
- **next-auth v5 (beta 30)** with Credentials provider
- **bcryptjs** for password hashing
- **JWT** strategy (not database sessions)
- Session maxAge: 7 days

### Flow

1. User hits any page -> middleware checks for `authjs.session-token` or `__Secure-authjs.session-token` cookie
2. No cookie -> redirect to `/login` (or 401 for API routes)
3. Login form submits to server action `login()` in `web/src/lib/auth-actions.ts`
4. Server action validates with Zod, calls `signIn('credentials', ...)`
5. Credentials provider queries `users` table by email, verifies bcrypt password hash
6. On success: JWT token created with `id` and `role` claims
7. Session callback copies `id` and `role` to session object

### Roles

| Role | Access |
|------|--------|
| `gestor` | Full access: all leads, import, assign, create vendedores |
| `vendedor` | See only assigned leads, update status/contacts on own leads |

### Role enforcement

- **Middleware** (`web/src/middleware.ts`): Only checks if session exists, NOT roles
- **API routes**: Check `session.role` for authorization (e.g., assign requires gestor)
- **Pages**: Client-side role checks (e.g., upload page checks session, distribuir redirects)
- **DAL** (`web/src/lib/dal.ts`): `verifySession()` for server components, `getApiSession()` for API routes, `buildVendedorFilter()` for SQL, `verifyLeadAccess()` for lead-level access

### Default Users (seeded by setup-crm)

| Email | Role | Default Password |
|-------|------|-----------------|
| gestor@sigma.com | gestor | sigma2026 |
| wellington@sigma.com | vendedor | sigma2026 |
| elisson@sigma.com | vendedor | sigma2026 |
| gabriel@sigma.com | vendedor | sigma2026 |
| vitoria@sigma.com | vendedor | sigma2026 |

### Public Routes (no auth required)

`/login`, `/api/auth/*`, `/api/health`, `/api/migrate`, `/api/setup-crm`, `/api/import-spreadsheet`

---

## 7. External Integrations

### BrasilAPI (`src/enrichment/brasil_api.py`)
- **Purpose:** CNPJ data enrichment (email, telefone, address)
- **Endpoint:** `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- **Auth:** None (free public API)
- **Used by:** Python enrichment pipeline (`src/enrichment/enrichment_runner.py`)
- **Client:** httpx with 30s timeout

### TransferGov (transferegov.sistema.gov.br)
- **Purpose:** Source of all government instrument data
- **Method:** Web scraping with Playwright browser automation
- **Files:** `src/crawler/browser.py`, `src/crawler/downloader.py`, `src/crawler/navigator.py`, `src/crawler/repository_downloader.py`
- **Output:** CSV/Excel files downloaded to `data/raw/YYYY-MM-DD/`

### Railway PostgreSQL (hardcoded in migrate route)
- **Connection:** `postgresql://postgres:FCIKWxLaKmAdKYkWjGKsLZCuYBlzYtQl@shortline.proxy.rlwy.net:30852/railway`
- **Purpose:** Original pipeline database, source for migration to Supabase
- **WARNING:** Credentials are hardcoded in `web/src/app/api/migrate/route.ts`

### Supabase PostgreSQL
- **Purpose:** Production database for both pipeline tables and CRM
- **Connection:** Via `DATABASE_URL` or `POSTGRES_URL` env var
- **SSL:** `rejectUnauthorized: false`

---

## 8. Environment Variables

### `web/.env.example` (required for web app)

```
DATABASE_URL=postgresql://user:pass@host:port/database
POSTGRES_URL=postgresql://user:pass@host:port/database
NEXTAUTH_SECRET=your-32-char-secret-here
NEXTAUTH_URL=http://localhost:3000
```

### Root `.env.example`

Exists at root level for Python pipeline (contains DB connection).

### Key env vars used in code

| Variable | Used In | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `web/src/lib/db.ts`, API routes | Primary PostgreSQL connection string |
| `POSTGRES_URL` | `web/src/lib/db.ts`, API routes | Fallback PostgreSQL connection (Vercel convention) |
| `NEXTAUTH_SECRET` | next-auth | JWT signing secret |
| `NEXTAUTH_URL` | next-auth | Base URL for auth callbacks |

**Note:** `.env`, `.env.local`, `.env.production` files exist but contents are not shown here (security).

---

## 9. Deployment

### Vercel (Web App)

**Config** (`web/vercel.json`):
```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "regions": ["iad1"]
}
```

- Region: `iad1` (US East - Virginia)
- `next.config.js`: `output: 'standalone'` (optimized for containerized deployment)
- `.vercel/` directory exists in both root and web (Vercel project linked)
- `.vercelignore` exists at `web/.vercelignore`

### Railway (Python Pipeline - historical)

- `Dockerfile.railway` exists for Railway deployment
- `railway.json`, `railway.production.json`, `railway.dashboard.json` configs present
- `deploy-railway.sh` deployment script
- Railway was used to host the Python API + pipeline, now appears to be used only as source DB for migration

### Database

- **Production:** Supabase PostgreSQL (connected via `POSTGRES_URL`)
- **Historical:** Railway PostgreSQL (still referenced in migrate route)
- **Local:** `docker-compose.yml` provides local PostgreSQL

### Streamlit Dashboard (historical/alternative)

- `src/dashboard/streamlit_app.py` - A full Streamlit dashboard exists in the Python codebase
- Has its own pages, queries, components, charts
- `.streamlit/` config directory present
- This appears to be an earlier version of the dashboard before the Next.js web app

---

## 10. Components

| Component | File | Description |
|-----------|------|-------------|
| `Sidebar` | `web/src/components/Sidebar.tsx` | Fixed left nav. Shows nav items (role-conditional), user info, logout. |
| `LeadSlideOver` | `web/src/components/LeadSlideOver.tsx` | Slide-in panel from right. Shows lead details, contact info, quick actions (WhatsApp, Email, Ver Detalhes). |
| `LeadTable` | `web/src/components/LeadTable.tsx` | Reusable lead table component |
| `KPICard` | `web/src/components/KPICard.tsx` | Dashboard KPI card |
| `KPIRow` | `web/src/components/KPIRow.tsx` | Row of KPI cards |
| `DashboardCharts` | `web/src/components/DashboardCharts.tsx` | Chart components (uses recharts) |
| `BrazilHeatmap` | `web/src/components/BrazilHeatmap.tsx` | Brazil state heatmap visualization |

---

## 11. Python Pipeline Architecture (`src/`)

```
src/
  __init__.py
  cli.py                    -- CLI entry point
  config.py                 -- Legacy config
  config/
    __init__.py
    loader.py               -- YAML config loader
  crawler/
    __init__.py
    browser.py              -- Playwright browser management
    downloader.py           -- Main downloader (run_crawler)
    navigator.py            -- Page navigation logic
    repository_downloader.py -- Direct file download
  dashboard/                -- Streamlit dashboard (historical)
    streamlit_app.py
    config.py
    pages/                  -- apoiadores, emendas, home, lead_profile, pipeline, programas, propostas, qualificacao
    queries/                -- chart_data, entities, history, lead_profile, metrics, proponentes, qualificacao, search
    components/             -- badges, breadcrumb, cards, charts, export, filters, kpi, metrics, ranking_cards, search
    utils/
      tiers.py              -- Lead tier classification
    assets/
      geo/br_states.json
      styles/
  enrichment/
    __init__.py
    __main__.py
    brasil_api.py           -- BrasilAPI CNPJ client
    cli.py                  -- Enrichment CLI
    enrichment_runner.py    -- Batch enrichment runner
  loader/
    __init__.py
    database.py             -- SQLAlchemy engine + session
    db_models.py            -- SQLAlchemy ORM models
    extraction_log.py       -- Extraction log creation
    upsert.py               -- Data upsert logic + proponente extraction
  monitor/
    __init__.py
    alerting.py
    lineage.py
    logger.py
    reconciliation.py
    scheduler_health.py
    volume_alerts.py
  orchestrator/
    __init__.py
    dry_run.py
    pipeline.py             -- Main ETL pipeline orchestrator
  parser/
    __init__.py
    encoding.py             -- File encoding detection
    file_parser.py          -- CSV/Excel parser (Polars)
    schemas.py              -- Column normalization + schemas
  transformer/
    __init__.py
    models.py               -- Pydantic data models
    validator.py            -- DataFrame validation
```

---

## 12. Design System

### Colors (Tailwind config)
- `sigma-navy`: `#050B1F` (background)
- `sigma-navy-light`: `#0A1628` (sidebar, card backgrounds)
- `sigma-navy-card`: `#111B2E` (card backgrounds)
- `sigma-neon`: `#00D4FF` (cyan accent, CTAs)
- `sigma-neon-dim`: `#00A3CC` (dimmed accent)
- `tier-high`: `#10B981` (green)
- `tier-medium`: `#00D4FF` (cyan)
- `tier-low`: `#6B7280` (gray)

### Fonts
- Heading: Space Grotesk
- Body: Inter

### Status Colors (in-app)
- `Ainda Nao`: red-500
- `Retorno`: amber-500
- `Proposta`: blue-500
- `Fechado`: green-500

### UI Patterns
- Dark theme throughout
- Glass-morphism effects (`backdrop-blur-sm`, `bg-white/5`)
- Subtle borders (`border-white/5`, `border-white/10`)
- Hover glow effects on cards
- Slide-in panels for details
- Inline editing in tables (onBlur save)

---

## 13. Key Observations and Issues

### Security Issues
1. **Hardcoded Railway credentials** in `web/src/app/api/migrate/route.ts` line 9
2. **Default password `sigma2026`** for all seeded users
3. `/api/import-spreadsheet` is **public** (no auth in middleware list AND no auth check in route)
4. `/api/setup-crm` is **public** - anyone can trigger table creation + user seeding
5. SSL `rejectUnauthorized: false` everywhere

### Architectural Notes
1. **Two DB schemas coexist**: Pipeline tables (TransferGov data) and CRM tables (vendedor_projetos). They share the same database but serve different purposes.
2. **vendedor_projetos is denormalized**: It stores lead data directly rather than referencing pipeline tables. Import copies data in.
3. **Some API routes create their own Pool** instead of using the shared `db.ts` pool (import-spreadsheet, setup-crm, migrate)
4. **Multiple dashboard routes**: `/api/dashboard`, `/api/dashboard-crm`, `/api/dashboard-enhanced` - unclear which is primary (page.tsx uses `dashboard-crm`)
5. **Legacy tables**: `lead_assignments`, `contact_notes`, `commissions` are created but never used by the current UI
6. **Streamlit dashboard** in Python is a parallel/historical version of the web dashboard
7. **No tests** for the web app (no test files in web/)
8. **proponentes table column names** differ between schema.sql (which uses `cnpj`) and actual queries (which use `identif_proponente`)

### Missing Features (based on pages not in sidebar)
- `/distribuir` page exists but has no sidebar link
- `/monitoramento` page exists but has no sidebar link
- No notification system
- No audit trail for lead status changes
- No bulk operations beyond assignment

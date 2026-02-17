# External Integrations

**Analysis Date:** 2026-02-17

## APIs & External Services

**Government Data:**
- TransferenciaGov/SERPRO - Transfer Gov panel for government funding tracking
  - URL: `https://dd-publico.serpro.gov.br/extensions/gestao-transferencias/gestao-transferencias.html`
  - Access: Web scraping via Playwright (chromium browser automation)
  - Source: Configuration in `src/config.py` - `transfer_gov_url` field
  - Pipeline: Daily scheduled extraction via FastAPI background scheduler

- repositorio.dados.gov.br - Open data repository (DETRU module)
  - Base URL: `https://repositorio.dados.gov.br/seges/detru`
  - Data sources:
    - `siconv_programa.csv.zip` - Government program definitions
    - `siconv_emenda.csv.zip` - Amendment/appropriation data
    - `siconv_proponentes.csv.zip` - Company/organization contact information (phone, email)
  - Access: HTTP streaming with zip decompression
  - Implementation: `web/src/lib/repo-sync.ts` - Daily sync at 06:00 UTC via Vercel cron
  - Coverage: ~64% of CNPJs; provides telefone, email, nome, UF, municipio

**BrasilAPI - CNPJ Enrichment:**
- Service: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- Purpose: Company data enrichment (phone, email, address, legal entity type)
- Integration points:
  - `web/src/app/api/enrich-contacts/route.ts` - Backfill contact enrichment
  - `web/src/app/api/import-spreadsheet/route.ts` - Enrich on lead import
  - `web/src/app/api/setup-crm/route.ts` - Initial CRM setup with enrichment
  - `web/src/lib/repo-sync.ts` - Daily sync fills missing fields
- Rate limiting: 300ms delay between API calls (observed in enrich-contacts)
- Timeout: 10000ms per request
- User-Agent: `Mozilla/5.0 (compatible; ProjetusCRM/1.0)`
- Coverage: Complements repositorio.dados.gov.br (36% of remaining CNPJs)
- Fields provided: ddd_telefone_1, ddd_telefone_2, email, endereco, natureza_juridica, UF, municipio

## Data Storage

**Databases:**

Primary: PostgreSQL 15+
- Connection: `DATABASE_URL` (format: `postgresql://user:pass@host:port/database`)
- Providers supported:
  - Local: `postgresql://localhost:5432/projetus` (docker-compose)
  - Supabase: Managed PostgreSQL with pooling endpoint
  - Railway: PaaS PostgreSQL deployment
- Client:
  - Python backend: SQLAlchemy 2.0 ORM with psycopg driver (`postgresql+psycopg://`)
  - Next.js: pg library (raw queries via `@/lib/db.ts`)
- Connection pooling:
  - Python: Pool size 2, max overflow 3 (Railway-tuned)
  - Node.js: Pool max 5, idle timeout 10s
- Schema: `web/schema.sql` - SQL schema definition with all tables
- Migrations: `migrations/` directory for version control

**File Storage:**
- Local filesystem only - raw data files stored in `data/raw/` directory
  - Retention: 30 days (configurable via `raw_retention_days`)
  - Used for downloaded CSV/ZIP files from government sources

**Caching:**
- None detected - all queries hit database or external APIs directly

## Authentication & Identity

**Auth Provider:**
- Custom implementation - no third-party OAuth (no Google, GitHub, etc.)
- Framework: NextAuth.js v5 with Credentials provider
  - Location: `web/src/lib/auth.ts` and `auth.config.ts`
  - Strategy: JWT-based sessions (7-day expiration)
  - Implementation approach: Email + password with bcryptjs hashing

**User Management:**
- Database: users table in PostgreSQL
  - Fields: id, nome, email, role, active, password_hash
  - Roles: 'gestor', 'vendedor', 'visualizador', 'gestor_vendedor'
- Password hashing: bcryptjs (v3.0.3)
- Session storage: JWT tokens stored in client (stateless)
- API Auth: NextAuth session object in cookies
  - Env var: `NEXTAUTH_SECRET` (32-char base64 secret)
  - Env var: `NEXTAUTH_URL` (deployment URL for callback)

## Monitoring & Observability

**Error Tracking:**
- Not detected - no Sentry, DataDog, or similar integrations

**Logs:**
- Python backend: Structured logging via loguru (with file rotation)
  - Logger: `loguru.logger` used throughout `src/`
  - Configuration: `src/monitor/logger.py`
  - Output: Console and file logs

- Next.js frontend: Browser console via `console.log/error`
  - API routes: Console logging in route handlers

**Alerts:**

Telegram:
- Service: Telegram Bot API
- Endpoint: `https://api.telegram.org/bot{bot_token}/sendMessage`
- Configuration:
  - `TELEGRAM_BOT_TOKEN` - Bot API token
  - `TELEGRAM_CHAT_ID` - Destination chat/group ID
- Source: `src/monitor/alerting.py` - send_telegram_alert()
- Triggers: Reconciliation mismatches, pipeline failures, volume alerts
- Format: Markdown-formatted messages with severity prefixes ([CRITICAL], [WARNING], [INFO])

Email (Fallback):
- SMTP-based email alerts via smtplib
- Configuration:
  - `EMAIL_SMTP_HOST` - SMTP server hostname
  - `EMAIL_SMTP_PORT` - SMTP port (default 587)
  - `EMAIL_USER` - SMTP authentication username
  - `EMAIL_PASS` - SMTP authentication password
  - `EMAIL_FROM` - Sender email address
  - `EMAIL_TO` - Comma-separated recipient list
- Source: `src/monitor/alerting.py` - send_email_alert()
- Fallback: Used when Telegram fails

## CI/CD & Deployment

**Hosting:**

Frontend/API:
- Vercel (Next.js frontend + API routes)
  - Config: `vercel.json` - deployment and cron settings
  - Environment: Supports development and production
  - Cron jobs: Configured in vercel.json (e.g., `/api/cron/sync-leads` daily 06:00 UTC)

Backend:
- Railway or Vercel
  - Dockerfile deployment for Python FastAPI
  - Docker images: `Dockerfile` (standard) and `Dockerfile.railway` (optimized)
  - Entry point: FastAPI app starts via `uv run python -m src.main`
  - Health check port: 8080 (configured in src/config.py)

**CI Pipeline:**
- Not detected - no GitHub Actions, GitLab CI, or similar workflows in repo

## Environment Configuration

**Required environment variables:**

Backend (Python - `src/config.py`):
- `DATABASE_URL` - PostgreSQL connection string (primary, from .env or Streamlit secrets)
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API token for alerts
- `TELEGRAM_CHAT_ID` - Telegram chat/group ID for alert destination

Frontend (Next.js - `web/.env.example`):
- `DATABASE_URL` - PostgreSQL connection (same as backend)
- `POSTGRES_URL` - Alternative PostgreSQL URL
- `NEXTAUTH_SECRET` - JWT secret (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- `NEXTAUTH_URL` - Deployment URL for NextAuth callbacks (e.g., `http://localhost:3000`)
- `CRON_SECRET` - Secret for Vercel cron job authorization

Optional environment variables:
- `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, `EMAIL_TO` - Email alerts
- `EXTRACTION_HOUR`, `EXTRACTION_MINUTE` - Scheduler timing (default: 9:15 UTC)
- `RAW_RETENTION_DAYS` - CSV file retention (default: 30 days)

**Secrets location:**
- `.env` file (root and `web/` directories) - Development only
- `.env.local` - Development overrides (committed to `.gitignore`)
- Vercel Environment Variables dashboard - Production secrets
- Railway Environment Variables - Backend deployment secrets
- Streamlit Secrets (if using Streamlit dashboard) - Alternative config source

## Webhooks & Callbacks

**Incoming:**
- None detected - no external webhooks received

**Outgoing:**
- NextAuth callbacks: `web/src/lib/auth.ts`
  - JWT callback: Executed on sign-in, token extended with user.id and user.role
  - Session callback: Executed per request, session augmented with JWT claims
- Telegram alerts (one-way): Sent from `src/monitor/alerting.py`
- Email alerts (one-way): Sent from `src/monitor/alerting.py`

## Data Flow Summary

**Daily Lead Sync (Automated):**
1. Vercel cron triggers `/api/cron/sync-leads` at 06:00 UTC
2. Route handler calls `syncLeadsFromRepo()` in `web/src/lib/repo-sync.ts`
3. Fetches from repositorio.dados.gov.br (programa, emenda, proponentes CSVs)
4. For missing contact data, calls BrasilAPI CNPJ endpoint
5. Upserts proponentes table with COALESCE logic (preserves CRM edits)
6. Returns sync statistics (rows inserted/updated/skipped)

**Python Backend Extraction (Scheduled):**
1. APScheduler triggers daily at configured time (default 9:15 UTC)
2. `_run_pipeline_job()` in `src/api/main.py` invokes `run_pipeline()`
3. Playwright crawls TransferenciaGov for transfer data
4. Data parsed and loaded into PostgreSQL
5. Contact enrichment runs via `enrich_missing_contacts()` (up to 1000 proponentes/run)
6. Telegram alerts sent on success/failure

**User Authentication:**
1. Login form posts credentials to `/api/auth/[...nextauth]` route
2. NextAuth Credentials provider queries users table
3. Password verified via bcrypt comparison
4. JWT token created with user.id and user.role
5. Token stored in cookie, included in subsequent requests
6. API routes use `getApiSession()` from `@/lib/dal.ts` to extract session

---

*Integration audit: 2026-02-17*

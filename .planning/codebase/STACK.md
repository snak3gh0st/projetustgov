# Technology Stack

**Analysis Date:** 2026-02-17

## Languages

**Primary:**
- Python 3.11 - Backend services (FastAPI, ETL, crawler, data processing)
- TypeScript 5.5 - Frontend and Next.js API routes
- JavaScript - Build scripts and utilities

**Secondary:**
- SQL - PostgreSQL queries and schema
- CSS - Tailwind CSS for styling

## Runtime

**Environment:**
- Python 3.11.x - Backend runtime (specified in `.python-version`)
- Node.js 18+ (implied by Next.js 14.2)

**Package Managers:**
- `uv` (Python) - Primary package manager with lock file (`uv.lock`)
  - Lockfile: `uv.lock` present - 335KB dependency graph
- `npm` (Node.js) - Package manager for Next.js project
  - Lockfile: `package-lock.json` present - 244KB

## Frameworks

**Core Backend:**
- FastAPI 0.128.1 - API server with async support and health check endpoints
  - Located: `src/api/main.py`
  - Health endpoints: `/health`, `/ready`, `/metrics`
  - CORS middleware enabled for monitoring integration
- uvicorn 0.40.0 - ASGI web server for FastAPI

**Core Frontend:**
- Next.js 14.2.0 - React framework with file-based routing and API routes
  - Server components and middleware support
  - App router with dynamic routes (e.g., `/lead/[cnpj]`)
- React 18.3.0 - UI library (server and client components)

**Data Processing:**
- SQLAlchemy 2.0.46 - ORM for database operations (synchronous, not async)
  - Pool size: 2, max overflow: 3 (Railway-optimized)
  - Connection recycling: 300s (Railway timeout mitigation)
- Pandas 2.3.3 - Data manipulation and analysis
- Polars 1.38.0 - High-performance dataframe library
- openpyxl 3.1.5 - Excel file reading/writing
- xlsxwriter 3.2.9 - Excel file generation
- PyArrow 17.0.0 - Columnar data format support

**Testing:**
- pytest 9.0.2 - Python test runner
- pytest-asyncio 1.3.0 - Async test support
- mypy 1.19.1 - Static type checking for Python

**Build/Development:**
- TypeScript 5.5.0 - Type checking for frontend
- ESLint 8.0.0 - JavaScript linting
- Tailwind CSS 3.4.0 - Utility-first CSS framework
- PostCSS 8.4.0 - CSS transformation
- Autoprefixer 10.4.0 - Browser prefix injection
- ruff 0.15.0 - Python linter and formatter

**Web Crawling & Automation:**
- Playwright 1.58.0 - Browser automation (Chromium)
  - Docker: `playwright install --with-deps chromium`
  - Used for TransferenciaGov scraping in Python backend

**Data Source Retrieval:**
- httpx 0.28.1 - Async HTTP client (used for Telegram and BrasilAPI calls)

**Scheduling:**
- APScheduler 3.11.2 - Background job scheduling
  - Cron-based extraction triggers
  - Used for daily Transfer Gov extraction pipeline

## Key Dependencies

**Critical:**
- psycopg[binary] 3.3.2 - PostgreSQL driver (psycopg3 protocol)
  - Configured in SQLAlchemy with `postgresql+psycopg://` dialect
- pg 8.13.0 - Node.js PostgreSQL client library
  - Max pool: 5 connections, idle timeout: 10s
- next-auth 5.0.0-beta.30 - Authentication framework for Next.js
  - JWT-based sessions, 7-day expiration
  - NextAuth.js v5 with Credentials provider
- jose 6.1.3 - JWT token handling for Next.js Auth

**Infrastructure:**
- loguru 0.7.3 - Structured logging with file rotation
- python-dotenv 1.2.1 - Environment variable loading
- pydantic 2.12.5 - Data validation and serialization
- pydantic-settings 2.12.0 - Settings management from env vars
- email-validator 2.3.0 - Email validation

**UI Libraries:**
- @tanstack/react-table 8.20.0 - Headless table library
- recharts 2.12.0 - React charting library for data visualization
- plotly 6.0.0 - Python interactive plotting
- victory-vendor (via node_modules) - Victory charting components

**Data Validation:**
- zod 4.3.6 - TypeScript schema validation and type inference
- Pydantic v2 - Python data validation via BaseModel

**File Handling:**
- xlsx 0.18.5 - Excel file parsing (JavaScript)
- charset-normalizer 3.4.4 - Character encoding detection

**Security:**
- bcryptjs 3.0.3 - Password hashing (bcrypt implementation)
  - Used for user authentication in Next.js
- @auth/pg-adapter 1.11.1 - NextAuth PostgreSQL session adapter

**Tenacity:**
- tenacity 9.1.2 - Retry library with exponential backoff
  - Used for resilient API calls to BrasilAPI

## Configuration

**Environment:**
- `.env.example` - Template for environment variables (root and `web/` directory)
- `.env.local` - Development overrides (not committed)
- `.env.production` - Production secrets (Supabase config, Vercel tokens)
- `config.yaml` - YAML-based configuration for Python backend
- `pyproject.toml` - Python project metadata and dependencies
- `tsconfig.json` - TypeScript compiler options (paths alias: `@/*`)
- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `.streamlit/` - Streamlit dashboard configuration directory

**Build:**
- `Dockerfile` - Python 3.11-slim with uv and Playwright
- `Dockerfile.railway` - Railway-specific deployment image
- `docker-compose.yml` - Local PostgreSQL 15 + pgdata volume
- `vercel.json` - Vercel deployment config with cron scheduling

## Platform Requirements

**Development:**
- Python 3.11+
- Node.js 18+ (implied by Next.js)
- PostgreSQL 15 (docker-compose or local)
- Chromium browser (auto-installed via Playwright)
- Docker/Docker Compose (for local PostgreSQL)

**Production:**
- Vercel (Next.js frontend + API routes)
- Railway (Python FastAPI backend) or other PaaS
- Supabase (PostgreSQL hosting + auth, though custom auth used)
- Node 18+ runtime for Next.js on Vercel
- Python 3.11+ for Railway/Docker deployment

---

*Stack analysis: 2026-02-17*

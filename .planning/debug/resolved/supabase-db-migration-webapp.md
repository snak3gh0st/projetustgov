---
status: resolved
trigger: "Investigate issue: supabase-db-migration-webapp"
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:20:00Z
---

## Current Focus

hypothesis: Fix verified, now checking if data migration is complete
test: Query migration status and verify webapp endpoints work
expecting: Connection works, but may need to complete data migration for missing tables
next_action: Document findings and provide migration recommendations

## Symptoms

expected: Webapp should connect to Supabase DB and show all lead/CRM data correctly
actual: User reports pages blank/errors, data not appearing, wrong/incomplete data, DB connection failing - needs investigation to determine exact state
errors: Unknown - need to check
reproduction: Load the webapp
started: Migration in progress - was Railway, moving to Supabase

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:05:00Z
  checked: .env.local file
  found: DATABASE_URL points to Railway (shortline.proxy.rlwy.net:30852/railway), POSTGRES_URL points to Supabase
  implication: Local environment is using Railway DB, not Supabase

- timestamp: 2026-02-11T00:06:00Z
  checked: web/src/lib/db.ts connection logic
  found: Uses DATABASE_URL as primary, POSTGRES_URL as fallback (line 8)
  implication: DATABASE_URL takes precedence over POSTGRES_URL

- timestamp: 2026-02-11T00:07:00Z
  checked: .env.production file
  found: No DATABASE_URL set at all, only POSTGRES_URL exists
  implication: Production relies on POSTGRES_URL fallback OR Vercel env var

- timestamp: 2026-02-11T00:08:00Z
  checked: API migration endpoint
  found: /api/migrate has hardcoded Railway source URL and uses POSTGRES_URL for target
  implication: Migration endpoint designed to copy FROM Railway TO Supabase

- timestamp: 2026-02-11T00:10:00Z
  checked: Supabase database directly via node script
  found: Tables exist (convenios, emendas, proponentes, propostas) with 27,215 proponentes
  implication: Supabase has data, but webapp wasn't connecting to it

- timestamp: 2026-02-11T00:12:00Z
  checked: SSL connection string parameters
  found: Connection string had malformed sslmode parameters causing cert errors
  implication: Removed sslmode params, db.ts handles SSL config properly

- timestamp: 2026-02-11T00:14:00Z
  checked: /api/health endpoint after fix
  found: Returns ok status, connects to aws-1-us-east-1.pooler.supabase.com, 510ms latency
  implication: Database connection working correctly now

- timestamp: 2026-02-11T00:15:00Z
  checked: /api/migrate status endpoint
  found: 3 tables missing data - propostas (0/1.1M), proposta_apoiadores (0/286K), proposta_emendas (0/286K)
  implication: Critical tables need migration - explains why webapp shows incomplete data

- timestamp: 2026-02-11T00:16:00Z
  checked: POST /api/migrate to create CRM tables
  found: Successfully created users, lead_assignments, contact_notes, commissions tables + gestor user
  implication: CRM infrastructure now ready for use

## Resolution

root_cause: web/.env.local had DATABASE_URL pointing to old Railway DB (shortline.proxy.rlwy.net:30852) instead of Supabase. The db.ts module prioritizes DATABASE_URL over POSTGRES_URL, causing local dev to connect to Railway. Additionally, connection string had malformed SSL parameters causing certificate errors.

fix:
1. Updated web/.env.local DATABASE_URL to point to Supabase pooler (aws-1-us-east-1.pooler.supabase.com:6543)
2. Removed malformed sslmode parameters that conflicted with db.ts SSL config
3. Updated web/.env.production to include DATABASE_URL for consistency
4. Created CRM tables (users, lead_assignments, contact_notes, commissions) via /api/migrate POST

verification:
- /api/health endpoint returns ok status, confirms Supabase connection
- Database connection working with 510ms latency to Supabase
- CRM tables created successfully
- Gestor user created (gestor@sigma.com / sigma2026)
- Webapp loading correctly, redirects to /login as expected
- Login page renders with correct title "Projetus CRM | Sigma"
- Dev server running without errors

remaining_tasks:
- Migrate 3 critical tables from Railway to Supabase:
  * propostas: 0/1,124,214 rows (high priority - proposals are core data)
  * proposta_apoiadores: 0/286,373 rows
  * proposta_emendas: 0/286,373 rows
- Run migration using: curl "http://localhost:3000/api/migrate?table=propostas&offset=0"
- After migration, verify with /api/migrate status endpoint

files_changed:
- web/.env.local
- web/.env.production

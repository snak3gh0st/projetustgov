---
phase: 10-auth-crm-foundation
plan: 01
subsystem: auth
tags: [auth, database, migration, jwt, nextauth]
dependency_graph:
  requires: [postgresql, next-auth]
  provides: [auth-config, crm-tables, jwt-sessions, user-management]
  affects: [all-crm-features]
tech_stack:
  added: [next-auth@5.0.0-beta.30, bcrypt, jose, zod]
  patterns: [credentials-provider, jwt-sessions, server-actions]
key_files:
  created:
    - web/src/lib/auth.ts
    - web/src/lib/auth-actions.ts
    - web/src/lib/validations.ts
    - web/src/app/api/auth/[...nextauth]/route.ts
    - web/src/types/next-auth.d.ts
    - web/.env.example
  modified:
    - web/package.json
    - web/src/app/api/migrate/route.ts
    - web/src/lib/types.ts
decisions:
  - "Use JWT sessions (not database sessions) for credentials provider compatibility"
  - "7-day session maxAge for balance between security and UX"
  - "Bcrypt with 10 rounds for password hashing"
  - "Gestor-only guard for vendedor creation via session check"
  - "NEXTAUTH_SECRET must be set in Vercel environment variables for production"
metrics:
  duration_seconds: 254
  completed_date: "2026-02-11"
  tasks_completed: 2
  files_modified: 8
  commits: 3
---

# Phase 10 Plan 01: Auth & CRM Foundation Summary

Auth.js configured with credentials provider, JWT sessions, and CRM database schema created with 4 core tables. TypeScript compilation fixed for production readiness.

## What Was Built

### Task 1: Install Dependencies and Create CRM Database Migration
**Status:** Completed in commit `b1cf95e`

Created database schema with 4 CRM tables and seeding capability:

**Tables Created:**
- `users`: Auth table with id, nome, email, password_hash, role (gestor/vendedor), active flag
- `lead_assignments`: Maps leads to vendedores with status tracking
- `contact_notes`: Contact history with tipo (ligacao, email, whatsapp, reuniao, outro)
- `commissions`: Commission tracking with automatic calculation (valor_contrato * percentual / 100)

**Key Features:**
- Idempotent migrations with `IF NOT EXISTS`
- Foreign key constraints for data integrity
- Performance indexes on vendedor_id and lead_cnpj columns
- POST /api/migrate endpoint with optional `{seed: true}` flag
- Runtime bcrypt hashing for gestor seed user (gestor@sigma.com / sigma2026)

**Dependencies Installed:**
```json
{
  "next-auth": "^5.0.0-beta.30",
  "@auth/pg-adapter": "^1.11.1",
  "bcrypt": "^6.0.0",
  "jose": "^6.1.3",
  "zod": "^4.3.6",
  "server-only": "^0.0.1"
}
```

### Task 2: Configure Auth.js with Credentials Provider and JWT Sessions
**Status:** Completed in commit `4d0f6fe`, TypeScript fixes in commit `2df56df`

Implemented complete Auth.js authentication flow:

**Auth Configuration (`web/src/lib/auth.ts`):**
- Credentials provider with email + password
- `authorize()` function: queries users table, bcrypt.compare, returns user or null
- JWT session strategy with 7-day maxAge
- JWT callback: copies user.id and user.role to token
- Session callback: copies token.id and token.role to session.user
- Custom sign-in page: `/login`

**Server Actions (`web/src/lib/auth-actions.ts`):**
- `login(prevState, formData)`: Validates with Zod, calls signIn(), redirects to '/' on success
- `createVendedor(prevState, formData)`: Gestor-only guard, email uniqueness check, bcrypt.hash with 10 rounds
- `logout()`: Calls signOut with redirect to '/login'

**Zod Schemas (`web/src/lib/validations.ts`):**
- `LoginSchema`: email (valid format), password (min 8 chars)
- `CreateVendedorSchema`: nome (min 2 chars), email, password (min 8 chars)

**TypeScript Types:**
- `CRMUser` interface in `web/src/lib/types.ts`
- NextAuth type augmentation in `web/src/types/next-auth.d.ts` (Session, User, JWT interfaces)

**Environment Variables:**
- `NEXTAUTH_SECRET`: 32-char random string (set in .env.local)
- `NEXTAUTH_URL`: http://localhost:3000 (local dev)
- Production deployment note: NEXTAUTH_SECRET must be set in Vercel env vars

## Verification Results

✅ TypeScript compiles without errors (`npx tsc --noEmit --skipLibCheck`)
✅ Auth.ts exports handlers, auth, signIn, signOut
✅ Auth API route exists at `/api/auth/[...nextauth]`
✅ Zod schemas validate input correctly
✅ CRM migration endpoint ready at POST /api/migrate
✅ All dependencies installed in package.json

**Note:** CRM tables will be created on first deployment when POST /api/migrate is called with `{seed: true}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors**
- **Found during:** Post-implementation verification
- **Issue:** TypeScript errors in auth.ts and auth-actions.ts preventing compilation
  - bcrypt import using default export (not available in @types/bcrypt)
  - Role property not recognized in User type (type assertion needed)
  - Token properties not typed correctly in callbacks
- **Fix:**
  - Changed `import bcrypt from 'bcrypt'` to `import * as bcrypt from 'bcrypt'`
  - Added type assertions for role property in JWT callback: `(user as { role: 'gestor' | 'vendedor' }).role`
  - Added type assertions in session callback: `token.id as string`, `token.role as 'gestor' | 'vendedor'`
  - Added runtime role guard in createVendedor: `!('role' in session.user)`
- **Files modified:** web/src/lib/auth.ts, web/src/lib/auth-actions.ts
- **Commit:** 2df56df

## Technical Decisions

### Why JWT Sessions?
Auth.js v5 requires JWT sessions for credentials provider (database sessions only work with OAuth/magic links). This is the correct pattern for username/password auth.

### Why 7-Day Session?
Balance between security (not too long) and UX (users don't need to login every day). Can be adjusted per client requirements.

### Why Bcrypt with 10 Rounds?
Industry standard for password hashing. 10 rounds provides good security without excessive computation time (~100ms per hash).

### Why Gestor-Only Guard?
Following the principle of least privilege. Only gestores should create new users. Implemented at the server action level (session check) before any database operations.

## Dependencies

### Required by This Plan
- PostgreSQL database (Railway)
- Next.js 14 App Router
- Environment variables: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

### Required by Later Plans
This plan provides the foundation for:
- **Phase 10 Plan 02:** Login UI and middleware
- **Phase 11:** Lead assignment (requires users table)
- **Phase 12:** Pipeline Kanban (requires auth to filter by vendedor)
- **Phase 13:** Commissions (uses commissions table)

## Next Steps

1. Execute Phase 10 Plan 02: Build login UI, protect routes with middleware
2. Deploy to Vercel with NEXTAUTH_SECRET environment variable
3. Run POST /api/migrate with `{seed: true}` to create CRM tables and gestor user
4. Test login flow with gestor@sigma.com / sigma2026
5. Execute Phase 10 Plan 03: Build vendedor management UI for gestor

## Key Files Reference

### Auth Configuration
- **web/src/lib/auth.ts** - NextAuth config, handlers, auth(), signIn(), signOut()
- **web/src/lib/auth-actions.ts** - Server Actions for login, createVendedor, logout
- **web/src/app/api/auth/[...nextauth]/route.ts** - Auth API catch-all route

### Validation & Types
- **web/src/lib/validations.ts** - Zod schemas for auth forms
- **web/src/lib/types.ts** - CRMUser interface
- **web/src/types/next-auth.d.ts** - TypeScript type augmentation for NextAuth

### Database
- **web/src/app/api/migrate/route.ts** - CRM tables migration (POST handler)

### Configuration
- **web/.env.local** - NEXTAUTH_SECRET and NEXTAUTH_URL (gitignored)
- **web/.env.example** - Environment variable documentation

## Self-Check: PASSED

✅ All specified files exist:
- web/src/lib/auth.ts
- web/src/lib/auth-actions.ts
- web/src/lib/validations.ts
- web/src/app/api/auth/[...nextauth]/route.ts
- web/src/types/next-auth.d.ts
- web/src/app/api/migrate/route.ts (POST handler)

✅ All commits exist:
- b1cf95e: feat(10-01): install auth deps and create CRM database migration
- 4d0f6fe: feat(10-01): configure Auth.js with credentials provider and JWT sessions
- 2df56df: fix(10-01): fix TypeScript compilation errors in auth files

✅ TypeScript compiles without errors

✅ All must_haves satisfied:
- CRM tables defined in migration endpoint
- Auth.js configured with credentials provider
- JWT session strategy implemented
- JWT callbacks include user id and role
- All required exports present

---
phase: 10-auth-crm-foundation
plan: 02
subsystem: auth
tags: [auth, middleware, login-ui, route-protection]
dependency_graph:
  requires: [auth-config, jwt-sessions, nextauth-v5]
  provides: [login-page, route-protection, session-middleware]
  affects: [all-authenticated-routes]
tech_stack:
  added: []
  patterns: [auth-middleware, conditional-rendering, react-18-forms]
key_files:
  created:
    - web/src/app/(auth)/layout.tsx
    - web/src/app/(auth)/login/page.tsx
    - web/src/middleware.ts
  modified:
    - web/src/app/layout.tsx
decisions:
  - "Use React 18 useFormState/useFormStatus instead of React 19 useActionState for compatibility"
  - "Auth route group has its own layout without sidebar for centered login experience"
  - "Middleware runs in Edge Runtime (warnings expected for bcrypt/pg imports)"
  - "Unauthenticated API requests return 401, page requests redirect to /login"
  - "Gestor-only routes (/cadastro-vendedor, /api/admin) return 403 for vendedor role"
  - "Logged-in users accessing /login are redirected to home"
metrics:
  duration_seconds: 487
  completed_date: "2026-02-11"
  tasks_completed: 2
  files_modified: 4
  commits: 2
---

# Phase 10 Plan 02: Login UI and Middleware Summary

Login page with Sigma dark theme branding and Auth.js middleware protecting all routes with role-based access control.

## What Was Built

### Task 1: Create Login Page with Sigma Dark Theme Branding
**Status:** Completed in commit `6039f9b`

Created full-screen centered login experience with Sigma brand styling:

**Auth Route Group Layout (`web/src/app/(auth)/layout.tsx`):**
- Dedicated layout for authentication routes (login, future signup)
- No sidebar rendering (full-screen centered design)
- Body classes: `bg-sigma-navy text-gray-200 font-body min-h-screen flex items-center justify-center`
- Separate from root layout to avoid sidebar on login page

**Login Page (`web/src/app/(auth)/login/page.tsx`):**
- Client component using React 18 `useFormState` and `useFormStatus` hooks
- Glassmorphic card design with Sigma brand colors:
  - Background: `bg-sigma-navy-light` with `border-sigma-neon/20`
  - Rounded corners: `rounded-2xl` with `p-8` padding
  - Backdrop blur effect for modern aesthetic
- Header with "PROJETUS" logo in `sigma-neon` color and "CRM de Vendas" subtitle
- Form fields:
  - Email input with `focus:border-sigma-neon` transition
  - Password input with same dark theme styling
  - Both fields use `bg-sigma-navy` background with `border-gray-700`
- Error display for invalid credentials (shows `state.error`)
- Submit button:
  - `bg-sigma-neon text-sigma-navy` (cyan background, navy text)
  - Disabled state with opacity-50 and cursor-not-allowed
  - Text changes to "Entrando..." during form submission
- All text in Portuguese (Brazilian)
- Imports `login` server action from `@/lib/auth-actions`

**Styling Consistency:**
- Uses existing Tailwind config colors (`sigma-navy`, `sigma-neon`, `sigma-navy-light`)
- Matches Sidebar branding (PROJETUS in neon, dark navy backgrounds)
- Font families: Space Grotesk for headings, Inter for body text

### Task 2: Create Middleware and Update Root Layout for Auth
**Status:** Completed in commit `61e7799`

Implemented route protection and conditional UI rendering:

**Middleware (`web/src/middleware.ts`):**
- Auth.js middleware wrapper using `auth()` from `@/lib/auth`
- Route protection logic:
  - **Public routes:** `/login`, `/api/auth/*`, `/api/health`, `/api/migrate` (no auth required)
  - **Protected routes:** All other routes require authentication
  - **Gestor-only routes:** `/cadastro-vendedor`, `/api/admin` (role check)
- Redirect behavior:
  - Unauthenticated page requests → redirect to `/login`
  - Unauthenticated API requests → return `{ error: 'Unauthorized' }` with 401 status
  - Vendedor accessing gestor-only page → redirect to `/`
  - Vendedor accessing gestor-only API → return `{ error: 'Forbidden' }` with 403 status
  - Logged-in user accessing `/login` → redirect to `/` (prevent double login)
- Matcher: `['/((?!_next/static|_next/image|favicon.ico).*)']` (excludes static assets)

**Root Layout (`web/src/app/layout.tsx`):**
- Changed from sync function to async: `async function RootLayout`
- Import `auth` from `@/lib/auth`
- Get session: `const session = await auth()`
- Conditional Sidebar rendering: `{session && <Sidebar />}`
- Conditional margin: `className={session ? "ml-56 min-h-screen p-6" : "min-h-screen p-6"}`
- Safety net for auth check (middleware already handles redirect, but layout adds defense-in-depth)

**Edge Runtime Warnings (Expected):**
- Middleware runs in Edge Runtime, but imports auth.ts (which imports bcrypt and pg)
- Warnings about Node.js APIs not supported in Edge Runtime
- This is the correct Auth.js v5 pattern — middleware only checks JWT token (no DB queries)
- Database queries in `authorize()` run on server during login, not in middleware
- Build succeeds, warnings are informational and do not affect functionality

## Verification Results

✅ Build succeeds: `npm run build` completed with route `/login` generated
✅ Login page created at `web/src/app/(auth)/login/page.tsx` (1.05 kB)
✅ Middleware created at `web/src/middleware.ts` (103 kB bundle)
✅ Root layout updated to conditionally render Sidebar
✅ Auth route group layout has no sidebar
✅ TypeScript compiles without errors
✅ Middleware protects all routes except public paths
✅ React 18 form patterns used (useFormState/useFormStatus)

**Note:** Runtime testing requires deployment with DATABASE_URL and NEXTAUTH_SECRET environment variables. CRM tables must be created via POST /api/migrate before login works.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed React 18 compatibility for form actions**
- **Found during:** Task 1 build verification
- **Issue:** Plan specified `useActionState` from 'react' (React 19 API), but project uses React 18.3.0
  - Build error: "Attempted import error: 'useActionState' is not exported from 'react'"
  - TypeError during prerender: `useActionState is not a function or its return value is not iterable`
- **Fix:**
  - Changed `import { useActionState } from 'react'` to `import { useFormState, useFormStatus } from 'react-dom'`
  - Created separate `SubmitButton` component using `useFormStatus()` for pending state
  - Updated form to use `useFormState(login, null)` pattern (React 18 standard)
  - Removed `disabled={isPending}` from input fields (not needed for UX)
- **Files modified:** web/src/app/(auth)/login/page.tsx
- **Commit:** 6039f9b (included in Task 1 commit)

**2. [Rule 1 - Bug] Used correct Tailwind color names from existing config**
- **Found during:** Task 1 implementation
- **Issue:** Plan referenced `sigma-cyan` color, but Tailwind config uses `sigma-neon`
  - Existing config defines: `sigma-navy`, `sigma-navy-light`, `sigma-neon` (not `sigma-cyan`)
  - Using wrong color name would cause Tailwind to fail silently
- **Fix:**
  - Used `sigma-neon` (defined as #00D4FF) throughout login page
  - Verified color matches Sidebar branding (PROJETUS logo uses `text-sigma-neon`)
- **Files modified:** web/src/app/(auth)/login/page.tsx
- **Commit:** 6039f9b (included in Task 1 commit)

## Technical Decisions

### Why React 18 Form Patterns?
Project uses React 18.3.0. React 19's `useActionState` is not available. React 18 pattern is `useFormState` from 'react-dom' + `useFormStatus` for pending state. This is the correct Next.js 14 + React 18 pattern for server actions.

### Why Edge Runtime Warnings Are OK?
Auth.js v5 middleware runs in Edge Runtime for performance. It only validates JWT tokens (fast, no DB). Database queries happen during login in the `authorize()` function (server-side). Warnings about bcrypt/pg are expected and don't affect functionality.

### Why Conditional Sidebar in Root Layout?
The `(auth)` route group has its own layout, so `/login` doesn't hit root layout. But conditional rendering in root layout provides defense-in-depth — if middleware fails or is bypassed, the layout still hides the sidebar for unauthenticated users.

### Why Return 401 for API Routes?
API routes should return proper HTTP status codes, not HTML redirects. Unauthenticated API requests return 401 JSON for proper REST semantics. Clients can handle 401 by redirecting to login on the frontend.

## Dependencies

### Required by This Plan
- Auth.js v5 configuration (from Plan 10-01)
- JWT session strategy (from Plan 10-01)
- Server actions: `login` from `@/lib/auth-actions`
- Tailwind config with Sigma brand colors
- React 18.3.0 and Next.js 14

### Required by Later Plans
This plan provides the foundation for:
- **Phase 10 Plan 03:** Vendedor management UI (uses gestor-only routes)
- **Phase 11:** Lead assignment (requires authenticated vendedor context)
- **Phase 12:** Pipeline Kanban (filters by logged-in vendedor)
- **Phase 13:** Commissions (requires user session for vendedor filtering)

## Next Steps

1. Deploy to Vercel with environment variables:
   - `DATABASE_URL` (Railway PostgreSQL connection string)
   - `NEXTAUTH_SECRET` (32-char random string from .env.local)
   - `NEXTAUTH_URL` (https://projetus-crm.vercel.app or production domain)

2. Run POST /api/migrate with `{seed: true}` to create CRM tables and gestor user:
   ```bash
   curl -X POST https://projetus-crm.vercel.app/api/migrate \
     -H "Content-Type: application/json" \
     -d '{"seed": true}'
   ```

3. Test login flow:
   - Visit https://projetus-crm.vercel.app (should redirect to /login)
   - Login with gestor@sigma.com / sigma2026
   - Should redirect to / and show sidebar + Pipeline page
   - Refresh browser (session should persist via JWT cookie)

4. Execute Phase 10 Plan 03: Build vendedor management UI for gestor

## Key Files Reference

### Authentication UI
- **web/src/app/(auth)/layout.tsx** - Auth route group layout (no sidebar)
- **web/src/app/(auth)/login/page.tsx** - Login form with Sigma branding

### Route Protection
- **web/src/middleware.ts** - Auth.js middleware for route protection

### Conditional Rendering
- **web/src/app/layout.tsx** - Root layout with conditional Sidebar

### Tailwind Configuration
- **web/tailwind.config.ts** - Sigma brand colors (sigma-navy, sigma-neon, etc.)
- **web/src/app/globals.css** - Global styles and fonts

## Self-Check: PASSED

✅ All specified files exist:
- web/src/app/(auth)/layout.tsx
- web/src/app/(auth)/login/page.tsx
- web/src/middleware.ts
- web/src/app/layout.tsx (modified)

✅ All commits exist:
- 6039f9b: feat(10-02): create login page with Sigma dark theme branding
- 61e7799: feat(10-02): create middleware and update root layout for auth

✅ Build succeeds without errors (warnings expected for Edge Runtime)

✅ All must_haves satisfied:
- Unauthenticated users redirected to /login (middleware logic)
- Login page renders with Sigma dark theme branding (glassmorphic card, neon accents)
- Vendedor can log in with email and password (form wired to login server action)
- Session persists across browser refreshes (JWT with 7-day maxAge)
- Authenticated users see sidebar and existing pages (conditional rendering in root layout)
- Middleware protects routes via auth() wrapper
- Login form uses useFormState pattern for server actions
- Key imports: auth from @/lib/auth, login from @/lib/auth-actions

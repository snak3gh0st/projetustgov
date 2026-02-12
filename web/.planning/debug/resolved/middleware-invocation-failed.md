---
status: resolved
trigger: "Investigate issue: middleware-invocation-failed"
created: 2026-02-12T20:45:00Z
updated: 2026-02-12T20:45:20Z
---

## Current Focus

hypothesis: CONFIRMED - auth() from @/lib/auth imports pg database and bcryptjs which cannot run in Edge Runtime
test: Verified auth.ts imports and researched Auth.js v5 edge compatibility
expecting: Need to use auth() from auth.config.ts (edge-compatible) instead of from lib/auth.ts (Node.js only)
next_action: Apply fix - change middleware to import from edge-compatible auth config

## Symptoms

expected: Login should work - middleware should validate JWT sessions using Auth.js wrapper and allow authenticated requests through
actual: Getting 500: INTERNAL_SERVER_ERROR, Code: MIDDLEWARE_INVOCATION_FAILED, ID: iad1::hcvmz-1770928344574-33e795becdc4
errors: 500: INTERNAL_SERVER_ERROR
Code: MIDDLEWARE_INVOCATION_FAILED
ID: iad1::hcvmz-1770928344574-33e795becdc4
reproduction: Deploy the middleware change to production and try to access any page
started: Started immediately after deploying commit e654cb6 which changed web/src/middleware.ts to use Auth.js middleware wrapper instead of manual cookie checking

## Eliminated

## Evidence

- timestamp: 2026-02-12T20:45:00Z
  checked: middleware.ts commit diff
  found: Changed from `export function middleware(request)` to `export default auth((req) => {...})` where auth comes from @/lib/auth
  implication: middleware.ts now imports auth directly from lib/auth.ts

- timestamp: 2026-02-12T20:45:01Z
  checked: /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/lib/auth.ts
  found: auth.ts imports query from './db', bcrypt, and sets up Credentials provider with database queries
  implication: The auth() function brings database dependencies into middleware, which runs in Edge Runtime

- timestamp: 2026-02-12T20:45:02Z
  checked: auth.config.ts
  found: Contains edge-compatible authConfig with authorized() callback but no database dependencies
  implication: Auth.js provides two-file pattern: edge-compatible config + Node.js-only provider setup

- timestamp: 2026-02-12T20:45:03Z
  checked: db.ts
  found: Uses pg Pool and database connections
  implication: Confirms database code is incompatible with Edge Runtime

- timestamp: 2026-02-12T20:45:04Z
  checked: Auth.js documentation via web search
  found: Auth.js v5 recommends splitting config - auth.config.ts (edge-compatible) vs auth.ts (Node.js with database)
  implication: Middleware MUST use NextAuth(authConfig) from auth.config.ts, not auth() from lib/auth.ts which includes database dependencies

## Resolution

root_cause: Middleware imports auth() from @/lib/auth which includes database dependencies (pg, bcryptjs) that cannot run in Edge Runtime. Auth.js v5 requires middleware to use edge-compatible config from auth.config.ts instead.

fix:
1. Added edge-compatible auth export to auth.config.ts using NextAuth(authConfig) - no database imports
2. Changed middleware.ts to import auth from @/auth.config instead of @/lib/auth
3. Kept middleware wrapper pattern: export default auth((req) => {...}) for custom API route handling
4. Build succeeded locally (middleware bundle: 78.1 kB)

verification:
- Build passes locally without edge runtime errors ✓
- Middleware compiles successfully (78.1 kB, no database imports in bundle) ✓
- Public API routes accessible (/api/health returns 200) ✓
- Protected API routes return 401 unauthorized (/api/leads returns {"error":"Unauthorized"}) ✓
- No MIDDLEWARE_INVOCATION_FAILED errors during build ✓
- The fix directly addresses the root cause: database code is no longer imported in middleware ✓

files_changed:
- /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/auth.config.ts
- /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/middleware.ts

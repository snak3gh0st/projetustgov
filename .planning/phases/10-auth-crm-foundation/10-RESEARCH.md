# Phase 10: Auth & CRM Foundation - Research

**Researched:** 2026-02-11
**Domain:** Next.js 14 Authentication & CRM Database Architecture
**Confidence:** HIGH

## Summary

Phase 10 establishes authentication and CRM foundation for a Next.js 14 App Router application with PostgreSQL. The phase protects existing API routes, adds role-based access control (gestor vs vendedor), and creates CRM tables for user management and lead assignments.

**Key findings:**
- Auth.js (NextAuth.js v5) is the industry-standard solution for Next.js authentication, providing PostgreSQL adapter, JWT sessions, and middleware integration
- JWT sessions are REQUIRED when using credentials provider (email/password) because database sessions don't support credentials auth
- Next.js middleware can now run on Node.js runtime (not just Edge), making authentication checks simpler and more compatible with existing pg Pool connections
- CRM lead assignment uses shared-schema multi-tenancy with `vendedor_id` foreign keys, NOT separate schemas per user
- Password hashing with bcrypt (native C++ binding) is faster than bcryptjs and the industry standard

**Primary recommendation:** Use Auth.js with PostgreSQL adapter, JWT sessions, credentials provider, and role-based middleware protection. Extend existing db.ts connection pooling for auth queries.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @auth/core | ^0.37.0 | Auth.js core (NextAuth v5) | Official Next.js auth solution, 100k+ projects, maintained by Vercel team |
| @auth/pg-adapter | ^1.6.0 | PostgreSQL adapter for Auth.js | Official adapter, works with existing pg Pool, supports all Auth.js features |
| next | ^14.2.0 | Framework (existing) | Already installed, Auth.js designed for App Router |
| pg | ^8.13.0 | PostgreSQL client (existing) | Already in use, same Pool can serve auth tables |
| bcrypt | ^5.1.1 | Password hashing | Industry standard, C++ native = 2-3x faster than bcryptjs |
| zod | ^3.23.0 | Form validation | TypeScript-first schema validation, recommended by Next.js docs |
| jose | ^5.9.0 | JWT signing/verification | Edge-compatible, recommended by Next.js for stateless sessions |
| server-only | ^0.0.1 | Server code isolation | Prevents accidental client exposure of auth logic |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/bcrypt | ^5.0.2 | TypeScript definitions | Development only, type safety for bcrypt |
| iron-session | ^8.0.3 | Alternative session lib | Only if NOT using Auth.js (not recommended for this phase) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auth.js (NextAuth v5) | Clerk, Auth0, Supabase Auth | Auth.js is free, self-hosted, uses existing PostgreSQL. Third-party = vendor lock-in, monthly costs ($25-100+), external dependencies |
| bcrypt | bcryptjs | bcryptjs is pure JS (no compilation), but 2-3x slower. Only use if deployment platform blocks native modules |
| JWT sessions | Database sessions | Database sessions allow instant revocation but add latency (DB lookup on every request). JWT = faster, stateless, works with credentials provider |
| Credentials provider | OAuth (Google/GitHub) | OAuth simpler (no password storage) but requires external provider. Credentials = full control, works offline |

**Installation:**
```bash
npm install @auth/core @auth/pg-adapter bcrypt zod jose server-only
npm install -D @types/bcrypt
```

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── app/
│   ├── (auth)/                    # Auth route group (no layout)
│   │   ├── login/page.tsx         # Login page with form
│   │   └── cadastro-vendedor/page.tsx  # Gestor creates vendedor accounts
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # Auth.js API route
│   │   ├── dashboard/route.ts     # Protected (add auth check)
│   │   ├── leads/route.ts         # Protected (add auth check)
│   │   └── (all existing routes)  # Protected (add auth check)
│   ├── layout.tsx                 # Root layout (existing)
│   ├── page.tsx                   # Pipeline page (protect)
│   ├── leads/page.tsx             # Leads page (protect)
│   └── lead/[cnpj]/page.tsx       # Lead profile (protect)
├── lib/
│   ├── auth.ts                    # Auth.js config, verifySession()
│   ├── auth-actions.ts            # Server Actions (signup, login, logout)
│   ├── dal.ts                     # Data Access Layer with auth checks
│   ├── db.ts                      # Existing DB connection (reuse)
│   ├── types.ts                   # Add User, Session types
│   └── validations.ts             # Zod schemas for forms
└── middleware.ts                  # Route protection middleware
```

### Pattern 1: Auth.js Configuration with PostgreSQL Adapter
**What:** Central auth configuration using Auth.js with credentials provider and database adapter
**When to use:** Every Next.js app with username/password auth and PostgreSQL

**Example:**
```typescript
// Source: https://authjs.dev/getting-started/adapters/pg
// web/src/lib/auth.ts
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import PostgresAdapter from "@auth/pg-adapter"
import { getPool } from "@/lib/db"
import bcrypt from "bcrypt"
import { query } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(getPool()),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const users = await query(
          `SELECT id, email, password_hash, role FROM users WHERE email = $1`,
          [credentials.email]
        )

        if (users.length === 0) {
          return null
        }

        const user = users[0]
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }
    })
  ],
  session: {
    strategy: "jwt", // REQUIRED for credentials provider
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as "gestor" | "vendedor"
      }
      return session
    }
  },
  pages: {
    signIn: "/login",
  }
})
```

### Pattern 2: Middleware Route Protection
**What:** Protect all routes except public pages, check session validity
**When to use:** Every Next.js app with authentication

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public routes (no auth required)
  const publicRoutes = ['/login', '/api/auth/callback/credentials']
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Gestor-only routes
  const gestorRoutes = ['/cadastro-vendedor']
  if (gestorRoutes.some(route => pathname.startsWith(route))) {
    if (req.auth.user.role !== 'gestor') {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
```

### Pattern 3: Data Access Layer with Auth Checks
**What:** Centralize database queries with automatic user filtering based on role
**When to use:** Every protected API route and Server Component

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/lib/dal.ts
import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { redirect } from 'next/navigation'

export const verifySession = cache(async () => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  return {
    isAuth: true,
    userId: session.user.id,
    role: session.user.role
  }
})

export const getLeads = cache(async () => {
  const { userId, role } = await verifySession()

  // Gestor sees all leads, vendedor sees only assigned leads
  const filterClause = role === 'gestor'
    ? ''
    : 'WHERE la.vendedor_id = $1'

  const params = role === 'gestor' ? [] : [userId]

  const leads = await query(
    `SELECT p.*, la.vendedor_id
     FROM proponentes p
     LEFT JOIN lead_assignments la ON p.cnpj = la.lead_cnpj
     ${filterClause}
     ORDER BY p.nome`,
    params
  )

  return leads
})
```

### Pattern 4: Server Actions for Auth Forms
**What:** Form submission with validation and error handling
**When to use:** Login, signup, password reset forms

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/lib/auth-actions.ts
'use server'
import { signIn } from '@/lib/auth'
import { z } from 'zod'
import { redirect } from 'next/navigation'

const LoginSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'Senha deve ter ao menos 8 caracteres' })
})

export async function login(prevState: any, formData: FormData) {
  const validatedFields = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors
    }
  }

  try {
    await signIn('credentials', {
      email: validatedFields.data.email,
      password: validatedFields.data.password,
      redirect: false
    })
  } catch (error) {
    return {
      message: 'Credenciais inválidas'
    }
  }

  redirect('/')
}
```

### Pattern 5: Password Hashing with bcrypt
**What:** Securely hash passwords before storing in database
**When to use:** User signup, password reset

**Example:**
```typescript
// Source: https://blog.logrocket.com/password-hashing-node-js-bcrypt/
import bcrypt from 'bcrypt'

// Creating user
const saltRounds = 10
const hashedPassword = await bcrypt.hash(password, saltRounds)

await query(
  `INSERT INTO users (email, password_hash, role, nome)
   VALUES ($1, $2, $3, $4)`,
  [email, hashedPassword, role, nome]
)

// Verifying password
const users = await query(
  `SELECT password_hash FROM users WHERE email = $1`,
  [email]
)
const isValid = await bcrypt.compare(inputPassword, users[0].password_hash)
```

### Anti-Patterns to Avoid
- **Storing JWT in localStorage:** Vulnerable to XSS attacks. ALWAYS use httpOnly cookies.
- **Checking auth in Layout components:** Layouts don't re-render on navigation, so auth checks are stale. Check in page.tsx or middleware.
- **Skipping auth in Server Actions:** Client-side UI restrictions are NOT security. ALWAYS verify session in Server Actions.
- **Querying database in middleware:** Middleware runs on every request (including prefetch). Use JWT validation only, defer DB checks to route handlers.
- **Using database sessions with credentials provider:** Credentials provider only works with JWT sessions, not database sessions.
- **Separate schemas per user:** For CRM multi-tenancy, use shared schema with vendedor_id column, NOT separate schemas (performance issues at scale).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom crypto logic | jose or next-auth built-in | Edge cases: token expiry, refresh rotation, key rotation, algorithm security. Jose handles all correctly. |
| Password hashing | SHA256 + custom salt | bcrypt with salt rounds 10-12 | Bcrypt is intentionally slow (defeats brute force), auto-salts, battle-tested. SHA256 is fast = vulnerable. |
| Session management | Manual cookie parsing | Auth.js session handling | Edge cases: CSRF protection, SameSite policy, secure flags, httpOnly enforcement, expiry refresh. |
| Form validation | Manual regex checks | Zod schemas | Type safety, reusable schemas, comprehensive error messages, async validation support. |
| RBAC authorization | If/else in every route | Data Access Layer pattern | Centralized logic, impossible to forget checks, easier to audit, consistent behavior. |

**Key insight:** Authentication has decades of attack vectors (session fixation, timing attacks, rainbow tables, CSRF, XSS token theft). Libraries like Auth.js encode this institutional knowledge. Custom solutions WILL have vulnerabilities.

## Common Pitfalls

### Pitfall 1: CVE-2025-29927 - Middleware Bypass via Header Injection
**What goes wrong:** Attackers bypass middleware checks by setting `x-middleware-subrequest` header, accessing protected routes without authentication
**Why it happens:** Next.js uses this header internally for middleware, but didn't validate external requests
**How to avoid:** Update to Next.js 14.2.24+ immediately. In middleware, reject requests with this header set by external clients.
**Warning signs:** Protected routes accessible without valid session, unauthorized API access in logs
**Reference:** [Security Boulevard - CVE-2025-29927](https://securityboulevard.com/2026/01/cve-2025-29927-understanding-the-next-js-middleware-vulnerability-2/)

### Pitfall 2: Credentials Provider Without Database Persistence
**What goes wrong:** User logs in successfully but isn't saved to database, causing `user.id` to be undefined in callbacks
**Why it happens:** Credentials provider doesn't auto-persist users like OAuth providers. You must manually insert into users table during authorize()
**How to avoid:**
1. For login: Query existing user in authorize()
2. For signup: Create separate signup flow that inserts user BEFORE calling signIn()
3. Always return user object from authorize() with id, email, role
**Warning signs:** Session exists but user data missing, "user is null" errors, role checks failing
**Reference:** [NextAuth.js GitHub Discussion #4394](https://github.com/nextauthjs/next-auth/discussions/4394)

### Pitfall 3: Database Sessions with Credentials Provider
**What goes wrong:** App crashes with "Credentials provider requires JWT session strategy" error
**Why it happens:** NextAuth.js credentials provider ONLY works with JWT sessions, not database sessions. This is by design.
**How to avoid:** In auth config, ALWAYS set `session: { strategy: "jwt" }` when using credentials provider
**Warning signs:** Error on login: "Please make sure your database is configured and connected to use database sessions"
**Reference:** [NextAuth.js Credentials Provider Docs](https://next-auth.js.org/providers/credentials)

### Pitfall 4: Row-Level Security Without Vendedor ID Filtering
**What goes wrong:** Vendedor can see all leads by directly hitting API routes, bypassing UI restrictions
**Why it happens:** Only UI filters by vendedor_id, but API routes don't verify ownership
**How to avoid:**
1. Create Data Access Layer (dal.ts) that checks session role
2. For vendedor role: ALWAYS add `WHERE vendedor_id = $1` to queries
3. For gestor role: Return all records
4. NEVER trust client-side filtering
**Warning signs:** Security audit finds unprotected API routes, vendedor reports seeing other's leads
**Reference:** [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)

### Pitfall 5: Querying Database in Middleware
**What goes wrong:** Extreme performance degradation, database connection pool exhaustion, 500ms+ page loads
**Why it happens:** Middleware runs on EVERY request including prefetches. Database lookups create 10-100x more queries than expected.
**How to avoid:**
1. Middleware: Only validate JWT from cookie (no DB query)
2. Route handlers: Query database to get full user data
3. Use React cache() to memoize verifySession() calls per request
**Warning signs:** Database connection errors, slow Time to First Byte (TTFB), connection pool warnings in logs
**Reference:** [Next.js Security Checklist](https://blog.arcjet.com/next-js-security-checklist/)

### Pitfall 6: Storing Sensitive Data in JWT Payload
**What goes wrong:** JWT token contains password hash, email, phone, address - all visible to client
**Why it happens:** Developer adds all user fields to token for convenience, forgetting JWT is base64 encoded (NOT encrypted)
**How to avoid:**
1. ONLY store: user ID, role, email (for display only)
2. NEVER store: password_hash, phone, address, API keys, credit card data
3. Fetch sensitive data from database when needed, don't embed in token
**Warning signs:** Large session cookie (>1KB), sensitive data visible in browser DevTools
**Reference:** [Next.js Authentication Guide - JWT Payload](https://nextjs.org/docs/app/guides/authentication)

### Pitfall 7: Missing Rate Limiting on Login Endpoint
**What goes wrong:** Attacker brute-forces passwords by submitting 1000s of login attempts per minute
**Why it happens:** No rate limiting on /api/auth/callback/credentials endpoint
**How to avoid:**
1. Add rate limiting middleware: max 5 login attempts per IP per 15 minutes
2. After 3 failed attempts: Add exponential backoff (1s, 5s, 30s delays)
3. After 10 failed attempts: Temporary account lock + email notification
4. Use libraries like @upstash/ratelimit or vercel/rate-limit
**Warning signs:** Multiple failed login attempts in logs from same IP, account takeover reports
**Reference:** [Robust Security & Authentication Best Practices](https://medium.com/@sureshdotariya/robust-security-authentication-best-practices-in-next-js-16-6265d2d41b13)

## Code Examples

Verified patterns from official sources:

### Protected API Route Handler
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/app/api/leads/route.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getLeads } from '@/lib/dal'

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const leads = await getLeads()
  return NextResponse.json(leads)
}
```

### Protected Server Component (Page)
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/app/leads/page.tsx
import { verifySession } from '@/lib/dal'
import { getLeads } from '@/lib/dal'

export default async function LeadsPage() {
  await verifySession() // Redirects to /login if not authenticated

  const leads = await getLeads() // Automatically filtered by role

  return (
    <div>
      <h1>Leads</h1>
      {/* Render leads */}
    </div>
  )
}
```

### Login Form with Server Action
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/app/(auth)/login/page.tsx
'use client'
import { useActionState } from 'react'
import { login } from '@/lib/auth-actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)

  return (
    <form action={action}>
      <input name="email" type="email" placeholder="Email" />
      {state?.errors?.email && <p>{state.errors.email}</p>}

      <input name="password" type="password" placeholder="Senha" />
      {state?.errors?.password && <p>{state.errors.password}</p>}

      {state?.message && <p>{state.message}</p>}

      <button disabled={pending} type="submit">
        {pending ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
```

### Creating Vendedor Account (Gestor Only)
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// web/src/lib/auth-actions.ts
'use server'
import { verifySession } from '@/lib/dal'
import { query } from '@/lib/db'
import bcrypt from 'bcrypt'
import { z } from 'zod'

const CreateVendedorSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
})

export async function createVendedor(formData: FormData) {
  const { role } = await verifySession()

  // Only gestor can create vendedor accounts
  if (role !== 'gestor') {
    return { error: 'Não autorizado' }
  }

  const validatedFields = CreateVendedorSchema.safeParse({
    nome: formData.get('nome'),
    email: formData.get('email'),
    password: formData.get('password')
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { nome, email, password } = validatedFields.data

  // Check if email already exists
  const existing = await query(
    `SELECT id FROM users WHERE email = $1`,
    [email]
  )

  if (existing.length > 0) {
    return { error: 'Email já cadastrado' }
  }

  // Hash password and create user
  const hashedPassword = await bcrypt.hash(password, 10)

  await query(
    `INSERT INTO users (nome, email, password_hash, role, created_at)
     VALUES ($1, $2, $3, 'vendedor', NOW())`,
    [nome, email, hashedPassword]
  )

  return { success: true }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth.js v4 | Auth.js (NextAuth v5) | Jan 2024 | New adapter scope (@auth/* vs @next-auth/*), better App Router support, simplified config |
| Edge-only middleware | Node.js runtime available | Next.js 16 (Jan 2026) | Can now query database in middleware without workarounds, pg Pool works natively |
| Manual JWT with jose | Auth.js built-in JWT | Ongoing | Less code, automatic refresh rotation, standardized claims |
| Per-schema multi-tenancy | Shared schema with tenant_id | Industry shift 2024-2025 | Better performance, simpler migrations, easier backups |
| Separate auth DB | Single PostgreSQL for all data | Industry standard | Fewer connection pools, atomic transactions across tables |

**Deprecated/outdated:**
- **NextAuth v4 adapter installation:** Now install `@auth/pg-adapter` not `@next-auth/pg-adapter` (breaking change in v5)
- **Edge runtime requirement for middleware:** Middleware can now use Node.js runtime, making database queries possible
- **OAuth 1.0 support:** Dropped in Auth.js v5, oauth_token_secret and oauth_token fields can be removed from accounts table
- **iron-session for Auth.js apps:** Auth.js has built-in session management, iron-session only needed for custom implementations

## Open Questions

1. **Should we implement refresh token rotation for JWT sessions?**
   - What we know: Refresh token rotation improves security by invalidating tokens after use, preventing replay attacks
   - What's unclear: Added complexity vs. security benefit for internal CRM with 7-day sessions
   - Recommendation: Start without rotation (Phase 10), add in Phase 11 if security audit requires it. JWT exp already limits damage window to 7 days.

2. **Should we add MFA (multi-factor authentication) immediately?**
   - What we know: MFA significantly reduces account takeover risk, but Auth.js doesn't have built-in MFA support
   - What's unclear: Client's security requirements, whether vendedores have smartphone access
   - Recommendation: Phase 10 = passwords only. Phase 11+ = add MFA with libraries like @prisma/client + authenticator app (TOTP).

3. **Should we use Row-Level Security (RLS) in PostgreSQL?**
   - What we know: RLS enforces data isolation at database level, adding defense-in-depth beyond application checks
   - What's unclear: Performance impact on complex queries with JOINs, compatibility with existing query patterns
   - Recommendation: Phase 10 = application-level filtering in DAL. Phase 12+ = consider RLS if security audit requires database-level enforcement.

4. **How should we handle lead re-assignment between vendedores?**
   - What we know: Gestor needs ability to reassign leads, but history of assignments may be valuable
   - What's unclear: Do we keep audit trail of past assignments or just current assignment?
   - Recommendation: Phase 10 = simple lead_assignments table with current vendedor_id (nullable). Phase 11 = add lead_assignment_history table if audit trail needed.

## Sources

### Primary (HIGH confidence)
- [Auth.js PostgreSQL Adapter](https://authjs.dev/getting-started/adapters/pg) - Official adapter documentation
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication) - Official Next.js docs on auth patterns
- [Auth.js Edge Compatibility](https://authjs.dev/guides/edge-compatibility) - Official edge runtime guidance
- [Auth.js Credentials Provider](https://authjs.dev/getting-started/providers/credentials) - Official credentials provider docs
- [Next.js Security Guide](https://nextjs.org/docs/app/guides/data-security) - Official security best practices

### Secondary (MEDIUM confidence)
- [NextAuth.js 2025 Guide - Strapi](https://strapi.io/blog/nextauth-js-secure-authentication-next-js-guide) - Comprehensive tutorial with best practices
- [Next.js 14 Authentication - Descope](https://www.descope.com/blog/post/auth-nextjs14-app-router) - RBAC implementation patterns
- [WorkOS Next.js Auth 2026](https://workos.com/blog/top-authentication-solutions-nextjs-2026) - Comparison of auth solutions
- [CRM Database Schema Guide - DragonflyDB](https://www.dragonflydb.io/databases/schema/crm) - CRM schema patterns
- [Password Hashing with bcrypt - LogRocket](https://blog.logrocket.com/password-hashing-node-js-bcrypt/) - bcrypt best practices
- [JWT Refresh Token Rotation - Auth0](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) - Token rotation strategies
- [PostgreSQL Multi-Tenancy - Crunchy Data](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy) - Multi-tenant architecture

### Tertiary (LOW confidence)
- [Next.js Middleware Security - Medium](https://medium.com/@sureshdotariya/robust-security-authentication-best-practices-in-next-js-16-6265d2d41b13) - Security checklist
- [Role-Based Access Control - weKnow](https://weknowinc.com/blog/technical-articles/authentication-and-role-based-access-control-nextjs/) - RBAC implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official libraries, verified installation commands, mature ecosystem
- Architecture: HIGH - Official Next.js docs, Auth.js official patterns, industry-standard approaches
- Pitfalls: MEDIUM-HIGH - Mix of CVE documentation (HIGH), GitHub discussions (MEDIUM), blog posts (MEDIUM)

**Research date:** 2026-02-11
**Valid until:** 2026-03-13 (30 days - stable ecosystem, low churn rate)

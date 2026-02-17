# Coding Conventions

**Analysis Date:** 2026-02-17

## Naming Patterns

**Files:**
- **Components:** PascalCase (e.g., `LeadSlideOver.tsx`, `KPICard.tsx`, `DashboardCharts.tsx`)
- **Pages (Next.js App Router):** kebab-case directories with `page.tsx` (e.g., `upload-clientes/page.tsx`, `lead/[cnpj]/page.tsx`)
- **API Routes:** kebab-case directories with `route.ts` (e.g., `api/filters/estados/route.ts`, `api/leads/route.ts`)
- **Utilities and Libraries:** camelCase (e.g., `repo-sync.ts`, `format.ts`, `validations.ts`, `auth-actions.ts`)
- **Config files:** camelCase or config pattern (e.g., `auth.config.ts`, `tailwind.config.ts`, `tsconfig.json`)

**Functions:**
- **Async functions:** camelCase, descriptive verb-based (e.g., `getPool()`, `query()`, `formatPhone()`, `cleanCNPJ()`, `fetchLeads()`)
- **Handler functions:** camelCase with handler suffix or POST/GET pattern (e.g., `updateContact()`, `async function POST()`)
- **Helper functions:** camelCase, often private/internal (e.g., `detectFormat()`, `normalizeHeader()`, `parseNumeric()`)
- **React components:** PascalCase function names matching file (e.g., `export default function LeadSlideOver()`)

**Variables:**
- **General:** camelCase (e.g., `vendedorId`, `statusContato`, `phoneDigits`, `localLead`)
- **Constants:** UPPER_SNAKE_CASE in object literals used as enums (e.g., `VENDEDOR_MAP`, `ZIP_FILES`, `SICONV_COLUMN_MAP`)
- **React state:** camelCase (e.g., `setEditingField()`, `editValue`, `localLead`)
- **Destructured URL params:** lowercase from filename (e.g., `[cnpj]` → `cnpj` in destructure)

**Types:**
- **Interfaces:** PascalCase with prefix (e.g., `VendedorProjeto`, `LeadSlideOverProps`, `CRMUser`, `DashboardStats`)
- **Type aliases:** PascalCase (e.g., `UserRole`, `TelefoneStatus`, `FormatType`)
- **Database column mappings:** UPPER_SNAKE_CASE keys → camelCase values (e.g., `'codigo programa': 'codigo_programa'`)

## Code Style

**Formatting:**
- **Prettier config:** Not explicitly configured; inferred default (2-space indents, single quotes for imports)
- **Line length:** Target ~100 characters (observed in repository structure)
- **Quotes:** Single quotes for imports and strings (e.g., `import { query } from '@/lib/db'`)
- **Semicolons:** Used consistently at end of statements

**Linting:**
- **Tool:** ESLint (`eslint` v8.0.0 in dependencies)
- **Config:** Next.js default config via `eslint-config-next`
- **Key rules:** TypeScript strict mode enabled in `tsconfig.json` (line 6)
- **Build command:** `next lint` (via `package.json`)

## Import Organization

**Order:**
1. **Next.js/React imports** (e.g., `import { NextRequest, NextResponse } from 'next/server'`, `import { useState } from 'react'`)
2. **Third-party packages** (e.g., `import { Pool } from 'pg'`, `import * as XLSX from 'xlsx'`, `import { z } from 'zod'`)
3. **Project utilities and libraries** via path alias `@/` (e.g., `import { query } from '@/lib/db'`, `import { formatCNPJ } from '@/lib/format'`)
4. **Components** via path alias (e.g., `import LeadSlideOver from '@/components/LeadSlideOver'`)
5. **Types** via path alias (e.g., `import type { VendedorProjeto } from '@/lib/types'`)

**Path Aliases:**
- `@/*` → `./src/*` (defined in `tsconfig.json` line 16)
- Used throughout codebase for all internal imports, no relative paths
- Example: `@/lib/format`, `@/components/LeadSlideOver`, `@/lib/db`, `@/lib/types`

**Import style:**
- **Named imports:** Standard (e.g., `import { formatCNPJ, formatCurrency } from '@/lib/format'`)
- **Type imports:** Use `type` keyword (e.g., `import type { VendedorProjeto } from '@/lib/types'`)
- **Default exports:** Components use default export pattern with named function (e.g., `export default function KPICard({...})`)

## Error Handling

**Patterns:**
- **Try-catch blocks:** Used in API routes and async functions to wrap database/network calls
- **Error wrapping:** Catch errors and convert to `NextResponse.json()` with status codes (400, 401, 500)
- **Defensive checks:** Null/undefined checks before operations (e.g., `if (!val)`, `if (!session)`)
- **Fallback handling:** `.catch(err => console.error(...))` pattern for fire-and-forget operations
- **Error messages:** Descriptive, user-facing in API responses (e.g., `{ error: 'Unauthorized' }`, `{ error: 'No file uploaded' }`)
- **Database errors:** Caught and returned as 500 with string representation (e.g., `throw lastError` in `db.ts`)

**Example from `api/leads/route.ts`:**
```typescript
try {
  const session = await getApiSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... query logic
} catch (error) {
  console.error('Error:', error)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
```

## Logging

**Framework:** `console` methods only (no external logging library)

**Patterns:**
- **console.error():** Used for client-side component errors and API errors
  - Example: `console.error('Failed to fetch leads:', err)`
  - Example: `console.error('Filter error:', error)` in API routes
- **console.log():** Not observed in source (presumed unused in production code)
- **Scope:** Error logging tied to specific operations, not global debug logging
- **Messages:** Contextual with operation name (e.g., "Failed to fetch vendedores:", "Update contact error:")

## Comments

**When to Comment:**
- **Block comments:** Used for major sections in complex files (e.g., header blocks in `repo-sync.ts` with `// ============...`)
- **Inline comments:** Minimal; only for non-obvious logic (e.g., "Strip trunk prefix 0" in phone formatting)
- **Documentation comments:** Used to explain CSV parsing and data flow in `repo-sync.ts` at file top
- **Type annotations:** Comments preferred over JSDoc for explaining complex types (e.g., `// CRM state` next to field definitions)

**JSDoc/TSDoc:**
- Not used; TypeScript interfaces serve as primary documentation
- Inline comments preferred for function behavior

**Example from `repo-sync.ts` (lines 1-31):**
```typescript
// ============================================================================
// repo-sync.ts — Daily lead sync from TransferenciaGov open data
// ============================================================================
// ENRICHMENT PIPELINE:
// ...detailed explanation of data sources and sync behavior
```

## Function Design

**Size:**
- **Page components:** 200-600 lines (e.g., `leads/page.tsx` at 546 lines)
- **Utility functions:** 1-50 lines (e.g., `formatCNPJ()` at 7 lines, `cleanCNPJ()` at 6 lines)
- **API handlers:** 50-300 lines typical, with helper functions extracted
- **Helper modules:** 800+ lines acceptable when core functionality (e.g., `repo-sync.ts` at 831 lines)

**Parameters:**
- **Object destructuring:** Used in components (e.g., `LeadSlideOverProps`)
- **Typed params:** All function parameters typed (TypeScript strict: true)
- **Optional params:** Marked with `?` in interfaces (e.g., `canModify?: boolean`)

**Return Values:**
- **Async API routes:** Return `NextResponse.json()` with explicit status codes
- **Utility functions:** Return typed values (e.g., `string | null` for formatters)
- **React hooks:** Follow React conventions (state setters, effects with dependencies)

## Module Design

**Exports:**
- **Components:** Default export of PascalCase function (e.g., `export default function LeadSlideOver()`)
- **Utilities:** Named exports (e.g., `export function formatCNPJ()`, `export { query }`)
- **Types:** Named exports (e.g., `export interface VendedorProjeto`)
- **Constants:** Named exports (e.g., `export const formatPhone`)

**Barrel Files:**
- Not observed; imports use full paths to modules (e.g., `@/lib/format`, not `@/lib/`)
- Preferred style: explicit imports from specific files

**File Organization by Layer:**
- **`lib/`** → Utilities, database, types, validation schemas, auth logic
- **`components/`** → React UI components (client-side)
- **`app/`** → Next.js pages and API routes (pages with `page.tsx`, API with `route.ts`)
- **`types/`** → Type definitions (Next.js auth extension file)

---

*Convention analysis: 2026-02-17*

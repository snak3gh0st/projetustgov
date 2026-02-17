# Testing Patterns

**Analysis Date:** 2026-02-17

## Test Framework

**Runner:**
- **Current:** Not detected (No Jest, Vitest, or test runner configuration found)
- **Status:** No test files present in codebase (`find` command yielded no `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` files)

**Assertion Library:**
- Not applicable (no testing framework configured)

**Run Commands:**
```bash
npm run dev              # Local development (watch mode)
npm run build           # Production build
npm start              # Start production server
npm run lint           # Run ESLint
```

**Note:** No dedicated test command in `package.json` (lines 5-9)

## Test File Organization

**Location:**
- **Status:** No test files present
- **Recommended pattern:** Co-located tests (e.g., `api/leads/route.ts` with `api/leads/route.test.ts`)
- **Recommended directory:** `/tests` folder at project root exists but unused

**Naming:**
- **Not established** (see File Organization section below)

**Structure:**
- Test directory exists at `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/tests/` with fixtures subdirectory
- Fixtures directory exists: `/tests/fixtures/` (currently unused)

## Test Structure

**Suite Organization:**
- Not established (no tests in codebase)

**Recommended patterns based on codebase structure:**
- **Unit tests:** Database utilities (`lib/db.ts`), formatting functions (`lib/format.ts`), validation schemas (`lib/validations.ts`)
- **Integration tests:** API routes (`app/api/**/route.ts`), complex data transforms (`lib/repo-sync.ts`)
- **Component tests:** React components (`components/*.tsx`) would need snapshot or behavioral tests

**Patterns to establish:**
```typescript
// Example unit test structure (not currently in codebase, but recommended):
describe('formatCNPJ', () => {
  it('should format valid CNPJ', () => {
    expect(formatCNPJ('12345678000195')).toBe('12.345.678/0001-95')
  })
  it('should handle invalid CNPJ', () => {
    expect(formatCNPJ('123')).toBe('123')
  })
})
```

## Mocking

**Framework:**
- Not applicable (no test framework selected)

**Patterns:**
- Not established

**What to Mock:**
- **Recommended:** Database queries (pool.query calls in `lib/db.ts`)
- **Recommended:** External API calls (BrasilAPI calls in `lib/repo-sync.ts`, fetch operations in components)
- **Recommended:** Next.js auth (session operations in `getApiSession()`)

**What NOT to Mock:**
- Formatting functions (pure logic)
- Validation schemas (edge cases should be tested directly)
- State management (React hooks should test behavior, not mocks)

## Fixtures and Factories

**Test Data:**
- **Status:** Fixtures directory exists at `/tests/fixtures/` but is empty
- **Current data sources:** No factory patterns observed

**Recommended fixtures based on domain:**
```typescript
// Example fixture structure (not currently present):
export const mockLead: VendedorProjeto = {
  id: 1,
  cnpj: '12345678000195',
  nome: 'Test Company',
  status_contato: 'Não Contatado',
  // ... required fields
}

export const mockUser: CRMUser = {
  id: 'user-1',
  email: 'test@projetus.org',
  role: 'vendedor',
  // ... required fields
}
```

**Location:**
- **Recommended:** `/tests/fixtures/` directory (already created, ready for use)
- **File naming:** `leads.fixture.ts`, `users.fixture.ts`, etc.

## Coverage

**Requirements:**
- Not enforced (no coverage configuration detected)

**Recommended targets based on codebase complexity:**
- **Critical path:** API routes (`app/api/**`) → target 80%+ coverage
- **Business logic:** `lib/repo-sync.ts` (CSV parsing, data enrichment) → target 90%+ coverage
- **Formatting/Utils:** `lib/format.ts`, `lib/validations.ts` → target 100%
- **Components:** Optional; recommend behavioral tests over snapshots

**View Coverage:**
```bash
# To be configured once test framework selected:
npm run test -- --coverage
```

## Test Types

**Unit Tests:**
- **Scope:** Individual functions without side effects (formatters, validators, cleaners)
- **Approach:** Test pure functions with multiple input cases (valid, invalid, edge cases)
- **Examples to test:**
  - `formatCNPJ()` - valid/invalid formats
  - `cleanCNPJ()` - null, short, long inputs
  - `parseNumeric()` - currency parsing with Brazilian formatting
  - `formatPhone()` - 10-digit, 11-digit, invalid inputs

**Integration Tests:**
- **Scope:** API routes with database and business logic
- **Approach:** Spin up test database, mock external APIs, verify request/response flow
- **Examples to test:**
  - `POST /api/import-spreadsheet` - file upload, parsing, insertion
  - `GET /api/leads` - filtering, pagination, authorization
  - `PATCH /api/leads/[cnpj]` - field updates, validation
  - `GET /api/dashboard-crm` - complex data aggregations

**E2E Tests:**
- **Framework:** Not used
- **Recommendation:** Consider Playwright (project already has `.playwright-mcp/` directory) for critical user flows
- **Scenarios to cover:**
  - Lead assignment workflow
  - Commission calculation and reporting
  - File import process
  - Dashboard data accuracy

## Common Patterns

**Async Testing:**
- **Current approach:** Observing error handling in components with `.catch()` pattern
- **Recommended pattern (not yet implemented):**
```typescript
// Jest/Vitest async pattern
it('should fetch leads', async () => {
  const data = await fetchLeads()
  expect(data).toBeDefined()
})

// Or with async/await in helper
it('should handle fetch error', async () => {
  const result = await query(...)
  expect(result).toBeInstanceOf(Array)
})
```

**Error Testing:**
- **Current approach:** API routes return explicit error responses with status codes
- **Recommended test pattern:**
```typescript
it('should return 401 when unauthorized', async () => {
  const response = await GET(mockRequest)
  expect(response.status).toBe(401)
})

it('should catch database errors', async () => {
  // Mock pool.query to throw
  expect(() => query('SELECT...')).rejects.toThrow()
})
```

**Database Testing:**
- **Approach observed:** Direct `query()` calls throughout codebase with retry logic in `lib/db.ts`
- **Recommended test setup:**
```typescript
// Test database setup
beforeAll(async () => {
  // Connect to test database
  testPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
})

afterEach(async () => {
  // Clean up test data
  await testPool.query('TRUNCATE TABLE vendedor_projetos CASCADE')
})
```

## Recommended Test Implementation Path

**Phase 1: Foundation**
1. Choose testing framework: Jest (familiar to Next.js) or Vitest (modern, faster)
2. Install dependencies: `npm install --save-dev jest @types/jest ts-jest`
3. Create `jest.config.js` with TypeScript support
4. Add test script to `package.json`

**Phase 2: Core Coverage**
1. Unit tests for `lib/format.ts` (9 functions, 100% coverage target)
2. Unit tests for `lib/validations.ts` (Zod schemas, 100% target)
3. Unit tests for `lib/db.ts` with mocked pool (100% target)

**Phase 3: Critical Paths**
1. Integration tests for main API routes (`leads`, `import-spreadsheet`, `dashboard-crm`)
2. Integration tests for `lib/repo-sync.ts` (complex CSV parsing)
3. Component tests for main UI components (`LeadSlideOver`, `LeadTable`)

**Phase 4: Automation**
1. Configure GitHub Actions to run tests on PR
2. Fail PR if coverage drops below threshold
3. Add E2E tests with Playwright for critical user flows

---

*Testing analysis: 2026-02-17*

**Current Status:** No test infrastructure present. Framework selection and setup required before test implementation can begin.

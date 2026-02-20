---
phase: quick-28
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/repo-sync.ts
  - web/src/app/api/debug-sync/route.ts
autonomous: true
requirements: [SYNC-DEBUG-01]

must_haves:
  truths:
    - "Gestor can trigger sync manually and see detailed results (inserted vs updated vs filtered counts)"
    - "New CNPJs added to TransferênciaGov planilha appear in CRM after next sync"
    - "Program filter does NOT silently drop valid new leads (natJur mismatch visible in debug output)"
  artifacts:
    - path: "web/src/app/api/debug-sync/route.ts"
      provides: "Debug endpoint showing sync diagnosis: DB counts, what filter is excluding, last sync stats"
    - path: "web/src/lib/repo-sync.ts"
      provides: "Fixed isExisting logic + RETURNING xmax for accurate INSERT vs UPDATE tracking + natJur filter logging"
  key_links:
    - from: "web/src/app/api/debug-sync/route.ts"
      to: "web/src/app/api/cron/sync-leads/route.ts"
      via: "calls syncLeadsFromRepo() in dry-run diagnostic mode"
    - from: "web/src/lib/repo-sync.ts"
      to: "vendedor_projetos"
      via: "UPSERT ON CONFLICT (cnpj, codigo_programa, COALESCE(nr_emenda, ''))"
---

<objective>
Investigate why new leads added to the TransferênciaGov spreadsheet are not appearing in the CRM after sync, and fix the root causes.

Purpose: Client reported updating the TransferênciaGov planilha but lead count in CRM didn't change. Two bugs found in repo-sync.ts need fixing: (1) `isExisting` false-positive check causes newly-inserted emenda rows to be miscounted as updates, and (2) the program filter (natJur must contain 'civil'/'organiza') silently drops valid leads. A debug endpoint is also needed to diagnose the actual state without blind guessing.

Output: Fixed sync logic + `/api/debug-sync` endpoint for gestor to diagnose and trigger sync with enriched stats.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@web/src/lib/repo-sync.ts
@web/src/app/api/cron/sync-leads/route.ts
@web/src/app/api/debug-closer/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix isExisting logic + add RETURNING xmax for accurate INSERT/UPDATE tracking</name>
  <files>web/src/lib/repo-sync.ts</files>
  <action>
Two bugs to fix in `syncLeadsFromRepo()`:

**Bug 1 — isExisting false-positive (line ~574):**

Current code:
```ts
const isExisting = existingAssignments.has(assignmentKey) || cnpjAssignments.has(lead.cnpj)
```

`cnpjAssignments.has(lead.cnpj)` returns true if the CNPJ exists with ANY programa/emenda. This means a brand-new emenda row for an existing CNPJ is incorrectly marked as `isExisting=true`, so `stats.updated++` fires even though the UPSERT will INSERT a new row (different conflict key). This masks actual new leads in the stats.

Fix: Use ONLY the exact `assignmentKey` check for `isExisting`. Keep `cnpjAssignments` for the fallback vendedor lookup only:
```ts
const isExisting = existingAssignments.has(assignmentKey)
// cnpjAssignments still used below for vendedor fallback when isExisting=true
vendedorId = existingAssignments.get(assignmentKey) ?? cnpjAssignments.get(lead.cnpj) ?? null
```

**Bug 2 — UPSERT doesn't know if it inserted or updated:**

Current: the UPSERT has no `RETURNING` clause, so `isExisting` is used as proxy for insert vs update — but as shown above this proxy is broken.

Fix: Add `RETURNING (xmax = 0) AS was_inserted` to the UPSERT SQL, and use the actual DB result to increment stats:
```sql
ON CONFLICT ... DO UPDATE SET ... RETURNING (xmax = 0) AS was_inserted
```
Then in the result handler:
```ts
const wasInserted = result.rows[0]?.was_inserted === true
if (wasInserted) {
  stats.inserted++
  if (!lead.telefone && !lead.email) newCnpjsNeedingContacts.add(lead.cnpj)
} else {
  stats.updated++
}
```
Remove the old `if (isExisting) { stats.updated++ } else { stats.inserted++ }` block.

**Bug 3 — natJur filter is too strict and silent:**

Current program filter (line ~332):
```ts
if (!natJur.toLowerCase().includes('civil') && !natJur.toLowerCase().includes('organiza')) return
```

This drops any program where `NATUREZA_JURIDICA_PROGRAMA` doesn't contain those keywords — silently. Add a counter and log how many programs were dropped by this filter:
```ts
let totalProgramsScanned = 0
let programsDroppedNatJur = 0
// inside callback:
totalProgramsScanned++
if (!is2026) return
if (!natJur.toLowerCase().includes('civil') && !natJur.toLowerCase().includes('organiza')) {
  programsDroppedNatJur++
  return
}
```
After the download: `console.log('[repo-sync] Programs dropped by natJur filter:', programsDroppedNatJur, 'of', totalProgramsScanned, 'scanned')`

Add these two counters to the returned `SyncStats` interface and stats object:
```ts
interface SyncStats {
  // existing fields...
  programs_scanned: number
  programs_dropped_nat_jur: number
}
```

Also log the first 3 unique `natJur` values that were dropped (to help diagnose if a valid program is being filtered out):
```ts
const droppedNatJurSamples: string[] = []
// inside callback when dropping:
if (droppedNatJurSamples.length < 3) droppedNatJurSamples.push(natJur)
```
After download: `console.log('[repo-sync] Dropped natJur samples:', droppedNatJurSamples)`
  </action>
  <verify>Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30` — must show 0 errors related to repo-sync.ts</verify>
  <done>TypeScript compiles clean. UPSERT SQL has `RETURNING (xmax = 0) AS was_inserted`. stats.inserted/updated now reflect true DB outcomes, not the isExisting proxy. New programs_scanned and programs_dropped_nat_jur appear in SyncStats.</done>
</task>

<task type="auto">
  <name>Task 2: Create /api/debug-sync endpoint for gestor diagnosis</name>
  <files>web/src/app/api/debug-sync/route.ts</files>
  <action>
Create a gestor-only debug endpoint at `/api/debug-sync` that returns:
1. Current DB state (total leads, leads by importado_de, most recent updated_at)
2. Vercel cron schedule (hardcoded: "06:00 UTC daily")
3. Ability to manually trigger a sync (POST request runs syncLeadsFromRepo())

**GET /api/debug-sync** — returns DB state for diagnosis:
```ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const session = await getApiSession()
  if (!session || (session.role !== 'gestor' && session.role !== 'gestor_vendedor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [totalRows, importSources, recentUpdates, distinctCnpjs] = await Promise.all([
    query('SELECT COUNT(*)::int as total FROM vendedor_projetos'),
    query(`SELECT importado_de, COUNT(*)::int as count FROM vendedor_projetos GROUP BY importado_de ORDER BY count DESC`),
    query(`SELECT MAX(updated_at) as last_updated FROM vendedor_projetos WHERE importado_de = 'auto-repo-sync'`),
    query('SELECT COUNT(DISTINCT cnpj)::int as distinct_cnpjs FROM vendedor_projetos'),
  ])

  return NextResponse.json({
    db_state: {
      total_rows: totalRows[0]?.total ?? 0,
      distinct_cnpjs: distinctCnpjs[0]?.distinct_cnpjs ?? 0,
      by_source: importSources,
      last_repo_sync: recentUpdates[0]?.last_updated ?? null,
    },
    cron_schedule: '06:00 UTC daily (03:00 BRT)',
    note: 'POST to this endpoint to manually trigger a sync (gestor only)',
  })
}
```

**POST /api/debug-sync** — triggers manual sync and returns full stats:
```ts
export async function POST(request: Request) {
  const session = await getApiSession()
  if (!session || (session.role !== 'gestor' && session.role !== 'gestor_vendedor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { syncLeadsFromRepo } = await import('@/lib/repo-sync')
  const stats = await syncLeadsFromRepo()

  return NextResponse.json({
    success: true,
    message: 'Sync completed',
    stats,
  })
}
```

Note: POST has maxDuration issue — Vercel hobby limits to 60s. Add this comment:
```
// NOTE: POST triggers full sync (300s needed). Works in local dev.
// On Vercel: use /api/cron/sync-leads with gestor session instead (maxDuration=300).
export const maxDuration = 60 // Vercel hobby limit
```

Keep both GET and POST in the same file.
  </action>
  <verify>Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20` — 0 errors. File exists at `web/src/app/api/debug-sync/route.ts`.</verify>
  <done>GET /api/debug-sync returns total_rows, distinct_cnpjs, by_source breakdown, last_repo_sync date. POST triggers sync and returns full stats including the new programs_scanned and programs_dropped_nat_jur fields. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — 0 errors
2. UPSERT SQL in repo-sync.ts contains `RETURNING (xmax = 0) AS was_inserted`
3. `stats.inserted` and `stats.updated` use `result.rows[0]?.was_inserted` not the `isExisting` proxy
4. `SyncStats` interface has `programs_scanned` and `programs_dropped_nat_jur` fields
5. File `web/src/app/api/debug-sync/route.ts` exists with GET and POST handlers
</verification>

<success_criteria>
- `isExisting` no longer false-positive on new emenda rows for existing CNPJs (only exact assignmentKey match)
- UPSERT accurately reports INSERT vs UPDATE via `xmax=0` in RETURNING clause
- natJur filter logs how many programs it dropped (gestor can see in Vercel logs after sync)
- GET /api/debug-sync shows current DB state (rows, distinct CNPJs, last sync date)
- POST /api/debug-sync can manually trigger sync (or gestor can use /api/cron/sync-leads directly)
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/28-veja-report-do-cliente-veja-se-estamos-a/28-SUMMARY.md`
</output>

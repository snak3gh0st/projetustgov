---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/cron/sync-leads/route.ts
  - web/src/lib/repo-sync.ts
  - web/vercel.json
  - web/src/app/api/setup-crm/route.ts
autonomous: true
requirements: [CRON-SYNC-01]
must_haves:
  truths:
    - "Vercel cron triggers daily at 06:00 UTC and the sync endpoint processes all 3 ZIP files"
    - "Existing CRM fields (status_contato, vendedor_id, valor_venda, comissao_*, contact_notes, tipo_vendedor, observacoes) are NEVER overwritten"
    - "Repo data fields (valor_emenda, nr_emenda, parlamentar, nome_programa, orgao_concedente, link_externo, qualificacao) are updated from fresh repo data"
    - "New leads (new cnpj+codigo_programa combos) are inserted with round-robin vendedor assignment"
    - "Leads no longer in the repo are NOT deleted (preserves CRM state)"
    - "347MB programa CSV is stream-processed without exceeding Vercel 1024MB RAM"
  artifacts:
    - path: "web/src/app/api/cron/sync-leads/route.ts"
      provides: "Vercel cron endpoint for daily sync"
      exports: ["GET"]
    - path: "web/src/lib/repo-sync.ts"
      provides: "Core sync logic: download, stream-parse, upsert"
      exports: ["syncLeadsFromRepo"]
    - path: "web/vercel.json"
      provides: "Cron schedule configuration"
      contains: "crons"
  key_links:
    - from: "web/vercel.json"
      to: "web/src/app/api/cron/sync-leads/route.ts"
      via: "Vercel cron schedule"
      pattern: "api/cron/sync-leads"
    - from: "web/src/app/api/cron/sync-leads/route.ts"
      to: "web/src/lib/repo-sync.ts"
      via: "function import"
      pattern: "syncLeadsFromRepo"
    - from: "web/src/lib/repo-sync.ts"
      to: "vendedor_projetos table"
      via: "UPSERT on (cnpj, codigo_programa)"
      pattern: "ON CONFLICT.*DO UPDATE"
---

<objective>
Create a Vercel cron job that daily downloads 3 siconv ZIP files from repositorio.dados.gov.br, stream-parses the CSVs, and upserts leads into vendedor_projetos -- updating repo data fields while preserving all CRM state.

Purpose: Replace the destructive manual TRUNCATE+INSERT import script with a safe, automated UPSERT-based daily sync that keeps CRM data intact.
Output: Working cron endpoint + sync library + vercel.json cron config.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/scripts/import-repo-auto.mjs (existing import logic to port -- use same CSV parsing, filtering, text fixing, phone formatting)
@web/src/app/api/setup-crm/route.ts (vendedor_projetos schema definition -- lines 64-101)
@web/src/lib/db.ts (database connection pattern)
@web/vercel.json (current config -- add crons)
@web/src/app/api/import-spreadsheet/route.ts (reference for BrasilAPI enrichment + round-robin vendedor assignment patterns)
@web/package.json (current dependencies -- pg already available)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add unique constraint + create repo-sync library with stream-based download/parse/upsert</name>
  <files>web/src/lib/repo-sync.ts, web/src/app/api/setup-crm/route.ts</files>
  <action>
**1a. Add unique constraint to setup-crm/route.ts:**

In the setup-crm route (after the existing index creation on lines 102-105), add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_vp_cnpj_codigo_programa
ON vendedor_projetos(cnpj, codigo_programa);
```

This enables PostgreSQL `ON CONFLICT (cnpj, codigo_programa)` for upsert. Must handle the case where duplicate rows already exist -- before creating the unique index, deduplicate by keeping the row with the lowest `id`:

```sql
DELETE FROM vendedor_projetos a
USING vendedor_projetos b
WHERE a.cnpj = b.cnpj
  AND a.codigo_programa = b.codigo_programa
  AND a.id > b.id;
```

Run the dedup BEFORE the CREATE UNIQUE INDEX. Wrap in try/catch so it's idempotent.

**1b. Create `web/src/lib/repo-sync.ts`:**

This is the core sync module. Export a single function `syncLeadsFromRepo()` that returns a stats object.

**Constants:**
```typescript
const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const ZIP_FILES = {
  programa: `${REPO_BASE}/siconv_programa.csv.zip`,
  emenda: `${REPO_BASE}/siconv_emenda.csv.zip`,
  proponentes: `${REPO_BASE}/siconv_proponentes.csv.zip`,
}
```

**Download + Stream Parse Strategy (CRITICAL for memory):**

For each ZIP file:
1. `fetch(url)` to get a Response
2. Pipe `response.body` through a **streaming unzip** approach
3. The ZIP files each contain a single CSV -- use Node.js `zlib` but since ZIP != gzip, we need a different approach

**IMPORTANT:** ZIP files are NOT gzip. The correct approach for streaming ZIP in Node.js serverless:
- Download the full ZIP into a Buffer (the ZIPs are small: 11MB + 7MB + 6MB = 24MB total, fits easily in 1024MB)
- Use the `adm-zip` approach? No -- avoid new dependencies
- **Best approach:** Use Node.js built-in. Download ZIP buffer, find the compressed data offset (ZIP local file header), then decompress with `zlib.createInflateRaw()` to get a stream of CSV text
- **Simpler alternative that works:** Download the ZIP buffer, use `zlib.inflateRawSync` on the compressed payload (skip the ZIP local file header) to get the full CSV string, then split by newlines and process line by line
- **Simplest and safest for the 347MB programa CSV:** Download ZIP (11MB buffer), locate the compressed data in the ZIP, pipe through `zlib.createInflateRaw()` into a `readline` interface for line-by-line streaming. This way the 347MB CSV is NEVER fully in memory.

**Implementation -- ZIP streaming without dependencies:**

```typescript
import { Readable } from 'stream'
import { createInflateRaw } from 'zlib'
import { createInterface } from 'readline'

async function downloadAndStreamCSV(
  url: string,
  onRow: (row: Record<string, string>) => void
): Promise<number> {
  // Download the ZIP file into a buffer (small: 6-11MB)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const zipBuffer = Buffer.from(await res.arrayBuffer())

  // Parse ZIP local file header to find compressed data
  // ZIP local file header: signature 0x04034b50, then offsets for sizes
  // Offset 26: filename length (2 bytes), Offset 28: extra field length (2 bytes)
  // Offset 18: compressed size (4 bytes), Offset 22: uncompressed size (4 bytes)
  // Offset 8: compression method (2 bytes) -- should be 8 (deflate)
  const sig = zipBuffer.readUInt32LE(0)
  if (sig !== 0x04034b50) throw new Error('Not a valid ZIP file')
  const compressionMethod = zipBuffer.readUInt16LE(8)
  const filenameLen = zipBuffer.readUInt16LE(26)
  const extraLen = zipBuffer.readUInt16LE(28)
  const dataOffset = 30 + filenameLen + extraLen
  const compressedSize = zipBuffer.readUInt32LE(18)

  // Extract the compressed payload
  const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize)

  if (compressionMethod === 0) {
    // Stored (no compression) -- unlikely but handle it
    return parseCSVBuffer(compressedData, onRow)
  }

  // Deflate compressed -- stream through inflateRaw into readline
  const inflateStream = createInflateRaw()
  const readable = Readable.from(compressedData)
  const csvStream = readable.pipe(inflateStream)

  let headers: string[] | null = null
  let rowCount = 0
  const rl = createInterface({ input: csvStream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split(';')
    if (!headers) {
      headers = cols.map(h => h.replace(/^\ufeff/, '').trim())
      continue
    }
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cols[i] || '').trim()
    }
    onRow(row)
    rowCount++
  }
  return rowCount
}
```

**Main sync function `syncLeadsFromRepo()`:**

Port the logic from `import-repo-auto.mjs` (steps 2-5) but adapted for upsert:

1. **Load programa CSV (stream):** Filter for ANO_DISPONIBILIZACAO=2026 OR code year 2026, and NATUREZA_JURIDICA containing 'civil' or 'organiza'. Build `programas` Map (id_programa -> {cod, nome, orgao, modalidade}) and `validCods` Set.

2. **Load emenda CSV (stream):** Filter by validCods. Build `emendasMap` (Map of `cod|cnpj` -> array of emenda records with valor, nr_emenda, parlamentar, tipo, qualificacao).

3. **Load proponentes CSV (stream):** Filter by needed CNPJs from emendasMap. Build `proponentes` Map (cnpj -> {nome, uf, municipio, email, telefone, endereco}).

4. **Build leads array:** Same logic as import-repo-auto.mjs lines 299-334. For each emendasMap entry, aggregate emendas (total valor, concatenate nr_emendas with ' | ', unique parlamentares with ' | '). Build link_externo URL from id_programa.

5. **Load vendedor state from DB:**
   - Get active vendedores: `SELECT id, email FROM users WHERE role IN ('vendedor', 'gestor_vendedor') AND active = true ORDER BY nome`
   - Get existing lead assignments: `SELECT cnpj, codigo_programa, vendedor_id FROM vendedor_projetos WHERE vendedor_id IS NOT NULL`
   - Build a Map of `cnpj|codigo_programa` -> vendedor_id for existing assignments
   - Get vendedor lead counts for round-robin: `SELECT vendedor_id, COUNT(*) as cnt FROM vendedor_projetos WHERE vendedor_id IS NOT NULL GROUP BY vendedor_id`

6. **Load existing_clients** for flagging: `SELECT cnpj FROM existing_clients`

7. **UPSERT leads in batches:** For each lead, determine vendedor_id:
   - If `cnpj|codigo_programa` exists in DB -> keep existing vendedor_id (pass NULL to let DO UPDATE skip it)
   - If new lead -> pick least-loaded vendedor (round-robin)

   Use a single UPSERT statement per lead:
   ```sql
   INSERT INTO vendedor_projetos (
     cnpj, codigo_programa, nome_programa, link_externo, orgao_concedente,
     uf, municipio, qualificacao, nr_emenda, parlamentar,
     nome, valor_emenda, vendedor_id, observacoes, importado_de
   ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'auto-repo-sync')
   ON CONFLICT (cnpj, codigo_programa) DO UPDATE SET
     nome_programa = EXCLUDED.nome_programa,
     link_externo = EXCLUDED.link_externo,
     orgao_concedente = EXCLUDED.orgao_concedente,
     uf = COALESCE(vendedor_projetos.uf, EXCLUDED.uf),
     municipio = COALESCE(vendedor_projetos.municipio, EXCLUDED.municipio),
     qualificacao = EXCLUDED.qualificacao,
     nr_emenda = EXCLUDED.nr_emenda,
     parlamentar = EXCLUDED.parlamentar,
     nome = CASE WHEN vendedor_projetos.nome = 'Sem nome' OR vendedor_projetos.nome IS NULL
                  THEN EXCLUDED.nome ELSE vendedor_projetos.nome END,
     valor_emenda = EXCLUDED.valor_emenda,
     telefone = COALESCE(NULLIF(vendedor_projetos.telefone, ''), EXCLUDED.telefone),
     email = COALESCE(NULLIF(vendedor_projetos.email, ''), EXCLUDED.email),
     updated_at = NOW()
   ```

   **CRITICAL:** The DO UPDATE clause must:
   - ALWAYS update: nome_programa, link_externo, orgao_concedente, qualificacao, nr_emenda, parlamentar, valor_emenda (repo data that may change)
   - NEVER update: status_contato, vendedor_id, valor_venda, comissao_*, tipo_vendedor, observacoes, comissao_locked, comissao_bonus (CRM state)
   - COALESCE-update: uf, municipio, telefone, email, nome (preserve existing, fill if missing)

   For NEW leads only (INSERT path), set vendedor_id from round-robin. For existing leads, vendedor_id is untouched by the ON CONFLICT clause since it's not in the SET.

8. **BrasilAPI enrichment** for new leads missing contact data. Limit to 20 CNPJs to stay within timeout. Same logic as import-repo-auto.mjs lines 430-496 but adapted. Use 300ms delay between API calls.

9. **Return stats object:** `{ downloaded: 3, programas_filtered, emendas_matched, leads_total, inserted, updated, enriched_api, errors, duration_ms }`

**Port these helper functions from import-repo-auto.mjs:**
- `cleanCNPJ()` (line 32-37)
- `parseBRNumber()` (line 39-44)
- `formatPhone()` (line 46-60)
- `fixText()` (line 63-134) -- the encoding fix with qReplacements and accentFixes

**Use `@/lib/db` pattern:** Import `getPool` from `@/lib/db` for database access. Use `pool.connect()` for individual queries within the sync function to manage connections properly.

**Timeout safety:** The entire sync must complete within ~280s (leaving 20s margin from 300s Vercel limit). Add a start timestamp and check elapsed time before starting BrasilAPI enrichment. Skip enrichment if >200s elapsed.
  </action>
  <verify>
  TypeScript compilation: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit src/lib/repo-sync.ts` should pass (or check via `npm run build`).
  Verify the unique index migration is idempotent by reading the setup-crm route and confirming the dedup + CREATE UNIQUE INDEX block exists.
  </verify>
  <done>
  `web/src/lib/repo-sync.ts` exports `syncLeadsFromRepo()` function that downloads 3 ZIPs, stream-parses CSVs, and performs UPSERT. `web/src/app/api/setup-crm/route.ts` includes the unique index creation on `(cnpj, codigo_programa)` with dedup migration. Helper functions (cleanCNPJ, parseBRNumber, formatPhone, fixText) are ported from the import script.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create cron API route + configure Vercel cron schedule</name>
  <files>web/src/app/api/cron/sync-leads/route.ts, web/vercel.json</files>
  <action>
**2a. Create `web/src/app/api/cron/sync-leads/route.ts`:**

```typescript
import { NextResponse } from 'next/server'
import { syncLeadsFromRepo } from '@/lib/repo-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // Vercel Pro max timeout

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await syncLeadsFromRepo()

    console.log('[cron/sync-leads] Sync complete:', JSON.stringify(stats))

    return NextResponse.json({
      success: true,
      ...stats,
    })
  } catch (error) {
    console.error('[cron/sync-leads] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
```

**Key details:**
- `maxDuration = 300` -- uses full Vercel Pro limit
- Auth: Check `CRON_SECRET` env var via Bearer token. Vercel automatically sends this header for cron jobs.
- Logs stats for Vercel function logs monitoring

**2b. Update `web/vercel.json`:**

Add the `crons` array to the existing config:

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "regions": ["iad1"],
  "crons": [
    {
      "path": "/api/cron/sync-leads",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Schedule: `0 6 * * *` = daily at 06:00 UTC (03:00 BRT). The repo files are typically updated by morning, so 06:00 UTC gives a good buffer.

**2c. Add CRON_SECRET to .env.local (document only, do NOT commit):**

The user must add `CRON_SECRET` to their Vercel project environment variables. Vercel auto-generates this when crons are configured, OR the user can set a custom one. Document this in the code comments.

Add a comment at the top of the cron route:
```
// Vercel Cron Job: Daily lead sync from repositorio.dados.gov.br
// Schedule: 06:00 UTC daily (configured in vercel.json)
// Env required: CRON_SECRET (auto-set by Vercel for cron jobs)
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-leads
```
  </action>
  <verify>
  1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npm run build` succeeds without errors.
  2. Verify vercel.json is valid JSON with `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"` from the web/ directory.
  3. Verify the cron route file exists at the correct path and exports GET.
  </verify>
  <done>
  Cron endpoint at `/api/cron/sync-leads` accepts authenticated GET requests and calls `syncLeadsFromRepo()`. `vercel.json` has cron schedule at `0 6 * * *`. The endpoint returns JSON stats on success and 500 with error details on failure. Build passes.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` in web/ passes (TypeScript compiles, Next.js builds successfully)
2. vercel.json contains valid `crons` configuration
3. The cron route exists at `web/src/app/api/cron/sync-leads/route.ts` and exports GET
4. The sync library at `web/src/lib/repo-sync.ts` exports `syncLeadsFromRepo`
5. The UPSERT SQL in repo-sync.ts does NOT touch CRM fields (status_contato, vendedor_id, valor_venda, comissao_*, tipo_vendedor, observacoes)
6. The UPSERT SQL DOES update repo fields (valor_emenda, nr_emenda, parlamentar, nome_programa, orgao_concedente, link_externo, qualificacao)
7. New leads get vendedor assignment via round-robin (least-loaded)
8. setup-crm route includes the unique constraint migration for (cnpj, codigo_programa)
</verification>

<success_criteria>
- Build succeeds with no TypeScript errors
- Cron endpoint is properly authenticated and callable
- UPSERT preserves CRM state while updating repo data
- Stream-based CSV processing keeps memory under 1024MB (ZIPs downloaded as small buffers, CSVs parsed line-by-line via inflate stream)
- New leads auto-assigned to vendedores via round-robin
- Ready to deploy to Vercel and have cron trigger automatically
</success_criteria>

<output>
After completion, create `.planning/quick/8-daily-auto-update-leads-from-repo-bases-/8-01-SUMMARY.md`
</output>

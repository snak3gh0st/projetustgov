---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/import-existing-clients/route.ts
  - src/app/upload-clientes/page.tsx
autonomous: true
must_haves:
  truths:
    - "Gestor can upload CLIENTES.xlsx and see inserted/duplicate/error counts"
    - "Non-gestor users see access denied"
    - "Duplicate CNPJs are safely skipped (ON CONFLICT DO NOTHING)"
    - "File with wrong columns shows clear validation error"
  artifacts:
    - path: "src/app/api/import-existing-clients/route.ts"
      provides: "POST endpoint for existing clients upload"
    - path: "src/app/upload-clientes/page.tsx"
      provides: "Upload UI with instructions"
  key_links:
    - from: "src/app/upload-clientes/page.tsx"
      to: "/api/import-existing-clients"
      via: "fetch POST with FormData"
      pattern: "fetch.*api/import-existing-clients"
---

<objective>
Create a dedicated endpoint and UI page for uploading existing clients (CLIENTES.xlsx) to the existing_clients table with validation, deduplication, and clear user instructions.

Purpose: Prevent vendedores from receiving leads that belong to existing Projetus clients. The CLIENTES.xlsx file has ~78 clients with CNPJ and ENTIDADE columns that need to be loaded into existing_clients table.
Output: Working /upload-clientes page and /api/import-existing-clients endpoint.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/import-spreadsheet/route.ts (pattern for Excel parsing, cleanCNPJ, Pool setup)
@src/app/upload/page.tsx (pattern for upload UI, drag-drop, gestor check, results display)
@src/lib/auth-actions.ts (pattern for gestor role check via session)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/import-existing-clients POST endpoint</name>
  <files>src/app/api/import-existing-clients/route.ts</files>
  <action>
Create a POST endpoint following the exact same patterns as import-spreadsheet/route.ts:

1. Same getPool() function, same `export const dynamic = 'force-dynamic'` and `export const maxDuration = 60`
2. Same cleanCNPJ function (copy from import-spreadsheet)
3. Auth check: fetch session via `auth()` from `@/lib/auth` - if not gestor, return 403
4. Parse multipart form data, read Excel with XLSX.read
5. Read first sheet only. Parse rows with `XLSX.utils.sheet_to_json`
6. **Validate columns**: Check that headers include CNPJ and ENTIDADE (case-insensitive, accent-insensitive using normalizeHeader pattern). If missing, return 400 with clear error: "Planilha deve conter colunas CNPJ e ENTIDADE"
7. For each row:
   - Clean CNPJ using cleanCNPJ (strip non-digits, pad to 14)
   - Skip rows with invalid/empty CNPJ
   - Get nome from ENTIDADE column
8. **Safe insert**: Use `INSERT INTO existing_clients (cnpj, nome, added_by, notes) VALUES ($1, $2, $3, $4) ON CONFLICT (cnpj) DO NOTHING RETURNING id` - this prevents any data loss or duplicate errors
9. added_by = session user email, notes = 'Importado de CLIENTES.xlsx'
10. Track counts: inserted (RETURNING returned a row), duplicates (RETURNING returned nothing), skipped (no valid CNPJ), errors
11. Return JSON: `{ success, total, inserted, duplicates, skipped, errors }`

IMPORTANT: Use `ON CONFLICT (cnpj) DO NOTHING` - never DELETE or UPDATE existing records. This is read-append only.
  </action>
  <verify>
Build succeeds: `cd /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web && npx next build 2>&1 | tail -20` (check for no TypeScript errors in the new file)
  </verify>
  <done>POST /api/import-existing-clients accepts .xlsx, validates CNPJ+ENTIDADE columns, safely inserts with ON CONFLICT DO NOTHING, returns counts</done>
</task>

<task type="auto">
  <name>Task 2: Create /upload-clientes page with instructions and upload UI</name>
  <files>src/app/upload-clientes/page.tsx</files>
  <action>
Create a 'use client' page following the exact pattern of src/app/upload/page.tsx (same styling, drag-drop, gestor check, results display), but with these differences:

1. **Title**: "Importar Clientes Existentes"
2. **Clear instructions block** at top (BEFORE the drop zone), styled with bg-amber-500/10 border border-amber-500/20 rounded-xl p-4:
   - Heading: "Instrucoes"
   - "Faca upload do arquivo CLIENTES.xlsx com a base de clientes existentes da Projetus."
   - "O arquivo deve conter as colunas: CNPJ e ENTIDADE"
   - "Clientes ja cadastrados serao ignorados automaticamente (sem duplicatas)"
   - "Apenas gestores podem realizar esta operacao"
3. **Drop zone**: Same drag-drop pattern as upload/page.tsx, accept only .xlsx,.xls
4. **Upload action**: POST to `/api/import-existing-clients` with FormData
5. **Results display**: Show cards for Total, Inseridos (cyan), Duplicatas (amber), Ignorados (gray), Erros (red) - same grid pattern as upload/page.tsx but adapted for the simpler response shape
6. **Gestor check**: Same useEffect pattern checking /api/auth/session for role === 'gestor', show "Acesso restrito" if not gestor
7. **Back link**: Link to "/" with "Voltar ao dashboard"
8. Accept file types: .xlsx, .xls only (no .csv since this is specifically for Excel)

Keep the same dark theme styling (bg-gray-950, white/5 cards, cyan accents) as the existing upload page.
  </action>
  <verify>
Build succeeds: `cd /Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web && npx next build 2>&1 | tail -20`
  </verify>
  <done>Page at /upload-clientes shows instructions, accepts file upload, displays results with inserted/duplicate/error counts, restricts to gestor role</done>
</task>

</tasks>

<verification>
1. `npx next build` completes without errors
2. Both new files exist and follow existing codebase patterns
3. API uses ON CONFLICT DO NOTHING (grep for it in the route file)
4. UI shows clear instructions about CLIENTES.xlsx format
</verification>

<success_criteria>
- Gestor can navigate to /upload-clientes, see clear instructions, upload CLIENTES.xlsx
- Endpoint validates CNPJ+ENTIDADE columns, rejects files without them
- Records inserted safely with ON CONFLICT DO NOTHING (no data loss risk)
- Results show how many inserted, how many were duplicates, how many skipped/errored
- Non-gestor users see access denied message
</success_criteria>

<output>
After completion, create `.planning/quick/8-create-endpoint-and-ui-to-upload-existin/8-SUMMARY.md`
</output>

---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/types.ts
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/import-spreadsheet/route.ts
  - web/src/app/api/leads/route.ts
  - web/src/app/api/leads/[cnpj]/route.ts
  - web/src/app/api/dashboard/route.ts
  - web/src/app/api/dashboard-enhanced/route.ts
  - web/src/app/api/filters/estados/route.ts
  - web/src/app/api/filters/natureza-juridica/route.ts
  - web/src/components/LeadTable.tsx
  - web/src/components/LeadSlideOver.tsx
  - web/src/app/page.tsx
  - web/src/app/upload/page.tsx
autonomous: true
must_haves:
  truths:
    - "Expanded schema supports Siconv base bruta fields (valor_emenda, valor_global, objeto, modalidade, situacao, etc.)"
    - "Gestor can upload a Siconv .xlsx and see import results (total, new, duplicates)"
    - "Gestor can upload CRM vendedor .xlsx and leads are assigned to vendedores"
    - "Duplicate CNPJs are detected and reported, not overwritten"
    - "Existing dashboard, leads list, and slide-over work with new schema columns"
  artifacts:
    - path: "web/src/app/api/setup-crm/route.ts"
      provides: "Expanded CREATE TABLE with all new columns"
    - path: "web/src/app/api/import-spreadsheet/route.ts"
      provides: "Auto-detect Siconv vs CRM format, duplicate detection"
    - path: "web/src/app/upload/page.tsx"
      provides: "Drag-and-drop upload UI with results report"
    - path: "web/src/lib/types.ts"
      provides: "Updated VendedorProjeto interface"
  key_links:
    - from: "web/src/app/upload/page.tsx"
      to: "/api/import-spreadsheet"
      via: "fetch POST with FormData"
      pattern: "fetch.*import-spreadsheet"
    - from: "web/src/components/LeadTable.tsx"
      to: "web/src/lib/types.ts"
      via: "VendedorProjeto interface columns"
      pattern: "columnHelper.accessor"
---

<objective>
Expand vendedor_projetos schema to support raw Siconv base import (5500+ rows with financial/program data), rewrite import endpoint with format auto-detection and duplicate handling, update all existing API routes and UI components for new columns, and create a gestor upload page.

Purpose: Enable bulk import of TransferenciaGov base bruta data alongside existing CRM spreadsheets, with proper financial columns (NUMERIC instead of VARCHAR) and program metadata.
Output: Working schema migration, updated import API, upload UI page, all existing features adapted.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/lib/types.ts
@web/src/app/api/setup-crm/route.ts
@web/src/app/api/import-spreadsheet/route.ts
@web/src/app/api/leads/route.ts
@web/src/app/api/leads/[cnpj]/route.ts
@web/src/app/api/dashboard/route.ts
@web/src/app/api/dashboard-enhanced/route.ts
@web/src/components/LeadTable.tsx
@web/src/components/LeadSlideOver.tsx
@web/src/app/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema expansion + update all backend and frontend references</name>
  <files>
    web/src/lib/types.ts
    web/src/app/api/setup-crm/route.ts
    web/src/app/api/leads/route.ts
    web/src/app/api/leads/[cnpj]/route.ts
    web/src/app/api/dashboard/route.ts
    web/src/app/api/dashboard-enhanced/route.ts
    web/src/app/api/filters/estados/route.ts
    web/src/app/api/filters/natureza-juridica/route.ts
    web/src/components/LeadTable.tsx
    web/src/components/LeadSlideOver.tsx
    web/src/app/page.tsx
  </files>
  <action>
    **1. Update `web/src/lib/types.ts` — VendedorProjeto interface:**

    Replace entire interface with new schema fields:
    ```typescript
    export interface VendedorProjeto {
      id: number
      vendedor_id: string | null  // NULL = unassigned
      // Programa
      codigo_programa: string | null
      nome_programa: string | null
      link_externo: string | null
      orgao_concedente: string | null
      uf: string | null
      municipio: string | null
      qualificacao: string | null
      nr_emenda: string | null
      parlamentar: string | null
      // Beneficiario
      cnpj: string
      nome: string
      natureza_juridica: string | null
      // Financeiro
      valor_emenda: number | null
      valor_global: number | null
      valor_empenhado: number | null
      valor_liberado: number | null
      // Siconv extras
      nr_convenio: string | null
      objeto: string | null
      modalidade: string | null
      situacao: string | null
      saldo_conta: number | null
      // CRM
      telefone: string | null
      email: string | null
      status_contato: string
      observacoes: string | null
      // Metadata
      importado_de: string | null
      created_at: string
      updated_at: string
      vendedor_nome?: string | null
    }
    ```

    Also update `ClienteAgrupado` — replace `totalSaldo: number` with `valorGlobal: number` and `percExecutado` removed. Update `DashboardStats.por_categoria` keys to use `status_contato` values: `'Novo'`, `'Contactado'`, `'Proposta'`, `'Retorno'`.

    **2. Update `web/src/app/api/setup-crm/route.ts`:**

    Replace the CREATE TABLE statement with the approved expanded schema (see planning context). Key changes:
    - Remove: `saldo VARCHAR`, `perc_executado`, `desembolso`, `pagamento`, `status_categoria`
    - Add: `codigo_programa`, `nome_programa`, `qualificacao`, `nr_emenda`, `parlamentar`, `natureza_juridica`, `valor_emenda NUMERIC(15,2)`, `valor_global NUMERIC(15,2)`, `valor_empenhado NUMERIC(15,2)`, `valor_liberado NUMERIC(15,2)`, `objeto`, `modalidade`, `situacao`, `saldo_conta NUMERIC(15,2)`, `status_contato VARCHAR(50) DEFAULT 'Novo'`, `importado_de TEXT`
    - Make `nr_convenio` nullable (no NOT NULL)
    - Add indexes: `idx_vp_vendedor`, `idx_vp_cnpj`, `idx_vp_status_contato`, `idx_vp_uf`

    **3. Update `web/src/app/api/dashboard/route.ts`:**

    - Replace `parseSaldo(p.saldo)` with `Number(p.valor_global) || 0` for volumeFinanceiro
    - Replace `status_categoria` references with `status_contato`
    - Update `porCategoria` keys: `'Novo'`, `'Contactado'`, `'Proposta'`, `'Retorno'`

    **4. Update `web/src/app/api/dashboard-enhanced/route.ts`:**

    Read this file first. Replace any `saldo` references with `valor_global`, `status_categoria` with `status_contato`, `perc_executado` with appropriate new fields. For `saldo` aggregations in SQL, use `COALESCE(valor_global, 0)`. For execution distribution, use `CASE WHEN valor_liberado > 0 AND valor_global > 0 THEN (valor_liberado / valor_global * 100) ELSE 0 END` as percentage.

    **5. Update `web/src/app/api/leads/route.ts`:**

    - Replace `ORDER BY vp.cnpj, vp.saldo DESC` with `ORDER BY vp.cnpj, vp.valor_global DESC NULLS LAST`
    - Replace `status_categoria` filter param with `status_contato`

    **6. Update `web/src/app/api/leads/[cnpj]/route.ts`:**

    - Replace `status_categoria` with `status_contato` in PATCH handler
    - Remove the `.slice(0, 100)` on observacoes (new schema allows TEXT)

    **7. Update `web/src/app/api/filters/estados/route.ts` and `natureza-juridica/route.ts`:**

    These should work as-is (they query `uf` and `natureza_juridica` which still exist). Verify no old column references.

    **8. Update `web/src/components/LeadTable.tsx`:**

    Replace columns:
    - Keep: `cnpj`, `nome`, `vendedor_nome`
    - Replace `nr_convenio` with `nome_programa` (header: "Programa")
    - Replace `saldo` with `valor_global` (header: "Valor Global", format as BRL currency)
    - Replace `perc_executado` with `situacao` (header: "Situacao")
    - Replace `status_categoria` with `status_contato` (header: "Status")
    - Add `uf` column (header: "UF")

    Import `formatCompactCurrency` from `@/lib/format` for valor_global display.

    **9. Update `web/src/components/LeadSlideOver.tsx`:**

    - Replace `STATUS_COLORS` keys: `'Novo'`, `'Contactado'`, `'Proposta'`, `'Retorno'`
    - Replace `lead.status_categoria` with `lead.status_contato`
    - Replace `InfoCard label="Saldo"` with `label="Valor Global"` using `formatBRL(lead.valor_global || 0)`
    - Replace `% Executado` card with `Situacao` showing `lead.situacao || '-'`
    - Replace `Nr Convenio` card with `Programa` showing `lead.nome_programa || '-'`
    - Add `Natureza Juridica` info card
    - Remove `percNum` and progress bar logic

    **10. Update `web/src/app/page.tsx`:**

    - Replace `parseSaldo` to use `Number(p.valor_global) || 0`
    - Replace `parsePerc` usages — remove or adapt to `valor_liberado / valor_global * 100`
    - Replace all `status_categoria` with `status_contato`
    - Replace `CATEGORIAS` array with `['Novo', 'Contactado', 'Proposta', 'Retorno']`
    - Update `CAT_COLORS` keys accordingly
    - Update `EnhancedData` type: replace `saldo` with `valor_global` in byUf, byVendedor, topClients
    - Replace `perc_medio` with relevant metric or remove
  </action>
  <verify>
    `cd web && npx tsc --noEmit` — no TypeScript errors.
    Grep for old column names to ensure none remain: `grep -rn "status_categoria\|perc_executado\|desembolso\b\|pagamento\b" src/ --include="*.ts" --include="*.tsx"` should return 0 results (excluding setup-crm DROP TABLE comment if any).
  </verify>
  <done>
    All TypeScript files compile. No references to removed columns (saldo as string, perc_executado, desembolso, pagamento, status_categoria). Setup-crm creates expanded schema. Dashboard, leads, and slide-over use new column names.
  </done>
</task>

<task type="auto">
  <name>Task 2: Import endpoint rewrite with format auto-detection + Upload UI page</name>
  <files>
    web/src/app/api/import-spreadsheet/route.ts
    web/src/app/upload/page.tsx
  </files>
  <action>
    **1. Rewrite `web/src/app/api/import-spreadsheet/route.ts`:**

    Keep: getPool(), cleanCNPJ(), multipart/form-data handling, VENDEDOR_MAP.

    Add format detection function `detectFormat(headers: string[])`:
    - If headers include any of: `Nº Instrumento`, `Objeto`, `Situação`, `Saldo em conta` → return `'siconv'`
    - If headers include any of: `Código Programa`, `Nome Programa`, `Qualificação` → return `'crm'`
    - Else return `'unknown'`

    Add two COLUMN_MAPs:

    `SICONV_COLUMN_MAP`:
    - `nº instrumento` / `nr instrumento` → `nr_convenio`
    - `link externo` → `link_externo`
    - `uf` → `uf`
    - `município` / `municipio` → `municipio`
    - `cnpj` → `cnpj`
    - `nome proponente` → `nome`
    - `modalidade` → `modalidade`
    - `emenda` → `nr_emenda`
    - `objeto` → `objeto`
    - `situação` / `situacao` → `situacao`
    - `órgão concedente` / `orgao concedente` → `orgao_concedente`
    - `natureza jurídica` / `natureza juridica` → `natureza_juridica`
    - `valor global` → `valor_global`
    - `valor emenda` → `valor_emenda`
    - `valor empenhado` → `valor_empenhado`
    - `valor liberado` → `valor_liberado`
    - `saldo em conta` → `saldo_conta`

    `CRM_COLUMN_MAP`:
    - `código programa` / `codigo programa` → `codigo_programa`
    - `nome programa` → `nome_programa`
    - `link externo` → `link_externo`
    - `órgão superior` / `orgao superior` → `orgao_concedente`
    - `uf beneficiário` / `uf beneficiario` → `uf`
    - `município beneficiário` / `municipio beneficiario` → `municipio`
    - `qualificação` / `qualificacao` → `qualificacao`
    - `nº emenda beneficiário` / `nr emenda beneficiario` → `nr_emenda`
    - `parlamentar beneficiário` / `parlamentar beneficiario` → `parlamentar`
    - `cnpj beneficiário` / `cnpj beneficiario` → `cnpj`
    - `nome beneficiário` / `nome beneficiario` → `nome`
    - `nat. jur. beneficiário` / `nat jur beneficiario` → `natureza_juridica`

    Add helper `parseNumeric(val: unknown): number | null` — strips non-numeric chars except `.` and `,`, replaces `,` with `.`, returns parseFloat or null.

    **Duplicate detection logic:**
    Before inserting rows for a sheet, query all existing CNPJs: `SELECT DISTINCT cnpj FROM vendedor_projetos`. Store in a Set. For each row, if CNPJ exists in Set, increment `duplicates` counter, skip insert.

    **Siconv format processing:**
    - Single sheet, vendedor_id = NULL
    - Map columns via SICONV_COLUMN_MAP
    - Parse valor_* and saldo_conta via parseNumeric
    - Set `importado_de = 'siconv'`

    **CRM format processing:**
    - Multiple sheets, map sheet names to vendedor via VENDEDOR_MAP
    - Map columns via CRM_COLUMN_MAP
    - All valor fields = NULL (CRM sheets don't have financial data)
    - Set `importado_de = 'crm'`

    **INSERT statement** (same for both formats):
    ```sql
    INSERT INTO vendedor_projetos (
      vendedor_id, codigo_programa, nome_programa, link_externo, orgao_concedente,
      uf, municipio, qualificacao, nr_emenda, parlamentar,
      cnpj, nome, natureza_juridica,
      valor_emenda, valor_global, valor_empenhado, valor_liberado,
      nr_convenio, objeto, modalidade, situacao, saldo_conta,
      importado_de
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    ```

    **Response format:**
    ```json
    {
      "success": true,
      "format": "siconv" | "crm",
      "totalRows": 5513,
      "inserted": 5200,
      "duplicates": 313,
      "errors": 0,
      "sheets": [{ "sheet": "...", "vendedor": null, "rows": 5200, "duplicates": 313, "skipped": 0 }]
    }
    ```

    **2. Create `web/src/app/upload/page.tsx`:**

    Gestor-only upload page with Sigma dark theme. Structure:

    ```
    - Check session, redirect if not gestor
    - State: file (File | null), uploading (boolean), results (response JSON | null), dragActive (boolean)
    - Drag & drop zone: dashed border, cyan accent on drag-over, accepts .xlsx/.xls/.csv
    - Also has a hidden file input with a "Selecionar arquivo" button
    - When file selected: show file name + size, "Importar" button
    - On import: POST to /api/import-spreadsheet with FormData
    - Show results in glassmorphic card:
      - Format detected badge (Siconv / CRM)
      - Stats grid: Total Linhas, Novos Leads, Duplicatas, Erros
      - Per-sheet breakdown table if multiple sheets
    - "Importar outro" button to reset
    ```

    Styling:
    - Container: `min-h-screen bg-gray-950 p-8`
    - Title: `text-2xl font-bold text-white` with back link to `/`
    - Upload card: `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8`
    - Drop zone: `border-2 border-dashed border-white/20 rounded-xl p-12 text-center` — on drag: `border-cyan-500 bg-cyan-500/5`
    - Import button: `bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-semibold rounded-xl px-6 py-3`
    - Results cards: use neon cyan for success numbers, red for errors, amber for duplicates
    - Use `useSession` from next-auth/react or fetch `/api/auth/session` to check role

    Add route protection: if user role !== 'gestor', show "Acesso restrito" message.
  </action>
  <verify>
    `cd web && npx tsc --noEmit` — no TypeScript errors.
    `curl -s http://localhost:3000/upload` returns HTML (not 404).
    Test with a small .xlsx file via the upload UI — should show results card.
  </verify>
  <done>
    Import endpoint auto-detects Siconv vs CRM format, inserts with new schema columns, reports duplicates by CNPJ. Upload page renders with drag-and-drop, shows import results with total/new/duplicates/errors breakdown. Only accessible to gestor role.
  </done>
</task>

</tasks>

<verification>
1. `cd web && npx tsc --noEmit` passes with zero errors
2. No references to old columns: `grep -rn "status_categoria\|perc_executado\|\"desembolso\"\|\"pagamento\"" src/ --include="*.ts" --include="*.tsx"` returns nothing
3. POST to `/api/setup-crm` creates expanded schema successfully
4. POST to `/api/import-spreadsheet` with Siconv .xlsx auto-detects format and imports with duplicate reporting
5. `/upload` page loads, shows drag-drop zone, and is gestor-only
6. Dashboard and leads pages render without errors using new columns
</verification>

<success_criteria>
- Expanded schema deployed via setup-crm endpoint
- Siconv base bruta (5500+ rows) importable with auto-detection
- CRM vendedor spreadsheets still importable with sheet-to-vendedor mapping
- Duplicate CNPJs reported (not silently overwritten)
- Upload UI functional with results display
- All existing pages (dashboard, leads, lead detail) work with new schema
</success_criteria>

<output>
After completion, create `.planning/quick/3-schema-upload-base-bruta-import/3-SUMMARY.md`
</output>

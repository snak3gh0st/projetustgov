---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/import-spreadsheet/route.ts
autonomous: true
must_haves:
  truths:
    - "PROGRAMAS 2026 Excel with Beneficiario-style headers is detected as 'crm' format"
    - "Sheet name 'Gabriel ' (trailing space) correctly maps to gabriel vendedor"
    - "Vitoria sheet's shifted columns are detected and remapped (UF Beneficiario->orgao, Municipio Beneficiario->uf, Municipio->municipio)"
    - "Spreadsheet-embedded contact data (email, telefone, valor) is imported and preferred over proponentes enrichment"
    - "Gabriel's unnamed extra columns (__EMPTY keys) are scanned for email/phone patterns"
    - "VENDEDOR_MAP uses @projetus.org emails matching actual user records"
    - "importado_de is set to 'crm' for this format"
  artifacts:
    - path: "src/app/api/import-spreadsheet/route.ts"
      provides: "Updated import-spreadsheet handling PROGRAMAS 2026 format"
      contains: "beneficiario"
  key_links:
    - from: "detectFormat()"
      to: "CRM_COLUMN_MAP"
      via: "'beneficiario' indicator triggers 'crm' format detection"
      pattern: "beneficiario"
    - from: "VENDEDOR_MAP"
      to: "usersByEmail lookup"
      via: "@projetus.org emails"
      pattern: "projetus\\.org"
---

<objective>
Fix import-spreadsheet API route to handle the new PROGRAMAS 2026 Excel format (4 sheets: Wellington, Elisson, Gabriel, Vitoria) which uses Beneficiario-style headers, has shifted columns in Vitoria's sheet, contains embedded contact data, and has unnamed extra columns in Gabriel's sheet.

Purpose: Enable importing the new 2026 sales program data into vendedor_projetos without manual intervention.
Output: Updated route.ts that correctly parses all 4 sheet variants and imports ~2185 rows.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/import-spreadsheet/route.ts
@src/app/api/setup-crm/route.ts (for DB schema reference and @projetus.org email convention)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix format detection, VENDEDOR_MAP emails, sheet name normalization, and CRM_COLUMN_MAP</name>
  <files>src/app/api/import-spreadsheet/route.ts</files>
  <action>
Four changes in this file:

1. **VENDEDOR_MAP** -- Update emails from @sigma.com to @projetus.org. The DB users table has @projetus.org emails (see setup-crm migration step 9). Remove the accented 'vitoria' duplicate key since we will fix normalization separately:
```typescript
const VENDEDOR_MAP: Record<string, string> = {
  'wellington': 'wellington@projetus.org',
  'elisson': 'elisson@projetus.org',
  'gabriel': 'gabriel@projetus.org',
  'vitoria': 'vitoria@projetus.org',
}
```

2. **Sheet name normalization** -- At line ~250, the CRM vendedor lookup does `sheetName.toLowerCase().trim()` but does NOT strip accents. The sheet "Vitoria" (with accent) becomes "vitoria" but not via NFD normalization. Use `normalizeHeader(sheetName)` instead of `sheetName.toLowerCase().trim()` so that:
   - "Vitoria" (accented) -> "vitoria" (accent stripped, matches VENDEDOR_MAP)
   - "Gabriel " (trailing space) -> "gabriel" (trimmed, matches VENDEDOR_MAP)
   Change line ~250 from:
   ```typescript
   const normalized = sheetName.toLowerCase().trim()
   ```
   to:
   ```typescript
   const normalized = normalizeHeader(sheetName)
   ```
   `normalizeHeader` already does: lowercase, trim, NFD accent strip, whitespace normalize.

3. **detectFormat()** -- Add 'beneficiario' as a CRM indicator in the crmIndicators array:
```typescript
const crmIndicators = ['codigo programa', 'nome programa', 'qualificacao', 'beneficiario']
```
This works because all PROGRAMAS 2026 sheets have headers containing "Beneficiario" (e.g., "UF Beneficiario", "CNPJ Beneficiario"). The `normalizeHeader` strips accents, and the partial match logic (`h.includes(ind)`) will match any header containing "beneficiario".

4. **CRM_COLUMN_MAP** -- Add missing column mappings for Vitoria's extra columns and the standalone "Municipio" header:
```typescript
'contato': 'telefone',       // Vitoria's "Contato" column
'email': 'email',            // Vitoria's "EMAIL" column
'valor': 'valor_emenda',     // Vitoria's "VALOR" column
'municipio': 'municipio',    // Vitoria's standalone "Municipio" (no "beneficiario" suffix)
```
Note on 'municipio' mapping: `mapHeaders()` does exact match first (line 108 `columnMap[norm]`), so 'municipio' exact match fires for Vitoria's "Municipio" header. The existing 'municipio beneficiario' entry still matches "Municipio Beneficiario" via partial match on other sheets. This is safe because exact match is checked before partial match in mapHeaders.
  </action>
  <verify>
Run `npx tsc --noEmit` from the web directory to verify no type errors. Then grep the file to confirm:
1. `grep 'projetus.org' src/app/api/import-spreadsheet/route.ts` -- VENDEDOR_MAP updated
2. `grep 'beneficiario' src/app/api/import-spreadsheet/route.ts` -- present in crmIndicators
3. `grep "'contato'" src/app/api/import-spreadsheet/route.ts` -- CRM_COLUMN_MAP has contato
4. `grep 'normalizeHeader(sheetName)' src/app/api/import-spreadsheet/route.ts` -- sheet name normalization fixed
  </verify>
  <done>
detectFormat returns 'crm' for headers containing "Beneficiario". VENDEDOR_MAP uses @projetus.org emails. Sheet name "Gabriel " (trailing space) and "Vitoria" (accented) correctly resolve to vendedor IDs via normalizeHeader. CRM_COLUMN_MAP includes contato->telefone, email->email, valor->valor_emenda, municipio->municipio.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Vitoria header-shift detection, unnamed-column extraction, and spreadsheet contact preference</name>
  <files>src/app/api/import-spreadsheet/route.ts</files>
  <action>
Three features to add:

**A. Vitoria Header-Shift Detection**

Add a new function `detectAndFixHeaderShift` after the existing `mapHeaders` function. The problem: Vitoria's sheet has header "UF Beneficiario" but the DATA in that column contains ministry names (orgao_concedente), not UF codes. Similarly, "Municipio Beneficiario" contains 2-letter state codes, not city names. Detect and remap by sampling the first data row:

```typescript
function detectAndFixHeaderShift(
  headerMap: Record<string, string>,
  sampleRow: Record<string, unknown>
): Record<string, string> {
  const fixed = { ...headerMap }
  // Find the original header currently mapped to 'uf'
  const ufHeader = Object.entries(fixed).find(([_, v]) => v === 'uf')?.[0]
  if (!ufHeader) return fixed

  const sampleUfValue = String(sampleRow[ufHeader] || '').trim()
  // UF codes are 2 chars (e.g., "SP", "RJ"). If value >3 chars, it's actually orgao data
  if (sampleUfValue.length > 3) {
    // Find headers mapping to 'municipio' -- there may be two:
    // 1. From "Municipio Beneficiario" (partial match) -- actually contains UF codes
    // 2. From "Municipio" (exact match) -- contains real city names
    const municipioHeaders = Object.entries(fixed).filter(([_, v]) => v === 'municipio')

    let ufDataHeader: string | null = null
    let cityDataHeader: string | null = null

    for (const [origHeader] of municipioHeaders) {
      const norm = normalizeHeader(origHeader)
      if (norm.includes('beneficiario')) {
        ufDataHeader = origHeader   // "Municipio Beneficiario" -> actually has UF codes
      } else {
        cityDataHeader = origHeader // "Municipio" -> actually has city names
      }
    }

    // Remap the shifted columns
    fixed[ufHeader] = 'orgao_concedente'           // "UF Beneficiario" -> orgao_concedente
    if (ufDataHeader) fixed[ufDataHeader] = 'uf'   // "Municipio Beneficiario" -> uf
    if (cityDataHeader) fixed[cityDataHeader] = 'municipio' // stays as municipio
  }
  return fixed
}
```

Then in the per-sheet processing loop, change the headerMap assignment (currently at ~line 256):
From:
```typescript
const headerMap = mapHeaders(sampleHeaders, columnMap)
```
To:
```typescript
const headerMap = detectAndFixHeaderShift(mapHeaders(sampleHeaders, columnMap), rawRows[0])
```

**B. Unnamed Column Extraction (Gabriel's extra data)**

In the row iteration loop, AFTER building the `row` object from headerMap (lines ~265-268), add detection of `__EMPTY` keys from xlsx.utils.sheet_to_json output. Gabriel's sheet has 9 data values per row but only 7 headers, so the extra columns appear as __EMPTY, __EMPTY_1 keys:

```typescript
// Extract data from unnamed columns (__EMPTY, __EMPTY_1, etc.)
// Gabriel's sheet has extra unlabeled columns with email and phone data
for (const [key, val] of Object.entries(raw)) {
  if (!key.startsWith('__EMPTY') || !val || String(val).trim() === '') continue
  const strVal = String(val).trim()
  if (strVal.includes('@') && !row.email) {
    row.email = strVal
  } else if (/^[\d\s\-().+]+$/.test(strVal) && strVal.replace(/\D/g, '').length >= 8 && !row.telefone) {
    row.telefone = strVal
  }
}
```

**C. Spreadsheet contact data preference over proponentes enrichment**

Modify the contact enrichment section (currently lines ~298-301). Currently it only uses proponentes data. Change to prefer spreadsheet's own email/telefone over proponentes enrichment:

Replace:
```typescript
const contact = contactByCnpj.get(cnpj)
const enrichedTelefone = contact?.telefone || null
const enrichedEmail = contact?.email || null
if (contact) enriched++
```

With:
```typescript
// Prefer spreadsheet's own contact data over proponentes enrichment
const spreadsheetTelefone = row.telefone ? String(row.telefone).trim() : null
const spreadsheetEmail = row.email ? String(row.email).trim() : null
const contact = contactByCnpj.get(cnpj)
const finalTelefone = spreadsheetTelefone || contact?.telefone || null
const finalEmail = spreadsheetEmail || contact?.email || null
if (contact || spreadsheetTelefone || spreadsheetEmail) enriched++
```

Then update the values array to use `finalTelefone` and `finalEmail` instead of `enrichedTelefone` and `enrichedEmail` (lines ~333-334).
  </action>
  <verify>
Run `npx tsc --noEmit` from the web directory to verify no type errors. Then grep to confirm all features:
1. `grep 'detectAndFixHeaderShift' src/app/api/import-spreadsheet/route.ts` -- function exists and is called
2. `grep '__EMPTY' src/app/api/import-spreadsheet/route.ts` -- unnamed column extraction exists
3. `grep 'finalTelefone\|finalEmail' src/app/api/import-spreadsheet/route.ts` -- contact preference logic
4. `grep 'spreadsheetTelefone\|spreadsheetEmail' src/app/api/import-spreadsheet/route.ts` -- spreadsheet data extracted
  </verify>
  <done>
Vitoria's shifted columns are auto-detected by sampling first row (UF value >3 chars triggers remap: UF Beneficiario->orgao_concedente, Municipio Beneficiario->uf, Municipio->municipio). Gabriel's unnamed __EMPTY columns are scanned for email (contains @) and phone (8+ digits) patterns. Spreadsheet contact data takes precedence over proponentes enrichment. All 4 sheets (Wellington, Elisson, Gabriel, Vitoria) can be correctly parsed and imported.
  </done>
</task>

</tasks>

<verification>
After both tasks, verify the complete route compiles:
```bash
cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit
```

Grep confirmations:
1. `grep 'projetus.org' src/app/api/import-spreadsheet/route.ts` -- VENDEDOR_MAP updated
2. `grep 'beneficiario' src/app/api/import-spreadsheet/route.ts` -- format detection updated
3. `grep '__EMPTY' src/app/api/import-spreadsheet/route.ts` -- unnamed column extraction
4. `grep 'detectAndFixHeaderShift' src/app/api/import-spreadsheet/route.ts` -- shift detection
5. `grep 'finalTelefone\|finalEmail' src/app/api/import-spreadsheet/route.ts` -- contact preference
6. `grep 'normalizeHeader(sheetName)' src/app/api/import-spreadsheet/route.ts` -- sheet name normalization
</verification>

<success_criteria>
- TypeScript compiles without errors
- detectFormat() returns 'crm' for headers with "Beneficiario" columns
- VENDEDOR_MAP maps to @projetus.org emails (matching users table)
- Sheet name normalization handles trailing spaces ("Gabriel ") and accents ("Vitoria") via normalizeHeader
- CRM_COLUMN_MAP includes contato->telefone, email->email, valor->valor_emenda, municipio->municipio mappings
- Vitoria's shifted columns are auto-detected and remapped using first-row sampling
- Gabriel's __EMPTY columns are scanned for email/phone patterns
- Spreadsheet contact data preferred over proponentes enrichment
- importado_de set to 'crm' (already works since format='crm')
</success_criteria>

<output>
After completion, create `.planning/quick/6-verificar-populacao-db-e-importar-base-p/6-SUMMARY.md`
</output>

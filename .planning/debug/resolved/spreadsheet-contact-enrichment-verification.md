---
status: resolved
trigger: "Investigate issue: spreadsheet-contact-enrichment-verification"
created: 2026-02-12T00:00:00Z
updated: 2026-02-12T00:04:00Z
---

## Current Focus

hypothesis: Contact enrichment from proponentes table may not be implemented in one or both upload endpoints
test: Audit both import API routes for proponentes lookup and contact field population
expecting: Find presence or absence of CNPJ → proponentes query logic in each endpoint
next_action: Read both upload endpoint implementations

## Symptoms

expected: When importing spreadsheets, system should automatically populate telefone/email fields by looking up CNPJs in the proponentes table (the "repository" mentioned in CONTACTS_SYSTEM.md)
actual: Uncertain if enrichment logic is actually implemented in the upload endpoints
errors: None reported - this is a verification/audit request
reproduction:
1. Upload CLIENTES.xlsx via /upload-clientes page → should enrich with contacts
2. Upload new leads via /upload page → should enrich with contacts
started: Feature was recently built (quick task 8), CONTACTS_SYSTEM.md documents the enrichment flow, but implementation needs verification

## Eliminated

## Evidence

- timestamp: 2026-02-12T00:01:00Z
  checked: /web/src/app/api/import-spreadsheet/route.ts (lines 205-218)
  found: Full contact enrichment implementation present
  implication: ✅ /api/import-spreadsheet DOES implement contact enrichment from proponentes table

- timestamp: 2026-02-12T00:01:30Z
  checked: /web/src/app/api/import-spreadsheet/route.ts (lines 297-301, 334-335)
  found: Contact data (telefone, email) is populated during lead insertion from contactByCnpj Map
  implication: ✅ Enriched contacts are being written to vendedor_projetos table

- timestamp: 2026-02-12T00:02:00Z
  checked: /web/src/app/api/import-existing-clients/route.ts (full file)
  found: NO proponentes query, NO contact fields, only inserts CNPJ and nome to existing_clients table
  implication: ❌ /api/import-existing-clients does NOT implement contact enrichment (but doesn't need to - this table is just a CNPJ registry)

- timestamp: 2026-02-12T00:03:00Z
  checked: CONTACTS_SYSTEM.md documentation vs implementation
  found: Documentation matches import-spreadsheet implementation exactly (lines 104-119 in docs)
  implication: ✅ Documentation is accurate for the main leads import feature

## Resolution

root_cause: Contact enrichment IS properly implemented in /api/import-spreadsheet (the main leads import endpoint). The /api/import-existing-clients endpoint does NOT have enrichment, but this is intentional - it only manages the existing_clients table (a simple CNPJ registry), not the vendedor_projetos table where contacts are needed.

fix: No fix needed - implementation is correct as designed

verification: Code audit confirms:
1. ✅ /api/import-spreadsheet loads proponentes contact data (lines 205-218)
2. ✅ Creates Map of CNPJ → {telefone, email} (line 212)
3. ✅ Populates contact fields during insert (lines 297-301, 334-335)
4. ✅ Tracks enrichment stats and returns enriched count (line 365)
5. ❌ /api/import-existing-clients does not enrich (intentional - different table/purpose)

files_changed: []

---
status: resolved
trigger: "Lead duplicado para FEDERACAO PARAIBANA DE TIRO PRATICO (CNPJ: 00.293.195/0001-05) - investigar o motivo do registro aparecer duplicado no sistema CRM."
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T01:30:00Z
---

## Current Focus

hypothesis: RESOLVED
test: Verified - both emendas now under Wellington. 0 CNPJs with split vendedores.
expecting: N/A
next_action: N/A - complete

## Symptoms

expected: O lead FEDERACAO PARAIBANA DE TIRO PRATICO (CNPJ 00.293.195/0001-05) deve aparecer apenas uma vez no CRM
actual: O lead aparece duplicado no sistema - 2 rows com vendedores diferentes (Gabriel emenda 42700021, Wellington emenda 43170016)
errors: Nenhum erro visível - é um problema de dados
reproduction: Ver a lista de leads no CRM e buscar por "FEDERACAO PARAIBANA" ou pelo CNPJ 00.293.195/0001-05
started: 2026-02-20 (quando o sync inseriu ambas as emendas)

## Eliminated

- hypothesis: Duplicate rows caused by missing unique constraint
  evidence: Unique constraint on (cnpj, codigo_programa, COALESCE(nr_emenda,'')) exists and works - the 2 rows are legitimately different (different nr_emenda values)
  timestamp: 2026-02-23T00:05:00Z

- hypothesis: Duplicate display in frontend (grouping bug)
  evidence: Frontend groups by CNPJ correctly - both rows ARE merged in gestor all-leads view. Problem is they're split across different vendedores.
  timestamp: 2026-02-23T00:10:00Z

## Evidence

- timestamp: 2026-02-23T00:05:00Z
  checked: vendedor_projetos table for CNPJ 00293195000105
  found: 2 rows - id=1416 (Gabriel, emenda 42700021, "Não Contatado") and id=1417 (Wellington, emenda 43170016, "Retorno")
  implication: Both inserted on 2026-02-20 in same sync run, each got different vendedor via round-robin

- timestamp: 2026-02-23T00:08:00Z
  checked: repo-sync.ts assignment logic (lines 630-656)
  found: A prior "bug fix" comment removed the cnpjAssignments fallback that kept all emendas of a CNPJ under the same vendedor. New emendas for existing CNPJs went straight to round-robin.
  implication: This is the root cause - when both emendas were new, round-robin assigned them to different vendedores

- timestamp: 2026-02-23T00:15:00Z
  checked: All CNPJs with multiple distinct vendedor_ids
  found: 229 CNPJs had rows split across different vendedores. Problem was systemic.
  implication: Many leads were being worked independently by different vendedores for the same organization

- timestamp: 2026-02-23T00:20:00Z
  checked: Old pipe-separated rows
  found: 26 rows still have nr_emenda LIKE '%|%' - orphaned from old format (secondary issue)
  implication: These may show additional duplicates in some views but are separate from the primary bug

## Resolution

root_cause: In repo-sync.ts, when a CNPJ already has rows assigned to vendedor A, and a NEW emenda arrives for that same CNPJ (in the same or later sync run), the new emenda went through round-robin and got assigned to vendedor B. The prior cnpjAssignments fallback was removed in a "bug fix" but that fix inadvertently broke the invariant "all emendas of same CNPJ go to same vendedor."

fix:
  1. repo-sync.ts: Added cnpjAssignments check BEFORE round-robin. If CNPJ already has any assignment, inherit that vendedor. Also populate cnpjAssignments when a truly-new CNPJ first gets assigned, so same-batch emendas also inherit correctly.
  2. Data repair (scripts/fix-split-vendedor-assignments.mjs): Consolidated all 229 affected CNPJs to their most-engaged vendedor (best status wins, then earliest created_at tie-breaks).

verification:
  - FEDERACAO PARAIBANA: both rows now under Wellington (had "Retorno" status - most engaged)
  - 0 CNPJs with split vendedor assignments remain (down from 229)
  - TypeScript compilation: clean (no errors)

files_changed:
  - web/src/lib/repo-sync.ts (assignment logic fix - new cnpjAssignments fallback branch)
  - web/scripts/fix-split-vendedor-assignments.mjs (one-time data repair script, kept for reference)

commit: cbb36d6

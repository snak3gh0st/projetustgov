---
phase: quick-56
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/[cnpj]/route.ts
  - web/scripts/fix-closer-commission-data.mjs
autonomous: true
requirements: [CLOSER-SPLIT-FIX]
must_haves:
  truths:
    - "When tipo_vendedor changes on a Fechado lead with closer_id, split commission (SDR 1%+R$50, Closer 3%) is re-applied"
    - "All existing Fechado leads with closer_id have correct comissao_valor (1% of valor_venda) and closer_comissao_valor (3% of valor_venda)"
  artifacts:
    - path: "web/src/app/api/leads/[cnpj]/route.ts"
      provides: "Fixed tipo_vendedor recalc branch that respects closer_id split"
    - path: "web/scripts/fix-closer-commission-data.mjs"
      provides: "Data verification and fix script for existing leads"
  key_links:
    - from: "web/src/app/api/leads/[cnpj]/route.ts (line ~222)"
      to: "split commission logic (line ~138)"
      via: "closer_id check before tipo_vendedor recalc"
      pattern: "hasCloser.*closer_comissao"
---

<objective>
Fix the closer/SDR commission split edge case and verify existing data integrity.

Purpose: When tipo_vendedor changes on a Fechado lead that has a closer_id, the current code ignores split commission and applies standard rates. This leaves stale closer_comissao_valor and wrong comissao_valor. Also verify all existing split-commission leads in the DB have correct values.

Output: Patched PATCH route + data verification/fix script.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/api/leads/[cnpj]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tipo_vendedor recalc to respect closer_id split commission</name>
  <files>web/src/app/api/leads/[cnpj]/route.ts</files>
  <action>
In the PATCH route, lines 222-263, the `else if (body.tipo_vendedor !== undefined && !body.status_contato)` branch recalculates commission when tipo_vendedor changes on an already-Fechado lead. Currently it IGNORES closer_id and applies standard commission logic.

Fix: Add a closer_id check at the start of this branch. If the lead has a closer_id, re-apply split commission (same logic as lines 138-152):
- SDR: comissao_percentual=1.00, comissao_valor=valor_venda*0.01, comissao_bonus=50.00
- Closer: closer_comissao_percentual=3.00, closer_comissao_valor=valor_venda*0.03

Implementation:
1. Before the existing CTE query (line 224), query for `closer_id` and `status_contato` from the lead
2. If `closer_id IS NOT NULL AND status_contato = 'Fechado'`, run the split commission UPDATE (same as the hasCloser block at line 142-152) and return early from this branch
3. If no closer_id, fall through to existing standard recalculation logic (lines 224-263)

The check must query the DB (not rely on body fields) because closer_id is set server-side, not sent by client.
  </action>
  <verify>
    Manually verify by reading the updated file and confirming:
    1. The tipo_vendedor branch (around line 222) now checks for closer_id before recalculating
    2. When closer_id exists, it applies SDR 1%+R$50 / Closer 3% split
    3. When closer_id is null, it falls through to existing standard logic unchanged
    4. TypeScript compiles: cd web && npx tsc --noEmit --pretty 2>&1 | head -30
  </verify>
  <done>tipo_vendedor changes on Fechado leads with closer_id correctly re-apply split commission instead of standard rates</done>
</task>

<task type="auto">
  <name>Task 2: Create data verification script for existing split-commission leads</name>
  <files>web/scripts/fix-closer-commission-data.mjs</files>
  <action>
Create a Node.js script that connects to the production DB (using DATABASE_URL from .env) and:

1. Query all leads: `SELECT id, cnpj, nome, valor_venda, comissao_percentual, comissao_valor, comissao_bonus, closer_id, closer_comissao_percentual, closer_comissao_valor FROM vendedor_projetos WHERE closer_id IS NOT NULL AND status_contato = 'Fechado'`

2. For each lead, check:
   - comissao_percentual should be 1.00
   - comissao_valor should be valor_venda * 0.01
   - comissao_bonus should be 50.00
   - closer_comissao_percentual should be 3.00
   - closer_comissao_valor should be valor_venda * 0.03

3. Print a table of all leads with their current vs expected values, flagging any mismatches.

4. If run with `--fix` flag, execute UPDATE statements to correct any mismatched values. Without `--fix`, only report (dry run).

Use `pg` package (already in project dependencies). Load DATABASE_URL from `web/.env` using dotenv or manual parsing.

Print summary: total leads checked, total correct, total needing fix.
  </action>
  <verify>
    Run in dry-run mode: cd web && node scripts/fix-closer-commission-data.mjs 2>&1
    Should print a table of split-commission leads with current vs expected values and a summary.
  </verify>
  <done>Script reports all Fechado leads with closer_id showing current vs expected commission values, and can fix mismatches with --fix flag</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `cd web && npx tsc --noEmit`
2. Data script runs in dry-run mode and reports findings
3. Code review: tipo_vendedor branch now has closer_id guard before standard recalc
</verification>

<success_criteria>
- The tipo_vendedor recalculation branch in the PATCH route checks for closer_id and applies split commission when present
- A runnable script exists to audit and fix existing split-commission data
- No TypeScript compilation errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/56-fix-closer-sdr-commission-split-closer-3/56-SUMMARY.md`
</output>

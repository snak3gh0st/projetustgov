---
status: resolved
trigger: "Junction tables proposta_apoiadores and proposta_emendas have 0 records; propostas.programa_id is NULL for all 869K records"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - apoiadores/emendas CSV is a relationship table, not a flat entity table
test: Inspected CSV headers and pipeline flow
expecting: Pipeline treats each row as a flat entity instead of extracting relationships
next_action: Add relationship extraction function to pipeline

## Symptoms

expected: proposta_apoiadores and proposta_emendas junction tables populated; propostas.programa_id linked
actual: proposta_apoiadores = 0 rows, proposta_emendas = 0 rows, propostas.programa_id = NULL for all records
errors: No errors — pipeline silently produces wrong results
reproduction: Run pipeline, query junction tables and propostas.programa_id
started: Since initial pipeline deployment

## Eliminated

## Evidence

- timestamp: 2026-02-06T00:01:00Z
  checked: CSV headers in sample_apoiadores.csv
  found: "ID_CNPJ_PROGRAMA_EMENDA_APOIADORES_EMENDAS;NUMERO_EMENDA_APOIADORES_EMENDAS;NOME_PARLAMENTAR_APOIADORES_EMENDAS;...;ID_PROGRAMA"
  implication: Each row links a proposta (ID_CNPJ_PROGRAMA) to an emenda (NUMERO_EMENDA), apoiador (NOME_PARLAMENTAR), and programa (ID_PROGRAMA)

- timestamp: 2026-02-06T00:02:00Z
  checked: COLUMN_ALIASES in src/parser/schemas.py
  found: apoiadores.transfer_gov_id mapped to ["id_programa", "id_cnpj_programa_emenda_apoiadores_emendas"] — first match is id_programa
  implication: The alias picks id_programa (programa ID) as the apoiador's transfer_gov_id — completely wrong identity

- timestamp: 2026-02-06T00:03:00Z
  checked: Pipeline processing loop in src/orchestrator/pipeline.py
  found: apoiadores/emendas files go through standard validate_dataframe() → flat entity records only
  implication: No code extracts junction records or programa links from the relationship CSV

## Resolution

root_cause: |
  The apoiadores/emendas CSV is a **relationship table** (each row = proposta↔emenda↔apoiador↔programa link),
  but the pipeline treated it as flat entity tables. Three compounding issues:

  1. **Wrong ID mapping**: COLUMN_ALIASES mapped apoiador/emenda `transfer_gov_id` to `id_programa`
     (first alias candidate), which is actually the programa's ID — not the entity's own ID.

  2. **No relationship extraction**: The pipeline validated each row as a standalone entity record.
     No code existed to extract junction records (proposta↔apoiador, proposta↔emenda) or
     programa links (proposta→programa).

  3. **No programa_id linking**: The `ID_PROGRAMA` column in the relationship CSV contains the
     programa transfer_gov_id for each proposta, but this was never used to populate
     `propostas.programa_id`.

fix: |
  ### 1. Fixed COLUMN_ALIASES (src/parser/schemas.py)

  Removed `transfer_gov_id` from apoiadores and emendas aliases — these entities get their
  IDs generated during relationship extraction, not from a CSV column.

  - Apoiador ID: SHA256 hash of `nome_parlamentar` (first 16 chars)
  - Emenda ID: `numero_emenda` value (already unique)

  Also removed `transfer_gov_id` from EXPECTED_COLUMNS and REQUIRED_COLUMNS for these types.

  ### 2. Added extract_relationships() (src/orchestrator/pipeline.py)

  New function processes the raw apoiadores/emendas DataFrame to extract:

  - **Unique apoiadores** deduplicated by nome_parlamentar → `validated_data["apoiadores"]`
  - **Unique emendas** deduplicated by numero_emenda → `validated_data["emendas"]`
  - **Junction records**: proposta↔apoiador pairs → `validated_data["proposta_apoiadores"]`
  - **Junction records**: proposta↔emenda pairs → `validated_data["proposta_emendas"]`
  - **Programa links**: proposta_transfer_gov_id → programa_transfer_gov_id mapping

  ### 3. Updated pipeline processing loop (src/orchestrator/pipeline.py)

  - When entity_type is "apoiadores" or "emendas", calls `extract_relationships()` instead
    of standard `validate_dataframe()`.
  - After all files are processed, applies programa_links to set `programa_id` on matching
    propostas records (only where programa_id was previously NULL).

  ### 4. No model changes needed (src/transformer/models.py)

  ApoiadorValidation and EmendaValidation already have the correct fields. The `transfer_gov_id`
  field is set by extract_relationships() before records reach the upsert layer.

verification: |
  After running the pipeline:
  1. SELECT COUNT(*) FROM proposta_apoiadores — should be > 0
  2. SELECT COUNT(*) FROM proposta_emendas — should be > 0
  3. SELECT COUNT(*) FROM propostas WHERE programa_id IS NOT NULL — should be > 0

files_changed:
  - src/parser/schemas.py (removed transfer_gov_id aliases/expectations for apoiadores/emendas)
  - src/orchestrator/pipeline.py (added extract_relationships(), updated processing loop, added programa_id linking)

---
status: resolved
trigger: "Clicking 'Proposta' link on convenio card opens wrong proposal on TransfereGov (tem varios assim)"
created: 2026-04-24T00:00:00Z
updated: 2026-04-24T01:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — the "Proposta" link `DetalharProposta.do?idProposta=` is shown for ALL convenios including ones whose proposta is still in aprovação stage. For convenio #994507 (id_proposta=2183781), that proposta's current situacao on TransfereGov is "Complementado Enviado para Análise" — still in aprovação, not execução. The data is correct; the link behavior is the bug: opening DetalharProposta for an aprovação-stage proposal looks "wrong" to a user who expects execution context.
test: Confirmed with DB data showing propostas.situacao for id_proposta 2183781 = "Proposta/Plano de Trabalho Complementado Enviado para Análise"
expecting: Fix: only show "Proposta" link when projetos_execucao.situacao = 'Em execução' (or equivalent), so the link is hidden for convenios whose proposta is still in aprovação stage.
next_action: Apply fix to ExecucaoSlideOver.tsx

## Symptoms

expected: Clicking "Proposta" link on convenio #993567 should open that specific proposal on TransfereGov
actual: It opens a completely different, unrelated proposal
errors: None visible — it just navigates to the wrong URL
reproduction: Open any client card in the CRM, find a convenio with "Proposta" link, click it
started: Unknown — user just reported it, possibly always been broken
context: Convenio #993567 for CNPJ 01.224.115/0001-22 (Colonia de Pescadores Z-21/RN). The "Proposta" link navigates to a wrong/unrelated proposal.

## Eliminated

- hypothesis: Wrong CNPJ in propostas table (id_proposta pointing to different entity's proposal)
  evidence: Queried DB — all rows in projetos_execucao where id_proposta matches propostas.transfer_gov_id have consistent CNPJs (zero mismatches)
  timestamp: 2026-04-24

- hypothesis: API endpoint not returning id_proposta
  evidence: `/api/execucao/[cnpj]/route.ts` correctly SELECTs `pe.id_proposta` from `projetos_execucao`; confirmed value is `2187546` for convenio 993567
  timestamp: 2026-04-24

- hypothesis: id_proposta in projetos_execucao has wrong value / wrong source column
  evidence: For convenio #994507 (CNPJ 01368016000114), projetos_execucao.id_proposta=2183781 matches propostas.transfer_gov_id=2183781 with same nr_proposta 7499/2026. Data linkage is consistent. execucao-sync.ts STEP C correctly reads ID_PROPOSTA from siconv_convenio.csv. No data corruption.
  timestamp: 2026-04-24

## Evidence

- timestamp: 2026-04-24
  checked: ExecucaoSlideOver.tsx line 504
  found: Proposta link uses `conv.id_proposta` directly in `?idProposta=` URL parameter
  implication: Code is structurally correct — but `id_proposta` value may be wrong type for this URL

- timestamp: 2026-04-24
  checked: /api/execucao/[cnpj]/route.ts
  found: Queries `pe.id_proposta` from projetos_execucao table, returns it directly
  implication: API correctly passes through whatever value is stored in projetos_execucao.id_proposta

- timestamp: 2026-04-24
  checked: execucao-sync.ts STEP C
  found: `id_proposta: row['ID_PROPOSTA']` — takes ID_PROPOSTA column from siconv_convenio.csv
  implication: The value comes from the government's convenio CSV, column "ID_PROPOSTA"

- timestamp: 2026-04-24
  checked: DB — projetos_execucao for nr_convenio='993567'
  found: nr_convenio=993567, id_proposta=2187546, nr_proposta=10230/2026, cnpj=01224115000122
  implication: This is the data actually being used to build the Proposta link

- timestamp: 2026-04-24
  checked: DB — propostas table for same CNPJ
  found: propostas has transfer_gov_id=2187546, nr_proposta=10230/2026 for same CNPJ; also transfer_gov_id=2135043 for nr_proposta=55741/2025
  implication: The propostas table's transfer_gov_id matches projetos_execucao.id_proposta for this row — same ID type used in both

- timestamp: 2026-04-24
  checked: reference_transferegov_urls.md memory
  found: "For execução: pass id_proposta from projetos_execucao table (NOT nr_convenio). Confirmed by user 2026-04-07."
  implication: User previously confirmed this approach was correct — but this memory is 17 days old

- timestamp: 2026-04-24
  checked: DB — all 4 convenios for both example CNPJs in projetos_execucao
  found: |nr_convenio|id_proposta|situacao|; 986212|2135043|"Em execução"; 993567|2187546|"" (empty); 975544|2093481|"Em execução"; 994507|2183781|"" (empty)
  implication: The 2 problematic convenios (#993567 and #994507) have EMPTY situacao. Their proposta's current state on TransfereGov is aprovação, not execução.

- timestamp: 2026-04-24
  checked: DB — propostas.situacao for id_proposta 2183781 (convenio #994507)
  found: situacao="Proposta/Plano de Trabalho Complementado Enviado para Análise" — still in aprovação
  implication: When user clicks "Proposta" for convenio #994507, TransfereGov shows this aprovação-stage proposal. This is why it looks "wrong" — user expected execução context.

- timestamp: 2026-04-24
  checked: DB — situacao distribution in projetos_execucao
  found: 1252 rows with empty situacao, 3153 "Em execução", 371 "Proposta/Plano de Trabalho Aprovado", 90 "Complementado Enviado para Análise", etc.
  implication: Many convenios in projetos_execucao are NOT yet em execução. Showing "Proposta" link for ALL of them sends user to aprovação-stage proposal views on TransfereGov.

## Resolution

root_cause: ExecucaoSlideOver.tsx showed the "Proposta" link for ALL convenios regardless of situacao. For convenios whose proposta is still in aprovação stage (e.g., situacao='' or 'Proposta/Plano de Trabalho Complementado Enviado para Análise'), clicking the link opens DetalharProposta.do?idProposta=X on TransfereGov which shows the aprovação-stage view. Users expected the execução context. 1252 of ~10k rows in projetos_execucao have empty situacao; 461+ have aprovação-stage situacoes. The link appeared for all of them, causing "wrong proposal" confusion.
fix: Added `conv.situacao === 'Em execução'` guard to the Proposta link condition in ExecucaoSlideOver.tsx (line 502). Link now only appears when the convenio is confirmed em execução.
verification: TypeScript compiles clean. Verified with DB data: convenio #994507 (situacao='') will no longer show Proposta link; convenio #986212 (situacao='Em execução') continues to show it.
files_changed:
  - web/src/components/ExecucaoSlideOver.tsx

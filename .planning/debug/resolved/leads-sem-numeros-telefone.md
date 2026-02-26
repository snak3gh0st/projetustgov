# Debug: Leads sem números de telefone

## Status: RESOLVED (2026-02-26)

## Symptoms
Gestor reportou "Não estão com números" — leads aparecem sem telefone na lista.

## Root Cause
3 gaps no pipeline de enriquecimento do sync:

1. **UPSERT não incluía telefone/email no INSERT** — leads novos entravam com telefone=NULL no vendedor_projetos
2. **STEP 8a só enfileirava CNPJs sem dados do proponente** — se proponente tinha tel, o CNPJ não era enfileirado para BrasilAPI e também não aparecia na enrichment_queue
3. **STEP 9 só processava CNPJs do batch atual** — leads de syncs anteriores que não receberam lead_contacts nunca eram reprocessados
4. **STEP 8b não verificava lead_contacts** — só checava vendedor_projetos por dados faltantes, ignorando o gap entre vp e lead_contacts

## Impact
- 695 leads sem telefone (de 2,425 total = 28.6%)
- 683 leads sem nenhum registro em lead_contacts
- 406 desses tinham dados em proponentes que nunca foram copiados

## Fix Applied
1. **UPSERT inclui telefone/email** — novos leads já entram com dados do proponente
2. **STEP 8a enfileira TODOS novos CNPJs** — mesmo com dados do proponente (BrasilAPI pega phone2/endereco)
3. **STEP 8b2 novo** — enfileira CNPJs sem lead_contacts (safety net)
4. **STEP 9 processa TODOS CNPJs sem lead_contacts** — não apenas batch atual
5. **Backfill executado** — 406 contatos criados do proponentes, 276 enfileirados para BrasilAPI

## After Fix
- Leads sem contato: 683 → 276 (BrasilAPI resolverá no próximo cron)
- Leads sem telefone: 695 → 334 (BrasilAPI preencherá gaps)

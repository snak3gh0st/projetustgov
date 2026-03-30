# Phase 18: Lead Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 18-lead-distribution
**Areas discussed:** Deteccao de clientes, Locking e concorrencia

---

## Deteccao de clientes

| Option | Description | Selected |
|--------|-------------|----------|
| Usar vendedor_projetos | Se o CNPJ existe em vendedor_projetos com is_existing_client=true, e cliente | |
| Checar tag na aprovacao | Buscar no pipeline de aprovacao se o CNPJ tem tag_cliente_existente | |
| Flag dedicada execucao | Adicionar coluna is_cliente na projetos_execucao | |

**User's choice:** "Tag clients na area de execucao somente, vai para o coordenador" — clarified via follow-up that detection is automatic, coming from approval pipeline's `is_existing_client` flag.

**Follow-up Q:** "Como a tag 'cliente' e aplicada na execucao? Manual ou automatica?"
**Answer:** "automatica, vinda da aprovacao"

**Notes:** The `is_existing_client` boolean on `vendedor_projetos` is the authoritative source. When distributing execution leads, check this flag to route to coordenador.

---

## Locking e concorrencia

| Option | Description | Selected |
|--------|-------------|----------|
| Lock na funcao inteira | pg_advisory_lock com ID fixo, segundo espera | |
| Skip se locked | pg_try_advisory_lock, retorna imediatamente se ja rodando | |
| Voce decide | Claude escolhe a melhor abordagem tecnica | ✓ |

**User's choice:** "Voce decide"
**Notes:** User deferred technical implementation to Claude. Goal: prevent double-assignment between cron and manual trigger.

---

## Areas not discussed (user chose to skip)

- **Coordenador target** — How to identify which coordenador receives client leads
- **UI do trigger manual** — Where to place the distribute button and what feedback to show

Both areas were left to Claude's discretion.

## Claude's Discretion

- Locking strategy (wait vs skip-if-locked)
- Coordenador identification (by role query)
- UI placement and feedback for manual trigger
- Result display format

## Deferred Ideas

None — discussion stayed within phase scope

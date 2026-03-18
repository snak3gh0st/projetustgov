# Feature Research

**Domain:** Post-sales intelligence tab — government project execution monitoring (Projetos em Execução)
**Researched:** 2026-03-18
**Confidence:** HIGH (based on direct codebase analysis + domain knowledge of TransferênciaGov data structures)

---

## Context

This is a **subsequent milestone** on an existing CRM. The new `/execucao` tab is a read-only intelligence view
for gestores and coordenadores. It surfaces post-sale project health by cross-referencing convenio and proposta
tables (already in Supabase) and is explicitly **not** a workflow feature — no handoff buttons, no status updates.

The primary consumer is a gestor scanning for organizations whose grants are in financial trouble (negative
desembolso, poor execution rate) or whose grants are finishing soon (vigência expiring). The key data
cross-reference is:

```
convenio (situacao = "em execução") → proposta (modalidade = "OSC") → convenio (financials)
convenio.proposta_id → proposta.transfer_gov_id → proposta.proponente_cnpj → aggregate per CNPJ
```

Existing schema columns confirmed in `schema.sql`:
- `convenios.valor_desembolsado` — total disbursed
- `convenios.saldo_conta` — account balance
- `convenios.valor_global` — total approved amount
- `convenios.data_fim_vigencia` — end of validity
- `convenios.data_inicio_vigencia` — start of validity
- `convenios.situacao` — status ("em execução" is the target filter)
- `propostas.modalidade` — instrument type ("OSC" is the target filter)
- `propostas.proponente_cnpj` — CNPJ for aggregation back to CRM contacts

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the gestor assumes exist. Missing these = the tab is useless.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Filtered list of projects "em execução" | Core purpose of the tab. Gestor cannot use raw data without this filter. | LOW | SQL WHERE convenio.situacao ILIKE '%em execução%' AND proposta.modalidade ILIKE '%osc%' |
| % execução per project | Standard metric for any grant management view. Tells gestor how much of the grant has been spent. | LOW | (valor_desembolsado / valor_global) * 100. Column already exists in schema. |
| Saldo em conta per project | Critical: low saldo = client needs action. Missing this is the core gap the feature fills. | LOW | saldo_conta column already in convenios table |
| Data fim vigência + days remaining | Gestor needs to know urgency. Expiring grants = upsell opportunity. | LOW | data_fim_vigencia - CURRENT_DATE = dias_restantes |
| CNPJ-level aggregation | Client spec explicitly requires "quantidade de fomentos" per CNPJ as big number. Aggregating multiple convenios under one org is the key innovation. | MEDIUM | GROUP BY proposta.proponente_cnpj; COUNT convenios per CNPJ |
| Desembolso highlight logic | Client defined: negative desembolso = alert (red), positive desembolso = show saldo (green/amber). This is the primary decision signal. | LOW | Conditional row styling. desembolso negative = valor_desembolsado < 0 |
| Link to existing CRM contacts | Gestor must know if the org is already a client or has a contact in the CRM. This connects post-sale to pre-sale data. | MEDIUM | JOIN lead_contacts via CNPJ. Show contact name/phone if exists. |
| Access restricted to gestor + coordenador | Explicitly required. Vendedores must not see this view. | LOW | Same pattern as /monitoramento: role check in page server component + API route |

### Differentiators (Competitive Advantage)

Features that would make this tab significantly more useful than a plain table.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Clientes qualificados" big number KPI | Client explicitly requested this as a top-level KPI. One number showing how many active OSC clients PROJETUS has in execution. | LOW | COUNT DISTINCT cnpj WHERE situacao = em execução AND modalidade = OSC |
| "OSC" big number KPI | Second explicit KPI requested. Shows total OSC orgs in portfolio. | LOW | COUNT DISTINCT cnpj WHERE modalidade = OSC (regardless of status) |
| "Quantidade de fomentos" per CNPJ | Shows depth of relationship. A CNPJ with 5 active grants is far more valuable than one with 1. | LOW | COUNT(convenios.id) per CNPJ in the filtered set |
| Valor total em execução KPI | Sum of valor_global for all active projects. Shows the financial weight of the post-sale portfolio. | LOW | SUM(valor_global) WHERE situacao = em execução |
| Alert badge for negative desembolso | Visual priority signal so gestor can triage without reading every row. Red badge = action needed. | LOW | Inline badge component, reuse existing PRIORITY_COLORS pattern from /monitoramento |
| Sort by "risco" (expiring soonest + lowest saldo) | Gestor needs to see the most urgent cases first. Sorting by dias_restantes ASC surfaces imminent deadlines. | LOW | ORDER BY data_fim_vigencia ASC NULLS LAST as default sort |
| CNPJ expand/collapse for multiple grants | When one CNPJ has 3+ active grants, show them in an expandable sub-row. Reduces noise while preserving detail. | MEDIUM | Accordion row pattern. Already used in /leads with LeadSlideOver. |
| % execução visual progress bar | Progress bar (0-100%) communicates execution health faster than a raw number. Low % = possible execution delay risk. | LOW | Tailwind width-based bar. Already implemented in /monitoramento for perc_execucao. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Handoff / pós-venda workflow | "Now that we see a client in trouble, we should assign a post-sale rep" | Requires new data model (post_sale_assignments), new role, new notification system. Out of stated scope. Adds 3+ weeks. | Keep as read-only intelligence. Gestor identifies manually and communicates to team via existing channels. |
| Email/WhatsApp alerts for expiring grants | "Notify us when vigência is 30 days away" | Requires background scheduler, push notification setup. Push subscribe already exists but not wired to cron logic for this. | Export as list or build as v2 after validating which signals matter most. |
| Historical execution trend chart | "Show how fast this org is spending" | Requires desembolsos table join with time series — that table exists but is sparsely populated (proposta_emendas 0% populated per PROJECT.md). | Show current snapshot only. Add trend in v2 if data is available. |
| Editable notes on execution projects | "I want to add notes to post-sale projects" | Creates confusion between CRM lead notes and execution notes. Two note systems for same CNPJ = data fragmentation. | Gestor writes notes in existing lead/contact notes in CRM (same CNPJ exists in vendedor_projetos table). |
| Separate "post-sale status" pipeline | "Track each org through post-sale stages like we do with leads" | Duplicates the CRM pipeline for a different purpose. Would require a new kanban, new statuses, new assignment logic. | Build this as a separate milestone only after validating the read-only tab delivers value. |
| Real-time data (websockets/polling) | "I want to see changes instantly" | Data source is TransferênciaGov repo, updated once daily via cron. Real-time adds complexity with no benefit. | Daily refresh via existing cron sync is sufficient. |

---

## Feature Dependencies

```
[DB: SQL query joining convenios + propostas]
    └──required by──> [Filtered list em execução]
                          └──required by──> [Financial columns (desembolso, saldo, % exec)]
                          └──required by──> [CNPJ aggregation + fomentos count]
                          └──required by──> [Vigência days remaining]
                          └──required by──> [Header KPI cards]

[CNPJ aggregation]
    └──required by──> [Link to CRM contacts]
    └──required by──> [Clientes qualificados KPI]
    └──required by──> [CNPJ expand/collapse]

[Desembolso highlight logic]
    └──enhances──> [Filtered list em execução] (visual triage)

[Access control (gestor/coordenador only)]
    └──required by──> [All features on this tab]

[% execução progress bar]
    └──enhances──> [Filtered list em execução]

[Sort by risco]
    └──enhances──> [Filtered list em execução]
```

### Dependency Notes

- **Filtered list requires the convenio → proposta join:** The cross-reference `convenio.proposta_id → proposta.transfer_gov_id → proposta.proponente_cnpj` is the foundation. If proposta_id is sparsely populated in convenios, few rows will match. This is the highest-risk dependency and must be validated against actual data before committing to the approach.
- **CNPJ aggregation requires the join:** Cannot count fomentos-per-org without establishing which CNPJ each convenio belongs to. The join produces this.
- **CRM contact link requires CNPJ aggregation:** Cannot show "this org has a contact" without first knowing which CNPJ each project belongs to.
- **Access control has no dependencies:** Can be implemented independently as the route-level guard. Reuses existing `isAdmin(role)` and `verifySession` pattern from `dal.ts`.
- **Highlight logic has no dependency on contacts:** Pure presentation logic on desembolso value. Can be done entirely in the frontend once the data row includes valor_desembolsado.
- **KPI cards depend on the same query:** The gestor header metrics (clientes qualificados, quantidade de fomentos, valor total) are aggregates of the same filtered query. No separate data source needed.

---

## MVP Definition

### Launch With (v1 — this milestone)

Read-only intelligence view that gives the gestor actionable awareness of post-sale portfolio health.

- [ ] Route `/execucao` restricted to gestor + coordenador roles — uses existing `verifySession` + role check pattern from dal.ts
- [ ] SQL query joining convenios + propostas filtered to situacao=em execução AND modalidade=OSC — no new table required if query is performant
- [ ] CNPJ-level aggregated list: nome, CNPJ, count of active grants (fomentos), total valor_global — the core table
- [ ] Per-row financial columns: desembolso total, saldo em conta, % execução, data fim vigência, dias restantes
- [ ] Desembolso highlight: red row/badge if any convenio for this CNPJ has negative desembolso
- [ ] Header KPI cards: clientes qualificados (distinct CNPJs), quantidade de fomentos total, valor total em execução — reuse KPICard component
- [ ] Contact indicator: small badge if CNPJ exists in lead_contacts or vendedor_projetos table — no full contact details needed at launch
- [ ] Sidebar navigation entry for gestor/coordenador — add to existing Sidebar.tsx conditional navItems

### Add After Validation (v1.x)

- [ ] Expand/collapse per-CNPJ to show individual convenios — trigger: gestor feedback that single-row view loses too much detail
- [ ] Sort controls (by saldo, by % exec, by vigência) — trigger: gestor says default sort doesn't surface right cases
- [ ] UF / estado filter — trigger: gestor has regional focus and needs to segment
- [ ] Text search by org name or CNPJ — trigger: gestor has a specific client they want to find

### Future Consideration (v2+)

- [ ] Historical disbursement trend chart per CNPJ — defer: desembolsos table sparsely populated, needs data quality validation first
- [ ] Vigência expiration alerts via push notification — defer: requires cron wiring beyond current scope
- [ ] Post-sale assignment workflow — defer: entirely separate feature set, needs user research on process
- [ ] Export to CSV of orgs in execution — defer: useful but not critical for intelligence-only view

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Filtered list (em execução + OSC) | HIGH | LOW | P1 |
| CNPJ aggregation with fomentos count | HIGH | MEDIUM | P1 |
| Financial columns (desembolso, saldo, % exec) | HIGH | LOW | P1 |
| Vigência + dias restantes | HIGH | LOW | P1 |
| Desembolso alert highlight | HIGH | LOW | P1 |
| Header KPI cards | MEDIUM | LOW | P1 |
| Access control (gestor/coordenador) | HIGH | LOW | P1 |
| CRM contact link/badge | MEDIUM | LOW | P1 |
| Sidebar navigation entry | HIGH | LOW | P1 |
| % execução progress bar | MEDIUM | LOW | P2 |
| Expand/collapse per-CNPJ | MEDIUM | MEDIUM | P2 |
| Sort controls | MEDIUM | LOW | P2 |
| UF filter | LOW | LOW | P2 |
| Text search | MEDIUM | LOW | P2 |
| Historical trend chart | LOW | HIGH | P3 |
| Push alerts for expiring grants | LOW | HIGH | P3 |
| Post-sale workflow | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Implementation Notes for Roadmap

### Query Design (Informs Phase Structure)

The entire tab rests on one query. Phase 1 must validate the join produces usable data.

```sql
-- Core query pattern (validate before building UI)
SELECT
  prop.proponente_cnpj,
  COUNT(c.id)                           AS total_fomentos,
  SUM(c.valor_global)                   AS valor_total,
  SUM(c.valor_desembolsado)             AS total_desembolsado,
  SUM(c.saldo_conta)                    AS total_saldo_conta,
  CASE WHEN SUM(c.valor_global) > 0
    THEN (SUM(c.valor_desembolsado) / SUM(c.valor_global)) * 100
    ELSE 0 END                          AS perc_execucao,
  MIN(c.data_fim_vigencia)              AS proxima_vigencia_fim,
  (MIN(c.data_fim_vigencia) - CURRENT_DATE) AS dias_restantes,
  BOOL_OR(c.valor_desembolsado < 0)     AS has_negative_desembolso
FROM convenios c
INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
WHERE
  c.situacao ILIKE '%em execução%'
  AND prop.modalidade ILIKE '%osc%'
GROUP BY prop.proponente_cnpj
ORDER BY dias_restantes ASC NULLS LAST
```

Indexes needed on `convenios.situacao` and `propostas.modalidade` for performance. Verify these are absent in current schema.sql (they are — no index exists on these columns today).

### Data Quality Risk (Critical to Validate Early)

The join `convenios.proposta_id = propostas.transfer_gov_id` is the highest-risk dependency. If `proposta_id` is sparsely populated in the convenios table, the filtered set will be much smaller than expected. This should be the first thing validated in Phase 1 of the roadmap, before any UI work begins.

### Reuse Opportunities from Existing Code

These existing pieces should be reused directly, not reimplemented:

| Existing Component | Location | Reuse For |
|-------------------|----------|-----------|
| `KPICard` component | `/components/KPICard.tsx` | Header KPI cards (clientes qualificados, fomentos, valor total) |
| Priority badge pattern | `/monitoramento/page.tsx` PRIORITY_COLORS | Desembolso alert badge |
| Progress bar for % exec | `/monitoramento/page.tsx` | % execução visual bar |
| Role guard pattern | `verifySession` + role check in page.tsx | Restrict to gestor/coordenador |
| Sidebar conditional | `Sidebar.tsx` navItems array | Add /execucao entry for gestor + coordenador |
| Debounced filter pattern | `/monitoramento/page.tsx` searchTimeout | Search/filter if added |

---

## Competitor Feature Analysis

This is an internal tool with no direct competitors. Reference points:

| Feature | TransferênciaGov public portal | Existing /monitoramento tab | Our /execucao approach |
|---------|-------------------------------|---------------------------|------------------------|
| Status filter | Yes, per-project only | By priority (value-based), no status filter | Filter by situacao=em execução at query level |
| Financial metrics | Desembolsado, saldo, global | Uses valor_emenda as proxy (sparse real data) | Uses actual convenios columns: valor_desembolsado, saldo_conta, valor_global |
| CNPJ aggregation | No — project by project only | No — one row per project | Yes — aggregate by CNPJ, show fomentos count |
| Alert logic | None | Priority based on R$ value threshold | Alert based on desembolso sign (negative = problem) |
| Vigência tracking | Date shown in project detail | Not present | Computed dias_restantes column |
| CRM contact link | None | None | Badge if CNPJ in lead_contacts |
| Access control | Public | All authenticated users | Gestor + coordenador only |

---

## Sources

- Direct schema analysis: `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/schema.sql` — confirmed convenios, propostas table columns
- Direct code analysis: `web/src/app/api/leads/[cnpj]/instruments/route.ts` — confirmed valor_desembolsado, saldo_conta, data_fim_vigencia in active use
- Direct code analysis: `web/src/app/monitoramento/page.tsx` and `route.ts` — confirmed perc_execucao and priority badge patterns
- Direct code analysis: `web/src/lib/dal.ts` — confirmed role guard patterns (isAdmin, verifySession)
- Direct code analysis: `web/src/components/Sidebar.tsx` — confirmed conditional navItems pattern
- Client milestone spec: `.planning/PROJECT.md` v4.0 section — data flow, column references, KPI requirements
- [TransfereGov SICONV](https://siconv.com.br/) — confirms desembolso/saldo terminology in Brazilian federal grant context
- [Project Portfolio Dashboard patterns](https://birdviewpsa.com/blog/project-portfolio-dashboards/) — standard table stakes for financial execution monitoring dashboards

---

*Feature research for: Projetos em Execução intelligence tab (v4.0 milestone)*
*Researched: 2026-03-18*

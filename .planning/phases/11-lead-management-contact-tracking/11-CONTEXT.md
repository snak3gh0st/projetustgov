# Phase 11 Context — Meeting Decisions (2026-02-12)

Source: Alignment call with Tito Santana (client) and Paulo Loureiro

## Decisions (LOCKED)

### 1. Default Lead Status = "Não Contatado"
- All new leads arrive with status "não contatado" (5th status)
- Vendedor manually changes status after first contact
- Enables gestor to monitor who hasn't been contacted yet
- Status flow: Não Contatado → Ainda Não / Retorno / Proposta → Fechado

### 2. Existing Clients Exclusion (140+ CNPJs)
- Tito will provide spreadsheet with 140+ existing client CNPJs ("clientes transfer")
- These CNPJs must NOT be distributed to vendedores
- When new resources (emendas) are identified for these CNPJs, system must ALERT gestor
- Recaptation of existing clients is handled by Tito and Paulo (leadership), not vendedores

### 3. Parlamentar Column Placement
- Move parlamentar name column next to valor da emenda in lead view
- When multiple emendas exist, show sum with expandable cascade/dropdown for details

### 4. Proponente Registration Check (Priority Flag)
- Cross-reference CNPJ with conv_proponentes table
- If CNPJ has no registration (never executed anything) → flag as MAXIMUM PRIORITY
- No registration = never executed = highest value prospect
- Display indicator in lead list

### 5. Separate Campaign View from Execution Monitoring
- Current dashboard mixes execution monitoring (2025-2026 projects with % execution, saldo em conta) with campaign data
- Need separate views: "Monitor Execução" and "Monitor Campanha"
- Campaign view shows only new leads from uploaded spreadsheets (no existing projects)
- DO NOT delete execution monitoring data — just separate the views

### 6. User Access Levels
- **Vendedores** (Elison, Wellington, Gabriel): See only their own leads, can update status/notes
- **Gestores** (Tito, Felipe): Full admin access, can assign leads, see all data
- **Visualizador** (Paulo - team lead): Can see everything but cannot modify data

### 7. Commission Formula
- Based on proposta fechada (closed deal)
- Margin: 6-10% of emenda value (gross/bruto)
- SDR only (passed to closer): R$50 + 1% of margin
- Closer (handled deal end-to-end): R$50 + 4% of margin (1% base + 3% closer bonus)
- Vendedor must indicate if they acted as SDR or Closer
- Each vendedor sees their own commission dashboard (big number)
- Gestor sees global commission report

### 8. Performance-Based Lead Redistribution
- Metric: (status changes attributed) / time period = performance rate
- Vendedores who contact less get leads redistributed to more active ones
- Initially manual by gestor, later automated with performance metric

### 9. Pipeline Campaign Values
- Pipeline view should show valor de emendas attributed per vendedor for current campaign
- "Não atribuído" should be zero (all leads distributed or flagged as existing clients)

## Claude's Discretion

- Technical implementation of priority scoring algorithm
- UI layout specifics for campaign vs execution views
- How to display the commission calculator (modal, inline, separate page)
- Performance metric calculation details

## Deferred Ideas

- Automated performance-based redistribution (manual first)
- Priority scoring based on number of executed convênios (future evolution)
- Tax deduction from commission (just show gross for now)

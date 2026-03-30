# Requirements: PROJETUS v4.1

**Defined:** 2026-03-30
**Core Value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov

## v4.1 Requirements

Requirements for milestone v4.1 — Distribuicao, Design & Performance.

### Distribuicao de Leads

- [x] **DIST-01**: Leads na execucao com tag "cliente" sao automaticamente atribuidos ao coordenador (Paulo) para monitoramento — nao entram na roleta
- [x] **DIST-02**: Leads novos na execucao sem tag "cliente" e sem vendedor da aprovacao sao automaticamente atribuidos ao vendedor com menos leads totais na execucao
- [x] **DIST-03**: Distribuicao usa advisory lock (pg_advisory_lock) para prevenir dupla atribuicao entre cron e trigger manual
- [x] **DIST-04**: Gestor pode disparar distribuicao manual via botao na UI

### Identidade Visual

- [ ] **DESIGN-01**: Cores do app atualizadas conforme guia de marca Projete (Tailwind config + migracao de hex hardcoded)
- [ ] **DESIGN-02**: Logo e favicon substituidos por assets da Projete
- [ ] **DESIGN-03**: Fontes migradas para marca Projete via next/font/google
- [ ] **DESIGN-04**: Design tokens implementados via CSS custom properties (:root variables)

### Performance

- [ ] **PERF-01**: Instrumentar heap usage por step no sync de propostas para medir baseline real
- [ ] **PERF-02**: Com base na medicao, implementar otimizacao para reduzir pico de memoria

### TGov Dashboard

- [ ] **TGOV-01**: Nova pagina /tgov acessivel via sidebar, restrita a role gestor
- [ ] **TGOV-02**: Tab Aprovacao com donut chart de situacao, KPI card total, e tabela detalhada (ID Proposta, Data, CNPJ, Proponente, Situacao)
- [ ] **TGOV-03**: Tab Execucao com mesma estrutura (donut + KPI + tabela) usando dados de projetos em execucao
- [ ] **TGOV-04**: Filtros: Ano, Tipo (Meus Proponentes/Outros), Status, UF do Proponente
- [ ] **TGOV-05**: Filtros na tabela: Proponente, Numero Proposta

## Future Requirements (v4.2+)

### Distribuicao

- **DIST-05**: Relatorio pos-distribuicao com modal mostrando alocacao por vendedor

### Performance

- **PERF-03**: Streaming ZIP download (se medicao confirmar necessidade)
- **PERF-04**: Batch DB inserts (se medicao confirmar necessidade)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Link externo para TransferGov na tabela TGov | Verificar se dados locais cobrem antes |
| Migracao Tailwind v4 | Milestone separado, overhead significativo |
| Pipeline Kanban drag-and-drop | Adiado desde v3.0, sem demanda |
| Edicao de dados de projetos em execucao | Read-only por decisao do v4.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | Phase 18 | Complete |
| DIST-02 | Phase 18 | Complete |
| DIST-03 | Phase 18 | Complete |
| DIST-04 | Phase 18 | Complete |
| TGOV-01 | Phase 19 | Pending |
| TGOV-02 | Phase 19 | Pending |
| TGOV-03 | Phase 19 | Pending |
| TGOV-04 | Phase 19 | Pending |
| TGOV-05 | Phase 19 | Pending |
| PERF-01 | Phase 20 | Pending |
| PERF-02 | Phase 20 | Pending |
| DESIGN-01 | Phase 21 | Pending |
| DESIGN-02 | Phase 21 | Pending |
| DESIGN-03 | Phase 21 | Pending |
| DESIGN-04 | Phase 21 | Pending |

**Coverage:**
- v4.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 — traceability mapped after roadmap creation*

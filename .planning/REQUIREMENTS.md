# Requirements: PROJETUS — Projetos em Execucao

**Defined:** 2026-03-18
**Core Value:** Inteligencia pos-venda para gestores identificarem clientes qualificados com projetos em execucao no TransferenciaGov.

## v4.0 Requirements

Requirements for the Projetos em Execucao milestone. Each maps to roadmap phases.

### Dados & ETL

- [x] **DATA-01**: Sistema importa dados de convenio do repo (filtro: situacao "em execucao")
- [x] **DATA-02**: Sistema importa dados de proposta do repo (filtro: tipo "OSC")
- [x] **DATA-03**: Dados sao armazenados em tabela DB dedicada `projetos_execucao` (isolada do CRM)
- [x] **DATA-04**: Cruzamento convenio ↔ proposta via id_proposta com CNPJ do proponente
- [x] **DATA-05**: UPSERT incremental sem duplicar registros existentes (conflict key: cnpj + nr_convenio)
- [x] **DATA-06**: Sync diario via cron endpoint dedicado, separado do sync de leads
- [x] **DATA-07**: Auditoria de dados previa: validar NULL proposta_id, CNPJ padding, join coverage

### Metricas Financeiras

- [x] **FIN-01**: Gestor pode ver valor de desembolso por projeto
- [x] **FIN-02**: Gestor pode ver saldo em conta por projeto
- [x] **FIN-03**: Gestor pode ver percentual de execucao (desembolso vs valor global)
- [x] **FIN-04**: Projetos com desembolso negativo sao destacados visualmente como alerta
- [x] **FIN-05**: Gestor pode ver dias em execucao (desde inicio ate hoje)
- [x] **FIN-06**: Gestor pode ver data fim de vigencia e tempo restante

### Agregacao & Visualizacao

- [x] **AGR-01**: Propostas sao agrupadas por CNPJ (big number = quantidade de fomentos)
- [x] **AGR-02**: Gestor pode expandir CNPJ para ver propostas individuais com detalhes
- [x] **AGR-03**: Contatos existentes (telefone/email) sao exibidos via lead_contacts/BrasilAPI
- [x] **AGR-04**: Slide-over com detalhes completos ao clicar num CNPJ
- [x] **PIPE-EXEC-01**: Dashboard principal compara Pipeline Aprovação vs Pipeline Execução sem misturar contagens

### Interface & Acesso

- [x] **UI-01**: Nova aba /execucao no sidebar
- [x] **UI-02**: Acesso restrito a gestor e coordenador (vendedor nao ve)
- [x] **UI-03**: KPI cards no topo (total projetos, valor desembolsado, clientes qualificados, etc.)
- [x] **UI-04**: Tabela principal com colunas: CNPJ, nome, qtd fomentos, desembolso, saldo, % execucao, vigencia

## v3.0 Requirements (Previous — Complete)

### Autenticacao
- [x] **AUTH-01**: Vendedor pode fazer login com email e senha
- [x] **AUTH-02**: Gestor pode criar/editar contas de vendedores
- [x] **AUTH-03**: Vendedor ve apenas leads atribuidos a ele (gestor ve todos)
- [x] **AUTH-04**: Sessao persiste entre refreshes do browser

### Gestao de Leads
- [x] **LEAD-01**: Gestor pode atribuir lead a um vendedor especifico
- [x] **LEAD-02**: Sistema detecta e alerta duplicatas
- [x] **LEAD-03**: Lead mostra flag "CLIENTE EXISTENTE"
- [x] **LEAD-04**: Lead mostra link ao programa de trabalho

### Pipeline de Vendas
- [x] **PIPE-01**: Pipeline visual com colunas de status
- [x] **PIPE-02**: Vendedor pode mudar status do lead
- [x] **PIPE-03**: Lead mostra: nome, CNPJ, valor, tier, vendedor
- [x] **PIPE-04**: Pipeline filtavel por vendedor, UF, tier

### Contato & Tracking
- [x] **CONT-01**: Vendedor pode registrar nota de contato
- [x] **CONT-02**: Historico de contatos em timeline
- [x] **CONT-03**: Status de contato com pipeline
- [x] **CONT-04**: Dados de contato editaveis

### Comissao
- [x] **COM-01**: Vendedor vinculado ao lead ao fechar
- [x] **COM-02**: Percentual configuravel por gestor
- [x] **COM-03**: Relatorio de comissoes com filtro
- [x] **COM-04**: Dashboard do vendedor com comissoes

## Future Requirements

Deferred to future milestone.

### Pos-Venda Workflow
- **PV-01**: Gestor pode mudar status de projeto (ex: "Encaminhar para pos-venda")
- **PV-02**: Post-sales team tem login/role proprio
- **PV-03**: Handoff workflow com notificacao ao time de pos-venda
- **PV-04**: Push alerts para mudancas em projetos monitorados

## Out of Scope

| Feature | Reason |
|---------|--------|
| Edicao de dados de projetos | Read-only por decisao — validar valor da visualizacao primeiro |
| Workflow de handoff pos-venda | Ainda nao discutido com cliente, fica para proximo milestone |
| Notas/contatos especificos para pos-venda | Depende do workflow de handoff |
| Alertas push para projetos em execucao | Depende de definicao de regras de negocio com cliente |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 15 | Complete |
| DATA-02 | Phase 15 | Complete |
| DATA-03 | Phase 14 | Complete |
| DATA-04 | Phase 15 | Complete |
| DATA-05 | Phase 15 | Complete |
| DATA-06 | Phase 15 | Complete |
| DATA-07 | Phase 14 | Complete |
| FIN-01 | Phase 16 | Complete |
| FIN-02 | Phase 16 | Complete |
| FIN-03 | Phase 16 | Complete |
| FIN-04 | Phase 16 | Complete |
| FIN-05 | Phase 16 | Complete |
| FIN-06 | Phase 16 | Complete |
| AGR-01 | Phase 17 | Complete |
| AGR-02 | Phase 17 | Complete |
| AGR-03 | Phase 17 | Complete |
| AGR-04 | Phase 17 | Complete |
| PIPE-EXEC-01 | Quick 260323 | Complete |
| UI-01 | Phase 17 | Complete |
| UI-02 | Phase 17 | Complete |
| UI-03 | Phase 17 | Complete |
| UI-04 | Phase 17 | Complete |

**Coverage:**
- v4.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-25 — added quick requirement traceability for dashboard execution pipeline split*

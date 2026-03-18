# Requirements: PROJETUS — Projetos em Execução

**Defined:** 2026-03-18
**Core Value:** Inteligência pós-venda para gestores identificarem clientes qualificados com projetos em execução no TransferênciaGov.

## v4.0 Requirements

Requirements for the Projetos em Execução milestone. Each maps to roadmap phases.

### Dados & ETL

- [ ] **DATA-01**: Sistema importa dados de convenio do repo (filtro: situação "em execução")
- [ ] **DATA-02**: Sistema importa dados de proposta do repo (filtro: tipo "OSC")
- [ ] **DATA-03**: Dados são armazenados em tabela DB dedicada `projetos_execucao` (isolada do CRM)
- [ ] **DATA-04**: Cruzamento convenio ↔ proposta via id_proposta com CNPJ do proponente
- [ ] **DATA-05**: UPSERT incremental sem duplicar registros existentes (conflict key: cnpj + nr_convenio)
- [ ] **DATA-06**: Sync diário via cron endpoint dedicado, separado do sync de leads
- [ ] **DATA-07**: Auditoria de dados prévia: validar NULL proposta_id, CNPJ padding, join coverage

### Métricas Financeiras

- [ ] **FIN-01**: Gestor pode ver valor de desembolso por projeto
- [ ] **FIN-02**: Gestor pode ver saldo em conta por projeto
- [ ] **FIN-03**: Gestor pode ver percentual de execução (desembolso vs valor global)
- [ ] **FIN-04**: Projetos com desembolso negativo são destacados visualmente como alerta
- [ ] **FIN-05**: Gestor pode ver dias em execução (desde início até hoje)
- [ ] **FIN-06**: Gestor pode ver data fim de vigência e tempo restante

### Agregação & Visualização

- [ ] **AGR-01**: Propostas são agrupadas por CNPJ (big number = quantidade de fomentos)
- [ ] **AGR-02**: Gestor pode expandir CNPJ para ver propostas individuais com detalhes
- [ ] **AGR-03**: Contatos existentes (telefone/email) são exibidos via lead_contacts/BrasilAPI
- [ ] **AGR-04**: Slide-over com detalhes completos ao clicar num CNPJ

### Interface & Acesso

- [ ] **UI-01**: Nova aba /execucao no sidebar
- [ ] **UI-02**: Acesso restrito a gestor e coordenador (vendedor não vê)
- [ ] **UI-03**: KPI cards no topo (total projetos, valor desembolsado, clientes qualificados, etc.)
- [ ] **UI-04**: Tabela principal com colunas: CNPJ, nome, qtd fomentos, desembolso, saldo, % execução, vigência

## v3.0 Requirements (Previous — Complete)

### Autenticação
- [x] **AUTH-01**: Vendedor pode fazer login com email e senha
- [x] **AUTH-02**: Gestor pode criar/editar contas de vendedores
- [x] **AUTH-03**: Vendedor vê apenas leads atribuídos a ele (gestor vê todos)
- [x] **AUTH-04**: Sessão persiste entre refreshes do browser

### Gestão de Leads
- [x] **LEAD-01**: Gestor pode atribuir lead a um vendedor específico
- [x] **LEAD-02**: Sistema detecta e alerta duplicatas
- [x] **LEAD-03**: Lead mostra flag "CLIENTE EXISTENTE"
- [x] **LEAD-04**: Lead mostra link ao programa de trabalho

### Pipeline de Vendas
- [x] **PIPE-01**: Pipeline visual com colunas de status
- [x] **PIPE-02**: Vendedor pode mudar status do lead
- [x] **PIPE-03**: Lead mostra: nome, CNPJ, valor, tier, vendedor
- [x] **PIPE-04**: Pipeline filtável por vendedor, UF, tier

### Contato & Tracking
- [x] **CONT-01**: Vendedor pode registrar nota de contato
- [x] **CONT-02**: Histórico de contatos em timeline
- [x] **CONT-03**: Status de contato com pipeline
- [x] **CONT-04**: Dados de contato editáveis

### Comissão
- [x] **COM-01**: Vendedor vinculado ao lead ao fechar
- [x] **COM-02**: Percentual configurável por gestor
- [x] **COM-03**: Relatório de comissões com filtro
- [x] **COM-04**: Dashboard do vendedor com comissões

## Future Requirements

Deferred to future milestone.

### Pós-Venda Workflow
- **PV-01**: Gestor pode mudar status de projeto (ex: "Encaminhar para pós-venda")
- **PV-02**: Post-sales team tem login/role próprio
- **PV-03**: Handoff workflow com notificação ao time de pós-venda
- **PV-04**: Push alerts para mudanças em projetos monitorados

## Out of Scope

| Feature | Reason |
|---------|--------|
| Edição de dados de projetos | Read-only por decisão — validar valor da visualização primeiro |
| Workflow de handoff pós-venda | Ainda não discutido com cliente, fica para próximo milestone |
| Notas/contatos específicos para pós-venda | Depende do workflow de handoff |
| Alertas push para projetos em execução | Depende de definição de regras de negócio com cliente |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| DATA-06 | — | Pending |
| DATA-07 | — | Pending |
| FIN-01 | — | Pending |
| FIN-02 | — | Pending |
| FIN-03 | — | Pending |
| FIN-04 | — | Pending |
| FIN-05 | — | Pending |
| FIN-06 | — | Pending |
| AGR-01 | — | Pending |
| AGR-02 | — | Pending |
| AGR-03 | — | Pending |
| AGR-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |

**Coverage:**
- v4.0 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*

# Requirements: PROJETUS v6.0

**Defined:** 2026-04-27
**Core Value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov, com area de Customer Success (CSM) para upsell e cross-sell pos-venda

## v6.0 Requirements

Requirements para milestone v6.0 — CSM & Customer Success.

### CSM Role & Acesso

- [x] **CSM-01**: CSM (bruno@projetus.org) pode acessar area exclusiva `/csm` com visao administrativa de todos os clientes historicos Projetus (2020–2025)
- [x] **CSM-02**: CSM pode adicionar novo cliente ao sistema
- [x] **CSM-03**: CSM pode editar dados de contato (telefone, email) de qualquer cliente
- [x] **CSM-04**: CSM pode visualizar e calcular comissoes proprias (mesmo sistema SDR/Closer existente)

### CSM Client View

- [x] **CLI-01**: CSM ve todos os clientes Projetus em lista unificada — uma linha por cliente com dados financeiros agregados
- [x] **CLI-02**: Cada cliente exibe: total saldo em conta, valor a desembolsar, saldo de rendimento previsto, valor a liberar (desembolso + aprovacao pendentes)
- [x] **CLI-03**: Cada cliente exibe contagem de projetos por situacao: execucao c/ saldo / a desembolsar / aprovacao / prestacao de contas
- [x] **CLI-04**: CSM pode expandir cliente e ver todos os projetos agrupados por fase (aprovacao, execucao, PC)
- [x] **CLI-05**: CSM pode buscar e filtrar clientes por nome, CNPJ, situacao e saldo
- [x] **CLI-06**: Cada cliente e projeto exibe badge/tag colorida com nivel de prioridade: 1=saldo em conta · 2=a desembolsar · 3=rendimento · 4=aprovacao · 5=PC

### CSM BI & Pipeline

- [x] **BI-01**: BI do CSM exibe total de saldo em conta de todos os clientes gerenciados
- [x] **BI-02**: BI do CSM exibe contagem de projetos por situacao (KPIs + grafico)
- [x] **BI-03**: BI do CSM exibe total de saldo de rendimento previsto
- [x] **BI-04**: BI do CSM exibe valor total a liberar (desembolso pendente + aprovacao pendente)
- [x] **BI-05**: CSM tem pipeline/funil proprio separado do CRM vendas e TGov

### Itens Orcamentarios

- [ ] **BUD-01**: CSM pode ver itens do Plano de Aplicacao Detalhado dentro de cada projeto em execucao
- [ ] **BUD-02**: Itens orcamentarios exibidos apenas para projetos EM EXECUCAO com saldo em conta
- [ ] **BUD-03**: Itens com saldo zerado (ja totalmente executados) sao ocultados da listagem
- [ ] **BUD-04**: Descricoes de itens truncadas em 30 caracteres na listagem

### Tags de Potencial de Venda

- [ ] **TAG-01**: Sistema gera tags de potencial por similaridade entre itens orcamentarios e servicos Projetus (juridico, contabil, marketing, RH)
- [ ] **TAG-02**: CSM pode atribuir tags de servico manualmente por projeto quando IA nao disponivel

### UI & Usabilidade

- [ ] **UI-01**: Usuario pode recolher e esconder a sidebar
- [ ] **UI-02**: Usuario pode ativar dark mode (visao noturna) em toda a plataforma
- [ ] **UI-03**: Plataforma e mobile-friendly com sidebar responsiva em dispositivos moveis
- [ ] **UI-04**: Assinatura da logo exibe "Hub da Projetos" (nao "CRM de vendas")

## v7.0 Requirements (Deferred)

### CSM Avancado

- **CSM-ADV-01**: Auto-notificacao quando novo cliente Projetus entra no TGov (aprovacao/execucao)
- **CSM-ADV-02**: Regras de comp CSM diferenciadas (estrutura de comissao propria — definir com cliente)
- **CSM-ADV-03**: Budget items batch ETL para pre-carregamento de todos os 8.793 projetos

### AI Avancado

- **AI-ADV-01**: Modelo de embedding vetorial (pgvector) para similaridade semantica de alta precisao
- **AI-ADV-02**: Score de confianca por tag com indicador "needs_review" para revisao humana

## Out of Scope

| Feature | Reason |
|---------|--------|
| Handoff workflow vendedor → CSM | Regras de negocio nao definidas com cliente |
| Kanban CSM (drag-to-stage) | Lista priorizada e suficiente para v1 com um usuario; Phase 12 ja deferida |
| Notificacoes push para CSM | Depende de regras de negocio — definir em v7.0 |
| Integracao com sistema financeiro real | Saldo em conta e estimado (TransfereGov) — nao ha acesso ao banking |
| WhatsApp automation | Projeto separado/futuro |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CSM-01 | Phase 22 | Complete |
| CSM-02 | Phase 22 | Complete (22-02) |
| CSM-03 | Phase 22 | Complete (22-02) |
| CSM-04 | Phase 22 | Complete (22-03) |
| CLI-01 | Phase 23 | Complete (23-01 API + 23-03 UI) |
| CLI-02 | Phase 23 | Complete (23-01 API + 23-03 UI) |
| CLI-03 | Phase 23 | Complete (23-01 API + 23-03 UI) |
| CLI-04 | Phase 23 | Complete (23-02) |
| CLI-05 | Phase 23 | Complete |
| CLI-06 | Phase 23 | Complete (23-01) |
| BI-01 | Phase 23 | Complete (23-01 API + 23-04 UI) |
| BI-02 | Phase 23 | Complete (23-01 API + 23-04 UI) |
| BI-03 | Phase 23 | Complete (23-01 API + 23-04 UI) |
| BI-04 | Phase 23 | Complete (23-01 API + 23-04 UI) |
| BI-05 | Phase 23 | Complete (23-01 API + 23-04 UI) |
| BUD-01 | Phase 25 | Pending |
| BUD-02 | Phase 25 | Pending |
| BUD-03 | Phase 25 | Pending |
| BUD-04 | Phase 25 | Pending |
| TAG-01 | Phase 26 | Pending |
| TAG-02 | Phase 26 | Pending |
| UI-01 | Phase 24 | Pending |
| UI-02 | Phase 24 | Pending |
| UI-03 | Phase 24 | Pending |
| UI-04 | Phase 24 | Pending |

**Coverage:**
- v6.0 requirements: 25 total
- Mapped to phases: 25/25 ✓
- Unmapped: 0

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 — Traceability completed, all 25 requirements mapped to Phases 22–26*

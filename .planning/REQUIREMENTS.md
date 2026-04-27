# Requirements: PROJETUS v6.0

**Defined:** 2026-04-27
**Core Value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov, com area de Customer Success (CSM) para upsell e cross-sell pos-venda

## v6.0 Requirements

Requirements para milestone v6.0 — CSM & Customer Success.

### CSM Role & Acesso

- [ ] **CSM-01**: CSM (bruno@projetus.org) pode acessar area exclusiva `/csm` com visao administrativa de todos os clientes historicos Projetus (2020–2025)
- [ ] **CSM-02**: CSM pode adicionar novo cliente ao sistema
- [ ] **CSM-03**: CSM pode editar dados de contato (telefone, email) de qualquer cliente
- [ ] **CSM-04**: CSM pode visualizar e calcular comissoes proprias (mesmo sistema SDR/Closer existente)

### CSM Client View

- [ ] **CLI-01**: CSM ve todos os clientes Projetus em lista unificada — uma linha por cliente com dados financeiros agregados
- [ ] **CLI-02**: Cada cliente exibe: total saldo em conta, valor a desembolsar, saldo de rendimento previsto, valor a liberar (desembolso + aprovacao pendentes)
- [ ] **CLI-03**: Cada cliente exibe contagem de projetos por situacao: execucao c/ saldo / a desembolsar / aprovacao / prestacao de contas
- [ ] **CLI-04**: CSM pode expandir cliente e ver todos os projetos agrupados por fase (aprovacao, execucao, PC)
- [ ] **CLI-05**: CSM pode buscar e filtrar clientes por nome, CNPJ, situacao e saldo
- [ ] **CLI-06**: Cada cliente e projeto exibe badge/tag colorida com nivel de prioridade: 1=saldo em conta · 2=a desembolsar · 3=rendimento · 4=aprovacao · 5=PC

### CSM BI & Pipeline

- [ ] **BI-01**: BI do CSM exibe total de saldo em conta de todos os clientes gerenciados
- [ ] **BI-02**: BI do CSM exibe contagem de projetos por situacao (KPIs + grafico)
- [ ] **BI-03**: BI do CSM exibe total de saldo de rendimento previsto
- [ ] **BI-04**: BI do CSM exibe valor total a liberar (desembolso pendente + aprovacao pendente)
- [ ] **BI-05**: CSM tem pipeline/funil proprio separado do CRM vendas e TGov

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

Preenchido durante criacao do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CSM-01 | — | Pending |
| CSM-02 | — | Pending |
| CSM-03 | — | Pending |
| CSM-04 | — | Pending |
| CLI-01 | — | Pending |
| CLI-02 | — | Pending |
| CLI-03 | — | Pending |
| CLI-04 | — | Pending |
| CLI-05 | — | Pending |
| CLI-06 | — | Pending |
| BI-01 | — | Pending |
| BI-02 | — | Pending |
| BI-03 | — | Pending |
| BI-04 | — | Pending |
| BI-05 | — | Pending |
| BUD-01 | — | Pending |
| BUD-02 | — | Pending |
| BUD-03 | — | Pending |
| BUD-04 | — | Pending |
| TAG-01 | — | Pending |
| TAG-02 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |

**Coverage:**
- v6.0 requirements: 25 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 — Milestone v6.0 initial definition*

# Requirements: PROJETUS CRM de Vendas

**Defined:** 2026-02-11
**Core Value:** CRM funcional para vendedores qualificarem e contactarem leads do TransferênciaGov, com pipeline visual, atribuição de vendedor, tracking de contato, e controle de comissão.

## v3.0 Requirements

### Autenticação

- [ ] **AUTH-01**: Vendedor pode fazer login com email e senha
- [ ] **AUTH-02**: Gestor pode criar/editar contas de vendedores
- [ ] **AUTH-03**: Vendedor vê apenas leads atribuídos a ele (gestor vê todos)
- [ ] **AUTH-04**: Sessão persiste entre refreshes do browser

### Gestão de Leads

- [ ] **LEAD-01**: Gestor pode atribuir lead a um vendedor específico
- [ ] **LEAD-02**: Sistema detecta e alerta duplicatas (mesmo lead atribuído a dois vendedores)
- [ ] **LEAD-03**: Lead mostra flag visível "CLIENTE EXISTENTE" quando já está na base de clientes
- [ ] **LEAD-04**: Lead mostra link direto ao programa de trabalho no TransferênciaGov

### Pipeline de Vendas

- [ ] **PIPE-01**: Pipeline visual (kanban) com 4 colunas: Novo → Contactado → Em negociação → Fechado
- [ ] **PIPE-02**: Vendedor pode arrastar lead entre colunas de status
- [ ] **PIPE-03**: Cada lead no pipeline mostra: nome, CNPJ, valor emenda, tier, vendedor
- [ ] **PIPE-04**: Pipeline filtável por vendedor, UF, tier de valor

### Contato & Tracking

- [ ] **CONT-01**: Vendedor pode registrar nota de contato (data, tipo, observação)
- [ ] **CONT-02**: Histórico de contatos visível na timeline do lead
- [ ] **CONT-03**: Status de contato: "Não contactado", "Aguardando retorno", "Em conversa", "Fechado"
- [ ] **CONT-04**: Dados de contato (telefone, email) editáveis pelo vendedor

### Comissão

- [ ] **COM-01**: Vendedor vinculado ao lead quando marca status "Fechado"
- [ ] **COM-02**: Percentual de comissão configurável por gestor (padrão + exceções)
- [ ] **COM-03**: Relatório de comissões por vendedor com período filtável
- [ ] **COM-04**: Dashboard do vendedor mostra seus leads, suas comissões acumuladas

### Plataforma Next.js

- [ ] **PLAT-01**: Migrar dashboard existente (Pipeline, Leads, Lead Profile) para base de CRM
- [ ] **PLAT-02**: Tabelas de CRM no PostgreSQL (users, lead_assignments, contact_notes, commissions)
- [ ] **PLAT-03**: API routes protegidas por autenticação (JWT ou session)

## v4 Requirements (Deferred)

- **NOTIF-01**: Notificações quando novos leads são adicionados ao sistema
- **NOTIF-02**: Alerta quando lead muda de status
- **EXPORT-01**: Export de relatórios em PDF
- **INTEG-01**: Integração WhatsApp para contato direto
- **AUTO-01**: Atribuição automática round-robin de leads

## Out of Scope

| Feature | Reason |
|---------|--------|
| WhatsApp automation | Projeto separado, complexidade alta |
| Mobile app nativo | Web responsive é suficiente para v3 |
| BI avançado | Dashboard atual atende, BI é projeto futuro |
| Multi-tenant | Apenas um cliente (Projetus) por agora |
| Integração com CRMs externos | Não há CRM existente para integrar |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 10 | Pending |
| AUTH-02 | Phase 10 | Pending |
| AUTH-03 | Phase 10 | Pending |
| AUTH-04 | Phase 10 | Pending |
| PLAT-01 | Phase 10 | Pending |
| PLAT-02 | Phase 10 | Pending |
| PLAT-03 | Phase 10 | Pending |
| LEAD-01 | Phase 11 | Pending |
| LEAD-02 | Phase 11 | Pending |
| LEAD-03 | Phase 11 | Pending |
| LEAD-04 | Phase 11 | Pending |
| CONT-01 | Phase 11 | Pending |
| CONT-02 | Phase 11 | Pending |
| CONT-03 | Phase 11 | Pending |
| CONT-04 | Phase 11 | Pending |
| PIPE-01 | Phase 12 | Pending |
| PIPE-02 | Phase 12 | Pending |
| PIPE-03 | Phase 12 | Pending |
| PIPE-04 | Phase 12 | Pending |
| COM-01 | Phase 13 | Pending |
| COM-02 | Phase 13 | Pending |
| COM-03 | Phase 13 | Pending |
| COM-04 | Phase 13 | Pending |

**Coverage:**
- v3.0 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after milestone v3.0 definition*

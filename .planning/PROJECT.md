# PROJETUS — Transfer Gov Automation

## What This Is

Sistema automatizado de extração e armazenamento de dados do Transfer Gov. Acessa o Painel Gerencial diariamente, baixa planilhas de propostas/apoiadores/emendas/programas, processa via ETL, e armazena em PostgreSQL com relacionamentos corretos. Elimina processo manual que consome 4-6 horas/dia e garante 100% de cobertura das 4.100+ propostas anuais.

## Core Value

**Extração 100% confiável e automatizada dos dados do Transfer Gov**, garantindo que nenhuma proposta seja perdida e que os dados estejam sempre atualizados e prontos para análise SQL. Se a extração falhar ou dados estiverem incorretos, todo o valor do sistema desaparece.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Crawler & Extraction:**
- [ ] Sistema acessa Transfer Gov com credenciais fornecidas
- [ ] Faz login automatizado no Painel Gerencial
- [ ] Baixa 4 planilhas de um relatório consolidado (propostas, apoiadores, emendas, programas)
- [ ] Gerencia sessões e retry logic em caso de falha
- [ ] Executa automaticamente todo dia às 9h via cron

**ETL Pipeline:**
- [ ] Parse planilhas Excel/CSV em estruturas de dados
- [ ] Identifica e usa IDs/chaves para relacionamentos entre entidades
- [ ] Faz deduplicação (evita duplicar propostas existentes)
- [ ] Valida dados antes de inserir (campos obrigatórios, formatos)
- [ ] Logs estruturados de cada execução (quantos registros, quanto tempo, erros)

**Database:**
- [ ] Schema PostgreSQL com 4 tabelas principais (propostas, apoiadores, emendas, programas)
- [ ] Tabelas de relacionamento (proposta_apoiadores, proposta_emendas)
- [ ] Índices para performance em queries comuns (status, data, valor, região)
- [ ] Tabela de logs de execução (rastreabilidade completa)
- [ ] Dados prontos para exploração via SQL

**Monitoring & Validation:**
- [ ] Notificações Telegram após cada execução (sucesso com resumo, ou erro com detalhes)
- [ ] Comparação manual inicial (primeira execução vs processo manual)
- [ ] Alertas quando volume de dados varia >10% vs dia anterior
- [ ] Health check endpoint (API simples retorna status última execução)

### Out of Scope

- **Scoring/qualificação automática** — Critérios ainda não definidos pelo cliente (Tito), fica para v2
- **Integração CRM** — CRM ainda não confirmado pelo cliente, fica para v2
- **Dashboard/UI web** — Primeiro uso é exploração SQL, dashboards são v2
- **WhatsApp automation** — Projeto separado/futuro
- **BI estratégico** — Projeto separado/futuro

## Context

**Cliente:**
- PROJETUS (Philipe Melo / Tito Santana)
- R$5.000/mês
- Líder em captação de recursos via Transfer Gov (+R$400M captados, 96% aprovação)
- Processa 4.100 propostas/ano manualmente (alto custo de tempo/equipe)

**Problema atual:**
- Processo manual consome 4-6 horas/dia
- Impossível processar 100% das propostas
- Competidores chegam primeiro nas oportunidades
- Dados espalhados em múltiplas fontes
- Alto risco de erro humano

**Ambiente técnico:**
- Transfer Gov: sistema governamental, planilhas Excel/CSV
- Credenciais: JÁ DISPONÍVEIS para desenvolvimento/testes
- Estrutura: 4 planilhas baixadas de um relatório consolidado
- Relacionamentos: IDs/chaves claros entre entidades
- Frequência: dados atualizados diariamente

**Decisões já tomadas:**
- Python 3.11+ (familiaridade, ecossistema ETL robusto)
- Playwright para crawler (headless browser, mais robusto que requests para sites dinâmicos)
- PostgreSQL via Supabase (migrado de Railway em fev/2026)
- Execução diária às 9h (timing alinhado com atualização do Transfer Gov)

## Constraints

- **Timeline**: URGENTE — cliente precisa ASAP, prioridade máxima na fundação de dados
- **Budget**: R$5.000/mês do cliente, infraestrutura Supabase (free tier)
- **Credenciais**: Dependência de acesso ao Transfer Gov (mas JÁ disponível)
- **Dados**: Transfer Gov pode mudar estrutura das planilhas (parser deve ser robusto)
- **Escalabilidade**: 4.100 propostas/ano (~11/dia) não requer high-performance, mas deve ser confiável
- **Monitoramento**: Sistema roda sem supervisão diária, alertas críticos via Telegram

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MVP = Extração + DB, não CRM/Scoring | Cliente precisa urgência na fundação de dados. CRM/scoring dependem de definições ainda pendentes (Tito). | — Pending |
| Playwright vs requests/scrapy | Transfer Gov pode ter JavaScript dinâmico, Playwright garante compatibilidade mesmo com mudanças no site. | — Pending |
| PostgreSQL vs SQLite | Queries complexas futuras (BI, análises), múltiplos relacionamentos, dados críticos precisam de ACID garantees. | — Pending |
| Scheduler diário desde v1 | Mesmo em desenvolvimento, validar automação cedo evita surpresas em produção. | — Pending |
| Validação multicamada | Comparação manual inicial + alertas de volume + logs detalhados garante confiabilidade desde dia 1. | — Pending |
| Railway → Supabase (fev/2026) | Railway deletado. Supabase é o único banco. Migração cobriu 100% das tabelas usadas pelo CRM. 3 tabelas pipeline parciais (propostas 87%, proposta_apoiadores 0%, proposta_emendas 0%) não afetam CRM. | Done |

## Current Milestone: v4.0 Projetos em Execução

**Goal:** Nova aba de inteligência pós-venda para gestores, mostrando projetos em execução com dados financeiros cruzados de convênio e proposta do repo, agregados por CNPJ com contatos existentes.

**Target features:**
- Nova aba /execucao restrita a gestores (gestor, coordenador)
- Nova tabela DB dedicada para projetos em execução (isolada do CRM)
- Importação de dados de convênio + proposta do repo existente
- Cruzamento convênio ↔ proposta via id_proposta
- Filtro: status "em execução" + tipo "OSC"
- Métricas financeiras: desembolso, saldo em conta, % execução
- Controle de vigência: data fim, dias em execução
- Agregação por CNPJ (quantidade de fomentos como big number)
- Conexão com contatos existentes (BrasilAPI/lead_contacts)
- Lógica de destaque: desembolso negativo = alerta, positivo = verificar saldo

**Approach:** Next.js 14 App Router + PostgreSQL (Supabase). Tabela(s) nova(s) dedicada(s) para projetos em execução. Dados importados das planilhas repo já baixadas (convenio, proposta). Somente visualização por enquanto — sem fluxo de handoff para pós-venda.

**Primary workflow:** Gestor acessa /execucao → vê lista de CNPJs com projetos em execução → expande para ver detalhes financeiros (desembolso, saldo, % execução) → identifica clientes qualificados → comunica manualmente ao time de pós-venda.

**Previous milestones:**
- v1.0: Crawler & ETL Pipeline (Phases 1-5)
- v2.0: Dashboard Premium Redesign — superseded by Next.js migration (Phases 6-8)
- v3.0: CRM de Vendas (Phases 10-13 + 74 quick tasks)

## Infrastructure

| Service | Usage | Status |
|---------|-------|--------|
| **Supabase** | PostgreSQL database (all data) | Active |
| **Vercel** | Next.js hosting, deploy from master | Active |
| **Railway** | — | **Deleted 2026-02-12** (migrated to Supabase) |

---
*Last updated: 2026-02-12 — Railway deleted, Supabase is sole database*

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
- PostgreSQL (dados relacionais, queries complexas futuras)
- Execução diária às 9h (timing alinhado com atualização do Transfer Gov)

## Constraints

- **Timeline**: URGENTE — cliente precisa ASAP, prioridade máxima na fundação de dados
- **Budget**: R$5.000/mês do cliente, infraestrutura deve ser low-cost (Oracle Free Tier ou Railway)
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

## Current Milestone: v2.0 Dashboard Premium Redesign

**Goal:** Transform the existing Streamlit dashboard from raw/functional to a premium, workflow-optimized tool that sales reps use daily to research leads and prospect proponents — styled after the Sigma brand identity (dark theme, neon blue accents, glassmorphic cards).

**Target features:**
- Sigma-branded dark theme with custom CSS injection (colors: #050B1F background, #00D4FF accent, Space Grotesk / Inter typography)
- Premium KPI cards with visual impact (glassmorphic cards, neon glow effects)
- Lead profile page — the "killer view" for researching a specific proponent (all history, emendas, propostas, convênios in one place)
- Global search bar (front & center) — type CNPJ/name to jump to lead profile
- Improved Qualificação page with visual ranking indicators, better filtering UX
- Data visualization — charts for trends, value distributions, geographic breakdown
- Streamlined navigation — fewer clicks to key actions, better information hierarchy
- Responsive metric cards, status badges, value indicators
- Polished entity pages (Propostas, Programas, Apoiadores, Emendas) with consistent premium styling

**Approach:** Max Streamlit — push Streamlit to the limit with custom CSS injection, Streamlit theme config, custom HTML components, Plotly charts. Keep Python stack, no framework migration.

**Primary workflow:** Sales rep opens dashboard → searches or browses ranked leads → opens lead profile → reviews all data → exports or takes action.

---
*Last updated: 2026-02-09 after milestone v2.0 initialization*

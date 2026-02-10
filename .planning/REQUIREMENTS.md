# Requirements: PROJETUS Transfer Gov Automation

**Defined:** 2026-02-04
**Core Value:** Extração 100% confiável e automatizada dos dados do Transfer Gov

## v1 Requirements (Milestone v1.0 — Complete)

### Data Extraction (No Login Required)

- [x] **EXTR-01**: Sistema acessa Transfer Gov (público, sem login) e identifica relatório consolidado
- [x] **EXTR-02**: Sistema baixa 4 planilhas (propostas, apoiadores, emendas, programas) de uma execução
- [x] **EXTR-03**: Raw files são armazenados antes de processar (permite reprocessamento)
- [x] **EXTR-04**: Seletores CSS/XPath têm fallbacks (resistem a mudanças no site)
- [x] **EXTR-05**: Retry logic com exponential backoff para falhas de rede (3 tentativas com 2s, 4s, 8s)
- [x] **EXTR-06**: Circuit breaker distingue falhas transientes (retry) de permanentes (alerta)

### ETL Pipeline

- [x] **ETL-01**: Parser detecta encoding automaticamente (UTF-8, UTF-8-sig, Latin-1) e converte para UTF-8
- [x] **ETL-02**: Schema validation compara estrutura do arquivo com schema esperado antes de processar
- [x] **ETL-03**: Parser extrai IDs/chaves de relacionamento entre entidades (propostas ↔ apoiadores ↔ emendas)
- [x] **ETL-04**: Transformer valida dados com Pydantic (campos obrigatórios, formatos, business rules)
- [x] **ETL-05**: Deduplicação identifica registros já existentes (por transfer_gov_id ou content hash)
- [x] **ETL-06**: Pipeline falha completamente se qualquer validação quebrar (fail-fast, não silent corruption)

### Database

- [x] **DB-01**: Schema PostgreSQL com 4 tabelas principais (propostas, apoiadores, emendas, programas)
- [x] **DB-02**: Tabelas de relacionamento N:M (proposta_apoiadores, proposta_emendas)
- [x] **DB-03**: Índices em campos de query comum (status, data_publicacao, valor_total, estado)
- [x] **DB-04**: Constraints de integridade (foreign keys, unique, not null)
- [x] **DB-05**: UPSERT operations (ON CONFLICT DO UPDATE) para idempotência
- [x] **DB-06**: Atomic transactions (commit só se toda extração suceder, rollback se falhar)
- [x] **DB-07**: Tabela extraction_logs rastreia cada execução (data, status, records, duration, errors)

### Scheduling & Automation

- [x] **SCHED-01**: Sistema executa automaticamente todo dia às 9h (APScheduler ou cron)

### Monitoring & Alerting

- [x] **MON-01**: Logs estruturados em JSON (timestamp, level, service, action, metadata) com Loguru
- [x] **MON-02**: Alertas via Telegram após cada execução (sucesso com resumo, ou erro com stack trace)
- [x] **MON-03**: Alerta via email como backup se Telegram falhar
- [x] **MON-04**: Data quality check alerta se volume varia >10% vs dia anterior
- [x] **MON-05**: Alerta se extração "sucedeu" mas extraiu 0 rows
- [x] **MON-06**: Heartbeat check alerta se scheduler não rodou no horário esperado
- [x] **MON-07**: Health check endpoint HTTP retorna status da última execução

---

## v2.0 Requirements — Dashboard Premium Redesign

**Defined:** 2026-02-09
**Milestone Goal:** Transform functional Streamlit dashboard into premium Sigma-branded sales tool optimized for lead research workflow.

### Visual Foundation

- [ ] **VIS-01**: Dark theme applied globally via Streamlit config.toml (background #050B1F, text #E8F4FD, accent #00D4FF)
- [ ] **VIS-02**: External CSS file loaded at app entry with Sigma brand styles (glassmorphic effects, neon glow, custom fonts)
- [ ] **VIS-03**: Google Fonts loaded (Space Grotesk for headings, Inter for body text)
- [ ] **VIS-04**: Glassmorphic card components replace default st.metric (semi-transparent background, backdrop-filter blur, neon border)
- [ ] **VIS-05**: Premium KPI cards with visual hierarchy — large number, label, delta indicator, subtle glow on hover
- [ ] **VIS-06**: Consistent color system — value badges (green/blue/amber/gray), status indicators, severity colors

### Data Visualization

- [ ] **CHART-01**: Plotly charts integrated with dark theme wrapper (Sigma brand colors, transparent backgrounds)
- [ ] **CHART-02**: Geographic heatmap — proponents by estado with value color coding
- [ ] **CHART-03**: Value distribution chart — histogram/bar of proponent value tiers across the dataset
- [ ] **CHART-04**: Trend chart — propostas/emendas over time (monthly/yearly view)
- [ ] **CHART-05**: KPI sparklines — mini trend lines inside metric cards showing recent evolution

### Lead Profile & Search

- [ ] **LEAD-01**: Dedicated lead profile page — single proponent view with all data (emendas, propostas, convênios, histórico) in organized tabs
- [ ] **LEAD-02**: Global search bar visible on every page — type CNPJ or nome to jump to lead profile
- [ ] **LEAD-03**: Lead profile shows contact info prominently (email, telefone, endereço)
- [ ] **LEAD-04**: Lead profile shows value assessment summary (tier, total emendas value, propostas count, convênios)
- [ ] **LEAD-05**: Lead profile shows related ministérios and programas associations
- [ ] **LEAD-06**: Quick actions from profile — export lead data, copy CNPJ, navigate to related entities

### Enhanced Navigation & UX

- [ ] **NAV-01**: Improved Qualificação page — visual ranking cards instead of raw table, clear value tier indicators
- [ ] **NAV-02**: Streamlined sidebar navigation with Sigma branding (logo, styled nav items)
- [ ] **NAV-03**: Cross-page breadcrumb or context indicator — show which lead/entity is currently selected
- [ ] **NAV-04**: Enhanced entity pages (Propostas, Programas, Apoiadores, Emendas) with consistent premium styling

### Polish & Responsiveness

- [ ] **POL-01**: Mobile responsive layout — metric cards stack, tables scroll horizontally, search remains accessible
- [ ] **POL-02**: Loading states — skeleton cards/spinners while data loads (replace blank screens)
- [ ] **POL-03**: Empty states — friendly messages when no data matches filters (not blank tables)
- [ ] **POL-04**: Subtle CSS animations — card hover effects, smooth transitions, fade-in on page load
- [ ] **POL-05**: Consistent styling across ALL 6 pages — no page should look "default Streamlit"
- [ ] **POL-06**: Status badges — styled pill badges for proposta situação, value tier, data freshness

## Future Requirements

### Advanced Features (v3.0+)

- **ADV-01**: Side-by-side lead comparison view
- **ADV-02**: Saved lead lists / favorites
- **ADV-03**: CRM integration (pending client decision)
- **ADV-04**: WhatsApp automation from lead profile
- **ADV-05**: AI-powered lead scoring

## Out of Scope

| Feature | Reason |
|---------|--------|
| Framework migration (Dash/React) | Max Streamlit approach — push CSS injection to the limit, avoid rewrite |
| Real-time collaboration | Streamlit's stateless re-run architecture doesn't support it |
| Complex animations/transitions | Fight Streamlit's re-run model, cause performance issues |
| Drag-drop dashboard customization | Streamlit doesn't support dynamic layout rearrangement |
| Autocomplete search | Streamlit's re-run model makes keystroke-level interactivity impractical |
| Light/dark theme toggle | Fixed dark theme only — Sigma brand identity |
| Infinite scroll tables | Streamlit renders full dataframes, pagination preferred |

## Traceability

**Coverage (v1.0):** 29/29 requirements mapped ✓
**Coverage (v2.0):** 27/27 requirements mapped ✓

### v1.0 Requirements (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTR-01 to EXTR-06 | Phase 1 | Complete |
| ETL-01 to ETL-06 | Phase 1 | Complete |
| DB-01 to DB-07 | Phase 1 | Complete |
| SCHED-01 | Phase 1 | Complete |
| MON-01, MON-02, MON-05, MON-07 | Phase 1 | Complete |
| MON-03, MON-04, MON-06 | Phase 2 | Complete |

### v2.0 Requirements (Pending)

| Requirement | Phase | Status |
|-------------|-------|--------|
| VIS-01 | Phase 6 | Pending |
| VIS-02 | Phase 6 | Pending |
| VIS-03 | Phase 6 | Pending |
| VIS-04 | Phase 6 | Pending |
| VIS-05 | Phase 6 | Pending |
| VIS-06 | Phase 6 | Pending |
| CHART-01 | Phase 7 | Pending |
| CHART-02 | Phase 7 | Pending |
| CHART-03 | Phase 7 | Pending |
| CHART-04 | Phase 7 | Pending |
| CHART-05 | Phase 7 | Pending |
| LEAD-01 | Phase 8 | Pending |
| LEAD-02 | Phase 8 | Pending |
| LEAD-03 | Phase 8 | Pending |
| LEAD-04 | Phase 8 | Pending |
| LEAD-05 | Phase 8 | Pending |
| LEAD-06 | Phase 8 | Pending |
| NAV-01 | Phase 8 | Pending |
| NAV-02 | Phase 8 | Pending |
| NAV-03 | Phase 8 | Pending |
| NAV-04 | Phase 8 | Pending |
| POL-01 | Phase 9 | Pending |
| POL-02 | Phase 9 | Pending |
| POL-03 | Phase 9 | Pending |
| POL-04 | Phase 9 | Pending |
| POL-05 | Phase 9 | Pending |
| POL-06 | Phase 9 | Pending |

---
*Requirements defined: 2026-02-04*
*v2.0 requirements added: 2026-02-09 after milestone v2.0 initialization*
*v2.0 traceability updated: 2026-02-09 after roadmap creation*

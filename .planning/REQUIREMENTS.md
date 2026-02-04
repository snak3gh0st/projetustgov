# Requirements: PROJETUS Transfer Gov Automation

**Defined:** 2026-02-04
**Core Value:** Extração 100% confiável e automatizada dos dados do Transfer Gov

## v1 Requirements

### Data Extraction (No Login Required)

- [ ] **EXTR-01**: Sistema acessa Transfer Gov (público, sem login) e identifica relatório consolidado
- [ ] **EXTR-02**: Sistema baixa 4 planilhas (propostas, apoiadores, emendas, programas) de uma execução
- [ ] **EXTR-03**: Raw files são armazenados antes de processar (permite reprocessamento)
- [ ] **EXTR-04**: Seletores CSS/XPath têm fallbacks (resistem a mudanças no site)
- [ ] **EXTR-05**: Retry logic com exponential backoff para falhas de rede (3 tentativas com 2s, 4s, 8s)
- [ ] **EXTR-06**: Circuit breaker distingue falhas transientes (retry) de permanentes (alerta)

### ETL Pipeline

- [ ] **ETL-01**: Parser detecta encoding automaticamente (UTF-8, UTF-8-sig, Latin-1) e converte para UTF-8
- [ ] **ETL-02**: Schema validation compara estrutura do arquivo com schema esperado antes de processar
- [ ] **ETL-03**: Parser extrai IDs/chaves de relacionamento entre entidades (propostas ↔ apoiadores ↔ emendas)
- [ ] **ETL-04**: Transformer valida dados com Pydantic (campos obrigatórios, formatos, business rules)
- [ ] **ETL-05**: Deduplicação identifica registros já existentes (por transfer_gov_id ou content hash)
- [ ] **ETL-06**: Pipeline falha completamente se qualquer validação quebrar (fail-fast, não silent corruption)

### Database

- [ ] **DB-01**: Schema PostgreSQL com 4 tabelas principais (propostas, apoiadores, emendas, programas)
- [ ] **DB-02**: Tabelas de relacionamento N:M (proposta_apoiadores, proposta_emendas)
- [ ] **DB-03**: Índices em campos de query comum (status, data_publicacao, valor_total, estado)
- [ ] **DB-04**: Constraints de integridade (foreign keys, unique, not null)
- [ ] **DB-05**: UPSERT operations (ON CONFLICT DO UPDATE) para idempotência
- [ ] **DB-06**: Atomic transactions (commit só se toda extração suceder, rollback se falhar)
- [ ] **DB-07**: Tabela extraction_logs rastreia cada execução (data, status, records, duration, errors)

### Scheduling & Automation

- [ ] **SCHED-01**: Sistema executa automaticamente todo dia às 9h (APScheduler ou cron)
- [ ] **SCHED-02**: Checkpoint tracking permite retomar de onde parou se falhar mid-execution
- [ ] **SCHED-03**: Idempotência garante que re-runs não duplicam dados

### Monitoring & Alerting

- [ ] **MON-01**: Logs estruturados em JSON (timestamp, level, service, action, metadata) com Loguru
- [ ] **MON-02**: Alertas via Telegram após cada execução (sucesso com resumo, ou erro com stack trace)
- [ ] **MON-03**: Alerta via email como backup se Telegram falhar
- [ ] **MON-04**: Data quality check alerta se volume varia >10% vs dia anterior (detecta extrações incompletas)
- [ ] **MON-05**: Alerta se extração "sucedeu" mas extraiu 0 rows (separate process success from data success)
- [ ] **MON-06**: Heartbeat check alerta se scheduler não rodou no horário esperado (detecta se sistema parou)
- [ ] **MON-07**: Health check endpoint HTTP retorna status da última execução (para monitoramento externo)

## v2 Requirements

### Operations

- **OPS-01**: Configuration management via YAML files (não hardcoded)
- **OPS-02**: Dry-run mode testa extração sem escrever no database
- **OPS-03**: Data reconciliation compara automated vs manual extraction
- **OPS-04**: Audit trail registra quem/quando/o-quê mudou
- **OPS-05**: Data lineage tracking mostra origem de cada dado
- **OPS-06**: Anomaly detection identifica padrões suspeitos automaticamente

### UI & Integration

- **UI-01**: Streamlit dashboard para visualização (após backend estável)
- **UI-02**: Scoring/qualificação automática de leads (critérios definidos por Tito)
- **UI-03**: Integração com CRM (após Tito confirmar qual CRM)
- **UI-04**: API REST para consulta de dados (se necessário para CRM ou outras ferramentas)

### Scale (Future)

- **SCALE-01**: Parallel processing se runtime exceder 30min
- **SCALE-02**: Automatic recovery com replay de checkpoints
- **SCALE-03**: Data quality dashboard (quando SQL queries ficarem tediosas)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time streaming | Transfer Gov atualiza diariamente, não continuamente. Batch processing suficiente. |
| Microservices architecture | 11 propostas/dia não justifica distributed systems. Monolith é mais simples e confiável. |
| AI/ML para extração | Estrutura do portal governamental é estável. Playwright + seletores resilientes suficientes. |
| Dashboard-first development | Primeiro uso é SQL exploration. UI só depois de validar queries. |
| Multi-source support | Apenas Transfer Gov no escopo. YAGNI. |
| Authentication/Login | Transfer Gov permite download público. Não precisa auth. |
| Mobile app | Sistema backend, não precisa interface mobile. |
| GraphQL API | REST suficiente se necessário. GraphQL é over-engineering. |

## Traceability

**Coverage:** 29/29 v1 requirements mapped to phases ✓

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTR-01 | Phase 1 | Pending |
| EXTR-02 | Phase 1 | Pending |
| EXTR-03 | Phase 1 | Pending |
| EXTR-04 | Phase 1 | Pending |
| EXTR-05 | Phase 1 | Pending |
| EXTR-06 | Phase 1 | Pending |
| ETL-01 | Phase 1 | Pending |
| ETL-02 | Phase 1 | Pending |
| ETL-03 | Phase 1 | Pending |
| ETL-04 | Phase 1 | Pending |
| ETL-05 | Phase 1 | Pending |
| ETL-06 | Phase 1 | Pending |
| DB-01 | Phase 1 | Pending |
| DB-02 | Phase 1 | Pending |
| DB-03 | Phase 1 | Pending |
| DB-04 | Phase 1 | Pending |
| DB-05 | Phase 1 | Pending |
| DB-06 | Phase 1 | Pending |
| DB-07 | Phase 1 | Pending |
| SCHED-01 | Phase 1 | Pending |
| SCHED-02 | Phase 3 | Pending |
| SCHED-03 | Phase 3 | Pending |
| MON-01 | Phase 1 | Pending |
| MON-02 | Phase 1 | Pending |
| MON-03 | Phase 2 | Pending |
| MON-04 | Phase 2 | Pending |
| MON-05 | Phase 1 | Pending |
| MON-06 | Phase 2 | Pending |
| MON-07 | Phase 1 | Pending |

**Phase Distribution:**
- Phase 1 (Foundation): 24 requirements
- Phase 2 (Operational Maturity): 3 requirements
- Phase 3 (Production Excellence): 2 requirements

**Note:** Phase 1 includes all critical pitfall preventions and table stakes features for zero data loss guarantee. Phase 2 adds operational improvements discovered through production experience. Phase 3 is triggered by operational need, not pre-scheduled.

---
*Requirements defined: 2026-02-04*
*Traceability updated: 2026-02-04 after roadmap creation*

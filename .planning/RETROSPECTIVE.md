# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v4.0 — Projetos em Execucao

**Shipped:** 2026-03-30
**Phases:** 4 | **Plans:** 8 | **Quick tasks:** 8

### What Was Built
- Streaming ETL syncing 8,793 OSC execution projects from government CSVs into dedicated DB table
- Role-guarded API with CNPJ-grouped financial intelligence (desembolso, saldo, % execucao, vigencia)
- Full /execucao page with KPI cards, grouped table, slide-over detail, alert highlighting
- Separate Pipeline Aprovacao vs Pipeline Execucao on home dashboard
- 5 execution classification tags (Autossuficiente, Iniciante, Desembolso, Lobby, Rendimento)
- BI dashboard redesign with Aprovacao/Execucao tabs and vendedor filter

### What Worked
- **Data audit first (Phase 14):** Running diagnostics before writing ETL code eliminated surprises — zero unknowns at ETL time
- **Phase execution speed:** All 4 phases (8 plans) completed in a single day (2026-03-18), ~69 min total execution
- **Existing patterns reuse:** Server/client component split, role guards, slide-over pattern — all copied from v3.0 pages
- **Quick tasks for polish:** 8 quick tasks handled incremental improvements without formal phase overhead
- **Client-confirmed alert rule gate:** Blocking Phase 16 on client confirmation prevented implementing a wrong business rule

### What Was Inefficient
- **Memory peak not addressed in production:** Known ~1300MB heap during proposta sync still risks Vercel OOM — kicked the can
- **MILESTONES.md wasn't updated per milestone previously:** v1.0, v2.0, v3.0 entries are minimal compared to v4.0 detail level
- **Quick tasks accumulated without formal tracking in early days:** 74 v3.0 quick tasks had no structured tracking until GSD was adopted

### Patterns Established
- **Data audit → ETL → API → UI:** Build from the data layer up, never start UI before API is stable
- **NUMERIC(18,2) for all financial columns:** No more FLOAT for money — schema-level correctness
- **LEFT JOIN with join_miss_count:** Never silently drop rows; always count and log misses
- **Multi-column CSV header fallback:** Government headers can change; try multiple column name variants
- **Alert rules gated on client confirmation:** Business signals need sign-off, not guesses
- **Dedicated cron per sync type:** Separate endpoints prevent timeout interference

### Key Lessons
1. **One-way doors deserve a gate:** Data audit before ETL prevented baking bugs into architecture — this pattern should apply to any new data pipeline
2. **Government data has quirks:** CSV headers don't match documentation (DIA_* not DT_*), OSC Map is 1.1M rows — always test with real data before declaring success
3. **Quick tasks are powerful for post-milestone polish:** Formal phases for small improvements is overkill; /gsd:quick strikes the right balance

### Cost Observations
- Model mix: ~80% opus, ~20% sonnet (quick tasks)
- Sessions: ~15 across milestone
- Notable: All 8 formal plans executed in <70 min total — most time spent on quick tasks and debugging

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Quick Tasks | Key Change |
|-----------|--------|-------------|------------|
| v1.0 | 5 | 0 | Initial ETL pipeline in Python |
| v2.0 | 4 | 0 | Streamlit premium redesign (superseded) |
| v3.0 | 4 | 74 | CRM on Next.js, adopted GSD workflow |
| v4.0 | 4 | 8 | Data-first approach, structured quick tasks |

### Top Lessons (Verified Across Milestones)

1. **Build from data layer up** — v1.0 ETL-first, v4.0 audit-first both validated this approach
2. **Real data reveals what mocks hide** — v4.0 CSV header mismatch and memory peak only found with live data
3. **Quick tasks prevent scope creep in formal phases** — v3.0 proved this at scale (74 tasks), v4.0 refined it (8 structured tasks)

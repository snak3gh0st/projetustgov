---
phase: quick-fix-pipeline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/loader/db_models.py
  - src/parser/schemas.py
  - src/transformer/models.py
  - src/orchestrator/pipeline.py
  - src/dashboard/streamlit_app.py
  - src/dashboard/pages/home.py
  - src/dashboard/pages/lead_profile.py
  - src/dashboard/queries/entities.py
  - src/dashboard/queries/lead_profile.py
autonomous: true

must_haves:
  truths:
    - "Convenios table has financial columns: valor_empenhado, saldo_conta, saldo_reman_tesouro, saldo_reman_convenente, rendimento_aplicacao, ingresso_contrapartida, valor_global_original"
    - "Propostas table has columns: modalidade, orgao_superior, orgao_vinculado"
    - "Pipeline loads ALL propostas (no 2025-2026 year filter)"
    - "Pipeline loads real programas CSV instead of skipping it"
    - "Dashboard home page shows lead list ranked by opportunity"
    - "Dashboard lead profile page shows ALL instruments (convenios) with financial detail"
  artifacts:
    - path: "src/loader/db_models.py"
      provides: "Convenio + Proposta models with new columns"
      contains: "valor_empenhado"
    - path: "src/parser/schemas.py"
      provides: "Column mappings for new fields"
      contains: "vl_empenhado_conv"
    - path: "src/transformer/models.py"
      provides: "Pydantic validation for new fields"
      contains: "valor_empenhado"
    - path: "src/orchestrator/pipeline.py"
      provides: "Pipeline without year filter, loading real programas"
    - path: "src/dashboard/pages/home.py"
      provides: "Lead list page ranked by opportunity"
      contains: "lead"
    - path: "src/dashboard/pages/lead_profile.py"
      provides: "Instrument detail page with financial columns"
      contains: "valor_empenhado"
  key_links:
    - from: "src/parser/schemas.py"
      to: "src/loader/db_models.py"
      via: "COLUMN_ALIASES map CSV headers to model field names"
      pattern: "vl_empenhado_conv.*valor_empenhado"
    - from: "src/transformer/models.py"
      to: "src/loader/db_models.py"
      via: "Pydantic model fields match ORM model fields"
      pattern: "valor_empenhado.*Optional\\[float\\]"
    - from: "src/dashboard/queries/lead_profile.py"
      to: "src/loader/db_models.py"
      via: "SQL queries reference new column names"
      pattern: "valor_empenhado|saldo_conta"
---

<objective>
Fix the data pipeline to capture all financial columns from TransfereGov CSVs, remove the destructive year filter on propostas, load real programas, and rebuild the dashboard as a 2-page lead-focused sales tool.

Purpose: The current pipeline drops 7 financial columns from convenios and 3 fields from propostas. The 2025-2026 year filter on propostas destroys ~70% of convenio-to-proposta links. The dashboard is overly complex with 7 pages when the sales workflow only needs 2 (lead list + lead detail).

Output: Working pipeline that captures all fields, plus a simplified 2-page dashboard.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/loader/db_models.py
@src/parser/schemas.py
@src/transformer/models.py
@src/orchestrator/pipeline.py
@src/dashboard/streamlit_app.py
@src/dashboard/pages/home.py
@src/dashboard/pages/lead_profile.py
@src/dashboard/queries/entities.py
@src/dashboard/queries/lead_profile.py
@src/dashboard/config.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing columns to DB models, schemas, and validation</name>
  <files>
    src/loader/db_models.py
    src/parser/schemas.py
    src/transformer/models.py
  </files>
  <action>
**db_models.py — Convenio class** (add after `ano` field, before audit columns at line ~254):
```python
valor_empenhado: Mapped[Optional[float]] = mapped_column(Float)
saldo_conta: Mapped[Optional[float]] = mapped_column(Float)
saldo_reman_tesouro: Mapped[Optional[float]] = mapped_column(Float)
saldo_reman_convenente: Mapped[Optional[float]] = mapped_column(Float)
rendimento_aplicacao: Mapped[Optional[float]] = mapped_column(Float)
ingresso_contrapartida: Mapped[Optional[float]] = mapped_column(Float)
valor_global_original: Mapped[Optional[float]] = mapped_column(Float)
```

**db_models.py — Proposta class** (add after `proponente_cnpj` field, before audit columns at line ~128):
```python
modalidade: Mapped[Optional[str]] = mapped_column(String)
orgao_superior: Mapped[Optional[str]] = mapped_column(String)
orgao_vinculado: Mapped[Optional[str]] = mapped_column(String)
```

**schemas.py — EXPECTED_COLUMNS["convenios"]** (add to the list):
```python
"valor_empenhado", "saldo_conta", "saldo_reman_tesouro",
"saldo_reman_convenente", "rendimento_aplicacao",
"ingresso_contrapartida", "valor_global_original",
```

**schemas.py — COLUMN_ALIASES["convenios"]** (add mappings):
```python
"valor_empenhado": ["vl_empenhado_conv"],
"saldo_conta": ["vl_saldo_conta"],
"saldo_reman_tesouro": ["vl_saldo_reman_tesouro"],
"saldo_reman_convenente": ["vl_saldo_reman_convenente"],
"rendimento_aplicacao": ["vl_rendimento_aplicacao"],
"ingresso_contrapartida": ["vl_ingresso_contrapartida"],
"valor_global_original": ["valor_global_original_conv"],
```

**schemas.py — EXPECTED_COLUMNS["propostas"]** (add to the list):
```python
"modalidade", "orgao_superior", "orgao_vinculado",
```

**schemas.py — COLUMN_ALIASES["propostas"]** (add mappings):
```python
"modalidade": ["modalidade"],
"orgao_superior": ["desc_orgao_sup"],
"orgao_vinculado": ["desc_orgao"],
```

**models.py — ConvenioValidation class** (add fields after `ano`):
```python
valor_empenhado: Optional[float] = Field(None, description="Committed value")
saldo_conta: Optional[float] = Field(None, description="Account balance")
saldo_reman_tesouro: Optional[float] = Field(None, description="Treasury remainder balance")
saldo_reman_convenente: Optional[float] = Field(None, description="Convenente remainder balance")
rendimento_aplicacao: Optional[float] = Field(None, description="Investment yield")
ingresso_contrapartida: Optional[float] = Field(None, description="Counterpart income")
valor_global_original: Optional[float] = Field(None, description="Original global value")
```

Add these new fields to the existing `parse_valor` field_validator decorator so they get parsed with `parse_brazilian_float`. Update the decorator to:
```python
@field_validator("valor_global", "valor_repasse", "valor_contrapartida", "valor_desembolsado",
                 "valor_empenhado", "saldo_conta", "saldo_reman_tesouro", "saldo_reman_convenente",
                 "rendimento_aplicacao", "ingresso_contrapartida", "valor_global_original", mode="before")
```

**models.py — PropostaValidation class** (add fields after `programa_id`):
```python
modalidade: Optional[str] = Field(None, description="Modality of the proposal")
orgao_superior: Optional[str] = Field(None, description="Superior government body")
orgao_vinculado: Optional[str] = Field(None, description="Linked government body")
```
  </action>
  <verify>
Run `python -c "from src.loader.db_models import Convenio, Proposta; print('Convenio cols:', [c.name for c in Convenio.__table__.columns if 'saldo' in c.name or 'empenhado' in c.name]); print('Proposta cols:', [c.name for c in Proposta.__table__.columns if c.name in ('modalidade','orgao_superior','orgao_vinculado')])"` — should print the new column names.

Run `python -c "from src.transformer.models import ConvenioValidation; m = ConvenioValidation(transfer_gov_id='123', valor_empenhado='1000,50'); print(m.valor_empenhado)"` — should print `1000.5`.

Run `python -c "from src.parser.schemas import COLUMN_ALIASES; print('vl_empenhado_conv' in str(COLUMN_ALIASES['convenios']))"` — should print `True`.
  </verify>
  <done>
Convenio model has 7 new float columns. Proposta model has 3 new string columns. Schema aliases map CSV headers to model fields. Pydantic validation parses Brazilian float format for all new financial fields.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix pipeline — remove year filter, load real programas, extract emenda year</name>
  <files>
    src/orchestrator/pipeline.py
  </files>
  <action>
Three changes to `src/orchestrator/pipeline.py`:

**Change 1: REMOVE the programas skip** (lines 353-356).
Delete or comment out the block:
```python
# SKIP programas CSV - IDs don't match apoiadores_emendas, using synthetic programas instead
if entity_type == "programas":
    logger.info(f"SKIPPING {file_name} (programas - creating synthetic from apoiadores_emendas)")
    continue
```
Instead, let programas flow through the standard entity validation path. The programas CSV should be processed like any other entity — it goes through `validate_dataframe` and gets added to `validated_data["programas"]`. Note: the `extract_relationships` function also appends synthetic programas. The real ones from CSV will be upserted first, then synthetic ones will update via ON CONFLICT — this is fine since real data has better fields.

**Change 2: REMOVE the 2025-2026 year filter on propostas** (lines 408-438).
Delete the entire block that starts with `# FILTER: Only 2025-2026 data` and ends with the logger.info for "Filtered". Just let `valid_records` pass through unchanged. The block to remove is:
```python
# FILTER: Only 2025-2026 data (all natureza_juridica)
if entity_type == "propostas":
    # Get year and ID columns from raw dataframe
    ano_col = _col(df, "ano_prop")
    ...
    logger.info(
        f"Filtered {file_name}: {original_count} → {len(valid_records)} records (2025-2026 only)"
    )
```

**Change 3: Extract emenda `ano` from COD_PROGRAMA_EMENDA**.
In the `extract_relationships` function, after the emenda is created (around line 196-203), extract the year from the programa code. Add a column resolution at the top of the function:
```python
cod_programa_emenda_col = _col(raw_df, "cod_programa_emenda")
```
Then in the emenda creation block, replace `"ano": None` with:
```python
"ano": _extract_emenda_year(row, cod_programa_emenda_col),
```

Add a helper function before `extract_relationships`:
```python
def _extract_emenda_year(row: dict, cod_col: Optional[str]) -> Optional[int]:
    """Extract year from COD_PROGRAMA_EMENDA (positions 5-8 contain year, 1-indexed)."""
    if not cod_col:
        return None
    cod = str(row.get(cod_col, "")).strip()
    if len(cod) >= 8:
        try:
            return int(cod[4:8])
        except (ValueError, IndexError):
            return None
    return None
```
  </action>
  <verify>
Run `python -c "from src.orchestrator.pipeline import run_pipeline; print('import ok')"` — should succeed without errors.

Verify the year filter is gone: `grep -n "2025.*2026\|Only 2025" src/orchestrator/pipeline.py` — should return nothing.

Verify programas skip is gone: `grep -n "SKIPPING.*programas" src/orchestrator/pipeline.py` — should return nothing (or only comments).
  </verify>
  <done>
Pipeline loads ALL propostas without year filtering. Pipeline loads real programas from CSV. Emenda `ano` is extracted from COD_PROGRAMA_EMENDA positions 5-8.
  </done>
</task>

<task type="auto">
  <name>Task 3: Simplify dashboard to 2-page lead-focused layout</name>
  <files>
    src/dashboard/streamlit_app.py
    src/dashboard/pages/home.py
    src/dashboard/queries/entities.py
  </files>
  <action>
**streamlit_app.py — Simplify to 2 pages:**

Rewrite the navigation to only have 2 pages: "Leads" (home) and "Lead Profile" (detail). Remove imports for propostas, programas, apoiadores, emendas, qualificacao pages. Remove the global search import (not needed for lead workflow). Remove the breadcrumb import. Keep the CSS loading and session state initialization for `selected_lead_cnpj` and `selected_lead_name`.

The new structure:
```python
def leads_page():
    from src.dashboard.pages.home import render_home
    render_home()

def lead_profile_page():
    from src.dashboard.pages.lead_profile import render_lead_profile
    render_lead_profile()

# Sidebar
with st.sidebar:
    st.markdown("### PROJETUS")
    st.markdown("Pipeline de Leads TransfereGov")

_page_leads = st.Page(leads_page, title="Leads", icon="🎯")
_page_lead_profile = st.Page(lead_profile_page, title="Lead Profile", icon="👤")

pages = [_page_leads, _page_lead_profile]

st.session_state._pages = {
    "Lead Profile": _page_lead_profile,
    "Leads": _page_leads,
}

pg = st.navigation(pages)
pg.run()
```

**queries/entities.py — Add lead list query:**

Add a new function `get_lead_list` that returns CNPJs ranked by opportunity. Keep existing functions (they may still be useful). The query:
```python
@st.cache_data(ttl="10m")
def get_lead_list(uf_filter: str = None, modalidade_filter: str = None,
                  com_emenda: bool = None, valor_min: float = None,
                  valor_max: float = None, limit: int = 500) -> pd.DataFrame:
    """Get lead list ranked by opportunity (most instruments + highest values)."""
    engine = get_db_engine()

    query = """
        SELECT
            p.cnpj,
            p.nome,
            p.estado as uf,
            p.email,
            p.telefone,
            p.total_convenios as qtd_instrumentos_ativos,
            p.total_emendas,
            p.valor_total_emendas,
            p.valor_total_desembolsos,
            p.total_propostas,
            CASE WHEN (p.email IS NOT NULL AND p.email != '') OR (p.telefone IS NOT NULL AND p.telefone != '') THEN 'Sim' ELSE 'Nao' END as tem_contato
        FROM proponentes p
        WHERE p.total_convenios > 0
    """
    params = {}

    if uf_filter:
        query += " AND p.estado = :uf"
        params["uf"] = uf_filter
    if com_emenda is True:
        query += " AND p.total_emendas > 0"
    elif com_emenda is False:
        query += " AND p.total_emendas = 0"
    if valor_min is not None:
        query += " AND p.valor_total_emendas >= :valor_min"
        params["valor_min"] = valor_min
    if valor_max is not None:
        query += " AND p.valor_total_emendas <= :valor_max"
        params["valor_max"] = valor_max

    query += " ORDER BY p.total_convenios DESC, p.valor_total_emendas DESC NULLS LAST"
    query += " LIMIT :limit"
    params["limit"] = limit

    with engine.connect() as conn:
        from sqlalchemy import text
        result = conn.execute(text(query), params)
        rows = result.fetchall()
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame([row._asdict() for row in rows])
```

Also add helper queries for filter options:
```python
@st.cache_data(ttl="30m")
def get_uf_options() -> list[str]:
    """Get distinct UF values from proponentes."""
    engine = get_db_engine()
    with engine.connect() as conn:
        from sqlalchemy import text
        result = conn.execute(text("SELECT DISTINCT estado FROM proponentes WHERE estado IS NOT NULL ORDER BY estado"))
        return [row[0] for row in result.fetchall()]
```

**pages/home.py — Rewrite as lead list page:**

Replace the entire content with a lead list page. The page should:

1. Title: "PROJETUS - Leads TransfereGov"
2. Sidebar filters (using `st.sidebar`):
   - UF multiselect (from `get_uf_options()`)
   - Com/Sem Emenda radio (Todos/Com Emenda/Sem Emenda)
   - Faixa de Valor slider (0 to max value)
3. Main area: Display results from `get_lead_list()` as a dataframe
   - Columns: CNPJ, Nome, UF, Qtd Instrumentos, Valor Emendas (formatted as R$), Tem Contato
   - Format valor_total_emendas as "R$ X.XXX.XXX"
4. Row selection: Use `st.dataframe` with `on_select="rerun"` and `selection_mode="single-row"`. When a row is selected, set `st.session_state.selected_lead_cnpj` and `st.session_state.selected_lead_name`, then `st.switch_page` to Lead Profile.
5. Show count of results at top: "Mostrando X leads"

Import from:
- `src.dashboard.queries.entities` for `get_lead_list`, `get_uf_options`

Do NOT import chart components, sparklines, extraction history, or metrics — this page is purely a lead table with filters.
  </action>
  <verify>
Run `python -c "from src.dashboard.pages.home import render_home; print('home import ok')"` — should succeed.

Run `python -c "from src.dashboard.queries.entities import get_lead_list; print('query import ok')"` — should succeed.

Run `python -c "from src.dashboard.streamlit_app import *; print('app import ok')"` — may fail outside Streamlit context but should not have ImportError.

Check no old page imports remain: `grep -n "propostas_page\|programas_page\|apoiadores_page\|emendas_page\|qualificacao_page" src/dashboard/streamlit_app.py` — should return nothing.
  </verify>
  <done>
Dashboard has exactly 2 pages: Leads (home) and Lead Profile. Home page shows a filterable table of CNPJs ranked by opportunity. Clicking a row navigates to Lead Profile.
  </done>
</task>

<task type="auto">
  <name>Task 4: Rebuild lead profile page with instrument (convenio) financial detail</name>
  <files>
    src/dashboard/queries/lead_profile.py
    src/dashboard/pages/lead_profile.py
  </files>
  <action>
**queries/lead_profile.py — Add convenio instruments query:**

Add a new function `get_lead_instruments` that fetches ALL convenios for a CNPJ with full financial detail. Keep existing functions but add:

```python
@st.cache_data(ttl="5m")
def get_lead_instruments(cnpj: str) -> pd.DataFrame:
    """Get all instruments (convenios) for a proponente with financial detail.

    Joins convenios -> propostas (via proposta_id) -> propostas.proponente_cnpj
    Also joins to proposta_emendas + emendas to get emenda info per instrument.
    """
    query = """
        SELECT
            c.transfer_gov_id as nr_instrumento,
            prop.modalidade,
            c.situacao,
            c.instrumento_ativo,
            CASE WHEN pe.emenda_transfer_gov_id IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_emenda,
            e.autor as parlamentar,
            c.valor_global,
            e.valor as valor_emenda,
            c.valor_empenhado,
            c.valor_desembolsado as valor_liberado,
            c.saldo_conta,
            c.valor_repasse,
            c.valor_contrapartida,
            c.valor_global_original,
            c.rendimento_aplicacao,
            c.ingresso_contrapartida,
            c.data_inicio_vigencia,
            c.data_fim_vigencia
        FROM convenios c
        INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
        ORDER BY c.valor_global DESC NULLS LAST
    """
    return run_query(query, params={"cnpj": cnpj})
```

Also add a summary query:
```python
@st.cache_data(ttl="5m")
def get_lead_instrument_summary(cnpj: str) -> dict:
    """Get aggregated financial summary across all instruments for a CNPJ."""
    query = """
        SELECT
            COUNT(DISTINCT c.transfer_gov_id) as total_instrumentos,
            SUM(c.valor_global) as total_valor_global,
            SUM(c.valor_empenhado) as total_empenhado,
            SUM(c.valor_desembolsado) as total_liberado,
            SUM(c.saldo_conta) as total_saldo_conta,
            COUNT(DISTINCT CASE WHEN c.instrumento_ativo = 'SIM' THEN c.transfer_gov_id END) as instrumentos_ativos
        FROM convenios c
        INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
        WHERE prop.proponente_cnpj = :cnpj
    """
    df = run_query(query, params={"cnpj": cnpj})
    if df.empty:
        return {}
    return df.iloc[0].to_dict()
```

**pages/lead_profile.py — Rewrite with instrument focus:**

Rewrite the page to show:

1. **Header section**: CNPJ (formatted), Nome, Email, Telefone. Use `get_lead_overview` for basic info. Add a "Voltar para Leads" button that does `st.switch_page(st.session_state._pages["Leads"])`.

2. **Summary KPIs row** (using `kpi_row` from existing components):
   - Total Instrumentos
   - Total Valor Global (R$ formatted)
   - Total Empenhado (R$ formatted)
   - Total Liberado (R$ formatted)
   - Saldo em Conta (R$ formatted)
   - Instrumentos Ativos
   Use `get_lead_instrument_summary` for this data.

3. **Instruments table** (main content):
   Call `get_lead_instruments(cnpj)`. Display as `st.dataframe` with columns:
   - Nr Instrumento, Modalidade, Situacao, Ativo, Emenda (SIM/NAO), Parlamentar
   - Valor Global, Valor Emenda, Valor Empenhado, Valor Liberado, Saldo em Conta
   Format all monetary columns as "R$ X.XXX,XX" using a helper. Use `column_config` for nice headers in Portuguese.

Remove the old tabbed layout (emendas/propostas/ministerios/programas tabs). Remove imports for `get_lead_emendas`, `get_lead_ministerios`, `get_lead_programas` — they are no longer needed on this page. Keep `get_lead_overview` and `get_lead_propostas` imports only if used.

Remove the tier classification display and TIER_COLORS import — not needed in simplified view.
  </action>
  <verify>
Run `python -c "from src.dashboard.queries.lead_profile import get_lead_instruments, get_lead_instrument_summary; print('queries ok')"` — should succeed.

Run `python -c "from src.dashboard.pages.lead_profile import render_lead_profile; print('page ok')"` — should succeed.

Check new queries reference new columns: `grep -n "valor_empenhado\|saldo_conta" src/dashboard/queries/lead_profile.py` — should find matches.
  </verify>
  <done>
Lead profile page shows header with contact info, KPI summary of financial totals, and a single table of ALL instruments (convenios) with full financial detail including valor_empenhado, saldo_conta, emenda info, and parlamentar name.
  </done>
</task>

</tasks>

<verification>
After all 4 tasks:
1. `python -c "from src.loader.db_models import Convenio; print([c.name for c in Convenio.__table__.columns])"` — lists all 7 new financial columns
2. `python -c "from src.loader.db_models import Proposta; print([c.name for c in Proposta.__table__.columns])"` — lists modalidade, orgao_superior, orgao_vinculado
3. `grep -c "2025.*2026" src/orchestrator/pipeline.py` — returns 0 (year filter removed)
4. `grep -c "SKIPPING.*programas" src/orchestrator/pipeline.py` — returns 0 (programas loaded)
5. `python -c "from src.dashboard.streamlit_app import *"` — no import errors
6. `grep -c "valor_empenhado" src/dashboard/queries/lead_profile.py` — returns > 0
</verification>

<success_criteria>
- DB models have all 10 new columns (7 on Convenio, 3 on Proposta)
- Schema aliases map all CSV column names to model field names
- Pydantic validation handles Brazilian float format for new financial fields
- Pipeline loads ALL propostas (no year filter)
- Pipeline loads real programas from CSV
- Emenda year extracted from COD_PROGRAMA_EMENDA
- Dashboard has exactly 2 pages: Lead List and Lead Profile
- Lead List shows CNPJ table ranked by opportunity with filters
- Lead Profile shows instrument table with all financial columns
- No broken imports or missing dependencies
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-data-pipeline-add-missing-financial-/1-SUMMARY.md`
</output>

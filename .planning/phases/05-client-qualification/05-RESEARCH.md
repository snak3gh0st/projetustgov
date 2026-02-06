# Phase 5: Client Qualification Data Extraction - Research

**Researched:** 2026-02-06
**Domain:** Brazilian Government Data ETL / Entity Normalization / CNPJ Classification
**Confidence:** HIGH

## Summary

Phase 5 requires extracting and structuring proponente (proposer) data from Transfer Gov CSVs to support PROJETUS client qualification workflows. Research reveals that **all required data is available in existing repository files**, eliminating the need for external APIs or web scraping.

**Critical findings:**
1. **`siconv_proponentes.csv.zip` exists** in the repository - a dedicated file for proponente details we're not currently downloading
2. **CNPJ is available** as `IDENTIF_PROPONENTE` in the propostas CSV we already download
3. **Natureza Jurídica is available** in propostas CSV - the official IBGE CONCLA classification that distinguishes OSCs from government entities
4. **No contact data (phone/email) in Transfer Gov repository** - external enrichment required if needed
5. **Entity normalization pattern**: Create separate `proponentes` dimension table with CNPJ as natural key

The standard approach is to create a dimension table for proponentes extracted from propostas, with CNPJ as the deduplication key and natureza_juridica for OSC filtering. Contact enrichment would require external CNPJ lookup APIs but should be deferred based on ASAP timeline constraint.

**Primary recommendation:** Extract proponentes from existing propostas CSV into normalized dimension table, use natureza_juridica codes 3XX (non-profits) excluding 1XX (public administration) for OSC filtering, and defer contact data enrichment.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Polars | 0.20+ | CSV parsing and transformation | Already in use, 10-100x faster than pandas for large CSVs |
| SQLAlchemy | 2.0+ | ORM and database operations | Already in use, standard Python ORM |
| validate-docbr | latest | CNPJ validation and formatting | Most comprehensive Brazilian document validator on PyPI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pycpfcnpj | latest | Lightweight CNPJ validation | Alternative if validate-docbr has conflicts |
| brazilnum | latest | CNPJ parsing and check digit validation | If need detailed CNPJ component extraction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dimension table | Materialized view | View loses audit columns, harder to track data lineage |
| validate-docbr | Custom validation | Hand-rolling CNPJ validation misses edge cases (formatting, check digits) |
| Repository CSV | CNPJ API enrichment | APIs add latency, rate limits, cost - unnecessary for core classification |

**Installation:**
```bash
pip install validate-docbr
# Already have: polars, sqlalchemy
```

## Data Availability

**CRITICAL: All required classification data exists in repository files.**

### From `siconv_proposta.csv.zip` (Already Downloading)

Available columns for proponente extraction:

| Column | Maps to Requirement | Example Value |
|--------|-------------------|---------------|
| `IDENTIF_PROPONENTE` | CNPJ | `27167477000112` |
| `NM_PROPONENTE` | Nome | `MUNICIPIO DE SAO MATEUS` |
| `UF_PROPONENTE` | Estado | `ES` |
| `MUNIC_PROPONENTE` | Município | `SÃO MATEUS` |
| `NATUREZA_JURIDICA` | OSC classification | `103-1` (Órgão Público Municipal) |
| `CEP_PROPONENTE` | ZIP code | `29930010` |
| `ENDERECO_PROPONENTE` | Street address | `AVENIDA JONES DOS SANTOS NEVES, 70` |
| `BAIRRO_PROPONENTE` | Neighborhood | `CENTRO` |
| `ID_PROPOSTA` | For counting proposals | `211353` |

**NOT available:** Telefone (phone), Email

### From `siconv_proponentes.csv.zip` (NOT Currently Downloading)

**Action Required:** Add this file to download pipeline. It likely contains additional proponente metadata and potentially more complete entity information.

**Research recommendation:** Download sample and inspect schema in implementation phase to determine if it has fields beyond what's in propostas CSV.

### From `siconv_apoiadores_emendas_programas.zip` (Already Downloading)

Available for emenda summary aggregation:

| Column | Maps to Requirement |
|--------|-------------------|
| `CNPJ_PROPONENTE_APOIADORES_EMENDAS` | Link to proponente |
| `NUMERO_EMENDA_APOIADORES_EMENDAS` | Emenda number |
| `NOME_PARLAMENTAR_APOIADORES_EMENDAS` | Parlamentar (autor) |
| `VALOR_REPASSE_PROPOSTA_APOIADORES_EMENDAS` | Valor |
| `ID_PROGRAMA` | Link to programa for ministério |

**Note:** Ministério information must be joined through `programas` table via `DESC_ORGAO_SUP_PROGRAMA`.

### Contact Data Enrichment (External - DEFERRED)

Contact data (telefone/email) is **NOT in Transfer Gov repository**. External enrichment options:

**Public CNPJ APIs:**
- [ReceitaWS](https://receitaws.com.br/) - Free, rate-limited
- [CNPJá](https://cnpja.com/en/api/open) - Free tier, Receita Federal data
- [Brasil API](https://brasilapi.com.br/) - Community-maintained

**Recommendation:** DEFER contact enrichment to future phase. Focus on core qualification data (CNPJ, natureza juridica, proposal history, emenda summary) which is all available without external dependencies.

## Architecture Patterns

### Recommended Schema Addition

Add `proponentes` dimension table to existing schema:

```
Database Schema:
├── programas (existing)
├── propostas (existing)
├── apoiadores (existing)
├── emendas (existing)
├── proponentes (NEW)          # Dimension table
│   ├── id (PK, autoincrement)
│   ├── cnpj (unique, natural key)
│   ├── nome
│   ├── natureza_juridica
│   ├── estado
│   ├── municipio
│   ├── cep
│   ├── endereco
│   ├── bairro
│   ├── total_propostas (computed)
│   ├── total_emendas (computed)
│   ├── valor_total_emendas (computed)
│   ├── created_at / updated_at / extraction_date
└── proposta_proponentes (optional junction)
```

### Pattern 1: Dimension Table with Aggregated Metrics

**What:** Extract unique proponentes from propostas, deduplicate by CNPJ, store with pre-computed metrics.

**When to use:** Entity appears across multiple fact tables (propostas, emendas) and needs aggregated view.

**Benefits:**
- Single source of truth for proponente data
- Pre-computed metrics avoid repeated aggregations
- Natural key (CNPJ) supports upserts
- Enables efficient filtering (OSC vs prefeitura)

**Example schema:**
```python
# Source: ETL best practices for dimension tables
class Proponente(Base):
    __tablename__ = "proponentes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cnpj: Mapped[str] = mapped_column(String(14), unique=True, index=True, nullable=False)
    nome: Mapped[Optional[str]] = mapped_column(String)
    natureza_juridica: Mapped[Optional[str]] = mapped_column(String(5), index=True)  # e.g., "103-1"
    estado: Mapped[Optional[str]] = mapped_column(String(2))
    municipio: Mapped[Optional[str]] = mapped_column(String)
    cep: Mapped[Optional[str]] = mapped_column(String(8))
    endereco: Mapped[Optional[str]] = mapped_column(String)
    bairro: Mapped[Optional[str]] = mapped_column(String)

    # Pre-computed aggregations (updated during ETL)
    total_propostas: Mapped[int] = mapped_column(default=0)
    total_emendas: Mapped[int] = mapped_column(default=0)
    valor_total_emendas: Mapped[Optional[float]] = mapped_column(Float)

    # Classification flags
    is_osc: Mapped[bool] = mapped_column(default=False)  # Computed from natureza_juridica

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)
```

### Pattern 2: Two-Phase ETL - Extract then Aggregate

**What:** First pass extracts unique proponentes, second pass computes aggregations.

**When to use:** Aggregations depend on multiple tables (propostas + emendas).

**Process:**
1. **Phase A - Extract Proponentes:**
   - Read propostas CSV
   - Group by `IDENTIF_PROPONENTE` (CNPJ)
   - Take latest/most complete record per CNPJ
   - Upsert to `proponentes` table

2. **Phase B - Compute Aggregations:**
   - Count propostas per CNPJ from `propostas` table
   - Count/sum emendas per CNPJ from `emendas` + junction tables
   - Update `proponentes` aggregated columns

**Example aggregation query:**
```python
# Source: SQLAlchemy aggregation patterns
from sqlalchemy import func, select

# Count propostas per proponente
proposta_counts = (
    select(
        Proposta.proponente_cnpj,
        func.count(Proposta.id).label('total_propostas')
    )
    .group_by(Proposta.proponente_cnpj)
)

# Count emendas per proponente (via junction table)
emenda_stats = (
    select(
        PropostaEmenda.proposta_transfer_gov_id,
        func.count(PropostaEmenda.emenda_transfer_gov_id).label('total_emendas'),
        func.sum(Emenda.valor).label('valor_total')
    )
    .join(Emenda)
    .group_by(PropostaEmenda.proposta_transfer_gov_id)
)
```

### Pattern 3: OSC Classification Filter

**What:** Use natureza_juridica codes from IBGE CONCLA to distinguish OSCs from government entities.

**Filter logic:**
```python
# OSC includes non-profit entities (3XX codes) EXCLUDING government foundations
OSC_NATUREZA_JURIDICA = [
    '303-4',  # Serviço Notarial e Registral
    '306-9',  # Fundação Privada
    '307-7',  # Serviço Social Autônomo
    '322-0',  # Organização Religiosa
    '330-1',  # Organização Social (OS)
    '399-9',  # Associação Privada
    # Add others from 3XX range as needed
]

# EXCLUDE all government entities (1XX codes)
EXCLUDE_GOVERNMENT = [
    '101-5', '102-3', '103-1',  # Órgãos Executivos (Federal, Estadual, Municipal)
    '104-0', '105-8', '106-6',  # Órgãos Legislativos
    '107-4', '108-2',           # Órgãos Judiciários
    '110-4', '111-2', '112-0',  # Autarquias
    '113-9', '114-7', '115-5',  # Fundações Públicas de Direito Público
    '123-6', '124-4', '134-1',  # Estado, Município, União
    # ... full list in Don't Hand-Roll section
]

# Query for OSCs only
osc_proponentes = select(Proponente).where(
    Proponente.natureza_juridica.in_(OSC_NATUREZA_JURIDICA)
)
```

**Classification source:** [IBGE CONCLA Natureza Jurídica 2021](https://concla.ibge.gov.br/estrutura/natjur-estrutura/natureza-juridica-2021)

### Anti-Patterns to Avoid

- **Name-based deduplication:** CNPJ is the reliable natural key, not name (names have typos, abbreviations, accents)
- **Storing computed values without extraction_date:** Aggregations are point-in-time - always track when computed
- **Filtering OSCs by name patterns:** "MUNICIPIO", "PREFEITURA" in name is unreliable - use natureza_juridica codes
- **Application-level joins for aggregations:** Use SQL aggregations, not Python loops over records

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CNPJ validation | Custom regex/check digit | `validate-docbr` library | Handles formatting variants, check digits, edge cases (000000000000XX invalid but passes basic regex) |
| CNPJ formatting | String manipulation | `validate-docbr.CNPJ().mask()` | Handles both 14-digit and formatted XX.XXX.XXX/XXXX-XX inputs |
| Natureza jurídica classification | Custom mapping table | IBGE CONCLA official codes | Official government standard, updated with legislation changes |
| Entity deduplication | Name similarity matching | CNPJ as natural key | Names have typos, CNPJ is authoritative identifier |
| CSV encoding detection | Hardcode UTF-8 | `chardet` library (already in use) | Brazilian gov files sometimes Latin-1, sometimes UTF-8 with BOM |
| Contact data scraping | Web scraping Receita Federal | Public CNPJ APIs (if needed) | Scraping is fragile, APIs provide structured data |

**Key insight:** Brazilian government data has established standards (CNPJ structure, natureza jurídica codes, IBGE classifications) - use official specifications rather than inferring patterns from data.

## OSC vs Prefeitura Classification

**Official Source:** [IBGE CONCLA Natureza Jurídica 2021](https://concla.ibge.gov.br/estrutura/natjur-estrutura/natureza-juridica-2021)

### Government Entities (EXCLUDE from OSC filter)

**1XX range - Administração Pública (Public Administration):**

**Municipal (Prefeituras):**
- `103-1` - Órgão Público do Poder Executivo Municipal
- `106-6` - Órgão Público do Poder Legislativo Municipal
- `112-0` - Autarquia Municipal
- `115-5` - Fundação Pública de Direito Público Municipal
- `118-0` - Órgão Público Autônomo Municipal
- `124-4` - Município (entity itself)
- `127-9` - Fundação Pública de Direito Privado Municipal
- `130-9` - Fundo Público da Administração Indireta Municipal
- `133-3` - Fundo Público da Administração Direta Municipal

**State:**
- `102-3` - Órgão Público do Poder Executivo Estadual ou do Distrito Federal
- `105-8` - Órgão Público do Poder Legislativo Estadual ou do Distrito Federal
- `108-2` - Órgão Público do Poder Judiciário Estadual
- `111-2` - Autarquia Estadual ou do Distrito Federal
- `114-7` - Fundação Pública de Direito Público Estadual ou do Distrito Federal
- `117-1` - Órgão Público Autônomo Estadual ou do Distrito Federal
- `123-6` - Estado ou Distrito Federal
- `126-0` - Fundação Pública de Direito Privado Estadual ou do Distrito Federal
- `129-5` - Fundo Público da Administração Indireta Estadual ou do Distrito Federal
- `132-5` - Fundo Público da Administração Direta Estadual ou do Distrito Federal

**Federal:**
- `101-5` - Órgão Público do Poder Executivo Federal
- `104-0` - Órgão Público do Poder Legislativo Federal
- `107-4` - Órgão Público do Poder Judiciário Federal
- `110-4` - Autarquia Federal
- `113-9` - Fundação Pública de Direito Público Federal
- `116-3` - Órgão Público Autônomo Federal
- `125-2` - Fundação Pública de Direito Privado Federal
- `128-7` - Fundo Público da Administração Indireta Federal
- `131-7` - Fundo Público da Administração Direta Federal
- `134-1` - União

**Public Consortiums:**
- `121-0` - Consórcio Público de Direito Público
- `122-8` - Consórcio Público de Direito Privado

### OSC Entities (INCLUDE in OSC filter)

**3XX range - Entidades sem Fins Lucrativos (Non-Profit Entities):**

**Core OSC types:**
- `306-9` - Fundação Privada
- `307-7` - Serviço Social Autônomo
- `322-0` - Organização Religiosa
- `330-1` - Organização Social (OS)
- `399-9` - Associação Privada

**Other non-profits (may include depending on client definition):**
- `303-4` - Serviço Notarial e Registral (Cartório)
- `313-1` - Entidade Sindical (Union)
- `323-9` - Comunidade Indígena

**Note:** Codes `320-4` (Foreign foundation/association branch) and `321-2` (Foreign foundation/association) may also qualify as OSCs depending on client requirements.

### Filtering Implementation

```python
# Exclude ALL 1XX codes (government)
GOVERNMENT_CODES = [f"{i:03d}-{check_digit}" for i in range(101, 135)]

# Include 3XX codes (non-profits) - customize based on client definition
OSC_CODES = [
    '306-9',  # Fundação Privada
    '307-7',  # Serviço Social Autônomo
    '322-0',  # Organização Religiosa
    '330-1',  # Organização Social
    '399-9',  # Associação Privada
]

# Filter query
is_osc_filter = (
    Proponente.natureza_juridica.in_(OSC_CODES) &
    ~Proponente.natureza_juridica.in_(GOVERNMENT_CODES)
)
```

**Confidence:** HIGH - Based on official IBGE CONCLA classification table (government standard)

## Common Pitfalls

### Pitfall 1: CNPJ Formatting Inconsistencies

**What goes wrong:** CNPJ appears in multiple formats: `27167477000112`, `27.167.477/0001-12`, sometimes with leading zeros stripped.

**Why it happens:** Source systems store CNPJ differently - some as numeric, some as formatted string.

**How to avoid:**
- Always normalize CNPJ to 14-digit zero-padded format before storage
- Use `validate-docbr` to parse and reformat
- Store unformatted in database, format only for display

**Warning signs:**
- Duplicate proponentes with same name but different CNPJ formats
- CNPJ lookups failing due to format mismatch
- Database unique constraints violated

**Code example:**
```python
from validate_docbr import CNPJ

cnpj_validator = CNPJ()

# Normalize any format to 14 digits
raw_cnpj = "27.167.477/0001-12"
normalized = cnpj_validator.validate(raw_cnpj)  # Returns '27167477000112' or False

# Store normalized, mask for display
stored_value = normalized  # '27167477000112'
display_value = cnpj_validator.mask(normalized)  # '27.167.477/0001-12'
```

### Pitfall 2: Name-Based Deduplication

**What goes wrong:** Using proponente name instead of CNPJ for deduplication creates duplicates due to typos, abbreviations, accents.

**Why it happens:** Names are visible, CNPJs are not - developers default to what they see.

**How to avoid:**
- **Always use CNPJ as natural key** for upserts
- Use name only for display, never for matching
- When CNPJ is missing, log and skip record (don't fall back to name matching)

**Warning signs:**
- Same entity appearing multiple times with slight name variations
- "MUNICIPIO DE SAO MATEUS" vs "MUNICIPIO DE SÃO MATEUS" vs "MUN. SAO MATEUS" as separate records

**Example:**
```python
# WRONG - name-based upsert
proponente = session.query(Proponente).filter_by(nome=row['NM_PROPONENTE']).first()

# CORRECT - CNPJ-based upsert
cnpj = normalize_cnpj(row['IDENTIF_PROPONENTE'])
if not cnpj:
    logger.warning(f"Skipping row with invalid CNPJ: {row}")
    continue
proponente = session.query(Proponente).filter_by(cnpj=cnpj).first()
```

### Pitfall 3: Natureza Jurídica as Free Text

**What goes wrong:** Treating natureza_juridica as arbitrary string instead of structured code from IBGE classification.

**Why it happens:** Column appears in CSV without documentation of what values mean.

**How to avoid:**
- Store natureza_juridica as String(5) to enforce format `XXX-X`
- Validate against IBGE CONCLA official code list during ingestion
- Create lookup table mapping codes to descriptions for reports
- Never filter by partial string match - use exact code equality

**Warning signs:**
- OSC filter returns government entities
- Unknown natureza_juridica codes in database
- Filtering by "contains 'Municipal'" instead of code ranges

**Example validation:**
```python
# Load official IBGE codes (one-time setup)
VALID_NATUREZA_JURIDICA = {
    '101-5', '102-3', '103-1', ...,  # All valid codes
}

# Validate during ETL
nat_jur = row['NATUREZA_JURIDICA']
if nat_jur and nat_jur not in VALID_NATUREZA_JURIDICA:
    logger.warning(f"Unknown natureza_juridica code: {nat_jur} for CNPJ {cnpj}")
    # Decide: reject row, or store with flag for manual review
```

### Pitfall 4: UTF-8 BOM in CSV Headers

**What goes wrong:** First column header starts with invisible BOM character (`\ufeff`), breaking column name matching.

**Why it happens:** Brazilian government CSVs often include UTF-8 BOM marker at file start.

**How to avoid:**
- Already handled in existing `parser/schemas.py::_normalize_column_name()` which strips BOM
- Verify BOM handling extends to new proponentes CSV
- Test with actual repository files, not sanitized samples

**Warning signs:**
- Schema validation failing on first column despite correct name
- Column appears as `﻿ID_PROPOSTA` instead of `ID_PROPOSTA` in debug logs
- Mapping fails for `IDENTIF_PROPONENTE` but works for other columns

**Detection:**
```python
# Check for BOM in first column
first_col = df.columns[0]
if first_col.startswith('\ufeff'):
    logger.warning(f"BOM detected in CSV header: {first_col}")
    # Normalization should handle this, but log for visibility
```

### Pitfall 5: Semicolon vs Comma Delimiters

**What goes wrong:** Brazilian CSVs commonly use semicolon (`;`) delimiter, not comma - parser fails or creates single-column DataFrame.

**Why it happens:** Brazilian regional settings use comma as decimal separator, so CSVs use semicolon as field delimiter.

**How to avoid:**
- Already handled in existing `parser/file_parser.py::_parse_csv()` which tries `;`, `,`, `\t`
- Verify delimiter detection works for proponentes CSV
- Log detected delimiter for each file

**Warning signs:**
- DataFrame has 1 column instead of 30+
- Column names contain entire first row as single string
- Polars/pandas fails to parse with "too many columns" error

**Current implementation (verified working):**
```python
# From existing file_parser.py - already handles this
for sep in [';', ',', '\t']:
    test_df = pd.read_csv(path, sep=sep, nrows=10)
    if len(test_df.columns) > 1:
        # Found correct separator
        break
```

## Code Examples

Verified patterns from existing codebase and official sources:

### Entity Extraction with Deduplication

```python
# Source: Existing upsert.py pattern adapted for proponentes
import polars as pl
from validate_docbr import CNPJ

cnpj_validator = CNPJ()

def extract_proponentes_from_propostas(df: pl.DataFrame) -> pl.DataFrame:
    """Extract unique proponentes from propostas DataFrame."""

    # Normalize CNPJ column
    df = df.with_columns([
        pl.col('IDENTIF_PROPONENTE')
        .str.strip_chars()
        .str.replace_all('[^0-9]', '')  # Remove formatting
        .str.zfill(14)  # Zero-pad to 14 digits
        .alias('cnpj_normalized')
    ])

    # Filter invalid CNPJs (validate check digits)
    def is_valid_cnpj(cnpj: str) -> bool:
        return cnpj_validator.validate(cnpj) is not False

    df = df.filter(
        pl.col('cnpj_normalized').map_elements(is_valid_cnpj, return_dtype=pl.Boolean)
    )

    # Group by CNPJ, take most recent/complete record
    proponentes = df.group_by('cnpj_normalized').agg([
        pl.col('NM_PROPONENTE').first().alias('nome'),
        pl.col('NATUREZA_JURIDICA').first().alias('natureza_juridica'),
        pl.col('UF_PROPONENTE').first().alias('estado'),
        pl.col('MUNIC_PROPONENTE').first().alias('municipio'),
        pl.col('CEP_PROPONENTE').first().alias('cep'),
        pl.col('ENDERECO_PROPONENTE').first().alias('endereco'),
        pl.col('BAIRRO_PROPONENTE').first().alias('bairro'),
        pl.col('ID_PROPOSTA').count().alias('total_propostas'),
    ])

    return proponentes
```

### OSC Classification Filter

```python
# Source: IBGE CONCLA Natureza Jurídica 2021
from sqlalchemy import select

# Define OSC natureza juridica codes (3XX range non-profits)
OSC_CODES = {
    '306-9',  # Fundação Privada
    '307-7',  # Serviço Social Autônomo
    '322-0',  # Organização Religiosa
    '330-1',  # Organização Social (OS)
    '399-9',  # Associação Privada
}

# Define government codes to EXCLUDE (1XX range)
GOVERNMENT_CODES = {
    '103-1',  # Prefeitura (Órgão Executivo Municipal)
    '124-4',  # Município
    # ... add all 1XX codes from classification table
}

# Query OSCs only
def get_osc_proponentes(session):
    """Retrieve only civil society organization proponentes."""
    return session.execute(
        select(Proponente)
        .where(Proponente.natureza_juridica.in_(OSC_CODES))
        .order_by(Proponente.total_propostas.desc())
    ).scalars().all()

# Or add computed column during ETL
def classify_proponente(natureza_juridica: str) -> bool:
    """Return True if proponente is OSC (not government)."""
    if not natureza_juridica:
        return False
    return (
        natureza_juridica in OSC_CODES and
        natureza_juridica not in GOVERNMENT_CODES
    )
```

### Emenda Summary Aggregation

```python
# Source: SQLAlchemy aggregation documentation
from sqlalchemy import func, select, join

def compute_emenda_stats_per_proponente(session):
    """Aggregate emenda counts and values per proponente CNPJ."""

    # This assumes propostas table has proponente_cnpj column
    # (schema modification needed - see Architecture Patterns)

    query = (
        select(
            Proposta.proponente_cnpj,
            func.count(Emenda.id).label('total_emendas'),
            func.sum(Emenda.valor).label('valor_total_emendas'),
            func.array_agg(Emenda.autor.distinct()).label('parlamentares'),
        )
        .select_from(Proposta)
        .join(PropostaEmenda, Proposta.transfer_gov_id == PropostaEmenda.proposta_transfer_gov_id)
        .join(Emenda, PropostaEmenda.emenda_transfer_gov_id == Emenda.transfer_gov_id)
        .group_by(Proposta.proponente_cnpj)
    )

    results = session.execute(query).all()

    # Update proponentes table with aggregated values
    for row in results:
        proponente = session.query(Proponente).filter_by(cnpj=row.proponente_cnpj).first()
        if proponente:
            proponente.total_emendas = row.total_emendas
            proponente.valor_total_emendas = row.valor_total_emendas

    session.commit()
```

### Schema Migration

```python
# Source: Existing db_models.py pattern
# Add to src/loader/db_models.py

class Proponente(Base):
    """Proponent entities (proposers) - dimension table for client qualification."""

    __tablename__ = "proponentes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Natural key
    cnpj: Mapped[str] = mapped_column(
        String(14), unique=True, index=True, nullable=False,
        comment="CNPJ normalized to 14 digits (no formatting)"
    )

    # Entity attributes
    nome: Mapped[Optional[str]] = mapped_column(String)
    natureza_juridica: Mapped[Optional[str]] = mapped_column(
        String(5), index=True,
        comment="IBGE CONCLA code (e.g., 103-1 for Municipal Executive)"
    )
    estado: Mapped[Optional[str]] = mapped_column(String(2))
    municipio: Mapped[Optional[str]] = mapped_column(String)
    cep: Mapped[Optional[str]] = mapped_column(String(8))
    endereco: Mapped[Optional[str]] = mapped_column(String)
    bairro: Mapped[Optional[str]] = mapped_column(String)

    # Computed classifications
    is_osc: Mapped[bool] = mapped_column(
        default=False, index=True,
        comment="True if civil society org (not government)"
    )

    # Aggregated metrics
    total_propostas: Mapped[int] = mapped_column(default=0)
    total_emendas: Mapped[int] = mapped_column(default=0)
    valor_total_emendas: Mapped[Optional[float]] = mapped_column(Float)

    # Audit columns
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)

    __table_args__ = (
        Index('ix_proponentes_natureza_juridica', 'natureza_juridica'),
        Index('ix_proponentes_is_osc', 'is_osc'),
        Index('ix_proponentes_estado', 'estado'),
    )
```

### Schema Update for Propostas

```python
# Modify existing Proposta model to add proponente_cnpj FK
# Add to src/loader/db_models.py

# In Proposta class, add:
    # Application-level FK to proponentes.cnpj (no DB constraint)
    proponente_cnpj: Mapped[Optional[str]] = mapped_column(
        String(14), index=True,
        comment="Links to proponentes.cnpj (extracted from IDENTIF_PROPONENTE)"
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Web scraping Receita Federal | Public CNPJ APIs | 2020-2022 | Reliable structured data, rate limits manageable |
| Name-based entity matching | CNPJ as natural key | Always standard | CNPJ is authoritative Brazilian business identifier |
| Custom CSV parsers | Polars for large files | ~2023 | 10-100x faster than pandas for GB-sized government CSVs |
| Manual natureza juridica mapping | IBGE CONCLA official codes | Government standard since 1995 | Consistent classification across all government systems |

**Deprecated/outdated:**
- **ReceitaWS v1 API**: Old API had captcha requirement, now bypassed in v2 (but still rate-limited)
- **CNPJ format changing June 2026**: New CNPJs will include letters (alphanumeric), existing remain numeric - normalize to handle both

## Open Questions

Items that couldn't be fully resolved:

1. **Ministério (Ministry) field availability**
   - What we know: `DESC_ORGAO_SUP_PROGRAMA` in programas table contains ministry name
   - What's unclear: Whether this needs to be denormalized to emendas or computed via join
   - Recommendation: Join programas via `emendas.programa_id` → `programas.transfer_gov_id` for ministry lookup

2. **Contact data priority (telefone/email)**
   - What we know: NOT in Transfer Gov repository CSVs
   - What's unclear: Is this critical for client qualification or nice-to-have?
   - Recommendation: Start without, add external CNPJ API enrichment in Phase 6 if client confirms necessity

3. **"Cadastrou no TransfereGov" definition**
   - What we know: All entities in propostas have submitted proposals (so all are "registered" in some sense)
   - What's unclear: Is this asking for formal registration status vs just proposal submission?
   - Recommendation: Use `total_propostas > 0` as proxy, clarify with client if this means something more specific

4. **siconv_proponentes.csv.zip schema**
   - What we know: File exists in repository but not currently downloaded
   - What's unclear: What columns it contains, whether it duplicates propostas data or adds new fields
   - Recommendation: Download and inspect during implementation to determine if it provides additional value

5. **CNPJ validation strictness**
   - What we know: `validate-docbr` validates check digits, but some government records may have historically invalid CNPJs
   - What's unclear: Should invalid CNPJs be rejected or flagged-and-accepted?
   - Recommendation: Log validation failures, accept with is_valid_cnpj=False flag for manual review

## Sources

### Primary (HIGH confidence)
- [IBGE CONCLA Natureza Jurídica 2021](https://concla.ibge.gov.br/estrutura/natjur-estrutura/natureza-juridica-2021) - Official classification codes
- Transfer Gov Repository CSV inspection - Actual column availability verified from downloaded files
- [validate-docbr PyPI](https://pypi.org/project/validate-docbr/) - CNPJ validation library documentation
- Existing codebase patterns in `src/parser/`, `src/loader/db_models.py` - Current ETL architecture

### Secondary (MEDIUM confidence)
- [CNPJá API Documentation](https://cnpja.com/en/api/open) - External CNPJ enrichment option
- [ReceitaWS](https://receitaws.com.br/) - Alternative CNPJ API
- [Airbyte: Data Deduplication in ETL](https://airbyte.com/data-engineering-resources/the-best-way-to-handle-data-deduplication-in-etl) - Entity deduplication patterns
- [SICONV API Documentation](https://github.com/dadosgovbr/api-siconv/blob/master/doc/basico/natureza_juridica.html) - API structure (codes not included in docs)

### Tertiary (LOW confidence - flagged for validation)
- WebSearch results about CNPJ alphanumeric format (June 2026) - Mentioned in tax planning articles but not officially confirmed
- Brazilian government CSV encoding practices - Based on community reports, not official documentation

## Metadata

**Confidence breakdown:**
- Data availability: HIGH - Verified by inspecting actual CSV files from repository
- Natureza jurídica classification: HIGH - Based on official IBGE CONCLA documentation
- Architecture patterns: HIGH - Follows existing codebase patterns and standard ETL dimension table practices
- CNPJ validation: HIGH - Well-established libraries with proven track record
- Contact data enrichment: MEDIUM - External APIs exist but haven't tested integration

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - stable government data standards, but CNPJ format change in June 2026 may impact)

**Critical dependencies:**
- Transfer Gov repository structure remains stable (files continue to be published)
- IBGE CONCLA codes remain current (last updated 2021, typically updated with legislation changes)
- CNPJ validation libraries maintain compatibility with new alphanumeric format (post-June 2026)

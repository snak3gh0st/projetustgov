"""Bulk upsert operations for the PROJETUS ETL pipeline.

This module provides:
- upsert_records: Bulk insert with ON CONFLICT DO UPDATE for idempotent loading
- load_extraction_data: Orchestrates loading all entity tables in dependency order

Design principles:
- All operations are idempotent (re-running same data produces no duplicates)
- Transaction boundaries are managed by the caller (orchestrator)
- Junction tables use compound unique constraints as conflict targets
"""

import re
from datetime import date
from typing import Any, TypedDict

import polars as pl
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Row
from sqlalchemy.orm import Session

from src.loader.db_models import (
    Apoiador,
    Emenda,
    ExtractionLog,
    Programa,
    Proponente,
    Proposta,
    PropostaApoiador,
    PropostaEmenda,
)
from src.monitor.logger import logger


def upsert_records(
    session: Session,
    model_class: type,
    records: list[dict],
    conflict_column: str | list[str] = "transfer_gov_id",
    batch_size: int = 100,
) -> dict[str, int]:
    """Bulk upsert records using PostgreSQL ON CONFLICT DO UPDATE.

    This function inserts new records and updates existing records when a
    conflict occurs on the specified column(s). It guarantees idempotency:
    re-running the same data produces no duplicates.

    IMPORTANT: Records are batched to avoid PostgreSQL's 65,535 parameter limit.

    Args:
        session: SQLAlchemy Session for database operations
        model_class: ORM model class to insert into (e.g., Proposta, Programa)
        records: List of dictionaries representing records to upsert
        conflict_column: Column name(s) to use for conflict detection
            - str: Single column (e.g., "transfer_gov_id" for main entities)
            - list[str]: Multiple columns for compound unique constraints (junction tables)
        batch_size: Number of records per batch (default: 1000)
            PostgreSQL limit: 65,535 parameters. With 10 columns, max ~6500 rows.

    Returns:
        Dictionary with "inserted" and "updated" counts.
        Note: PostgreSQL doesn't distinguish insert vs update in rowcount,
        so "inserted" shows new records, "updated" shows updated records.
        If rowcount doesn't distinguish, returns total affected rows.

    Example:
        >>> propostas = [{"transfer_gov_id": "123", "titulo": "Example"}]
        >>> result = upsert_records(session, Proposta, propostas)
        >>> print(result)  # {"inserted": 1, "updated": 0}
    """
    if not records:
        logger.debug("No records to upsert for %s", model_class.__tablename__)
        return {"inserted": 0, "updated": 0}

    # Normalize conflict_column to list for consistent handling
    conflict_columns = [conflict_column] if isinstance(conflict_column, str) else conflict_column

    # Deduplicate records within the batch (last occurrence wins)
    # PostgreSQL rejects duplicate values within a single INSERT statement
    seen = {}
    for record in records:
        # Create composite key for deduplication
        key_values = tuple(record.get(col) for col in conflict_columns)
        if all(v is not None for v in key_values):
            seen[key_values] = record
        else:
            seen[id(record)] = record
    deduped = list(seen.values())
    if len(deduped) < len(records):
        logger.warning(
            "Deduplicated %d → %d records for %s (conflict columns: %s)",
            len(records),
            len(deduped),
            model_class.__tablename__,
            conflict_columns,
        )
    records = deduped

    # Get the table from the model
    table = model_class.__table__

    # Process records in batches to avoid PostgreSQL parameter limit
    total_inserted = 0
    total_batches = (len(records) + batch_size - 1) // batch_size

    logger.info(
        "Upserting %d records into %s in %d batches of %d",
        len(records),
        model_class.__tablename__,
        total_batches,
        batch_size,
    )

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        batch_num = (i // batch_size) + 1

        # Build the insert statement for this batch
        stmt = insert(table).values(batch)

        # Build update dictionary: all columns EXCEPT primary key (id) and conflict_columns
        # Always include updated_at for audit trail
        update_cols = {}
        for col in table.columns:
            col_name = col.name
            # Skip primary key (id) - we don't want to change it
            if col_name == "id":
                continue
            # Skip the conflict columns - we keep the original values
            if col_name in conflict_columns:
                continue
            # Always update all other columns
            update_cols[col_name] = stmt.excluded[col_name]

        # Build the on_conflict_do_update statement
        stmt = stmt.on_conflict_do_update(
            index_elements=conflict_columns,
            set_=update_cols,
        )

        # Execute the statement
        result = session.execute(stmt)
        rowcount: int = result.rowcount  # type: ignore[attr-defined]
        total_inserted += rowcount

        # Flush every 10 batches to reduce memory pressure
        if batch_num % 10 == 0:
            session.flush()
            logger.debug("Flushed session after batch %d", batch_num)

        if batch_num % 100 == 0 or batch_num == total_batches:
            logger.info(
                "Batch %d/%d: upserted %d records into %s",
                batch_num,
                total_batches,
                rowcount,
                model_class.__tablename__,
            )

    logger.info(
        "Completed upsert: %d total records into %s (conflict columns: %s)",
        total_inserted,
        model_class.__tablename__,
        conflict_columns,
    )

    # PostgreSQL doesn't distinguish insert vs update in rowcount
    # For accurate counts, we'd need RETURNING clause, but keeping it simple
    return {"inserted": total_inserted, "updated": 0}


def normalize_cnpj(raw: str) -> str:
    """Normalize CNPJ to 14-digit zero-padded format.

    Args:
        raw: Raw CNPJ string (may include formatting or be numeric)

    Returns:
        14-digit zero-padded CNPJ string, or empty string if invalid
    """
    if not raw:
        return ""
    digits = re.sub(r'[^0-9]', '', str(raw))
    # Skip all-zeros CNPJ
    if not digits or digits == '0' * len(digits):
        return ""
    return digits.zfill(14) if len(digits) <= 14 else ""


def is_osc(natureza_juridica: str) -> bool:
    """Classify if natureza juridica indicates OSC (non-profit) vs government.

    Handles both IBGE CONCLA codes and descriptive text:
    - Codes: 3XX range = non-profits (OSCs), 1XX = government
    - Text: "Organização da Sociedade Civil", "Sociedade Civil", "OSC"

    Args:
        natureza_juridica: IBGE CONCLA code (e.g., "103-1", "306-9") or descriptive text

    Returns:
        True if OSC, False if government or unknown
    """
    if not natureza_juridica:
        return False

    nat_jur = str(natureza_juridica).strip().lower()

    # Check for descriptive text (Transfer Gov format)
    if (
        "organização da sociedade civil" in nat_jur or
        "sociedade civil" in nat_jur or
        "osc" in nat_jur
    ):
        return True

    # Check for IBGE code format (3XX range = non-profits)
    if nat_jur.startswith('3'):
        return True

    return False


def extract_proponentes_from_propostas(
    propostas_records: list[dict], raw_df: pl.DataFrame
) -> list[dict]:
    """Extract unique proponentes from propostas with CNPJ deduplication.

    Args:
        propostas_records: Validated proposta records (not used, kept for signature consistency)
        raw_df: Raw propostas DataFrame with all columns including proponente fields

    Returns:
        List of proponente dictionaries ready for upsert
    """
    from src.parser.schemas import _normalize_column_name

    # Helper to find column by normalized name
    def _col(name: str) -> str | None:
        for col in raw_df.columns:
            if _normalize_column_name(col) == _normalize_column_name(name):
                return col
        return None

    # Resolve actual column names
    cnpj_col = _col("identif_proponente")
    nome_col = _col("nm_proponente")
    nat_jur_col = _col("natureza_juridica")
    uf_col = _col("uf_proponente")
    munic_col = _col("munic_proponente")
    cep_col = _col("cep_proponente")
    endereco_col = _col("endereco_proponente")
    bairro_col = _col("bairro_proponente")

    if not cnpj_col:
        logger.warning("Could not find CNPJ column (IDENTIF_PROPONENTE) in propostas CSV")
        return []

    proponentes_dict: dict[str, dict] = {}

    for row in raw_df.iter_rows(named=True):
        cnpj_raw = row.get(cnpj_col, "")
        cnpj = normalize_cnpj(cnpj_raw)

        if not cnpj:
            continue

        # Skip if already seen (take first occurrence)
        if cnpj in proponentes_dict:
            proponentes_dict[cnpj]["total_propostas"] += 1
            continue

        # Extract proponente fields
        nat_jur = str(row.get(nat_jur_col, "")).strip() if nat_jur_col else None

        proponentes_dict[cnpj] = {
            "cnpj": cnpj,
            "nome": str(row.get(nome_col, "")).strip() if nome_col else None,
            "natureza_juridica": nat_jur,
            "estado": str(row.get(uf_col, "")).strip() if uf_col else None,
            "municipio": str(row.get(munic_col, "")).strip() if munic_col else None,
            "cep": str(row.get(cep_col, "")).strip() if cep_col else None,
            "endereco": str(row.get(endereco_col, "")).strip() if endereco_col else None,
            "bairro": str(row.get(bairro_col, "")).strip() if bairro_col else None,
            "is_osc": is_osc(nat_jur) if nat_jur else False,
            "total_propostas": 1,
        }

    logger.info(f"Extracted {len(proponentes_dict)} unique proponentes from propostas CSV")
    return list(proponentes_dict.values())


def compute_proponente_aggregations(session: Session) -> None:
    """Compute aggregated metrics for proponentes from propostas and emendas tables.

    Updates:
    - total_propostas: Count of propostas per CNPJ
    - total_emendas: Count of emendas per CNPJ (via junction tables)
    - valor_total_emendas: Sum of emenda values per CNPJ

    Args:
        session: SQLAlchemy Session for database operations
    """
    # Count propostas per proponente CNPJ
    proposta_counts = (
        session.query(
            Proposta.proponente_cnpj,
            func.count(Proposta.id).label('total_propostas')
        )
        .filter(Proposta.proponente_cnpj.isnot(None))
        .group_by(Proposta.proponente_cnpj)
        .all()
    )

    for cnpj, count in proposta_counts:
        session.query(Proponente).filter_by(cnpj=cnpj).update(
            {"total_propostas": count},
            synchronize_session=False
        )

    logger.info(f"Updated total_propostas for {len(proposta_counts)} proponentes")

    # Count emendas and sum values per proponente CNPJ
    # Join: Proposta -> PropostaEmenda -> Emenda
    emenda_stats = (
        session.query(
            Proposta.proponente_cnpj,
            func.count(Emenda.id).label('total_emendas'),
            func.sum(Emenda.valor).label('valor_total')
        )
        .join(PropostaEmenda, Proposta.transfer_gov_id == PropostaEmenda.proposta_transfer_gov_id)
        .join(Emenda, PropostaEmenda.emenda_transfer_gov_id == Emenda.transfer_gov_id)
        .filter(Proposta.proponente_cnpj.isnot(None))
        .group_by(Proposta.proponente_cnpj)
        .all()
    )

    for cnpj, total_emendas, valor_total in emenda_stats:
        session.query(Proponente).filter_by(cnpj=cnpj).update(
            {
                "total_emendas": total_emendas,
                "valor_total_emendas": valor_total
            },
            synchronize_session=False
        )

    logger.info(f"Updated emenda stats for {len(emenda_stats)} proponentes")


def load_extraction_data(
    session: Session,
    validated_data: dict[str, list[dict]],
    extraction_date: date,
) -> dict[str, dict[str, int]]:
    """Load all validated data into the database in dependency order.

    This function orchestrates loading all entity tables for a single
    extraction run. It loads tables in dependency order (parent tables first,
    then children, then junction tables) to maintain referential integrity.

    IMPORTANT: This function does NOT commit the session. The caller
    manages the transaction boundary for atomic operations.

    Args:
        session: SQLAlchemy Session for database operations
        validated_data: Dictionary mapping entity names to lists of validated records:
            - "programas": List of programa records
            - "propostas": List of proposta records
            - "apoiadores": List of apoiador records
            - "emendas": List of emenda records
            - "proposta_apoiadores": List of junction records
            - "proposta_emendas": List of junction records
        extraction_date: Date of the extraction run (added to each record)

    Returns:
        Dictionary with statistics for each table:
            {
                "programas": {"inserted": N, "updated": M},
                "propostas": {"inserted": N, "updated": M},
                ...
            }

    Example:
        >>> validated = {
        ...     "programas": [...],
        ...     "propostas": [...],
        ...     "apoiadores": [...],
        ...     "emendas": [...],
        ...     "proposta_apoiadores": [...],
        ...     "proposta_emendas": [...],
        ... }
        >>> stats = load_extraction_data(session, validated, date.today())
    """
    stats: dict[str, dict[str, int]] = {}

    # Add extraction_date to each record in all lists
    # This ensures every record tracks which extraction produced it
    for key in validated_data:
        for record in validated_data[key]:
            record["extraction_date"] = extraction_date

    # Load tables in dependency order:
    # 1. programas (no dependencies)
    if validated_data.get("programas"):
        result = upsert_records(session, Programa, validated_data["programas"])
        stats["programas"] = result
        logger.info(
            "Loaded %d programas records (inserted: %d, updated: %d)",
            len(validated_data["programas"]),
            result["inserted"],
            result["updated"],
        )

    # 2. proponentes (dimension table, no dependencies)
    if validated_data.get("proponentes"):
        result = upsert_records(
            session,
            Proponente,
            validated_data["proponentes"],
            conflict_column="cnpj"
        )
        stats["proponentes"] = result
        logger.info(
            "Loaded %d proponentes records (inserted: %d, updated: %d)",
            len(validated_data["proponentes"]),
            result["inserted"],
            result["updated"],
        )

    # 3. propostas (depends on programas, but we use app-level FK so order doesn't matter)
    if validated_data.get("propostas"):
        result = upsert_records(session, Proposta, validated_data["propostas"])
        stats["propostas"] = result
        logger.info(
            "Loaded %d propostas records (inserted: %d, updated: %d)",
            len(validated_data["propostas"]),
            result["inserted"],
            result["updated"],
        )

    # 4. apoiadores (no dependencies)
    if validated_data.get("apoiadores"):
        result = upsert_records(session, Apoiador, validated_data["apoiadores"])
        stats["apoiadores"] = result
        logger.info(
            "Loaded %d apoiadores records (inserted: %d, updated: %d)",
            len(validated_data["apoiadores"]),
            result["inserted"],
            result["updated"],
        )

    # 5. emendas (no dependencies)
    if validated_data.get("emendas"):
        result = upsert_records(session, Emenda, validated_data["emendas"])
        stats["emendas"] = result
        logger.info(
            "Loaded %d emendas records (inserted: %d, updated: %d)",
            len(validated_data["emendas"]),
            result["inserted"],
            result["updated"],
        )

    # 6. proposta_apoiadores (junction table with compound unique constraint)
    if validated_data.get("proposta_apoiadores"):
        # Junction tables: conflict target is BOTH columns in the unique constraint
        result = upsert_records(
            session,
            PropostaApoiador,
            validated_data["proposta_apoiadores"],
            conflict_column=["proposta_transfer_gov_id", "apoiador_transfer_gov_id"],
        )
        stats["proposta_apoiadores"] = result
        logger.info(
            "Loaded %d proposta_apoiadores records (inserted: %d, updated: %d)",
            len(validated_data["proposta_apoiadores"]),
            result["inserted"],
            result["updated"],
        )

    # 7. proposta_emendas (junction table with compound unique constraint)
    if validated_data.get("proposta_emendas"):
        # Junction tables: conflict target is BOTH columns in the unique constraint
        result = upsert_records(
            session,
            PropostaEmenda,
            validated_data["proposta_emendas"],
            conflict_column=["proposta_transfer_gov_id", "emenda_transfer_gov_id"],
        )
        stats["proposta_emendas"] = result
        logger.info(
            "Loaded %d proposta_emendas records (inserted: %d, updated: %d)",
            len(validated_data["proposta_emendas"]),
            result["inserted"],
            result["updated"],
        )

    # 8. Compute aggregated metrics for proponentes
    if validated_data.get("proponentes"):
        compute_proponente_aggregations(session)

    logger.info("Extraction data loading complete: %d tables processed", len(stats))
    return stats

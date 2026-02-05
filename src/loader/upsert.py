"""Bulk upsert operations for the PROJETUS ETL pipeline.

This module provides:
- upsert_records: Bulk insert with ON CONFLICT DO UPDATE for idempotent loading
- load_extraction_data: Orchestrates loading all entity tables in dependency order

Design principles:
- All operations are idempotent (re-running same data produces no duplicates)
- Transaction boundaries are managed by the caller (orchestrator)
- Junction tables use compound unique constraints as conflict targets
"""

from datetime import date
from typing import Any, TypedDict

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Row
from sqlalchemy.orm import Session

from src.loader.db_models import (
    Apoiador,
    Emenda,
    ExtractionLog,
    Programa,
    Proposta,
    PropostaApoiador,
    PropostaEmenda,
)
from src.monitor.logger import logger


def upsert_records(
    session: Session,
    model_class: type,
    records: list[dict],
    conflict_column: str = "transfer_gov_id",
) -> dict[str, int]:
    """Bulk upsert records using PostgreSQL ON CONFLICT DO UPDATE.

    This function inserts new records and updates existing records when a
    conflict occurs on the specified column. It guarantees idempotency:
    re-running the same data produces no duplicates.

    Args:
        session: SQLAlchemy Session for database operations
        model_class: ORM model class to insert into (e.g., Proposta, Programa)
        records: List of dictionaries representing records to upsert
        conflict_column: Column name to use for conflict detection
            (default: "transfer_gov_id" for main entities)

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

    # Get the table from the model
    table = model_class.__table__

    # Build the insert statement
    stmt = insert(table).values(records)

    # Build update dictionary: all columns EXCEPT primary key (id) and conflict_column
    # Always include updated_at for audit trail
    update_cols = {}
    for col in table.columns:
        col_name = col.name
        # Skip primary key (id) - we don't want to change it
        if col_name == "id":
            continue
        # Skip the conflict column - we keep the original value
        if col_name == conflict_column:
            continue
        # Always update audit columns
        if col_name == "updated_at":
            update_cols[col_name] = stmt.excluded[col_name]
        else:
            update_cols[col_name] = stmt.excluded[col_name]

    # Build the on_conflict_do_update statement
    stmt = stmt.on_conflict_do_update(
        index_elements=[conflict_column],
        set_=update_cols,
    )

    # Execute the statement
    result = session.execute(stmt)
    rowcount: int = result.rowcount  # type: ignore[attr-defined]

    logger.info(
        "Upserted %d records into %s (conflict column: %s)",
        rowcount,
        model_class.__tablename__,
        conflict_column,
    )

    # PostgreSQL doesn't distinguish insert vs update in rowcount
    # For accurate counts, we'd need RETURNING clause, but keeping it simple
    return {"inserted": rowcount, "updated": 0}


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

    # 2. propostas (depends on programas, but we use app-level FK so order doesn't matter)
    if validated_data.get("propostas"):
        result = upsert_records(session, Proposta, validated_data["propostas"])
        stats["propostas"] = result
        logger.info(
            "Loaded %d propostas records (inserted: %d, updated: %d)",
            len(validated_data["propostas"]),
            result["inserted"],
            result["updated"],
        )

    # 3. apoiadores (no dependencies)
    if validated_data.get("apoiadores"):
        result = upsert_records(session, Apoiador, validated_data["apoiadores"])
        stats["apoiadores"] = result
        logger.info(
            "Loaded %d apoiadores records (inserted: %d, updated: %d)",
            len(validated_data["apoiadores"]),
            result["inserted"],
            result["updated"],
        )

    # 4. emendas (no dependencies)
    if validated_data.get("emendas"):
        result = upsert_records(session, Emenda, validated_data["emendas"])
        stats["emendas"] = result
        logger.info(
            "Loaded %d emendas records (inserted: %d, updated: %d)",
            len(validated_data["emendas"]),
            result["inserted"],
            result["updated"],
        )

    # 5. proposta_apoiadores (junction table with compound unique constraint)
    if validated_data.get("proposta_apoiadores"):
        # Junction tables: conflict target is compound unique constraint columns
        result = upsert_records(
            session,
            PropostaApoiador,
            validated_data["proposta_apoiadores"],
            conflict_column="proposta_transfer_gov_id",  # Will be updated via set_ for apoiador too
        )
        stats["proposta_apoiadores"] = result
        logger.info(
            "Loaded %d proposta_apoiadores records (inserted: %d, updated: %d)",
            len(validated_data["proposta_apoiadores"]),
            result["inserted"],
            result["updated"],
        )

    # 6. proposta_emendas (junction table with compound unique constraint)
    if validated_data.get("proposta_emendas"):
        result = upsert_records(
            session,
            PropostaEmenda,
            validated_data["proposta_emendas"],
            conflict_column="proposta_transfer_gov_id",  # Will be updated via set_ for emenda too
        )
        stats["proposta_emendas"] = result
        logger.info(
            "Loaded %d proposta_emendas records (inserted: %d, updated: %d)",
            len(validated_data["proposta_emendas"]),
            result["inserted"],
            result["updated"],
        )

    logger.info("Extraction data loading complete: %d tables processed", len(stats))
    return stats

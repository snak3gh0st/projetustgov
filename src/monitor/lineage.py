"""Data lineage tracking for audit trail and compliance.

This module tracks the provenance of each record:
- Source file origin
- Extraction timestamp
- Pipeline version
- Record hash for integrity verification

Functions:
- get_pipeline_version: Retrieve current package version
- record_lineage: Store lineage info for a batch of records
- query_lineage: Find all records from a specific source file
- query_lineage_by_entity: Find all extractions for a specific entity
"""

import hashlib
import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.loader.database import get_session
from src.loader.db_models import DataLineage
from src.monitor.logger import logger


@lru_cache(maxsize=1)
def get_pipeline_version() -> str:
    """Get the current projetus package version.

    Returns:
        Version string from pyproject.toml or 'dev' if not found
    """
    # Try to read from pyproject.toml
    pyproject_path = Path(__file__).parent.parent.parent / "pyproject.toml"

    if pyproject_path.exists():
        import tomli

        with open(pyproject_path, "rb") as f:
            pyproject = tomli.load(f)
            version = pyproject.get("project", {}).get("version", "dev")
            if version:
                return version

    return "dev"


def compute_record_hash(record: dict) -> str:
    """Compute SHA256 hash of a record for integrity verification.

    Args:
        record: Dictionary representation of the record

    Returns:
        Hexadecimal string of the SHA256 hash
    """
    # Sort keys for deterministic hashing
    sorted_record = json.dumps(record, sort_keys=True, default=str)
    return hashlib.sha256(sorted_record.encode()).hexdigest()


def record_lineage(
    records: list[dict],
    source_file: str,
    extraction_date: datetime,
    entity_type: Optional[str] = None,
) -> int:
    """Store lineage information for a batch of records.

    Args:
        records: List of record dictionaries to track
        source_file: Path or name of the source file
        extraction_date: When the extraction was performed
        entity_type: Optional entity type override (derived from records if not provided)

    Returns:
        Number of lineage records inserted
    """
    if not records:
        logger.debug("No records to record lineage for")
        return 0

    pipeline_version = get_pipeline_version()
    logger.debug(
        f"Recording lineage for {len(records)} records from {source_file} "
        f"(version: {pipeline_version})"
    )

    # Derive entity_type from records if not provided
    if entity_type is None:
        if records and "_entity_type" in records[0]:
            entity_type = records[0]["_entity_type"]
        else:
            # Extract from source_file name
            entity_type = Path(source_file).stem.split("_")[0].lower()

    lineage_records = []
    entity_id_field = None

    # Determine entity_id field based on entity_type
    if entity_type == "proposta":
        entity_id_field = "transfer_gov_id"
    elif entity_type == "apoiador":
        entity_id_field = "transfer_gov_id"
    elif entity_type == "emenda":
        entity_id_field = "transfer_gov_id"
    elif entity_type == "programa":
        entity_id_field = "transfer_gov_id"
    else:
        # Default to id or transfer_gov_id
        entity_id_field = "transfer_gov_id" if "transfer_gov_id" in records[0] else "id"

    for record in records:
        # Extract entity_id
        entity_id = record.get(entity_id_field) or record.get("id")
        if not entity_id:
            logger.warning(
                f"Record missing entity_id field ({entity_id_field}), skipping"
            )
            continue

        # Compute record hash for integrity
        record_hash = compute_record_hash(record)

        lineage_record = DataLineage(
            entity_type=entity_type,
            entity_id=str(entity_id),
            source_file=source_file,
            extraction_date=extraction_date,
            pipeline_version=pipeline_version,
            record_hash=record_hash,
        )
        lineage_records.append(lineage_record)

    # Bulk insert
    with get_session() as session:
        session.add_all(lineage_records)
        session.commit()

    inserted_count = len(lineage_records)
    logger.info(f"Recorded lineage for {inserted_count} {entity_type} records")

    return inserted_count


def query_lineage(source_file: str) -> list[dict]:
    """Query all lineage records for a specific source file.

    Args:
        source_file: Path or name of the source file

    Returns:
        List of dictionaries with lineage information
    """
    with get_session() as session:
        results = (
            session.execute(
                select(DataLineage).where(DataLineage.source_file == source_file)
            )
            .scalars()
            .all()
        )

        return [
            {
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "source_file": r.source_file,
                "extraction_date": r.extraction_date.isoformat()
                if r.extraction_date
                else None,
                "pipeline_version": r.pipeline_version,
                "record_hash": r.record_hash,
            }
            for r in results
        ]


def query_lineage_by_entity(entity_type: str, entity_id: str) -> list[dict]:
    """Query all lineage records for a specific entity.

    Useful for audit trails and tracing data provenance.

    Args:
        entity_type: Type of entity ('proposta', 'apoiador', etc.)
        entity_id: The entity's identifier

    Returns:
        List of dictionaries with lineage information for each extraction
    """
    with get_session() as session:
        results = (
            session.execute(
                select(DataLineage).where(
                    DataLineage.entity_type == entity_type,
                    DataLineage.entity_id == entity_id,
                )
            )
            .scalars()
            .all()
        )

        return [
            {
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "source_file": r.source_file,
                "extraction_date": r.extraction_date.isoformat()
                if r.extraction_date
                else None,
                "pipeline_version": r.pipeline_version,
                "record_hash": r.record_hash,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ]


def get_entity_lineage_summary(entity_type: str, entity_id: str) -> dict:
    """Get a summary of all extractions for an entity.

    Args:
        entity_type: Type of entity
        entity_id: The entity's identifier

    Returns:
        Summary dictionary with extraction history
    """
    lineage_records = query_lineage_by_entity(entity_type, entity_id)

    if not lineage_records:
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "extraction_count": 0,
            "first_extraction": None,
            "last_extraction": None,
            "pipeline_versions": [],
            "source_files": [],
        }

    extraction_dates = [
        datetime.fromisoformat(r["extraction_date"])
        for r in lineage_records
        if r["extraction_date"]
    ]

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "extraction_count": len(lineage_records),
        "first_extraction": min(extraction_dates).isoformat()
        if extraction_dates
        else None,
        "last_extraction": max(extraction_dates).isoformat()
        if extraction_dates
        else None,
        "pipeline_versions": list(
            set(r["pipeline_version"] for r in lineage_records if r["pipeline_version"])
        ),
        "source_files": list(set(r["source_file"] for r in lineage_records)),
    }

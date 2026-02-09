"""Mark existing clients in the proponentes table.

This script reads a list of CNPJs (existing clients) and marks them in the database.
The CNPJ list should be provided as a text file with one CNPJ per line.

Usage:
    python mark_existing_clients.py <cnpj_list_file>

Example:
    python mark_existing_clients.py clientes_existentes.txt

CNPJ Format:
    - Can be formatted (XX.XXX.XXX/XXXX-XX) or unformatted (14 digits)
    - Will be automatically normalized for matching
"""

import sys
from pathlib import Path

from loguru import logger
from sqlalchemy import text

from src.loader.database import get_engine


def normalize_cnpj(cnpj: str) -> str:
    """Normalize CNPJ by removing all non-digit characters."""
    return "".join(c for c in str(cnpj) if c.isdigit())


def load_cnpj_list(file_path: Path) -> list[str]:
    """Load and normalize CNPJs from a text file.

    Args:
        file_path: Path to text file with CNPJs (one per line)

    Returns:
        List of normalized CNPJs (14 digits)
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    cnpjs = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):  # Skip empty lines and comments
                continue

            normalized = normalize_cnpj(line)
            if len(normalized) == 14:
                cnpjs.append(normalized)
            else:
                logger.warning(f"Invalid CNPJ skipped: {line} (normalized: {normalized})")

    return cnpjs


def mark_existing_clients(cnpj_list: list[str]) -> dict:
    """Mark proponentes as existing clients.

    Args:
        cnpj_list: List of normalized CNPJs (14 digits)

    Returns:
        Dictionary with statistics
    """
    engine = get_engine()

    with engine.connect() as conn:
        # First, reset all to false
        conn.execute(text("UPDATE proponentes SET is_existing_client = false"))
        logger.info("Reset all proponentes to is_existing_client = false")

        # Mark existing clients as true
        if cnpj_list:
            # Use parameterized query for safety
            placeholders = ", ".join([f":cnpj_{i}" for i in range(len(cnpj_list))])
            params = {f"cnpj_{i}": cnpj for i, cnpj in enumerate(cnpj_list)}

            query = text(f"""
                UPDATE proponentes
                SET is_existing_client = true
                WHERE cnpj IN ({placeholders})
            """)

            result = conn.execute(query, params)
            marked_count = result.rowcount

            logger.info(f"Marked {marked_count} proponentes as existing clients")

            # Verify
            result = conn.execute(
                text("SELECT COUNT(*) FROM proponentes WHERE is_existing_client = true")
            )
            verified_count = result.scalar()

            # Check for CNPJs not found
            result = conn.execute(
                text(f"""
                    SELECT cnpj FROM (VALUES {', '.join([f"('{cnpj}')" for cnpj in cnpj_list])}) AS input(cnpj)
                    WHERE cnpj NOT IN (SELECT cnpj FROM proponentes)
                """)
            )
            not_found = [row[0] for row in result]

        conn.commit()

    return {
        "total_cnpjs_provided": len(cnpj_list),
        "marked_count": marked_count,
        "verified_count": verified_count,
        "not_found_count": len(not_found),
        "not_found_cnpjs": not_found[:10],  # First 10
    }


def main():
    """Main execution function."""
    if len(sys.argv) != 2:
        print("Usage: python mark_existing_clients.py <cnpj_list_file>")
        print()
        print("Example:")
        print("  python mark_existing_clients.py clientes_existentes.txt")
        print()
        print("File format: One CNPJ per line (formatted or unformatted)")
        sys.exit(1)

    file_path = Path(sys.argv[1])

    logger.info(f"Loading CNPJ list from: {file_path}")
    cnpj_list = load_cnpj_list(file_path)
    logger.info(f"Loaded {len(cnpj_list)} CNPJs from file")

    if not cnpj_list:
        logger.error("No valid CNPJs found in file")
        sys.exit(1)

    logger.info("Marking existing clients in database...")
    stats = mark_existing_clients(cnpj_list)

    logger.info("=" * 80)
    logger.info("SUMMARY")
    logger.info("=" * 80)
    logger.info(f"CNPJs provided: {stats['total_cnpjs_provided']}")
    logger.info(f"Proponentes marked: {stats['marked_count']}")
    logger.info(f"Verified in database: {stats['verified_count']}")
    logger.info(f"CNPJs not found: {stats['not_found_count']}")

    if stats["not_found_cnpjs"]:
        logger.warning("Sample of CNPJs not found in database:")
        for cnpj in stats["not_found_cnpjs"]:
            logger.warning(f"  - {cnpj}")

    logger.info("=" * 80)
    logger.info("EXISTING CLIENTS MARKED SUCCESSFULLY!")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()

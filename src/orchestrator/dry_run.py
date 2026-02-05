"""Dry-run mode for safe testing of parser changes without database writes."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from datetime import datetime

from loguru import logger

from src.parser.file_parser import parse_file
from src.transformer.validator import validate_dataframe


@dataclass
class DryRunResult:
    """Result of a dry-run execution."""

    file_path: str
    entities_found: dict[str, int]
    validation_errors: list[str]
    relationships_found: list[str]
    warnings: list[str]
    run_timestamp: str = None

    def __post_init__(self):
        if self.run_timestamp is None:
            self.run_timestamp = datetime.now().isoformat()


def infer_entity_type(filename: str) -> Optional[str]:
    """Infer entity type from filename.

    Args:
        filename: The filename to analyze

    Returns:
        Entity type string or None if cannot determine
    """
    name = filename.lower()

    if "proposta" in name:
        return "propostas"
    elif "apoiador" in name:
        return "apoiadores"
    elif "emenda" in name:
        return "emendas"
    elif "programa" in name:
        return "programas"
    else:
        return None


def find_latest_data_directory(raw_data_dir: Path) -> Path:
    """Find the latest dated subdirectory in data/raw.

    Args:
        raw_data_dir: The base data/raw directory

    Returns:
        Path to the latest dated subdirectory, or the base directory if none found
    """
    if not raw_data_dir.exists():
        return raw_data_dir

    # Look for dated subdirectories (format: YYYY-MM-DD)
    dated_dirs = []
    for item in raw_data_dir.iterdir():
        if item.is_dir():
            try:
                # Try to parse as date
                datetime.strptime(item.name, "%Y-%m-%d")
                dated_dirs.append(item)
            except ValueError:
                continue

    if dated_dirs:
        # Return the most recent dated directory
        latest_dir = max(dated_dirs, key=lambda d: d.stat().st_mtime)
        logger.debug(f"Found latest data directory: {latest_dir}")
        return latest_dir

    return raw_data_dir


def run_dry_run(
    raw_data_dir: Path = Path("data/raw"), config_path: Optional[Path] = None
) -> DryRunResult:
    """Run extraction pipeline without writing to database.

    This function parses and validates all files in the data directory
    without writing anything to the database. It's useful for testing
    parser changes safely.

    Args:
        raw_data_dir: Path to directory containing files to validate
        config_path: Optional path to config file (not used in dry-run but kept for API)

    Returns:
        DryRunResult with all findings (entities, validation errors, relationships, warnings)
    """
    logger.info("Starting dry-run execution")

    result = DryRunResult(
        file_path=str(raw_data_dir),
        entities_found={},
        validation_errors=[],
        relationships_found=[],
        warnings=[],
        run_timestamp=datetime.now().isoformat(),
    )

    # Find the actual data directory (might be dated subdirectory)
    actual_data_dir = find_latest_data_directory(raw_data_dir)

    if not actual_data_dir.exists():
        result.warnings.append(f"Data directory not found: {actual_data_dir}")
        logger.warning(f"Data directory not found: {actual_data_dir}")
        return result

    # List all files (Excel and CSV)
    files = []
    for pattern in ["*.xlsx", "*.csv"]:
        files.extend(actual_data_dir.glob(pattern))

    if not files:
        result.warnings.append(f"No files found in {actual_data_dir}")
        logger.warning(f"No files found in {actual_data_dir}")
        return result

    logger.info(f"Found {len(files)} files to validate")

    # Parse and validate each file
    for file_path in sorted(files):
        file_name = file_path.name
        entity_type = infer_entity_type(file_name)

        if entity_type is None:
            result.warnings.append(f"Could not determine entity type for: {file_name}")
            logger.warning(f"Could not determine entity type for: {file_name}")
            continue

        logger.info(f"Processing {file_name} as {entity_type}")

        try:
            # Parse file
            df = parse_file(str(file_path), entity_type)
            result.entities_found[entity_type] = len(df)
            logger.info(f"Parsed {file_name}: {len(df)} rows")

            # Validate data
            valid_records, errors = validate_dataframe(df, entity_type)

            if errors:
                for error in errors:
                    result.validation_errors.append(
                        f"{file_name}: Row validation error - {error['errors']}"
                    )
                    logger.debug(f"Validation error in {file_name}: {error['errors']}")

            logger.info(
                f"Validated {file_name}: {len(valid_records)} valid, "
                f"{len(errors)} errors out of {len(df)} rows"
            )

        except FileNotFoundError as e:
            result.validation_errors.append(f"{file_name}: File not found - {e}")
            logger.error(f"File not found: {file_path}")

        except Exception as e:
            result.validation_errors.append(f"{file_name}: Parse error - {e}")
            logger.error(f"Error processing {file_name}: {e}")

    # Check for relationships between entities
    result.relationships_found = _detect_relationships(result.entities_found)

    logger.info(
        f"Dry-run complete: {len(result.entities_found)} entities, "
        f"{len(result.validation_errors)} errors, {len(result.warnings)} warnings"
    )

    return result


def _detect_relationships(entities_found: dict[str, int]) -> list[str]:
    """Detect relationships between found entities.

    Args:
        entities_found: Dictionary of entity types and their record counts

    Returns:
        List of relationship descriptions
    """
    relationships = []

    if "propostas" in entities_found and "apoiadores" in entities_found:
        relationships.append("propostas ↔ apoiadores (proposta_id)")

    if "propostas" in entities_found and "emendas" in entities_found:
        relationships.append("propostas ↔ emendas (proposta_id)")

    if "propostas" in entities_found and "programas" in entities_found:
        relationships.append("propostas ↔ programas (programa_id)")

    return relationships


def print_dry_run_report(result: DryRunResult):
    """Pretty print dry run results to console.

    Args:
        result: The DryRunResult from run_dry_run()
    """
    print("\n" + "=" * 60)
    print(" 🔍 DRY RUN REPORT")
    print("=" * 60)
    print(f"Timestamp: {result.run_timestamp}")
    print(f"Data directory: {result.file_path}")

    # Entities found
    print("\n📊 Entities Found:")
    if result.entities_found:
        for entity, count in sorted(result.entities_found.items()):
            print(f"   {entity}: {count} records")
    else:
        print("   No entities found")

    # Relationships detected
    if result.relationships_found:
        print("\n🔗 Relationships Detected:")
        for rel in result.relationships_found:
            print(f"   • {rel}")

    # Validation errors
    if result.validation_errors:
        print("\n⚠️  Validation Errors:")
        for error in result.validation_errors:
            print(f"   • {error}")
    else:
        print("\n✅ No validation errors")

    # Warnings
    if result.warnings:
        print("\n💡 Warnings:")
        for warning in result.warnings:
            print(f"   • {warning}")

    # Summary
    print("\n" + "=" * 60)
    total_entities = sum(result.entities_found.values())
    total_errors = len(result.validation_errors)
    total_warnings = len(result.warnings)

    print(
        f" Summary: {total_entities} total records, "
        f"{total_errors} errors, {total_warnings} warnings"
    )
    print("=" * 60 + "\n")

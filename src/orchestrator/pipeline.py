"""Full ETL pipeline orchestrator for PROJETUS.

This module orchestrates the complete extraction, transformation, and loading
process: parsing files, validating data, and loading into the database.
"""

import hashlib
import time
from datetime import date
from pathlib import Path
from typing import Optional

import polars as pl
from loguru import logger

from src.config.loader import get_config
from src.loader.database import get_engine, create_session_factory, init_db
from src.loader.extraction_log import create_extraction_log
from src.loader.upsert import load_extraction_data, extract_proponentes_from_propostas, normalize_cnpj
from src.parser.file_parser import parse_file
from src.parser.schemas import _normalize_column_name
from src.transformer.validator import validate_dataframe


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
                date.fromisoformat(item.name)
                dated_dirs.append(item)
            except ValueError:
                continue

    if dated_dirs:
        # Return the most recent dated directory
        latest_dir = max(dated_dirs, key=lambda d: d.stat().st_mtime)
        logger.debug(f"Found latest data directory: {latest_dir}")
        return latest_dir

    return raw_data_dir


def _col(df: pl.DataFrame, name: str) -> Optional[str]:
    """Find column in DataFrame by normalized name, return actual name or None."""
    for col in df.columns:
        if _normalize_column_name(col) == _normalize_column_name(name):
            return col
    return None


def extract_relationships(
    raw_df: pl.DataFrame,
    validated_data: dict[str, list[dict]],
    programa_links: dict[str, str],
) -> None:
    """Extract entities and relationships from the apoiadores/emendas CSV.

    The CSV is a relationship table where each row links a proposta to an
    emenda, apoiador, and programa. This function extracts:
    - Unique apoiadores (deduplicated by nome_parlamentar)
    - Unique emendas (deduplicated by numero_emenda)
    - Junction records for proposta_apoiadores and proposta_emendas
    - Programa links (proposta_transfer_gov_id → programa_transfer_gov_id)

    Results are appended directly into validated_data.
    """
    # Resolve actual column names
    proposta_col = _col(raw_df, "id_cnpj_programa_emenda_apoiadores_emendas")
    emenda_num_col = _col(raw_df, "numero_emenda_apoiadores_emendas")
    parlamentar_col = _col(raw_df, "nome_parlamentar_apoiadores_emendas")
    programa_col = _col(raw_df, "id_programa")
    tipo_col = _col(raw_df, "indicacao_apoiadores_emendas")
    orgao_col = _col(raw_df, "nome_proponente_apoiadores_emendas")
    valor_col = _col(raw_df, "valor_repasse_proposta_apoiadores_emendas")

    if not proposta_col:
        logger.warning("Could not find proposta ID column in relationship CSV")
        return

    seen_apoiadores: dict[str, dict] = {}
    seen_emendas: dict[str, dict] = {}
    junction_apoiadores: set[tuple[str, str]] = set()
    junction_emendas: set[tuple[str, str]] = set()

    for row in raw_df.iter_rows(named=True):
        proposta_id = str(row.get(proposta_col, "")).strip()
        if not proposta_id:
            continue

        # Extract programa link
        if programa_col:
            prog_id = str(row.get(programa_col, "")).strip()
            if prog_id:
                programa_links[proposta_id] = prog_id

        # Extract apoiador
        if parlamentar_col:
            nome = str(row.get(parlamentar_col, "")).strip()
            if nome:
                # Use hash of nome as transfer_gov_id for apoiador
                apoiador_id = hashlib.sha256(nome.encode()).hexdigest()[:16]
                if apoiador_id not in seen_apoiadores:
                    seen_apoiadores[apoiador_id] = {
                        "transfer_gov_id": apoiador_id,
                        "nome": nome,
                        "tipo": str(row.get(tipo_col, "")).strip() if tipo_col else None,
                        "orgao": str(row.get(orgao_col, "")).strip() if orgao_col else None,
                    }
                junction_apoiadores.add((proposta_id, apoiador_id))

        # Extract emenda
        if emenda_num_col:
            numero = str(row.get(emenda_num_col, "")).strip()
            if numero:
                emenda_id = numero  # numero_emenda is already unique
                if emenda_id not in seen_emendas:
                    autor = str(row.get(parlamentar_col, "")).strip() if parlamentar_col else None
                    valor_raw = row.get(valor_col) if valor_col else None
                    valor = None
                    if valor_raw is not None:
                        try:
                            valor = float(valor_raw)
                        except (ValueError, TypeError):
                            pass
                    tipo = str(row.get(tipo_col, "")).strip() if tipo_col else None
                    seen_emendas[emenda_id] = {
                        "transfer_gov_id": emenda_id,
                        "numero": numero,
                        "autor": autor,
                        "valor": valor,
                        "tipo": tipo,
                        "ano": None,
                    }
                junction_emendas.add((proposta_id, emenda_id))

    # Append to validated_data
    validated_data["apoiadores"].extend(seen_apoiadores.values())
    validated_data["emendas"].extend(seen_emendas.values())

    for proposta_id, apoiador_id in junction_apoiadores:
        validated_data["proposta_apoiadores"].append({
            "proposta_transfer_gov_id": proposta_id,
            "apoiador_transfer_gov_id": apoiador_id,
        })

    for proposta_id, emenda_id in junction_emendas:
        validated_data["proposta_emendas"].append({
            "proposta_transfer_gov_id": proposta_id,
            "emenda_transfer_gov_id": emenda_id,
        })

    logger.info(
        f"Extracted relationships: {len(seen_apoiadores)} apoiadores, "
        f"{len(seen_emendas)} emendas, {len(junction_apoiadores)} proposta_apoiadores, "
        f"{len(junction_emendas)} proposta_emendas, {len(programa_links)} programa links"
    )


def run_pipeline(config_path: Optional[str] = None) -> None:
    """Execute the full ETL pipeline.

    This function:
    1. Finds files in data/raw directory
    2. Parses each file (Excel/CSV)
    3. Validates data with Pydantic
    4. Loads validated data into database
    5. Creates extraction log entry

    Args:
        config_path: Path to configuration file (optional, uses default if not provided)
    """
    start_time = time.time()
    logger.info("Starting PROJETUS ETL pipeline")

    # Get config
    config = get_config(config_path)
    # Use default data/raw if not in config
    raw_data_dir = Path("data/raw")

    # Create directory if it doesn't exist
    raw_data_dir.mkdir(parents=True, exist_ok=True)

    # Find latest data directory
    data_dir = find_latest_data_directory(raw_data_dir)

    if not data_dir.exists():
        logger.warning(f"Data directory not found: {data_dir}, attempting to run crawler first")
        # Try to run crawler to download files
        try:
            from src.crawler.downloader import run_crawler
            logger.info("Running crawler to download files...")
            run_crawler(extraction_date=date.today(), headless=True)
            # Re-find data directory after crawler
            data_dir = find_latest_data_directory(raw_data_dir)
        except Exception as e:
            logger.error(f"Failed to run crawler: {e}")
            raise FileNotFoundError(f"Data directory not found and crawler failed: {data_dir}")

    # List all files (Excel and CSV)
    files = []
    for pattern in ["*.xlsx", "*.csv"]:
        files.extend(data_dir.glob(pattern))

    if not files:
        logger.warning(f"No files found in {data_dir}, attempting to run crawler first")
        # Try to download files from repository
        try:
            from src.crawler.repository_downloader import run_repository_download
            logger.info("Downloading files from repository...")
            download_results = run_repository_download(extraction_date=date.today())
            logger.info(f"Repository download completed: {download_results}")
            # Re-find data directory after crawler
            data_dir = find_latest_data_directory(raw_data_dir)
            # Re-list files
            files = []
            for pattern in ["*.xlsx", "*.csv"]:
                files.extend(data_dir.glob(pattern))
        except Exception as e:
            logger.error(f"Failed to download from repository: {e}")
            raise FileNotFoundError(f"No files found in {data_dir} and repository download failed: {e}")

    if not files:
        logger.error(f"No files found in {data_dir} after crawler")
        raise FileNotFoundError(f"No files found in {data_dir}")

    logger.info(f"Found {len(files)} files to process")

    # Initialize database
    engine = get_engine()
    init_db(engine)
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        # Parse and validate all files
        validated_data: dict[str, list[dict]] = {
            "programas": [],
            "propostas": [],
            "proponentes": [],
            "apoiadores": [],
            "emendas": [],
            "proposta_apoiadores": [],
            "proposta_emendas": [],
        }

        extraction_date = date.today()
        validation_errors = []
        programa_links: dict[str, str] = {}  # proposta_id → programa_id

        for file_path in sorted(files):
            file_name = file_path.name
            entity_type = infer_entity_type(file_name)

            if entity_type is None:
                logger.warning(f"Could not determine entity type for: {file_name}")
                continue

            logger.info(f"Processing {file_name} as {entity_type}")

            try:
                # Parse file
                df = parse_file(str(file_path), entity_type)
                logger.info(f"Parsed {file_name}: {len(df)} rows")

                if entity_type in ("apoiadores", "emendas"):
                    # Relationship CSV: extract entities + junctions from raw data
                    extract_relationships(df, validated_data, programa_links)
                    logger.info(
                        f"Extracted relationships from {file_name}"
                    )
                else:
                    # Standard entity: validate and collect
                    valid_records, errors = validate_dataframe(df, entity_type)

                    if errors:
                        for error in errors:
                            validation_errors.append(
                                f"{file_name}: {error.get('errors', 'Validation error')}"
                            )
                        logger.warning(
                            f"Validation errors in {file_name}: {len(errors)} errors"
                        )

                    validated_data[entity_type].extend(valid_records)
                    logger.info(
                        f"Validated {file_name}: {len(valid_records)} valid records"
                    )

                    # Extract proponentes from propostas
                    if entity_type == "propostas" and len(valid_records) > 0:
                        proponentes = extract_proponentes_from_propostas(valid_records, df)
                        validated_data["proponentes"].extend(proponentes)
                        logger.info(
                            f"Extracted {len(proponentes)} proponentes from {file_name}"
                        )

                        # Also add proponente_cnpj to each proposta record
                        cnpj_col = _col(df, "identif_proponente")
                        if cnpj_col:
                            proposta_id_col = _col(df, "id_proposta")
                            # Create CNPJ lookup from raw df
                            cnpj_lookup = {}
                            for row in df.iter_rows(named=True):
                                prop_id = str(row.get(proposta_id_col, "")).strip()
                                cnpj_raw = row.get(cnpj_col, "")
                                cnpj = normalize_cnpj(cnpj_raw)
                                if prop_id and cnpj:
                                    cnpj_lookup[prop_id] = cnpj

                            # Add proponente_cnpj to validated records
                            for record in valid_records:
                                prop_id = record.get("transfer_gov_id")
                                if prop_id and prop_id in cnpj_lookup:
                                    record["proponente_cnpj"] = cnpj_lookup[prop_id]

            except Exception as e:
                error_msg = f"Error processing {file_name}: {e}"
                validation_errors.append(error_msg)
                logger.error(error_msg)
                # Continue processing other files

        # Apply programa_id links to propostas
        if programa_links and validated_data["propostas"]:
            linked = 0
            for proposta in validated_data["propostas"]:
                prog_id = programa_links.get(proposta.get("transfer_gov_id"))
                if prog_id and not proposta.get("programa_id"):
                    proposta["programa_id"] = prog_id
                    linked += 1
            logger.info(f"Linked {linked} propostas to programa_id from relationship data")

        # Determine status based on results
        total_valid = sum(len(records) for records in validated_data.values())
        has_errors = len(validation_errors) > 0

        if total_valid == 0:
            status = "failed"
            error_message = "No valid records found in any file"
        elif has_errors:
            status = "partial"
            error_message = "; ".join(validation_errors[:5])  # First 5 errors
        else:
            status = "success"
            error_message = None

        # Load data into database
        stats = {}
        if total_valid > 0:
            try:
                stats = load_extraction_data(session, validated_data, extraction_date)
                logger.info(f"Loaded data: {stats}")
            except Exception as e:
                session.rollback()
                logger.error(f"Failed to load data: {e}")
                raise

        # Create extraction log
        duration = time.time() - start_time
        create_extraction_log(
            session,
            status=status,
            stats=stats if stats else None,
            error=error_message,
            duration=duration,
        )

        # Commit transaction
        session.commit()
        logger.info(
            f"Pipeline completed: status={status}, records={total_valid}, "
            f"duration={duration:.2f}s"
        )

    except Exception as e:
        session.rollback()
        logger.error(f"Pipeline failed: {e}")
        # Create failed log entry
        duration = time.time() - start_time
        try:
            create_extraction_log(
                session,
                status="failed",
                error=str(e),
                duration=duration,
            )
            session.commit()
        except Exception:
            session.rollback()
        raise
    finally:
        session.close()

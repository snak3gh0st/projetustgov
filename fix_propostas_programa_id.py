"""Fix propostas.programa_id to use COD_PROGRAMA instead of ID_PROGRAMA.

This script:
1. Loads ID_PROGRAMA → COD_PROGRAMA mapping from programas file
2. Loads ID_PROGRAMA → ID_PROPOSTA mapping from programa_proposta file
3. Updates propostas.programa_id with COD_PROGRAMA values
"""

from pathlib import Path
import pandas as pd
import polars as pl
from sqlalchemy import text
from loguru import logger

from src.loader.database import get_engine


def main():
    """Main execution function."""
    logger.info("Starting propostas programa_id fix...")

    # Step 1: Load ID_PROGRAMA → COD_PROGRAMA mapping
    logger.info("Loading programa mapping...")
    programas_file = Path("data/raw/2026-02-06/sample_programas.csv")

    df_programas = pl.read_csv(
        str(programas_file),
        separator=";",
        dtypes={"ID_PROGRAMA": str, "COD_PROGRAMA": str}
    )

    # Create mapping dict: ID_PROGRAMA → COD_PROGRAMA
    id_to_cod_map = dict(
        zip(df_programas["ID_PROGRAMA"], df_programas["COD_PROGRAMA"])
    )
    logger.info(f"Loaded {len(id_to_cod_map)} programa mappings")
    logger.info(f"Sample mappings: {list(id_to_cod_map.items())[:5]}")

    # Step 2: Load programa_proposta mapping
    logger.info("Loading programa_proposta mapping...")
    mapping_file = Path("data/raw/2026-02-06/sample_programa_proposta.csv")

    df_mapping = pl.read_csv(
        str(mapping_file),
        separator=";",
        dtypes={"ID_PROGRAMA": str, "ID_PROPOSTA": str}
    )

    logger.info(f"Loaded {len(df_mapping)} proposta-programa mappings")

    # Step 3: Create proposta → COD_PROGRAMA mapping
    logger.info("Creating proposta → COD_PROGRAMA mapping...")

    # Create a Polars DataFrame from the mapping dict
    df_id_cod_map = pl.DataFrame({
        "ID_PROGRAMA": list(id_to_cod_map.keys()),
        "COD_PROGRAMA": list(id_to_cod_map.values())
    })

    # Join to get COD_PROGRAMA
    df_mapping = df_mapping.join(
        df_id_cod_map,
        on="ID_PROGRAMA",
        how="left"
    )

    # Check how many were successfully mapped
    mapped_count = df_mapping.filter(pl.col("COD_PROGRAMA").is_not_null()).shape[0]
    total_count = df_mapping.shape[0]
    logger.info(f"Successfully mapped {mapped_count}/{total_count} propostas")

    # Filter only successfully mapped ones
    df_mapping = df_mapping.filter(pl.col("COD_PROGRAMA").is_not_null())

    # Step 4: Update propostas in database
    logger.info("Updating propostas.programa_id in database...")
    engine = get_engine()

    updates = df_mapping.select(["ID_PROPOSTA", "COD_PROGRAMA"]).to_dicts()

    with engine.connect() as conn:
        # Use a single UPDATE with CASE statement for efficiency
        updated_count = 0
        batch_size = 1000

        for i in range(0, len(updates), batch_size):
            batch = updates[i:i+batch_size]

            # Build CASE statement
            case_parts = []
            proposta_ids = []
            for item in batch:
                proposta_id = item["ID_PROPOSTA"]
                cod_programa = item["COD_PROGRAMA"]
                case_parts.append(f"WHEN '{proposta_id}' THEN '{cod_programa}'")
                proposta_ids.append(f"'{proposta_id}'")

            case_statement = "\n".join(case_parts)
            proposta_list = ",".join(proposta_ids)

            query = text(f"""
                UPDATE propostas
                SET programa_id = CASE transfer_gov_id
                    {case_statement}
                END
                WHERE transfer_gov_id IN ({proposta_list})
            """)

            result = conn.execute(query)
            conn.commit()
            updated_count += result.rowcount

            if (i // batch_size + 1) % 10 == 0:
                logger.info(f"Updated {updated_count} propostas so far...")

        logger.info(f"Updated {updated_count} propostas")

    # Step 5: Verify the fix
    logger.info("Verifying the fix...")
    with engine.connect() as conn:
        # Check propostas with valid programa_id
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_propostas,
                COUNT(p.programa_id) as propostas_com_programa,
                COUNT(pr.transfer_gov_id) as propostas_com_programa_valido
            FROM propostas p
            LEFT JOIN programas pr ON p.programa_id = pr.transfer_gov_id
        """))
        row = result.fetchone()
        logger.info(f"Total propostas: {row[0]}")
        logger.info(f"Propostas com programa_id: {row[1]}")
        logger.info(f"Propostas com programa_id válido: {row[2]}")

        # Sample propostas with valid programa
        result = conn.execute(text("""
            SELECT
                p.transfer_gov_id as proposta_id,
                p.programa_id,
                SUBSTRING(p.programa_id FROM 6 FOR 4) as ano_programa,
                pr.nome as programa_nome
            FROM propostas p
            INNER JOIN programas pr ON p.programa_id = pr.transfer_gov_id
            LIMIT 10
        """))
        logger.info("Sample propostas with valid programa_id:")
        for row in result:
            logger.info(f"  Proposta: {row[0]}, Programa: {row[1]}, Ano: {row[2]}, Nome: {row[3][:50]}...")

    logger.info("Fix completed successfully!")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Check database population and wiring status.

Verifies:
- All tables exist and have data
- Relationships are properly linked
- Recent data is loaded
- Aggregations are computed
"""

import sys
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import text

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.config import get_settings
from src.loader.database import create_db_engine
from src.monitor.logger import logger


def check_table_counts(engine):
    """Check row counts for all tables."""
    logger.info("\n" + "="*60)
    logger.info("📊 TABLE ROW COUNTS")
    logger.info("="*60)

    tables = [
        "programas",
        "proponentes",
        "propostas",
        "apoiadores",
        "emendas",
        "proposta_apoiadores",
        "proposta_emendas",
        "convenios",
        "desembolsos",
        "historico_situacao",
        "extraction_logs",
    ]

    counts = {}
    with engine.connect() as conn:
        for table in tables:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
            count = result.scalar()
            counts[table] = count
            status = "✅" if count > 0 else "⚠️ EMPTY"
            logger.info(f"{status} {table:30} {count:>10,} rows")

    return counts


def check_relationships(engine):
    """Check if relationships are properly linked."""
    logger.info("\n" + "="*60)
    logger.info("🔗 RELATIONSHIP INTEGRITY")
    logger.info("="*60)

    checks = {
        "Propostas → Programas": """
            SELECT COUNT(*)
            FROM propostas p
            LEFT JOIN programas prog ON p.programa_id = prog.transfer_gov_id
            WHERE p.programa_id IS NOT NULL AND prog.id IS NULL
        """,
        "Propostas → Proponentes": """
            SELECT COUNT(*)
            FROM propostas p
            LEFT JOIN proponentes prop ON p.proponente_cnpj = prop.cnpj
            WHERE p.proponente_cnpj IS NOT NULL AND prop.id IS NULL
        """,
        "Convenios → Propostas": """
            SELECT COUNT(*)
            FROM convenios c
            LEFT JOIN propostas p ON c.proposta_id = p.transfer_gov_id
            WHERE c.proposta_id IS NOT NULL AND p.id IS NULL
        """,
        "Desembolsos → Convenios": """
            SELECT COUNT(*)
            FROM desembolsos d
            LEFT JOIN convenios c ON d.convenio_id = c.transfer_gov_id
            WHERE d.convenio_id IS NOT NULL AND c.id IS NULL
        """,
        "PropostaApoiadores → Propostas": """
            SELECT COUNT(*)
            FROM proposta_apoiadores pa
            LEFT JOIN propostas p ON pa.proposta_transfer_gov_id = p.transfer_gov_id
            WHERE p.id IS NULL
        """,
        "PropostaApoiadores → Apoiadores": """
            SELECT COUNT(*)
            FROM proposta_apoiadores pa
            LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
            WHERE a.id IS NULL
        """,
        "PropostaEmendas → Propostas": """
            SELECT COUNT(*)
            FROM proposta_emendas pe
            LEFT JOIN propostas p ON pe.proposta_transfer_gov_id = p.transfer_gov_id
            WHERE p.id IS NULL
        """,
        "PropostaEmendas → Emendas": """
            SELECT COUNT(*)
            FROM proposta_emendas pe
            LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
            WHERE e.id IS NULL
        """,
    }

    all_ok = True
    with engine.connect() as conn:
        for check_name, query in checks.items():
            result = conn.execute(text(query))
            orphans = result.scalar()
            if orphans == 0:
                logger.info(f"✅ {check_name:40} OK")
            else:
                logger.warning(f"⚠️  {check_name:40} {orphans} orphan records")
                all_ok = False

    return all_ok


def check_proponente_aggregations(engine):
    """Check if proponente aggregations are computed."""
    logger.info("\n" + "="*60)
    logger.info("🧮 PROPONENTE AGGREGATIONS")
    logger.info("="*60)

    with engine.connect() as conn:
        # Check OSCs
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total_oscs,
                COUNT(CASE WHEN total_propostas > 0 THEN 1 END) as oscs_com_propostas,
                COUNT(CASE WHEN total_emendas > 0 THEN 1 END) as oscs_com_emendas,
                COUNT(CASE WHEN total_convenios > 0 THEN 1 END) as oscs_com_convenios,
                COUNT(CASE WHEN is_existing_client = true THEN 1 END) as clientes_existentes,
                COUNT(CASE WHEN is_existing_client = false THEN 1 END) as novos_leads
            FROM proponentes
            WHERE is_osc = true
        """))
        row = result.fetchone()

        logger.info(f"Total OSCs: {row[0]:,}")
        logger.info(f"  └─ Com propostas: {row[1]:,}")
        logger.info(f"  └─ Com emendas: {row[2]:,}")
        logger.info(f"  └─ Com convênios: {row[3]:,}")
        logger.info(f"  └─ Clientes existentes: {row[4]:,}")
        logger.info(f"  └─ Novos leads: {row[5]:,}")

        # Check aggregation quality
        result = conn.execute(text("""
            SELECT
                COUNT(CASE WHEN total_propostas = 0 THEN 1 END) as zero_propostas,
                COUNT(CASE WHEN total_emendas = 0 THEN 1 END) as zero_emendas,
                COUNT(CASE WHEN valor_total_emendas IS NULL OR valor_total_emendas = 0 THEN 1 END) as zero_valor_emendas
            FROM proponentes
            WHERE is_osc = true
        """))
        row = result.fetchone()

        logger.info(f"\nQuality Check:")
        logger.info(f"  OSCs sem propostas: {row[0]:,}")
        logger.info(f"  OSCs sem emendas: {row[1]:,}")
        logger.info(f"  OSCs sem valor de emendas: {row[2]:,}")


def check_recent_extractions(engine):
    """Check recent extraction logs."""
    logger.info("\n" + "="*60)
    logger.info("📅 RECENT EXTRACTIONS")
    logger.info("="*60)

    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                run_date,
                status,
                total_records
            FROM extraction_logs
            ORDER BY run_date DESC
            LIMIT 5
        """))

        rows = result.fetchall()
        if not rows:
            logger.warning("⚠️  No extraction logs found")
            return False

        for row in rows:
            status_icon = "✅" if row[1] == "success" else "❌"
            total_records = row[2] if row[2] else 0
            logger.info(f"{status_icon} {row[0]} - {row[1]} - {total_records:,} records")

        # Check latest extraction date
        latest_datetime = rows[0][0]
        latest_date = latest_datetime.date() if latest_datetime else None
        days_ago = (date.today() - latest_date).days if latest_date else None

        if days_ago is not None:
            if days_ago == 0:
                logger.info(f"\n✅ Latest extraction: TODAY")
            elif days_ago == 1:
                logger.info(f"\n⚠️  Latest extraction: YESTERDAY")
            else:
                logger.info(f"\n⚠️  Latest extraction: {days_ago} days ago")

        return days_ago is not None and days_ago < 7


def check_sample_data(engine):
    """Check sample data quality."""
    logger.info("\n" + "="*60)
    logger.info("🔍 SAMPLE DATA QUALITY")
    logger.info("="*60)

    with engine.connect() as conn:
        # Sample proponente with full aggregations
        result = conn.execute(text("""
            SELECT
                nome,
                cnpj,
                is_osc,
                is_existing_client,
                total_propostas,
                total_emendas,
                valor_total_emendas,
                total_convenios,
                valor_total_desembolsos
            FROM proponentes
            WHERE is_osc = true
              AND total_emendas > 0
            ORDER BY total_emendas DESC
            LIMIT 1
        """))

        row = result.fetchone()
        if row:
            logger.info(f"\nTop OSC by emendas:")
            logger.info(f"  Nome: {row[0][:50]}")
            logger.info(f"  CNPJ: {row[1]}")
            logger.info(f"  Is OSC: {row[2]}")
            logger.info(f"  Cliente existente: {row[3]}")
            logger.info(f"  Total propostas: {row[4]:,}")
            logger.info(f"  Total emendas: {row[5]:,}")
            logger.info(f"  Valor emendas: R$ {row[6]:,.2f}" if row[6] else "  Valor emendas: N/A")
            logger.info(f"  Total convênios: {row[7]:,}")
            logger.info(f"  Valor desembolsos: R$ {row[8]:,.2f}" if row[8] else "  Valor desembolsos: N/A")
        else:
            logger.warning("⚠️  No OSC with emendas found")


def main():
    """Run all checks."""
    logger.info("\n" + "="*60)
    logger.info("🔍 DATABASE STATUS CHECK")
    logger.info("="*60)

    try:
        settings = get_settings()
        # AppConfig has database.url, not database_url
        db_url = settings.database.url if hasattr(settings, 'database') else settings.database_url
        engine = create_db_engine(db_url)

        # Run all checks
        counts = check_table_counts(engine)
        relationships_ok = check_relationships(engine)
        check_proponente_aggregations(engine)
        recent_ok = check_recent_extractions(engine)
        check_sample_data(engine)

        # Final summary
        logger.info("\n" + "="*60)
        logger.info("📋 SUMMARY")
        logger.info("="*60)

        tables_populated = all(count > 0 for table, count in counts.items() if table != "extraction_logs")

        checks = {
            "Tables populated": tables_populated,
            "Relationships intact": relationships_ok,
            "Recent extraction": recent_ok,
        }

        for check_name, status in checks.items():
            icon = "✅" if status else "❌"
            logger.info(f"{icon} {check_name}")

        all_ok = all(checks.values())

        if all_ok:
            logger.info("\n🎉 DATABASE IS FULLY WIRED AND READY!")
        else:
            logger.warning("\n⚠️  SOME ISSUES FOUND - SEE DETAILS ABOVE")

        return all_ok

    except Exception as e:
        logger.error(f"❌ Error checking database: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

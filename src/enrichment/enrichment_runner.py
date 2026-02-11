"""Enrichment runner for proponentes contact data.

Finds proponentes without email/telefone and enriches them using BrasilAPI.
"""

import time
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from loguru import logger

from src.loader.database import get_engine, create_session_factory
from src.loader.db_models import Proponente
from src.loader.upsert import normalize_cnpj
from .brasil_api import BrasilAPIClient


def enrich_missing_contacts(
    limit: Optional[int] = None,
    batch_size: int = 50,
    delay_between_batches: float = 1.0,
) -> dict:
    """Enrich proponentes missing email or telefone using BrasilAPI.

    Args:
        limit: Maximum number of proponentes to enrich (None = all)
        batch_size: Number of records to process before pausing
        delay_between_batches: Seconds to wait between batches (rate limiting)

    Returns:
        Dict with enrichment statistics
    """
    logger.info("Starting contact enrichment")

    engine = get_engine()
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    stats = {
        "total_checked": 0,
        "enriched": 0,
        "email_added": 0,
        "telefone_added": 0,
        "api_calls": 0,
        "api_errors": 0,
        "already_complete": 0,
    }

    try:
        # Find proponentes missing email OR telefone
        query = select(Proponente).where(
            (Proponente.email.is_(None) | (Proponente.email == ""))
            | (Proponente.telefone.is_(None) | (Proponente.telefone == ""))
        )

        if limit:
            query = query.limit(limit)

        proponentes = session.scalars(query).all()
        stats["total_checked"] = len(proponentes)

        if not proponentes:
            logger.info("No proponentes need enrichment")
            return stats

        logger.info(
            f"Found {len(proponentes)} proponentes needing enrichment "
            f"(limit: {limit or 'none'})"
        )

        with BrasilAPIClient() as api_client:
            processed_in_batch = 0

            for idx, proponente in enumerate(proponentes, 1):
                # Check if already has both email and telefone
                has_email = proponente.email and proponente.email.strip()
                has_telefone = proponente.telefone and proponente.telefone.strip()

                if has_email and has_telefone:
                    stats["already_complete"] += 1
                    continue

                logger.debug(
                    f"Processing {idx}/{len(proponentes)}: "
                    f"{proponente.nome} ({proponente.cnpj})"
                )

                # Fetch data from BrasilAPI
                stats["api_calls"] += 1
                try:
                    contact_info = api_client.enrich_proponente(proponente.cnpj)

                    updated = False

                    # Update email if missing and found
                    if not has_email and contact_info.get("email"):
                        proponente.email = contact_info["email"]
                        stats["email_added"] += 1
                        updated = True
                        logger.info(
                            f"Added email for {proponente.nome}: {contact_info['email']}"
                        )

                    # Update telefone if missing and found
                    if not has_telefone and contact_info.get("telefone"):
                        proponente.telefone = contact_info["telefone"]
                        stats["telefone_added"] += 1
                        updated = True
                        logger.info(
                            f"Added telefone for {proponente.nome}: {contact_info['telefone']}"
                        )

                    if updated:
                        stats["enriched"] += 1

                except Exception as e:
                    logger.error(
                        f"Error enriching {proponente.cnpj} ({proponente.nome}): {e}"
                    )
                    stats["api_errors"] += 1

                processed_in_batch += 1

                # Batch delay for rate limiting
                if processed_in_batch >= batch_size:
                    session.commit()
                    logger.debug(
                        f"Batch of {batch_size} completed, "
                        f"waiting {delay_between_batches}s"
                    )
                    time.sleep(delay_between_batches)
                    processed_in_batch = 0

            # Final commit
            session.commit()

        logger.info(
            f"Enrichment complete: {stats['enriched']} proponentes enriched "
            f"({stats['email_added']} emails, {stats['telefone_added']} telefones), "
            f"{stats['api_calls']} API calls, {stats['api_errors']} errors"
        )

        return stats

    except Exception as e:
        session.rollback()
        logger.error(f"Enrichment failed: {e}")
        raise
    finally:
        session.close()


def enrich_specific_cnpj(cnpj: str, force: bool = False) -> bool:
    """Enrich a specific proponente by CNPJ.

    Args:
        cnpj: CNPJ to enrich
        force: If True, enrich even if already has contact data

    Returns:
        True if enriched, False otherwise
    """
    cnpj_normalized = normalize_cnpj(cnpj)

    if not cnpj_normalized:
        logger.error(f"Invalid CNPJ: {cnpj}")
        return False

    engine = get_engine()
    SessionLocal = create_session_factory(engine)
    session = SessionLocal()

    try:
        proponente = session.scalar(
            select(Proponente).where(Proponente.cnpj == cnpj_normalized)
        )

        if not proponente:
            logger.warning(f"Proponente not found: {cnpj_normalized}")
            return False

        # Check if needs enrichment
        has_email = proponente.email and proponente.email.strip()
        has_telefone = proponente.telefone and proponente.telefone.strip()

        if has_email and has_telefone and not force:
            logger.info(
                f"Proponente already has contact data: {proponente.nome} "
                f"(use force=True to re-enrich)"
            )
            return False

        logger.info(f"Enriching {proponente.nome} ({cnpj_normalized})")

        with BrasilAPIClient() as api_client:
            contact_info = api_client.enrich_proponente(cnpj_normalized)

            updated = False

            if contact_info.get("email") and (not has_email or force):
                proponente.email = contact_info["email"]
                logger.info(f"Updated email: {contact_info['email']}")
                updated = True

            if contact_info.get("telefone") and (not has_telefone or force):
                proponente.telefone = contact_info["telefone"]
                logger.info(f"Updated telefone: {contact_info['telefone']}")
                updated = True

            if updated:
                session.commit()
                logger.info(f"Successfully enriched {proponente.nome}")
                return True
            else:
                logger.warning(f"No new contact data found for {proponente.nome}")
                return False

    except Exception as e:
        session.rollback()
        logger.error(f"Error enriching {cnpj}: {e}")
        return False
    finally:
        session.close()


if __name__ == "__main__":
    # Run enrichment with default settings
    import sys
    from loguru import logger

    logger.remove()
    logger.add(sys.stderr, level="INFO")

    stats = enrich_missing_contacts(limit=100, batch_size=10, delay_between_batches=0.5)
    print(f"\nEnrichment Statistics:")
    print(f"  Total checked: {stats['total_checked']}")
    print(f"  Enriched: {stats['enriched']}")
    print(f"  Emails added: {stats['email_added']}")
    print(f"  Telefones added: {stats['telefone_added']}")
    print(f"  API calls: {stats['api_calls']}")
    print(f"  Errors: {stats['api_errors']}")

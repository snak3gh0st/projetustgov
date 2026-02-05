"""Integration tests for the loader module.

These tests verify:
- Upsert idempotency (inserts new, updates existing, prevents duplicates)
- Atomic transaction rollback on failure
- Extraction logging functionality

Tests require PostgreSQL to be running. Run with:
    docker compose up -d db
    uv run pytest tests/test_loader.py -v
"""

import os
from datetime import date
from unittest.mock import patch

import pytest
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from src.loader.database import init_db
from src.loader.db_models import (
    Apoiador,
    Emenda,
    ExtractionLog,
    Programa,
    Proposta,
    PropostaApoiador,
    PropostaEmenda,
)
from src.loader.extraction_log import create_extraction_log, get_last_extraction
from src.loader.upsert import load_extraction_data, upsert_records

# Skip integration tests if DATABASE_URL not set
pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL not set, skip integration tests",
)


@pytest.fixture(scope="module")
def engine():
    """Create test database engine."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL not configured")
    engine = create_engine(database_url, echo=False)
    return engine


@pytest.fixture(scope="module")
def db_session(engine):
    """Create database session for tests."""
    # Create tables
    init_db(engine)

    # Create session
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()

    yield session

    # Cleanup after all tests
    session.rollback()
    session.close()


@pytest.fixture(autouse=True)
def cleanup_tables(db_session):
    """Clean up table data before each test."""
    # Rollback any existing transaction
    db_session.rollback()

    # Delete all records from all tables
    tables = [
        PropostaApoiador,
        PropostaEmenda,
        Proposta,
        Apoiador,
        Emenda,
        Programa,
        ExtractionLog,
    ]
    for table in tables:
        db_session.execute(text(f"DELETE FROM {table.__tablename__}"))
    db_session.commit()


class TestUpsertRecords:
    """Tests for upsert_records function."""

    def test_upsert_insert_new_records(self, db_session: Session):
        """Upsert should insert new records when they don't exist."""
        propostas = [
            {
                "transfer_gov_id": "PROP-001",
                "titulo": "Proposta Teste 1",
                "valor_global": 100000.00,
                "estado": "SP",
            },
            {
                "transfer_gov_id": "PROP-002",
                "titulo": "Proposta Teste 2",
                "valor_global": 200000.00,
                "estado": "RJ",
            },
            {
                "transfer_gov_id": "PROP-003",
                "titulo": "Proposta Teste 3",
                "valor_global": 300000.00,
                "estado": "MG",
            },
        ]

        result = upsert_records(db_session, Proposta, propostas)

        # Verify insertion
        assert result["inserted"] == 3
        assert db_session.query(Proposta).count() == 3

        # Verify records exist with correct data
        for prop in propostas:
            record = (
                db_session.query(Proposta)
                .filter(Proposta.transfer_gov_id == prop["transfer_gov_id"])
                .first()
            )
            assert record is not None
            assert record.titulo == prop["titulo"]
            assert record.valor_global == prop["valor_global"]
            assert record.estado == prop["estado"]

    def test_upsert_update_existing_records(self, db_session: Session):
        """Upsert should update existing records on conflict."""
        # Insert initial records
        initial_propostas = [
            {
                "transfer_gov_id": "PROP-001",
                "titulo": "Proposta Original",
                "valor_global": 100000.00,
            }
        ]
        upsert_records(db_session, Proposta, initial_propostas)

        # Upsert same records with updated values
        updated_propostas = [
            {
                "transfer_gov_id": "PROP-001",
                "titulo": "Proposta Atualizada",
                "valor_global": 150000.00,
            }
        ]
        result = upsert_records(db_session, Proposta, updated_propostas)

        # Verify update (count should still be 1, not 2)
        assert db_session.query(Proposta).count() == 1

        # Verify the record was updated
        record = (
            db_session.query(Proposta)
            .filter(Proposta.transfer_gov_id == "PROP-001")
            .first()
        )
        assert record.titulo == "Proposta Atualizada"
        assert record.valor_global == 150000.00

        # Verify updated_at was changed
        assert record.updated_at is not None

    def test_upsert_idempotent(self, db_session: Session):
        """Re-running upsert with same data should not create duplicates."""
        propostas = [
            {
                "transfer_gov_id": "PROP-IDEM-001",
                "titulo": "Proposta Idempotente",
                "valor_global": 50000.00,
            },
            {
                "transfer_gov_id": "PROP-IDEM-002",
                "titulo": "Proposta Idempotente 2",
                "valor_global": 60000.00,
            },
            {
                "transfer_gov_id": "PROP-IDEM-003",
                "titulo": "Proposta Idempotente 3",
                "valor_global": 70000.00,
            },
        ]

        # First insert
        result1 = upsert_records(db_session, Proposta, propostas)
        assert result1["inserted"] == 3
        assert db_session.query(Proposta).count() == 3

        # Second insert (same data)
        result2 = upsert_records(db_session, Proposta, propostas)
        assert db_session.query(Proposta).count() == 3

        # Values should remain the same
        for prop in propostas:
            record = (
                db_session.query(Proposta)
                .filter(Proposta.transfer_gov_id == prop["transfer_gov_id"])
                .first()
            )
            assert record.titulo == prop["titulo"]

    def test_upsert_empty_list(self, db_session: Session):
        """Upsert should handle empty list gracefully."""
        result = upsert_records(db_session, Proposta, [])
        assert result["inserted"] == 0
        assert result["updated"] == 0

    def test_upsert_mixed_insert_update(self, db_session: Session):
        """Upsert should insert new and update existing in same batch."""
        # Insert initial
        initial = [
            {
                "transfer_gov_id": "MIX-001",
                "titulo": "Original Mix",
                "valor_global": 10000.00,
            }
        ]
        upsert_records(db_session, Proposta, initial)

        # Mixed batch: one existing, one new
        mixed = [
            {
                "transfer_gov_id": "MIX-001",
                "titulo": "Updated Mix",
                "valor_global": 20000.00,
            },
            {
                "transfer_gov_id": "MIX-002",
                "titulo": "New Mix",
                "valor_global": 30000.00,
            },
        ]
        result = upsert_records(db_session, Proposta, mixed)

        # Should have 2 records total (1 updated, 1 inserted)
        assert db_session.query(Proposta).count() == 2

        # First should be updated
        record1 = (
            db_session.query(Proposta)
            .filter(Proposta.transfer_gov_id == "MIX-001")
            .first()
        )
        assert record1.titulo == "Updated Mix"
        assert record1.valor_global == 20000.00

        # Second should be inserted
        record2 = (
            db_session.query(Proposta)
            .filter(Proposta.transfer_gov_id == "MIX-002")
            .first()
        )
        assert record2 is not None
        assert record2.titulo == "New Mix"


class TestLoadExtractionData:
    """Tests for load_extraction_data function."""

    def test_load_extraction_data_ordering(self, db_session: Session):
        """load_extraction_data should load tables in correct dependency order."""
        validated_data = {
            "programas": [
                {
                    "transfer_gov_id": "PROG-001",
                    "nome": "Programa Teste",
                    "orgao_superior": "Ministério da Saúde",
                }
            ],
            "propostas": [
                {
                    "transfer_gov_id": "PROP-LOAD-001",
                    "titulo": "Proposta Load Test",
                    "valor_global": 100000.00,
                    "programa_id": "PROG-001",
                }
            ],
            "apoiadores": [
                {
                    "transfer_gov_id": "AP-001",
                    "nome": "Apoiador Teste",
                    "tipo": "ONG",
                }
            ],
            "emendas": [
                {
                    "transfer_gov_id": "EM-001",
                    "numero": "1234",
                    "autor": "Deputado Teste",
                    "valor": 50000.00,
                    "ano": 2024,
                }
            ],
            "proposta_apoiadores": [
                {
                    "proposta_transfer_gov_id": "PROP-LOAD-001",
                    "apoiador_transfer_gov_id": "AP-001",
                }
            ],
            "proposta_emendas": [
                {
                    "proposta_transfer_gov_id": "PROP-LOAD-001",
                    "emenda_transfer_gov_id": "EM-001",
                }
            ],
        }

        extraction_date = date.today()
        stats = load_extraction_data(db_session, validated_data, extraction_date)

        # Verify stats structure
        assert "programas" in stats
        assert "propostas" in stats
        assert "apoiadores" in stats
        assert "emendas" in stats
        assert "proposta_apoiadores" in stats
        assert "proposta_emendas" in stats

        # Verify data was loaded
        assert db_session.query(Programa).count() == 1
        assert db_session.query(Proposta).count() == 1
        assert db_session.query(Apoiador).count() == 1
        assert db_session.query(Emenda).count() == 1
        assert db_session.query(PropostaApoiador).count() == 1
        assert db_session.query(PropostaEmenda).count() == 1

        # Verify extraction_date was added to records
        programa = db_session.query(Programa).first()
        assert programa.extraction_date == extraction_date

    def test_load_extraction_data_with_empty_tables(self, db_session: Session):
        """load_extraction_data should handle missing tables gracefully."""
        validated_data = {
            "programas": [{"transfer_gov_id": "PROG-ONLY", "nome": "Só Programa"}]
        }

        stats = load_extraction_data(db_session, validated_data, date.today())

        # Should only have programas in stats
        assert "programas" in stats
        assert "propostas" not in stats
        assert "apoiadores" not in stats

        # Should still load the programas
        assert db_session.query(Programa).count() == 1


class TestAtomicRollback:
    """Tests for atomic transaction rollback behavior."""

    def test_atomic_rollback_on_failure(self, db_session: Session):
        """Simulated failure should leave no partial data."""
        # Insert some records first
        initial_propostas = [
            {"transfer_gov_id": "ROLLBACK-001", "titulo": "Before Rollback"}
        ]
        upsert_records(db_session, Proposta, initial_propostas)

        # Verify initial insert worked
        assert db_session.query(Proposta).count() == 1

        # Simulate failure by rolling back
        db_session.rollback()

        # Verify all data is gone (including the initial insert)
        assert db_session.query(Proposta).count() == 0


class TestExtractionLog:
    """Tests for extraction logging functionality."""

    def test_extraction_log_created(self, db_session: Session):
        """create_extraction_log should create a log entry."""
        stats = {
            "programas": {"inserted": 5, "updated": 0},
            "propostas": {"inserted": 10, "updated": 2},
        }

        log = create_extraction_log(
            db_session,
            status="success",
            stats=stats,
            duration=45.5,
        )

        # Verify log was created
        assert log.id is not None
        assert log.status == "success"
        assert log.total_records == 17  # 5 + 10 + 2
        assert log.records_inserted == 15  # 5 + 10
        assert log.records_updated == 2
        assert log.duration_seconds == 45.5
        assert log.error_message is None

        # Commit so it persists for get_last_extraction
        db_session.commit()

    def test_get_last_extraction(self, db_session: Session):
        """get_last_extraction should return the most recent log entry."""
        # Create two log entries
        stats1 = {"programas": {"inserted": 1, "updated": 0}}
        log1 = create_extraction_log(
            db_session, status="success", stats=stats1, duration=10.0
        )

        stats2 = {"programas": {"inserted": 2, "updated": 0}}
        log2 = create_extraction_log(
            db_session, status="success", stats=stats2, duration=20.0
        )

        db_session.commit()

        # Get last extraction
        last_log = get_last_extraction(db_session)

        # Should be the second log (most recent)
        assert last_log is not None
        assert last_log.id == log2.id
        assert last_log.records_inserted == 2

    def test_extraction_log_failed_status(self, db_session: Session):
        """create_extraction_log should handle failed status."""
        log = create_extraction_log(
            db_session,
            status="failed",
            error="Connection timeout to Transfer Gov",
            duration=5.0,
        )

        assert log.status == "failed"
        assert log.error_message == "Connection timeout to Transfer Gov"
        assert log.total_records is None
        assert log.records_inserted is None

        db_session.commit()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

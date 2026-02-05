"""SQLAlchemy ORM models for the Transfer Gov data schema.

This module defines all 7 tables for the PROJETUS database:
- Programa (programas) - Government transfer programs
- Proposta (propostas) - Transfer proposals/applications
- Apoiador (apoiadores) - Supporters/beneficiaries
- Emenda (emendas) - Budget amendments
- PropostaApoiador (proposta_apoiadores) - Junction: proposals to supporters
- PropostaEmenda (proposta_emendas) - Junction: proposals to amendments
- ExtractionLog (extraction_logs) - Pipeline execution audit trail

Design decisions:
- All tables use application-level foreign keys (no DB FK constraints)
  to support partial extractions where referenced entities may not exist yet.
- All columns are Optional (nullable) per CONTEXT.md flexibility decision.
- transfer_gov_id is the natural key for upsert operations.
- Column names in Portuguese to match Transfer Gov source data.
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    pass


class Programa(Base):
    """Government transfer programs (bolsas, convênios, etc.)."""

    __tablename__ = "programas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    transfer_gov_id: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    nome: Mapped[Optional[str]] = mapped_column(String)
    orgao_superior: Mapped[Optional[str]] = mapped_column(String)
    orgao_vinculado: Mapped[Optional[str]] = mapped_column(String)
    modalidade: Mapped[Optional[str]] = mapped_column(String)
    acao_orcamentaria: Mapped[Optional[str]] = mapped_column(String)
    natureza_juridica: Mapped[Optional[str]] = mapped_column(String)

    # Audit columns
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)


class Proposta(Base):
    """Transfer proposals/applications submitted by entities."""

    __tablename__ = "propostas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    transfer_gov_id: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    titulo: Mapped[Optional[str]] = mapped_column(String)
    valor_global: Mapped[Optional[float]] = mapped_column(Float)
    valor_repasse: Mapped[Optional[float]] = mapped_column(Float)
    valor_contrapartida: Mapped[Optional[float]] = mapped_column(Float)
    data_publicacao: Mapped[Optional[date]] = mapped_column(Date)
    data_inicio_vigencia: Mapped[Optional[date]] = mapped_column(Date)
    data_fim_vigencia: Mapped[Optional[date]] = mapped_column(Date)
    situacao: Mapped[Optional[str]] = mapped_column(String)
    estado: Mapped[Optional[str]] = mapped_column(String(2))
    municipio: Mapped[Optional[str]] = mapped_column(String)
    proponente: Mapped[Optional[str]] = mapped_column(String)
    # Application-level FK to programas.transfer_gov_id (no DB constraint for partial extractions)
    programa_id: Mapped[Optional[str]] = mapped_column(String)

    # Audit columns
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)

    __table_args__ = (
        Index("ix_propostas_situacao", "situacao"),
        Index("ix_propostas_estado", "estado"),
        Index("ix_propostas_data_publicacao", "data_publicacao"),
        Index("ix_propostas_valor_global", "valor_global"),
    )


class Apoiador(Base):
    """Supporters/beneficiaries of transfer proposals."""

    __tablename__ = "apoiadores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    transfer_gov_id: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    nome: Mapped[Optional[str]] = mapped_column(String)
    tipo: Mapped[Optional[str]] = mapped_column(String)
    orgao: Mapped[Optional[str]] = mapped_column(String)

    # Audit columns
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)


class Emenda(Base):
    """Budget amendments linked to transfer proposals."""

    __tablename__ = "emendas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    transfer_gov_id: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    numero: Mapped[Optional[str]] = mapped_column(String)
    autor: Mapped[Optional[str]] = mapped_column(String)
    valor: Mapped[Optional[float]] = mapped_column(Float)
    tipo: Mapped[Optional[str]] = mapped_column(String)
    ano: Mapped[Optional[int]] = mapped_column()

    # Audit columns
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)


class PropostaApoiador(Base):
    """Junction table: Many-to-Many relationship between Propostas and Apoiadores."""

    __tablename__ = "proposta_apoiadores"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proposta_transfer_gov_id: Mapped[str] = mapped_column(
        String, index=True, nullable=False
    )
    apoiador_transfer_gov_id: Mapped[str] = mapped_column(
        String, index=True, nullable=False
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)

    __table_args__ = (
        UniqueConstraint(
            "proposta_transfer_gov_id",
            "apoiador_transfer_gov_id",
            name="uq_proposta_apoiador",
        ),
    )


class PropostaEmenda(Base):
    """Junction table: Many-to-Many relationship between Propostas and Emendas."""

    __tablename__ = "proposta_emendas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proposta_transfer_gov_id: Mapped[str] = mapped_column(
        String, index=True, nullable=False
    )
    emenda_transfer_gov_id: Mapped[str] = mapped_column(
        String, index=True, nullable=False
    )
    extraction_date: Mapped[Optional[date]] = mapped_column(Date)

    __table_args__ = (
        UniqueConstraint(
            "proposta_transfer_gov_id",
            "emenda_transfer_gov_id",
            name="uq_proposta_emenda",
        ),
    )


class ExtractionLog(Base):
    """Audit trail for each pipeline extraction execution."""

    __tablename__ = "extraction_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(
        String, nullable=False
    )  # 'success', 'partial', 'failed'
    files_downloaded: Mapped[Optional[int]] = mapped_column()
    total_records: Mapped[Optional[int]] = mapped_column()
    records_inserted: Mapped[Optional[int]] = mapped_column()
    records_updated: Mapped[Optional[int]] = mapped_column()
    records_skipped: Mapped[Optional[int]] = mapped_column()
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

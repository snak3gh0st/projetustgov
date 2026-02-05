"""Pydantic validation models for Transfer Gov entities."""

from pydantic import BaseModel, field_validator, Field
from typing import Optional
from datetime import date


# Valid Brazilian UF codes
VALID_UF_CODES = {
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
}


class PropostaValidation(BaseModel):
    """Validates a single proposta record from Transfer Gov."""

    transfer_gov_id: str = Field(..., description="Unique identifier from Transfer Gov")
    titulo: Optional[str] = Field(None, description="Title of the proposal")
    valor_global: Optional[float] = Field(
        None, description="Total value of the proposal"
    )
    valor_repasse: Optional[float] = Field(
        None, description="Transfer value from federal government"
    )
    valor_contrapartida: Optional[float] = Field(
        None, description="Local counterpart value"
    )
    data_publicacao: Optional[date] = Field(None, description="Publication date in DOU")
    data_inicio_vigencia: Optional[date] = Field(
        None, description="Start date of validity period"
    )
    data_fim_vigencia: Optional[date] = Field(
        None, description="End date of validity period"
    )
    situacao: Optional[str] = Field(None, description="Current situation/status")
    estado: Optional[str] = Field(None, description="Brazilian UF state code")
    municipio: Optional[str] = Field(None, description="Municipality/city name")
    proponente: Optional[str] = Field(None, description="Entity proposing the project")
    programa_id: Optional[str] = Field(None, description="Associated program ID")

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        """Reject empty or whitespace-only transfer_gov_id."""
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor_global", "valor_repasse", "valor_contrapartida")
    @classmethod
    def valores_must_not_be_negative(cls, v: Optional[float]) -> Optional[float]:
        """Reject negative values for monetary fields."""
        if v is not None and v < 0:
            raise ValueError(f"valor cannot be negative: {v}")
        return v

    @field_validator("estado")
    @classmethod
    def estado_must_be_valid_uf(cls, v: Optional[str]) -> Optional[str]:
        """Validate and normalize UF state code."""
        if v is None:
            return None
        v_clean = v.strip().upper()
        if v_clean and v_clean not in VALID_UF_CODES:
            raise ValueError(
                f"Invalid estado UF code: {v}. Must be one of {sorted(VALID_UF_CODES)}"
            )
        return v_clean if v_clean else None


class ApoiadorValidation(BaseModel):
    """Validates a single apoiador record from Transfer Gov."""

    transfer_gov_id: str = Field(..., description="Associated proposal ID")
    nome: Optional[str] = Field(None, description="Name of the supporter")
    tipo: Optional[str] = Field(
        None, description="Type of supporter (Vereador, Deputado, etc.)"
    )
    orgao: Optional[str] = Field(None, description="Government body/organ")

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        """Reject empty or whitespace-only transfer_gov_id."""
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()


class EmendaValidation(BaseModel):
    """Validates a single emenda record from Transfer Gov."""

    transfer_gov_id: str = Field(..., description="Associated proposal ID")
    numero: Optional[str] = Field(None, description="Amendment number")
    autor: Optional[str] = Field(None, description="Author of the amendment")
    valor: Optional[float] = Field(None, description="Monetary value of the amendment")
    tipo: Optional[str] = Field(
        None, description="Type of amendment (Impositiva, Comissão, etc.)"
    )
    ano: Optional[int] = Field(None, description="Year of the amendment")

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        """Reject empty or whitespace-only transfer_gov_id."""
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor")
    @classmethod
    def valor_must_not_be_negative(cls, v: Optional[float]) -> Optional[float]:
        """Reject negative values for monetary fields."""
        if v is not None and v < 0:
            raise ValueError(f"valor cannot be negative: {v}")
        return v

    @field_validator("ano")
    @classmethod
    def ano_must_be_reasonable(cls, v: Optional[int]) -> Optional[int]:
        """Reject unreasonable years."""
        if v is not None and (v < 2000 or v > 2100):
            raise ValueError(f"Unreasonable ano value: {v}")
        return v


class ProgramaValidation(BaseModel):
    """Validates a single programa record from Transfer Gov."""

    transfer_gov_id: str = Field(..., description="Unique program identifier")
    nome: Optional[str] = Field(None, description="Name of the program")
    orgao_superior: Optional[str] = Field(None, description="Superior government body")
    orgao_vinculado: Optional[str] = Field(None, description="Linked government body")
    modalidade: Optional[str] = Field(None, description="Modality/type of program")
    acao_orcamentaria: Optional[str] = Field(None, description="Budgetary action code")
    natureza_juridica: Optional[str] = Field(
        None, description="Legal nature of the program"
    )

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        """Reject empty or whitespace-only transfer_gov_id."""
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

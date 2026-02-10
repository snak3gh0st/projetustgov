"""Pydantic validation models for Transfer Gov entities."""

from pydantic import BaseModel, field_validator, Field, ConfigDict
from typing import Optional
from datetime import date, datetime


def parse_brazilian_date(v) -> Optional[date]:
    """Parse DD/MM/YYYY date format used in Brazilian government CSVs."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, date):
        return v
    s = str(v).strip()
    # Try DD/MM/YYYY
    try:
        parts = s.split("/")
        if len(parts) == 3:
            return date(int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        pass
    # Try YYYY-MM-DD (ISO)
    try:
        return date.fromisoformat(s[:10])
    except (ValueError, IndexError):
        pass
    return None


def parse_brazilian_datetime(v) -> Optional[datetime]:
    """Parse DD/MM/YYYY HH:MM:SS datetime format used in Brazilian government CSVs."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    # Try DD/MM/YYYY HH:MM:SS
    try:
        date_part, time_part = s.split(" ", 1)
        parts = date_part.split("/")
        time_parts = time_part.split(":")
        if len(parts) == 3:
            return datetime(
                int(parts[2]), int(parts[1]), int(parts[0]),
                int(time_parts[0]) if len(time_parts) > 0 else 0,
                int(time_parts[1]) if len(time_parts) > 1 else 0,
                int(time_parts[2]) if len(time_parts) > 2 else 0,
            )
    except (ValueError, IndexError):
        pass
    # Try DD/MM/YYYY (without time)
    try:
        parts = s.split("/")
        if len(parts) == 3:
            return datetime(int(parts[2]), int(parts[1]), int(parts[0]))
    except (ValueError, IndexError):
        pass
    return None


def parse_brazilian_float(v) -> Optional[float]:
    """Parse number with comma decimal separator (e.g., '311762,4' → 311762.4)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    # Replace comma with dot
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


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

    model_config = ConfigDict(extra="ignore")  # Ignore extra fields from source

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
    modalidade: Optional[str] = Field(None, description="Modality of the proposal")
    orgao_superior: Optional[str] = Field(None, description="Superior government body")
    orgao_vinculado: Optional[str] = Field(None, description="Linked government body")

    @field_validator("data_publicacao", "data_inicio_vigencia", "data_fim_vigencia", mode="before")
    @classmethod
    def parse_dates(cls, v):
        """Parse Brazilian date format DD/MM/YYYY."""
        return parse_brazilian_date(v)

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        """Reject empty or whitespace-only transfer_gov_id."""
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor_global", "valor_repasse", "valor_contrapartida", mode="before")
    @classmethod
    def parse_valores(cls, v):
        """Parse Brazilian float format."""
        parsed = parse_brazilian_float(v)
        if parsed is not None and parsed < 0:
            raise ValueError(f"valor cannot be negative: {parsed}")
        return parsed

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

    model_config = ConfigDict(extra="ignore")  # Ignore extra fields from source

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

    model_config = ConfigDict(extra="ignore")  # Ignore extra fields from source

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

    model_config = ConfigDict(extra="ignore")  # Ignore extra fields from source

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


class ConvenioValidation(BaseModel):
    """Validates a single convênio record from Transfer Gov."""

    model_config = ConfigDict(extra="ignore")

    transfer_gov_id: str = Field(..., description="NR_CONVENIO unique identifier")
    proposta_id: Optional[str] = Field(None, description="Linked proposal ID")
    situacao: Optional[str] = Field(None, description="Current situation of convênio")
    instrumento_ativo: Optional[str] = Field(None, description="Whether instrument is active")
    valor_global: Optional[float] = Field(None, description="Total global value")
    valor_repasse: Optional[float] = Field(None, description="Transfer value")
    valor_contrapartida: Optional[float] = Field(None, description="Counterpart value")
    valor_desembolsado: Optional[float] = Field(None, description="Amount disbursed")
    data_assinatura: Optional[date] = Field(None, description="Signature date")
    data_publicacao: Optional[date] = Field(None, description="Publication date")
    data_inicio_vigencia: Optional[date] = Field(None, description="Start of validity")
    data_fim_vigencia: Optional[date] = Field(None, description="End of validity")
    ano: Optional[int] = Field(None, description="Year")
    valor_empenhado: Optional[float] = Field(None, description="Committed value")
    saldo_conta: Optional[float] = Field(None, description="Account balance")
    saldo_reman_tesouro: Optional[float] = Field(None, description="Treasury remainder balance")
    saldo_reman_convenente: Optional[float] = Field(None, description="Convenente remainder balance")
    rendimento_aplicacao: Optional[float] = Field(None, description="Investment yield")
    ingresso_contrapartida: Optional[float] = Field(None, description="Counterpart income")
    valor_global_original: Optional[float] = Field(None, description="Original global value")

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor_global", "valor_repasse", "valor_contrapartida", "valor_desembolsado",
                     "valor_empenhado", "saldo_conta", "saldo_reman_tesouro", "saldo_reman_convenente",
                     "rendimento_aplicacao", "ingresso_contrapartida", "valor_global_original", mode="before")
    @classmethod
    def parse_valor(cls, v):
        return parse_brazilian_float(v)

    @field_validator("data_assinatura", "data_publicacao", "data_inicio_vigencia", "data_fim_vigencia", mode="before")
    @classmethod
    def parse_date(cls, v):
        return parse_brazilian_date(v)

    @field_validator("ano", mode="before")
    @classmethod
    def parse_ano(cls, v):
        if v is None or (isinstance(v, str) and (not v.strip() or v.strip() == "nan")):
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None


class DesembolsoValidation(BaseModel):
    """Validates a single desembolso record from Transfer Gov."""

    model_config = ConfigDict(extra="ignore")

    transfer_gov_id: str = Field(..., description="ID_DESEMBOLSO unique identifier")
    convenio_id: Optional[str] = Field(None, description="NR_CONVENIO link")
    data_desembolso: Optional[date] = Field(None, description="Disbursement date")
    valor_desembolsado: Optional[float] = Field(None, description="Amount disbursed")
    nr_siafi: Optional[str] = Field(None, description="SIAFI reference number")
    ano_desembolso: Optional[int] = Field(None, description="Disbursement year")

    @field_validator("transfer_gov_id")
    @classmethod
    def transfer_gov_id_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("transfer_gov_id cannot be empty")
        return v.strip()

    @field_validator("valor_desembolsado", mode="before")
    @classmethod
    def parse_valor(cls, v):
        return parse_brazilian_float(v)

    @field_validator("data_desembolso", mode="before")
    @classmethod
    def parse_date(cls, v):
        return parse_brazilian_date(v)

    @field_validator("ano_desembolso", mode="before")
    @classmethod
    def parse_ano(cls, v):
        if v is None or (isinstance(v, str) and (not v.strip() or v.strip() == "nan")):
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None


class HistoricoSituacaoValidation(BaseModel):
    """Validates a single histórico de situação record."""

    model_config = ConfigDict(extra="ignore")

    proposta_id: Optional[str] = Field(None, description="ID_PROPOSTA link")
    convenio_id: Optional[str] = Field(None, description="NR_CONVENIO link")
    data_historico: Optional[datetime] = Field(None, description="Date of status change")
    situacao: Optional[str] = Field(None, description="Situation code")
    dias_historico: Optional[int] = Field(None, description="Days in this situation")
    cod_historico: Optional[str] = Field(None, description="Situation code number")

    @field_validator("data_historico", mode="before")
    @classmethod
    def parse_date(cls, v):
        return parse_brazilian_datetime(v)

    @field_validator("dias_historico", mode="before")
    @classmethod
    def parse_dias(cls, v):
        if v is None or (isinstance(v, str) and (not v.strip() or v.strip() == "nan")):
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None


class ProponenteDetalhadoValidation(BaseModel):
    """Validates enriched proponente data from siconv_proponentes.csv."""

    model_config = ConfigDict(extra="ignore")

    cnpj: str = Field(..., description="Proponente CNPJ")
    nome: Optional[str] = Field(None, description="Proponente name")
    municipio: Optional[str] = Field(None, description="Municipality")
    estado: Optional[str] = Field(None, description="UF state code")
    endereco: Optional[str] = Field(None, description="Address")
    bairro: Optional[str] = Field(None, description="Neighborhood")
    cep: Optional[str] = Field(None, description="CEP postal code")
    email: Optional[str] = Field(None, description="Contact email")
    telefone: Optional[str] = Field(None, description="Contact phone")

    @field_validator("cnpj")
    @classmethod
    def cnpj_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("cnpj cannot be empty")
        return v.strip()


class EmendaDetalhadaValidation(BaseModel):
    """Validates enriched emenda data from siconv_emenda.csv."""

    model_config = ConfigDict(extra="ignore")

    proposta_id: Optional[str] = Field(None, description="Linked proposal ID")
    numero: Optional[str] = Field(None, description="Emenda number")
    autor: Optional[str] = Field(None, description="Parliamentary author")
    beneficiario_cnpj: Optional[str] = Field(None, description="Beneficiary CNPJ")
    tipo: Optional[str] = Field(None, description="Parliamentary type")
    valor_repasse_proposta: Optional[float] = Field(None, description="Proposta transfer value")
    valor_repasse_emenda: Optional[float] = Field(None, description="Emenda transfer value")

    @field_validator("valor_repasse_proposta", "valor_repasse_emenda", mode="before")
    @classmethod
    def parse_valor(cls, v):
        return parse_brazilian_float(v)

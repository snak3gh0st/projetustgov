"""Tests for data validation module (Pydantic models for all entity types)."""

import pytest
from datetime import date
from pydantic import ValidationError


class TestPropostaValidation:
    """Test Pydantic validation for Proposta records."""

    def test_valid_proposta(self):
        """Valid proposta record should pass validation."""
        from src.transformer.models import PropostaValidation

        proposta = PropostaValidation(
            transfer_gov_id="PROP-001",
            titulo="Projeto de Teste",
            valor_global=150000.00,
            valor_repasse=120000.00,
            valor_contrapartida=30000.00,
            situacao="Em execução",
            estado="CE",
            municipio="Fortaleza",
            proponente="Prefeitura Municipal",
            programa_id="PROGRAMA-001",
        )

        assert proposta.transfer_gov_id == "PROP-001"
        assert proposta.valor_global == 150000.00
        assert proposta.estado == "CE"

    def test_empty_id_rejected(self):
        """Empty transfer_gov_id should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError) as exc_info:
            PropostaValidation(
                transfer_gov_id="",  # Empty ID
                titulo="Test",
                valor_global=1000.00,
            )

        assert (
            "transfer_gov_id" in str(exc_info.value).lower()
            or "empty" in str(exc_info.value).lower()
        )

    def test_whitespace_id_rejected(self):
        """ID with only whitespace should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError):
            PropostaValidation(
                transfer_gov_id="   ",  # Whitespace only
                titulo="Test",
                valor_global=1000.00,
            )

    def test_negative_valor_rejected(self):
        """Negative valor_global should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError) as exc_info:
            PropostaValidation(
                transfer_gov_id="PROP-001",
                titulo="Test",
                valor_global=-100.00,  # Negative value
            )

        assert (
            "negative" in str(exc_info.value).lower()
            or "valor" in str(exc_info.value).lower()
        )

    def test_negative_repasse_rejected(self):
        """Negative valor_repasse should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError):
            PropostaValidation(
                transfer_gov_id="PROP-001",
                titulo="Test",
                valor_global=1000.00,
                valor_repasse=-500.00,  # Negative value
            )

    def test_negative_contrapartida_rejected(self):
        """Negative valor_contrapartida should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError):
            PropostaValidation(
                transfer_gov_id="PROP-001",
                titulo="Test",
                valor_global=1000.00,
                valor_contrapartida=-100.00,  # Negative value
            )

    def test_invalid_estado_rejected(self):
        """Invalid UF code should be rejected."""
        from src.transformer.models import PropostaValidation

        with pytest.raises(ValidationError) as exc_info:
            PropostaValidation(
                transfer_gov_id="PROP-001",
                titulo="Test",
                valor_global=1000.00,
                estado="XX",  # Invalid UF
            )

        assert (
            "estado" in str(exc_info.value).lower()
            or "uf" in str(exc_info.value).lower()
        )

    def test_valid_estados_accepted(self):
        """All valid Brazilian UF codes should be accepted."""
        from src.transformer.models import PropostaValidation

        valid_ufs = [
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
        ]

        for uf in valid_ufs:
            proposta = PropostaValidation(
                transfer_gov_id=f"PROP-{uf}",
                titulo="Test",
                valor_global=1000.00,
                estado=uf,
            )
            assert proposta.estado == uf

    def test_lowercase_estado_normalized(self):
        """Lowercase UF should be normalized to uppercase."""
        from src.transformer.models import PropostaValidation

        proposta = PropostaValidation(
            transfer_gov_id="PROP-001",
            titulo="Test",
            valor_global=1000.00,
            estado="ce",  # Lowercase
        )

        assert proposta.estado == "CE"  # Should be normalized

    def test_optional_fields_can_be_none(self):
        """Optional fields should accept None values."""
        from src.transformer.models import PropostaValidation

        proposta = PropostaValidation(
            transfer_gov_id="PROP-001",
            titulo="Test",
            valor_global=1000.00,
            data_publicacao=None,
            situacao=None,
            municipio=None,
            proponente=None,
            programa_id=None,
        )

        assert proposta.transfer_gov_id == "PROP-001"

    def test_date_fields_accepted(self):
        """Date fields should accept date objects."""
        from src.transformer.models import PropostaValidation
        from datetime import date

        proposta = PropostaValidation(
            transfer_gov_id="PROP-001",
            titulo="Test",
            valor_global=1000.00,
            data_publicacao=date(2024, 1, 15),
            data_inicio_vigencia=date(2024, 2, 1),
            data_fim_vigencia=date(2024, 12, 31),
        )

        assert proposta.data_publicacao == date(2024, 1, 15)


class TestApoiadorValidation:
    """Test Pydantic validation for Apoiador records."""

    def test_valid_apoiador(self):
        """Valid apoiador should pass validation."""
        from src.transformer.models import ApoiadorValidation

        apoiador = ApoiadorValidation(
            transfer_gov_id="PROP-001",
            nome="João Silva",
            tipo="Vereador",
            orgao="Câmara Municipal",
        )

        assert apoiador.transfer_gov_id == "PROP-001"
        assert apoiador.nome == "João Silva"

    def test_empty_apoiador_id_rejected(self):
        """Empty transfer_gov_id should be rejected."""
        from src.transformer.models import ApoiadorValidation
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ApoiadorValidation(transfer_gov_id="", nome="Test")


class TestEmendaValidation:
    """Test Pydantic validation for Emenda records."""

    def test_valid_emenda(self):
        """Valid emenda should pass validation."""
        from src.transformer.models import EmendaValidation

        emenda = EmendaValidation(
            transfer_gov_id="PROP-001",
            numero="EMENDA-001",
            autor="Deputado Test",
            valor=50000.00,
            tipo="Impositiva",
            ano=2024,
        )

        assert emenda.transfer_gov_id == "PROP-001"
        assert emenda.valor == 50000.00
        assert emenda.ano == 2024

    def test_negative_emenda_valor_rejected(self):
        """Negative valor should be rejected."""
        from src.transformer.models import EmendaValidation
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            EmendaValidation(transfer_gov_id="PROP-001", valor=-1000.00)


class TestProgramaValidation:
    """Test Pydantic validation for Programa records."""

    def test_valid_programa(self):
        """Valid programa should pass validation."""
        from src.transformer.models import ProgramaValidation

        programa = ProgramaValidation(
            transfer_gov_id="PROGRAMA-001",
            nome="PRONAF",
            orgao_superior="MDA",
            modalidade="Apoio",
        )

        assert programa.transfer_gov_id == "PROGRAMA-001"
        assert programa.nome == "PRONAF"

    def test_empty_programa_id_rejected(self):
        """Empty transfer_gov_id should be rejected."""
        from src.transformer.models import ProgramaValidation
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ProgramaValidation(transfer_gov_id="", nome="Test")


class TestDataFrameValidation:
    """Test batch DataFrame validation."""

    def test_validate_dataframe_all_valid(self):
        """DataFrame with all valid records should return all as valid."""
        from src.transformer.validator import validate_dataframe
        import polars as pl

        df = pl.DataFrame(
            {
                "transfer_gov_id": ["PROP-001", "PROP-002"],
                "titulo": ["Test 1", "Test 2"],
                "valor_global": [1000.00, 2000.00],
                "estado": ["CE", "BA"],
            }
        )

        valid_records, errors = validate_dataframe(df, "propostas")

        assert len(valid_records) == 2, (
            f"Expected 2 valid records, got {len(valid_records)}"
        )
        assert len(errors) == 0, f"Expected 0 errors, got {len(errors)}"

    def test_validate_dataframe_with_invalid(self):
        """DataFrame with mix of valid/invalid records should split correctly."""
        from src.transformer.validator import validate_dataframe
        import polars as pl

        df = pl.DataFrame(
            {
                "transfer_gov_id": ["PROP-001", "", "PROP-003"],  # Second ID is empty
                "titulo": ["Test 1", "Test 2", "Test 3"],
                "valor_global": [1000.00, 2000.00, 3000.00],
                "estado": ["CE", "BA", "MG"],
            }
        )

        valid_records, errors = validate_dataframe(df, "propostas")

        assert len(valid_records) == 2, (
            f"Expected 2 valid records, got {len(valid_records)}"
        )
        assert len(errors) == 1, f"Expected 1 error, got {len(errors)}"
        assert "row" in errors[0], "Error should contain row data"
        assert "errors" in errors[0], "Error should contain error details"

    def test_validate_dataframe_mixed_validation_types(self):
        """DataFrame with various validation errors should capture all."""
        from src.transformer.validator import validate_dataframe
        import polars as pl

        df = pl.DataFrame(
            {
                "transfer_gov_id": ["PROP-001", "PROP-002", "PROP-003", "PROP-004"],
                "titulo": ["Test 1", "Test 2", "Test 3", "Test 4"],
                "valor_global": [
                    1000.00,
                    -500.00,
                    3000.00,
                    4000.00,
                ],  # Second is negative
                "estado": ["CE", "XX", "PE", "SP"],  # Second has invalid UF
            }
        )

        valid_records, errors = validate_dataframe(df, "propostas")

        # Row 0: PROP-001 - valid
        # Row 1: PROP-002 - INVALID (both negative valor AND invalid UF)
        # Row 2: PROP-003 - valid
        # Row 3: PROP-004 - valid

        assert len(valid_records) == 3, (
            f"Expected 3 valid records, got {len(valid_records)}"
        )
        assert len(errors) == 1, (
            f"Expected 1 error (row with multiple issues), got {len(errors)}"
        )
        assert "row" in errors[0], "Error should contain row data"
        assert "errors" in errors[0], "Error should contain error details"

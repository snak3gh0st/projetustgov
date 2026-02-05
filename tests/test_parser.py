"""Tests for file parser module (encoding detection, Excel/CSV parsing, schema validation)."""

import pytest
from pathlib import Path

# Test fixtures will be created by conftest.py setup
FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestEncodingDetection:
    """Test encoding detection functionality."""

    def test_detect_encoding_utf8(self):
        """UTF-8 encoded file should be detected correctly."""
        from src.parser.encoding import detect_encoding

        # Create a UTF-8 encoded file
        test_file = FIXTURES_DIR / "encoding_utf8_test.csv"
        test_file.write_text("id,name\n1,test", encoding="utf-8")

        encoding = detect_encoding(str(test_file))
        assert encoding in ["utf8", "utf-8"], f"Expected UTF-8, got {encoding}"
        test_file.unlink()

    def test_detect_encoding_latin1(self):
        """Windows-1252/Latin-1 encoded file should be detected and normalized."""
        from src.parser.encoding import detect_encoding

        # Create a Latin-1 encoded file with Portuguese characters
        test_file = FIXTURES_DIR / "encoding_latin1_test.csv"
        test_file.write_bytes("id,nome\n1,José\n2,Caçamba".encode("windows-1252"))

        encoding = detect_encoding(str(test_file))
        # Should normalize to windows-1252
        assert encoding == "windows-1252", f"Expected windows-1252, got {encoding}"
        test_file.unlink()

    def test_detect_encoding_fallback_utf8(self):
        """Unknown encoding should fallback to UTF-8."""
        from src.parser.encoding import detect_encoding

        # Create a simple UTF-8 file
        test_file = FIXTURES_DIR / "encoding_unknown_test.csv"
        test_file.write_text("id,name\n1,test", encoding="utf-8")

        encoding = detect_encoding(str(test_file))
        assert encoding in ["utf8", "utf-8"], f"Expected UTF-8 fallback, got {encoding}"
        test_file.unlink()


class TestExcelParsing:
    """Test Excel file parsing functionality."""

    def test_parse_excel_propostas(self):
        """Parse sample_propostas.xlsx and verify structure."""
        from src.parser.file_parser import parse_file
        import polars as pl

        df = parse_file(str(FIXTURES_DIR / "sample_propostas.xlsx"), "propostas")

        assert isinstance(df, pl.DataFrame), "Should return Polars DataFrame"
        assert df.shape[0] == 5, f"Expected 5 rows, got {df.shape[0]}"
        assert "transfer_gov_id" in df.columns, "Missing transfer_gov_id column"
        assert "titulo" in df.columns, "Missing titulo column"
        assert "valor_global" in df.columns, "Missing valor_global column"

    def test_parse_excel_apoiadores(self):
        """Parse sample_apoiadores.xlsx and verify structure."""
        from src.parser.file_parser import parse_file
        import polars as pl

        df = parse_file(str(FIXTURES_DIR / "sample_apoiadores.xlsx"), "apoiadores")

        assert isinstance(df, pl.DataFrame), "Should return Polars DataFrame"
        assert df.shape[0] == 3, f"Expected 3 rows, got {df.shape[0]}"
        assert "transfer_gov_id" in df.columns

    def test_parse_excel_emendas(self):
        """Parse sample_emendas.xlsx and verify structure."""
        from src.parser.file_parser import parse_file
        import polars as pl

        df = parse_file(str(FIXTURES_DIR / "sample_emendas.xlsx"), "emendas")

        assert isinstance(df, pl.DataFrame), "Should return Polars DataFrame"
        assert df.shape[0] == 3, f"Expected 3 rows, got {df.shape[0]}"
        assert "transfer_gov_id" in df.columns
        assert "valor" in df.columns

    def test_parse_excel_programas(self):
        """Parse sample_programas.xlsx and verify structure."""
        from src.parser.file_parser import parse_file
        import polars as pl

        df = parse_file(str(FIXTURES_DIR / "sample_programas.xlsx"), "programas")

        assert isinstance(df, pl.DataFrame), "Should return Polars DataFrame"
        assert df.shape[0] == 4, f"Expected 4 rows, got {df.shape[0]}"
        assert "transfer_gov_id" in df.columns
        assert "nome" in df.columns


class TestCSVParsing:
    """Test CSV file parsing with encoding detection."""

    def test_parse_csv_with_encoding(self):
        """Parse Latin-1 CSV and verify Portuguese characters are preserved."""
        from src.parser.file_parser import parse_file
        import polars as pl

        df = parse_file(str(FIXTURES_DIR / "sample_propostas_latin1.csv"), "propostas")

        assert isinstance(df, pl.DataFrame), "Should return Polars DataFrame"
        assert df.shape[0] == 5, f"Expected 5 rows, got {df.shape[0]}"

        # Verify Portuguese characters are preserved (not garbled)
        titulos = df["titulo"].to_list()
        assert any("Aração" in t for t in titulos), (
            "Portuguese character 'çã' not preserved"
        )
        assert any("Infraestrutura" in t for t in titulos), (
            "Portuguese text not parsed correctly"
        )


class TestSchemaValidation:
    """Test schema validation for required columns."""

    def test_parse_missing_columns_raises_error(self):
        """Parsing file with missing required columns should raise SchemaValidationError."""
        from src.parser.file_parser import parse_file
        from src.parser.schemas import SchemaValidationError

        # Create a file with missing columns
        import polars as pl

        incomplete_data = pl.DataFrame(
            {
                "transfer_gov_id": ["TEST-001"],
                "titulo": ["Test"],  # Missing valor_global, estado, etc.
            }
        )
        incomplete_file = FIXTURES_DIR / "incomplete_test.xlsx"
        incomplete_data.write_excel(str(incomplete_file))

        with pytest.raises(SchemaValidationError):
            parse_file(str(incomplete_file), "propostas")

        incomplete_file.unlink()

    def test_validate_schema_propostas_columns(self):
        """Validate that propostas schema checks required columns."""
        from src.parser.schemas import validate_schema, EXPECTED_COLUMNS
        import polars as pl

        # Complete data
        complete_df = pl.DataFrame(
            {
                "transfer_gov_id": ["TEST-001"],
                "titulo": ["Test"],
                "valor_global": [1000.00],
                "valor_repasse": [800.00],
                "valor_contrapartida": [200.00],
                "situacao": ["Em análise"],
                "estado": ["SP"],
                "municipio": ["São Paulo"],
                "proponente": ["Prefeitura"],
                "programa_id": ["PROG-001"],
            }
        )

        # Should not raise
        validate_schema(complete_df, "propostas")

        # Missing column
        incomplete_df = pl.DataFrame(
            {
                "transfer_gov_id": ["TEST-001"],
                "titulo": ["Test"],
                "valor_global": [1000.00],
                # Missing other required columns
            }
        )

        from src.parser.schemas import SchemaValidationError

        with pytest.raises(SchemaValidationError):
            validate_schema(incomplete_df, "propostas")


class TestEmptyFileHandling:
    """Test handling of empty files."""

    def test_parse_empty_file_raises_error(self):
        """Parsing empty file should raise EmptyFileError."""
        from src.parser.file_parser import parse_file
        from src.parser.schemas import EmptyFileError

        # Create empty file
        empty_file = FIXTURES_DIR / "empty_test.xlsx"
        import polars as pl

        empty_df = pl.DataFrame(
            {
                "transfer_gov_id": pl.Series([], dtype=pl.Utf8),
                "titulo": pl.Series([], dtype=pl.Utf8),
            }
        )
        empty_df.write_excel(str(empty_file))

        with pytest.raises(EmptyFileError):
            parse_file(str(empty_file), "propostas")

        empty_file.unlink()

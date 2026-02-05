"""Encoding detection for file parsing with fallback chain."""

from charset_normalizer import from_path
from loguru import logger


def detect_encoding(file_path: str) -> str:
    """
    Detect file encoding using charset-normalizer with fallback chain.

    Args:
        file_path: Path to the file to analyze

    Returns:
        Normalized encoding string (utf8, windows-1252, etc.)
    """
    try:
        result = from_path(file_path)
        best = result.best()

        if best is not None:
            encoding = best.encoding
            logger.debug(f"Detected encoding: {encoding} for {file_path}")

            # Normalize encoding names for Polars compatibility
            normalized = _normalize_encoding(encoding)
            logger.debug(f"Normalized encoding: {normalized}")
            return normalized
        else:
            logger.warning(
                f"Could not detect encoding for {file_path}, falling back to utf8"
            )
            return "utf8"

    except Exception as e:
        logger.error(f"Error detecting encoding for {file_path}: {e}")
        # Safe fallback - try UTF-8
        return "utf8"


def _normalize_encoding(encoding: str) -> str:
    """
    Normalize encoding names to Polars-compatible values.

    Polars uses:
    - utf8 for UTF-8
    - windows-1252 for Windows-1252/Latin-1

    charset-normalizer may return various names:
    - ascii -> utf8
    - utf-8 -> utf8
    - iso-8859-1 -> windows-1252
    - latin-1 -> windows-1252
    - cp1252 -> windows-1252
    """
    encoding_map = {
        "ascii": "utf8",
        "utf-8": "utf8",
        "utf8": "utf8",
        "iso-8859-1": "windows-1252",
        "iso-8859-15": "windows-1252",
        "latin-1": "windows-1252",
        "latin1": "windows-1252",
        "cp1252": "windows-1252",
        "cp1250": "windows-1252",  # Windows Central European
        "windows-1250": "windows-1252",
        "windows-1252": "windows-1252",
    }

    normalized = encoding.lower().strip()
    return encoding_map.get(normalized, normalized)

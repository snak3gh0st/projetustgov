"""BrasilAPI integration for CNPJ data enrichment.

BrasilAPI provides free access to Receita Federal data without aggressive rate limits.
API docs: https://brasilapi.com.br/docs#tag/CNPJ
"""

import httpx
from typing import Optional
from loguru import logger


class BrasilAPIClient:
    """Client for BrasilAPI CNPJ lookups."""

    BASE_URL = "https://brasilapi.com.br/api/cnpj/v1"
    TIMEOUT = 30.0  # seconds

    def __init__(self, timeout: float = TIMEOUT):
        """Initialize BrasilAPI client.

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self.client = httpx.Client(timeout=timeout, follow_redirects=True)

    def get_cnpj_data(self, cnpj: str) -> Optional[dict]:
        """Fetch CNPJ data from BrasilAPI.

        Args:
            cnpj: CNPJ number (with or without formatting)

        Returns:
            Dict with company data or None if not found/error

        Example response:
        {
            "cnpj": "00000000000191",
            "razao_social": "BANCO DO BRASIL SA",
            "nome_fantasia": "BANCO DO BRASIL",
            "cnae_fiscal": 6421200,
            "descricao_tipo_logradouro": "SBS",
            "logradouro": "QUADRA 1 BLOCO G LOTE 32",
            "numero": "SN",
            "complemento": "ANDAR 1 AO 16 ED SEDE I",
            "bairro": "ASA SUL",
            "cep": "70073901",
            "uf": "DF",
            "codigo_municipio": 9701,
            "municipio": "BRASILIA",
            "ddd_telefone_1": "6140002001",
            "ddd_telefone_2": "",
            "email": "sic@bb.com.br",
            ...
        }
        """
        # Clean CNPJ (remove dots, slashes, dashes)
        cnpj_clean = ''.join(c for c in cnpj if c.isdigit())

        if len(cnpj_clean) != 14:
            logger.warning(f"Invalid CNPJ length: {cnpj} ({len(cnpj_clean)} digits)")
            return None

        url = f"{self.BASE_URL}/{cnpj_clean}"

        try:
            response = self.client.get(url)

            if response.status_code == 200:
                data = response.json()
                logger.debug(f"Successfully fetched CNPJ data for {cnpj_clean}")
                return data
            elif response.status_code == 404:
                logger.debug(f"CNPJ not found in BrasilAPI: {cnpj_clean}")
                return None
            elif response.status_code == 429:
                logger.warning(f"BrasilAPI rate limit hit for {cnpj_clean}")
                return None
            else:
                logger.warning(
                    f"BrasilAPI returned status {response.status_code} for {cnpj_clean}"
                )
                return None

        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching CNPJ data for {cnpj_clean}")
            return None
        except Exception as e:
            logger.error(f"Error fetching CNPJ data for {cnpj_clean}: {e}")
            return None

    def extract_contact_info(self, cnpj_data: dict) -> dict:
        """Extract contact information from BrasilAPI response.

        Args:
            cnpj_data: Response from get_cnpj_data()

        Returns:
            Dict with email and telefone fields (may be empty strings)
        """
        if not cnpj_data:
            return {"email": "", "telefone": ""}

        # Extract email (handle None values)
        email_raw = cnpj_data.get("email")
        email = email_raw.strip() if email_raw else ""

        # Extract primary phone (ddd_telefone_1)
        telefone_raw = cnpj_data.get("ddd_telefone_1")
        telefone = telefone_raw.strip() if telefone_raw else ""

        # If no primary phone, try secondary
        if not telefone:
            telefone_raw = cnpj_data.get("ddd_telefone_2")
            telefone = telefone_raw.strip() if telefone_raw else ""

        return {
            "email": email if email else "",
            "telefone": telefone if telefone else "",
        }

    def enrich_proponente(self, cnpj: str) -> dict:
        """Fetch and extract contact info for a proponente.

        Convenience method that combines get_cnpj_data() and extract_contact_info().

        Args:
            cnpj: CNPJ number

        Returns:
            Dict with email and telefone fields
        """
        cnpj_data = self.get_cnpj_data(cnpj)
        return self.extract_contact_info(cnpj_data)

    def close(self):
        """Close HTTP client."""
        self.client.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

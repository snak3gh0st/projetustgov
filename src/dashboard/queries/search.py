"""Cross-entity search queries for global search functionality.

This module provides unified search across proponentes, propostas, and programas,
returning ranked results based on entity type and relevance.
"""

import pandas as pd
import streamlit as st

from src.dashboard.config import run_query


@st.cache_data(ttl="5m")
def search_entities(search_term: str, limit: int = 20) -> pd.DataFrame:
    """Search across proponentes, propostas, and programas with unified ranking.

    Uses UNION ALL to combine results from three entity types with relevance scoring:
    - Proponentes (relevance_score=3) - OSC entities only
    - Propostas (relevance_score=2) - Match on titulo
    - Programas (relevance_score=1) - Match on nome

    Args:
        search_term: Search term (case-insensitive, partial match)
        limit: Maximum number of results to return (default: 20)

    Returns:
        DataFrame with columns:
        - entity_type: Type of entity ("proponente", "proposta", "programa")
        - id: Entity's transfer_gov_id or CNPJ
        - nome: Entity name
        - cnpj: CNPJ for proponentes, NULL for others
        - relevance_score: Ranking score (3=proponente, 2=proposta, 1=programa)

    Note:
        Uses parameterized query to prevent SQL injection.
        Results sorted by relevance_score DESC, then nome ASC.
    """
    # Parameterized search pattern (ILIKE is case-insensitive)
    search_pattern = f"%{search_term}%"

    query = """
        -- Proponentes (highest relevance for direct lead matches)
        SELECT
            'proponente' as entity_type,
            cnpj as id,
            nome,
            cnpj,
            3 as relevance_score
        FROM proponentes
        WHERE is_osc = TRUE
          AND (nome ILIKE :search_pattern OR cnpj LIKE :search_pattern)

        UNION ALL

        -- Propostas (medium relevance for opportunity discovery)
        SELECT
            'proposta' as entity_type,
            transfer_gov_id as id,
            titulo as nome,
            NULL as cnpj,
            2 as relevance_score
        FROM propostas
        WHERE titulo ILIKE :search_pattern

        UNION ALL

        -- Programas (lowest relevance for context/filtering)
        SELECT
            'programa' as entity_type,
            transfer_gov_id as id,
            nome,
            NULL as cnpj,
            1 as relevance_score
        FROM programas
        WHERE nome ILIKE :search_pattern

        ORDER BY relevance_score DESC, nome ASC
        LIMIT :limit
    """

    df = run_query(query, params={"search_pattern": search_pattern, "limit": limit})
    return df

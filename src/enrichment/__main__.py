"""Allow running enrichment as: python -m src.enrichment"""

from .cli import enrichment

if __name__ == "__main__":
    enrichment()

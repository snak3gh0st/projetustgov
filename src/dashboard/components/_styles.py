"""Embedded CSS for st.html() iframe components.

st.html() renders in isolated iframes that don't inherit the main page's CSS.
This module provides the component CSS as an embeddable string so each iframe
is self-contained with its own styles and dark background.
"""

from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def _load_component_css() -> str:
    """Load and cache the component CSS file content."""
    css_path = Path(__file__).parent.parent / "assets" / "styles" / "components.css"
    if css_path.exists():
        return css_path.read_text()
    return ""


def get_iframe_styles() -> str:
    """Return a <style> block for use inside st.html() iframes.

    Includes:
    - Transparent iframe body (blends with dark Streamlit background)
    - All component CSS classes (KPI cards, badges, etc.)
    - Font imports for Space Grotesk and Inter
    """
    component_css = _load_component_css()
    return f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400;600&display=swap');
html, body {{
    background: transparent !important;
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    color: #E8F4FD;
}}
:root {{
    --font-heading: 'Space Grotesk', sans-serif;
    --font-body: 'Inter', sans-serif;
    --sigma-bg-primary: #050B1F;
    --sigma-bg-secondary: #0A1628;
    --sigma-text-primary: #E8F4FD;
    --sigma-text-secondary: rgba(232, 244, 253, 0.7);
    --sigma-accent-neon: #00D4FF;
    --sigma-glass-bg: rgba(255, 255, 255, 0.05);
    --sigma-glass-border: rgba(0, 212, 255, 0.3);
    --color-success: #10B981;
    --color-info: #3B82F6;
    --color-warning: #F59E0B;
    --color-error: #EF4444;
    --color-neutral: #6B7280;
}}
{component_css}
</style>"""

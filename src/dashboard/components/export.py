"""CSV export component for downloading filtered data."""

import pandas as pd
import streamlit as st


def render_csv_export(df: pd.DataFrame, filename: str) -> None:
    """Render a download button for exporting DataFrame as CSV.

    Args:
        df: DataFrame to export
        filename: Name for the downloaded file (should end with .csv)
    """
    if df.empty:
        st.info("Nenhum dado para exportar.")
        return

    # Convert DataFrame to CSV with proper UTF-8 encoding for Portuguese characters
    csv_data = df.to_csv(index=False).encode("utf-8")

    st.download_button(
        label=f"📥 Exportar CSV ({len(df)} registros)",
        data=csv_data,
        file_name=filename,
        mime="text/csv",
        help="Download dos dados filtrados em formato CSV",
    )

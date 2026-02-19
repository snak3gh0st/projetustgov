"""
Bot message translations for PROJETUS alerting.

Supported languages: pt-BR, en-US
Default: pt-BR
"""

MESSAGES = {
    "pt-BR": {
        "severity_critical": "[CRITICO]",
        "severity_warning": "[AVISO]",
        "severity_info": "[INFO]",
        # Volume alerts
        "volume_first_run": "Primeira execucao com contagens: {entities}",
        "volume_comparison": "Comparacao de volume:\n{changes}",
        "volume_normal": "Volume normal: {change_pct}% de variacao",
        "volume_normal_first": "Volume normal: Primeira extracao",
        "volume_normal_no_prev": "Volume normal: Nenhuma extracao anterior para comparar",
        "volume_anomaly": "Anomalia de volume: {change_pct}% de variacao ({prev} -> {curr} registros totais)",
        "volume_spike": "Pico de volume: {curr} vs {prev} anterior",
        "volume_anomaly_first": "Anomalia de volume detectada (primeira comparacao)",
        "volume_entry_new": "{entity}: {count} (novo)",
        # Scheduler alerts
        "scheduler_miss_no_records": "Falha no agendador: Nenhum registro de extracao encontrado. Esperado ate {expected}",
        "scheduler_miss_overdue": "Falha no agendador: Ultima extracao com {hours:.1f}h de atraso. Esperado ate {expected}, ultima em {last}",
        "scheduler_healthy": "Agendador saudavel: Ultima execucao em {last}",
        "scheduler_degraded": "Agendador degradado: Ultima extracao em {last}, esperado ate {expected}",
    },
    "en-US": {
        "severity_critical": "[CRITICAL]",
        "severity_warning": "[WARNING]",
        "severity_info": "[INFO]",
        # Volume alerts
        "volume_first_run": "First extraction run with counts: {entities}",
        "volume_comparison": "Volume comparison:\n{changes}",
        "volume_normal": "Volume normal: {change_pct}% change",
        "volume_normal_first": "Volume normal: First extraction",
        "volume_normal_no_prev": "Volume normal: No previous extraction to compare",
        "volume_anomaly": "Volume anomaly: {change_pct}% change ({prev} -> {curr} total records)",
        "volume_spike": "Volume spike: {curr} vs {prev} previously",
        "volume_anomaly_first": "Volume anomaly detected (first run comparison)",
        "volume_entry_new": "{entity}: {count} (new)",
        # Scheduler alerts
        "scheduler_miss_no_records": "Scheduler miss: No extraction records found. Expected by {expected}",
        "scheduler_miss_overdue": "Scheduler miss: Last extraction was {hours:.1f} hours overdue. Expected by {expected}, last ran at {last}",
        "scheduler_healthy": "Scheduler healthy: Last ran at {last}",
        "scheduler_degraded": "Scheduler degraded: Last extraction was at {last}, expected by {expected}",
    },
}

DEFAULT_LANGUAGE = "pt-BR"


def get_lang() -> str:
    """Read current language from bot_config table in PostgreSQL.

    Falls back to DEFAULT_LANGUAGE if DB is unavailable or table doesn't exist.
    """
    import os
    try:
        import psycopg2
        db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
        if not db_url:
            return DEFAULT_LANGUAGE
        conn = psycopg2.connect(db_url, connect_timeout=3, sslmode="require")
        cur = conn.cursor()
        cur.execute("SELECT value FROM bot_config WHERE key = 'language' LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row[0] in MESSAGES:
            return row[0]
        return DEFAULT_LANGUAGE
    except Exception:
        return DEFAULT_LANGUAGE


def t(key: str, lang: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """Translate a message key to the given language with optional format args."""
    lang_dict = MESSAGES.get(lang, MESSAGES[DEFAULT_LANGUAGE])
    template = lang_dict.get(key, MESSAGES[DEFAULT_LANGUAGE].get(key, key))
    if kwargs:
        try:
            return template.format(**kwargs)
        except KeyError:
            return template
    return template

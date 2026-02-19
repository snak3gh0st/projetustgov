---
phase: quick-27
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/bot-config/route.ts
  - web/src/app/configuracoes/page.tsx
  - web/src/components/Sidebar.tsx
  - src/monitor/alerting.py
  - src/monitor/bot_messages.py
  - src/monitor/volume_alerts.py
  - src/monitor/scheduler_health.py
autonomous: true
requirements: [QUICK-27]

must_haves:
  truths:
    - "Gestor can open /configuracoes and see bot language selector (pt-BR / en-US)"
    - "Selecting a language saves it to DB via PUT /api/bot-config"
    - "Telegram alert messages render in the selected language"
    - "Python alerting reads language from DB and applies correct translations"
  artifacts:
    - path: "web/src/app/api/bot-config/route.ts"
      provides: "GET/PUT endpoint for bot_config table"
      exports: ["GET", "PUT"]
    - path: "web/src/app/configuracoes/page.tsx"
      provides: "Gestor settings page with language picker"
    - path: "src/monitor/bot_messages.py"
      provides: "Translation dict for all bot message strings"
      contains: "MESSAGES"
  key_links:
    - from: "web/src/app/configuracoes/page.tsx"
      to: "/api/bot-config"
      via: "fetch PUT on language change"
      pattern: "fetch.*api/bot-config"
    - from: "src/monitor/alerting.py"
      to: "src/monitor/bot_messages.py"
      via: "import MESSAGES, get_lang()"
      pattern: "from .bot_messages import"
---

<objective>
Add multi-language support to Telegram/email alert bots (pt-BR and en-US) with language selection configurable from the CRM dashboard by the gestor.

Purpose: Vendedores and gestores operate in Portuguese, but the system sends English-only alert messages. This makes alerts hard to act on quickly. Language should be switchable from the dashboard without code deployment.

Output: A `bot_config` DB table, a `/configuracoes` settings page (gestor-only), an `/api/bot-config` API route, and a `bot_messages.py` translation module consumed by the Python alerting layer.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/commission-config/route.ts
@web/src/components/Sidebar.tsx
@web/src/app/layout.tsx
@src/monitor/alerting.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: bot_config table + /api/bot-config endpoint + /configuracoes dashboard page</name>
  <files>
    web/src/app/api/bot-config/route.ts
    web/src/app/configuracoes/page.tsx
    web/src/components/Sidebar.tsx
  </files>
  <action>
**Step A — bot_config table migration (inline in GET handler).**

In `web/src/app/api/bot-config/route.ts`, auto-create the table on first GET (same pattern as setup-crm):

```sql
CREATE TABLE IF NOT EXISTS bot_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
INSERT INTO bot_config (key, value)
VALUES ('language', 'pt-BR')
ON CONFLICT (key) DO NOTHING;
```

- `GET /api/bot-config` — requires gestor session, returns `{ language: string }` (reads `key='language'` row)
- `PUT /api/bot-config` — requires gestor session, body `{ language: 'pt-BR' | 'en-US' }`, UPSERTs the row, returns `{ success: true, language }`
- Validate language is one of `['pt-BR', 'en-US']`, return 400 otherwise

**Step B — /configuracoes settings page.**

Create `web/src/app/configuracoes/page.tsx` as a server component with client island:

- Server component: reads session via `getApiSession()` (import from `@/lib/dal`), redirects to `/` if role !== 'gestor' (use `import { redirect } from 'next/navigation'`)
- Client island `'use client'`: fetches GET /api/bot-config on mount, renders a card titled "Configuracoes do Bot"
- Language selector: two radio buttons or a `<select>` — "Portugues (pt-BR)" and "English (en-US)"
- On change: calls PUT /api/bot-config with selected language, shows success toast using a simple inline `<div>` state (no external toast library) — green banner "Idioma salvo!" that fades after 2s via `setTimeout(() => setSaved(false), 2000)`
- Style matches existing pages: white card, rounded-xl, Tailwind, blue brand color `#0072F7` for the save button

**Step C — add Configuracoes to Sidebar (gestor-only).**

In `web/src/components/Sidebar.tsx`:
- Add a `'settings'` case to `NavIcon` switch returning a cog SVG:
  ```jsx
  case 'settings':
    return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ```
- In the gestor nav items array, append `{ href: '/configuracoes', label: 'Configuracoes', icon: 'settings' }` after 'Usuarios'
  </action>
  <verify>
    1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero TypeScript errors
    2. `curl -s http://localhost:3000/api/bot-config` — returns 401 (unauthorized)
    3. After login as gestor, GET /api/bot-config returns `{ language: "pt-BR" }`
    4. PUT /api/bot-config with `{ "language": "en-US" }` returns `{ success: true, language: "en-US" }`
    5. PUT with `{ "language": "es" }` returns 400
    6. Visit /configuracoes as gestor — page loads with language selector showing current value
    7. Sidebar shows "Configuracoes" nav item for gestor only
  </verify>
  <done>
    - bot_config table exists in PostgreSQL with a 'language' row defaulting to 'pt-BR'
    - GET and PUT /api/bot-config work with gestor auth
    - /configuracoes page renders language selector, persists changes to DB
    - Sidebar shows Configuracoes link for gestor role only
  </done>
</task>

<task type="auto">
  <name>Task 2: bot_messages.py translation module + alerting.py reads language from DB</name>
  <files>
    src/monitor/bot_messages.py
    src/monitor/alerting.py
    src/monitor/volume_alerts.py
    src/monitor/scheduler_health.py
  </files>
  <action>
**Step A — Create `src/monitor/bot_messages.py`.**

Translation module with all bot message strings for pt-BR and en-US:

```python
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
```

**Step B — Update `src/monitor/alerting.py`.**

Replace hardcoded `_get_severity_prefix` with a language-aware version:

```python
from .bot_messages import get_lang, t

def _get_severity_prefix(severity: str, lang: str = None) -> str:
    if lang is None:
        lang = get_lang()
    key = {
        "CRITICAL": "severity_critical",
        "WARNING": "severity_warning",
        "INFO": "severity_info",
    }.get(severity.upper(), "severity_info")
    return t(key, lang)
```

Update `send_telegram_alert` and `send_email_alert` to call `get_lang()` once at the top and pass `lang` to `_get_severity_prefix`.

**Step C — Update `src/monitor/volume_alerts.py`.**

Update `get_volume_alert_message` to use translated strings via `t()`. Import `from .bot_messages import get_lang, t` at top. Replace all hardcoded English strings:
- `"First extraction run with counts: {entities}"` → `t("volume_first_run", lang, entities=entities_str)`
- `"Volume comparison:\n{changes}"` → `t("volume_comparison", lang, changes=changes_str)`
- `"volume_entry_new"` for new entities
- In `check_volume_anomaly`, replace `"Volume normal: ..."`, `"Volume anomaly: ..."`, `"Volume spike: ..."` strings with `t(...)` calls

Call `lang = get_lang()` once at function start for functions that format messages.

**Step D — Update `src/monitor/scheduler_health.py`.**

Import `from .bot_messages import get_lang, t`. Replace all English scheduler message strings with `t(...)` calls:
- `check_scheduler_health` return messages → `t("scheduler_miss_no_records", ...)`, `t("scheduler_miss_overdue", ...)`, `t("scheduler_healthy", ...)`
- `get_scheduler_status` `details` field → use `t("scheduler_healthy", ...)` or `t("scheduler_degraded", ...)`
  </action>
  <verify>
    1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov && python -c "from src.monitor.bot_messages import t, get_lang; print(t('severity_critical', 'pt-BR')); print(t('severity_critical', 'en-US'))"` — prints `[CRITICO]` then `[CRITICAL]`
    2. `python -c "from src.monitor.alerting import _get_severity_prefix; print(_get_severity_prefix('CRITICAL', 'pt-BR'))"` — prints `[CRITICO]`
    3. `python -c "from src.monitor.volume_alerts import get_volume_alert_message; print(get_volume_alert_message({'prog': 100}, None, 10))"` — no import errors
    4. `python -c "from src.monitor.scheduler_health import get_scheduler_status"` — no import errors
    5. After setting language to 'en-US' via PUT /api/bot-config, `get_lang()` returns 'en-US' (requires DB access)
  </verify>
  <done>
    - `src/monitor/bot_messages.py` exists with MESSAGES dict for pt-BR and en-US, plus `get_lang()` and `t()` helpers
    - `alerting.py` uses language-aware severity prefixes
    - `volume_alerts.py` and `scheduler_health.py` produce translated messages
    - Language switch in dashboard propagates to bot messages without code deployment
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit`
2. Python imports clean: `python -c "from src.monitor.bot_messages import MESSAGES; assert 'pt-BR' in MESSAGES and 'en-US' in MESSAGES"`
3. As gestor: navigate to /configuracoes, switch language to English, save — confirm "Idioma salvo!" confirmation appears
4. GET /api/bot-config returns `{ language: "en-US" }` after save
5. Sidebar shows Configuracoes link for gestor, hidden from vendedor
</verification>

<success_criteria>
- bot_config table exists in DB with language row (default pt-BR)
- /configuracoes page accessible to gestor, hidden from other roles (redirect to /)
- Language selection persists across page reloads (reads from DB)
- Python alert messages render in the configured language
- No TypeScript errors, no Python import errors
</success_criteria>

<output>
After completion, create `.planning/quick/27-i-need-to-add-more-languages-supports-to/27-SUMMARY.md`
</output>

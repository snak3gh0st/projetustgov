---
phase: quick-27
plan: "01"
subsystem: bot-alerting + crm-settings
tags: [i18n, telegram, alerting, settings, gestor]
dependency_graph:
  requires: [bot_config table auto-created, psycopg2, Railway PostgreSQL]
  provides: [GET /api/bot-config, PUT /api/bot-config, /configuracoes page, bot_messages.py translations]
  affects: [alerting.py, volume_alerts.py, scheduler_health.py, Sidebar.tsx]
tech_stack:
  added: [bot_messages.py translation module]
  patterns: [inline table auto-init, language-aware t() helper, get_lang() DB fallback]
key_files:
  created:
    - web/src/app/api/bot-config/route.ts
    - web/src/app/configuracoes/page.tsx
    - web/src/app/configuracoes/ConfiguracoesClient.tsx
    - src/monitor/bot_messages.py
  modified:
    - web/src/components/Sidebar.tsx
    - src/monitor/alerting.py
    - src/monitor/volume_alerts.py
    - src/monitor/scheduler_health.py
decisions:
  - "Auto-create bot_config table on first GET (same inline migration pattern as setup-crm)"
  - "get_lang() falls back to pt-BR silently — no crash if DB unavailable"
  - "t() helper falls back through en-US -> key if translation missing"
  - "ConfiguracoesClient is a separate file ('use client') keeping page.tsx as a pure server component"
  - "Language change is immediate on radio select — no separate save button needed"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-02-19"
  tasks_completed: 2
  files_modified: 8
---

# Quick Task 27: Multi-language bot alerts with gestor language selector

**One-liner:** pt-BR / en-US language support for Telegram/email alerting, switchable from /configuracoes settings page backed by bot_config PostgreSQL table.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | bot_config table + /api/bot-config endpoint + /configuracoes page | 0b8f8db | route.ts, page.tsx, ConfiguracoesClient.tsx, Sidebar.tsx |
| 2 | bot_messages.py translation module + alerting wired to language-aware messages | 60cfe41 | bot_messages.py, alerting.py, volume_alerts.py, scheduler_health.py |

## What Was Built

### Task 1: CRM Settings Infrastructure

**`web/src/app/api/bot-config/route.ts`**
- GET: requires gestor session, auto-creates `bot_config` table + seeds `language='pt-BR'` on first request, returns `{ language: string }`
- PUT: requires gestor session, validates language against `['pt-BR', 'en-US']`, UPSERTs row, returns `{ success: true, language }`
- Returns 400 on invalid language, 401/403 on auth issues

**`web/src/app/configuracoes/page.tsx`** (server component)
- Calls `verifySession()` from `@/lib/dal` — redirects to `/` if role is not `gestor`
- Renders `<ConfiguracoesClient />` client island

**`web/src/app/configuracoes/ConfiguracoesClient.tsx`** (client component)
- Fetches GET /api/bot-config on mount to load current language
- Renders two radio buttons: "Portugues (pt-BR)" and "English (en-US)"
- On change: calls PUT /api/bot-config, shows "Idioma salvo!" green banner that fades after 2s
- Blue brand color `#0072F7` for active radio, white card with rounded-xl

**`web/src/components/Sidebar.tsx`**
- Added `settings` cog SVG case to `NavIcon` switch
- Appended `{ href: '/configuracoes', label: 'Configuracoes', icon: 'settings' }` to gestor nav items only

### Task 2: Python Translation Layer

**`src/monitor/bot_messages.py`**
- `MESSAGES` dict with 17 keys for each of pt-BR and en-US covering severity prefixes, volume alerts, and scheduler alerts
- `get_lang()`: reads `bot_config.language` from PostgreSQL via psycopg2, 3s timeout, falls back to `pt-BR` on any error
- `t(key, lang, **kwargs)`: looks up key in language dict, falls back to pt-BR dict, then to key itself; applies `.format(**kwargs)` safely

**`src/monitor/alerting.py`**
- Imports `from .bot_messages import get_lang, t`
- `_get_severity_prefix(severity, lang=None)` — calls `get_lang()` when lang not provided, maps severity to translation key, returns translated string
- Both `send_telegram_alert` and `send_email_alert` call `get_lang()` once, pass `lang` to `_get_severity_prefix`

**`src/monitor/volume_alerts.py`**
- Imports `from .bot_messages import get_lang, t`
- `get_volume_alert_message()` calls `get_lang()` once, uses `t("volume_first_run", ...)`, `t("volume_comparison", ...)`, `t("volume_entry_new", ...)`
- `check_volume_anomaly()` calls `get_lang()` once, uses `t("volume_anomaly", ...)`, `t("volume_spike", ...)`, `t("volume_anomaly_first", ...)`, `t("volume_normal", ...)`, `t("volume_normal_first", ...)`, `t("volume_normal_no_prev", ...)`

**`src/monitor/scheduler_health.py`**
- Imports `from .bot_messages import get_lang, t`
- `get_scheduler_status()` uses `t("scheduler_healthy", ...)` and `t("scheduler_degraded", ...)`
- `check_scheduler_health()` uses `t("scheduler_miss_no_records", ...)`, `t("scheduler_miss_overdue", ...)`, `t("scheduler_healthy", ...)`

## Verification Results

- TypeScript: `npx tsc --noEmit` — zero errors
- `t('severity_critical', 'pt-BR')` returns `[CRITICO]`
- `t('severity_critical', 'en-US')` returns `[CRITICAL]`
- `_get_severity_prefix('CRITICAL', 'pt-BR')` returns `[CRITICO]`
- `_get_severity_prefix('CRITICAL', 'en-US')` returns `[CRITICAL]`
- `MESSAGES` dict has both `'pt-BR'` and `'en-US'` keys
- `volume_alerts.get_volume_alert_message({'prog': 100}, None, 10)` returns pt-BR string (no import errors)

## Deviations from Plan

None — plan executed exactly as written.

**Note (deferred, out of scope):** `src/monitor/scheduler_health.py` and `src/monitor/volume_alerts.py` cannot be fully imported in isolation due to a pre-existing `email-validator` missing dependency in `src/config/loader.py`. This is unrelated to our changes and was present before this task. Our translation imports (`from .bot_messages import get_lang, t`) were added correctly and verified via direct `bot_messages` and `alerting` imports.

## Self-Check: PASSED

Files created/modified verified:
- `web/src/app/api/bot-config/route.ts` — FOUND
- `web/src/app/configuracoes/page.tsx` — FOUND
- `web/src/app/configuracoes/ConfiguracoesClient.tsx` — FOUND
- `src/monitor/bot_messages.py` — FOUND
- `web/src/components/Sidebar.tsx` — MODIFIED (settings case + nav item)
- `src/monitor/alerting.py` — MODIFIED (language-aware severity prefix)
- `src/monitor/volume_alerts.py` — MODIFIED (t() calls)
- `src/monitor/scheduler_health.py` — MODIFIED (t() calls)

Commits verified:
- `0b8f8db` — feat(quick-27): Task 1
- `60cfe41` — feat(quick-27): Task 2

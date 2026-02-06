---
status: resolved
trigger: "You are debugging an AttributeError in the PROJETUS dashboard."
created: 2026-02-05T00:00:00Z
updated: 2026-02-05T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - Import resolution confusion between two config systems
test: tested Python import to verify which config system is loaded
expecting: confirmed AppConfig is loaded, needs database.url not database_url
next_action: apply fix to database.py to use correct nested attribute access

## Symptoms

expected: Dashboard loads and shows data when running `uv run streamlit run src/dashboard/streamlit_app.py`
actual: AttributeError crash on startup - 'AppConfig' object has no attribute 'database_url'
errors: AttributeError: 'AppConfig' object has no attribute 'database_url' at src/loader/database.py line 96
reproduction: Run `uv run streamlit run src/dashboard/streamlit_app.py`
started: After Phase 04-01 - dashboard foundation created, import error fixed (46b78fe), now config attribute error

## Eliminated

## Evidence

- timestamp: 2026-02-05T00:05:00Z
  checked: src/config.py (flat Settings class)
  found: Settings class with flat database_url attribute
  implication: This is the old config structure used by some parts of codebase

- timestamp: 2026-02-05T00:06:00Z
  checked: src/config/__init__.py and src/config/loader.py
  found: AppConfig class with nested database.url structure (DatabaseConfig.url)
  implication: There are TWO config systems - old flat Settings and new nested AppConfig

- timestamp: 2026-02-05T00:07:00Z
  checked: src/config/loader.py line 210
  found: get_settings is an alias for get_config (returns AppConfig, not Settings)
  implication: src/loader/database.py imports get_settings from wrong module

- timestamp: 2026-02-05T00:08:00Z
  checked: src/loader/database.py line 20
  found: "from src.config import get_settings"
  implication: This imports from src/config/__init__.py which returns AppConfig, not from src.config (the file) which would return Settings

- timestamp: 2026-02-05T00:09:00Z
  checked: AppConfig class structure
  found: AppConfig has database.url (nested), NOT database_url (flat)
  implication: The "fix" in ecccdf8 changed to settings.database_url but get_settings() returns AppConfig which needs settings.database.url

- timestamp: 2026-02-05T00:10:00Z
  checked: Git history - dffcc5f and e2e3288
  found: AppConfig introduced in phase 02-01, get_settings alias added for backward compatibility
  implication: Config migration happened before phase 04, but database.py was never properly updated

- timestamp: 2026-02-05T00:11:00Z
  checked: Python import test
  found: Confirmed "from src.config import get_settings" returns AppConfig with settings.database.url
  implication: Fix needs to revert to nested access: settings.database.url

## Resolution

root_cause: |
  Python import resolution conflict between two configuration systems:

  1. OLD SYSTEM: src/config.py (flat Settings class with database_url)
  2. NEW SYSTEM: src/config/__init__.py + src/config/loader.py (nested AppConfig with database.url)

  When src/loader/database.py imports "from src.config import get_settings":
  - Python prioritizes DIRECTORY (src/config/) over FILE (src/config.py)
  - So it imports from src/config/__init__.py which exports AppConfig-returning get_settings
  - AppConfig has nested structure: settings.database.url
  - But database.py line 96 tries to access settings.database_url (flat attribute)
  - Result: AttributeError because AppConfig doesn't have database_url attribute

  The "fix" in commit ecccdf8 was based on wrong assumption about which config was loaded.
  It changed from settings.database.url → settings.database_url
  But it should have stayed as settings.database.url because AppConfig IS being used.

fix: |
  Revert the incorrect fix in commit ecccdf8. Change line 96 back to nested access:

  Before: _engine = create_db_engine(settings.database_url)
  After:  _engine = create_db_engine(settings.database.url)

  This matches the actual AppConfig structure that get_settings() returns.
verification: |
  ✓ PASSED - Verified with test execution:

  Test: uv run python3 -c "from src.loader.database import get_engine; engine = get_engine()"
  Result: Engine created successfully, no AttributeError
  Output: "Created database engine", Engine type: Engine

  Original error was: AttributeError: 'AppConfig' object has no attribute 'database_url'
  After fix: No AttributeError, engine creation works correctly

  Verified that settings.database.url correctly accesses the nested DatabaseConfig.url attribute.

files_changed:
  - src/loader/database.py (line 96: settings.database_url → settings.database.url)

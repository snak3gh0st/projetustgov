---
phase: 01-foundation
plan: "03"
subsystem: etl
tags: [parser, validator, polars, pydantic, encoding, tdd]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Python project with uv, directory structure, config module, logger module"
provides:
  - "Encoding auto-detection using charset-normalizer"
  - "Excel/CSV file parsing via Polars"
  - "Schema validation for required columns"
  - "Pydantic validation models for 4 entity types (propostas, apoiadores, emendas, programas)"
  - "Batch DataFrame validation with error reporting"
affects: [01-04, 01-05]

# Tech tracking
tech-stack:
  added: [xlsxwriter]
  patterns: ["TDD RED-GREEN-REFACTOR cycle", "Polars for data processing", "Pydantic v2 for validation"]

key-files:
  created: [src/parser/encoding.py, src/parser/schemas.py, src/parser/file_parser.py, src/transformer/models.py, src/transformer/validator.py, tests/test_parser.py, tests/test_validator.py, tests/fixtures/sample_propostas.xlsx, tests/fixtures/sample_apoiadores.xlsx, tests/fixtures/sample_emendas.xlsx, tests/fixtures/sample_programas.xlsx, tests/fixtures/sample_propostas_latin1.csv]
  modified: [pyproject.toml, uv.lock]

key-decisions:
  - "Used charset-normalizer for encoding detection (2x faster than chardet, supports 93 encodings)"
  - "Polars read_csv in eager mode (not lazy) for encoding support per RESEARCH.md Pitfall 1"
  - "Pydantic v2 field_validator for per-field validation rules"
  - "cp1250 normalization to windows-1252 for Central European encoding compatibility"

patterns-established:
  - "Pattern: TDD workflow - RED (write failing tests) → GREEN (implement to pass) → REFACTOR (if needed)"
  - "Pattern: Encoding normalization function handles all Windows-1252 variants (cp1250, cp1252, etc.)"
  - "Pattern: Schema validation with configurable expected columns per file type"

# Metrics
duration: 45 min
completed: 2026-02-05
---

# Phase 1 Plan 3: File Parser + Data Validator Summary

**Tested parser module with encoding auto-detection and Pydantic validation models for Transfer Gov data**

## Performance

- **Duration:** 45 min
- **Started:** 2026-02-04T22:30:00Z
- **Completed:** 2026-02-04T23:15:00Z
- **Tasks:** 2/2 (TDD: RED + GREEN phases)
- **Files modified:** 12

## Accomplishments

- Built complete file parsing pipeline with encoding detection (charset-normalizer)
- Implemented Excel/CSV parsing using Polars with auto-encoding detection
- Created schema validation system checking required columns per file type
- Developed Pydantic validation models for all 4 entity types (propostas, apoiadores, emendas, programas)
- Implemented batch DataFrame validation returning clean split of valid vs invalid records
- Established TDD workflow with 31 comprehensive tests covering all functionality
- Portuguese characters preserved through entire parse → validate pipeline

## Task Commits

Each TDD task was committed atomically:

1. **test(01-03): add failing tests for parser and validator modules** - `49c922d` (test)
2. **feat(01-03): implement parser and validator modules** - `4ffdd49` (feat)

**Plan metadata:** `287d2c4` (docs: complete plan)

## Files Created/Modified

- `src/parser/encoding.py` - Encoding detection with charset-normalizer and fallback chain
- `src/parser/schemas.py` - Expected column definitions and schema validation logic
- `src/parser/file_parser.py` - Excel/CSV parsing with Polars and encoding auto-detection
- `src/transformer/models.py` - Pydantic models: PropostaValidation, ApoiadorValidation, EmendaValidation, ProgramaValidation
- `src/transformer/validator.py` - Batch DataFrame validation with error reporting
- `tests/test_parser.py` - 11 tests for encoding detection, Excel/CSV parsing, schema validation
- `tests/test_validator.py` - 20 tests for Pydantic models and DataFrame validation
- `tests/fixtures/` - Test fixtures: 4 Excel files and 1 Latin-1 CSV with Portuguese characters

## Decisions Made

- **charset-normalizer for encoding detection:** 2x faster than chardet, supports 93 encodings including Windows variants
- **Eager CSV reading with Polars:** Required for encoding support (lazy scan_csv only supports UTF-8)
- **cp1250 normalization:** Handles Central European encoding that charset-normalizer detects for some Latin-1 files
- **Field-level validators in Pydantic v2:** Clear error messages for empty IDs, negative valores, invalid UF codes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Authentication Gates

None - no external services required for parser/validator implementation.

## Next Phase Readiness

- Parser and validator modules ready for integration with crawler (Plan 01-04)
- All imports from src.config and src.monitor.logger work correctly
- Test fixtures available for testing downstream components
- Schema definitions in EXPECTED_COLUMNS can be updated when real Transfer Gov files are inspected

---
*Phase: 01-foundation*
*Completed: 2026-02-05*

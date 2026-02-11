# Issue: Pipeline Only Processes Latest Directory

## Problem

The pipeline uses `find_latest_data_directory()` which only processes files from the **most recent** dated directory in `data/raw/`.

When files are downloaded on **different days**, they end up in **separate directories**:
- `2026-02-09/`: convenios, desembolsos, emendas_detalhado, **proponentes_detalhado**
- `2026-02-10/`: apoiadores, emendas, programas, propostas

The pipeline processes only `2026-02-10`, so files from `2026-02-09` (including **proponentes_detalhado with contact data**) are **ignored**.

## Impact

- ❌ Contact data (email, telefone) not loaded into database
- ❌ Convenios, desembolsos, emendas_detalhado also missing
- ❌ Data completeness reduced

## Root Cause

In `src/orchestrator/pipeline.py`:

```python
def find_latest_data_directory(raw_data_dir: Path) -> Path:
    """Find the latest dated subdirectory in data/raw."""
    # Returns ONLY the most recent directory
    latest_dir = max(dated_dirs, key=lambda d: d.stat().st_mtime)
    return latest_dir
```

The crawler downloads files separately:
- **Repository downloader** downloads some files
- **Browser crawler** downloads others
- Each creates a directory with **today's date**

## Temporary Fix (Applied)

```bash
# Copy missing files to latest directory
cp data/raw/2026-02-09/*.csv data/raw/2026-02-10/
```

## Permanent Solutions

### Option 1: Scan All Recent Directories (Recommended)

Modify `run_pipeline()` to process files from **all directories in the last N days**:

```python
def find_recent_data_directories(raw_data_dir: Path, days: int = 7) -> list[Path]:
    """Find all dated directories from the last N days."""
    if not raw_data_dir.exists():
        return []

    from datetime import date, timedelta
    cutoff_date = date.today() - timedelta(days=days)

    recent_dirs = []
    for item in raw_data_dir.iterdir():
        if item.is_dir():
            try:
                dir_date = date.fromisoformat(item.name)
                if dir_date >= cutoff_date:
                    recent_dirs.append(item)
            except ValueError:
                continue

    return sorted(recent_dirs, reverse=True)

def run_pipeline(config_path: Optional[str] = None) -> None:
    # ...

    # Find all recent directories
    data_dirs = find_recent_data_directories(raw_data_dir, days=7)

    # Collect files from all directories
    files = []
    for data_dir in data_dirs:
        for pattern in ["*.xlsx", "*.csv"]:
            files.extend(data_dir.glob(pattern))

    # Remove duplicates (prefer newest version)
    files_dict = {}
    for file_path in files:
        if file_path.name not in files_dict:
            files_dict[file_path.name] = file_path
        else:
            # Keep newest file
            if file_path.stat().st_mtime > files_dict[file_path.name].stat().st_mtime:
                files_dict[file_path.name] = file_path

    files = list(files_dict.values())
```

### Option 2: Single Download Date

Modify crawler to download **all files on the same day**:

```python
# In src/crawler/repository_downloader.py
def run_repository_download(extraction_date: date | None = None) -> dict:
    # Use a SINGLE date for ALL downloads
    extraction_date = extraction_date or date.today()

    # All files go to same directory: data/raw/YYYY-MM-DD/
    for entity_type in entity_types:
        file_path = download_entity_file(entity_type, extraction_date)
```

### Option 3: Flat Structure (No Date Directories)

Use a **flat directory structure** without dates:

```python
# Always use data/raw/ directly
raw_data_dir = Path("data/raw")

# Files: data/raw/sample_propostas.csv
#        data/raw/sample_proponentes_detalhado.csv
#        etc.
```

**Pros**: Simple, no directory issues
**Cons**: No historical data, harder to track when data was extracted

## Recommendation

**Use Option 1**: Scan all directories from last 7 days and deduplicate by filename (keeping newest).

This provides:
- ✅ Resilient to files downloaded on different days
- ✅ No data loss
- ✅ Automatic cleanup (only keeps last 7 days)
- ✅ Minimal code changes

## Testing

After implementing fix:

1. Split files across multiple dates:
   ```bash
   mkdir -p data/raw/2026-02-11
   mv data/raw/2026-02-10/sample_proponentes_detalhado.csv data/raw/2026-02-11/
   ```

2. Run pipeline:
   ```bash
   python -m src.orchestrator.pipeline
   ```

3. Verify all files processed:
   ```sql
   SELECT COUNT(*) FROM proponentes WHERE email IS NOT NULL;
   -- Should be > 0
   ```

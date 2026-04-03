/**
 * backup-db.mjs
 *
 * Dumps all CRM/operational tables to a timestamped JSON file in backups/.
 * Usage (from /web):
 *   npm run backup              # full backup
 *   npm run backup:crm          # CRM tables only (fast)
 *
 *   # Restore specific table from a backup:
 *   node scripts/backup-db.mjs --restore ../backups/2026-04-03T10-00-00_backup.json --tables contact_notes
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CONN = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!CONN) {
  console.error('No DB connection string found. Set POSTGRES_URL in .env.local');
  process.exit(1);
}

// CRM tables: manually curated data that cannot be recovered from sync
// Sync tables (convenios, propostas, desembolsos, etc.) are excluded — they come from TransferenciaGov
const ALL_TABLES = [
  'users',
  'existing_clients',
  'lead_contacts',
  'vendedor_projetos',
  'contact_notes',
  'tgov_interactions',
  'tgov_whitelist',
  'commission_config',
  'commission_overrides',
  'commissions',
];

const args = process.argv.slice(2);
const restoreFlag = args.indexOf('--restore');
const tablesFlag = args.indexOf('--tables');

const selectedTables = tablesFlag >= 0
  ? args[tablesFlag + 1].split(',').map(t => t.trim())
  : ALL_TABLES;

// ── RESTORE MODE ──────────────────────────────────────────────────────────────
if (restoreFlag >= 0) {
  const backupFile = args[restoreFlag + 1];
  if (!backupFile || !fs.existsSync(backupFile)) {
    console.error(`Backup file not found: ${backupFile}`);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const pool = new Pool({ connectionString: CONN });

  console.log(`Restoring from ${backupFile}`);
  console.log(`Backup taken: ${backup.meta.timestamp}`);
  console.log(`Tables: ${selectedTables.join(', ')}\n`);

  for (const table of selectedTables) {
    const rows = backup.tables[table];
    if (!rows) { console.warn(`  [skip] ${table} — not in backup`); continue; }
    if (rows.length === 0) { console.log(`  [skip] ${table} — 0 rows`); continue; }

    const cols = Object.keys(rows[0]);
    const placeholders = rows.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ');
    const values = rows.flatMap(r => cols.map(c => r[c]));

    try {
      await pool.query('BEGIN');
      await pool.query(`DELETE FROM ${table}`);
      await pool.query(
        `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders}`,
        values
      );
      await pool.query('COMMIT');
      console.log(`  [ok]   ${table.padEnd(30)} ${rows.length} rows restored`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`  [fail] ${table.padEnd(30)} ${err.message}`);
    }
  }

  await pool.end();
  console.log('\nRestore complete.');
  process.exit(0);
}

// ── BACKUP MODE ───────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: CONN });
const timestamp = new Date().toISOString().slice(0, 19).replace('T', 'T').replace(/:/g, '-');
const backupsDir = path.join(__dirname, '..', '..', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const outFile = path.join(backupsDir, `${timestamp}_backup.json`);
const result = {
  meta: {
    timestamp: new Date().toISOString(),
    tables: selectedTables,
    rowCounts: {},
  },
  tables: {},
};

console.log(`Backing up ${selectedTables.length} tables...\n`);

for (const table of selectedTables) {
  try {
    const { rows } = await pool.query(`SELECT * FROM ${table}`);
    result.tables[table] = rows;
    result.meta.rowCounts[table] = rows.length;
    console.log(`  [ok]   ${table.padEnd(30)} ${rows.length} rows`);
  } catch (err) {
    console.warn(`  [skip] ${table.padEnd(30)} ${err.message}`);
    result.tables[table] = [];
    result.meta.rowCounts[table] = 0;
  }
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
await pool.end();

const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`\nBackup saved to: backups/${path.basename(outFile)} (${sizeMb} MB)`);
console.log(`\nTo restore a specific table:`);
console.log(`  node scripts/backup-db.mjs --restore ../../backups/${path.basename(outFile)} --tables contact_notes`);

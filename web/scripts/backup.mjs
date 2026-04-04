#!/usr/bin/env node
/**
 * Daily database backup for Projetus CRM.
 * Reads POSTGRES_URL or POSTGRES_URL_NON_POOLING from env.
 * Saves JSON backup to <project-root>/backups/backup-<timestamp>.json
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const TABLES = [
  // Core data tables
  'programas',
  'proponentes',
  'propostas',
  'apoiadores',
  'emendas',
  'proposta_apoiadores',
  'proposta_emendas',
  'convenios',
  'desembolsos',
  'historico_situacao',
  'extraction_logs',
  'data_lineage',
  'cron_sync_log',
  'projetos_execucao',
  // CRM tables
  'users',
  'vendedor_projetos',
  'existing_clients',
  'contact_notes',
  'commission_config',
  'commission_overrides',
  'lead_contacts',
  'cnpj_monitorado',
  'push_subscriptions',
  'enrichment_queue',
  'tgov_interactions',
];

const connStr = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connStr) {
  console.error('ERROR: Neither POSTGRES_URL nor POSTGRES_URL_NON_POOLING is set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function main() {
  const startTs = new Date();
  console.log(`[backup] Starting at ${startTs.toISOString()}`);

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('ERROR: Could not connect to database:', err.message);
    process.exit(1);
  }

  const backup = {
    timestamp: startTs.toISOString(),
    tables: {},
  };
  const rowCounts = {};

  for (const table of TABLES) {
    try {
      const res = await client.query(`SELECT * FROM ${table}`);
      backup.tables[table] = res.rows;
      rowCounts[table] = res.rows.length;
      console.log(`  ${table}: ${res.rows.length} rows`);
    } catch (err) {
      // Table may not exist yet — record as empty
      console.warn(`  WARNING: could not read table "${table}": ${err.message}`);
      backup.tables[table] = [];
      rowCounts[table] = 0;
    }
  }

  client.release();
  await pool.end();

  // Ensure backups dir exists
  const backupsDir = path.join(PROJECT_ROOT, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const filename = `backup-${startTs.toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(backupsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf-8');

  const stats = fs.statSync(filepath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log('\n=== Backup Summary ===');
  console.log(`Timestamp : ${startTs.toISOString()}`);
  console.log(`File      : ${filepath}`);
  console.log(`Size      : ${sizeMB} MB (${stats.size} bytes)`);
  console.log('Row counts:');
  for (const [table, count] of Object.entries(rowCounts)) {
    console.log(`  ${table.padEnd(30)} ${count}`);
  }
  console.log('======================\n');

  // Emit structured output for the caller
  process.stdout.write(
    JSON.stringify({ filepath, size: stats.size, rowCounts, timestamp: startTs.toISOString() }) + '\n'
  );
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});

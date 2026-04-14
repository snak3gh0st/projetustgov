// Daily database backup for projetustgov CRM
// Reads POSTGRES_URL or POSTGRES_URL_NON_POOLING from environment
// Saves JSON backup to ../backups/ relative to web/
// Run from web/ directory: node scripts/backup.mjs

import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const dbUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.error('ERROR: No database URL found. Set POSTGRES_URL, POSTGRES_URL_NON_POOLING, or DATABASE_URL.')
  process.exit(1)
}

// Strip sslmode from URL so pg-connection-string doesn't override our ssl config
const cleanUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, (m) => m.startsWith('?') ? '?' : '')

const pool = new pg.Pool({
  connectionString: cleanUrl,
  max: 2,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

// Tables to back up (in dependency order)
const TABLES = [
  'users',
  'propostas',
  'proponentes',
  'projetos_execucao',
  'execucao_cnpjs',
  'execucao_tags',
  'execucao_status',
  'lead_contacts',
  'contact_notes',
  'vendedor_projetos',
  'existing_clients',
]

async function backupTable(client, table) {
  try {
    const res = await client.query(`SELECT * FROM ${table}`)
    return { table, rows: res.rows, count: res.rowCount }
  } catch (err) {
    // Table may not exist — skip gracefully
    if (err.code === '42P01') {
      return { table, rows: [], count: 0, skipped: true }
    }
    throw err
  }
}

async function main() {
  let client
  try {
    client = await pool.connect()
  } catch (err) {
    console.error(`ERROR: Could not connect to database: ${err.message}`)
    process.exit(1)
  }

  const timestamp = new Date().toISOString()
  const backup = {
    timestamp,
    version: '1.0',
    tables: {},
    meta: { rowCounts: {} },
  }

  console.log(`Starting backup at ${timestamp}`)
  console.log('─'.repeat(50))

  for (const table of TABLES) {
    const result = await backupTable(client, table)
    if (result.skipped) {
      console.log(`  ${table.padEnd(25)} (skipped — table not found)`)
    } else {
      backup.tables[table] = result.rows
      backup.meta.rowCounts[table] = result.count
      console.log(`  ${table.padEnd(25)} ${String(result.count).padStart(6)} rows`)
    }
  }

  client.release()
  await pool.end()

  // Save to ../backups/ relative to web/
  const backupsDir = resolve(__dirname, '../../backups')
  mkdirSync(backupsDir, { recursive: true })

  const filename = `backup-${timestamp.replace(/[:.]/g, '-')}.json`
  const filepath = join(backupsDir, filename)
  writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8')

  const fileSizeBytes = Buffer.byteLength(JSON.stringify(backup, null, 2))
  const fileSizeKB = (fileSizeBytes / 1024).toFixed(1)

  console.log('─'.repeat(50))
  console.log(`Backup saved: ${filepath}`)
  console.log(`File size:    ${fileSizeKB} KB`)
  console.log(`Timestamp:    ${timestamp}`)

  // Emit structured summary for easy parsing by the caller
  console.log('\n=== BACKUP SUMMARY ===')
  console.log(`FILE=${filepath}`)
  console.log(`SIZE_KB=${fileSizeKB}`)
  console.log(`TIMESTAMP=${timestamp}`)
  for (const [table, count] of Object.entries(backup.meta.rowCounts)) {
    console.log(`TABLE_${table}=${count}`)
  }
  console.log('=== END SUMMARY ===')
}

main().catch(err => {
  console.error(`ERROR: Backup failed: ${err.message}`)
  process.exit(1)
})

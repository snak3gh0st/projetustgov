#!/usr/bin/env node
/**
 * fix-closer-commission-data.mjs
 *
 * Audits all Fechado leads with closer_id to verify split commission values.
 * Expected split: SDR comissao_percentual=1%, comissao_valor=valor_venda*0.01, comissao_bonus=50
 *                 Closer closer_comissao_percentual=3%, closer_comissao_valor=valor_venda*0.03
 *
 * Usage:
 *   node scripts/fix-closer-commission-data.mjs          # dry-run (report only)
 *   node scripts/fix-closer-commission-data.mjs --fix     # apply corrections
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load DATABASE_URL from web/.env
function loadDatabaseUrl() {
  // Try .env.local first, then .env, then .env.production
  const candidates = ['.env.local', '.env', '.env.production']
  for (const envFile of candidates) {
    const envPath = resolve(__dirname, '..', envFile)
    let envContent
    try { envContent = readFileSync(envPath, 'utf-8') } catch { continue }
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('DATABASE_URL=')) {
        let val = trimmed.slice('DATABASE_URL='.length)
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        return val
      }
    }
  }
  return process.env.DATABASE_URL
}

const DATABASE_URL = loadDatabaseUrl()
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in web/.env or environment')
  process.exit(1)
}

const dryRun = !process.argv.includes('--fix')

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

  try {
    const { rows } = await pool.query(`
      SELECT vp.id, vp.cnpj, vp.nome, vp.valor_venda,
             vp.comissao_percentual, vp.comissao_valor, vp.comissao_bonus,
             vp.closer_id, vp.closer_comissao_percentual, vp.closer_comissao_valor,
             u_sdr.nome AS sdr_name, u_closer.nome AS closer_name
      FROM vendedor_projetos vp
      LEFT JOIN users u_sdr ON u_sdr.id = vp.vendedor_id
      LEFT JOIN users u_closer ON u_closer.id = vp.closer_id
      WHERE vp.closer_id IS NOT NULL AND vp.status_contato = 'Fechado'
      ORDER BY vp.id
    `)

    if (rows.length === 0) {
      console.log('No Fechado leads with closer_id found.')
      return
    }

    console.log(`\n=== Split Commission Audit ===`)
    console.log(`Mode: ${dryRun ? 'DRY RUN (use --fix to apply)' : 'FIX MODE'}`)
    console.log(`Found ${rows.length} Fechado lead(s) with closer_id\n`)

    let correct = 0
    let needsFix = 0

    console.log(
      'ID'.padEnd(6) +
      'CNPJ'.padEnd(20) +
      'Nome'.padEnd(25) +
      'ValorVenda'.padEnd(14) +
      'SDR%'.padEnd(7) +
      'SDRVal'.padEnd(12) +
      'Bonus'.padEnd(8) +
      'Closer%'.padEnd(9) +
      'CloserVal'.padEnd(12) +
      'Status'
    )
    console.log('-'.repeat(113))

    for (const row of rows) {
      const valorVenda = Number(row.valor_venda) || 0
      const expectedSdrPct = 1.00
      const expectedSdrVal = valorVenda * 0.01
      const expectedBonus = 50.00
      const expectedCloserPct = 3.00
      const expectedCloserVal = valorVenda * 0.03

      const currentSdrPct = Number(row.comissao_percentual) || 0
      const currentSdrVal = Number(row.comissao_valor) || 0
      const currentBonus = Number(row.comissao_bonus) || 0
      const currentCloserPct = Number(row.closer_comissao_percentual) || 0
      const currentCloserVal = Number(row.closer_comissao_valor) || 0

      const isCorrect =
        Math.abs(currentSdrPct - expectedSdrPct) < 0.01 &&
        Math.abs(currentSdrVal - expectedSdrVal) < 0.01 &&
        Math.abs(currentBonus - expectedBonus) < 0.01 &&
        Math.abs(currentCloserPct - expectedCloserPct) < 0.01 &&
        Math.abs(currentCloserVal - expectedCloserVal) < 0.01

      const status = isCorrect ? 'OK' : 'MISMATCH'

      console.log(
        String(row.id).padEnd(6) +
        (row.cnpj || '').slice(0, 18).padEnd(20) +
        (row.nome || '').slice(0, 23).padEnd(25) +
        valorVenda.toFixed(2).padStart(12).padEnd(14) +
        `${currentSdrPct}`.padEnd(7) +
        currentSdrVal.toFixed(2).padStart(10).padEnd(12) +
        currentBonus.toFixed(2).padStart(6).padEnd(8) +
        `${currentCloserPct}`.padEnd(9) +
        currentCloserVal.toFixed(2).padStart(10).padEnd(12) +
        status
      )

      if (!isCorrect) {
        console.log(
          ''.padEnd(6) +
          `  EXPECTED: SDR ${expectedSdrPct}% = ${expectedSdrVal.toFixed(2)}, bonus ${expectedBonus.toFixed(2)}, ` +
          `Closer ${expectedCloserPct}% = ${expectedCloserVal.toFixed(2)}`
        )
        needsFix++

        if (!dryRun) {
          await pool.query(`
            UPDATE vendedor_projetos
            SET comissao_percentual = 1.00,
                comissao_valor = COALESCE(valor_venda, 0) * 0.01,
                comissao_bonus = 50.00,
                closer_comissao_percentual = 3.00,
                closer_comissao_valor = COALESCE(valor_venda, 0) * 0.03,
                updated_at = NOW()
            WHERE id = $1
          `, [row.id])
          console.log(`  -> FIXED (id=${row.id})`)
        }
      } else {
        correct++
      }
    }

    console.log('\n=== Summary ===')
    console.log(`Total leads checked: ${rows.length}`)
    console.log(`Correct:             ${correct}`)
    console.log(`Needing fix:         ${needsFix}`)
    if (dryRun && needsFix > 0) {
      console.log(`\nRun with --fix to apply corrections.`)
    }
    if (!dryRun && needsFix > 0) {
      console.log(`\nAll ${needsFix} lead(s) have been corrected.`)
    }
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('Script error:', err)
  process.exit(1)
})

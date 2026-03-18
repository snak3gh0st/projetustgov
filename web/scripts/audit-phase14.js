'use strict';

/**
 * Phase 14 Data Audit Script
 *
 * Runs 5 sequential steps:
 *   STEP 1 — NULL proposta_id count in convenios WHERE situacao ILIKE '%execu%'
 *   STEP 2 — CNPJ length distribution in proponentes
 *   STEP 3 — CNPJ collision pre-flight check (only if short_cnpj > 0)
 *   STEP 4 — CNPJ LPAD migration (only if short_cnpj > 0 AND no collisions)
 *   STEP 5 — Post-migration verification (only if migration ran)
 *
 * Usage: node web/scripts/audit-phase14.js
 * Run from: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web
 * Exits:    0 on success, 1 on error
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env.local using same pattern as diagnose-status.js
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
});

const pool = new Pool({
  connectionString: envVars.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    console.log('=== Phase 14 Data Audit ===\n');

    // ------------------------------------------------------------------
    // STEP 1 — NULL proposta_id diagnostic
    // ------------------------------------------------------------------
    console.log('STEP 1 — NULL proposta_id in "em execucao" convenios');
    const step1Res = await pool.query(`
      SELECT
        COUNT(*) AS total_em_execucao,
        SUM(CASE WHEN (proposta_id IS NULL OR proposta_id = '') THEN 1 ELSE 0 END) AS null_proposta_id,
        SUM(CASE WHEN (proposta_id IS NOT NULL AND proposta_id != '') THEN 1 ELSE 0 END) AS has_proposta_id
      FROM convenios
      WHERE situacao ILIKE '%execu%'
    `);

    const step1 = step1Res.rows[0];
    const totalEmExecucao = parseInt(step1.total_em_execucao, 10);
    const nullPropostaId = parseInt(step1.null_proposta_id, 10);
    const hasPropostaId = parseInt(step1.has_proposta_id, 10);

    console.log(`  total_em_execucao : ${totalEmExecucao}`);
    console.log(`  has_proposta_id   : ${hasPropostaId}`);
    console.log(`  null_proposta_id  : ${nullPropostaId}`);
    console.log('');

    // ------------------------------------------------------------------
    // STEP 2 — CNPJ length distribution diagnostic
    // ------------------------------------------------------------------
    console.log('STEP 2 — CNPJ length distribution in proponentes');
    const step2Res = await pool.query(`
      SELECT
        COUNT(*) AS total_proponentes,
        SUM(CASE WHEN LENGTH(cnpj) < 14 THEN 1 ELSE 0 END) AS short_cnpj,
        SUM(CASE WHEN LENGTH(cnpj) = 14 THEN 1 ELSE 0 END) AS correct_cnpj,
        SUM(CASE WHEN LENGTH(cnpj) > 14 THEN 1 ELSE 0 END) AS long_cnpj,
        MIN(LENGTH(cnpj)) AS min_len,
        MAX(LENGTH(cnpj)) AS max_len
      FROM proponentes
    `);

    const step2 = step2Res.rows[0];
    const totalProponentes = parseInt(step2.total_proponentes, 10);
    const shortCnpj = parseInt(step2.short_cnpj, 10);
    const correctCnpj = parseInt(step2.correct_cnpj, 10);
    const longCnpj = parseInt(step2.long_cnpj, 10);
    const minLen = parseInt(step2.min_len, 10);
    const maxLen = parseInt(step2.max_len, 10);

    console.log(`  total_proponentes : ${totalProponentes}`);
    console.log(`  short_cnpj (<14)  : ${shortCnpj}`);
    console.log(`  correct_cnpj (=14): ${correctCnpj}`);
    console.log(`  long_cnpj (>14)   : ${longCnpj}`);
    console.log(`  min_len           : ${minLen}`);
    console.log(`  max_len           : ${maxLen}`);
    console.log('');

    let migrationApplied = false;
    let rowsAffected = 0;

    if (shortCnpj === 0) {
      console.log('All CNPJs already 14 characters — no migration needed.\n');
    } else {
      // ----------------------------------------------------------------
      // STEP 3 — CNPJ collision pre-flight check
      // ----------------------------------------------------------------
      console.log('STEP 3 — CNPJ collision pre-flight check (short_cnpj > 0, running check)');
      const step3Res = await pool.query(`
        SELECT LPAD(cnpj, 14, '0') AS normalized_cnpj, COUNT(*) AS count
        FROM proponentes
        WHERE LENGTH(cnpj) < 14
        GROUP BY normalized_cnpj
        HAVING COUNT(*) > 1
      `);

      const collisionCount = step3Res.rows.length;
      console.log(`  collision_count   : ${collisionCount}`);

      if (collisionCount > 0) {
        console.log('');
        console.log('WARNING: LPAD migration skipped — collisions detected.');
        console.log('  Colliding normalized CNPJs:');
        step3Res.rows.forEach(row => {
          console.log(`    ${row.normalized_cnpj} (count: ${row.count})`);
        });
        console.log('  Resolve duplicates before running migration.\n');
      } else {
        console.log('  No collisions — safe to proceed with LPAD migration.\n');

        // --------------------------------------------------------------
        // STEP 4 — CNPJ LPAD migration
        // --------------------------------------------------------------
        console.log('STEP 4 — CNPJ LPAD migration (UPDATE proponentes SET cnpj = LPAD(cnpj, 14, \'0\'))');
        const step4Res = await pool.query(`
          UPDATE proponentes
          SET cnpj = LPAD(cnpj, 14, '0')
          WHERE LENGTH(cnpj) < 14
        `);
        rowsAffected = step4Res.rowCount;
        migrationApplied = true;
        console.log(`  rows_affected     : ${rowsAffected}\n`);

        // --------------------------------------------------------------
        // STEP 5 — Post-migration verification
        // --------------------------------------------------------------
        console.log('STEP 5 — Post-migration verification');
        const step5Res = await pool.query(`
          SELECT COUNT(*) AS remaining_short FROM proponentes WHERE LENGTH(cnpj) < 14
        `);
        const remainingShort = parseInt(step5Res.rows[0].remaining_short, 10);
        console.log(`  remaining_short   : ${remainingShort}`);

        if (remainingShort !== 0) {
          console.log('  ERROR: migration did not complete — remaining_short must be 0\n');
          process.exitCode = 1;
        } else {
          console.log('  Verification passed — all CNPJs now 14 characters.\n');
        }
      }
    }

    // ------------------------------------------------------------------
    // FINAL SUMMARY
    // ------------------------------------------------------------------
    console.log('=== FINAL SUMMARY ===');
    console.log('');
    console.log('NULL proposta_id diagnostic:');
    console.log(`  Convenios em execucao    : ${totalEmExecucao}`);
    console.log(`  With proposta_id         : ${hasPropostaId}`);
    console.log(`  NULL or empty proposta_id: ${nullPropostaId}`);
    console.log('');
    console.log('CNPJ length distribution (before migration):');
    console.log(`  Total proponentes        : ${totalProponentes}`);
    console.log(`  Correct (14 chars)       : ${correctCnpj}`);
    console.log(`  Short (< 14 chars)       : ${shortCnpj}`);
    console.log(`  Long (> 14 chars)        : ${longCnpj}`);
    console.log(`  Min length               : ${minLen}`);
    console.log(`  Max length               : ${maxLen}`);
    console.log('');
    if (migrationApplied) {
      console.log(`CNPJ migration: YES — ${rowsAffected} rows updated via LPAD(cnpj, 14, '0'). Post-migration: 0 remaining short CNPJs.`);
    } else if (shortCnpj === 0) {
      console.log('CNPJ migration: NO — all CNPJs already 14 characters.');
    } else {
      console.log('CNPJ migration: SKIPPED — collisions detected, manual resolution required.');
    }
    console.log('');
    console.log('Gap-handling decision:');
    console.log('  Phase 15 ETL MUST use LEFT JOIN with join_miss_count logging.');
    console.log('  Rationale: NULL proposta_id count is a point-in-time snapshot;');
    console.log('  future ETL runs may insert new convenios with NULL proposta_id.');
    console.log('  Architecture decision is permanent; diagnostic count is transient.');
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();

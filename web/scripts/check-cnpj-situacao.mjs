// Check current situação stored in DB for a given CNPJ across propostas + projetos_execucao.
// Usage: node web/scripts/check-cnpj-situacao.mjs 11813438000105
//
// Prints all rows with situacao, last update timestamps, and source info so you can
// compare against the live TransfereGov portal and figure out if it's a sync lag,
// a missing sync, or a CSV freshness problem.

import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) {
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    envVars[m[1].trim()] = v
  }
})

const cnpj = (process.argv[2] || '').replace(/\D/g, '')
if (!cnpj) {
  console.error('Usage: node check-cnpj-situacao.mjs <cnpj>')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: envVars.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function main() {
  const client = await pool.connect()
  try {
    console.log(`\n=== CNPJ ${cnpj} ===\n`)

    // propostas (CRM)
    const prop = await client.query(
      `SELECT transfer_gov_id, nr_proposta, situacao, valor_global, estado, municipio,
              data_publicacao::text, updated_at::text
       FROM propostas
       WHERE proponente_cnpj = $1
       ORDER BY data_publicacao DESC NULLS LAST`,
      [cnpj]
    )
    console.log(`PROPOSTAS (CRM) (${prop.rows.length}):`)
    if (prop.rows.length === 0) console.log('  (nenhuma)')
    for (const r of prop.rows) {
      console.log(`  • ${r.nr_proposta || r.transfer_gov_id} | ${r.situacao} | R$ ${r.valor_global} | ${r.estado}/${r.municipio}`)
      console.log(`      data_publicacao=${r.data_publicacao} updated_at=${r.updated_at}`)
    }

    // tgov_propostas (TGov-only, populado por sync-tgov-only)
    const tgovProp = await client.query(
      `SELECT to_regclass('public.tgov_propostas') IS NOT NULL AS exists`
    )
    if (tgovProp.rows[0].exists) {
      const tprop = await client.query(
        `SELECT transfer_gov_id, nr_proposta, situacao, valor_global, estado, municipio,
                data_publicacao::text, updated_at::text
         FROM tgov_propostas
         WHERE proponente_cnpj = $1
         ORDER BY data_publicacao DESC NULLS LAST`,
        [cnpj]
      )
      console.log(`\nTGOV_PROPOSTAS (TGov-only) (${tprop.rows.length}):`)
      if (tprop.rows.length === 0) console.log('  (nenhuma)')
      for (const r of tprop.rows) {
        console.log(`  • ${r.nr_proposta || r.transfer_gov_id} | ${r.situacao} | R$ ${r.valor_global} | ${r.estado}/${r.municipio}`)
        console.log(`      data_publicacao=${r.data_publicacao} updated_at=${r.updated_at}`)
      }
    } else {
      console.log(`\nTGOV_PROPOSTAS: tabela ainda não existe (sync-tgov-only nunca rodou)`)
    }

    // projetos_execucao (CRM)
    const exec = await client.query(
      `SELECT nr_convenio, id_proposta, nr_proposta, situacao, valor_global,
              valor_desembolsado, saldo_conta, uf, municipio,
              data_assinatura::text, data_fim_vigencia::text,
              dia_limite_prest_contas::text, synced_at::text, sync_run_id
       FROM projetos_execucao
       WHERE cnpj = $1
       ORDER BY data_assinatura DESC NULLS LAST`,
      [cnpj]
    )
    console.log(`\nPROJETOS_EXECUCAO (CRM) (${exec.rows.length}):`)
    if (exec.rows.length === 0) console.log('  (nenhuma)')
    for (const r of exec.rows) {
      console.log(`  • Conv ${r.nr_convenio} (id_proposta=${r.id_proposta}, nr_proposta=${r.nr_proposta})`)
      console.log(`      situacao=${r.situacao}`)
      console.log(`      valor_global=R$ ${r.valor_global} desembolsado=R$ ${r.valor_desembolsado} saldo=R$ ${r.saldo_conta}`)
      console.log(`      ${r.uf}/${r.municipio} assinatura=${r.data_assinatura} fim_vig=${r.data_fim_vigencia}`)
      console.log(`      dia_limite_prest_contas=${r.dia_limite_prest_contas}`)
      console.log(`      synced_at=${r.synced_at} sync_run_id=${r.sync_run_id}`)
    }

    // tgov_projetos_execucao (TGov-only, populado por sync-tgov-only)
    const tgovExec = await client.query(
      `SELECT to_regclass('public.tgov_projetos_execucao') IS NOT NULL AS exists`
    )
    if (tgovExec.rows[0].exists) {
      const texec = await client.query(
        `SELECT nr_convenio, id_proposta, nr_proposta, situacao, valor_global,
                valor_desembolsado, saldo_conta, uf, municipio,
                data_assinatura::text, data_fim_vigencia::text,
                dia_limite_prest_contas::text, synced_at::text
         FROM tgov_projetos_execucao
         WHERE cnpj = $1
         ORDER BY data_assinatura DESC NULLS LAST`,
        [cnpj]
      )
      console.log(`\nTGOV_PROJETOS_EXECUCAO (TGov-only) (${texec.rows.length}):`)
      if (texec.rows.length === 0) console.log('  (nenhuma)')
      for (const r of texec.rows) {
        console.log(`  • Conv ${r.nr_convenio} (id_proposta=${r.id_proposta}, nr_proposta=${r.nr_proposta})`)
        console.log(`      situacao=${r.situacao}`)
        console.log(`      valor_global=R$ ${r.valor_global} desembolsado=R$ ${r.valor_desembolsado}`)
        console.log(`      ${r.uf}/${r.municipio} fim_vig=${r.data_fim_vigencia} dia_limite_pc=${r.dia_limite_prest_contas}`)
        console.log(`      synced_at=${r.synced_at}`)
      }
      const lastTgovSync = await client.query(
        `SELECT MAX(synced_at)::text AS last, COUNT(*)::int AS total FROM tgov_projetos_execucao`
      )
      console.log(`\nÚltimo synced_at em tgov_projetos_execucao: ${lastTgovSync.rows[0].last} (total rows=${lastTgovSync.rows[0].total})`)
    } else {
      console.log(`\nTGOV_PROJETOS_EXECUCAO: tabela ainda não existe (sync-tgov-only nunca rodou)`)
    }

    // Last successful sync (max synced_at across the whole table)
    const lastSync = await client.query(
      `SELECT MAX(synced_at)::text AS last, MAX(sync_run_id) AS run FROM projetos_execucao`
    )
    console.log(`\nÚltimo synced_at em projetos_execucao CRM (qualquer linha): ${lastSync.rows[0].last} (sync_run_id=${lastSync.rows[0].run})`)

    // Whitelist check — by CNPJ AND by every nr_proposta we found
    const allNrPropostas = [
      ...prop.rows.map(r => r.nr_proposta).filter(Boolean),
      ...exec.rows.map(r => r.nr_proposta).filter(Boolean),
    ]
    const wl = await client.query(
      `SELECT id, cnpj, nr_proposta, tab, added_by, added_at::text
       FROM tgov_whitelist
       WHERE cnpj = $1 OR nr_proposta = ANY($2::text[])
       ORDER BY added_at DESC`,
      [cnpj, allNrPropostas]
    )
    console.log(`\nNa whitelist TGov: ${wl.rows.length}`)
    for (const r of wl.rows) {
      console.log(`  • id=${r.id} cnpj=${r.cnpj || '(null)'} nr_proposta=${r.nr_proposta || '(null)'} tab=${r.tab} by=${r.added_by} at=${r.added_at}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })

// Distributes opportunities from Vitoria equally into Elisson and Gabriel
// Paulo is excluded: his role is 'visualizador', not 'vendedor', and he holds no leads.
// Usage:
//   node scripts/rebalance-paulo-vitoria-para-elisson-gabriel.js [--dry-run]

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const DRY_RUN = process.argv.includes('--dry-run')

const SOURCE_EMAILS = ['vitoria@projetus.org']
const TARGET_EMAILS = ['elisson@projetus.org', 'gabriel@projetus.org']

function loadEnv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '..', '.env.local'))
  const connectionString = env.DATABASE_URL || env.POSTGRES_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL not found in .env.local')
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  const client = await pool.connect()

  try {
    const usersRes = await client.query(
      `SELECT id, nome, email FROM users
       WHERE email = ANY($1) AND role = 'vendedor' AND active = true`,
      [SOURCE_EMAILS.concat(TARGET_EMAILS)],
    )

    const byEmail = new Map(usersRes.rows.map((r) => [r.email, r]))
    const missingEmails = SOURCE_EMAILS.concat(TARGET_EMAILS).filter(
      (email) => !byEmail.has(email),
    )
    if (missingEmails.length > 0) {
      throw new Error(`Vendedores não encontrados ou inativos: ${missingEmails.join(', ')}`)
    }

    const sourceUsers = SOURCE_EMAILS.map((email) => byEmail.get(email))
    const targetUsers = TARGET_EMAILS.map((email) => byEmail.get(email))
    const sourceIds = sourceUsers.map((u) => u.id)
    const targetIds = targetUsers.map((u) => u.id)

    const sourceRowsRes = await client.query(
      `SELECT cnpj, COUNT(*)::int AS opportunities
         FROM vendedor_projetos
        WHERE vendedor_id = ANY($1::uuid[])
        GROUP BY cnpj
        ORDER BY opportunities DESC`,
      [sourceIds],
    )
    const sourceRows = sourceRowsRes.rows

    if (sourceRows.length === 0) {
      console.log('Nenhum lead encontrado para reatribuir (Paulo e Vitoria não possuem leads atribuídos).')
      return
    }

    const sourceCnpjs = sourceRows.map((r) => r.cnpj)
    const splitCheckRes = await client.query(
      `SELECT cnpj, COUNT(DISTINCT vendedor_id)::int AS owners
         FROM vendedor_projetos
        WHERE cnpj = ANY($1)
        GROUP BY cnpj
       HAVING COUNT(DISTINCT vendedor_id) > 1`,
      [sourceCnpjs],
    )
    if (splitCheckRes.rowCount > 0) {
      throw new Error(
        `Existe CNPJ com vendedores mistos e precisa de resolução antes da redistribuição: ${splitCheckRes.rows
          .map((r) => r.cnpj)
          .join(', ')}`,
      )
    }

    const totalOpportunities = sourceRows.reduce(
      (sum, row) => sum + Number(row.opportunities),
      0,
    )

    const assignment = [
      { seller: targetUsers[0], totalOpportunities: 0, cnpjs: [] },
      { seller: targetUsers[1], totalOpportunities: 0, cnpjs: [] },
    ]

    for (const row of sourceRows) {
      const opportunities = Number(row.opportunities)
      const idx = assignment[0].totalOpportunities <= assignment[1].totalOpportunities ? 0 : 1
      assignment[idx].cnpjs.push(row.cnpj)
      assignment[idx].totalOpportunities += opportunities
    }

    console.log('Redistribuição planejada:')
    for (const item of assignment) {
      console.log(`- ${item.seller.nome}: ${item.cnpjs.length} CNPJs, ${item.totalOpportunities} oportunidades`)
    }
    console.log(
      `Total oriundo de Paulo + Vitoria: ${sourceRows.length} CNPJs / ${totalOpportunities} oportunidades`,
    )
    console.log(
      `Diferença esperada entre Elisson e Gabriel: ${Math.abs(
        assignment[0].totalOpportunities - assignment[1].totalOpportunities,
      )}`,
    )

    if (DRY_RUN) {
      console.log('DRY RUN ativo: nenhuma alteração foi aplicada.')
      return
    }

    await client.query('BEGIN')

    for (let i = 0; i < assignment.length; i += 1) {
      const item = assignment[i]
      if (item.cnpjs.length === 0) continue
      const updateRes = await client.query(
        `UPDATE vendedor_projetos
         SET vendedor_id = $1, updated_at = NOW()
         WHERE cnpj = ANY($2::text[])`,
        [targetIds[i], item.cnpjs],
      )
      console.log(`Atualizados ${updateRes.rowCount} registros para ${item.seller.nome}`)
    }

    await client.query('COMMIT')

    const finalCountsRes = await client.query(
      `SELECT u.nome, COUNT(vp.id)::int AS opportunities
         FROM users u
         LEFT JOIN vendedor_projetos vp ON vp.vendedor_id = u.id
        WHERE u.id = ANY($1::uuid[])
        GROUP BY u.id, u.nome
        ORDER BY u.nome`,
      [targetIds],
    )

    console.log('\nContagem final (após redistribuição):')
    for (const row of finalCountsRes.rows) {
      console.log(`- ${row.nome}: ${row.opportunities} oportunidades`)
    }
    console.log('\nConcluído com sucesso.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`)
  process.exit(1)
})

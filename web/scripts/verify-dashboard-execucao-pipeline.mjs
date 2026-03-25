import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PIPELINE_STATUSES = [
  'Não Contatado',
  'Ainda Não',
  'Retorno',
  'Quente',
  'Muito Quente',
  'Proposta',
  'Aguardando Closer',
  'Telefone Invalido',
  'Fechado',
]

function readDbUrlFromEnvFile() {
  const envPaths = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env.production'),
  ]

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue

    const envContent = fs.readFileSync(envPath, 'utf8')
    const match = envContent.match(/^(?:DATABASE_URL|POSTGRES_URL)=(.*)$/m)
    if (!match) continue

    const value = match[1].trim().replace(/^['"]|['"]$/g, '')
    if (value) return value
  }

  return null
}

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || readDbUrlFromEnvFile()

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL or POSTGRES_URL not set')
  process.exit(1)
}

const CRM_STATUS_NORMALIZED_SQL = `
  CASE
    WHEN COALESCE(vp.status_contato, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
    ELSE COALESCE(vp.status_contato, 'Não Contatado')
  END
`

const CRM_STATUS_PRIORITY_SQL = `
  CASE
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Fechado' THEN 1
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Aguardando Closer' THEN 2
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Proposta' THEN 3
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Retorno' THEN 4
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Ainda Não' THEN 5
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Quente' THEN 6
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Muito Quente' THEN 7
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Telefone Invalido' THEN 8
    WHEN ${CRM_STATUS_NORMALIZED_SQL} = 'Não Contatado' THEN 10
    ELSE 9
  END
`

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const client = await pool.connect()

  try {
    const summaryResult = await client.query(`
      WITH universe AS (
        SELECT COUNT(DISTINCT pe.cnpj)::int AS total_distinct_cnpjs
        FROM projetos_execucao pe
      ),
      execucao_cnpjs AS (
        SELECT DISTINCT pe.cnpj
        FROM projetos_execucao pe
      ),
      execucao_status AS (
        SELECT
          ec.cnpj,
          COALESCE((
            SELECT ${CRM_STATUS_NORMALIZED_SQL}
            FROM vendedor_projetos vp
            WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = ec.cnpj
            ORDER BY ${CRM_STATUS_PRIORITY_SQL} ASC, vp.updated_at DESC NULLS LAST
            LIMIT 1
          ), 'Não Contatado') AS crm_status
        FROM execucao_cnpjs ec
      )
      SELECT
        u.total_distinct_cnpjs,
        COUNT(*)::int AS bucket_total,
        COUNT(*) FILTER (WHERE es.crm_status = 'Não Contatado')::int AS status_nao_contatado,
        COUNT(*) FILTER (WHERE es.crm_status = 'Ainda Não')::int AS status_ainda_nao,
        COUNT(*) FILTER (WHERE es.crm_status = 'Retorno')::int AS status_retorno,
        COUNT(*) FILTER (WHERE es.crm_status = 'Quente')::int AS status_quente,
        COUNT(*) FILTER (WHERE es.crm_status = 'Muito Quente')::int AS status_muito_quente,
        COUNT(*) FILTER (WHERE es.crm_status = 'Proposta')::int AS status_proposta,
        COUNT(*) FILTER (WHERE es.crm_status = 'Aguardando Closer')::int AS status_aguardando_closer,
        COUNT(*) FILTER (WHERE es.crm_status = 'Telefone Invalido')::int AS status_telefone_invalido,
        COUNT(*) FILTER (WHERE es.crm_status = 'Fechado')::int AS status_fechado
      FROM universe u
      CROSS JOIN execucao_status es
      GROUP BY u.total_distinct_cnpjs
    `)

    const failuresResult = await client.query(`
      WITH execucao_cnpjs AS (
        SELECT DISTINCT pe.cnpj
        FROM projetos_execucao pe
      ),
      execucao_status AS (
        SELECT
          ec.cnpj,
          COALESCE((
            SELECT ${CRM_STATUS_NORMALIZED_SQL}
            FROM vendedor_projetos vp
            WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = ec.cnpj
            ORDER BY ${CRM_STATUS_PRIORITY_SQL} ASC, vp.updated_at DESC NULLS LAST
            LIMIT 1
          ), 'Não Contatado') AS crm_status
        FROM execucao_cnpjs ec
      ),
      unexpected_status AS (
        SELECT 'unexpected-status' AS check_name, cnpj, crm_status AS detail
        FROM execucao_status
        WHERE crm_status NOT IN (${PIPELINE_STATUSES.map(status => `'${status}'`).join(', ')})
      )
      SELECT *
      FROM unexpected_status
      ORDER BY cnpj
      LIMIT 20
    `)

    const summary = summaryResult.rows[0] || {}
    const failures = []
    const examples = failuresResult.rows

    const totalDistinctCnpjs = Number(summary.total_distinct_cnpjs) || 0
    const bucketTotal = Number(summary.bucket_total) || 0
    const totalsByStatus = {
      'Não Contatado': Number(summary.status_nao_contatado) || 0,
      'Ainda Não': Number(summary.status_ainda_nao) || 0,
      'Retorno': Number(summary.status_retorno) || 0,
      'Quente': Number(summary.status_quente) || 0,
      'Muito Quente': Number(summary.status_muito_quente) || 0,
      'Proposta': Number(summary.status_proposta) || 0,
      'Aguardando Closer': Number(summary.status_aguardando_closer) || 0,
      'Telefone Invalido': Number(summary.status_telefone_invalido) || 0,
      'Fechado': Number(summary.status_fechado) || 0,
    }

    const bucketSum = Object.values(totalsByStatus).reduce((sum, count) => sum + count, 0)

    if (bucketTotal !== totalDistinctCnpjs) {
      failures.push({
        check: 'distinct-universe-mismatch',
        expected: totalDistinctCnpjs,
        actual: bucketTotal,
        detail: 'A lógica agregada deixou de representar exatamente COUNT(DISTINCT cnpj) em projetos_execucao.',
      })
    }

    if (bucketSum !== totalDistinctCnpjs) {
      failures.push({
        check: 'bucket-sum-mismatch',
        expected: totalDistinctCnpjs,
        actual: bucketSum,
        detail: 'A soma das buckets do pipeline não bate com o total distinto de CNPJs em execução.',
      })
    }

    if (examples.length > 0) {
      failures.push({
        check: 'cnpj-without-pipeline-bucket',
        expected: 0,
        actual: examples.length,
        detail: 'Há CNPJs em execução com crm_status fora das buckets renderizadas pelo dashboard.',
      })
    }

    console.log('Execucao pipeline verification summary')
    console.log(`- Total distinct CNPJs em projetos_execucao: ${totalDistinctCnpjs}`)
    console.log(`- Total agregado pela lógica do dashboard: ${bucketTotal}`)
    console.log(`- Soma das buckets: ${bucketSum}`)
    console.log('- Totais por status:')
    console.table(totalsByStatus)

    if (failures.length > 0) {
      console.error(`\nFAIL: ${failures.length} violacao(oes) encontrada(s).`)
      console.table(failures)

      if (examples.length > 0) {
        console.error('\nExemplos de CNPJs fora das buckets esperadas:')
        console.table(examples)
      }

      process.exit(1)
    }

    console.log('\nOK: pipeline de execução separado e consistente com projetos_execucao.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('FATAL:', error)
  process.exit(1)
})

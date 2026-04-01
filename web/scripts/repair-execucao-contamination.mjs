import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')

for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (!match) continue
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  process.env[match[1].trim()] = value
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
})

const STRUCTURED_SCOPE_SQL = `
(
  NULLIF(TRIM(vp.codigo_programa), '') IS NOT NULL OR
  NULLIF(TRIM(vp.nome_programa), '') IS NOT NULL OR
  NULLIF(TRIM(vp.link_externo), '') IS NOT NULL OR
  NULLIF(TRIM(vp.orgao_concedente), '') IS NOT NULL OR
  NULLIF(TRIM(vp.qualificacao), '') IS NOT NULL OR
  NULLIF(TRIM(vp.nr_emenda), '') IS NOT NULL OR
  NULLIF(TRIM(vp.parlamentar), '') IS NOT NULL OR
  vp.valor_emenda IS NOT NULL OR
  vp.valor_global IS NOT NULL OR
  vp.valor_empenhado IS NOT NULL OR
  vp.valor_liberado IS NOT NULL OR
  NULLIF(TRIM(vp.nr_convenio), '') IS NOT NULL OR
  NULLIF(TRIM(vp.objeto), '') IS NOT NULL OR
  NULLIF(TRIM(vp.modalidade), '') IS NOT NULL OR
  NULLIF(TRIM(vp.situacao), '') IS NOT NULL OR
  vp.saldo_conta IS NOT NULL
)`

async function printSummary(label) {
  const client = await pool.connect()
  try {
    const [batchRes, execCurrentRes, execExpectedRes, aprovacaoRes] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int AS rows,
          COUNT(DISTINCT vp.cnpj)::int AS cnpjs
        FROM vendedor_projetos vp
        WHERE NOT ${STRUCTURED_SCOPE_SQL}
      `),
      client.query(`
        SELECT
          COUNT(*)::int AS rows,
          COUNT(DISTINCT pe.cnpj)::int AS cnpjs,
          COALESCE(SUM(pe.valor_global), 0)::numeric(20,2) AS valor
        FROM projetos_execucao pe
      `),
      client.query(`
        WITH allowed AS (
          SELECT DISTINCT cnpj FROM existing_clients
          UNION
          SELECT DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj
          FROM vendedor_projetos vp
          WHERE ${STRUCTURED_SCOPE_SQL}
        )
        SELECT
          COUNT(*)::int AS rows,
          COUNT(DISTINCT pe.cnpj)::int AS cnpjs,
          COALESCE(SUM(pe.valor_global), 0)::numeric(20,2) AS valor
        FROM projetos_execucao pe
        JOIN allowed a ON a.cnpj = pe.cnpj
      `),
      client.query(`
        SELECT
          COUNT(DISTINCT vp.cnpj)::int AS total_leads,
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE COALESCE(vp.status_contato, 'Não Contatado') IN ('Não Contatado', 'Nao Contatado')
          )::int AS nao_contatado
        FROM vendedor_projetos vp
        WHERE ${STRUCTURED_SCOPE_SQL}
      `),
    ])

    console.log(`\n=== ${label} ===`)
    console.log('cadastro_cru:', batchRes.rows[0])
    console.log('execucao_atual:', execCurrentRes.rows[0])
    console.log('execucao_esperada_com_filtro:', execExpectedRes.rows[0])
    console.log('aprovacao_kpi_com_filtro:', aprovacaoRes.rows[0])
  } finally {
    client.release()
  }
}

async function deleteContaminatedExecucaoRows() {
  const client = await pool.connect()
  try {
    const deleteRes = await client.query(`
      WITH raw_cnpjs AS (
        SELECT DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj
        FROM vendedor_projetos vp
        WHERE NOT ${STRUCTURED_SCOPE_SQL}
      ),
      deleted AS (
        DELETE FROM projetos_execucao pe
        USING raw_cnpjs rc
        WHERE pe.cnpj = rc.cnpj
        RETURNING pe.nr_convenio
      )
      SELECT COUNT(*)::int AS deleted_rows FROM deleted
    `)

    return deleteRes.rows[0]?.deleted_rows ?? 0
  } finally {
    client.release()
  }
}

async function main() {
  await printSummary('ANTES')

  const deletedRows = await deleteContaminatedExecucaoRows()
  console.log(`\nLinhas removidas de projetos_execucao: ${deletedRows}`)

  await printSummary('DEPOIS')
  await pool.end()
}

main().catch(async (error) => {
  console.error('repair-execucao-contamination failed:', error)
  await pool.end()
  process.exit(1)
})

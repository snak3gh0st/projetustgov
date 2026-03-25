import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const client = await pool.connect()

  try {
    const summaryResult = await client.query(`
      WITH proposta_counts AS (
        SELECT proponente_cnpj AS cnpj, COUNT(*)::INT AS cnt
        FROM propostas
        GROUP BY proponente_cnpj
      ),
      execucao_tags AS (
        SELECT
          pe.cnpj,
          COALESCE(pc.cnt, 0)::INT AS total_propostas_db,
          COALESCE(pc.cnt, 0) >= 5 AS tag_autossuficiente,
          COALESCE(pc.cnt, 0) < 5 AS tag_iniciante,
          BOOL_OR(
            COALESCE(pe.rendimento_aplicacao, 0) > 5000
            AND COALESCE(pe.saldo_conta, 0) >= COALESCE(pe.rendimento_aplicacao, 0)
          ) AS tag_rendimento,
          COUNT(*) FILTER (
            WHERE COALESCE(pe.rendimento_aplicacao, 0) > 5000
              AND COALESCE(pe.saldo_conta, 0) >= COALESCE(pe.rendimento_aplicacao, 0)
          )::INT AS eligible_convenios
        FROM projetos_execucao pe
        LEFT JOIN proposta_counts pc ON pc.cnpj = pe.cnpj
        GROUP BY pe.cnpj, COALESCE(pc.cnt, 0)
      )
      SELECT
        COUNT(*)::INT AS total_cnpjs,
        COUNT(*) FILTER (WHERE total_propostas_db = 5)::INT AS cnpjs_com_5_propostas,
        COUNT(*) FILTER (WHERE eligible_convenios > 0)::INT AS cnpjs_com_rendimento_elegivel,
        COUNT(*) FILTER (WHERE tag_rendimento)::INT AS cnpjs_marcados_com_rendimento
      FROM execucao_tags
    `)

    const failuresResult = await client.query(`
      WITH proposta_counts AS (
        SELECT proponente_cnpj AS cnpj, COUNT(*)::INT AS cnt
        FROM propostas
        GROUP BY proponente_cnpj
      ),
      execucao_tags AS (
        SELECT
          pe.cnpj,
          COALESCE(pc.cnt, 0)::INT AS total_propostas_db,
          COALESCE(pc.cnt, 0) >= 5 AS tag_autossuficiente,
          COALESCE(pc.cnt, 0) < 5 AS tag_iniciante,
          BOOL_OR(
            COALESCE(pe.rendimento_aplicacao, 0) > 5000
            AND COALESCE(pe.saldo_conta, 0) >= COALESCE(pe.rendimento_aplicacao, 0)
          ) AS tag_rendimento,
          COUNT(*) FILTER (
            WHERE COALESCE(pe.rendimento_aplicacao, 0) > 5000
              AND COALESCE(pe.saldo_conta, 0) >= COALESCE(pe.rendimento_aplicacao, 0)
          )::INT AS eligible_convenios
        FROM projetos_execucao pe
        LEFT JOIN proposta_counts pc ON pc.cnpj = pe.cnpj
        GROUP BY pe.cnpj, COALESCE(pc.cnt, 0)
      ),
      violation_five AS (
        SELECT
          'five-propostas-threshold' AS check_name,
          cnpj,
          total_propostas_db,
          tag_autossuficiente,
          tag_iniciante,
          tag_rendimento,
          eligible_convenios
        FROM execucao_tags
        WHERE total_propostas_db = 5
          AND (tag_autossuficiente IS DISTINCT FROM TRUE OR tag_iniciante IS DISTINCT FROM FALSE)
      ),
      violation_rendimento_without_eligible AS (
        SELECT
          'rendimento-without-eligible-convenio' AS check_name,
          cnpj,
          total_propostas_db,
          tag_autossuficiente,
          tag_iniciante,
          tag_rendimento,
          eligible_convenios
        FROM execucao_tags
        WHERE tag_rendimento = TRUE
          AND eligible_convenios = 0
      ),
      violation_missing_guard AS (
        SELECT
          'rendimento-should-stay-false-without-eligible-convenio' AS check_name,
          cnpj,
          total_propostas_db,
          tag_autossuficiente,
          tag_iniciante,
          tag_rendimento,
          eligible_convenios
        FROM execucao_tags
        WHERE eligible_convenios = 0
          AND tag_rendimento = TRUE
      )
      SELECT *
      FROM (
        SELECT * FROM violation_five
        UNION ALL
        SELECT * FROM violation_rendimento_without_eligible
        UNION ALL
        SELECT * FROM violation_missing_guard
      ) failures
      ORDER BY check_name, cnpj
    `)

    const summary = summaryResult.rows[0]
    const failures = failuresResult.rows

    console.log('Execucao tag regression summary')
    console.log(`- CNPJs verificados: ${summary.total_cnpjs}`)
    console.log(`- CNPJs com exatamente 5 propostas: ${summary.cnpjs_com_5_propostas}`)
    console.log(`- CNPJs com convenio elegivel para Rendimento: ${summary.cnpjs_com_rendimento_elegivel}`)
    console.log(`- CNPJs marcados com tag Rendimento: ${summary.cnpjs_marcados_com_rendimento}`)

    if (failures.length > 0) {
      console.error(`\nFAIL: ${failures.length} violacao(oes) encontradas.`)
      console.table(failures.slice(0, 10))
      process.exit(1)
    }

    console.log('\nOK: limiar de 5 propostas e regra de Rendimento estao consistentes.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('FATAL:', error)
  process.exit(1)
})

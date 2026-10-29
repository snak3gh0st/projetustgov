import 'server-only'
import { getPool, query } from '@/lib/db'
import type { Relatorio } from './types'

// Retrato gravado de cada semana: o que o Philipe leu na sexta não muda depois,
// e `enviado_para` impede e-mail repetido quando o run-cron.sh tenta de novo.

let ensured = false

export async function ensureRelatorioTable(): Promise<void> {
  if (ensured) return
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS relatorio_semanal (
      semana_ate DATE PRIMARY KEY,
      semana_de DATE NOT NULL,
      dados JSONB NOT NULL,
      gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enviado_para TEXT[] NOT NULL DEFAULT '{}',
      enviado_em TIMESTAMPTZ
    )
  `)
  ensured = true
}

/** Leitura sem criar a tabela: antes do primeiro envio ela pode não existir. */
async function tableExists(): Promise<boolean> {
  if (ensured) return true
  const rows = await query<{ t: string | null }>(`SELECT to_regclass('public.relatorio_semanal')::text AS t`)
  return rows[0]?.t != null
}

export type Gravado = { dados: Relatorio; enviadoPara: string[]; enviadoEm: string | null }

export async function carregar(semanaAte: string): Promise<Gravado | null> {
  if (!(await tableExists())) return null
  const rows = await query<{ dados: Relatorio; enviado_para: string[]; enviado_em: string | null }>(
    `SELECT dados, enviado_para, enviado_em::text AS enviado_em FROM relatorio_semanal WHERE semana_ate = $1::date`,
    [semanaAte]
  )
  const r = rows[0]
  return r ? { dados: r.dados, enviadoPara: r.enviado_para, enviadoEm: r.enviado_em } : null
}

export async function listar(): Promise<{ de: string; ate: string; enviadoEm: string | null }[]> {
  if (!(await tableExists())) return []
  return query<{ de: string; ate: string; enviadoEm: string | null }>(
    `SELECT semana_de::text AS de, semana_ate::text AS ate, enviado_em::text AS "enviadoEm"
     FROM relatorio_semanal ORDER BY semana_ate DESC LIMIT 52`
  )
}

/** Grava o retrato da semana. Depois do primeiro envio ele fica congelado. */
export async function salvar(r: Relatorio): Promise<void> {
  await ensureRelatorioTable()
  await query(
    `INSERT INTO relatorio_semanal (semana_ate, semana_de, dados) VALUES ($1::date, $2::date, $3::jsonb)
     ON CONFLICT (semana_ate) DO UPDATE SET dados = EXCLUDED.dados, gerado_em = NOW()
     WHERE cardinality(relatorio_semanal.enviado_para) = 0`,
    [r.semana.ate, r.semana.de, JSON.stringify(r)]
  )
}

/** Reserva o envio para um destinatário. Falso se ele já recebeu esta semana. */
export async function reservarEnvio(semanaAte: string, email: string): Promise<boolean> {
  const rows = await query(
    `UPDATE relatorio_semanal SET enviado_para = array_append(enviado_para, $2), enviado_em = NOW()
     WHERE semana_ate = $1::date AND NOT ($2 = ANY(enviado_para)) RETURNING 1`,
    [semanaAte, email]
  )
  return rows.length > 0
}

/** Desfaz a reserva quando o envio falhou, para a próxima tentativa mandar. */
export async function liberarEnvio(semanaAte: string, email: string): Promise<void> {
  await query(
    `UPDATE relatorio_semanal SET enviado_para = array_remove(enviado_para, $2),
       enviado_em = CASE WHEN cardinality(array_remove(enviado_para, $2)) = 0 THEN NULL ELSE enviado_em END
     WHERE semana_ate = $1::date`,
    [semanaAte, email]
  )
}

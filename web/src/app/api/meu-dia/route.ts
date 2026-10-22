import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, isSeller } from '@/lib/dal'
import { normalizeCrmStatus } from '@/lib/crm-catalog'
import { execucaoFaseSql } from '@/lib/execucao-fase'
import { normalizedStatusOrderSql, normalizedStatusSql } from '@/lib/execucao-status'
import { classifyMeuDia, type MeuDiaCandidate } from '@/lib/meu-dia'

export const dynamic = 'force-dynamic'

interface CandidateRow {
  cnpj: string
  nome: string | null
  municipio: string | null
  uf: string | null
  status: string | null
  atribuido_em: Date | string | null
  dias_sem_contato: number | null
  em_execucao?: boolean
}

// Aprovação: mesmo escopo e mesma conta de "dias sem contato" de /api/leads (dono ou closer).
const APROVACAO_SQL = `
  WITH mine AS (
    SELECT * FROM vendedor_projetos vp WHERE vp.vendedor_id = $1 OR vp.closer_id = $1
  ),
  by_cnpj AS (
    SELECT DISTINCT ON (vp.cnpj)
      vp.cnpj, vp.nome, vp.municipio, vp.uf,
      ${normalizedStatusSql('vp.status_contato')} AS status
    FROM mine vp
    ORDER BY vp.cnpj, ${normalizedStatusOrderSql(normalizedStatusSql('vp.status_contato'))} ASC, vp.updated_at DESC NULLS LAST
  )
  SELECT
    b.cnpj, b.nome, b.municipio, b.uf, b.status,
    COALESCE(
      (SELECT MAX(le.created_at) FROM lead_events le
        WHERE le.tipo = 'atribuicao' AND le.vendedor_novo_id = $1 AND le.cnpj = b.cnpj),
      (SELECT MAX(m.created_at) FROM mine m WHERE m.cnpj = b.cnpj)
    ) AS atribuido_em,
    EXTRACT(DAY FROM NOW() - GREATEST(
      (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = b.cnpj AND cn.vendedor_id = $1),
      (SELECT MAX(m.updated_at) FROM mine m WHERE m.cnpj = b.cnpj AND m.status_contato != 'Não Contatado')
    ))::int AS dias_sem_contato
  FROM by_cnpj b
`

// Execução e Prestação: CNPJs com convênio numa das duas fases e dono = consultor,
// com o status e o "último contato" de /api/execucao.
const EXECUCAO_SQL = `
  WITH owned AS (
    SELECT DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean
    FROM vendedor_projetos vp
    WHERE vp.vendedor_id = $1
  ),
  pe_mine AS (
    SELECT
      pe.cnpj,
      MAX(pe.nome_proponente) AS nome,
      MAX(pe.municipio) AS municipio,
      MAX(pe.uf) AS uf,
      BOOL_OR(${execucaoFaseSql('execucao', 'pe')}) AS em_execucao
    FROM projetos_execucao pe
    JOIN owned o ON o.cnpj_clean = pe.cnpj
    WHERE (${execucaoFaseSql('execucao', 'pe')}) OR (${execucaoFaseSql('prestacao_contas', 'pe')})
    GROUP BY pe.cnpj
  ),
  crm_statuses AS (
    SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
      REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
      ${normalizedStatusSql('vp.status_contato_execucao')} AS crm_status
    FROM vendedor_projetos vp
    WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') IN (SELECT cnpj FROM pe_mine)
    ORDER BY
      REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'),
      ${normalizedStatusOrderSql(normalizedStatusSql('vp.status_contato_execucao'))} ASC,
      vp.updated_at DESC NULLS LAST
  )
  SELECT
    p.cnpj, p.nome, p.municipio, p.uf, p.em_execucao,
    COALESCE(cs.crm_status, 'Não Contatado') AS status,
    COALESCE(
      (SELECT MAX(le.created_at) FROM lead_events le
        WHERE le.tipo = 'atribuicao' AND le.vendedor_novo_id = $1
          AND REGEXP_REPLACE(le.cnpj, '[^0-9]', '', 'g') = p.cnpj),
      (SELECT MAX(vp.created_at) FROM vendedor_projetos vp
        WHERE vp.vendedor_id = $1 AND REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = p.cnpj)
    ) AS atribuido_em,
    (SELECT EXTRACT(DAY FROM NOW() - MAX(cn.created_at))::int FROM contact_notes cn
      WHERE REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g') = p.cnpj) AS dias_sem_contato
  FROM pe_mine p
  LEFT JOIN crm_statuses cs ON cs.cnpj_clean = p.cnpj
`

const toIso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString())

// GET /api/meu-dia - o que o consultor tem para fazer hoje (novos, parados, reuniões)
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isSeller(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [aprovacao, execucao] = await Promise.all([
      query<CandidateRow>(APROVACAO_SQL, [session.userId]),
      query<CandidateRow>(EXECUCAO_SQL, [session.userId]),
    ])

    const toCandidate = (row: CandidateRow, funil: MeuDiaCandidate['funil']): MeuDiaCandidate => ({
      cnpj: row.cnpj,
      nome: row.nome,
      municipio: row.municipio,
      uf: row.uf,
      funil,
      status: normalizeCrmStatus(row.status),
      atribuido_em: toIso(row.atribuido_em),
      dias_sem_contato: row.dias_sem_contato == null ? null : Number(row.dias_sem_contato),
    })

    const candidates = [
      ...aprovacao.map((row) => toCandidate(row, 'aprovacao')),
      ...execucao.map((row) => toCandidate(row, row.em_execucao ? 'execucao' : 'prestacao_contas')),
    ]

    return NextResponse.json(classifyMeuDia(candidates, new Date()))
  } catch (error) {
    console.error('[api/meu-dia] error:', error)
    return NextResponse.json({ error: 'Failed to load Meu dia' }, { status: 500 })
  }
}

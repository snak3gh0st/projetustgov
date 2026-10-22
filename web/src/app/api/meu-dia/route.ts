import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, isSeller } from '@/lib/dal'
import { execucaoFaseSql } from '@/lib/execucao-fase'
import { normalizedStatusOrderSql, normalizedStatusSql } from '@/lib/execucao-status'
import { classifyMeuDia, meuDiaStatus, type MeuDiaCandidate } from '@/lib/meu-dia'

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

// Aprovação: uma linha por emenda (o status é por linha, como na aba Leads), com o escopo de /api/leads
// (dono ou closer) e a mesma conta de "dias sem contato" por CNPJ.
const APROVACAO_SQL = `
  WITH mine AS (
    SELECT id, cnpj, nome, municipio, uf, status_contato, created_at, updated_at
    FROM vendedor_projetos
    WHERE vendedor_id = $1 OR closer_id = $1
  ),
  notes AS (
    SELECT lead_cnpj AS cnpj, MAX(created_at) AS at
    FROM contact_notes
    WHERE vendedor_id = $1
    GROUP BY lead_cnpj
  ),
  touched AS (
    SELECT cnpj, MAX(updated_at) AS at
    FROM mine
    WHERE status_contato != 'Não Contatado'
    GROUP BY cnpj
  ),
  assigned AS (
    SELECT lead_id, MAX(created_at) AS at
    FROM lead_events
    WHERE tipo = 'atribuicao' AND vendedor_novo_id = $1
    GROUP BY lead_id
  )
  SELECT
    m.cnpj, m.nome, m.municipio, m.uf,
    ${normalizedStatusSql('m.status_contato')} AS status,
    COALESCE(a.at, m.created_at) AS atribuido_em,
    EXTRACT(DAY FROM NOW() - GREATEST(n.at, t.at))::int AS dias_sem_contato
  FROM mine m
  LEFT JOIN notes n ON n.cnpj = m.cnpj
  LEFT JOIN touched t ON t.cnpj = m.cnpj
  LEFT JOIN assigned a ON a.lead_id = m.id
`

// Execução e Prestação: um item por CNPJ com convênio numa das duas fases e dono = consultor,
// com o status e o "último contato" de /api/execucao. Cada tabela é agrupada uma vez.
const EXECUCAO_SQL = `
  WITH owned AS (
    SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj_clean, MAX(created_at) AS created_at
    FROM vendedor_projetos
    WHERE vendedor_id = $1
    GROUP BY 1
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
  ),
  last_contact AS (
    SELECT REGEXP_REPLACE(lead_cnpj, '[^0-9]', '', 'g') AS cnpj_clean, MAX(created_at) AS at
    FROM contact_notes
    GROUP BY 1
  ),
  assigned AS (
    SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj_clean, MAX(created_at) AS at
    FROM lead_events
    WHERE tipo = 'atribuicao' AND vendedor_novo_id = $1
    GROUP BY 1
  )
  SELECT
    p.cnpj, p.nome, p.municipio, p.uf, p.em_execucao,
    COALESCE(cs.crm_status, 'Não Contatado') AS status,
    COALESCE(a.at, o.created_at) AS atribuido_em,
    EXTRACT(DAY FROM NOW() - lc.at)::int AS dias_sem_contato
  FROM pe_mine p
  JOIN owned o ON o.cnpj_clean = p.cnpj
  LEFT JOIN crm_statuses cs ON cs.cnpj_clean = p.cnpj
  LEFT JOIN last_contact lc ON lc.cnpj_clean = p.cnpj
  LEFT JOIN assigned a ON a.cnpj_clean = p.cnpj
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
      status: meuDiaStatus(row.status),
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

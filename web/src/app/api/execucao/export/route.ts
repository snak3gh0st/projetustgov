import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor' && session.role !== 'coordenador') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const vendedor_id = searchParams.get('vendedor_id')

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let pi = 1

    if (status) {
      conditions.push(`cs.crm_status = $${pi++}`)
      params.push(status)
    }
    if (vendedor_id && vendedor_id !== 'unassigned') {
      conditions.push(`vo.vendedor_id = $${pi++}`)
      params.push(vendedor_id)
    }
    if (vendedor_id === 'unassigned') {
      conditions.push('vo.vendedor_id IS NULL')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await query(`
      WITH agg AS (
        SELECT
          pe.cnpj,
          MAX(pe.nome_proponente) AS nome_proponente,
          MAX(pe.uf) AS uf,
          MAX(pe.municipio) AS municipio,
          COUNT(*)::INT AS total_projetos,
          SUM(pe.valor_global) AS total_valor_global,
          SUM(pe.valor_desembolsado) AS total_desembolsado,
          SUM(pe.saldo_conta) AS total_saldo,
          CASE
            WHEN (SUM(pe.valor_desembolsado) + SUM(pe.ingresso_contrapartida) + SUM(pe.rendimento_aplicacao)) > 0 AND SUM(pe.valor_global) > 0
            THEN ROUND(GREATEST(0, SUM(pe.valor_desembolsado) + SUM(pe.ingresso_contrapartida) + SUM(pe.rendimento_aplicacao) - SUM(pe.saldo_conta)) / SUM(pe.valor_global) * 100, 1)
            ELSE NULL
          END AS pct_execucao,
          BOOL_OR(pe.valor_desembolsado = 0) AS tem_alerta,
          MIN(pe.data_fim_vigencia) AS data_fim_vigencia
        FROM projetos_execucao pe
        GROUP BY pe.cnpj
      ),
      crm_statuses AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          CASE
            WHEN COALESCE(vp.status_contato_execucao, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
            ELSE COALESCE(vp.status_contato_execucao, 'Não Contatado')
          END AS crm_status,
          vp.observacoes_execucao
        FROM vendedor_projetos vp
        ORDER BY REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'), vp.updated_at DESC NULLS LAST
      ),
      vendedor_owners AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          u.nome AS vendedor_nome,
          vp.vendedor_id
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
        ORDER BY REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'), COUNT(*) OVER (PARTITION BY REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'), vp.vendedor_id) DESC
      ),
      contacts_agg AS (
        SELECT
          REGEXP_REPLACE(lc.lead_cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          json_agg(json_build_object(
            'nome_pessoa', lc.nome_pessoa,
            'cargo', lc.cargo,
            'telefone', lc.telefone,
            'email', lc.email
          ) ORDER BY lc.principal DESC, lc.created_at ASC) AS contacts
        FROM lead_contacts lc
        WHERE NULLIF(TRIM(lc.telefone), '') IS NOT NULL OR NULLIF(TRIM(lc.email), '') IS NOT NULL
        GROUP BY REGEXP_REPLACE(lc.lead_cnpj, '[^0-9]', '', 'g')
      )
      SELECT
        a.cnpj, a.nome_proponente, a.uf, a.municipio,
        COALESCE(cs.crm_status, 'Não Contatado') AS crm_status,
        cs.observacoes_execucao,
        a.total_projetos, a.total_valor_global, a.total_desembolsado, a.total_saldo,
        a.pct_execucao, a.tem_alerta, a.data_fim_vigencia,
        vo.vendedor_nome,
        ca.contacts
      FROM agg a
      LEFT JOIN crm_statuses cs ON cs.cnpj_clean = a.cnpj
      LEFT JOIN vendedor_owners vo ON vo.cnpj_clean = a.cnpj
      LEFT JOIN contacts_agg ca ON ca.cnpj_clean = a.cnpj
      WHERE ${conditions.join(' AND ')}
      ORDER BY vo.vendedor_nome ASC NULLS LAST, a.nome_proponente ASC
    `, params) as any[]

    type Contact = { nome_pessoa: string | null; cargo: string | null; telefone: string | null; email: string | null }

    let maxContacts = 0
    for (const row of rows) {
      const ct = row.contacts as Contact[] | null
      if (ct && ct.length > maxContacts) maxContacts = ct.length
    }

    const headers = [
      'Vendedor', 'CNPJ', 'Nome', 'Status Execução', 'UF', 'Município',
      ...Array.from({ length: maxContacts }, (_, i) => [
        `Contato ${i + 1} Nome`, `Contato ${i + 1} Tel`, `Contato ${i + 1} Email`
      ]).flat(),
      'Fomentos', 'Valor Global', 'Desembolsado', 'Saldo', '% Execução',
      'Alerta', 'Vigência', 'Observações'
    ]

    const esc = (v: unknown) => {
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }

    const csvRows = [headers.map(esc).join(',')]
    for (const row of rows) {
      const contacts = (row.contacts as Contact[] | null) || []
      const contactCols: string[] = []
      for (let i = 0; i < maxContacts; i++) {
        const c = contacts[i]
        contactCols.push(esc(c?.nome_pessoa), esc(c?.telefone), esc(c?.email))
      }
      csvRows.push([
        esc(row.vendedor_nome),
        esc(row.cnpj),
        esc(row.nome_proponente),
        esc(row.crm_status),
        esc(row.uf),
        esc(row.municipio),
        ...contactCols,
        esc(row.total_projetos),
        esc(row.total_valor_global),
        esc(row.total_desembolsado),
        esc(row.total_saldo),
        esc(row.pct_execucao != null ? `${row.pct_execucao}%` : ''),
        esc(row.tem_alerta ? 'Sim' : ''),
        esc(row.data_fim_vigencia),
        esc(row.observacoes_execucao),
      ].join(','))
    }

    const bom = '\uFEFF'
    const csv = bom + csvRows.join('\n')
    const today = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="execucao-${today}.csv"`,
      },
    })
  } catch (error) {
    console.error('[api/execucao/export] Error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canExportContacts } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canExportContacts(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') // 'pendentes' or null (all)

    const whereClause = filter === 'pendentes'
      ? `WHERE vp.status_contato IN ('Não Contatado', 'Retorno')`
      : 'WHERE 1=1'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await query(`
      SELECT
        u.nome AS vendedor_nome,
        vp.cnpj,
        COALESCE(p.nome, vp.nome, 'Sem nome') AS nome,
        vp.status_contato,
        vp.valor_emenda,
        vp.orgao_concedente,
        COALESCE(p.estado, vp.uf) AS uf,
        COALESCE(p.municipio, vp.municipio) AS municipio,
        vp.parlamentar,
        vp.observacoes,
        vp.link_externo,
        (
          SELECT json_agg(json_build_object(
            'nome_pessoa', lc.nome_pessoa,
            'cargo', lc.cargo,
            'telefone', lc.telefone,
            'email', lc.email
          ) ORDER BY lc.principal DESC, lc.created_at ASC)
          FROM lead_contacts lc
          WHERE lc.lead_cnpj = vp.cnpj
        ) AS contacts
      FROM vendedor_projetos vp
      LEFT JOIN users u ON vp.vendedor_id = u.id
      LEFT JOIN proponentes p ON vp.cnpj = p.cnpj
      ${whereClause}
      ORDER BY u.nome ASC NULLS LAST, COALESCE(p.nome, vp.nome, '') ASC, vp.cnpj
    `, []) as any[]

    type Contact = { nome_pessoa: string | null; cargo: string | null; telefone: string | null; email: string | null }

    // Find max number of contacts across all leads
    let maxContacts = 0
    for (const row of rows) {
      const c = row.contacts as Contact[] | null
      if (c && c.length > maxContacts) maxContacts = c.length
    }
    if (maxContacts === 0) maxContacts = 1

    // Build dynamic headers: Contato 1 Nome, Contato 1 Cargo, Contato 1 Tel, Contato 1 Email, Contato 2 ...
    const baseHeaders = ['Vendedor', 'CNPJ', 'Nome', 'Status']
    const contactHeaders: string[] = []
    for (let i = 1; i <= maxContacts; i++) {
      contactHeaders.push(`Contato ${i} Nome`, `Contato ${i} Cargo`, `Contato ${i} Tel`, `Contato ${i} Email`)
    }
    const tailHeaders = ['Valor Emenda', 'Ministerio', 'UF', 'Municipio', 'Parlamentar', 'Observacoes', 'Link']
    const headers = [...baseHeaders, ...contactHeaders, ...tailHeaders]

    const csvRows: string[][] = []

    for (const row of rows) {
      const contacts = (row.contacts as Contact[] | null) || []

      const base: string[] = [
        String(row.vendedor_nome || 'Sem Vendedor'),
        String(row.cnpj),
        String(row.nome || ''),
        String(row.status_contato || ''),
      ]

      // Fill contact columns — pad with empty if fewer contacts than max
      const contactCols: string[] = []
      for (let i = 0; i < maxContacts; i++) {
        const c = contacts[i]
        contactCols.push(
          c?.nome_pessoa || '',
          c?.cargo || '',
          c?.telefone || '',
          c?.email || '',
        )
      }

      const tail: string[] = [
        row.valor_emenda != null ? String(row.valor_emenda) : '',
        String(row.orgao_concedente || ''),
        String(row.uf || ''),
        String(row.municipio || ''),
        String(row.parlamentar || ''),
        String(row.observacoes || ''),
        String(row.link_externo || ''),
      ]

      csvRows.push([...base, ...contactCols, ...tail])
    }

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [
      headers.join(','),
      ...csvRows.map(r => r.map(escape).join(','))
    ].join('\n')

    const date = new Date().toISOString().slice(0, 10)
    const filename = filter === 'pendentes' ? `pendentes-${date}.csv` : `leads-${date}.csv`

    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export leads error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

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
        COALESCE(p.uf, vp.uf) AS uf,
        COALESCE(p.municipio, vp.municipio) AS municipio,
        vp.parlamentar,
        vp.observacoes,
        vp.link_externo,
        (
          SELECT json_agg(json_build_object(
            'nome_pessoa', lc.nome_pessoa,
            'cargo', lc.cargo,
            'telefone', lc.telefone,
            'email', lc.email,
            'principal', lc.principal
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

    const headers = ['Vendedor', 'CNPJ', 'Nome', 'Status', 'Contato Nome', 'Contato Cargo', 'Telefone', 'Email', 'Principal', 'Valor Emenda', 'Ministerio', 'UF', 'Municipio', 'Parlamentar', 'Observacoes', 'Link']

    const csvRows: string[][] = []

    for (const row of rows) {
      const contacts = row.contacts as Array<{
        nome_pessoa: string | null
        cargo: string | null
        telefone: string | null
        email: string | null
        principal: boolean
      }> | null

      const base: string[] = [
        String(row.vendedor_nome || 'Sem Vendedor'),
        String(row.cnpj),
        String(row.nome || ''),
        String(row.status_contato || ''),
      ]

      const tail: string[] = [
        row.valor_emenda != null ? String(row.valor_emenda) : '',
        String(row.orgao_concedente || ''),
        String(row.uf || ''),
        String(row.municipio || ''),
        String(row.parlamentar || ''),
        String(row.observacoes || ''),
        String(row.link_externo || ''),
      ]

      if (contacts && contacts.length > 0) {
        for (const c of contacts) {
          csvRows.push([
            ...base,
            c.nome_pessoa || '',
            c.cargo || '',
            c.telefone || '',
            c.email || '',
            c.principal ? 'Sim' : '',
            ...tail,
          ])
        }
      } else {
        csvRows.push([...base, '', '', '', '', '', ...tail])
      }
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

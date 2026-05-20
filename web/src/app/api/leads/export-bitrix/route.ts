import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { query } from '@/lib/db'
import { canExportContacts, getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

type ExportRow = {
  vendedor_nome: string | null
  cnpj: string
  nome: string | null
  status_contato: string | null
  valor_emenda: number | null
  valor_venda: number | null
  orgao_concedente: string | null
  uf: string | null
  municipio: string | null
  observacoes: string | null
  link_externo: string | null
  contato_nome: string | null
  contato_cargo: string | null
  contato_telefone: string | null
  contato_email: string | null
}

function formatCnpj(cnpj: string): string {
  const digits = (cnpj || '').replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

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
    const filter = searchParams.get('filter') // 'pendentes' or null
    const vendedorId = searchParams.get('vendedor_id')?.trim() || null

    if (session.role === 'coordenador' && (!vendedorId || vendedorId === 'unassigned')) {
      return NextResponse.json(
        { error: 'Forbidden: coordenador export requires vendedor_id filter' },
        { status: 403 }
      )
    }

    if (vendedorId && vendedorId !== 'unassigned') {
      const vendedorRows = await query<{ id: string }>(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role IN ('vendedor', 'coordenador', 'gestor')
         LIMIT 1`,
        [vendedorId]
      )
      if (vendedorRows.length === 0) {
        return NextResponse.json({ error: 'Invalid vendedor_id' }, { status: 400 })
      }
    }

    const whereConditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (filter === 'pendentes') {
      whereConditions.push(`vp.status_contato IN ('Não Contatado', 'Retorno')`)
    }

    if (vendedorId === 'unassigned') {
      whereConditions.push('vp.vendedor_id IS NULL')
    } else if (vendedorId) {
      whereConditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    const rows = await query<ExportRow>(
      `SELECT
         u.nome AS vendedor_nome,
         vp.cnpj,
         COALESCE(p.nome, vp.nome) AS nome,
         vp.status_contato,
         vp.valor_emenda,
         vp.valor_venda,
         vp.orgao_concedente,
         COALESCE(p.estado, vp.uf) AS uf,
         COALESCE(p.municipio, vp.municipio) AS municipio,
         vp.observacoes,
         vp.link_externo,
         lc.nome_pessoa AS contato_nome,
         lc.cargo AS contato_cargo,
         lc.telefone AS contato_telefone,
         lc.email AS contato_email
       FROM vendedor_projetos vp
       LEFT JOIN users u ON u.id = vp.vendedor_id
       LEFT JOIN proponentes p ON p.cnpj = vp.cnpj
       LEFT JOIN LATERAL (
         SELECT nome_pessoa, cargo, telefone, email
         FROM lead_contacts
         WHERE lead_cnpj = vp.cnpj
         ORDER BY principal DESC, created_at ASC
         LIMIT 1
       ) lc ON TRUE
       ${whereClause}
       ORDER BY u.nome ASC NULLS LAST, COALESCE(p.nome, vp.nome, '') ASC, vp.cnpj`,
      params
    )

    // Default worksheet aligned to Bitrix CRM import mapping (Deals + Company + Contact).
    const bitrixRows = rows.map((row) => {
      const valorNegocio = row.valor_venda ?? row.valor_emenda ?? 0
      return {
        'Deal name': `Projetus - ${row.nome || formatCnpj(row.cnpj)}`,
        'Deal amount': Number(valorNegocio || 0),
        'Currency': 'BRL',
        'Deal stage': row.status_contato || '',
        'Assigned salesperson': row.vendedor_nome || '',
        'Company name': row.nome || '',
        'Company tax ID (CNPJ)': formatCnpj(row.cnpj),
        'Contact full name': row.contato_nome || row.nome || '',
        'Contact position': row.contato_cargo || '',
        'Phone': row.contato_telefone || '',
        'Email': row.contato_email || '',
        'City': row.municipio || '',
        'State': row.uf || '',
        'Ministry': row.orgao_concedente || '',
        'Comments': row.observacoes || '',
        'Source URL': row.link_externo || '',
      }
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(bitrixRows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bitrix_Import')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
    const body = new Uint8Array(buffer)

    const today = new Date().toISOString().slice(0, 10)
    const filename = filter === 'pendentes'
      ? `bitrix-pendentes-${today}.xlsx`
      : `bitrix-leads-${today}.xlsx`

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[api/leads/export-bitrix] error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const DEFAULT_CIDADES = ['Brasília', 'Goiânia']

// Municipio values arrive from spreadsheet imports with inconsistent accenting
// ("BRASÍLIA" vs "BRASILIA"), so matching must fold accents on both sides.
function foldAccents(s: string): string {
  return s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const ACCENTED = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ'
const PLAIN = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'

type ExportRow = {
  cnpj: string
  nome: string | null
  uf: string | null
  municipio: string | null
  telefone: string | null
  email: string | null
  vendedor_nome: string | null
  contacts: Array<{ nome_pessoa: string | null; cargo: string | null; telefone: string | null; email: string | null }> | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canCsm(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const cidadesParam = searchParams.get('cidades')?.trim()
    const cidades = cidadesParam
      ? cidadesParam.split(',').map(c => c.trim()).filter(Boolean)
      : DEFAULT_CIDADES

    if (cidades.length === 0) {
      return NextResponse.json({ error: 'No cidades provided' }, { status: 400 })
    }

    // Accent-fold both the target cities and the DB value before comparing —
    // imported municipio data mixes "BRASÍLIA" and "BRASILIA" spellings.
    const cidadesFolded = cidades.map(foldAccents)

    // One row per CNPJ — vendedor_projetos can have multiple rows per client
    // (multiple programas/emendas), so the LATERAL join picks the most recently updated.
    const rows = await query<ExportRow>(`
      SELECT
        ec.cnpj,
        COALESCE(p.nome, vp_agg.nome) AS nome,
        COALESCE(p.estado, vp_agg.uf) AS uf,
        COALESCE(p.municipio, vp_agg.municipio) AS municipio,
        NULLIF(p.telefone, 'nan') AS telefone,
        p.email,
        u.nome AS vendedor_nome,
        (
          SELECT json_agg(json_build_object(
            'nome_pessoa', lc.nome_pessoa,
            'cargo', lc.cargo,
            'telefone', lc.telefone,
            'email', lc.email
          ) ORDER BY lc.principal DESC, lc.created_at ASC)
          FROM lead_contacts lc
          WHERE lc.lead_cnpj = ec.cnpj
        ) AS contacts
      FROM existing_clients ec
      LEFT JOIN proponentes p ON p.cnpj = ec.cnpj
      LEFT JOIN LATERAL (
        SELECT vp.nome, vp.uf, vp.municipio, vp.vendedor_id
        FROM vendedor_projetos vp
        WHERE vp.cnpj = ec.cnpj
        ORDER BY vp.updated_at DESC NULLS LAST
        LIMIT 1
      ) vp_agg ON true
      LEFT JOIN users u ON u.id = vp_agg.vendedor_id
      WHERE UPPER(TRANSLATE(TRIM(COALESCE(p.municipio, vp_agg.municipio)), $1, $2)) = ANY($3::text[])
      ORDER BY nome ASC NULLS LAST, ec.cnpj
    `, [ACCENTED, PLAIN, cidadesFolded])

    let maxContacts = 0
    for (const row of rows) {
      if (row.contacts && row.contacts.length > maxContacts) maxContacts = row.contacts.length
    }
    if (maxContacts === 0) maxContacts = 1

    const contactHeaders: string[] = []
    for (let i = 1; i <= maxContacts; i++) {
      contactHeaders.push(`Contato ${i} Nome`, `Contato ${i} Cargo`, `Contato ${i} Tel`, `Contato ${i} Email`)
    }
    const headers = ['CNPJ', 'Nome', 'UF', 'Municipio', 'Telefone', 'Email', 'Vendedor/CSM', ...contactHeaders]

    const csvRows: string[][] = rows.map(row => {
      const contacts = row.contacts || []
      const contactCols: string[] = []
      for (let i = 0; i < maxContacts; i++) {
        const c = contacts[i]
        contactCols.push(c?.nome_pessoa || '', c?.cargo || '', c?.telefone || '', c?.email || '')
      }
      return [
        row.cnpj,
        row.nome || '',
        row.uf || '',
        row.municipio || '',
        row.telefone || '',
        row.email || '',
        row.vendedor_nome || '',
        ...contactCols,
      ]
    })

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [
      headers.join(','),
      ...csvRows.map(r => r.map(escape).join(',')),
    ].join('\n')

    const date = new Date().toISOString().slice(0, 10)
    const slug = cidadesFolded.map(c => c.toLowerCase()).join('-')
    const filename = `clientes-${slug}-${date}.csv`

    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('CSM clients export error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

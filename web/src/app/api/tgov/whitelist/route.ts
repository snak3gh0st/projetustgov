import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov, canWriteTgov } from '@/lib/dal'
import { ensureTgovTables } from '@/lib/tgov-tables'

export const dynamic = 'force-dynamic'

function asNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/** GET: list all dynamic whitelist entries */
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query<{
      id: number; cnpj: string | null; nr_proposta: string | null
      tab: string; added_by: string | null; added_at: string
    }>('SELECT id, cnpj, nr_proposta, tab, added_by, added_at::text FROM tgov_whitelist ORDER BY added_at DESC')

    return NextResponse.json({ entries: rows })
  } catch (error) {
    console.error('[api/tgov/whitelist] GET error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

/** POST: add CNPJ or NR Proposta to whitelist */
export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canWriteTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const cnpj = body.cnpj ? String(body.cnpj).replace(/\D/g, '') : null
    const nrProposta = body.nr_proposta ? String(body.nr_proposta).replace(/^0+/, '') : null
    const transferGovId = asNullableText(body.transfer_gov_id)
    const proponente = asNullableText(body.proponente)
    const titulo = asNullableText(body.titulo)
    const situacao = asNullableText(body.situacao)
    const uf = asNullableText(body.uf)
    const municipio = asNullableText(body.municipio)
    const dataPublicacao = asNullableText(body.data_publicacao)
    const valorGlobal = asNullableNumber(body.valor_global)
    const valorRepasse = asNullableNumber(body.valor_repasse)

    if (!cnpj && !nrProposta) {
      return NextResponse.json({ error: 'Informe cnpj ou nr_proposta' }, { status: 400 })
    }

    await ensureTgovTables()

    if (nrProposta && transferGovId) {
      const proposalCnpj = cnpj || null
      const clientCheck = proposalCnpj
        ? await query<{ found: boolean }>(
            `SELECT EXISTS(
              SELECT 1 FROM existing_clients WHERE cnpj = $1
              UNION ALL
              SELECT 1 FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1
            ) AS found`,
            [proposalCnpj]
          )
        : []
      const isProjetusClient = clientCheck[0]?.found ?? false
      const targetTable = isProjetusClient ? 'propostas' : 'tgov_propostas'

      await query(
        `INSERT INTO ${targetTable} (
          transfer_gov_id,
          nr_proposta,
          proponente_cnpj,
          proponente,
          titulo,
          situacao,
          valor_global,
          valor_repasse,
          estado,
          municipio,
          data_publicacao,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
        ON CONFLICT (transfer_gov_id) DO UPDATE SET
          nr_proposta     = EXCLUDED.nr_proposta,
          proponente_cnpj = COALESCE(EXCLUDED.proponente_cnpj, ${targetTable}.proponente_cnpj),
          proponente      = COALESCE(EXCLUDED.proponente, ${targetTable}.proponente),
          titulo          = COALESCE(EXCLUDED.titulo, ${targetTable}.titulo),
          situacao        = COALESCE(EXCLUDED.situacao, ${targetTable}.situacao),
          valor_global    = COALESCE(EXCLUDED.valor_global, ${targetTable}.valor_global),
          valor_repasse   = COALESCE(EXCLUDED.valor_repasse, ${targetTable}.valor_repasse),
          estado          = COALESCE(EXCLUDED.estado, ${targetTable}.estado),
          municipio       = COALESCE(EXCLUDED.municipio, ${targetTable}.municipio),
          data_publicacao = COALESCE(EXCLUDED.data_publicacao, ${targetTable}.data_publicacao),
          updated_at      = NOW()`,
        [
          transferGovId,
          nrProposta,
          proposalCnpj,
          proponente,
          titulo,
          situacao,
          valorGlobal,
          valorRepasse,
          uf,
          municipio,
          dataPublicacao,
        ]
      )
    }

    const result = await query<{ id: number }>(
      `INSERT INTO tgov_whitelist (cnpj, nr_proposta, tab, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cnpj, nr_proposta) DO NOTHING
       RETURNING id`,
      [cnpj, nrProposta, body.tab || 'ambos', session.name || session.email || null]
    )

    if (result.length === 0) {
      return NextResponse.json({ message: 'Já existe na whitelist' })
    }

    return NextResponse.json({ message: 'Adicionado', id: result[0].id })
  } catch (error) {
    console.error('[api/tgov/whitelist] POST error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

/** DELETE: remove entry by id */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canWriteTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await query('DELETE FROM tgov_whitelist WHERE id = $1', [parseInt(id)])
    return NextResponse.json({ message: 'Removido' })
  } catch (error) {
    console.error('[api/tgov/whitelist] DELETE error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

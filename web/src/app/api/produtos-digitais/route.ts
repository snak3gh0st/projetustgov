import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

function canAccess(role: string | undefined) {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto'
}

function addParam(params: unknown[], value: unknown) {
  params.push(value)
  return `$${params.length}`
}

function buildFilter(searchParams: URLSearchParams) {
  const params: unknown[] = []
  const clauses: string[] = ['1=1']

  const uf = searchParams.get('uf')
  if (uf) clauses.push(`m.uf = ${addParam(params, uf)}`)

  const situacao = searchParams.get('situacao')
  if (situacao) clauses.push(`m.situacao_cadastral = ${addParam(params, situacao)}`)

  const area = searchParams.get('area')
  if (area) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM digital_products_mosc_areas a
        WHERE a.cnpj = m.cnpj
          AND a.tipo = 'area'
          AND a.nome = ${addParam(params, area)}
      )
    `)
  }

  const crm = searchParams.get('crm')
  if (crm === 'crm') {
    clauses.push('EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = m.cnpj)')
  } else if (crm === 'fora_crm') {
    clauses.push('NOT EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = m.cnpj)')
  } else if (crm === 'proponentes') {
    clauses.push('EXISTS (SELECT 1 FROM proponentes p WHERE p.cnpj = m.cnpj)')
  }

  const search = searchParams.get('search')?.trim()
  if (search && search.length >= 3) {
    const token = addParam(params, `%${search}%`)
    clauses.push(`(m.razao_social ILIKE ${token} OR m.nome_fantasia ILIKE ${token} OR m.cnpj ILIKE ${token} OR m.municipio ILIKE ${token})`)
  }

  return {
    where: clauses.join(' AND '),
    params,
  }
}

export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session || !canAccess(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const { where, params } = buildFilter(searchParams)

  const filtered = `
    FROM digital_products_mosc_orgs m
    WHERE ${where}
  `

  try {
    const [metrics] = await query<{
      total: number
      ativas: number
      geolocalizadas: number
      no_crm: number
      no_proponentes: number
      fora_crm: number
    }>(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE m.situacao_cadastral = 'Ativa')::int AS ativas,
        COUNT(*) FILTER (WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL)::int AS geolocalizadas,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = m.cnpj))::int AS no_crm,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM proponentes p WHERE p.cnpj = m.cnpj))::int AS no_proponentes,
        COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = m.cnpj))::int AS fora_crm
      ${filtered}`,
      params
    )

    const points = await query<{
      uf: string
      municipio: string
      longitude: number
      latitude: number
      total: number
      ativas: number
    }>(
      `SELECT
        m.uf,
        m.municipio,
        ROUND(AVG(m.longitude)::numeric, 5)::float AS longitude,
        ROUND(AVG(m.latitude)::numeric, 5)::float AS latitude,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE m.situacao_cadastral = 'Ativa')::int AS ativas
      ${filtered}
        AND m.latitude BETWEEN -34 AND 6
        AND m.longitude BETWEEN -74 AND -34
      GROUP BY m.uf, m.municipio
      ORDER BY total DESC
      LIMIT 1200`,
      params
    )

    const ufs = await query<{ uf: string; total: number }>(
      `SELECT m.uf, COUNT(*)::int AS total
      ${filtered}
      GROUP BY m.uf
      ORDER BY total DESC
      LIMIT 27`,
      params
    )

    const areas = await query<{ nome: string; total: number }>(
      `SELECT a.nome, COUNT(*)::int AS total
      FROM digital_products_mosc_areas a
      JOIN digital_products_mosc_orgs m ON m.cnpj = a.cnpj
      WHERE a.tipo = 'area' AND ${where}
      GROUP BY a.nome
      ORDER BY total DESC`,
      params
    )

    const rows = await query<{
      cnpj: string
      razao_social: string | null
      municipio: string | null
      uf: string | null
      situacao_cadastral: string | null
      areas: string[] | null
    }>(
      `SELECT
        m.cnpj,
        m.razao_social,
        m.municipio,
        m.uf,
        m.situacao_cadastral,
        ARRAY_REMOVE(ARRAY_AGG(a.nome ORDER BY a.nome), NULL) AS areas
      FROM digital_products_mosc_orgs m
      LEFT JOIN digital_products_mosc_areas a ON a.cnpj = m.cnpj AND a.tipo = 'area'
      WHERE ${where}
      GROUP BY m.cnpj, m.razao_social, m.municipio, m.uf, m.situacao_cadastral
      ORDER BY m.situacao_cadastral = 'Ativa' DESC, m.razao_social
      LIMIT 40`,
      params
    )

    const latestRun = await query<{
      source_reference: string
      finished_at: string
      rows_read: number
    }>(
      `SELECT source_reference, finished_at, rows_read
      FROM digital_products_etl_runs
      WHERE source_name = 'Mapa OSC'
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 1`
    )

    return NextResponse.json({
      metrics,
      points,
      ufs,
      areas,
      rows,
      latestRun: latestRun[0] || null,
    })
  } catch (error) {
    console.error('Produtos Digitais API error:', error)
    return NextResponse.json({ error: 'Failed to load digital products data' }, { status: 500 })
  }
}

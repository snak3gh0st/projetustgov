import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Check if proponentes table exists and has data
    const proponentesCount = await query(
      `SELECT COUNT(*) as total,
              COUNT(email) as with_email,
              COUNT(telefone) as with_telefone
       FROM proponentes`
    ).catch(() => [{ total: 'TABLE_NOT_FOUND', with_email: 0, with_telefone: 0 }])

    // 2. Sample proponentes with contacts
    const sampleProponentes = await query(
      `SELECT cnpj, nome, email, telefone
       FROM proponentes
       WHERE email IS NOT NULL OR telefone IS NOT NULL
       LIMIT 5`
    ).catch(() => [])

    // 3. Check vendedor_projetos contacts
    const vpContacts = await query(
      `SELECT COUNT(*) as total,
              COUNT(NULLIF(telefone, '')) as with_telefone,
              COUNT(NULLIF(email, '')) as with_email
       FROM vendedor_projetos`
    )

    // 4. Check CNPJ format overlap
    const cnpjOverlap = await query(
      `SELECT COUNT(DISTINCT vp.cnpj) as matching_cnpjs
       FROM vendedor_projetos vp
       JOIN proponentes p ON p.cnpj = vp.cnpj`
    ).catch(() => [{ matching_cnpjs: 0 }])

    // 5. Sample CNPJ formats from both tables
    const sampleVpCnpj = await query(
      `SELECT cnpj FROM vendedor_projetos LIMIT 3`
    )
    const samplePropCnpj = await query(
      `SELECT cnpj FROM proponentes LIMIT 3`
    ).catch(() => [])

    // 6. Check status_contato values
    const statusDist = await query(
      `SELECT status_contato, COUNT(*) as cnt
       FROM vendedor_projetos
       GROUP BY status_contato
       ORDER BY cnt DESC`
    )

    return NextResponse.json({
      proponentes: proponentesCount[0],
      sample_proponentes_with_contacts: sampleProponentes,
      vendedor_projetos_contacts: vpContacts[0],
      cnpj_overlap: cnpjOverlap[0],
      sample_cnpj_vendedor_projetos: sampleVpCnpj.map((r: { cnpj: string }) => r.cnpj),
      sample_cnpj_proponentes: samplePropCnpj.map((r: { cnpj: string }) => r.cnpj),
      status_distribution: statusDist,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

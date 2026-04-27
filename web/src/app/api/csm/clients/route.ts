import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// CSM-02: POST creates a new client owned by the CSM session.
// - vendedor_projetos.vendedor_id = session.userId (so commission accrues to bruno on close)
// - existing_clients.cnpj is also inserted (ON CONFLICT DO NOTHING) so CRM views flag the row as is_existing_client
// - Idempotent: ON CONFLICT (cnpj) DO NOTHING on vendedor_projetos returns the pre-existing row
const bodySchema = z.object({
  cnpj: z.string().min(11).max(20), // CNPJ may arrive with or without punctuation; normalisation below
  nome: z.string().min(1).max(255),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canCsm(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
    }

    // Strip non-digits — vendedor_projetos.cnpj is the digits-only canonical form
    const cnpjDigits = parsed.data.cnpj.replace(/\D/g, '')
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({ error: 'CNPJ must contain 14 digits' }, { status: 400 })
    }
    const nome = parsed.data.nome.trim()

    // Idempotent insert into vendedor_projetos. vendedor_id = session.userId is load-bearing
    // for commission tracking — a closed deal on this client routes commission to the CSM.
    // status_contato uses 'Não Contatado' with accent — matches the DB literal used in all
    // production SQL (repo-sync.ts, api/leads/route.ts).
    const inserted = await query(`
      INSERT INTO vendedor_projetos (cnpj, nome, vendedor_id, status_contato, created_at, updated_at)
      VALUES ($1, $2, $3, 'Não Contatado', NOW(), NOW())
      ON CONFLICT (cnpj) DO NOTHING
      RETURNING id, cnpj, nome, vendedor_id, status_contato, created_at
    `, [cnpjDigits, nome, session.userId])

    // Mirror into existing_clients so CRM JOIN to ec flags is_existing_client=true.
    // Idempotent — pre-existing rows are preserved.
    await query(`
      INSERT INTO existing_clients (cnpj)
      VALUES ($1)
      ON CONFLICT (cnpj) DO NOTHING
    `, [cnpjDigits])

    if (inserted.length === 0) {
      // Pre-existing CNPJ — return the existing row (CSM is informed, not erroring)
      const existing = await query(`
        SELECT id, cnpj, nome, vendedor_id, status_contato, created_at
        FROM vendedor_projetos
        WHERE cnpj = $1
        LIMIT 1
      `, [cnpjDigits])
      return NextResponse.json(
        { ...existing[0], already_existed: true },
        { status: 200 }
      )
    }

    return NextResponse.json(inserted[0], { status: 201 })
  } catch (error) {
    console.error('CSM client creation error:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}

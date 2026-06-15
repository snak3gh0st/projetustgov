import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  const { id } = await params

  await query(
    `UPDATE education_notifications
     SET read_at = NOW()
     WHERE id = $1 AND learner_id = $2`,
    [id, session.sub],
  )

  return ok({ marked: true })
}

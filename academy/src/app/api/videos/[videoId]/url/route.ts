import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ videoId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const { videoId } = await params

  // Resolve asset → lesson → product → enrollment
  const rows = await query<{ playback_url: string; enrollment_status: string }>(
    `SELECT a.playback_url, e.status AS enrollment_status
     FROM education_assets a
     JOIN education_lessons l ON l.id = a.lesson_id
     JOIN education_enrollments e ON e.product_id = l.product_id
     JOIN learners lr ON lr.id = e.learner_id
     WHERE a.provider_asset_id = $1
       AND a.asset_type = 'video'
       AND lr.email = $2
       AND e.status = 'active'
     LIMIT 1`,
    [videoId, session.email],
  )

  if (rows.length === 0) return err(403, 'Acesso não autorizado')

  return ok({ url: rows[0].playback_url })
}

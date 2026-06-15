import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const rows = await query<{ lesson_id: string; status: string; last_position_seconds: number | null }>(
    `SELECT ep.lesson_id, ep.status, ep.last_position_seconds
     FROM education_progress ep
     JOIN education_enrollments e ON e.id = ep.enrollment_id
     JOIN learners l ON l.id = e.learner_id
     WHERE l.email = $1`,
    [session.email],
  )

  const map: Record<string, { status: string; position: number | null }> = {}
  for (const r of rows) map[r.lesson_id] = { status: r.status, position: r.last_position_seconds ?? null }

  return ok(map)
}

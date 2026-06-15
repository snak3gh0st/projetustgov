import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export async function GET() {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  const items = await query(
    `SELECT id, type, title, body, link, read_at, created_at
     FROM education_notifications
     WHERE learner_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [session.sub],
  )

  const unreadRows = await query<{ unread: number }>(
    `SELECT COUNT(*)::int AS unread
     FROM education_notifications
     WHERE learner_id = $1 AND read_at IS NULL`,
    [session.sub],
  )

  return ok({ items, unread: unreadRows[0]?.unread ?? 0 })
}

export async function POST() {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  await query(
    `UPDATE education_notifications
     SET read_at = NOW()
     WHERE learner_id = $1 AND read_at IS NULL`,
    [session.sub],
  )

  return ok({ marked: true })
}

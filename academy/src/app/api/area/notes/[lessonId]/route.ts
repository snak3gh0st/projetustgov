import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'
import { z } from 'zod'

const body = z.object({
  content: z.string().max(20000),
})

type Params = { params: Promise<{ lessonId: string }> }

async function hasAccess(email: string, lessonId: string) {
  const rows = await query<{ enrollment_id: string }>(
    `SELECT e.id AS enrollment_id
     FROM education_enrollments e
     JOIN learners l ON l.id = e.learner_id
     JOIN education_lessons les ON les.product_id = e.product_id
     WHERE l.email = $1 AND les.id = $2 AND e.status = 'active'
     LIMIT 1`,
    [email, lessonId],
  )
  return !!rows[0]
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const { lessonId } = await params

  if (!(await hasAccess(session.email, lessonId))) return err(403, 'Sem acesso')

  const rows = await query<{ content: string }>(
    `SELECT content FROM education_notes WHERE learner_id = $1 AND lesson_id = $2`,
    [session.sub, lessonId],
  )

  return ok({ content: rows[0]?.content ?? '' })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, 'Dados inválidos')

  const { lessonId } = await params

  if (!(await hasAccess(session.email, lessonId))) return err(403, 'Sem acesso')

  await query(
    `INSERT INTO education_notes (learner_id, lesson_id, content, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (learner_id, lesson_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [session.sub, lessonId, parsed.data.content],
  )

  return ok({ saved: true })
}

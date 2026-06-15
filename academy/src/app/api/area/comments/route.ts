import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'
import { z } from 'zod'

type CommentRow = {
  id: string
  parent_id: string | null
  body: string
  created_at: string
  author_name: string | null
  is_mine: boolean
}

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

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const lessonId = new URL(req.url).searchParams.get('lessonId')
  if (!lessonId) return err(400, 'lessonId obrigatório')

  if (!(await hasAccess(session.email, lessonId))) return err(403, 'Sem acesso')

  const comments = await query<CommentRow>(
    `SELECT c.id, c.parent_id, c.body, c.created_at, l.name AS author_name, (c.learner_id = $2) AS is_mine
     FROM education_comments c
     JOIN learners l ON l.id = c.learner_id
     WHERE c.lesson_id = $1
     ORDER BY c.created_at ASC`,
    [lessonId, session.sub],
  )

  return ok({ comments })
}

const postBody = z.object({
  lessonId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  parentId: z.string().uuid().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const parsed = postBody.safeParse(await req.json())
  if (!parsed.success) return err(400, 'Dados inválidos')

  const { lessonId, body, parentId } = parsed.data

  if (!(await hasAccess(session.email, lessonId))) return err(403, 'Sem acesso')

  const rows = await query<{ id: string; parent_id: string | null; body: string; created_at: string }>(
    `INSERT INTO education_comments (lesson_id, learner_id, parent_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, parent_id, body, created_at`,
    [lessonId, session.sub, parentId ?? null, body],
  )

  const row = rows[0]
  return ok({
    comment: { ...row, author_name: session.name ?? 'Você', is_mine: true },
  })
}

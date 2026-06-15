import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ lessonId: string }> }

const body = z.object({
  playbackUrl: z.string().url(),
  durationSeconds: z.number().int().positive().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { lessonId } = await params
  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { playbackUrl, durationSeconds } = parsed.data

  // Verify the lesson exists and get product_id + module_id
  const lessonRows = await query<{ product_id: string; module_id: string }>(
    'SELECT product_id, module_id FROM education_lessons WHERE id = $1',
    [lessonId],
  )
  if (!lessonRows[0]) return err(404, 'Aula não encontrada')

  const { product_id, module_id } = lessonRows[0]

  // Upsert asset record (delete existing video asset first, then insert)
  await query(
    'DELETE FROM education_assets WHERE lesson_id = $1 AND asset_type = $2',
    [lessonId, 'video'],
  )

  await query(
    `INSERT INTO education_assets
       (product_id, module_id, lesson_id, asset_type, provider, playback_url, duration_seconds)
     VALUES ($1, $2, $3, 'video', 'r2', $4, $5)`,
    [product_id, module_id, lessonId, playbackUrl, durationSeconds ?? null],
  )

  if (durationSeconds) {
    await query(
      'UPDATE education_lessons SET duration_seconds = $1, updated_at = NOW() WHERE id = $2',
      [durationSeconds, lessonId],
    )
  }

  return ok({ lessonId, playbackUrl })
}

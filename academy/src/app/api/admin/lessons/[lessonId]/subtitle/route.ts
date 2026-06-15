import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ lessonId: string }> }

const body = z.object({ url: z.string().url() })

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { lessonId } = await params
  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const lessonRows = await query<{ product_id: string; module_id: string }>(
    'SELECT product_id, module_id FROM education_lessons WHERE id = $1',
    [lessonId],
  )
  if (!lessonRows[0]) return err(404, 'Aula não encontrada')

  const { product_id, module_id } = lessonRows[0]

  await query(
    `DELETE FROM education_assets WHERE lesson_id = $1 AND asset_type = 'subtitle'`,
    [lessonId],
  )
  await query(
    `INSERT INTO education_assets (product_id, module_id, lesson_id, asset_type, provider, download_url)
     VALUES ($1, $2, $3, 'subtitle', 'url', $4)`,
    [product_id, module_id, lessonId, parsed.data.url],
  )

  return ok({ saved: true })
}

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { getAdminSession } from '@/lib/auth'
import { presignedUploadUrl } from '@/lib/r2'
import { ok, err } from '@/lib/http'

const body = z.object({
  filename: z.string().min(1),
  contentType: z.string().regex(/^video\//),
  lessonId: z.string().uuid().optional(),
})

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/mkv']

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { filename, contentType, lessonId } = parsed.data

  if (!ALLOWED_TYPES.includes(contentType)) return err(400, 'Tipo de arquivo não suportado')

  const videoId = randomUUID()
  const rawKey = `raw/${videoId}/${filename}`

  const uploadUrl = await presignedUploadUrl(rawKey, contentType, 3600)

  return ok({ videoId, rawKey, uploadUrl })
}

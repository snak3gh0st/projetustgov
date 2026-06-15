import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { getAdminSession } from '@/lib/auth'
import { presignedUploadUrl, publicUrl } from '@/lib/r2'
import { ok, err } from '@/lib/http'

const body = z.object({
  filename: z.string().min(1),
  contentType: z.string().regex(/^image\//),
})

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { filename, contentType } = parsed.data
  if (!ALLOWED.includes(contentType)) return err(400, 'Tipo de imagem não suportado')

  const key = `covers/${randomUUID()}/${filename}`
  const uploadUrl = await presignedUploadUrl(key, contentType, 3600)

  return ok({ key, uploadUrl, publicUrl: publicUrl(key) })
}

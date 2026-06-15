import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createWriteStream } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { getAdminSession } from '@/lib/auth'
import { presignedDownloadUrl, deleteObjects } from '@/lib/r2'
import { transcodeToHls } from '@/lib/transcode'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

const body = z.object({
  videoId: z.string().uuid(),
  rawKey: z.string().min(1),
  lessonId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { videoId, rawKey, lessonId } = parsed.data

  // Download raw video from R2 to /tmp
  const tmpDir = `/tmp/raw-${videoId}`
  await mkdir(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, 'input.mp4')

  const downloadUrl = await presignedDownloadUrl(rawKey, 600)
  const response = await fetch(downloadUrl)
  if (!response.ok) return err(502, 'Falha ao baixar vídeo do R2')

  await pipeline(Readable.fromWeb(response.body as import('stream/web').ReadableStream), createWriteStream(tmpFile))

  // Transcode to HLS and upload back to R2
  const result = await transcodeToHls(tmpFile, videoId)

  // Cleanup local raw file
  await unlink(tmpFile).catch(() => null)
  await deleteObjects([rawKey])

  // Persist asset record
  await query(
    `INSERT INTO education_assets
       (lesson_id, asset_type, provider, provider_asset_id, playback_url, duration_seconds)
     VALUES ($1, 'video', 'r2', $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [lessonId, result.manifestKey, result.manifestUrl, result.durationSeconds],
  )

  await query(
    'UPDATE education_lessons SET duration_seconds = $1 WHERE id = $2',
    [result.durationSeconds, lessonId],
  )

  // Store the auto-generated poster frame as a thumbnail asset for the lesson
  if (result.posterUrl) {
    const lessonRows = await query<{ product_id: string; module_id: string }>(
      'SELECT product_id, module_id FROM education_lessons WHERE id = $1',
      [lessonId],
    )
    if (lessonRows[0]) {
      const { product_id, module_id } = lessonRows[0]
      await query(
        `DELETE FROM education_assets WHERE lesson_id = $1 AND asset_type = 'thumbnail'`,
        [lessonId],
      )
      await query(
        `INSERT INTO education_assets (product_id, module_id, lesson_id, asset_type, provider, url)
         VALUES ($1, $2, $3, 'thumbnail', 'r2', $4)`,
        [product_id, module_id, lessonId, result.posterUrl],
      )
    }
  }

  return ok({
    videoId,
    manifestKey: result.manifestKey,
    manifestUrl: result.manifestUrl,
    durationSeconds: result.durationSeconds,
    posterUrl: result.posterUrl,
  })
}

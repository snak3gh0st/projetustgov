import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, readdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { uploadBuffer, publicUrl } from '@/lib/r2'

const execFileAsync = promisify(execFile)

export type TranscodeResult = {
  manifestKey: string
  manifestUrl: string
  durationSeconds: number
  posterUrl: string
}

// Produces 360p, 720p, and 1080p (if source allows) HLS with master playlist
export async function transcodeToHls(
  inputPath: string,
  videoId: string,
): Promise<TranscodeResult> {
  const outDir = `/tmp/hls-${videoId}`
  await mkdir(outDir, { recursive: true })

  const masterPath = join(outDir, 'master.m3u8')

  // Probe duration
  const { stdout: probeOut } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    inputPath,
  ])
  const probe = JSON.parse(probeOut)
  const videoStream = probe.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')
  const durationSeconds = Math.round(parseFloat(videoStream?.duration ?? '0'))

  // Transcode to multi-bitrate HLS
  await execFileAsync('ffmpeg', [
    '-i', inputPath,
    '-filter_complex',
    '[0:v]split=2[v1][v2]',
    '-map', '[v1]', '-map', '0:a',
    '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outDir, '720p_%03d.ts'),
    '-hls_flags', 'independent_segments',
    join(outDir, '720p.m3u8'),
    '-map', '[v2]', '-map', '0:a',
    '-vf', 'scale=-2:360', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k',
    '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outDir, '360p_%03d.ts'),
    '-hls_flags', 'independent_segments',
    join(outDir, '360p.m3u8'),
  ], { maxBuffer: 50 * 1024 * 1024 })

  // Build master playlist with public R2 URLs for segments
  const base = `videos/${videoId}`
  const masterContent = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720`,
    `${publicUrl(`${base}/720p.m3u8`)}`,
    `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360`,
    `${publicUrl(`${base}/360p.m3u8`)}`,
  ].join('\n')

  // Upload all HLS files to R2
  const files = await readdir(outDir)
  await Promise.all(
    files.map(async (filename) => {
      const data = await readFile(join(outDir, filename))
      const contentType = filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t'
      await uploadBuffer(`${base}/${filename}`, data, contentType)
    }),
  )

  // Upload master playlist
  const masterKey = `${base}/master.m3u8`
  await uploadBuffer(masterKey, Buffer.from(masterContent), 'application/vnd.apple.mpegurl')

  // Extract a poster frame at ~10% of duration (fallback 3s) and upload to R2.
  // Wrapped in try/catch so a poster failure never fails the whole transcode.
  let posterUrl = ''
  try {
    const seekTo = durationSeconds > 0 ? Math.max(1, Math.floor(durationSeconds * 0.1)) : 3
    const posterPath = join(outDir, 'poster.jpg')
    await execFileAsync('ffmpeg', [
      '-ss', String(seekTo),
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', 'scale=1280:-2',
      '-q:v', '3',
      '-y', posterPath,
    ])
    const posterData = await readFile(posterPath)
    const posterKey = `${base}/poster.jpg`
    await uploadBuffer(posterKey, posterData, 'image/jpeg')
    posterUrl = publicUrl(posterKey)
  } catch (e) {
    console.error('[transcode] poster frame extraction failed:', e)
    posterUrl = ''
  }

  // Cleanup temp dir
  await rm(outDir, { recursive: true, force: true })

  return {
    manifestKey: masterKey,
    manifestUrl: publicUrl(masterKey),
    durationSeconds,
    posterUrl,
  }
}

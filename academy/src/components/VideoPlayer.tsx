'use client'

import { useEffect, useRef } from 'react'

type Props = { videoId: string; title: string }

export default function VideoPlayer({ videoId, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let hls: import('hls.js').default | null = null
    const video = videoRef.current
    if (!video) return

    async function init() {
      const url = await fetch(`/api/videos/${videoId}/url`).then(r => r.ok ? r.json() : null)
      if (!url?.data?.url) return

      const { default: Hls } = await import('hls.js')
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: false })
        hls.loadSource(url.data.url)
        hls.attachMedia(video!)
      } else if (video!.canPlayType('application/vnd.apple.mpegurl')) {
        video!.src = url.data.url
      }
    }

    init()
    return () => hls?.destroy()
  }, [videoId])

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        className="aspect-video w-full"
        aria-label={title}
      />
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'

type Props = {
  src: string
  title: string
  onEnded?: () => void
}

export default function VideoPlayer({ src, title, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let hls: import('hls.js').default | null = null
    const video = videoRef.current
    if (!video || !src) return

    async function init() {
      const { default: Hls } = await import('hls.js')
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: false })
        hls.loadSource(src)
        hls.attachMedia(video!)
      } else if (video!.canPlayType('application/vnd.apple.mpegurl')) {
        video!.src = src
      }
    }

    init()
    return () => hls?.destroy()
  }, [src])

  return (
    <div className="w-full h-full bg-black flex items-center">
      <video
        ref={videoRef}
        controls
        playsInline
        onEnded={onEnded}
        className="w-full aspect-video"
        aria-label={title}
      />
    </div>
  )
}

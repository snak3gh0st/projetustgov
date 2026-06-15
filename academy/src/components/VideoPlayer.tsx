'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  src: string
  title: string
  onEnded?: () => void
  initialPosition?: number
  onPositionUpdate?: (pos: number) => void
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoPlayer({ src, title, onEnded, initialPosition, onPositionUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [speed, setSpeed] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  // HLS / MP4 source setup
  useEffect(() => {
    let hls: import('hls.js').default | null = null
    const video = videoRef.current
    if (!video || !src) return

    async function init() {
      // Direct video file (MP4, WebM, etc.) — use native playback
      if (!src.match(/\.m3u8($|\?)/i)) {
        video!.src = src
        return
      }

      // HLS manifest
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

  // initialPosition: seek once video can play
  useEffect(() => {
    const video = videoRef.current
    if (!video || initialPosition === undefined) return

    function onCanPlay() {
      video!.currentTime = initialPosition!
    }

    video.addEventListener('canplay', onCanPlay, { once: true })
    return () => video.removeEventListener('canplay', onCanPlay)
  }, [initialPosition])

  // onPositionUpdate: call every 15 seconds with current time
  useEffect(() => {
    const video = videoRef.current
    if (!video || !onPositionUpdate) return

    const interval = setInterval(() => {
      if (!video.paused && !video.ended) {
        onPositionUpdate(video.currentTime)
      }
    }, 15000)

    return () => clearInterval(interval)
  }, [onPositionUpdate])

  // Keyboard shortcuts
  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video) return

    function handleKeyDown(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

      switch (event.key) {
        case ' ':
          event.preventDefault()
          if (video!.paused) {
            video!.play()
          } else {
            video!.pause()
          }
          break
        case 'ArrowLeft':
          video!.currentTime = Math.max(0, video!.currentTime - 10)
          break
        case 'ArrowRight':
          video!.currentTime = Math.min(video!.duration, video!.currentTime + 10)
          break
        case 'm':
        case 'M':
          video!.muted = !video!.muted
          break
        case 'f':
        case 'F':
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            container?.requestFullscreen()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.closest('[data-speed-menu]')) {
        setShowSpeedMenu(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showSpeedMenu])

  function selectSpeed(s: number) {
    setSpeed(s)
    setShowSpeedMenu(false)
    if (videoRef.current) {
      videoRef.current.playbackRate = s
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center">
      <video
        ref={videoRef}
        controls
        playsInline
        onEnded={onEnded}
        className="w-full aspect-video"
        aria-label={title}
      />

      {/* Speed selector overlay */}
      <div
        data-speed-menu
        className="absolute bottom-14 right-3"
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSpeedMenu(v => !v)}
            className="bg-black/60 backdrop-blur text-white text-xs font-bold rounded px-2 py-1 hover:bg-black/80"
          >
            {speed === 1 ? '1×' : `${speed}×`}
          </button>

          {showSpeedMenu && (
            <div className="absolute bottom-8 right-0 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectSpeed(s)}
                  className={`block w-full text-left px-4 py-2 text-xs text-white hover:bg-white/10 ${s === speed ? 'font-bold text-academy-gold' : ''}`}
                >
                  {s === 1 ? '1×' : `${s}×`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

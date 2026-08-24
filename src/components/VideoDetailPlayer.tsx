'use client'

import { useEffect, useRef, useState } from 'react'

type WebkitFullscreenVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'

  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = Math.floor(value % 60)
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Branded MP4 player. A view is counted on the first successful play event. */
export default function VideoDetailPlayer({
  videoId,
  videoUrl,
  posterUrl,
  title,
}: Readonly<{
  videoId: string
  videoUrl: string
  posterUrl?: string | null
  title: string
}>) {
  const playerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const countedRef = useRef(false)
  const previousVolumeRef = useRef(1)
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [errorKey, setErrorKey] = useState(0)
  const [failed, setFailed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isHudVisible, setIsHudVisible] = useState(true)

  useEffect(() => {
    setFailed(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    countedRef.current = false
  }, [videoId, videoUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration)
      }
    }

    // Metadata can finish loading before hydration attaches React's media
    // event handlers, especially when the MP4 is already cached.
    syncDuration()
    video.addEventListener('loadedmetadata', syncDuration)
    video.addEventListener('durationchange', syncDuration)
    video.addEventListener('canplay', syncDuration)
    return () => {
      video.removeEventListener('loadedmetadata', syncDuration)
      video.removeEventListener('durationchange', syncDuration)
      video.removeEventListener('canplay', syncDuration)
    }
  }, [errorKey, videoUrl])

  useEffect(() => {
    const handleFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === playerRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleMobileFullscreenStart = () => setIsFullscreen(true)
    const handleMobileFullscreenEnd = () => setIsFullscreen(false)
    video.addEventListener('webkitbeginfullscreen', handleMobileFullscreenStart)
    video.addEventListener('webkitendfullscreen', handleMobileFullscreenEnd)
    return () => {
      video.removeEventListener(
        'webkitbeginfullscreen',
        handleMobileFullscreenStart,
      )
      video.removeEventListener(
        'webkitendfullscreen',
        handleMobileFullscreenEnd,
      )
    }
  }, [errorKey, videoUrl])

  useEffect(() => {
    revealHud()
  }, [isFullscreen, isPlaying])

  useEffect(
    () => () => {
      if (hudTimerRef.current !== null) clearTimeout(hudTimerRef.current)
    },
    [],
  )

  function handlePlay() {
    setIsPlaying(true)
    if (countedRef.current) return

    countedRef.current = true
    void fetch(`/api/videos/${videoId}/view`, { method: 'POST' }).catch(
      () => {},
    )
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setFailed(true))
    } else {
      video.pause()
    }
  }

  function skip(seconds: number) {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.min(
      Math.max(video.currentTime + seconds, 0),
      video.duration,
    )
    setCurrentTime(video.currentTime)
  }

  function changeVolumeBy(amount: number) {
    const video = videoRef.current
    if (!video) return
    const nextVolume = Math.min(Math.max(video.volume + amount, 0), 1)
    video.volume = nextVolume
    video.muted = nextVolume === 0
    setVolume(nextVolume)
    if (nextVolume > 0) previousVolumeRef.current = nextVolume
  }

  function handlePlayerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    revealHud()

    const target = event.target as HTMLElement
    const key = event.key.toLowerCase()
    if (target !== event.currentTarget) {
      if (
        target.closest('input, a, textarea, select, [contenteditable=true]')
      ) {
        return
      }
      if (target.closest('button') && (key === ' ' || key === 'enter')) {
        return
      }
    }

    const video = videoRef.current
    if (!video) return

    if (event.repeat && [' ', 'k', 'm', 'f'].includes(key)) {
      event.preventDefault()
      return
    }

    switch (key) {
      case ' ':
      case 'k':
        event.preventDefault()
        togglePlayback()
        break
      case 'j':
        event.preventDefault()
        skip(-10)
        break
      case 'l':
        event.preventDefault()
        skip(10)
        break
      case 'arrowleft':
        event.preventDefault()
        skip(-5)
        break
      case 'arrowright':
        event.preventDefault()
        skip(5)
        break
      case 'arrowup':
        event.preventDefault()
        changeVolumeBy(0.05)
        break
      case 'arrowdown':
        event.preventDefault()
        changeVolumeBy(-0.05)
        break
      case 'm':
        event.preventDefault()
        toggleMute()
        break
      case 'f':
        event.preventDefault()
        void toggleFullscreen()
        break
      case 'home':
        event.preventDefault()
        video.currentTime = 0
        setCurrentTime(0)
        break
      case 'end':
        event.preventDefault()
        if (Number.isFinite(video.duration)) {
          video.currentTime = video.duration
          setCurrentTime(video.duration)
        }
        break
      default:
        if (/^[0-9]$/.test(key) && Number.isFinite(video.duration)) {
          event.preventDefault()
          const nextTime = video.duration * (Number(key) / 10)
          video.currentTime = nextTime
          setCurrentTime(nextTime)
        }
    }
  }

  function seek(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(event.target.value)
    setCurrentTime(video.currentTime)
  }

  function changeVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    const nextVolume = Number(event.target.value)
    video.volume = nextVolume
    video.muted = nextVolume === 0
    setVolume(nextVolume)
    if (nextVolume > 0) previousVolumeRef.current = nextVolume
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return

    if (video.muted || volume === 0) {
      const restoredVolume = previousVolumeRef.current || 1
      video.muted = false
      video.volume = restoredVolume
      setVolume(restoredVolume)
    } else {
      previousVolumeRef.current = volume
      video.muted = true
      setVolume(0)
    }
  }

  async function toggleFullscreen() {
    const player = playerRef.current
    const video: WebkitFullscreenVideo | null = videoRef.current
    if (!player || !video) return

    if (document.fullscreenElement !== null) {
      try {
        await document.exitFullscreen()
      } catch {
        // The browser owns fullscreen state; leave the player unchanged if
        // exiting is rejected.
      }
      return
    }

    if (video.webkitDisplayingFullscreen) {
      video.webkitExitFullscreen?.()
      return
    }

    // iOS Safari does not support fullscreen on arbitrary containers. Its
    // video-specific API must be called directly from the user gesture.
    if (!document.fullscreenEnabled && video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
      return
    }

    try {
      if (typeof player.requestFullscreen === 'function') {
        await player.requestFullscreen()
        return
      }
      if (typeof video.requestFullscreen === 'function') {
        await video.requestFullscreen()
        return
      }
    } catch {
      // Fall through to the WebKit mobile-video API when the standard API is
      // present but unavailable for this element.
    }

    video.webkitEnterFullscreen?.()
  }

  function revealHud() {
    setIsHudVisible(true)
    if (hudTimerRef.current !== null) clearTimeout(hudTimerRef.current)

    if (
      document.fullscreenElement === playerRef.current &&
      videoRef.current !== null &&
      !videoRef.current.paused
    ) {
      hudTimerRef.current = setTimeout(() => {
        setIsHudVisible(false)
        hudTimerRef.current = null
      }, 2500)
    }
  }

  function retry() {
    setFailed(false)
    setErrorKey((value) => value + 1)
  }

  if (failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <p role="alert" className="max-w-lg">
          A videó lejátszása most nem sikerült. Ellenőrizd a kapcsolatot, majd
          próbáld újra.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-(--orange) px-4 py-2 font-bold text-[#171414] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Újrapróbálás
        </button>
      </div>
    )
  }

  const playedPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={playerRef}
      className={`group/player relative aspect-video w-full overflow-hidden bg-black text-white shadow-2xl ${isFullscreen && !isHudVisible ? 'cursor-none' : 'cursor-pointer'}`}
      role="region"
      aria-label={`${title} videólejátszó`}
      tabIndex={0}
      onPointerMove={revealHud}
      onPointerDown={revealHud}
      onKeyDown={handlePlayerKeyDown}
    >
      <video
        key={errorKey}
        ref={videoRef}
        className="h-full w-full cursor-inherit object-contain"
        src={videoUrl}
        poster={posterUrl ?? undefined}
        preload="metadata"
        playsInline
        aria-label={title}
        onClick={() => {
          playerRef.current?.focus()
          togglePlayback()
        }}
        onPlay={handlePlay}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onVolumeChange={(event) => {
          const video = event.currentTarget
          setVolume(video.muted ? 0 : video.volume)
        }}
        onError={() => setFailed(true)}
      />

      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label="Lejátszás"
          title="Lejátszás (K vagy Szóköz)"
          className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white/80 bg-(--blue)/90 text-white shadow-xl transition hover:scale-105 hover:bg-(--orange) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:size-20"
        >
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black/95 via-black/70 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 sm:px-4 ${isHudVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <label className="block" aria-label="Lejátszási pozíció">
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={seek}
            className="h-5 w-full cursor-pointer accent-(--orange)"
            style={{
              background: `linear-gradient(to right, var(--orange) ${playedPercent}%, rgba(255,255,255,.35) ${playedPercent}%)`,
            }}
          />
        </label>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-(--blue) transition hover:bg-(--orange) focus-visible:outline-2 focus-visible:outline-white"
            aria-label={isPlaying ? 'Szünet' : 'Lejátszás'}
            title={
              isPlaying ? 'Szünet (K vagy Szóköz)' : 'Lejátszás (K vagy Szóköz)'
            }
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path fill="currentColor" d="M6 4h4v16H6zm8 0h4v16h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="grid size-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 hover:text-(--orange) focus-visible:outline-2 focus-visible:outline-white"
            aria-label={volume === 0 ? 'Hang bekapcsolása' : 'Némítás'}
            title={volume === 0 ? 'Hang bekapcsolása (M)' : 'Némítás (M)'}
          >
            {volume === 0 ? (
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4 9v6h4l5 4V5L8 9H4m12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7Z"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4 9v6h4l5 4V5L8 9H4m11.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16m-2-6.18v2.06a5 5 0 0 1 0 8.24v2.06a7 7 0 0 0 0-12.36Z"
                />
              </svg>
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={changeVolume}
            aria-label="Hangerő"
            className="hidden h-5 w-20 cursor-pointer accent-(--orange) sm:block"
          />

          <span className="min-w-0 flex-1 whitespace-nowrap text-xs font-semibold tabular-nums sm:text-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="grid size-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 hover:text-(--orange) focus-visible:outline-2 focus-visible:outline-white"
            aria-label={
              isFullscreen ? 'Teljes képernyő bezárása' : 'Teljes képernyő'
            }
            title={
              isFullscreen
                ? 'Teljes képernyő bezárása (F)'
                : 'Teljes képernyő (F)'
            }
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              {isFullscreen ? (
                <path
                  fill="currentColor"
                  d="M14 14h5v2h-3v3h-2v-5M5 14h5v5H8v-3H5v-2m9-9h2v3h3v2h-5V5M8 5h2v5H5V8h3V5Z"
                />
              ) : (
                <path
                  fill="currentColor"
                  d="M5 5h5v2H7v3H5V5m9 0h5v5h-2V7h-3V5m3 9h2v5h-5v-2h3v-3M5 14h2v3h3v2H5v-5Z"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

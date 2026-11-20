import { useEffect, useRef, useState } from 'react'
import { HERO_AMBIENT_MEDIA } from '../config/heroMedia'
import { PauseIcon, PlayIcon } from './Icons'

function prefersReducedMotionNow() {
  return (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function HeroAmbientBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(() => prefersReducedMotionNow())
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || videoFailed) return

    if (paused) {
      video.pause()
      return
    }

    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Fallback silencioso caso o navegador bloqueie autoplay
        setPaused(true)
      })
    }
  }, [paused, videoFailed])

  return (
    <>
      <div className="hero-ambient-layer">
        {!videoFailed ? (
          <video
            ref={videoRef}
            className="hero-ambient-video"
            poster={HERO_AMBIENT_MEDIA.poster}
            autoPlay={!paused}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            onError={() => setVideoFailed(true)}
          >
            {HERO_AMBIENT_MEDIA.sources.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>
        ) : (
          <img
            src={HERO_AMBIENT_MEDIA.poster}
            alt=""
            className="hero-ambient-video"
            aria-hidden="true"
          />
        )}

        <div className="hero-ambient-scrim" aria-hidden="true" />
      </div>

      {!videoFailed && (
        <button
          type="button"
          className="hero-video-toggle"
          onClick={() => setPaused((current) => !current)}
          aria-label={paused ? 'Reproduzir vídeo de fundo' : 'Pausar vídeo de fundo'}
          title={paused ? 'Reproduzir fundo animado' : 'Pausar fundo animado'}
        >
          {paused ? <PlayIcon width={14} height={14} /> : <PauseIcon width={14} height={14} />}
          <span>{paused ? 'Animar' : 'Pausar'}</span>
        </button>
      )}
    </>
  )
}

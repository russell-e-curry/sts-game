import { useEffect, useRef } from 'react'
import './GameOverScreen.css'

interface GameOverScreenProps {
  result: 'win' | 'lose'
  onRestart: () => void
}

const COPY = {
  win: {
    title: 'You Win!',
    subtitle: 'You beat the sprint — fully vested, equity intact.',
    video: '/splash/win/gm-splash-vid-you-win.mp4',
  },
  lose: {
    title: 'Game Over',
    subtitle: 'The sprint buried you before your equity vested.',
    video: '/splash/lose/gm-splash-vid-you-lose.mp4',
  },
} as const

// Matches .game-over-screen's fade-in animation duration (see GameOverScreen.css) — the
// win/lose video waits out the fade rather than starting immediately on mount, so the
// splash visibly arrives first and the video only then starts rolling.
const FADE_IN_DURATION_MS = 800

function GameOverScreen({ result, onRestart }: GameOverScreenProps) {
  const { title, subtitle, video } = COPY[result]
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      videoRef.current?.play().catch(() => {
        // Autoplay can be blocked before the player's first interaction — the game
        // reaching a win/loss already implies one, but either way a silent no-op beats
        // a thrown error breaking the game-over screen.
      })
    }, FADE_IN_DURATION_MS)
    return () => clearTimeout(timer)
  }, [result])

  return (
    <div className={`game-over-screen game-over-screen-${result}`}>
      <div className="game-over-content">
        <h1 className="game-over-title">{title}</h1>
        <p className="game-over-subtitle">{subtitle}</p>

        <video
          ref={videoRef}
          className="game-over-image"
          src={video}
          playsInline
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />

        <button className="game-over-restart" onClick={onRestart}>
          PLAY AGAIN
        </button>
      </div>
    </div>
  )
}

export default GameOverScreen

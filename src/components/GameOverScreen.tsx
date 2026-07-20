import { useEffect, useRef } from 'react'
import './GameOverScreen.css'

interface GameOverScreenProps {
  result: 'win' | 'lose' | null
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
  const winVideoRef = useRef<HTMLVideoElement>(null)
  const loseVideoRef = useRef<HTMLVideoElement>(null)

  // iPadOS/iOS Safari only allows a <video> with sound to start via .play() when
  // that call is a direct, synchronous result of a user gesture — a win or loss can
  // land minutes into a game, from a meter maxing out mid-cascade, nowhere near any
  // tap (see the timed .play() call below), so without this it silently never plays
  // (same root cause as playSound's AudioContext unlock in sounds.ts, just for
  // <video> instead of Web Audio). Once a given <video> element has actually played
  // as a direct result of a gesture, WebKit keeps allowing programmatic .play() calls
  // on that SAME element for the rest of the page's life — so both outcomes' videos
  // are primed here, on the session's very first tap/click, before it's even known
  // whether either will ever be needed. This only works because this component (and
  // these two <video> elements specifically) are mounted for the whole game — see
  // GameBoard.tsx, which renders this unconditionally rather than only once gameOver
  // is set, since by then it'd already be too late to catch a qualifying gesture.
  useEffect(() => {
    const unlockEvents = ['pointerdown', 'touchend', 'keydown'] as const
    const primeAll = () => {
      for (const ref of [winVideoRef, loseVideoRef]) {
        const v = ref.current
        if (!v) continue
        v.play()
          .then(() => v.pause())
          .catch(() => {})
      }
      unlockEvents.forEach((eventName) => window.removeEventListener(eventName, primeAll))
    }
    unlockEvents.forEach((eventName) => window.addEventListener(eventName, primeAll, { passive: true }))
    return () => unlockEvents.forEach((eventName) => window.removeEventListener(eventName, primeAll))
  }, [])

  useEffect(() => {
    if (!result) {
      // Resets both so a replay's video starts from the top rather than wherever the
      // previous game's playback left off.
      for (const ref of [winVideoRef, loseVideoRef]) {
        const v = ref.current
        if (!v) continue
        v.pause()
        v.currentTime = 0
      }
      return
    }
    const ref = result === 'win' ? winVideoRef : loseVideoRef
    const timer = window.setTimeout(() => {
      ref.current?.play().catch(() => {
        // Shouldn't happen once primed (see above), but a silent no-op still beats a
        // thrown error breaking the game-over screen if it somehow does.
      })
    }, FADE_IN_DURATION_MS)
    return () => clearTimeout(timer)
  }, [result])

  const copy = result ? COPY[result] : null

  return (
    <div
      className={`game-over-screen${result ? ` game-over-screen-${result}` : ' game-over-screen-hidden'}`}
      aria-hidden={!result}
    >
      <div className="game-over-content">
        <h1 className="game-over-title">{copy?.title}</h1>
        <p className="game-over-subtitle">{copy?.subtitle}</p>

        {/* Both videos stay mounted the whole game (see the priming effect above) —
            style (not conditional rendering) hides whichever one isn't this game's
            actual outcome, and only once there is one: hiding via display: none
            before that point (i.e. while both are still just waiting to be primed)
            risks Safari throttling a hidden element's decode pipeline enough that the
            priming .play() call above doesn't count as a real one. */}
        <video
          ref={winVideoRef}
          className="game-over-image"
          src={COPY.win.video}
          playsInline
          style={result && result !== 'win' ? { display: 'none' } : undefined}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <video
          ref={loseVideoRef}
          className="game-over-image"
          src={COPY.lose.video}
          playsInline
          style={result && result !== 'lose' ? { display: 'none' } : undefined}
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

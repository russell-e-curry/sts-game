import type { PlayerCard } from '../types'
import Card from './Card'
import './DisintegrateEffect.css'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface DisintegrateEffectProps {
  card: PlayerCard
  rect: Rect
}

const ASH_MOTE_COUNT = 10

// Plays over a discarded card's now-vacated hand slot (see GameBoard's
// handleDiscardCard) — the card itself dissolves in place while a burst of ash motes
// drifts up and away, then GameBoard starts the replacement draw once it's done.
function DisintegrateEffect({ card, rect }: DisintegrateEffectProps) {
  return (
    <div
      className="disintegrate-effect"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <div className="disintegrate-card">
        <Card card={card} />
      </div>
      {Array.from({ length: ASH_MOTE_COUNT }, (_, i) => (
        <span key={i} className={`ash-mote ash-mote-${i + 1}`} />
      ))}
    </div>
  )
}

export default DisintegrateEffect

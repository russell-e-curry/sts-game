import './DisintegrateEffect.css'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface ManagerDisintegrateEffectProps {
  rect: Rect
}

const ASH_MOTE_COUNT = 10

// Mirrors DisintegrateEffect, but for a card the manager discards without ever
// playing (see GameBoard's discardAndRedrawManagerCard) — dissolves the face-down
// card back instead of the card itself, since the manager's hand stays hidden until
// a card actually lands in the active slot (see startManagerDraw's comment on why
// manager cards never flip in hand).
function ManagerDisintegrateEffect({ rect }: ManagerDisintegrateEffectProps) {
  return (
    <div
      className="disintegrate-effect"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <div className="disintegrate-card">
        <img
          src="/cards/mc-manager-back-image.webp"
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      {Array.from({ length: ASH_MOTE_COUNT }, (_, i) => (
        <span key={i} className={`ash-mote ash-mote-${i + 1}`} />
      ))}
    </div>
  )
}

export default ManagerDisintegrateEffect

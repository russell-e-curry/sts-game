import './DiscardZone.css'

// Renders as the hand's permanent sixth slot (see Hand.tsx) — never dealt a card,
// just a drop target. GameBoard's pointerup handler checks for `.discard-zone` in
// the same way it already checks for `.history-panel`/`.active-column` to detect a
// card played into the battle.
function DiscardZone() {
  return (
    <div className="discard-zone-content">
      <svg
        className="discard-zone-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h16" />
        <path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" />
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
      <p className="discard-zone-label">Discard</p>
    </div>
  )
}

export default DiscardZone

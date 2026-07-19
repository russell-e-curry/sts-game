import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { GameCard } from '../types'
import { getLastMousePos } from '../lib/pointerTracker'
import './Card.css'

interface CardProps<T extends GameCard> {
  card: T
  dimmed?: boolean
  /** Renders dimmer than a normal card — its character hasn't been introduced on this side yet, so it can't be played (see GameBoard's isCardLocked). Unlike `dimmed`, still draggable/discardable. */
  locked?: boolean
  /** Lets a click toggle the same enlarge treatment hover gives cards elsewhere (e.g. the hand). */
  expandOnClick?: boolean
  /** Applies the hover-expanded look without needing a real hover/click (e.g. the drag ghost, which is pointer-events: none so it never receives those events itself). */
  forceExpanded?: boolean
  /** True once this card has resolved and moved into the battle history — only then does a recurring card start its glow animation. */
  played?: boolean
  /** True once an 'eliminate' card of the same type has stopped this recurring card — renders a striped overlay and suppresses the recurring glow. */
  stopped?: boolean
  /** True once a 'cancel' card played the same round has neutralized this card — renders a striped overlay, same idea as `stopped` but from a same-round cancel rather than a later-round eliminate. */
  cancelled?: boolean
  /** Turns left that a 'block recurring' card has suspended this recurring card for — renders a striped overlay (and the countdown) and pauses the recurring glow, same idea as `stopped` but temporary rather than permanent. Undefined/0 means not suspended. */
  suspendedTurns?: number
  onPointerDown?: (e: PointerEvent, card: T) => void
}

// Every card enlarges to the same absolute size, pinned to what a played (battle-slot)
// card looks like at this zoom level — a .battle-slot is always in the DOM to measure
// against — so a hand card and a battle card reach the exact same on-screen size.
const HOVER_SCALE = 2.5
// Enlarged cards are taller than the resting 1.4 ratio: the enlarged art frame is a
// full-width square (so the square artwork fills it), which needs extra height on top
// of the header/name/description/footer. Every enlarged card uses this same ratio, so
// they all reach the same width AND height.
const CARD_ASPECT = 1.75

interface OverlayGeom {
  width: number
  height: number
  left: number
  top: number
}

function Card<T extends GameCard>({
  card,
  dimmed,
  locked,
  expandOnClick,
  forceExpanded,
  played,
  stopped,
  cancelled,
  suspendedTurns,
  onPointerDown,
}: CardProps<T>) {
  const suspended = !!suspendedTurns && suspendedTurns > 0
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)
  const [artFailed, setArtFailed] = useState(false)
  const [overlay, setOverlay] = useState<OverlayGeom | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const rulesRef = useRef<HTMLParagraphElement>(null)
  const suppressHoverRef = useRef(false)
  const expanded = hovered || clicked || forceExpanded

  // The drag ghost (forceExpanded) is sized and positioned externally by GameBoard;
  // every other card enlarges by lifting into a fixed-size overlay. Enlarging via a
  // real re-layout (rather than transform: scale) re-runs the card's container queries
  // at the big size, so artwork scales and the full description lays out properly.
  const useOverlay = !forceExpanded

  // Positions the fixed overlay from the card's RESTING rect (so it must be measured
  // before the card lifts out of flow). All cards grow to the same width/height; hand
  // cards grow upward from their resting bottom while cards elsewhere grow from their
  // center, and both are clamped so nothing spills off-screen.
  const computeOverlay = (): OverlayGeom | null => {
    const el = rootRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const referenceSlot = document.querySelector('.battle-slot')
    const referenceWidth = referenceSlot ? referenceSlot.getBoundingClientRect().width : el.offsetWidth
    // Never shrink below the card's own resting width * HOVER_SCALE — on short
    // viewports the battle area (and its slots) collapses, and a slot-only target
    // would make the "enlarged" card smaller than the resting one. Cap to viewport.
    const width = Math.min(Math.max(referenceWidth, el.offsetWidth) * HOVER_SCALE, window.innerWidth - 16)
    const height = width * CARD_ASPECT
    const centerX = rect.left + rect.width / 2
    const desiredTop = expandOnClick ? rect.bottom - height : rect.top + rect.height / 2 - height / 2
    const left = Math.max(8, Math.min(centerX - width / 2, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(desiredTop, window.innerHeight - height - 8))
    return { width, height, left, top }
  }

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || forceExpanded) return
    const rect = el.getBoundingClientRect()
    const { x, y } = getLastMousePos()
    // If the card mounts directly under an already-resting cursor (e.g. it was just
    // dropped into a slot), ignore the hover-enlarge until the mouse leaves and returns.
    suppressHoverRef.current = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }, [forceExpanded])

  // The drag ghost is styled like an overlay too (it's the same enlarged size), so it
  // gets the reduced artwork + fitted text and matches what hovering the card shows.
  const styledAsOverlay = (useOverlay && expanded && overlay !== null) || forceExpanded

  // When enlarged, shrink the description font until it fits the space left under the
  // artwork, so long rules text can't clip at the bottom of the fixed-height card.
  useLayoutEffect(() => {
    const el = rulesRef.current
    if (!el) return
    el.style.fontSize = ''
    if (!styledAsOverlay) return
    const body = el.parentElement
    if (!body) return
    const cs = getComputedStyle(body)
    const avail = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    if (avail <= 0) return
    // A couple of passes: shrinking the font can change how the text wraps, so re-measure.
    // Floored at 8px so a card that's briefly small (e.g. pressed before its hover-
    // enlarge renders) can't shrink its text to something invisible.
    for (let i = 0; i < 3 && el.scrollHeight > avail; i++) {
      const fontSize = parseFloat(getComputedStyle(el).fontSize)
      const fitted = Math.max(8, fontSize * (avail / el.scrollHeight))
      el.style.fontSize = `${fitted}px`
      if (fitted === 8) break
    }
  }, [styledAsOverlay, overlay, card.description])

  const handleMouseEnter = () => {
    if (suppressHoverRef.current) return
    if (useOverlay) setOverlay(computeOverlay())
    setHovered(true)
  }

  const handleMouseLeave = () => {
    suppressHoverRef.current = false
    setHovered(false)
  }

  const handleClick = () => {
    if (!expandOnClick) return
    setClicked((c) => {
      const next = !c
      // Anchor from the resting rect only when there isn't already an overlay in
      // effect (hover computes it first); measuring now would read the lifted card.
      if (next && !overlay) setOverlay(computeOverlay())
      return next
    })
  }

  const overlayActive = useOverlay && expanded && overlay !== null
  const style: CSSProperties = overlayActive
    ? {
        position: 'fixed',
        left: overlay!.left,
        top: overlay!.top,
        width: overlay!.width,
        height: overlay!.height,
      }
    : {}

  const actionTemplateClass =
    card.action === 'recurring'
      ? ' game-card-template-recurring'
      : card.action === 'eliminate'
        ? ' game-card-template-eliminate'
        : card.action === 'character' && card.character
          ? ' game-card-template-character'
          : ''

  return (
    <div
      ref={rootRef}
      className={`game-card${dimmed ? ' game-card-dimmed' : ''}${locked ? ' game-card-locked' : ''}${expanded ? ' game-card-hovered' : ''}${styledAsOverlay ? ' game-card-overlay' : ''}${card.action === 'recurring' && played && !stopped && !cancelled && !suspended ? ' game-card-recurring' : ''}`}
      style={style}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, card) : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className={`game-card-template${actionTemplateClass}`}>
        <div className="game-card-header">
          <span className="game-card-type">{card.type}</span>
          <span className="game-card-action">{card.action}</span>
        </div>
        <p className="game-card-name">{card.title}</p>
        <div className="game-card-art-frame">
          {artFailed ? (
            <div className="game-card-art-placeholder" />
          ) : (
            <img
              className="game-card-art"
              src={card.image}
              alt={card.title}
              draggable={false}
              onError={() => setArtFailed(true)}
            />
          )}
        </div>
        <div className="game-card-body">
          <p className="game-card-rules" ref={rulesRef}>
            {card.description}
          </p>
        </div>
        {card.action !== 'reset' && card.action !== 'cancel' && (
          <div className="game-card-footer">
            {card.type === 'reversal' ? (
              <span className="game-card-stat game-card-stat-slot-center game-card-stat-color-vesting">
                Reverse manager's card
              </span>
            ) : (
              <>
                {card.backlog !== undefined ? (
                  <span
                    className={`game-card-stat game-card-stat-slot-left ${card.backlog === '*' ? 'game-card-stat-color-vesting' : 'game-card-stat-color-backlog'}`}
                  >
                    Backlog {card.backlog === '*' ? 'Reset' : card.backlog}
                  </span>
                ) : card.technicalDebt !== undefined ? (
                  <span
                    className={`game-card-stat game-card-stat-slot-left ${card.technicalDebt === '*' ? 'game-card-stat-color-vesting' : 'game-card-stat-color-techdebt'}`}
                  >
                    Tech Debt {card.technicalDebt === '*' ? 'Reset' : card.technicalDebt}
                  </span>
                ) : card.vesting !== undefined && card.burnout !== undefined ? (
                  <span className="game-card-stat game-card-stat-slot-left game-card-stat-color-vesting">
                    Vesting {card.vesting}%
                  </span>
                ) : null}
                {card.vesting !== undefined && card.burnout === undefined && (
                  <span className="game-card-stat game-card-stat-slot-center game-card-stat-color-vesting">
                    Vesting {card.vesting}%
                  </span>
                )}
                {card.burnout !== undefined && (
                  <span className="game-card-stat game-card-stat-slot-right game-card-stat-color-burnout">
                    {card.burnout > 0 ? `+${card.burnout}` : card.burnout}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {card.action === 'eliminate' && (
          <div className="game-card-eliminate-badge">
            {card.character ? `Eliminate the ${card.character}` : 'Stop a Recurring Card'}
          </div>
        )}
        {card.action === 'reset' && (
          <div className="game-card-reset-badge">Reset Tech Debt & Backlog</div>
        )}
        {card.action === 'cancel' && (
          <div className="game-card-cancel-badge">Cancel Manager's Card</div>
        )}
      </div>
      {stopped && (
        <div className="game-card-stopped-overlay">
          <span className="game-card-stopped-label">STOPPED</span>
        </div>
      )}
      {cancelled && (
        <div className="game-card-cancelled-overlay">
          <span className="game-card-cancelled-label">CANCELLED</span>
        </div>
      )}
      {suspended && (
        <div className="game-card-suspended-overlay">
          <span className="game-card-suspended-label">SUSPENDED</span>
          <span className="game-card-suspended-turns">
            {suspendedTurns} turn{suspendedTurns === 1 ? '' : 's'} left
          </span>
        </div>
      )}
    </div>
  )
}

export default Card

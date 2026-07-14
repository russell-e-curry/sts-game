import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { ManagerCard, PlayerCard } from '../types'
import Card from './Card'
import SparkleBurst from './SparkleBurst'
import './BattleArea.css'

export interface ResolvedRound {
  id: string
  playerCard: PlayerCard
  managerCard: ManagerCard
  /** Set once a player 'eliminate' card of the same type stops this round's manager
   * recurring effect — renders the STOPPED overlay on the manager's card. */
  managerCardStopped?: boolean
  /** Set once a manager 'eliminate' card of the same type stops this round's player
   * recurring effect — renders the STOPPED overlay on the player's card. */
  playerCardStopped?: boolean
}

interface BattleAreaProps {
  history: ResolvedRound[]
  activePlayerCard: PlayerCard | null
  activeManagerCard: ManagerCard | null
}

const MIN_THUMB_WIDTH = 40

const BattleArea = forwardRef<HTMLDivElement, BattleAreaProps>(function BattleArea(
  { history, activePlayerCard, activeManagerCard },
  activeSlotRef,
) {
  const historyRowRef = useRef<HTMLDivElement>(null)
  const historyTrackRef = useRef<HTMLDivElement>(null)
  const scrollbarRef = useRef<HTMLDivElement>(null)
  const prevRects = useRef<Map<string, DOMRect>>(new Map())

  // How far the played-card track is nudged rightward (via a relative `left` offset)
  // to reveal cards clipped off the left edge. 0 is the resting position — newest card
  // visible, flush against the active column — which is where it always snaps back to
  // once the scrollbar thumb is released.
  const [scrollOffset, setScrollOffset] = useState(0)
  const [maxScrollOffset, setMaxScrollOffset] = useState(0)
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  const [visibleFraction, setVisibleFraction] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ pointerX: 0, offset: 0 })

  useLayoutEffect(() => {
    const row = historyRowRef.current
    if (!row) return

    const items = Array.from(row.querySelectorAll<HTMLElement>('.battle-column-history'))
    items.forEach((el) => {
      const id = el.dataset.roundId
      if (!id) return
      const newRect = el.getBoundingClientRect()
      const prev = prevRects.current.get(id)

      if (prev) {
        const dx = prev.left - newRect.left
        if (dx !== 0) {
          el.style.transition = 'none'
          el.style.transform = `translateX(${dx}px)`
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.4s ease'
            el.style.transform = 'none'
          })
        }
      }

      prevRects.current.set(id, newRect)
    })
  }, [history])

  useLayoutEffect(() => {
    const row = historyRowRef.current
    const track = historyTrackRef.current
    const scrollbar = scrollbarRef.current
    // The scrollbar track is always mounted (just visually hidden until there's
    // overflow) precisely so it's always here to measure — otherwise there'd be no
    // way to ever detect overflow in the first place, since maxScrollOffset > 0 is
    // also what gates whether that ref would exist.
    if (!row || !track || !scrollbar) return

    const recompute = () => {
      const overflow = Math.max(0, track.scrollWidth - row.clientWidth)
      setMaxScrollOffset(overflow)
      setScrollOffset((prev) => Math.min(prev, overflow))
      setVisibleFraction(Math.min(1, row.clientWidth / track.scrollWidth))
      setScrollbarWidth(scrollbar.clientWidth)
    }

    recompute()

    const observer = new ResizeObserver(recompute)
    observer.observe(row)
    observer.observe(track)
    observer.observe(scrollbar)
    return () => observer.disconnect()
  }, [history])

  useEffect(() => {
    if (!isDragging) return

    // The track the thumb physically travels across (scrollbarWidth - thumbWidth) is
    // usually much narrower than maxScrollOffset (the raw px of history overflow), so
    // pointer movement must be scaled up to match — otherwise the thumb lags behind
    // the cursor and the drag runs out of track before scrollOffset reaches its max.
    const thumbWidth = Math.min(scrollbarWidth, Math.max(MIN_THUMB_WIDTH, scrollbarWidth * visibleFraction))
    const trackRange = Math.max(1, scrollbarWidth - thumbWidth)
    const scale = maxScrollOffset / trackRange

    const handleMove = (e: globalThis.PointerEvent) => {
      const pointerDelta = e.clientX - dragStart.current.pointerX
      // Dragging the thumb left pushes the played cards right, uncovering earlier
      // rounds that were clipped off the edge.
      const delta = pointerDelta * scale
      const next = Math.min(maxScrollOffset, Math.max(0, dragStart.current.offset - delta))
      setScrollOffset(next)
    }
    const handleUp = () => setIsDragging(false)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isDragging, maxScrollOffset, scrollbarWidth, visibleFraction])

  // Releasing the thumb always sends the played cards sliding back to their default
  // (newest-card-visible) position rather than leaving them scrolled.
  useEffect(() => {
    if (!isDragging) setScrollOffset(0)
  }, [isDragging])

  const handleThumbPointerDown = (e: PointerEvent) => {
    dragStart.current = { pointerX: e.clientX, offset: scrollOffset }
    setIsDragging(true)
  }

  const thumbWidth = Math.min(scrollbarWidth, Math.max(MIN_THUMB_WIDTH, scrollbarWidth * visibleFraction))
  const scrollFraction = maxScrollOffset > 0 ? scrollOffset / maxScrollOffset : 0
  const thumbLeft = (1 - scrollFraction) * Math.max(0, scrollbarWidth - thumbWidth)

  return (
    <>
      {/* Grid column 1 of .battle-row (see GameBoard.css) — the scrolling list of
          already-played rounds. */}
      <div className="history-panel" ref={historyRowRef}>
        <div
          className="history-track"
          ref={historyTrackRef}
          style={{
            // A relative offset, not transform: translateX — transform on an ancestor
            // creates a new containing block for descendant position: fixed elements,
            // which is exactly how Card.tsx's hover-enlarge overlay is positioned. That
            // would silently break every played card's hover overlay.
            position: 'relative',
            left: scrollOffset,
            transition: isDragging ? 'none' : 'left 0.35s ease',
          }}
        >
          {history.map((round) => (
            <div key={round.id} data-round-id={round.id} className="battle-column-history">
              <div className="battle-slot">
                <Card card={round.managerCard} played stopped={round.managerCardStopped} />
              </div>
              <div className="battle-slot">
                <Card card={round.playerCard} played stopped={round.playerCardStopped} />
              </div>
            </div>
          ))}
        </div>

        <div
          className={`history-scrollbar${maxScrollOffset > 0 ? ' history-scrollbar-visible' : ''}`}
          ref={scrollbarRef}
        >
          <div
            className="history-scrollbar-thumb"
            style={{
              width: thumbWidth,
              left: thumbLeft,
              transition: isDragging ? 'none' : 'left 0.35s ease',
            }}
            onPointerDown={handleThumbPointerDown}
          />
        </div>
      </div>

      {/* Grid column 2 (auto-width, sized to just fit a card) — sits exactly centered
          on screen because columns 1 and 3 share the same 1fr track. */}
      <div className="active-column">
        <div className="battle-slot" ref={activeSlotRef}>
          {activeManagerCard ? (
            <Card card={activeManagerCard} />
          ) : (
            <div className="battle-slot-placeholder" />
          )}
        </div>
        <div className="battle-slot">
          {activePlayerCard ? (
            <>
              <Card card={activePlayerCard} />
              <SparkleBurst />
            </>
          ) : (
            <div className="battle-slot-placeholder" />
          )}
        </div>
      </div>
    </>
  )
})

export default BattleArea

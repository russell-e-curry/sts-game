import type { PointerEvent } from 'react'
import type { PlayerCard } from '../types'
import Card from './Card'
import DiscardZone from './DiscardZone'
import './Hand.css'

interface HandProps {
  cards: (PlayerCard | null)[]
  draggingCardId?: string | null
  /** Ids of cards that can't be played yet — their character's own 'character'-action
   * card hasn't landed on the player's side (see GameBoard's isCardLocked). Rendered
   * dimmer than a normal card so the player can see why before even trying to play it. */
  lockedCardIds?: Set<string>
  onCardPointerDown?: (e: PointerEvent, card: PlayerCard) => void
}

function Hand({ cards, draggingCardId, lockedCardIds, onCardPointerDown }: HandProps) {
  return (
    <div className="hand">
      {cards.map((card, i) => (
        <div className="hand-slot" data-slot-index={i} key={card?.id ?? `empty-${i}`}>
          {card && (
            <Card
              card={card}
              dimmed={card.id === draggingCardId}
              locked={lockedCardIds?.has(card.id)}
              onPointerDown={onCardPointerDown}
              expandOnClick
            />
          )}
        </div>
      ))}
      {/* Permanent sixth slot — never part of `cards`, never dealt into, just a drop
          target for discarding (see GameBoard's handleDiscardCard). */}
      <div className="hand-slot discard-zone">
        <DiscardZone />
      </div>
    </div>
  )
}

export default Hand

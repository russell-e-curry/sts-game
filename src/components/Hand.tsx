import type { PointerEvent } from 'react'
import type { PlayerCard } from '../types'
import Card from './Card'
import DiscardZone from './DiscardZone'
import './Hand.css'

interface HandProps {
  cards: (PlayerCard | null)[]
  draggingCardId?: string | null
  onCardPointerDown?: (e: PointerEvent, card: PlayerCard) => void
}

function Hand({ cards, draggingCardId, onCardPointerDown }: HandProps) {
  return (
    <div className="hand">
      {cards.map((card, i) => (
        <div className="hand-slot" data-slot-index={i} key={card?.id ?? `empty-${i}`}>
          {card && (
            <Card
              card={card}
              dimmed={card.id === draggingCardId}
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

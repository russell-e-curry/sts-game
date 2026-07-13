import './Deck.css'

interface DeckProps {
  image: string
  count?: number
}

function Deck({ image, count }: DeckProps) {
  return (
    <div className="deck">
      <div className="deck-stack">
        <img className="deck-card deck-card-3" src={image} alt="" draggable={false} />
        <img className="deck-card deck-card-2" src={image} alt="" draggable={false} />
        <img className="deck-card deck-card-1" src={image} alt="Deck of cards" draggable={false} />
      </div>
      {count !== undefined && <p className="deck-count">{count} left</p>}
    </div>
  )
}

export default Deck

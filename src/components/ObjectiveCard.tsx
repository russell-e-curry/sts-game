import './ObjectiveCard.css'

interface ObjectiveCardProps {
  title: string
  description: string
  image?: string
}

function ObjectiveCard({ title, description, image }: ObjectiveCardProps) {
  return (
    <div className="objective-card">
      {image ? (
        <img className="objective-card-art" src={image} alt={title} draggable={false} />
      ) : (
        <div className="objective-card-fallback">
          <span className="objective-card-badge">Directive</span>
          <p className="objective-card-title">{title}</p>
          <p className="objective-card-description">{description}</p>
        </div>
      )}
    </div>
  )
}

export default ObjectiveCard

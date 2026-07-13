import Deck from './Deck'
import ObjectiveCard from './ObjectiveCard'
import './ObjectivePanel.css'

interface ObjectivePanelProps {
  title: string
  description: string
  image: string
}

function ObjectivePanel({ title, description, image }: ObjectivePanelProps) {
  return (
    <div className="objective-panel">
      <Deck image="/cards/pc-objective-back-image.png" />
      <ObjectiveCard title={title} description={description} image={image} />
    </div>
  )
}

export default ObjectivePanel

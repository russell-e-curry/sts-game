import './ManagerHand.css'

interface ManagerHandProps {
  ids: string[]
  usedIds: Set<string>
  hiddenId?: string | null
}

function ManagerHand({ ids, usedIds, hiddenId }: ManagerHandProps) {
  return (
    <div className="manager-hand">
      {ids.map((id) => (
        <div className="manager-hand-slot" data-slot-id={id} key={id}>
          {!usedIds.has(id) && (
            <img
              data-card-id={id}
              className={`manager-hand-card${id === hiddenId ? ' manager-hand-card-hidden' : ''}`}
              src="/cards/pc-manager-back-image.png"
              alt="Manager's hidden card"
              draggable={false}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default ManagerHand

import './GameOverScreen.css'

interface GameOverScreenProps {
  result: 'win' | 'lose'
  onRestart: () => void
}

const COPY = {
  win: {
    title: 'Fully Vested',
    subtitle: 'You survived the sprint with your equity intact.',
    image: '/splash/win/gm-splash-you-win.webp',
  },
  lose: {
    title: 'Game Over',
    subtitle: 'The sprint buried you before your equity vested.',
    image: '/splash/lose/gm-splash-you-lose.webp',
  },
} as const

function GameOverScreen({ result, onRestart }: GameOverScreenProps) {
  const { title, subtitle, image } = COPY[result]

  return (
    <div className={`game-over-screen game-over-screen-${result}`}>
      <div className="game-over-content">
        <h1 className="game-over-title">{title}</h1>
        <p className="game-over-subtitle">{subtitle}</p>

        <img
          className="game-over-image"
          src={image}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />

        <button className="game-over-restart" onClick={onRestart}>
          PLAY AGAIN
        </button>
      </div>
    </div>
  )
}

export default GameOverScreen

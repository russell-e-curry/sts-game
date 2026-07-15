import './SplashScreen.css'

interface SplashScreenProps {
  onStart: () => void
}

function SplashScreen({ onStart }: SplashScreenProps) {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <h1 className="splash-title">Slay the Sprint</h1>
        <p className="splash-subtitle">Survive the sprint. Vest your equity. Don't burn out.</p>

        <img
          className="splash-image"
          src="/splash/sts-splash-screen.webp"
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />

        <div className="splash-rules">
          <p>
            Your manager opens every round by playing a card. Drag a card from your hand onto it to
            respond — every card can raise or lower any of the four meters up top:{' '}
            <strong>Backlog</strong>, <strong>Tech Debt</strong>, <strong>Burnout</strong>, and{' '}
            <strong>Vesting</strong>, though most only touch one or two.
          </p>
          <p>
            Keep Backlog, Tech Debt, and Burnout under control while Vesting climbs a little every
            turn on its own — get it to 100% before the other three bury you. Watch Slack too: random
            messages land in the side panel and nudge those same meters, whether you're ready or not.
          </p>
        </div>

        <button className="splash-start" onClick={onStart}>
          START
        </button>
      </div>
    </div>
  )
}

export default SplashScreen

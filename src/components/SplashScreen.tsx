import './SplashScreen.css'

interface SplashScreenProps {
  onStart: () => void
}

function SplashScreen({ onStart }: SplashScreenProps) {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <h1 className="splash-title">Slay the Sprint</h1>
        <p className="splash-subtitle">Survive the sprint. Vest your equity or hit your milestones. Don't burn out.</p>

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
            respond — every card can raise or lower <strong>Backlog</strong>, <strong>Tech Debt</strong>,
            or <strong>Burnout</strong>, though most only touch one or two.
          </p>
          <p>
            Keep those three under control while you race for either win condition:{' '}
            <strong>Vesting</strong> climbs a little every turn on its own, or you can ship story
            points toward <strong>Milestones</strong> — no card, no progress there, so it's on you to
            earn it. Hit 100% Vesting or fill all four 100-point Milestones before the other three
            bury you. Watch Slack too: random messages land in the side panel and nudge Backlog, Tech
            Debt, and Burnout, whether you're ready or not.
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

import './Meters.css'

interface MetersProps {
  backlog: number
  techDebt: number
  burnout: number
  vesting: number
  // Bumped independently for whichever meter just changed (see GameBoard's
  // round-resolve cascade) — remounts that meter's flash overlay below so its
  // one-shot CSS animation restarts, even though the meters themselves stay mounted
  // the whole game. Undefined/0 renders no overlay at all.
  backlogFlashKey?: number
  techDebtFlashKey?: number
  burnoutFlashKey?: number
  vestingFlashKey?: number
  // True once this meter has actually hit its cap and its turn has come up in the
  // game-over glow cascade (see runLossSequence in GameBoard) — holds a bright pulsing
  // glow rather than a one-shot flash, since it stays lit right through the game-over
  // fade-in rather than resetting.
  backlogMaxed?: boolean
  techDebtMaxed?: boolean
  burnoutMaxed?: boolean
  // Same idea as the danger-stat *Maxed props above, but for vesting hitting 100% (a
  // win) — set once its turn comes up in the game-over glow cascade (see
  // runWinSequence in GameBoard) and left on through the game-over fade-in.
  vestingMaxed?: boolean
}

const STAT_MAX = 500
const BURNOUT_MAX = 1000
const VESTING_MAX = 100

function pct(value: number, max: number) {
  return Math.round(Math.min(100, (value / max) * 100))
}

// Danger stats (backlog/tech debt/burnout) flash red-hot once they're most of the way
// to maxed out; vesting flips the framing and celebrates in gold instead, since high
// is good there.
const CRITICAL_THRESHOLD = 80

function Meters({
  backlog,
  techDebt,
  burnout,
  vesting,
  backlogFlashKey,
  techDebtFlashKey,
  burnoutFlashKey,
  vestingFlashKey,
  backlogMaxed,
  techDebtMaxed,
  burnoutMaxed,
  vestingMaxed,
}: MetersProps) {
  const backlogPct = pct(backlog, STAT_MAX)
  const techDebtPct = pct(techDebt, STAT_MAX)
  const burnoutPct = pct(burnout, BURNOUT_MAX)
  const vestingPct = pct(vesting, VESTING_MAX)

  return (
    <div className="meters">
      <div className="meters-column">
        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Backlog</span>
            <span className="meter-bar-value meter-bar-value-backlog">{backlogPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-backlog${backlogPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}${backlogMaxed ? ' meter-bar-fill-maxed' : ''}`}
              style={{ width: `${backlogPct}%` }}
            />
            {!!backlogFlashKey && <div key={backlogFlashKey} className="meter-bar-flash" />}
          </div>
        </div>

        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Tech Debt</span>
            <span className="meter-bar-value meter-bar-value-techdebt">{techDebtPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-techdebt${techDebtPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}${techDebtMaxed ? ' meter-bar-fill-maxed' : ''}`}
              style={{ width: `${techDebtPct}%` }}
            />
            {!!techDebtFlashKey && <div key={techDebtFlashKey} className="meter-bar-flash" />}
          </div>
        </div>
      </div>

      <div className="meters-column">
        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Burnout</span>
            <span className="meter-bar-value meter-bar-value-burnout">{burnoutPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-burnout${burnoutPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}${burnoutMaxed ? ' meter-bar-fill-maxed' : ''}`}
              style={{ width: `${burnoutPct}%` }}
            />
            {!!burnoutFlashKey && <div key={burnoutFlashKey} className="meter-bar-flash" />}
          </div>
        </div>

        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Vesting</span>
            <span className="meter-bar-value meter-bar-value-vesting">{vestingPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-vesting${vestingPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-celebrate' : ''}${vestingMaxed ? ' meter-bar-fill-maxed' : ''}`}
              style={{ width: `${vestingPct}%` }}
            />
            {!!vestingFlashKey && <div key={vestingFlashKey} className="meter-bar-flash" />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Meters

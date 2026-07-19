import './Meters.css'

interface MetersProps {
  backlog: number
  technicalDebt: number
  burnout: number
  vesting: number
  // Bumped once per resolved round (see GameBoard) — remounts the flash overlay
  // below so its one-shot CSS animation restarts even though the meters themselves
  // stay mounted the whole game.
  flashKey?: number
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

function Meters({ backlog, technicalDebt, burnout, vesting, flashKey }: MetersProps) {
  const backlogPct = pct(backlog, STAT_MAX)
  const technicalDebtPct = pct(technicalDebt, STAT_MAX)
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
              className={`meter-bar-fill meter-bar-fill-backlog${backlogPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}`}
              style={{ width: `${backlogPct}%` }}
            />
            {!!flashKey && <div key={flashKey} className="meter-bar-flash" />}
          </div>
        </div>

        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Tech Debt</span>
            <span className="meter-bar-value meter-bar-value-techdebt">{technicalDebtPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-techdebt${technicalDebtPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}`}
              style={{ width: `${technicalDebtPct}%` }}
            />
            {!!flashKey && <div key={flashKey} className="meter-bar-flash" />}
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
              className={`meter-bar-fill meter-bar-fill-burnout${burnoutPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-critical' : ''}`}
              style={{ width: `${burnoutPct}%` }}
            />
            {!!flashKey && <div key={flashKey} className="meter-bar-flash" />}
          </div>
        </div>

        <div className="meter-bar">
          <div className="meter-bar-top">
            <span className="meter-bar-label">Vesting</span>
            <span className="meter-bar-value meter-bar-value-vesting">{vestingPct}%</span>
          </div>
          <div className="meter-bar-track">
            <div
              className={`meter-bar-fill meter-bar-fill-vesting${vestingPct >= CRITICAL_THRESHOLD ? ' meter-bar-fill-celebrate' : ''}`}
              style={{ width: `${vestingPct}%` }}
            />
            {!!flashKey && <div key={flashKey} className="meter-bar-flash" />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Meters

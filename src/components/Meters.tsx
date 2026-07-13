import './Meters.css'

interface MetersProps {
  backlog: number
  technicalDebt: number
  burnout: number
  vesting: number
}

const STAT_MAX = 500
const BURNOUT_MAX = 1000
const VESTING_MAX = 100

function pct(value: number, max: number) {
  return Math.round(Math.min(100, (value / max) * 100))
}

function Meters({ backlog, technicalDebt, burnout, vesting }: MetersProps) {
  const backlogPct = pct(backlog, STAT_MAX)
  const technicalDebtPct = pct(technicalDebt, STAT_MAX)
  const burnoutPct = pct(burnout, BURNOUT_MAX)
  const vestingPct = pct(vesting, VESTING_MAX)

  return (
    <div className="meters">
      <div className="meter-bar">
        <div className="meter-bar-top">
          <span className="meter-bar-label">Backlog</span>
          <span className="meter-bar-value">{backlogPct}%</span>
        </div>
        <div className="meter-bar-track">
          <div className="meter-bar-fill meter-bar-fill-backlog" style={{ width: `${backlogPct}%` }} />
        </div>
      </div>

      <div className="meter-bar">
        <div className="meter-bar-top">
          <span className="meter-bar-label">Tech Debt</span>
          <span className="meter-bar-value">{technicalDebtPct}%</span>
        </div>
        <div className="meter-bar-track">
          <div className="meter-bar-fill meter-bar-fill-techdebt" style={{ width: `${technicalDebtPct}%` }} />
        </div>
      </div>

      <div className="meter-bar">
        <div className="meter-bar-top">
          <span className="meter-bar-label">Burnout</span>
          <span className="meter-bar-value">{burnoutPct}%</span>
        </div>
        <div className="meter-bar-track">
          <div className="meter-bar-fill meter-bar-fill-burnout" style={{ width: `${burnoutPct}%` }} />
        </div>
      </div>

      <div className="meter-bar">
        <div className="meter-bar-top">
          <span className="meter-bar-label">Vesting</span>
          <span className="meter-bar-value">{vestingPct}%</span>
        </div>
        <div className="meter-bar-track">
          <div className="meter-bar-fill meter-bar-fill-vesting" style={{ width: `${vestingPct}%` }} />
        </div>
      </div>
    </div>
  )
}

export default Meters

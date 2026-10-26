import './Meters.css'

export interface MetersProps {
  backlog: number
  techDebt: number
  burnout: number
  vesting: number
  // Total story points banked toward the current milestone run, 0-MILESTONE_POINTS_MAX
  // — see milestoneSegments below for how this gets split across the 4 checkpoints.
  milestonePoints: number
  // Bumped independently for whichever meter just changed (see GameBoard's
  // round-resolve cascade) — remounts that meter's flash overlay below so its
  // one-shot CSS animation restarts, even though the meters themselves stay mounted
  // the whole game. Undefined/0 renders no overlay at all.
  backlogFlashKey?: number
  techDebtFlashKey?: number
  burnoutFlashKey?: number
  vestingFlashKey?: number
  // Flashes the currently-filling milestone segment on any point gain, same idea as
  // the other meters' flash keys above.
  milestoneFlashKey?: number
  // Which segment (0-3) just crossed a fresh 100-point line mid-game, paired with
  // milestoneCheckpointKey below to remount that specific segment's one-shot
  // checkpoint glow — distinct from the plain flash every point gain gets. Null when
  // nothing just completed (the common case) or when the completion was the 4th
  // (the win itself, handled by milestonesWon's glow instead).
  milestoneCheckpointIndex?: number | null
  milestoneCheckpointKey?: number
  // True once this meter has actually hit its cap and its turn has come up in the
  // game-over glow cascade (see runLossSequence in GameBoard) — holds a bright pulsing
  // glow rather than a one-shot flash, since it stays lit right through the game-over
  // fade-in rather than resetting.
  backlogMaxed?: boolean
  techDebtMaxed?: boolean
  burnoutMaxed?: boolean
  // Same idea as the danger-stat *Maxed props above, but for this game's two win paths
  // — Vesting reaching 100%, or every Milestone filling — either one on its own wins.
  // Set once that path's turn comes up in the game-over glow cascade (see
  // runWinSequence in GameBoard) and left on through the game-over fade-in.
  vestingMaxed?: boolean
  milestonesWon?: boolean
}

const STAT_MAX = 500
const BURNOUT_MAX = 1000
const VESTING_MAX = 100
// Milestones are grouped into MILESTONE_COUNT sequential 100-point checkpoints rather
// than one flat bar — mirrors the same constants in GameBoard.tsx.
const MILESTONE_POINTS_PER_MILESTONE = 100
const MILESTONE_COUNT = 4
const MILESTONE_POINTS_MAX = MILESTONE_POINTS_PER_MILESTONE * MILESTONE_COUNT

function pct(value: number, max: number) {
  return Math.round(Math.min(100, (value / max) * 100))
}

// Danger stats (backlog/tech debt/burnout) flash red-hot once they're most of the way
// to maxed out; Vesting and the active milestone segment flip the framing and
// celebrate in gold instead, since high is good there.
const CRITICAL_THRESHOLD = 80

// Splits total milestone points into MILESTONE_COUNT sequential 100-point buckets —
// points fill segment 0 first, then spill into segment 1, and so on, so each one
// completes in turn rather than all four filling together.
function milestoneSegments(points: number) {
  return Array.from({ length: MILESTONE_COUNT }, (_, i) => {
    const floor = i * MILESTONE_POINTS_PER_MILESTONE
    const raw = Math.max(0, Math.min(MILESTONE_POINTS_PER_MILESTONE, points - floor))
    return { points: raw, pct: pct(raw, MILESTONE_POINTS_PER_MILESTONE), complete: raw >= MILESTONE_POINTS_PER_MILESTONE }
  })
}

function Meters({
  backlog,
  techDebt,
  burnout,
  vesting,
  milestonePoints,
  backlogFlashKey,
  techDebtFlashKey,
  burnoutFlashKey,
  vestingFlashKey,
  milestoneFlashKey,
  milestoneCheckpointIndex,
  milestoneCheckpointKey,
  backlogMaxed,
  techDebtMaxed,
  burnoutMaxed,
  vestingMaxed,
  milestonesWon,
}: MetersProps) {
  const backlogPct = pct(backlog, STAT_MAX)
  const techDebtPct = pct(techDebt, STAT_MAX)
  const burnoutPct = pct(burnout, BURNOUT_MAX)
  const vestingPct = pct(vesting, VESTING_MAX)

  // Points used so far, clamped at the meter's max in case a delta ever lands a
  // hair past max before the next clamp pass corrects it.
  const backlogUsed = Math.max(0, Math.min(STAT_MAX, backlog))
  const techDebtUsed = Math.max(0, Math.min(STAT_MAX, techDebt))
  const burnoutUsed = Math.max(0, Math.min(BURNOUT_MAX, burnout))
  const vestingUsed = Math.max(0, Math.min(VESTING_MAX, vesting))
  const milestonePointsUsed = Math.max(0, Math.min(MILESTONE_POINTS_MAX, milestonePoints))

  const segments = milestoneSegments(milestonePointsUsed)
  const completedCount = segments.filter((s) => s.complete).length
  // The segment currently filling — the first incomplete one, or the last (already
  // full) one once every milestone is done, so the win glow still has somewhere to sit.
  const activeIndex = Math.min(completedCount, MILESTONE_COUNT - 1)

  return (
    <div className="meters-wrap">
      <div className="meters">
        <div className="meters-column">
          <div className="meters-group-label meters-group-label-lose">Lose if maxed</div>
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
              <span className="meter-bar-remaining">{backlogUsed} of {STAT_MAX}</span>
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
              <span className="meter-bar-remaining">{techDebtUsed} of {STAT_MAX}</span>
            </div>
          </div>

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
              <span className="meter-bar-remaining">{burnoutUsed} of {BURNOUT_MAX}</span>
            </div>
          </div>
        </div>

        <div className="meters-column">
          <div className="meters-group-label meters-group-label-win">Win by either</div>
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
              <span className="meter-bar-remaining">{vestingUsed} of {VESTING_MAX}</span>
            </div>
          </div>

          <div className="meter-bar meter-bar-milestones">
            <span className="meter-bar-label">Milestones</span>
            <div className="milestone-track">
              {segments.map((seg, i) => (
                <div
                  key={i}
                  className={`milestone-segment${seg.complete ? ' milestone-segment-complete' : ''}${
                    i === activeIndex && !seg.complete && seg.pct >= CRITICAL_THRESHOLD
                      ? ' milestone-segment-celebrate'
                      : ''
                  }${milestonesWon ? ' milestone-segment-maxed' : ''}`}
                >
                  <div className="milestone-segment-fill" style={{ width: `${seg.pct}%` }} />
                  {i === activeIndex && !!milestoneFlashKey && (
                    <div key={milestoneFlashKey} className="milestone-segment-flash" />
                  )}
                  {milestoneCheckpointIndex === i && !!milestoneCheckpointKey && (
                    <div key={milestoneCheckpointKey} className="milestone-segment-checkpoint-flash" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Meters

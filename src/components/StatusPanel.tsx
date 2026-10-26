import Meters, { type MetersProps } from './Meters'
import type { PostedSlackMessage } from './SlackPanel'
import './StatusPanel.css'

// A recurring/character effect still in play, flattened from GameBoard's
// RecurringEffect refs into plain data the panel can render — GameBoard snapshots these
// into state at the end of every round (see snapshotEffects there), since the refs
// themselves don't trigger re-renders.
export interface ActiveEffect {
  roundId: string
  side: 'player' | 'manager'
  title: string
  character?: string
  backlog?: number | '*'
  techDebt?: number | '*'
  burnout?: number
  milestones?: number
  /** Turns left on the effect's own clock; undefined runs until eliminated. */
  turnsRemaining?: number
  /** Turns left that a Block has suspended it for; Infinity is the rest of the game. */
  suspendedTurnsRemaining?: number
}

interface StatusPanelProps {
  meters: MetersProps
  effects: ActiveEffect[]
  /** Turns left on the manager's Blur card; 0 means the hand isn't blurred. */
  blurTurnsRemaining: number
  /** Most recent Slack post, shown as a one-line ticker — Slack messages move the
   * meters too, so the panel still surfaces them even without the full chat UI. */
  lastMessage?: PostedSlackMessage
}

function formatDelta(value: number) {
  return value >= 0 ? `+${value}` : `${value}`
}

function turnsLabel(turns: number | undefined) {
  if (turns === undefined || !Number.isFinite(turns)) return 'until stopped'
  return `${turns} turn${turns === 1 ? '' : 's'} left`
}

function deltaChips(e: {
  techDebt?: number | '*'
  backlog?: number | '*'
  burnout?: number
  milestones?: number
}) {
  const chips: { key: string; label: string }[] = []
  const clearable = (v: number | '*' | undefined, name: string, key: string) => {
    if (v === undefined || v === 0) return
    chips.push({ key, label: v === '*' ? `${name} cleared` : `${name} ${formatDelta(v)}` })
  }
  clearable(e.techDebt, 'Tech Debt', 'techdebt')
  clearable(e.backlog, 'Backlog', 'backlog')
  if (e.burnout) chips.push({ key: 'burnout', label: `Burnout ${formatDelta(e.burnout)}` })
  if (e.milestones) chips.push({ key: 'milestone', label: `Milestone ${formatDelta(e.milestones)}%` })
  return chips
}

function EffectRow({ effect }: { effect: ActiveEffect }) {
  const suspended = (effect.suspendedTurnsRemaining ?? 0) > 0
  const chips = deltaChips(effect)
  return (
    <div className={`status-effect status-effect-${effect.side}${suspended ? ' status-effect-suspended' : ''}`}>
      <div className="status-effect-top">
        <span className="status-effect-title">{effect.title}</span>
        <span className="status-effect-turns">
          {suspended ? `Suspended, ${turnsLabel(effect.suspendedTurnsRemaining)}` : turnsLabel(effect.turnsRemaining)}
        </span>
      </div>
      {chips.length > 0 && (
        <div className="status-chips">
          {chips.map((c) => (
            <span key={c.key} className={`status-chip status-chip-${c.key}`}>
              {c.label}
            </span>
          ))}
          <span className="status-chip-note">per turn</span>
        </div>
      )}
    </div>
  )
}

function EffectGroup({ heading, effects }: { heading: string; effects: ActiveEffect[] }) {
  if (effects.length === 0) return null
  return (
    <div className="status-effect-group">
      <div className="status-section-label">{heading}</div>
      {effects.map((e) => (
        <EffectRow key={e.roundId} effect={e} />
      ))}
    </div>
  )
}

function StatusPanel({ meters, effects, blurTurnsRemaining, lastMessage }: StatusPanelProps) {
  const againstYou = effects.filter((e) => e.side === 'manager')
  const forYou = effects.filter((e) => e.side === 'player')
  const blurred = blurTurnsRemaining > 0
  const nothingActive = effects.length === 0 && !blurred

  return (
    <div className="status-panel">
      <div className="status-meters">
        <Meters {...meters} />
      </div>

      <div className="status-effects">
        {blurred && (
          <div className="status-effect status-effect-manager">
            <div className="status-effect-top">
              <span className="status-effect-title">Hand blurred</span>
              <span className="status-effect-turns">{turnsLabel(blurTurnsRemaining)}</span>
            </div>
          </div>
        )}
        <EffectGroup heading="Working against you" effects={againstYou} />
        <EffectGroup heading="Working for you" effects={forYou} />
        {nothingActive && <p className="status-empty">No active effects.</p>}
      </div>

      {lastMessage && (
        <div className="status-ticker">
          <span className="status-ticker-channel">#{lastMessage.channel.toLowerCase()}</span>
          <span className="status-ticker-author">{lastMessage.character}:</span>
          <span className="status-ticker-text">{lastMessage.text}</span>
          {deltaChips(lastMessage).map((c) => (
            <span key={c.key} className={`status-chip status-chip-${c.key}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default StatusPanel

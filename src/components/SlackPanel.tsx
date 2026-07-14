import { useState } from 'react'
import { slackPfp } from '../data/slackChannels'
import './SlackPanel.css'

export interface PostedSlackMessage {
  id: string
  channel: string
  character: string
  text: string
  time: string
  backlog?: number
  techDebt?: number
  burnout?: number
  vesting?: number
}

function formatDelta(value: number) {
  return value >= 0 ? `+${value}` : `${value}`
}

interface SlackPanelProps {
  channels: string[]
  activeChannel: string
  onSelectChannel: (channel: string) => void
  messages: PostedSlackMessage[]
}

function initialsFor(character: string) {
  const initials = character
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

// Deterministic (not random) so the same character always lands on the same color,
// without needing to hand-maintain a color per character name.
function colorFor(character: string) {
  let hash = 0
  for (let i = 0; i < character.length; i++) hash = character.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

// Renders the character's profile picture if one exists at the expected filename
// (see slackPfp), falling back to a colored initials badge otherwise — so dropping in
// art for a character is a drop-in swap, not something the rest of the UI depends on.
function SlackAvatar({ character }: { character: string }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (imageFailed) {
    return (
      <div className="slack-avatar" style={{ background: colorFor(character) }}>
        {initialsFor(character)}
      </div>
    )
  }

  return (
    <img
      className="slack-avatar slack-avatar-img"
      src={slackPfp(character)}
      alt={character}
      onError={() => setImageFailed(true)}
    />
  )
}

function SlackPanel({ channels, activeChannel, onSelectChannel, messages }: SlackPanelProps) {
  // Newest last (chronological) in the array, but rendered oldest-last so the
  // column-reverse flex flow (see SlackPanel.css) keeps the view pinned to the
  // newest message without any manual scroll-to-bottom logic.
  const channelMessages = messages.filter((m) => m.channel === activeChannel).reverse()

  return (
    <div className="slack-panel">
      <div className="slack-sidebar">
        <div className="slack-workspace-name">Widget Corp</div>
        <div className="slack-channel-list">
          {channels.map((channel) => (
            <div
              key={channel}
              role="button"
              tabIndex={0}
              onClick={() => onSelectChannel(channel)}
              className={`slack-channel${channel === activeChannel ? ' slack-channel-active' : ''}`}
            >
              <span className="slack-channel-hash">#</span>
              {channel.toLowerCase()}
            </div>
          ))}
        </div>
      </div>

      <div className="slack-main">
        <div className="slack-header">
          <span className="slack-header-hash">#</span>
          <span className="slack-header-name">{activeChannel.toLowerCase()}</span>
        </div>

        <div className="slack-messages">
          {channelMessages.length === 0 ? (
            <p className="slack-messages-empty">No messages yet.</p>
          ) : (
            channelMessages.map((msg) => (
              <div className="slack-message" key={msg.id}>
                <SlackAvatar character={msg.character} />
                <div className="slack-message-body">
                  <div className="slack-message-top">
                    <span className="slack-message-author">{msg.character}</span>
                    <span className="slack-message-time">{msg.time}</span>
                  </div>
                  <p className="slack-message-text">{msg.text}</p>
                  {(msg.techDebt !== undefined ||
                    msg.backlog !== undefined ||
                    msg.burnout !== undefined ||
                    msg.vesting !== undefined) && (
                    <div className="slack-message-badges">
                      {msg.techDebt !== undefined && (
                        <span className="slack-badge slack-badge-techdebt">Tech Debt {formatDelta(msg.techDebt)}</span>
                      )}
                      {msg.backlog !== undefined && (
                        <span className="slack-badge slack-badge-backlog">Backlog {formatDelta(msg.backlog)}</span>
                      )}
                      {msg.burnout !== undefined && (
                        <span className="slack-badge slack-badge-burnout">Burnout {formatDelta(msg.burnout)}</span>
                      )}
                      {msg.vesting !== undefined && (
                        <span className="slack-badge slack-badge-vesting">Vesting {formatDelta(msg.vesting)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="slack-composer">
          <span className="slack-composer-placeholder">Message #{activeChannel.toLowerCase()}</span>
        </div>
      </div>
    </div>
  )
}

export default SlackPanel

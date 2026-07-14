import type { SlackChannelItemJson, SlackConversationJson } from './slackMessages/schema'

// Every .json file in slackMessages is one channel's list of flavor messages — drop a
// new file in there and its channel shows up automatically (the filename, capitalized,
// is the channel name).
const modules = import.meta.glob<SlackChannelItemJson[]>('./slackMessages/*.json', {
  eager: true,
  import: 'default',
})

export const slackChannels: Record<string, SlackChannelItemJson[]> = Object.fromEntries(
  Object.entries(modules).map(([path, messages]) => {
    const id = path.split('/').pop()!.replace(/\.json$/, '')
    const channel = id.charAt(0).toUpperCase() + id.slice(1)
    return [channel, messages]
  }),
)

// Fixed sidebar order — kept separate from slackChannels's keys since glob discovery
// order isn't guaranteed to match the order channels should read top-to-bottom.
export const CHANNEL_ORDER = ['Management', 'Engineering', 'Marketing', 'Misc']

// A message's `character` field (e.g. "CMO") maps to this filename convention —
// drop the matching image in public/slack-pfps/ and it shows up automatically.
export function slackPfp(character: string) {
  const slug = character.trim().toLowerCase().replace(/\s+/g, '-')
  return `/slack-pfps/slack-pfp-${slug}.png`
}

export function isSlackConversation(item: SlackChannelItemJson): item is SlackConversationJson {
  return 'conversation' in item && item.conversation === true
}

export interface SlackItemRef {
  /** Stable within a session (channel + its position in that channel's JSON array) —
   * used to track which items have already been posted so they never repeat. */
  key: string
  channel: string
  item: SlackChannelItemJson
}

// Every message and conversation across every channel, flattened for random
// selection — see pickSlackItem in GameBoard.tsx, which filters this against the
// set of keys already used this game.
export function allSlackItems(): SlackItemRef[] {
  return CHANNEL_ORDER.flatMap((channel) =>
    (slackChannels[channel] ?? []).map((item, index) => ({ key: `${channel}:${index}`, channel, item })),
  )
}

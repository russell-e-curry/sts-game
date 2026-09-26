export interface SlackMessageJson {
  /** Who "wrote" this message, e.g. "CMO" — the profile picture is looked up from
   * this name (see slackPfp in slackChannels.ts), at public/slack-pfps/slack-pfp-<name, lowercased and hyphenated>.webp. */
  character: string
  /** The message text as it appears in the channel. */
  text: string
  /** Signed delta applied to backlog when this message is posted. Omit if it doesn't touch it. */
  backlog?: number
  /** Signed delta applied to technical debt when this message is posted. Omit if it doesn't touch it. */
  techDebt?: number
  /** Signed delta applied to burnout when this message is posted (positive = more burnout). Omit if it doesn't touch it. */
  burnout?: number
  /** Signed percentage delta (e.g. 25 = 25%) applied toward the current milestone when this message is posted — see CardJson's `milestones` for how the percentage is applied. Not available on a conversation's individual messages (see SlackConversationJson) — conversations are flavor color and only ever touch Backlog/Tech Debt/Burnout. Omit if it doesn't touch it. */
  milestones?: number
}

// A message within a conversation (see SlackConversationJson below) — same as
// SlackMessageJson minus `milestones`, since a conversation should never move the
// Milestones meter.
export type SlackConversationMessageJson = Omit<SlackMessageJson, 'milestones'>

// A conversation is a back-and-forth of several messages that plays out on its own
// timer (1-10s apart) once picked, instead of posting all at once like a single
// message — see the round-resolution effect in GameBoard.tsx.
export interface SlackConversationJson {
  conversation: true
  messages: SlackConversationMessageJson[]
}

export type SlackChannelItemJson = SlackMessageJson | SlackConversationJson

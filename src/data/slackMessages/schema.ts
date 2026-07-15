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
  /** Signed percentage delta applied to vesting when this message is posted. Omit if it doesn't touch it. */
  vesting?: number
}

// A conversation is a back-and-forth of several messages that plays out on its own
// timer (1-10s apart) once picked, instead of posting all at once like a single
// message — see the round-resolution effect in GameBoard.tsx.
export interface SlackConversationJson {
  conversation: true
  messages: SlackMessageJson[]
}

export type SlackChannelItemJson = SlackMessageJson | SlackConversationJson

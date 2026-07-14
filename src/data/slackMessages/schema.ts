export interface SlackMessageJson {
  /** Who "wrote" this message, e.g. "CMO" — the profile picture is looked up from
   * this name (see slackPfp in slackChannels.ts), at public/slack-pfps/slack-pfp-<name, lowercased and hyphenated>.png. */
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

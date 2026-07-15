export interface CardJson {
  title: string
  /** Thematic category, e.g. "meeting", "coding", "management", "hiring". Displayed on the card face. */
  type: string
  /** What kind of effect this card has. Displayed on the card face, next to the type. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset'
  description: string
  /** Signed delta applied to the player's backlog, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  backlog?: number | '*'
  /** Signed delta applied to technical debt, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  technicalDebt?: number | '*'
  /** Signed delta applied to burnout (positive = more burnout). Omit if this card doesn't touch it. */
  burnout?: number
  /** Signed percentage delta applied to vesting. Omit if this card doesn't touch it. */
  vesting?: number
  /** Number of copies of this card included in the deck. Defaults to 1 if omitted. */
  count?: number
}

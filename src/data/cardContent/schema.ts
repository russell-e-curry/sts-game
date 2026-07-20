export type CardCategory = 'management' | 'coding' | 'wellness' | 'meetings' | 'options'

export interface CardJson {
  title: string
  /** Thematic category. Displayed on the card face. */
  category: CardCategory
  /** What kind of effect this card has. Displayed on the card face, next to the category. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset' | 'cancel' | 'character'
  description: string
  /** Who this card is attributed to, e.g. "CMO". Omit if the card has no specific character tied to it. */
  character?: string
  /** Signed delta applied to the player's backlog, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  backlog?: number | '*'
  /** Signed delta applied to technical debt, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  techDebt?: number | '*'
  /** Signed delta applied to burnout (positive = more burnout). Omit if this card doesn't touch it. */
  burnout?: number
  /** Signed percentage delta applied to vesting. Omit if this card doesn't touch it. */
  vesting?: number
  /** A secondary effect this card applies alongside its stat deltas, e.g. "block recurring" — combined with `target` and `duration`. Omit if this card has no secondary effect. */
  effect?: string
  /** Which recurring card category `effect` applies to, or '*' for every category. For an `action: 'eliminate'` card, `'character'` instead means it eliminates the opposing side's most recently played `character` card, and `'character:{name}'` means it eliminates that specific character's card (matched case-insensitively) wherever it stands among the opposing side's played cards (rather than matching a recurring effect by this card's own `category`). Omit if this card has no secondary effect and isn't an eliminate-character card. */
  target?: string
  /** Number of turns `effect` lasts. Omit for the rest of the game rather than a fixed number of turns. */
  duration?: number
  /** Number of copies of this card included in the deck. Defaults to 1 if omitted. */
  count?: number
}

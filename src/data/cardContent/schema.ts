export type CardCategory = 'management' | 'coding' | 'wellness' | 'meetings' | 'options'

export interface CardJson {
  title: string
  /** Thematic category. Displayed on the card face. */
  category: CardCategory
  /** What kind of effect this card has. Drives the card's actual gameplay behavior. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset' | 'cancel' | 'character'
  /** Purely cosmetic label displayed on the card face (next to the category) in place of `action` — has no effect on gameplay. Omit to fall back to `action`. */
  type?: string
  description: string
  /** Who this card is attributed to, e.g. "CMO". Omit if the card has no specific character tied to it. */
  character?: string
  /** Signed delta applied to the player's backlog, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  backlog?: number | '*'
  /** Signed delta applied to technical debt, or '*' to clear it to 0. Omit if this card doesn't touch it. */
  techDebt?: number | '*'
  /** Signed delta applied to burnout (positive = more burnout). Omit if this card doesn't touch it. */
  burnout?: number
  /** Signed point delta applied to vesting (max 100). Displayed on the card face as points, not a percentage. Omit if this card doesn't touch it. */
  vesting?: number
  /** A secondary effect this card applies alongside its stat deltas, e.g. "block recurring" — combined with `target` and `duration`. Omit if this card has no secondary effect. */
  effect?: string
  /** Which recurring card category `effect` applies to, or '*' for every category. For an `action: 'eliminate'` card, `'character'` instead means it eliminates the opposing side's most recently played `character` card, and `'character:{name}'` means it eliminates that specific character's card (matched case-insensitively) wherever it stands among the opposing side's played cards (rather than matching a recurring effect by this card's own `category`). For an `action: 'reset'` card, `target` instead names the single stat ('techDebt' or 'backlog') it clears to 0 — displayed on the card face as a silver "Reset {Stat}" badge instead of the default gold "Reset Tech Debt & Backlog" badge. Omit `target` on a reset card to clear both stats at once (the default). Omit entirely if this card has no secondary effect and isn't an eliminate-character or targeted-reset card. */
  target?: string
  /** Number of turns `effect` lasts. Omit for the rest of the game rather than a fixed number of turns. */
  duration?: number
  /** Number of copies of this card included in the deck. Defaults to 1 if omitted. */
  count?: number
}

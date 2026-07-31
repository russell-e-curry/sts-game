export type CardCategory = 'Management' | 'Coding' | 'Wellness' | 'Meetings' | 'Options'

// What a card's secondary `effect`/`action` (Eliminate, Reset, Block Recurring) acts on.
// A single discriminated union rather than three separate fields because only one of
// these is ever relevant for a given card — which variant applies is determined by the
// card's own `action`/`effect`, not by `target` itself:
//  - `action: 'Eliminate'` reads a `character` target: 'Last' un-reveals the opposing
//    side's most recently played `character`-action card, 'All' takes down every
//    still-standing one, and 'Named' takes down the specific one matching `name`
//    (case-insensitive) wherever it sits in the play order. Omitting `target` entirely
//    instead eliminates by matching `category` against an opposing recurring effect.
//  - `action: 'Reset'` reads a `stat` target naming the single stat ('Tech Debt' or
//    'Backlog') to clear to 0. Omitting `target` clears both.
//  - `effect: 'Block Recurring'` reads a `category` target: '*' suspends every category,
//    otherwise only the named one.
export type CardTarget =
  | { kind: 'Character'; selector: 'Last' }
  | { kind: 'Character'; selector: 'All' }
  | { kind: 'Character'; selector: 'Named'; name: string }
  | { kind: 'Stat'; stat: 'Tech Debt' | 'Backlog' }
  | { kind: 'Category'; category: CardCategory | '*' }

export interface CardJson {
  title: string
  /** Thematic category. Displayed on the card face. */
  category: CardCategory
  /** What kind of effect this card has. Drives the card's actual gameplay behavior. */
  action: 'One Time' | 'Recurring' | 'Reversal' | 'Eliminate' | 'Reset' | 'Cancel' | 'Character' | 'Blur'
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
  /** A secondary effect this card applies alongside its stat deltas, e.g. "Block Recurring" — combined with `target` and `duration`. Omit if this card has no secondary effect. */
  effect?: string
  /** See CardTarget. Which recurring card category `effect` applies to (`{ kind: 'Category' }`), which character(s) an `action: 'Eliminate'` card takes down (`{ kind: 'Character' }`), or which single stat an `action: 'Reset'` card clears (`{ kind: 'Stat' }`) — omit `target` on a reset card to clear both stats, or on an eliminate card to eliminate by matching `category` against a recurring effect instead. Omit entirely if this card has no secondary effect and isn't an eliminate-character or targeted-reset card. */
  target?: CardTarget
  /** Number of turns `effect` lasts — also read by a manager `action: 'Blur'` card (which has no `effect`) for how many turns it blurs the player's hand and the shared dropzone/history. Omit for the rest of the game rather than a fixed number of turns. */
  duration?: number
  /** Number of copies of this card included in the deck. Defaults to 1 if omitted. */
  count?: number
  /** Which manager card `category` values this (player) card can be played against — '*' allows any category. Omit to default to only its own `category`. */
  playableAgainst?: (CardCategory | '*')[]
}

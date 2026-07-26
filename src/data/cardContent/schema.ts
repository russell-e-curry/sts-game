export type CardCategory = 'Management' | 'coding' | 'wellness' | 'meetings' | 'options'

// What a card's secondary `effect`/`action` (eliminate, reset, block recurring) acts on.
// A single discriminated union rather than three separate fields because only one of
// these is ever relevant for a given card — which variant applies is determined by the
// card's own `action`/`effect`, not by `target` itself:
//  - `action: 'eliminate'` reads a `character` target: 'last' un-reveals the opposing
//    side's most recently played `character`-action card, 'all' takes down every
//    still-standing one, and 'named' takes down the specific one matching `name`
//    (case-insensitive) wherever it sits in the play order. Omitting `target` entirely
//    instead eliminates by matching `category` against an opposing recurring effect.
//  - `action: 'reset'` reads a `stat` target naming the single stat ('techDebt' or
//    'backlog') to clear to 0. Omitting `target` clears both.
//  - `effect: 'block recurring'` reads a `category` target: '*' suspends every category,
//    otherwise only the named one.
export type CardTarget =
  | { kind: 'character'; selector: 'last' }
  | { kind: 'character'; selector: 'all' }
  | { kind: 'character'; selector: 'named'; name: string }
  | { kind: 'stat'; stat: 'techDebt' | 'backlog' }
  | { kind: 'category'; category: CardCategory | '*' }

export interface CardJson {
  title: string
  /** Thematic category. Displayed on the card face. */
  category: CardCategory
  /** What kind of effect this card has. Drives the card's actual gameplay behavior. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset' | 'cancel' | 'character' | 'blur'
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
  /** See CardTarget. Which recurring card category `effect` applies to (`{ kind: 'category' }`), which character(s) an `action: 'eliminate'` card takes down (`{ kind: 'character' }`), or which single stat an `action: 'reset'` card clears (`{ kind: 'stat' }`) — omit `target` on a reset card to clear both stats, or on an eliminate card to eliminate by matching `category` against a recurring effect instead. Omit entirely if this card has no secondary effect and isn't an eliminate-character or targeted-reset card. */
  target?: CardTarget
  /** Number of turns `effect` lasts — also read by a manager `action: 'blur'` card (which has no `effect`) for how many turns it blurs the player's hand and the shared dropzone/history. Omit for the rest of the game rather than a fixed number of turns. */
  duration?: number
  /** Number of copies of this card included in the deck. Defaults to 1 if omitted. */
  count?: number
  /** Which manager card `category` values this (player) card can be played against — '*' allows any category. Omit to default to only its own `category`. */
  playableAgainst?: (CardCategory | '*')[]
}

import type { CardCategory } from './data/cardContent/schema'

interface CardBase {
  id: string
  title: string
  /** Thematic category. Displayed on the card face. */
  category: CardCategory
  /** What kind of effect this card has. Drives the card's actual gameplay behavior. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset' | 'cancel' | 'character'
  /** Purely cosmetic label displayed on the card face (next to the category) in place of `action` — has no effect on gameplay. Always populated by the loaders in data/cards.ts and data/managerCards.ts, falling back to `action` when the JSON omits it. */
  type: string
  description: string
  /** Who this card is attributed to, e.g. "CMO". Omitted if the card has no specific character tied to it. */
  character?: string
  /** Derived from the card's filename; the file may not exist yet if no art has been made. */
  image: string
  /** Signed delta applied to the player's backlog, or '*' to clear it to 0. Omitted if this card doesn't touch it. */
  backlog?: number | '*'
  /** Signed delta applied to technical debt when this card resolves, or '*' to clear it to 0. Omitted if this card doesn't touch it. */
  techDebt?: number | '*'
  /** Signed delta applied to burnout when this card resolves (positive = more burnout). Omitted if this card doesn't touch it. */
  burnout?: number
  /** Signed point delta applied to vesting when this card resolves (max 100). Displayed on the card face as points, not a percentage. Omitted if this card doesn't touch it. */
  vesting?: number
  /** A secondary effect this card applies alongside its stat deltas, e.g. "block recurring" — combined with `target` and `duration`. Omitted if this card has no secondary effect. */
  effect?: string
  /** Which recurring card category `effect` applies to, or '*' for every category. For an `action: 'eliminate'` card, `'character'` instead means it eliminates the opposing side's most recently played `character` card, and `'character:{name}'` means it eliminates that specific character's card (matched case-insensitively) wherever it stands among the opposing side's played cards. For an `action: 'reset'` card, `target` instead names the single stat ('techDebt' or 'backlog') it clears to 0 — omitted clears both stats at once. Omitted if this card has no secondary effect and isn't an eliminate-character or targeted-reset card. */
  target?: string
  /** Number of turns `effect` lasts. Omitted for the rest of the game rather than a fixed number of turns. */
  duration?: number
}

// `side` is a discriminant so a PlayerCard can never be typed as (or passed where
// the compiler expects) a ManagerCard, and vice versa — the player's hand only ever
// holds PlayerCard[], the manager's only ever holds ManagerCard[].
export interface PlayerCard extends CardBase {
  side: 'player'
}

export interface ManagerCard extends CardBase {
  side: 'manager'
}

export type GameCard = PlayerCard | ManagerCard

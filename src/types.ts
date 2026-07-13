interface CardBase {
  id: string
  title: string
  /** Thematic category, e.g. "meeting", "coding", "management", "hiring". Displayed on the card face. */
  type: string
  /** What kind of effect this card has. Displayed on the card face, next to the type. */
  action: 'one time' | 'recurring' | 'reversal' | 'eliminate' | 'reset'
  description: string
  /** Derived from the card's filename; the file may not exist yet if no art has been made. */
  image: string
  /** Signed delta applied to the player's backlog, or '*' to clear it to 0. Omitted if this card doesn't touch it. */
  backlog?: number | '*'
  /** Signed delta applied to technical debt when this card resolves, or '*' to clear it to 0. Omitted if this card doesn't touch it. */
  technicalDebt?: number | '*'
  /** Signed delta applied to burnout when this card resolves (positive = more burnout). Omitted if this card doesn't touch it. */
  burnout?: number
  /** Signed percentage delta applied to vesting when this card resolves. Omitted if this card doesn't touch it. */
  vesting?: number
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

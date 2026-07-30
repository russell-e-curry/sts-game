import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { ManagerCard, PlayerCard } from '../types'
import type { CardTarget } from '../data/cardContent/schema'
import { sampleHand } from '../data/cards'
import { sampleManagerCards } from '../data/managerCards'
import { shuffle } from '../lib/shuffle'
import { playSound, getSoundDurationMs } from '../lib/sounds'
import Deck from './Deck'
import ManagerHand from './ManagerHand'
import Meters from './Meters'
import BattleArea, { type ResolvedRound } from './BattleArea'
import Hand from './Hand'
import Card from './Card'
import DiscardZone from './DiscardZone'
import DisintegrateEffect from './DisintegrateEffect'
import SlackPanel, { type PostedSlackMessage } from './SlackPanel'
import SplashScreen from './SplashScreen'
import GameOverScreen from './GameOverScreen'
import { allSlackItems, isSlackConversation, CHANNEL_ORDER } from '../data/slackChannels'
import type { SlackMessageJson } from '../data/slackMessages/schema'
import './GameBoard.css'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface Flight {
  key: number
  card: ManagerCard
  source: Rect
  dest: Rect
  flipped: boolean
  arrived: boolean
}

interface PlayerFlight {
  key: number
  card: PlayerCard
  slotIndex: number
  source: Rect
  dest: Rect
  flipped: boolean
  arrived: boolean
}

interface DiscardEffect {
  key: number
  card: PlayerCard
  rect: Rect
}

interface ManagerDrawFlight {
  key: number
  slotId: string
  source: Rect
  dest: Rect
  arrived: boolean
  /** How long the flight's slide takes, matching mc-action-draw-card's actual
   * playback length (see the ref below) so the animation doesn't finish well before
   * or after its sound. */
  durationMs: number
}

// Max number of slots either hand can ever have — how many the opening deal fills
// at its widest, and how many ids MANAGER_SLOT_IDS below provides. The resize-sync
// effect in GameBoard shrinks/grows each hand's actual rendered slot count to
// match visibleHandCards (see HAND_CARD_BREAKPOINTS below, which tops out here
// too), so this is a ceiling rather than a fixed size.
const HAND_SIZE = 5
const MANAGER_SLOT_IDS = Array.from({ length: HAND_SIZE }, (_, i) => `m${i}`)
// Matches .card-flight's CSS transition duration — used until mc-action-draw-card's
// actual length loads (see the ref below), and again if it never does.
const MANAGER_DRAW_DEFAULT_DURATION_MS = 450
// Same idea, for how long to let pc-action-flip-card play before starting
// pc-action-draw-card after it, so the two don't overlap.
const PLAYER_FLIP_DEFAULT_DURATION_MS = 450
// Gap between the card's flip animation starting and its flip sound actually
// playing, so the two read as sound-following-motion rather than simultaneous.
const PLAYER_FLIP_SOUND_DELAY_MS = 200
// Matches .disintegrate-card's CSS animation duration (see DisintegrateEffect.css) —
// how long a discarded card dissolves before its replacement starts drawing in.
const DISCARD_DISINTEGRATE_DURATION_MS = 650
// Gap between one meter's flash+sound landing and the next meter's turn starting in
// the round-resolve cascade below — long enough for .meter-bar-fill's own 0.5s width
// transition to finish before the next bar starts moving.
const METER_STEP_DELAY_MS = 550
// Gap between one maxed-out meter's glow+ding landing and the next one's turn starting
// in the game-over glow cascade (see runLossSequence) — used until
// gm-action-meter-full's actual length loads (see the ref below), and again if it
// never does.
const METER_FULL_DEFAULT_DURATION_MS = 900
// Same idea as METER_FULL_DEFAULT_DURATION_MS, but for gm-action-vesting-full's length
// — used to time the win sequence's own hold (see runWinSequence) until that sound's
// actual duration loads.
const VESTING_FULL_DEFAULT_DURATION_MS = 900
const STARTING_BURNOUT = 0
const STAT_MAX = 500
const BURNOUT_MAX = 1000
const VESTING_MAX = 100
const VESTING_PER_TURN = 1
// The player's first discard in a round costs this much Burnout; each further
// discard that same round doubles it (5, 10, 20, ...) — see discardStreak.
const DISCARD_BASE_BURNOUT_COST = 5
// These match .game-board/.row-top/.row-middle/.row-bottom's gap/padding in
// GameBoard.css — read by the cardScale effect below to figure out how much width
// each row actually has once the board's own gaps/padding are accounted for, and how
// much of that a row's non-card element (meters/Slack/discard) needs reserved.
const ROW_ITEM_GAP = 20
const METERS_MIN_WIDTH = 320 // reserved for .hud-panel in row-top, alongside the manager's deck+hand
const HISTORY_MIN_WIDTH = 260 // reserved for .history-panel in row-middle, alongside the dropzone and Slack
const SLACK_MIN_WIDTH = 260 // reserved for .slack-panel in row-middle, matching its own CSS min-width
const BOARD_ROW_GAP = 20
const BOARD_PADDING = 20
// The rest of these match the fixed chrome around row 2's stacked cards (see
// BattleArea.css) — read by the same effect to compute its exact natural height
// arithmetically, rather than by measuring already-rendered elements whose own size
// is what's in question (see that effect's comment for why).
const BATTLE_SLOT_GAP = 12 // .active-column/.battle-column-history's gap, between the two stacked cards
const HISTORY_PANEL_PADDING_TOP = 8
const HISTORY_PANEL_PADDING_BOTTOM = 24 // extra bottom padding for the history scrollbar's gutter
const BOTTOM_BAR_PADDING = 16 // .bottom-bar's padding-bottom, extra clearance below the player's hand
// Reserved height below each hand row for its horizontal scrollbar (see
// HAND_CARD_BREAKPOINTS below) — matches the thin scrollbar's height in
// Hand.css/ManagerHand.css so the scrollbar sits in this gutter rather than
// eating into the card's own height. Reserved unconditionally (even at the widest
// breakpoint, where nothing overflows and no scrollbar actually renders) so a row's
// height doesn't jump when the window crosses a breakpoint and starts/stops
// overflowing.
const HAND_SCROLLBAR_GUTTER = 10
// How many hand cards are visible without scrolling (the rest reachable by
// scrolling — see .hand/.manager-hand's overflow-x in Hand.css/ManagerHand.css) at
// a given viewport width. Widths are picked off common device breakpoints: 1600 is
// roughly where 1080p+ desktop monitors have room for all 5 cards at a readable
// size; 1280 covers typical laptops (1366x768 and up, minus browser chrome); 1024
// covers iPad landscape and small laptops; below 768 (iPad portrait and phones)
// floors out at 2 so cards never shrink past legibility — scrolling handles the
// rest of the hand from there down instead of cards getting smaller still.
const HAND_CARD_BREAKPOINTS: [minWidth: number, cards: number][] = [
  [1600, 5],
  [1280, 4],
  [1024, 3],
  [768, 2],
]
const MIN_VISIBLE_HAND_CARDS = 2

function visibleHandCardsForWidth(width: number) {
  for (const [minWidth, cards] of HAND_CARD_BREAKPOINTS) {
    if (width >= minWidth) return cards
  }
  return MIN_VISIBLE_HAND_CARDS
}

// Backlog/technical debt deltas are normally additive, but any contributing card can
// instead carry '*' to wipe the stat to 0 outright (e.g. a reorg clearing the
// backlog) — that overrides every other delta that round.
function applyClearableDelta(prev: number, deltas: (number | '*' | undefined)[]) {
  if (deltas.some((d) => d === '*')) return 0
  const total = deltas.reduce<number>((sum, d) => sum + (typeof d === 'number' ? d : 0), 0)
  return Math.min(STAT_MAX, Math.max(0, prev + total))
}

function sumDeltas(deltas: (number | undefined)[]) {
  return deltas.reduce<number>((sum, d) => sum + (d ?? 0), 0)
}

// Whether a round's contributing deltas would actually move a stat at all — used to
// decide which meters get a flash+sound in the round-resolve effect below, so a
// meter no card touched this round stays quiet instead of flashing for a no-op.
function hasNonZeroDelta(deltas: (number | '*' | undefined)[]) {
  return deltas.some((d) => d === '*' || (typeof d === 'number' && d !== 0))
}

interface RecurringEffect {
  roundId: string
  side: 'player' | 'manager'
  category: string
  // Which character (if any) this recurring card is attributed to — an 'eliminate' +
  // target:'character' card takes down every not-yet-stopped recurring effect that
  // matches the character it eliminates, alongside that character's own card (see
  // findEliminatedCharacterRoundIds).
  character?: string
  backlog?: number | '*'
  techDebt?: number | '*'
  burnout?: number
  vesting?: number
  // Set once an 'eliminate' card of the same type (or an eliminated character it's
  // attributed to) stops it — a stopped effect stays in the list (so the battle
  // history can still point at the round it came from, for the STOPPED/ELIMINATED
  // overlay) but is excluded from every future delta calculation.
  stopped: boolean
  // Turns left that a 'block recurring' effect has suspended this effect for — set
  // (and reset) whenever a matching block card is played against it, ticked down by
  // one at the end of every round, and excluded from delta calculations while > 0.
  // A card with no `duration` blocks for the rest of the game, represented here as
  // Infinity so it decrements forever without ever reaching 0 on its own. Unlike
  // `stopped`, this can also lapse on its own rather than lasting until eliminated.
  suspendedTurnsRemaining?: number
  // roundId of the card whose 'block recurring' effect suspended this — lets an
  // 'eliminate' + target:'character' card find and lift exactly the suspensions that
  // character caused (see findEliminatedCharacterRoundIds) without touching unrelated blocks.
  suspendedBy?: string
}

function GameBoard() {
  // Shuffled once per mount (game start) so replays don't draw the same cards
  // in the same order every time.
  const managerDeck = useRef(shuffle(sampleManagerCards)).current
  // The rest of the shuffled deck beyond the starting hand feeds playerDrawPile below,
  // so every card is still reachable — just not all dealt into hand at once.
  const playerCardOrder = useRef(shuffle(sampleHand)).current
  // Both hands start empty — the opening-deal effect below animates all twelve cards
  // (six manager, six player) into their slots once the splash screen is dismissed.
  // Sized to however many slots are visible at the starting viewport width (see
  // visibleHandCards below) rather than the max HAND_SIZE, so a narrow starting
  // window doesn't deal cards into slots that immediately get removed again by the
  // resize-sync effect further down.
  const [hand, setHand] = useState<(PlayerCard | null)[]>(() =>
    Array(visibleHandCardsForWidth(window.innerWidth)).fill(null),
  )
  // Tracks the actual card sitting in each manager slot (index-matched to
  // MANAGER_SLOT_IDS) so the round-start effect can pick the most damaging card in
  // hand to play, rather than always drawing from the same slot.
  const [managerHand, setManagerHand] = useState<(ManagerCard | null)[]>(() =>
    Array(visibleHandCardsForWidth(window.innerWidth)).fill(null),
  )
  const [usedManagerIds, setUsedManagerIds] = useState<Set<string>>(
    () => new Set(MANAGER_SLOT_IDS.slice(0, visibleHandCardsForWidth(window.innerWidth))),
  )
  // Flips true once the opening deal finishes, gating the manager's first round-start
  // play so it can't fly a card out of a hand slot that hasn't been dealt into yet.
  const [dealt, setDealt] = useState(false)
  const [hiddenHandId, setHiddenHandId] = useState<string | null>(null)
  const [history, setHistory] = useState<ResolvedRound[]>([])
  const [activePlayerCard, setActivePlayerCard] = useState<PlayerCard | null>(null)
  const [activeManagerCard, setActiveManagerCard] = useState<ManagerCard | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [playerFlight, setPlayerFlight] = useState<PlayerFlight | null>(null)
  const [managerDrawFlight, setManagerDrawFlight] = useState<ManagerDrawFlight | null>(null)
  const [discardEffect, setDiscardEffect] = useState<DiscardEffect | null>(null)
  // Briefly shown in the active column's player slot when a locked card is dropped
  // there — cleared by lockMessageTimer below after a few seconds.
  const [lockMessage, setLockMessage] = useState<string | null>(null)
  // Turns left that a manager 'action: blur' card has blurred the player's hand and
  // the shared dropzone/history for — Infinity blurs for the rest of the game. 0
  // means not blurred. Ticks down alongside recurring suspensions in the same
  // round-resolve step (see the suspendedTurnsRemaining decrement loop).
  const [blurTurnsRemaining, setBlurTurnsRemaining] = useState(0)
  const [backlog, setBacklog] = useState(0)
  const [techDebt, setTechDebt] = useState(0)
  const [burnout, setBurnout] = useState(STARTING_BURNOUT)
  const [vesting, setVesting] = useState(0)
  // How many cards the player has discarded so far this round — the next discard's
  // Burnout cost is DISCARD_BASE_BURNOUT_COST doubled once per prior discard (5, 10,
  // 20, ...), so idly cycling the hand gets punishing fast. Reset to 0 whenever a new
  // round starts (see the roundKey effect below).
  const [discardStreak, setDiscardStreak] = useState(0)
  // Bumped independently for whichever meter just updated (see the round-resolve
  // effect below, which flashes/updates the four one at a time) — passed to Meters as
  // a remount key for that meter's flash overlay (see meter-bar-flash in Meters.css)
  // so only the meter that actually changed this round flashes.
  const [backlogFlashKey, setBacklogFlashKey] = useState(0)
  const [techDebtFlashKey, setTechDebtFlashKey] = useState(0)
  const [burnoutFlashKey, setBurnoutFlashKey] = useState(0)
  const [vestingFlashKey, setVestingFlashKey] = useState(0)
  // Flipped true one at a time, in order, by runLossSequence once a danger stat has
  // actually maxed out — holds each meter in its bright game-over glow (see
  // meter-bar-fill-maxed in Meters.css) through the rest of the sequence and into the
  // game-over fade-in.
  const [backlogMaxed, setBacklogMaxed] = useState(false)
  const [techDebtMaxed, setTechDebtMaxed] = useState(false)
  const [burnoutMaxed, setBurnoutMaxed] = useState(false)
  // Same idea as the danger-stat Maxed flags above, but for a win — flipped true by
  // runWinSequence once vesting hits 100%, so the vesting meter gets the same bright
  // glow through the win sequence and into the game-over fade-in.
  const [vestingMaxed, setVestingMaxed] = useState(false)
  const [roundKey, setRoundKey] = useState(0)
  // Which side plays first this round — the round-start effect only auto-plays the
  // manager's card while this is 'manager'; while it's 'player', that effect no-ops
  // and waits for the player to drop a card into the (otherwise empty) active slot
  // instead (see handleDropCard's `leading` case), after which the manager
  // auto-responds (see the effect right after the round-start one). Flipped every
  // round alongside roundKey (see the meter cascade's final step) so the two sides
  // strictly alternate who leads.
  const [leader, setLeader] = useState<'manager' | 'player'>('manager')
  // True from the moment the player leads a round (drops the opening card into the
  // otherwise-empty active slot, see handleDropCard's `leading` case) until the round
  // actually advances — `leader` itself doesn't flip until well after the cards clear
  // back to null (see the meter cascade's final step), so without this the "Your
  // Turn" placeholder would flash back on during that gap, between the round
  // resolving and the manager's slot switching over to "Manager's Turn".
  const [playerHasLed, setPlayerHasLed] = useState(false)
  // Set once backlog/technical debt/burnout hits its cap (lose) or vesting hits 100%
  // (win) — see the effect below. Also gates the round-start effect so the manager
  // stops playing cards once the game has ended.
  const [gameOver, setGameOver] = useState<'win' | 'lose' | null>(null)
  // Gates the round-start effect below so the manager doesn't play its opening card
  // until the player has dismissed the splash screen.
  const [gameStarted, setGameStarted] = useState(false)
  // Bumped by startNewGame (see below) so the opening-deal effect re-runs on a replay
  // even though gameStarted itself never flips back to false — it stays true the whole
  // time so the main splash screen doesn't reappear after a win/loss.
  const [gameKey, setGameKey] = useState(0)
  // Gates the opening-deal effect below so it can't fire before the window has
  // finished loading (fonts, images, etc.) — starting it too early risks the very
  // first flight's source/dest rects being measured mid-layout-shift, which reads as
  // that card skipping its flight and just appearing already in the hand/manager row.
  const [pageLoaded, setPageLoaded] = useState(() => document.readyState === 'complete')
  // Explicit pixel heights for the board's three rows (see .row-top/.row-middle/
  // .row-bottom in GameBoard.css), set by the ResizeObserver effect below. Can't leave
  // these as CSS `fr`/`auto` tracks: row-top's only other occupant is .hud (no fixed
  // card-shaped size of its own) while row-bottom's is .discard-column (which does
  // have one), so the two rows' intrinsic-sizing inputs aren't actually symmetric even
  // though both are meant to fit one card — confirmed directly in devtools (back when
  // this was still a CSS Grid) as the manager and player rows resolving to visibly
  // different heights under `1fr 2fr 1fr`. Computing each row's height arithmetically
  // from a single shared card-size formula (rather than measuring whatever CSS
  // happened to resolve) guarantees the manager and player cards themselves always
  // match — row-bottom is taller only because .bottom-bar adds its own padding-bottom
  // below the (same-size) player card, for clearance from the bottom of the screen
  // (see BOTTOM_BAR_PADDING).
  const [rowHeights, setRowHeights] = useState<[number, number, number] | null>(null)
  // Multiplies every card/deck's vw-based size formula (see Hand.css, ManagerHand.css,
  // Deck.css) down from 1 when rowHeights above would otherwise overflow the
  // viewport, or a row's cards + its other elements (meters/history/Slack/discard)
  // wouldn't fit the viewport's width — those formulas only know the viewport's raw
  // width, not what else that width/height needs to share with (an iPad in landscape,
  // in particular, is too narrow for a row's cards plus its panel at full size), so
  // something has to give; this shrinks the cards themselves rather than letting them
  // overflow their row or the viewport. Read synchronously via cardScaleRef (below)
  // inside the same ResizeObserver callback that sets it, so each recompute measures
  // against the true scale: 1 size rather than compounding on the previous frame's
  // already-shrunk one.
  const [cardScale, setCardScale] = useState(1)
  const cardScaleRef = useRef(1)
  // How many slots each hand actually renders (see the resize-sync effect below,
  // which keeps hand/managerHand's own length equal to this) — lazily initialized
  // from the real viewport width so the very first paint already picks the right
  // tier instead of flashing 5-wide first.
  const [visibleHandCards, setVisibleHandCards] = useState(() => visibleHandCardsForWidth(window.innerWidth))
  // Last value visibleHandCards actually resolved to — read by the resize-sync
  // effect below to tell whether a change grew or shrank the hands, since the
  // effect's own prior render isn't otherwise available inside it.
  const prevVisibleHandCardsRef = useRef(visibleHandCards)
  // Slot indices/manager-slot-ids queued by the resize-sync effect below when a
  // resize grows a hand, waiting for the newly added (still-empty) slots to exist
  // in the DOM before startPlayerDraw/startManagerDraw can fly cards into them —
  // drained by the effect just after it, once that's true.
  const pendingPlayerDealsRef = useRef<number[]>([])
  const pendingManagerDealsRef = useRef<string[]>([])
  // Live mirrors of hand/managerHand (kept current by the sync effects below) —
  // read by the opening-deal effect further down to see which slots are actually
  // still empty at an arbitrary later point in time (its own callbacks fire well
  // after the render that changed hand/managerHand, so closing over those directly
  // would see a stale snapshot from whenever the effect itself first ran).
  const handContentRef = useRef<(PlayerCard | null)[]>([])
  const managerHandContentRef = useRef<(ManagerCard | null)[]>([])
  // True while runManagerDealQueue/runPlayerDealQueue (below) has an active chain
  // of draws running for that side — guards against two calls to the same queue
  // runner overlapping, which would stomp each other's shared draw timers (see
  // startPlayerDraw/startManagerDraw, which both reset their timer bucket on every
  // call). A second call while one's already running is a safe no-op: the running
  // chain re-reads its pending queue on every step, so anything pushed onto it
  // meanwhile still gets picked up.
  const managerDealerActive = useRef(false)
  const playerDealerActive = useRef(false)
  // Flipped true by the opening-deal effect once it's actually entered its manager
  // phase / player phase (see enqueueMissingManagerDeals/enqueueMissingPlayerDeals
  // there) — read by maybeCompleteInitialDeal below to tell "everything's drained
  // because the opening deal genuinely finished" apart from "everything's drained
  // because nothing had been queued yet".
  const initialManagerPhaseStartedRef = useRef(false)
  const initialPlayerPhaseStartedRef = useRef(false)
  // Set once maybeCompleteInitialDeal below has actually called setDealt(true) —
  // makes every later call a no-op instead of a harmless-but-pointless extra
  // setDealt(true) every time a post-deal resize's queue idles back out.
  const initialDealCompletedRef = useRef(false)
  const [slackMessages, setSlackMessages] = useState<PostedSlackMessage[]>([])
  const [activeSlackChannel, setActiveSlackChannel] = useState<string>(CHANNEL_ORDER[0])
  const slackMessageCounter = useRef(0)
  // Keys (see allSlackItems) of every message/conversation already posted this game,
  // so none of them repeat for the rest of the session.
  const usedSlackItems = useRef<Set<string>>(new Set())
  const conversationTimers = useRef<number[]>([])
  // True while a picked conversation is still posting its messages out — read (not
  // reacted to) each round to skip picking a new message/conversation until it's
  // done, even though card play itself keeps going in the meantime.
  const conversationInProgress = useRef(false)

  const [draggingCard, setDraggingCard] = useState<PlayerCard | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragInfo = useRef({ offsetX: 0, offsetY: 0, width: 150, height: 210 })

  const managerHandRef = useRef<HTMLDivElement>(null)
  // Loaded once on mount (see the effect below) so every draw for the rest of the
  // game uses the real value straight away — read via a ref rather than state since
  // startManagerDraw needs it synchronously and doesn't itself need to re-render
  // when it updates.
  const managerDrawDurationRef = useRef(MANAGER_DRAW_DEFAULT_DURATION_MS)
  // Same idea as managerDrawDurationRef, for pc-action-flip-card's length.
  const playerFlipDurationRef = useRef(PLAYER_FLIP_DEFAULT_DURATION_MS)
  // Same idea again, for gm-action-meter-full's length — timing the gap between each
  // maxed meter's turn in runLossSequence's glow cascade.
  const meterFullDurationRef = useRef(METER_FULL_DEFAULT_DURATION_MS)
  // Same idea again, for gm-action-vesting-full's length — timing runWinSequence's own
  // hold before the game-over splash fades in.
  const vestingFullDurationRef = useRef(VESTING_FULL_DEFAULT_DURATION_MS)
  // Live mirrors of backlog/techDebt/burnout/vesting, kept current by the sync effects
  // below — read from the round-resolve cascade's own completion point, which runs
  // inside a chain of setTimeouts from an older render's closure, so the plain
  // backlog/techDebt/burnout/vesting identifiers captured there are frozen at whatever
  // they were when that round started and never see this same round's own cascade
  // updates land.
  const backlogRef = useRef(0)
  const techDebtRef = useRef(0)
  const burnoutRef = useRef(STARTING_BURNOUT)
  const vestingRef = useRef(0)
  // True for the duration of the round-resolve cascade's four meter steps — gates the
  // win/lose effect below so a danger stat (or vesting) maxing out on, say, the very
  // first step doesn't call runLossSequence/runWinSequence before the other three
  // steps have had their turn; the cascade calls them itself, explicitly, once all
  // four have landed.
  const cascadeSettling = useRef(false)
  // Set the moment runLossSequence/runWinSequence actually starts its glow cascade, so
  // a later render's win/lose effect (or a second call from the cascade itself) can't
  // kick off a second one while it's still playing out.
  const resultSequenceStarted = useRef(false)
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const playerDeckRef = useRef<HTMLDivElement>(null)
  const managerDeckRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const gameBoardRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const playerDrawTimers = useRef<number[]>([])
  const managerDrawTimers = useRef<number[]>([])
  const discardTimers = useRef<number[]>([])
  // Holds the per-round timers that cascade the meter flashes one at a time and then
  // delay picking/posting the round's Slack message until a beat after the last one
  // lands (see the round-resolve effect below), so cleared on unmount/replay same as
  // every other timer bucket.
  const meterSequenceTimers = useRef<number[]>([])
  const lockMessageTimer = useRef<number | null>(null)
  const roundCounter = useRef(0)
  // Gives every flight (manager play, player draw, manager draw) a unique React key
  // so back-to-back flights — as when the opening deal chains six draws in a row —
  // always remount a fresh element instead of reusing one whose CSS transition would
  // otherwise ease from wherever the previous card landed.
  const flightKeyCounter = useRef(0)
  // Every card ever played with action 'recurring' (that wasn't reversed away),
  // whose deltas keep getting re-applied on every subsequent turn — not just the
  // turn it was played. A 'character'-action card counts as recurring too (see
  // playerIsRecurring/managerIsRecurring below).
  const activeRecurringEffects = useRef<RecurringEffect[]>([])
  // Names of characters whose 'character'-action card has resolved on their side —
  // once added, stays forever (nothing currently un-introduces a character). Gates
  // isCardLocked below: any card naming a character can't be played on that side
  // until that character's own introduction card has landed.
  const revealedCharacters = useRef<{ player: Set<string>; manager: Set<string> }>({
    player: new Set(),
    manager: new Set(),
  })
  // Every still-standing 'character'-action card played on each side, in play order —
  // an 'eliminate' + target:'character' card un-reveals the most recent entry, while
  // an 'eliminate' + target:'character:{name}' card un-reveals the entry matching
  // that name specifically (wherever in the list it is), re-locking any 'coding' card
  // naming it and lifting whatever it suspended (see findEliminatedCharacterRoundIds). An entry is
  // removed once eliminated, so it can't be targeted again until that character is
  // replayed.
  const characterPlays = useRef<{
    player: { character: string; roundId: string }[]
    manager: { character: string; roundId: string }[]
  }>({ player: [], manager: [] })
  // Cards not currently in hand: drawn from (shuffling the discard back in once
  // exhausted) whenever a played card's slot needs a replacement.
  const playerDrawPile = useRef<PlayerCard[]>(playerCardOrder)
  const playerDiscard = useRef<PlayerCard[]>([])
  // Same draw-pile/discard mechanic as the player's, for the manager's hand.
  const managerDrawPile = useRef<ManagerCard[]>(managerDeck)
  const managerDiscard = useRef<ManagerCard[]>([])

  // Sends a face-down replacement card flying from the deck into the slot the just-
  // played card vacated, then flips it face-up once it lands — mirrors the manager's
  // opening-play flight below, just reversed (deck -> hand instead of hand -> battle).
  const startPlayerDraw = (slotIndex: number, onComplete?: () => void) => {
    if (playerDrawPile.current.length === 0) {
      playerDrawPile.current = shuffle(playerDiscard.current)
      playerDiscard.current = []
    }
    const card = playerDrawPile.current.shift()
    if (!card) return

    playerDrawTimers.current.forEach((t) => clearTimeout(t))
    playerDrawTimers.current = []

    const sourceEl = playerDeckRef.current
    const destEl = handRef.current?.querySelector<HTMLElement>(`[data-slot-index="${slotIndex}"]`)
    if (!sourceEl || !destEl) {
      setHand((prev) => prev.map((c, i) => (i === slotIndex ? card : c)))
      onComplete?.()
      return
    }

    const s = sourceEl.getBoundingClientRect()
    const d = destEl.getBoundingClientRect()

    setPlayerFlight({
      key: ++flightKeyCounter.current,
      card,
      slotIndex,
      source: { top: s.top, left: s.left, width: s.width, height: s.height },
      dest: { top: d.top, left: d.left, width: d.width, height: d.height },
      flipped: false,
      arrived: false,
    })

    playerDrawTimers.current.push(
      window.setTimeout(() => {
        setPlayerFlight((f) => (f ? { ...f, flipped: true } : f))
      }, 300),
    )

    playerDrawTimers.current.push(
      window.setTimeout(() => {
        playSound('pc-action-flip-card')
        // Waits out the flip sound's own length before starting the draw sound, so
        // the two don't play over each other.
        playerDrawTimers.current.push(
          window.setTimeout(() => playSound('pc-action-draw-card'), playerFlipDurationRef.current),
        )
      }, 300 + PLAYER_FLIP_SOUND_DELAY_MS),
    )

    playerDrawTimers.current.push(
      window.setTimeout(
        () => setPlayerFlight((f) => (f ? { ...f, arrived: true } : f)),
        300 + PLAYER_FLIP_SOUND_DELAY_MS + 550,
      ),
    )

    playerDrawTimers.current.push(
      window.setTimeout(
        () => {
          setHand((prev) => prev.map((c, i) => (i === slotIndex ? card : c)))
          setPlayerFlight(null)
          onComplete?.()
        },
        300 + PLAYER_FLIP_SOUND_DELAY_MS + 550 + 450,
      ),
    )
  }

  // Sends a face-down card sliding from the manager's deck into the hand slot that
  // was just played from, so the manager's hand always reads as full again — it
  // never flips (the manager's cards stay hidden until actually played).
  const startManagerDraw = (id: string, onComplete?: () => void) => {
    if (managerDrawPile.current.length === 0) {
      managerDrawPile.current = shuffle(managerDiscard.current)
      managerDiscard.current = []
    }
    const card = managerDrawPile.current.shift()
    if (!card) return

    managerDrawTimers.current.forEach((t) => clearTimeout(t))
    managerDrawTimers.current = []

    const sourceEl = managerDeckRef.current
    const destEl = managerHandRef.current?.querySelector<HTMLElement>(`[data-slot-id="${id}"]`)
    if (!sourceEl || !destEl) {
      setManagerHand((prev) => prev.map((c, i) => (MANAGER_SLOT_IDS[i] === id ? card : c)))
      setUsedManagerIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      onComplete?.()
      return
    }

    const s = sourceEl.getBoundingClientRect()
    const d = destEl.getBoundingClientRect()
    const durationMs = managerDrawDurationRef.current

    setManagerDrawFlight({
      key: ++flightKeyCounter.current,
      slotId: id,
      source: { top: s.top, left: s.left, width: s.width, height: s.height },
      dest: { top: d.top, left: d.left, width: d.width, height: d.height },
      arrived: false,
      durationMs,
    })
    playSound('mc-action-draw-card')

    // One tick to paint the starting position before transitioning to the slot,
    // otherwise React can batch both states into a single render and skip the
    // animation entirely.
    managerDrawTimers.current.push(
      window.setTimeout(() => setManagerDrawFlight((f) => (f ? { ...f, arrived: true } : f)), 20),
    )

    managerDrawTimers.current.push(
      window.setTimeout(() => {
        setManagerHand((prev) => prev.map((c, i) => (MANAGER_SLOT_IDS[i] === id ? card : c)))
        setUsedManagerIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setManagerDrawFlight(null)
        onComplete?.()
      }, 20 + durationMs),
    )
  }

  // Drains pendingManagerDealsRef one card at a time — never two at once, since
  // startManagerDraw resets managerDrawTimers on every call, so overlapping calls
  // would cancel everything but the last one's animation. Safe to call any time:
  // a no-op if a chain's already running (managerDealerActive), and if the queue is
  // empty right now it just calls onIdle immediately. Re-reads the queue itself on
  // every step rather than snapshotting it up front, so anything pushed onto it
  // after this starts — by a resize mid-chain, in particular — still gets picked up
  // by this same chain instead of needing a second one.
  const runManagerDealQueue = (onIdle?: () => void) => {
    if (managerDealerActive.current) return
    managerDealerActive.current = true
    const step = () => {
      const id = pendingManagerDealsRef.current.shift()
      if (id === undefined) {
        managerDealerActive.current = false
        onIdle?.()
        return
      }
      startManagerDraw(id, step)
    }
    step()
  }

  // Same idea as runManagerDealQueue above, for pendingPlayerDealsRef.
  const runPlayerDealQueue = (onIdle?: () => void) => {
    if (playerDealerActive.current) return
    playerDealerActive.current = true
    const step = () => {
      const index = pendingPlayerDealsRef.current.shift()
      if (index === undefined) {
        playerDealerActive.current = false
        onIdle?.()
        return
      }
      startPlayerDraw(index, step)
    }
    step()
  }

  // Queues every manager slot that's actually still empty right now (read from
  // managerHandContentRef, not a snapshot — see its comment) — used by the opening
  // deal, which needs an accurate picture of what's left to deal at the moment each
  // of its two phases actually starts, not just what was empty when the effect
  // first ran.
  const enqueueMissingManagerDeals = () => {
    managerHandContentRef.current.forEach((c, i) => {
      if (c === null) pendingManagerDealsRef.current.push(MANAGER_SLOT_IDS[i])
    })
  }

  // Same idea as enqueueMissingManagerDeals above, for the player's hand.
  const enqueueMissingPlayerDeals = () => {
    handContentRef.current.forEach((c, i) => {
      if (c === null) pendingPlayerDealsRef.current.push(i)
    })
  }

  // Flips dealt true once the opening deal has genuinely finished — passed as the
  // onIdle callback to every runManagerDealQueue/runPlayerDealQueue call (both the
  // opening-deal effect's own and the resize-sync one's growth top-ups below)
  // rather than trusting whichever specific call happens to be the one that
  // actually starts a given chain: runManagerDealQueue/runPlayerDealQueue only
  // invoke the onIdle *they* were given when their own call is the one that wins
  // the race to run (a call arriving while a chain's already active is a no-op,
  // silently dropping whatever onIdle it was passed) — so if only the opening-deal
  // effect's own calls carried this check, a resize-triggered call winning that
  // race instead would strand it forever, leaving dealt permanently false. Using
  // the same idempotent function everywhere sidesteps that: it's a no-op until
  // both phases have actually started and everything — including anything a
  // resize queued along the way — has fully drained, however that drain ends up
  // getting kicked off.
  const maybeCompleteInitialDeal = () => {
    if (initialDealCompletedRef.current) return
    if (!initialManagerPhaseStartedRef.current || !initialPlayerPhaseStartedRef.current) return
    if (managerDealerActive.current || playerDealerActive.current) return
    if (pendingManagerDealsRef.current.length > 0 || pendingPlayerDealsRef.current.length > 0) return
    initialDealCompletedRef.current = true
    setDealt(true)
  }

  // Picks a random still-unused message or conversation from across every channel —
  // once something is picked it's marked used by the caller so it never repeats for
  // the rest of the game.
  const pickSlackItem = () => {
    const available = allSlackItems().filter((i) => !usedSlackItems.current.has(i.key))
    if (available.length === 0) return null
    return available[Math.floor(Math.random() * available.length)]
  }

  const postSlackMessage = (channel: string, msg: SlackMessageJson) => {
    slackMessageCounter.current += 1
    setSlackMessages((prev) => [
      ...prev,
      {
        id: `slack-${slackMessageCounter.current}`,
        channel,
        character: msg.character,
        text: msg.text,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        backlog: msg.backlog,
        techDebt: msg.techDebt,
        burnout: msg.burnout,
        vesting: msg.vesting,
      },
    ])
    setActiveSlackChannel(channel)
    playSound('gm-action-slack-message')
  }

  // Plays a conversation's messages out one at a time, 1-10s apart, applying each
  // message's own stat deltas as it lands — runs independently of the round loop, so
  // the manager and player keep playing cards against each other while it's going.
  const runConversation = (channel: string, messages: SlackMessageJson[], index: number) => {
    if (index >= messages.length) {
      conversationInProgress.current = false
      return
    }

    const delay = 1000 + Math.random() * 9000
    conversationTimers.current.push(
      window.setTimeout(() => {
        const msg = messages[index]
        postSlackMessage(channel, msg)
        setBacklog((prev) => applyClearableDelta(prev, [msg.backlog]))
        setTechDebt((prev) => applyClearableDelta(prev, [msg.techDebt]))
        setBurnout((prev) => Math.min(BURNOUT_MAX, Math.max(0, prev + (msg.burnout ?? 0))))
        setVesting((prev) => Math.min(VESTING_MAX, Math.max(0, prev + (msg.vesting ?? 0))))
        runConversation(channel, messages, index + 1)
      }, delay),
    )
  }

  useEffect(() => {
    return () => {
      playerDrawTimers.current.forEach((t) => clearTimeout(t))
      playerDrawTimers.current = []
      managerDrawTimers.current.forEach((t) => clearTimeout(t))
      managerDrawTimers.current = []
      discardTimers.current.forEach((t) => clearTimeout(t))
      discardTimers.current = []
      meterSequenceTimers.current.forEach((t) => clearTimeout(t))
      meterSequenceTimers.current = []
      conversationTimers.current.forEach((t) => clearTimeout(t))
      conversationTimers.current = []
      if (lockMessageTimer.current != null) clearTimeout(lockMessageTimer.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getSoundDurationMs('mc-action-draw-card').then((ms) => {
      if (!cancelled && ms != null) managerDrawDurationRef.current = ms
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getSoundDurationMs('pc-action-flip-card').then((ms) => {
      if (!cancelled && ms != null) playerFlipDurationRef.current = ms
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getSoundDurationMs('gm-action-meter-full').then((ms) => {
      if (!cancelled && ms != null) meterFullDurationRef.current = ms
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getSoundDurationMs('gm-action-vesting-full').then((ms) => {
      if (!cancelled && ms != null) vestingFullDurationRef.current = ms
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    backlogRef.current = backlog
  }, [backlog])
  useEffect(() => {
    techDebtRef.current = techDebt
  }, [techDebt])
  useEffect(() => {
    burnoutRef.current = burnout
  }, [burnout])
  useEffect(() => {
    vestingRef.current = vesting
  }, [vesting])
  // New round, fresh discard streak — the next discard costs DISCARD_BASE_BURNOUT_COST
  // again instead of wherever the doubling left off last round.
  useEffect(() => {
    setDiscardStreak(0)
  }, [roundKey])
  useEffect(() => {
    handContentRef.current = hand
  }, [hand])
  useEffect(() => {
    managerHandContentRef.current = managerHand
  }, [managerHand])

  useEffect(() => {
    if (pageLoaded) return
    const handleLoad = () => setPageLoaded(true)
    window.addEventListener('load', handleLoad)
    return () => window.removeEventListener('load', handleLoad)
  }, [pageLoaded])

  // See rowHeights/cardScale above — measures each row's own card-based elements
  // (manager/player deck+hand, the active-column dropzone, the discard slot) and
  // checks each row independently against the board's full width (every row now
  // spans it, unlike the old shared column) minus a reserved minimum for that row's
  // non-card panel (meters/history/Slack — see METERS_MIN_WIDTH/HISTORY_MIN_WIDTH/
  // SLACK_MIN_WIDTH), taking whichever row needs the most shrinking. Row heights are
  // computed arithmetically rather than by measuring the rows themselves (see
  // rowHeights' comment for why): one shared, scaled card-height value, identical to
  // Hand.css's .hand-slot, drives all four "card rows" (manager hand, the two stacked
  // history/active cards, player hand), plus each row's own fixed (unscaled) gap/
  // padding chrome — see rowChromeHeight.
  useLayoutEffect(() => {
    const boardEl = gameBoardRef.current
    const els = [managerDeckRef.current, managerHandRef.current, playerDeckRef.current, handRef.current]
    if (!boardEl || els.some((el) => !el)) return
    const [managerDeckEl, managerHandEl, playerDeckEl, playerHandEl] = els as HTMLElement[]
    const recompute = () => {
      // The measured elements are already shrunk by whatever scale was applied last
      // time, so divide it back out to get the true, scale: 1 natural size — without
      // this, each pass would compute a new scale relative to an already-shrunk
      // measurement instead of the real one.
      const scale = cardScaleRef.current || 1
      const managerRowWidth =
        (managerDeckEl.getBoundingClientRect().width + ROW_ITEM_GAP + managerHandEl.getBoundingClientRect().width) /
        scale
      const playerRowWidth =
        (playerDeckEl.getBoundingClientRect().width + ROW_ITEM_GAP + playerHandEl.getBoundingClientRect().width) /
        scale
      const activeColumnEl = boardEl.querySelector<HTMLElement>('.active-column')
      const activeColumnWidth = (activeColumnEl?.getBoundingClientRect().width ?? 0) / scale
      const discardColumnEl = boardEl.querySelector<HTMLElement>('.discard-column')
      const discardColumnWidth = (discardColumnEl?.getBoundingClientRect().width ?? 0) / scale

      // Every row spans the board's full width now (there's no shared column to
      // divide it with), so the same availableWidth applies to all three checks below.
      const availableWidth = Math.max(0, boardEl.getBoundingClientRect().width - BOARD_PADDING * 2)
      const rowTopNeeded = managerRowWidth + ROW_ITEM_GAP + METERS_MIN_WIDTH
      const rowMiddleNeeded = activeColumnWidth + ROW_ITEM_GAP * 2 + HISTORY_MIN_WIDTH + SLACK_MIN_WIDTH
      const rowBottomNeeded = playerRowWidth + ROW_ITEM_GAP + discardColumnWidth
      const widthScale = Math.min(
        1,
        availableWidth / Math.max(1, rowTopNeeded),
        availableWidth / Math.max(1, rowMiddleNeeded),
        availableWidth / Math.max(1, rowBottomNeeded),
      )

      // Same 12vw * 7/5 formula as Hand.css's .hand-slot, computed directly from the
      // viewport rather than measured off a rendered card — this is the "one card"
      // unit that every row height below is built from. Four of these stack up across
      // the three rows (row-top is one, row-middle is two, row-bottom is one).
      const naturalCardHeight = window.innerWidth * 0.12 * (7 / 5)
      const CARD_UNITS = 4
      // Every one of these is a literal, unscaled CSS px value (none of them are
      // written with var(--card-scale) — see BattleArea.css/GameBoard.css), so unlike
      // the card height itself, none of it shrinks when cardScale does. Scaling it
      // down here anyway (as an earlier version of this effect did) under-allocates
      // row-middle/row-bottom's actual height on any viewport where cardScale < 1,
      // clipping the manager's card off the top of the (bottom-anchored) history area.
      const rowChromeHeight =
        BOARD_ROW_GAP * 2 +
        BOTTOM_BAR_PADDING +
        BATTLE_SLOT_GAP +
        HISTORY_PANEL_PADDING_TOP +
        HISTORY_PANEL_PADDING_BOTTOM +
        HAND_SCROLLBAR_GUTTER * 2
      // document.documentElement, not boardEl: .game-board has no explicit height of
      // its own (it hugs whatever these rows resolve to), so measuring it here would
      // just measure the answer we're trying to compute. #root fills the viewport
      // (100svh, see index.css) with nothing else in it, so the viewport height is
      // the board's actual vertical budget.
      const availableHeight = Math.max(0, document.documentElement.clientHeight - BOARD_PADDING * 2)
      const availableForCards = Math.max(0, availableHeight - rowChromeHeight)
      const heightScale =
        naturalCardHeight > 0 ? Math.min(1, availableForCards / (naturalCardHeight * CARD_UNITS)) : 1

      const nextScale = Math.min(widthScale, heightScale)
      const cardHeight = naturalCardHeight * nextScale
      cardScaleRef.current = nextScale
      setCardScale(nextScale)
      setVisibleHandCards(visibleHandCardsForWidth(window.innerWidth))
      setRowHeights([
        cardHeight + HAND_SCROLLBAR_GUTTER,
        cardHeight * 2 + BATTLE_SLOT_GAP + HISTORY_PANEL_PADDING_TOP + HISTORY_PANEL_PADDING_BOTTOM,
        cardHeight + BOTTOM_BAR_PADDING + HAND_SCROLLBAR_GUTTER,
      ])
    }
    recompute()
    const observer = new ResizeObserver(recompute)
    els.forEach((el) => observer.observe(el!))
    observer.observe(boardEl)
    return () => observer.disconnect()
  }, [])

  // Keeps each hand's actual slot count equal to visibleHandCards instead of
  // leaving the extra slots to scroll off-screen (see .hand-wrap/.manager-hand-wrap
  // in GameBoard.css, which size themselves to exactly this many cards): shrinking
  // returns whatever cards sat in the removed slots to the top of that side's draw
  // pile rather than discarding them, and growing queues the newly available slots
  // (always still empty, since they were just appended) for the effect below to
  // deal fresh cards into once they exist in the DOM. Before the game's actually
  // started, growth only resizes the arrays — nothing is queued, since the opening
  // deal effect picks up whatever the current size is once it runs; queueing here
  // too would double-deal into slots it's about to deal into itself.
  // hand/managerHand are deliberately read via closure rather than listed as deps:
  // this should only re-fire on an actual visibleHandCards/gameStarted/gameOver
  // change, each time picking up whatever hand/managerHand are at that moment —
  // listing them would also re-run this on every unrelated card play, which reads
  // as fine (visibleHandCards === prevCount bails out immediately) but is still
  // pointless churn this effect was never meant to react to.
  useEffect(() => {
    const prevCount = prevVisibleHandCardsRef.current
    prevVisibleHandCardsRef.current = visibleHandCards
    if (visibleHandCards === prevCount) return

    if (visibleHandCards < prevCount) {
      const keepCount = visibleHandCards
      pendingPlayerDealsRef.current = pendingPlayerDealsRef.current.filter((i) => i < keepCount)
      pendingManagerDealsRef.current = pendingManagerDealsRef.current.filter(
        (id) => MANAGER_SLOT_IDS.indexOf(id) < keepCount,
      )
      // Mutating the draw piles has to happen here, outside the setHand/
      // setManagerHand updaters below, rather than inside them — React (in
      // StrictMode, in development) calls an updater function twice to help catch
      // exactly this kind of impurity, and unshifting the returned cards from
      // inside one would double-insert them into the pile, eventually dealing the
      // same physical card into two hand slots at once.
      const returnedPlayerCards = hand.slice(keepCount).filter((c): c is PlayerCard => c !== null)
      if (returnedPlayerCards.length > 0) playerDrawPile.current.unshift(...returnedPlayerCards)
      const returnedManagerCards = managerHand.slice(keepCount).filter((c): c is ManagerCard => c !== null)
      if (returnedManagerCards.length > 0) managerDrawPile.current.unshift(...returnedManagerCards)

      setHand((prev) => prev.slice(0, keepCount))
      setManagerHand((prev) => prev.slice(0, keepCount))
      setUsedManagerIds((prev) => {
        const next = new Set(prev)
        MANAGER_SLOT_IDS.slice(keepCount, prevCount).forEach((id) => next.delete(id))
        return next
      })
    } else {
      const newIndices = Array.from({ length: visibleHandCards - prevCount }, (_, i) => prevCount + i)
      setHand((prev) => [...prev, ...Array(newIndices.length).fill(null)])
      setManagerHand((prev) => [...prev, ...Array(newIndices.length).fill(null)])
      setUsedManagerIds((prev) => {
        const next = new Set(prev)
        newIndices.forEach((i) => next.add(MANAGER_SLOT_IDS[i]))
        return next
      })
      if (gameStarted && !gameOver) {
        pendingPlayerDealsRef.current.push(...newIndices)
        pendingManagerDealsRef.current.push(...newIndices.map((i) => MANAGER_SLOT_IDS[i]))
      }
    }
  }, [visibleHandCards, gameStarted, gameOver])

  // Makes sure a queue runner is actually going whenever either hand's slot count
  // changes — covers the growth queued by the effect above once its new slots
  // exist in the DOM for startPlayerDraw/startManagerDraw's own lookups to find
  // (hand.length/managerHand.length only change once that's true), and is a no-op
  // whenever there's nothing pending or a chain's already running. Passes
  // maybeCompleteInitialDeal as onIdle same as the opening-deal effect itself does
  // (see that function's comment for why every call site has to, not just that
  // effect's own).
  useEffect(() => {
    runManagerDealQueue(maybeCompleteInitialDeal)
    runPlayerDealQueue(maybeCompleteInitialDeal)
  }, [hand.length, managerHand.length])

  // Any card naming a character (regardless of category) is a follow-up to that
  // character's own 'character'-action introduction card, and can't be played on
  // this side until that introduction has resolved (see revealedCharacters above).
  // Compares case-insensitively since the same character name isn't always cased
  // identically across the introduction card and its follow-ups.
  const isCardLocked = (card: PlayerCard | ManagerCard, side: 'player' | 'manager') =>
    card.action !== 'character' &&
    !!card.character &&
    ![...revealedCharacters.current[side]].some((c) => c.toLowerCase() === card.character!.toLowerCase())

  // Shown in the active column's player slot for a few seconds, then cleared —
  // called instead of actually playing a card whose character hasn't been
  // introduced yet (see isCardLocked/handleDropCard).
  const showLockMessage = (character: string) => {
    if (lockMessageTimer.current != null) window.clearTimeout(lockMessageTimer.current)
    setLockMessage(`You need to play the "${character}" character card first`)
    lockMessageTimer.current = window.setTimeout(() => setLockMessage(null), 2800)
  }

  // Which manager card categories a player card is allowed to respond to —
  // defaults to only its own category (e.g. 'coding' vs 'coding') when the JSON
  // omits playableAgainst; '*' in the list allows any category (used by wellness
  // cards, which can be played on any turn regardless of what the manager led with).
  const canPlayAgainst = (card: PlayerCard, managerCard: ManagerCard) => {
    const allowed = (card.playableAgainst ?? [card.category]).map((c) => c.toLowerCase())
    const managerCategory = managerCard.category.toLowerCase()
    return allowed.includes('*') || allowed.includes(managerCategory)
  }

  // Shown in the active column's player slot for a few seconds, then cleared —
  // called instead of actually playing a card that can't respond to the manager's
  // current card (see canPlayAgainst/handleDropCard).
  const showMismatchMessage = (managerCategory: string) => {
    if (lockMessageTimer.current != null) window.clearTimeout(lockMessageTimer.current)
    setLockMessage(`This card can't be played against a "${managerCategory}" card`)
    lockMessageTimer.current = window.setTimeout(() => setLockMessage(null), 2800)
  }

  const handleDropCard = (cardId: string) => {
    // Normally the player can only drop a card once the manager's has landed
    // (responding to it). While the player leads the round instead (see `leader`),
    // the active slot starts empty and this is the play that starts the round — so
    // there's no manager card yet to lock the drop behind or match categories against.
    const leading = leader === 'player' && !activeManagerCard
    if (activePlayerCard || (!activeManagerCard && !leading)) return
    const slotIndex = hand.findIndex((c) => c?.id === cardId)
    if (slotIndex === -1) return
    const card = hand[slotIndex]!
    // Locked cards never leave the hand — dropping one just shows why, leaving the
    // card to snap back to its resting slot once the drag ends.
    if (isCardLocked(card, 'player')) {
      showLockMessage(card.character!)
      return
    }
    if (!leading && !canPlayAgainst(card, activeManagerCard!)) {
      showMismatchMessage(activeManagerCard!.category)
      return
    }
    setHand((prev) => prev.map((c, i) => (i === slotIndex ? null : c)))
    setActivePlayerCard(card)
    if (leading) setPlayerHasLed(true)
    playerDiscard.current.push(card)
    // Goes through the same queue a resize's growth deals use (see
    // runPlayerDealQueue) rather than calling startPlayerDraw directly — that
    // shares one timer bucket and one flight-animation slot across every draw, so
    // calling it directly here while a growth deal is already mid-flight would
    // cancel that flight out from under it. Queueing instead guarantees this draw
    // waits its turn if one's already running, rather than colliding with it.
    pendingPlayerDealsRef.current.push(slotIndex)
    runPlayerDealQueue(maybeCompleteInitialDeal)
  }

  // Drops a card onto .discard-zone instead of playing it: no manager response, no
  // round resolution — the original slot empties immediately and the card dissolves
  // inside the discard slot itself (see DisintegrateEffect), then a fresh one is
  // drawn into the vacated slot once the dissolve finishes.
  const handleDiscardCard = (cardId: string) => {
    if (activePlayerCard) return
    const slotIndex = hand.findIndex((c) => c?.id === cardId)
    if (slotIndex === -1) return
    const card = hand[slotIndex]!
    const discardEl = document.querySelector<HTMLElement>('.discard-zone')
    const rect = discardEl?.getBoundingClientRect()

    setHand((prev) => prev.map((c, i) => (i === slotIndex ? null : c)))
    playerDiscard.current.push(card)
    playSound('gm-action-player-discard')

    const burnoutCost = DISCARD_BASE_BURNOUT_COST * 2 ** discardStreak
    setBurnout((prev) => Math.min(BURNOUT_MAX, Math.max(0, prev + burnoutCost)))
    setBurnoutFlashKey((k) => k + 1)
    setDiscardStreak((s) => s + 1)

    if (!rect) {
      // See handleDropCard's comment on why this goes through the queue instead of
      // calling startPlayerDraw directly.
      pendingPlayerDealsRef.current.push(slotIndex)
      runPlayerDealQueue(maybeCompleteInitialDeal)
      return
    }

    discardTimers.current.forEach((t) => clearTimeout(t))
    discardTimers.current = []

    setDiscardEffect({
      key: ++flightKeyCounter.current,
      card,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    })

    discardTimers.current.push(
      window.setTimeout(() => {
        setDiscardEffect(null)
        pendingPlayerDealsRef.current.push(slotIndex)
        runPlayerDealQueue(maybeCompleteInitialDeal)
      }, DISCARD_DISINTEGRATE_DURATION_MS),
    )
  }

  // Resets every piece of round/game state back to a fresh game — used by the
  // game-over screen's replay button instead of a page reload so gameStarted stays
  // true and the main splash screen doesn't reappear.
  const startNewGame = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    playerDrawTimers.current.forEach((t) => clearTimeout(t))
    playerDrawTimers.current = []
    managerDrawTimers.current.forEach((t) => clearTimeout(t))
    managerDrawTimers.current = []
    discardTimers.current.forEach((t) => clearTimeout(t))
    discardTimers.current = []
    meterSequenceTimers.current.forEach((t) => clearTimeout(t))
    meterSequenceTimers.current = []
    conversationTimers.current.forEach((t) => clearTimeout(t))
    conversationTimers.current = []
    if (lockMessageTimer.current != null) clearTimeout(lockMessageTimer.current)
    lockMessageTimer.current = null

    managerDrawPile.current = shuffle(sampleManagerCards)
    managerDiscard.current = []
    playerDrawPile.current = shuffle(sampleHand)
    playerDiscard.current = []
    activeRecurringEffects.current = []
    revealedCharacters.current = { player: new Set(), manager: new Set() }
    characterPlays.current = { player: [], manager: [] }
    usedSlackItems.current = new Set()
    conversationInProgress.current = false
    roundCounter.current = 0
    slackMessageCounter.current = 0
    backlogRef.current = 0
    techDebtRef.current = 0
    burnoutRef.current = STARTING_BURNOUT
    vestingRef.current = 0
    cascadeSettling.current = false
    resultSequenceStarted.current = false
    pendingPlayerDealsRef.current = []
    pendingManagerDealsRef.current = []
    prevVisibleHandCardsRef.current = visibleHandCards
    managerDealerActive.current = false
    playerDealerActive.current = false
    initialManagerPhaseStartedRef.current = false
    initialPlayerPhaseStartedRef.current = false
    initialDealCompletedRef.current = false

    setHand(Array(visibleHandCards).fill(null))
    setManagerHand(Array(visibleHandCards).fill(null))
    setUsedManagerIds(new Set(MANAGER_SLOT_IDS.slice(0, visibleHandCards)))
    setDealt(false)
    setHiddenHandId(null)
    setHistory([])
    setActivePlayerCard(null)
    setActiveManagerCard(null)
    setFlight(null)
    setPlayerFlight(null)
    setManagerDrawFlight(null)
    setDiscardEffect(null)
    setLockMessage(null)
    setBlurTurnsRemaining(0)
    setBacklog(0)
    setTechDebt(0)
    setBurnout(STARTING_BURNOUT)
    setVesting(0)
    setDiscardStreak(0)
    setBacklogFlashKey(0)
    setTechDebtFlashKey(0)
    setBurnoutFlashKey(0)
    setVestingFlashKey(0)
    setBacklogMaxed(false)
    setTechDebtMaxed(false)
    setBurnoutMaxed(false)
    setVestingMaxed(false)
    setRoundKey(0)
    setLeader('manager')
    setPlayerHasLed(false)
    setGameOver(null)
    setSlackMessages([])
    setActiveSlackChannel(CHANNEL_ORDER[0])
    setDraggingCard(null)
    setGameKey((k) => k + 1)
  }

  const handleCardPointerDown = (e: PointerEvent, card: PlayerCard) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragInfo.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    setPos({ x: e.clientX, y: e.clientY })
    setDraggingCard(card)
  }

  useEffect(() => {
    if (!draggingCard) return

    const handleMove = (e: globalThis.PointerEvent) => setPos({ x: e.clientX, y: e.clientY })
    const handleUp = (e: globalThis.PointerEvent) => {
      const dropped = document.elementFromPoint(e.clientX, e.clientY)
      if (dropped?.closest('.discard-zone')) {
        handleDiscardCard(draggingCard.id)
      } else if (dropped?.closest('.history-panel, .active-column')) {
        handleDropCard(draggingCard.id)
      }
      setDraggingCard(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingCard])

  // Deals the opening hands once the splash screen is dismissed AND the window has
  // finished loading: all manager cards fly in first (face-down the whole way,
  // since they stay hidden until played), then all player cards fly in and flip
  // face-up as they land. Built on the same queue runners a later resize uses to
  // top a hand back up (see the resize-sync effect above) rather than a bespoke
  // loop of its own, so the two can never race each other or double-deal into a
  // slot the other one's already claimed — enqueueMissingManagerDeals/
  // enqueueMissingPlayerDeals always ask "what's actually still empty right now"
  // (via handContentRef/managerHandContentRef) rather than assuming nothing could
  // have changed since this effect started, which is exactly what a fast resize
  // mid-deal would otherwise break. dealt only flips true once both this effect's
  // own two phases AND anything a resize queued alongside them have fully drained.
  useEffect(() => {
    if (!gameStarted || !pageLoaded) return

    let cancelled = false

    initialManagerPhaseStartedRef.current = true
    enqueueMissingManagerDeals()
    runManagerDealQueue(() => {
      if (cancelled) return
      initialPlayerPhaseStartedRef.current = true
      enqueueMissingPlayerDeals()
      runPlayerDealQueue(maybeCompleteInitialDeal)
    })

    return () => {
      cancelled = true
    }
  }, [gameStarted, pageLoaded, gameKey])

  // Runs the game-over glow cascade the moment a danger stat has actually maxed out —
  // each maxed meter, in Backlog / Tech Debt / Burnout order, lights up and dings in
  // turn (see meter-bar-fill-maxed in Meters.css and gm-action-meter-full), and only
  // once every one of them has had its turn does the game actually end. Called
  // explicitly once the round-resolve cascade's own four meter updates have all landed
  // — using the live backlog/techDebt/burnout refs, since that call site's plain state
  // identifiers are frozen mid-round (see cascadeSettling below) — and again by the
  // win/lose effect below for a stat pushed over the line by a Slack message/
  // conversation outside a round's own resolution. Returns whether it actually found
  // something maxed and started the cascade.
  const runLossSequence = (currentBacklog: number, currentTechDebt: number, currentBurnout: number) => {
    if (resultSequenceStarted.current) return true
    const maxed: { setGlow: (v: boolean) => void }[] = []
    if (currentBacklog >= STAT_MAX) maxed.push({ setGlow: setBacklogMaxed })
    if (currentTechDebt >= STAT_MAX) maxed.push({ setGlow: setTechDebtMaxed })
    if (currentBurnout >= BURNOUT_MAX) maxed.push({ setGlow: setBurnoutMaxed })
    if (maxed.length === 0) return false

    resultSequenceStarted.current = true
    const runGlowStep = (index: number) => {
      if (index >= maxed.length) {
        // Completely stops the game — the round-start/Slack-pick effects below both
        // bail out once gameOver is set — and fades in the game-over splash, which
        // holds off on the "you lost" video until its own fade-in finishes (see
        // GameOverScreen).
        meterSequenceTimers.current.push(
          window.setTimeout(() => setGameOver('lose'), meterFullDurationRef.current),
        )
        return
      }
      maxed[index].setGlow(true)
      playSound('gm-action-meter-full')
      meterSequenceTimers.current.push(
        window.setTimeout(() => runGlowStep(index + 1), meterFullDurationRef.current),
      )
    }
    runGlowStep(0)
    return true
  }

  // Mirrors runLossSequence above, but for the single win condition: the vesting meter
  // gets the same bright maxed glow (see meter-bar-fill-maxed in Meters.css), though its
  // own gm-action-vesting-full ding instead of the danger meters' gm-action-meter-full,
  // and only once that beat has played out does the game actually end. Called
  // explicitly once the round-resolve cascade's own four meter updates have all landed
  // — using the live vestingRef, since that call site's plain vesting identifier is
  // frozen mid-round (see cascadeSettling below) — and again by the win/lose effect
  // below for vesting pushed over the line by a Slack message/conversation outside a
  // round's own resolution. Returns whether it actually started the cascade.
  const runWinSequence = () => {
    if (resultSequenceStarted.current) return true
    resultSequenceStarted.current = true
    setVestingMaxed(true)
    playSound('gm-action-vesting-full')
    // Completely stops the game — the round-start/Slack-pick effects below both bail
    // out once gameOver is set — and fades in the game-over splash, which holds off on
    // the "you win" video until its own fade-in finishes (see GameOverScreen).
    meterSequenceTimers.current.push(
      window.setTimeout(() => setGameOver('win'), vestingFullDurationRef.current),
    )
    return true
  }

  // Ends the game once vesting reaches 100% (win), or a danger stat is pushed over its
  // cap (lose), by a Slack message/conversation outside a round's own resolution —
  // gated by cascadeSettling so it doesn't preempt the round-resolve cascade's own
  // call to runWinSequence/runLossSequence (see above) mid-cascade, before every meter
  // that moved this round has actually had its turn.
  useEffect(() => {
    if (gameOver || cascadeSettling.current || resultSequenceStarted.current) return
    if (vesting >= VESTING_MAX) {
      runWinSequence()
      return
    }
    runLossSequence(backlog, techDebt, burnout)
  }, [backlog, techDebt, burnout, vesting, gameOver])

  // Picks the manager's best card in hand and flies it into the active slot — shared
  // by the two effects below: one calls this to lead the round (leader === 'manager'),
  // the other calls it to respond once the player has led instead (leader ===
  // 'player'). Which one applies has no bearing on the selection/animation itself, so
  // there's nothing here that needs to know which side went first.
  const autoPlayManagerCard = () => {
    const hasEligiblePlayerRecurringTarget = (category: string) =>
      activeRecurringEffects.current.some((e) => !e.stopped && e.side === 'player' && e.category === category)

    // A 'block recurring' card carries no stat deltas of its own (see the damage
    // heuristic below), so without this it would always score 0 and lose out to
    // almost anything else in hand. It's only worth playing when there's an
    // active, not-already-suspended player recurring effect it would actually
    // suspend — matching `target`, or any type for '*'.
    const hasEligibleBlockTarget = (c: ManagerCard) => {
      if (c.effect !== 'block recurring' || c.target?.kind !== 'category') return false
      const target = c.target
      return activeRecurringEffects.current.some(
        (e) =>
          !e.stopped &&
          e.side === 'player' &&
          !((e.suspendedTurnsRemaining ?? 0) > 0) &&
          (target.category === '*' || e.category === target.category),
      )
    }

    // An 'eliminate' + target:'character' card can only take down a character the
    // player has actually played — either still standing in the battle area
    // (characterPlays.current.player, from an earlier round) or the very card they
    // just dropped this round (activePlayerCard, when the manager is responding
    // rather than leading) — never one that hasn't appeared at all. See
    // findEliminatedCharacterRoundIds' matching `currentRoundCharacter` handling,
    // which resolves this same "current drop" case once the card is actually played.
    const hasEligibleCharacterTarget = (c: ManagerCard) => {
      if (c.action !== 'eliminate' || c.target?.kind !== 'character') return true
      const target = c.target
      const battleArea = characterPlays.current.player
      const currentDrop =
        activePlayerCard?.action === 'character' && activePlayerCard.character
          ? activePlayerCard.character
          : undefined
      if (target.selector === 'all' || target.selector === 'last') return battleArea.length > 0 || !!currentDrop
      return (
        battleArea.some((p) => p.character.toLowerCase() === target.name.toLowerCase()) ||
        currentDrop?.toLowerCase() === target.name.toLowerCase()
      )
    }

    const handEntries = managerHand
      .map((c, i) => (c ? { card: c, id: MANAGER_SLOT_IDS[i] } : null))
      .filter((entry): entry is { card: ManagerCard; id: string } => entry !== null)
      .filter((entry) => !isCardLocked(entry.card, 'manager'))
      .filter((entry) => hasEligibleCharacterTarget(entry.card))
    if (handEntries.length === 0) return

    // Normalized (percent-of-max) estimate of how much playing this card would
    // hurt the player — the higher, the more damaging. '*' and 'reset' clear a
    // stat to 0, which only helps the player, so they're scored as improving
    // (negative) that stat rather than raising it.
    const damage = (c: ManagerCard) => {
      const backlogDelta = c.action === 'reset' || c.backlog === '*' ? -backlog : (c.backlog ?? 0)
      const techDebtDelta =
        c.action === 'reset' || c.techDebt === '*' ? -techDebt : (c.techDebt ?? 0)
      return (
        backlogDelta / STAT_MAX +
        techDebtDelta / STAT_MAX +
        (c.burnout ?? 0) / BURNOUT_MAX -
        (c.vesting ?? 0) / VESTING_MAX
      )
    }

    // A 'blur' card outranks every other consideration — the disorientation it
    // buys is worth more than any single round's stat hit or a stopped recurring
    // effect, so the manager always leads with one the moment it's drawn. Only
    // eligible while nothing's currently blurred, though: refreshing an
    // already-running blur wastes the turn for (at best) a few extra turns of the
    // same effect, so it drops back to the tiers below until the current one lapses.
    const eligibleBlur = handEntries.filter((e) => e.card.action === 'blur' && blurTurnsRemaining === 0)

    // An eliminate card with something in hand eligible to eliminate takes
    // priority over raw damage — shutting down an active player recurring card
    // outweighs a one-off stat hit — and otherwise the manager plays whatever in
    // hand would hurt the player most. A block-recurring card with something
    // eligible to suspend gets the same priority treatment, one tier below
    // eliminate (permanently stopping a recurring card beats temporarily pausing
    // one, when both are available).
    const eligibleEliminate = handEntries.filter(
      (e) => e.card.action === 'eliminate' && hasEligiblePlayerRecurringTarget(e.card.category),
    )
    const eligibleBlock = handEntries.filter((e) => hasEligibleBlockTarget(e.card))
    const pool =
      eligibleBlur.length > 0
        ? eligibleBlur
        : eligibleEliminate.length > 0
          ? eligibleEliminate
          : eligibleBlock.length > 0
            ? eligibleBlock
            : handEntries
    const chosen = pool.reduce((best, e) => (damage(e.card) > damage(best.card) ? e : best))
    const { card, id } = chosen

    const sourceEl = managerHandRef.current?.querySelector(`[data-card-id="${id}"]`)
    const destEl = activeSlotRef.current
    if (!sourceEl || !destEl) return

    const s = sourceEl.getBoundingClientRect()
    const d = destEl.getBoundingClientRect()

    setHiddenHandId(id)
    setFlight({
      key: ++flightKeyCounter.current,
      card,
      source: { top: s.top, left: s.left, width: s.width, height: s.height },
      dest: { top: d.top, left: d.left, width: d.width, height: d.height },
      flipped: false,
      arrived: false,
    })

    timers.current.push(
      window.setTimeout(() => {
        setFlight((f) => (f ? { ...f, flipped: true } : f))
        playSound('mc-action-flip-card')
      }, 300),
    )

    timers.current.push(
      window.setTimeout(() => setFlight((f) => (f ? { ...f, arrived: true } : f)), 300 + 550),
    )

    timers.current.push(
      window.setTimeout(
        () => {
          setActiveManagerCard(card)
          managerDiscard.current.push(card)
          setManagerHand((prev) => prev.map((c, i) => (MANAGER_SLOT_IDS[i] === id ? null : c)))
          setUsedManagerIds((prev) => new Set(prev).add(id))
          setHiddenHandId(null)
          setFlight(null)
          // See handleDropCard's comment (near the top of the file) on why this
          // goes through the queue instead of calling startManagerDraw directly.
          pendingManagerDealsRef.current.push(id)
          runManagerDealQueue(maybeCompleteInitialDeal)
        },
        300 + 550 + 450,
      ),
    )
  }

  // When the manager leads (see `leader`), it opens the round by playing a card into
  // the top slot; the player only gets to respond once it's landed (see
  // handleDropCard). When the player leads instead, this just no-ops and waits — see
  // the next effect for the manager's side of that case.
  useEffect(() => {
    if (!gameStarted || !dealt || gameOver || leader !== 'manager') return

    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    setFlight(null)

    timers.current.push(window.setTimeout(autoPlayManagerCard, 500))

    return () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current = []
    }
    // managerHand/backlog/techDebt/usedManagerIds/blurTurnsRemaining are deliberately
    // read via closure rather than listed here — this effect should only re-fire on an
    // actual new round, each time picking up whatever those are at that moment (always
    // settled by then: the previous round's slot refill finishes well before the next
    // round starts).
  }, [roundKey, gameStarted, dealt, gameOver, leader])

  // Mirrors the round-start effect above for a player-led round: once the player's
  // card lands in the (otherwise empty) active slot — see handleDropCard's `leading`
  // case — the manager auto-plays its response the same way it always opens a
  // manager-led round, just triggered by the player's card instead of by roundKey.
  useEffect(() => {
    if (!gameStarted || !dealt || gameOver || leader !== 'player') return
    if (!activePlayerCard || activeManagerCard) return

    timers.current.push(window.setTimeout(autoPlayManagerCard, 500))

    return () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current = []
    }
  }, [activePlayerCard, activeManagerCard, leader, gameStarted, dealt, gameOver])

  // Once the player responds to the manager's card, resolve the round after the
  // sparkle-burst animation plays out.
  useEffect(() => {
    if (!activePlayerCard || !activeManagerCard) return

    const resolveTimer = window.setTimeout(() => {
      roundCounter.current += 1
      const roundId = `round-${roundCounter.current}`

      // A "reversal" card has no stat values of its own — instead it takes the
      // manager's card's deltas and flips their sign, so whatever the manager card
      // would have cost the player becomes a gain instead (and vice versa). A
      // reversed manager card also never gets registered as a recurring effect below
      // — countering it cancels it outright, not just for this turn.
      const reversed = activePlayerCard.action === 'reversal'
      const negateClearable = (v: number | '*' | undefined) => (v === undefined || v === '*' ? v : -v)

      // A 'cancel' card neutralizes the manager's card this same round outright — no
      // deltas, no recurring registration, no eliminate/reset effect — rather than
      // flipping its sign (that's what 'reversal' does) or stopping a later round
      // (that's 'eliminate', which targets a recurring effect, not the played card
      // itself).
      const cancelled = activePlayerCard.action === 'cancel'

      // A 'character'-action card is also recurring — once played, its own stat
      // deltas (if any) keep reapplying every turn just like a plain 'recurring'
      // card, alongside introducing the character (see revealedCharacters below).
      const playerIsRecurring = activePlayerCard.action === 'recurring' || activePlayerCard.action === 'character'
      const managerIsRecurring =
        (activeManagerCard.action === 'recurring' || activeManagerCard.action === 'character') &&
        !reversed &&
        !cancelled

      // A 'reset' card wipes backlog and/or technical debt to 0 outright — reuses the
      // same '*' clearable-delta sentinel applyClearableDelta already honors for
      // per-card wildcard values, so it overrides every other contributing delta that
      // round regardless of side. A `{ kind: 'stat' }` target narrows this to a single
      // stat ('techDebt' or 'backlog'); omitting `target` clears both, same as before
      // targeted resets existed.
      const resetTargets = (card: PlayerCard | ManagerCard) =>
        card.action === 'reset' ? (card.target?.kind === 'stat' ? card.target.stat : null) : undefined
      const playerResetTarget = resetTargets(activePlayerCard)
      const managerResetTarget = !reversed && !cancelled ? resetTargets(activeManagerCard) : undefined
      const resetSentinelFor = (stat: 'backlog' | 'techDebt'): '*' | undefined =>
        [playerResetTarget, managerResetTarget].some((t) => t === null || t === stat) ? '*' : undefined
      const backlogResetSentinel = resetSentinelFor('backlog')
      const techDebtResetSentinel = resetSentinelFor('techDebt')

      // An 'eliminate' card stops the most recent still-active OPPOSING-side recurring
      // effect of the same type (searched before this round's own effects are pushed
      // below, so it can never target a card played this same round) — its deltas
      // stop compounding from here on, and the battle history round it came from gets
      // flagged so it renders the STOPPED overlay. Works both ways: a player eliminate
      // card targets the manager's recurring cards, and vice versa.
      // An 'eliminate' card with a `{ kind: 'character' }` target instead un-reveals
      // still-standing 'character'-action card(s) on the opposing side: selector
      // 'last' takes the most recently played one, 'named' takes the one matching
      // `name` (case-insensitive) wherever it sits in the play order, and 'all' takes
      // every still-standing one — re-locking any 'coding' card naming them
      // (isCardLocked reads revealedCharacters live, so removing them here is all
      // that's needed), lifting every suspension each character's own 'block
      // recurring' effect caused (by matching on `suspendedBy` rather than category,
      // so it can't disturb a block some other card caused), AND stopping every
      // still-active recurring effect on that side attributed to that character
      // (RecurringEffect.character) — both the character's own card and every
      // recurring card tied to them get flagged for the ELIMINATED overlay, distinct
      // from the plain STOPPED one above.
      const findEliminatedCharacterRoundIds = (
        targetSide: 'player' | 'manager',
        target: Extract<CardTarget, { kind: 'character' }>,
      ) => {
        const plays = characterPlays.current[targetSide]
        const matches: { character: string; roundId: string }[] =
          target.selector === 'all'
            ? plays.splice(0, plays.length)
            : (() => {
                const index =
                  target.selector === 'last'
                    ? plays.length - 1
                    : plays.findLastIndex((p) => p.character.toLowerCase() === target.name.toLowerCase())
                return index < 0 ? [] : plays.splice(index, 1)
              })()

        // The character card just played THIS round on targetSide hasn't reached
        // characterPlays yet — that registration happens further below, after every
        // elimination this round has already been resolved — so without this it could
        // never be a valid target (see autoPlayManagerCard's matching
        // hasEligibleCharacterTarget check, which allows the manager to aim an
        // eliminate-character card at exactly this "current drop" case).
        const currentRoundCard = targetSide === 'player' ? activePlayerCard : cancelled ? undefined : activeManagerCard
        const currentRoundCharacter =
          currentRoundCard?.action === 'character' && currentRoundCard.character
            ? currentRoundCard.character
            : undefined
        let snipedCurrentRound = false
        if (
          currentRoundCharacter &&
          (target.selector === 'all' ||
            (target.selector === 'last' && matches.length === 0) ||
            (target.selector === 'named' &&
              matches.length === 0 &&
              currentRoundCharacter.toLowerCase() === target.name.toLowerCase()))
        ) {
          matches.push({ character: currentRoundCharacter, roundId })
          snipedCurrentRound = true
        }

        const roundIds: string[] = []
        matches.forEach((match) => {
          revealedCharacters.current[targetSide].delete(match.character)
          roundIds.push(match.roundId)
          activeRecurringEffects.current.forEach((effect) => {
            if (effect.suspendedBy === match.roundId) effect.suspendedTurnsRemaining = 0
            if (
              !effect.stopped &&
              effect.side === targetSide &&
              effect.character?.toLowerCase() === match.character.toLowerCase()
            ) {
              effect.stopped = true
              roundIds.push(effect.roundId)
            }
          })
        })
        return { roundIds, snipedCurrentRound }
      }
      const findEliminatedRoundIds = (
        eliminatingCard: PlayerCard | ManagerCard,
        targetSide: 'player' | 'manager',
      ): { roundIds: string[]; eliminated: boolean; snipedCurrentRound: boolean } => {
        if (eliminatingCard.action !== 'eliminate')
          return { roundIds: [], eliminated: false, snipedCurrentRound: false }
        if (eliminatingCard.target?.kind === 'character') {
          const { roundIds, snipedCurrentRound } = findEliminatedCharacterRoundIds(targetSide, eliminatingCard.target)
          return { roundIds, eliminated: true, snipedCurrentRound }
        }
        for (let i = activeRecurringEffects.current.length - 1; i >= 0; i--) {
          const effect = activeRecurringEffects.current[i]
          if (!effect.stopped && effect.side === targetSide && effect.category === eliminatingCard.category) {
            effect.stopped = true
            return { roundIds: [effect.roundId], eliminated: false, snipedCurrentRound: false }
          }
        }
        return { roundIds: [], eliminated: false, snipedCurrentRound: false }
      }
      const managerElimination = findEliminatedRoundIds(activePlayerCard, 'manager')
      // A cancelled manager card had no effect this round, so it can't have eliminated
      // anything either.
      const playerElimination = cancelled
        ? { roundIds: [], eliminated: false, snipedCurrentRound: false }
        : findEliminatedRoundIds(activeManagerCard, 'player')

      // A 'block recurring' card suspends every still-active OPPOSING-side recurring
      // effect matching its `{ kind: 'category' }` target (or every category, for
      // '*') for `duration` turns — searched before this round's own recurring cards
      // are registered below, so a recurring card played this same round can never be
      // suspended by a block played alongside it. A neutralized manager card
      // (cancelled or reversed away) never took effect, so it can't suspend anything
      // either.
      const applyBlockRecurring = (
        card: PlayerCard | ManagerCard,
        side: 'player' | 'manager',
        neutralized: boolean,
      ) => {
        if (neutralized || card.effect !== 'block recurring' || card.target?.kind !== 'category') return
        const targetSide = side === 'player' ? 'manager' : 'player'
        for (const effect of activeRecurringEffects.current) {
          if (effect.stopped) continue
          if (effect.side !== targetSide) continue
          if (card.target.category !== '*' && effect.category !== card.target.category) continue
          // No `duration` means this block lasts the rest of the game rather than
          // ticking down — see the RecurringEffect.suspendedTurnsRemaining comment.
          effect.suspendedTurnsRemaining = card.duration ?? Infinity
          effect.suspendedBy = roundId
        }
      }
      applyBlockRecurring(activePlayerCard, 'player', false)
      applyBlockRecurring(activeManagerCard, 'manager', cancelled || reversed)

      // A manager 'blur' card obscures the player's hand and the shared dropzone/
      // history for `duration` turns (see Card.tsx's blurred prop) — refreshes the
      // countdown to the new card's duration rather than stacking with whatever was
      // already running. A neutralized manager card (cancelled or reversed away)
      // never took effect, so it can't start (or refresh) a blur; otherwise the
      // existing countdown just ticks down by one, same idea as the suspension
      // countdown below.
      if (activeManagerCard.action === 'blur' && !cancelled && !reversed) {
        setBlurTurnsRemaining(activeManagerCard.duration ?? Infinity)
      } else {
        setBlurTurnsRemaining((prev) => Math.max(0, prev - 1))
      }

      // Snapshot of every still-suspended effect's remaining turns, keyed by the round
      // it was originally played in, for the SUSPENDED overlay below and for excluding
      // it from this round's own delta calculation further down — taken before that
      // countdown ticks (see the decrement loop after liveRecurringEffects) so a
      // duration-1 block still suspends its target for this round too.
      const playerSuspensionMap = new Map(
        activeRecurringEffects.current
          .filter((e) => !e.stopped && e.side === 'player' && (e.suspendedTurnsRemaining ?? 0) > 0)
          .map((e) => [e.roundId, e.suspendedTurnsRemaining!]),
      )
      const managerSuspensionMap = new Map(
        activeRecurringEffects.current
          .filter((e) => !e.stopped && e.side === 'manager' && (e.suspendedTurnsRemaining ?? 0) > 0)
          .map((e) => [e.roundId, e.suspendedTurnsRemaining!]),
      )

      setHistory((prev) => {
        const next = [
          ...prev,
          { id: roundId, playerCard: activePlayerCard, managerCard: activeManagerCard, managerCardCancelled: cancelled },
        ]
        return next.map((r) => ({
          ...r,
          managerCardStopped:
            !managerElimination.eliminated && managerElimination.roundIds.includes(r.id)
              ? true
              : r.managerCardStopped,
          playerCardStopped:
            !playerElimination.eliminated && playerElimination.roundIds.includes(r.id) ? true : r.playerCardStopped,
          managerCardEliminated:
            managerElimination.eliminated && managerElimination.roundIds.includes(r.id)
              ? true
              : r.managerCardEliminated,
          playerCardEliminated:
            playerElimination.eliminated && playerElimination.roundIds.includes(r.id)
              ? true
              : r.playerCardEliminated,
          managerCardSuspendedTurns: managerSuspensionMap.get(r.id),
          playerCardSuspendedTurns: playerSuspensionMap.get(r.id),
        }))
      })

      // Recurring cards register their own delta here so it keeps compounding on
      // every future turn; this turn's contribution then flows through that
      // registration (see the recurring spread below) instead of being counted here
      // too, so it isn't applied twice on the turn it's first played.
      if (playerIsRecurring) {
        activeRecurringEffects.current.push({
          roundId,
          side: 'player',
          category: activePlayerCard.category,
          character: activePlayerCard.character,
          backlog: activePlayerCard.backlog,
          techDebt: activePlayerCard.techDebt,
          burnout: activePlayerCard.burnout,
          vesting: activePlayerCard.vesting,
          stopped: false,
        })
      }
      if (managerIsRecurring) {
        activeRecurringEffects.current.push({
          roundId,
          side: 'manager',
          category: activeManagerCard.category,
          character: activeManagerCard.character,
          backlog: activeManagerCard.backlog,
          techDebt: activeManagerCard.techDebt,
          burnout: activeManagerCard.burnout,
          vesting: activeManagerCard.vesting,
          stopped: false,
        })
      }

      // A 'character'-action card introduces its character to that side's story —
      // unlocking any card naming the same character (see isCardLocked). A
      // cancelled manager card never took effect, so it doesn't introduce anyone —
      // nor does one the opposing side's eliminate-character card sniped this same
      // round (see findEliminatedCharacterRoundIds' snipedCurrentRound).
      if (
        activePlayerCard.action === 'character' &&
        activePlayerCard.character &&
        !managerElimination.snipedCurrentRound
      ) {
        revealedCharacters.current.player.add(activePlayerCard.character)
        characterPlays.current.player.push({ character: activePlayerCard.character, roundId })
      }
      if (
        activeManagerCard.action === 'character' &&
        !cancelled &&
        activeManagerCard.character &&
        !playerElimination.snipedCurrentRound
      ) {
        revealedCharacters.current.manager.add(activeManagerCard.character)
        characterPlays.current.manager.push({ character: activeManagerCard.character, roundId })
      }

      const playerBacklog = reversed || playerIsRecurring ? undefined : activePlayerCard.backlog
      const managerBacklog =
        managerIsRecurring || cancelled
          ? undefined
          : reversed
            ? negateClearable(activeManagerCard.backlog)
            : activeManagerCard.backlog
      const playerTechDebt = reversed || playerIsRecurring ? undefined : activePlayerCard.techDebt
      const managerTechDebt =
        managerIsRecurring || cancelled
          ? undefined
          : reversed
            ? negateClearable(activeManagerCard.techDebt)
            : activeManagerCard.techDebt
      const playerBurnout = reversed || playerIsRecurring ? 0 : activePlayerCard.burnout ?? 0
      const managerBurnout =
        managerIsRecurring || cancelled
          ? 0
          : reversed
            ? -(activeManagerCard.burnout ?? 0)
            : activeManagerCard.burnout ?? 0
      const playerVesting = reversed || playerIsRecurring ? 0 : activePlayerCard.vesting ?? 0
      const managerVesting =
        managerIsRecurring || cancelled
          ? 0
          : reversed
            ? -(activeManagerCard.vesting ?? 0)
            : activeManagerCard.vesting ?? 0

      // A suspended effect (see applyBlockRecurring above) stays registered but
      // contributes nothing while its countdown is still running.
      const liveRecurringEffects = activeRecurringEffects.current.filter(
        (e) => !e.stopped && !((e.suspendedTurnsRemaining ?? 0) > 0),
      )
      const recurringBacklog = liveRecurringEffects.map((e) => e.backlog)
      const recurringTechDebt = liveRecurringEffects.map((e) => e.techDebt)
      const recurringBurnout = liveRecurringEffects.map((e) => e.burnout)
      const recurringVesting = liveRecurringEffects.map((e) => e.vesting)

      // Ticks every still-suspended effect's countdown down by one now that this
      // round's SUSPENDED-overlay snapshot and delta exclusion have both already read
      // the pre-tick value — once a counter reaches 0 the effect resumes contributing
      // from next round on.
      activeRecurringEffects.current.forEach((e) => {
        if (e.suspendedTurnsRemaining && e.suspendedTurnsRemaining > 0) e.suspendedTurnsRemaining -= 1
      })

      setActivePlayerCard(null)
      setActiveManagerCard(null)
      // Holds off the win/lose effect below until this round's own four meter steps
      // have all had their turn (see runLossSequence's call at the cascade's end).
      cascadeSettling.current = true

      // Each meter that actually moved this round updates, flashes, and dings one at a
      // time (in Backlog / Tech Debt / Burnout / Vesting order) rather than all at
      // once — a meter untouched by anything this round is skipped outright. Once the
      // whole cascade finishes, a full second of quiet passes before the round's Slack
      // message posts below, so that update reads as its own separate beat.
      const meterSteps: { changed: boolean; apply: () => void }[] = [
        {
          changed: hasNonZeroDelta([playerBacklog, managerBacklog, backlogResetSentinel, ...recurringBacklog]),
          apply: () => {
            setBacklog((prev) =>
              applyClearableDelta(prev, [playerBacklog, managerBacklog, backlogResetSentinel, ...recurringBacklog]),
            )
            setBacklogFlashKey((k) => k + 1)
          },
        },
        {
          changed: hasNonZeroDelta([
            playerTechDebt,
            managerTechDebt,
            techDebtResetSentinel,
            ...recurringTechDebt,
          ]),
          apply: () => {
            setTechDebt((prev) =>
              applyClearableDelta(prev, [
                playerTechDebt,
                managerTechDebt,
                techDebtResetSentinel,
                ...recurringTechDebt,
              ]),
            )
            setTechDebtFlashKey((k) => k + 1)
          },
        },
        {
          changed: sumDeltas([playerBurnout, managerBurnout, ...recurringBurnout]) !== 0,
          apply: () => {
            setBurnout((prev) =>
              Math.min(BURNOUT_MAX, Math.max(0, prev + sumDeltas([playerBurnout, managerBurnout, ...recurringBurnout]))),
            )
            setBurnoutFlashKey((k) => k + 1)
          },
        },
        {
          // Vesting ticks up 1% every turn regardless of which cards were played, on
          // top of whatever the cards themselves add or subtract — so it only counts
          // as unchanged if a card's own delta exactly cancels that baseline tick.
          changed: VESTING_PER_TURN + sumDeltas([playerVesting, managerVesting, ...recurringVesting]) !== 0,
          apply: () => {
            setVesting((prev) =>
              Math.min(
                VESTING_MAX,
                Math.max(0, prev + VESTING_PER_TURN + sumDeltas([playerVesting, managerVesting, ...recurringVesting])),
              ),
            )
            setVestingFlashKey((k) => k + 1)
          },
        },
      ]

      const runMeterStep = (index: number) => {
        if (index >= meterSteps.length) {
          // This round's own four meter steps have all had their turn — re-arm the
          // win/lose effect for whatever Slack posts below (see cascadeSettling above),
          // then check whether vesting just hit 100% or any of them actually maxed a
          // danger stat out. If so, runWinSequence/runLossSequence takes over entirely
          // — no next round, no Slack post, just the glow cascade and then game over.
          // Checked in the same order as the win/lose effect above: a win this round
          // can't also be a loss, but if it somehow were, winning takes priority.
          cascadeSettling.current = false
          if (vestingRef.current >= VESTING_MAX && runWinSequence()) return
          if (runLossSequence(backlogRef.current, techDebtRef.current, burnoutRef.current)) return

          // The meter cascade above has fully settled and nothing maxed out — only now
          // is it safe to let the manager draw/play its next card (see the
          // roundKey-gated round-start effect), so the player never sees a new card fly
          // in while the previous round's stats are still catching up.
          setRoundKey((k) => k + 1)
          // Whoever led this round, the other side leads the next one.
          setLeader((prev) => (prev === 'manager' ? 'player' : 'manager'))
          setPlayerHasLed(false)

          // Once per round, a random still-unused flavor message (or whole
          // conversation) posts to its channel and nudges the meters same as a played
          // card would. A conversation's deltas are applied message-by-message as it
          // plays out instead of all at once here (see runConversation), so it's
          // excluded below when picked. While a previously picked conversation is
          // still posting, skip picking anything new this round — it resumes picking
          // once that conversation finishes.
          meterSequenceTimers.current.push(
            window.setTimeout(() => {
              const picked = conversationInProgress.current ? null : pickSlackItem()
              if (!picked) return
              usedSlackItems.current.add(picked.key)
              if (isSlackConversation(picked.item)) {
                conversationInProgress.current = true
                setActiveSlackChannel(picked.channel)
                runConversation(picked.channel, picked.item.messages, 0)
              } else {
                const message = picked.item
                postSlackMessage(picked.channel, message)
                setBacklog((prev) => applyClearableDelta(prev, [message.backlog]))
                setTechDebt((prev) => applyClearableDelta(prev, [message.techDebt]))
                setBurnout((prev) => Math.min(BURNOUT_MAX, Math.max(0, prev + (message.burnout ?? 0))))
                setVesting((prev) => Math.min(VESTING_MAX, Math.max(0, prev + (message.vesting ?? 0))))
              }
            }, 1000),
          )
          return
        }

        const step = meterSteps[index]
        if (!step.changed) {
          runMeterStep(index + 1)
          return
        }

        step.apply()
        playSound('gm-action-meter-up')
        meterSequenceTimers.current.push(
          window.setTimeout(() => runMeterStep(index + 1), METER_STEP_DELAY_MS),
        )
      }
      runMeterStep(0)
    }, 900)

    return () => clearTimeout(resolveTimer)
  }, [activePlayerCard, activeManagerCard])

  const lockedCardIds = new Set(
    hand.filter((c): c is PlayerCard => c !== null && isCardLocked(c, 'player')).map((c) => c.id),
  )

  return (
    <div
      ref={gameBoardRef}
      className={`game-board${draggingCard ? ' game-board-dragging' : ''}`}
      style={
        {
          '--card-scale': cardScale,
          '--visible-hand-cards': visibleHandCards,
        } as CSSProperties
      }
    >
      {!gameStarted && <SplashScreen onStart={() => setGameStarted(true)} />}
      {/* Always mounted (not just once gameOver is set) so its win/lose <video>
          elements exist in time to be primed by the session's first tap/click — see
          GameOverScreen's own comment for why that timing matters on iPadOS. */}
      <GameOverScreen result={gameOver} onRestart={startNewGame} />

      <div className="row-top" style={rowHeights ? { height: rowHeights[0] } : undefined}>
        <div className="top-bar-manager">
          <div className="side-row">
            <div className="deck-wrap" ref={managerDeckRef}>
              <Deck image="/cards/mc-manager-back-image.webp" count={30} />
            </div>
            <div className="manager-hand-wrap" ref={managerHandRef}>
              <ManagerHand
                ids={MANAGER_SLOT_IDS.slice(0, managerHand.length)}
                usedIds={usedManagerIds}
                hiddenId={hiddenHandId}
              />
            </div>
          </div>
        </div>

        <div className="hud">
          <div className="hud-panel">
            <Meters
              backlog={backlog}
              techDebt={techDebt}
              burnout={burnout}
              vesting={vesting}
              backlogFlashKey={backlogFlashKey}
              techDebtFlashKey={techDebtFlashKey}
              burnoutFlashKey={burnoutFlashKey}
              vestingFlashKey={vestingFlashKey}
              backlogMaxed={backlogMaxed}
              techDebtMaxed={techDebtMaxed}
              burnoutMaxed={burnoutMaxed}
              vestingMaxed={vestingMaxed}
            />
          </div>
        </div>
      </div>

      <div className="row-middle" style={rowHeights ? { height: rowHeights[1] } : undefined}>
        <BattleArea
          ref={activeSlotRef}
          history={history}
          activePlayerCard={activePlayerCard}
          activeManagerCard={activeManagerCard}
          leader={leader}
          playerHasLed={playerHasLed}
          lockMessage={lockMessage}
          blurredTurns={blurTurnsRemaining}
        />
        <SlackPanel
          channels={CHANNEL_ORDER}
          activeChannel={activeSlackChannel}
          onSelectChannel={setActiveSlackChannel}
          messages={slackMessages}
          compact={visibleHandCards < HAND_SIZE}
        />
      </div>

      <div className="row-bottom" style={rowHeights ? { height: rowHeights[2] } : undefined}>
        <div className="bottom-bar">
          <div className="side-row">
            <div className="deck-wrap" ref={playerDeckRef}>
              <Deck image="/cards/pc-player-back-image.webp" count={34} />
            </div>
            <div className="hand-wrap" ref={handRef}>
              <Hand
                cards={hand}
                draggingCardId={draggingCard?.id ?? null}
                lockedCardIds={lockedCardIds}
                onCardPointerDown={handleCardPointerDown}
                blurredTurns={blurTurnsRemaining}
              />
            </div>
          </div>
        </div>

        <div className="discard-column discard-zone">
          <DiscardZone burnoutCost={DISCARD_BASE_BURNOUT_COST * 2 ** discardStreak} />
        </div>
      </div>

      <div className="game-credit">
        <p className="game-credit-title">Slay the Sprint</p>
        <p className="game-credit-copyright">Copyright (c) 2026, All Rights Reserved</p>
      </div>

      {draggingCard && (
        <div
          className="drag-ghost"
          style={{
            left: pos.x - dragInfo.current.offsetX,
            top: pos.y - dragInfo.current.offsetY,
            width: dragInfo.current.width,
            height: dragInfo.current.height,
          }}
        >
          <Card card={draggingCard} forceExpanded blurredTurns={blurTurnsRemaining} />
        </div>
      )}

      {flight && (
        <div
          key={flight.key}
          className="card-flight"
          style={{
            top: flight.arrived ? flight.dest.top : flight.source.top,
            left: flight.arrived ? flight.dest.left : flight.source.left,
            width: flight.arrived ? flight.dest.width : flight.source.width,
            height: flight.arrived ? flight.dest.height : flight.source.height,
          }}
        >
          <div className={`flip-card ${flight.flipped ? 'flip-card-flipped' : ''}`}>
            <div className="flip-card-inner">
              <div className="flip-face flip-face-front">
                <img src="/cards/mc-manager-back-image.webp" alt="" draggable={false} />
              </div>
              <div className="flip-face flip-face-back">
                <Card card={flight.card} blurredTurns={blurTurnsRemaining} />
              </div>
            </div>
          </div>
        </div>
      )}

      {playerFlight && (
        <div
          key={playerFlight.key}
          className="card-flight"
          style={{
            top: playerFlight.arrived ? playerFlight.dest.top : playerFlight.source.top,
            left: playerFlight.arrived ? playerFlight.dest.left : playerFlight.source.left,
            width: playerFlight.arrived ? playerFlight.dest.width : playerFlight.source.width,
            height: playerFlight.arrived ? playerFlight.dest.height : playerFlight.source.height,
          }}
        >
          <div className={`flip-card ${playerFlight.flipped ? 'flip-card-flipped' : ''}`}>
            <div className="flip-card-inner">
              <div className="flip-face flip-face-front">
                <img src="/cards/pc-player-back-image.webp" alt="" draggable={false} />
              </div>
              <div className="flip-face flip-face-back">
                <Card card={playerFlight.card} blurredTurns={blurTurnsRemaining} />
              </div>
            </div>
          </div>
        </div>
      )}

      {discardEffect && (
        <DisintegrateEffect key={discardEffect.key} card={discardEffect.card} rect={discardEffect.rect} />
      )}

      {managerDrawFlight && (
        <div
          key={managerDrawFlight.key}
          className="card-flight"
          style={{
            top: managerDrawFlight.arrived ? managerDrawFlight.dest.top : managerDrawFlight.source.top,
            left: managerDrawFlight.arrived ? managerDrawFlight.dest.left : managerDrawFlight.source.left,
            width: managerDrawFlight.arrived ? managerDrawFlight.dest.width : managerDrawFlight.source.width,
            height: managerDrawFlight.arrived ? managerDrawFlight.dest.height : managerDrawFlight.source.height,
            // Overrides .card-flight's fixed CSS transition-duration so the slide
            // takes exactly as long as mc-action-draw-card's sound.
            transitionDuration: `${managerDrawFlight.durationMs}ms`,
          }}
        >
          <img className="card-flight-back" src="/cards/mc-manager-back-image.webp" alt="" draggable={false} />
        </div>
      )}
    </div>
  )
}

export default GameBoard

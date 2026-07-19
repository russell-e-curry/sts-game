import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { ManagerCard, PlayerCard } from '../types'
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

const MANAGER_SLOT_IDS = Array.from({ length: 5 }, (_, i) => `m${i}`)
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
const HAND_SIZE = 5
const STARTING_BURNOUT = 0
const STAT_MAX = 500
const BURNOUT_MAX = 1000
const VESTING_MAX = 100
const VESTING_PER_TURN = 1

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

interface RecurringEffect {
  roundId: string
  side: 'player' | 'manager'
  type: string
  backlog?: number | '*'
  technicalDebt?: number | '*'
  burnout?: number
  vesting?: number
  // Set once an 'eliminate' card of the same type stops it — a stopped effect stays
  // in the list (so the battle history can still point at the round it came from,
  // for the STOPPED overlay) but is excluded from every future delta calculation.
  stopped: boolean
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
  const [hand, setHand] = useState<(PlayerCard | null)[]>(() => Array(HAND_SIZE).fill(null))
  // Tracks the actual card sitting in each manager slot (index-matched to
  // MANAGER_SLOT_IDS) so the round-start effect can pick the most damaging card in
  // hand to play, rather than always drawing from the same slot.
  const [managerHand, setManagerHand] = useState<(ManagerCard | null)[]>(() =>
    Array(MANAGER_SLOT_IDS.length).fill(null),
  )
  const [usedManagerIds, setUsedManagerIds] = useState<Set<string>>(() => new Set(MANAGER_SLOT_IDS))
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
  const [backlog, setBacklog] = useState(0)
  const [technicalDebt, setTechnicalDebt] = useState(0)
  const [burnout, setBurnout] = useState(STARTING_BURNOUT)
  const [vesting, setVesting] = useState(0)
  // Bumped once per resolved round, right as the meters get their new values — passed
  // to Meters as a remount key for its flash overlay (see meter-bar-flash in
  // Meters.css) so the flash restarts every round even though the meters themselves
  // stay mounted the whole game.
  const [meterFlashKey, setMeterFlashKey] = useState(0)
  const [roundKey, setRoundKey] = useState(0)
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
  // Measured width of the manager's deck + hand (see the ResizeObserver effect below)
  // — applied to .top-bar-manager directly, since CSS shrink-to-fit doesn't reliably
  // see through the nested flex layers between .top-bar-manager and the actual hand
  // cards to compute this on its own.
  const [managerHandAreaWidth, setManagerHandAreaWidth] = useState<number | null>(null)
  // Measured width of the Slack panel (see the ResizeObserver effect below) — applied
  // to .hud so the meters panel matches its width instead of sizing off its own
  // unrelated 420px flex-basis.
  const [slackPanelWidth, setSlackPanelWidth] = useState<number | null>(null)
  const slackPanelRef = useRef<HTMLDivElement>(null)

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
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const playerDeckRef = useRef<HTMLDivElement>(null)
  const managerDeckRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const playerDrawTimers = useRef<number[]>([])
  const managerDrawTimers = useRef<number[]>([])
  const discardTimers = useRef<number[]>([])
  // Holds the one-per-round timer that delays picking/posting the round's Slack
  // message until a beat after the meter flash + gm-action-meter-up sound land (see
  // the round-resolve effect below), so cleared on unmount/replay same as every
  // other timer bucket.
  const slackDelayTimers = useRef<number[]>([])
  const lockMessageTimer = useRef<number | null>(null)
  const roundCounter = useRef(0)
  // Gives every flight (manager play, player draw, manager draw) a unique React key
  // so back-to-back flights — as when the opening deal chains six draws in a row —
  // always remount a fresh element instead of reusing one whose CSS transition would
  // otherwise ease from wherever the previous card landed.
  const flightKeyCounter = useRef(0)
  // Every card ever played with action 'recurring' (that wasn't reversed away),
  // whose deltas keep getting re-applied on every subsequent turn — not just the
  // turn it was played.
  const activeRecurringEffects = useRef<RecurringEffect[]>([])
  // Names of characters whose 'character'-action card has resolved on their side —
  // once added, stays forever (nothing currently un-introduces a character). Gates
  // isCardLocked below: a 'coding' card naming a character can't be played on that
  // side until that character's own introduction card has landed.
  const revealedCharacters = useRef<{ player: Set<string>; manager: Set<string> }>({
    player: new Set(),
    manager: new Set(),
  })
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
        setTechnicalDebt((prev) => applyClearableDelta(prev, [msg.techDebt]))
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
      slackDelayTimers.current.forEach((t) => clearTimeout(t))
      slackDelayTimers.current = []
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
    if (pageLoaded) return
    const handleLoad = () => setPageLoaded(true)
    window.addEventListener('load', handleLoad)
    return () => window.removeEventListener('load', handleLoad)
  }, [pageLoaded])

  // .deck-wrap and .manager-hand-wrap both size themselves to their own content (see
  // GameBoard.css/ManagerHand.css) regardless of what .top-bar-manager does, so their
  // combined rendered width is the true "just enough for the deck + hand" measurement
  // — .top-bar-manager can't compute that itself (see the flex-basis:auto note above).
  useLayoutEffect(() => {
    const deckEl = managerDeckRef.current
    const handEl = managerHandRef.current
    if (!deckEl || !handEl) return
    const recompute = () => {
      // 20px matches .side-row's own gap between the deck and the hand.
      setManagerHandAreaWidth(deckEl.getBoundingClientRect().width + 20 + handEl.getBoundingClientRect().width)
    }
    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(deckEl)
    observer.observe(handEl)
    return () => observer.disconnect()
  }, [])

  // Keeps .hud's width matched to the Slack panel's rendered width (see SlackPanel's
  // forwarded ref) — the two live in separate flex contexts (.top-bar vs .battle-row),
  // so there's no CSS-only way to size one off the other.
  useLayoutEffect(() => {
    const panelEl = slackPanelRef.current
    if (!panelEl) return
    const recompute = () => setSlackPanelWidth(panelEl.getBoundingClientRect().width)
    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(panelEl)
    return () => observer.disconnect()
  }, [])

  // A 'coding' card naming a character is a follow-up to that character's own
  // 'character'-action introduction card, and can't be played on this side until
  // that introduction has resolved (see revealedCharacters above).
  const isCardLocked = (card: PlayerCard | ManagerCard, side: 'player' | 'manager') =>
    card.type === 'coding' &&
    card.action !== 'character' &&
    !!card.character &&
    !revealedCharacters.current[side].has(card.character)

  // Shown in the active column's player slot for a few seconds, then cleared —
  // called instead of actually playing a card whose character hasn't been
  // introduced yet (see isCardLocked/handleDropCard).
  const showLockMessage = (character: string) => {
    if (lockMessageTimer.current != null) window.clearTimeout(lockMessageTimer.current)
    setLockMessage(`You need to play the "${character}" character card first`)
    lockMessageTimer.current = window.setTimeout(() => setLockMessage(null), 2800)
  }

  const handleDropCard = (cardId: string) => {
    if (!activeManagerCard || activePlayerCard) return
    const slotIndex = hand.findIndex((c) => c?.id === cardId)
    if (slotIndex === -1) return
    const card = hand[slotIndex]!
    // Locked cards never leave the hand — dropping one just shows why, leaving the
    // card to snap back to its resting slot once the drag ends.
    if (isCardLocked(card, 'player')) {
      showLockMessage(card.character!)
      return
    }
    setHand((prev) => prev.map((c, i) => (i === slotIndex ? null : c)))
    setActivePlayerCard(card)
    playerDiscard.current.push(card)
    startPlayerDraw(slotIndex)
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
    const discardEl = handRef.current?.querySelector<HTMLElement>('.discard-zone')
    const rect = discardEl?.getBoundingClientRect()

    setHand((prev) => prev.map((c, i) => (i === slotIndex ? null : c)))
    playerDiscard.current.push(card)
    playSound('gm-action-player-discard')

    if (!rect) {
      startPlayerDraw(slotIndex)
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
        startPlayerDraw(slotIndex)
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
    slackDelayTimers.current.forEach((t) => clearTimeout(t))
    slackDelayTimers.current = []
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
    usedSlackItems.current = new Set()
    conversationInProgress.current = false
    roundCounter.current = 0
    slackMessageCounter.current = 0

    setHand(Array(HAND_SIZE).fill(null))
    setManagerHand(Array(MANAGER_SLOT_IDS.length).fill(null))
    setUsedManagerIds(new Set(MANAGER_SLOT_IDS))
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
    setBacklog(0)
    setTechnicalDebt(0)
    setBurnout(STARTING_BURNOUT)
    setVesting(0)
    setMeterFlashKey(0)
    setRoundKey(0)
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
  // finished loading: all six manager cards fly in first (face-down the whole way,
  // since they stay hidden until played), then all six player cards fly in and flip
  // face-up as they land. Each draw's completion callback kicks off the next, so the
  // deal reads as one card at a time rather than all twelve arriving in a pile.
  useEffect(() => {
    if (!gameStarted || !pageLoaded) return

    let cancelled = false

    const dealPlayerCards = (index: number) => {
      if (cancelled) return
      if (index >= HAND_SIZE) {
        setDealt(true)
        return
      }
      startPlayerDraw(index, () => dealPlayerCards(index + 1))
    }

    const dealManagerCards = (index: number) => {
      if (cancelled) return
      if (index >= MANAGER_SLOT_IDS.length) {
        dealPlayerCards(0)
        return
      }
      startManagerDraw(MANAGER_SLOT_IDS[index], () => dealManagerCards(index + 1))
    }

    dealManagerCards(0)

    return () => {
      cancelled = true
    }
  }, [gameStarted, pageLoaded, gameKey])

  // Ends the game the moment any losing stat maxes out (backlog/technical debt/
  // burnout) or vesting reaches 100% — checked as a reaction to the stats themselves
  // rather than inline in the resolve effect above, so it also catches Slack messages
  // pushing a stat over the line outside a round's own resolution.
  useEffect(() => {
    if (gameOver) return
    if (backlog >= STAT_MAX || technicalDebt >= STAT_MAX || burnout >= BURNOUT_MAX) {
      setGameOver('lose')
    } else if (vesting >= VESTING_MAX) {
      setGameOver('win')
    }
  }, [backlog, technicalDebt, burnout, vesting, gameOver])

  // The manager opens every round by playing a card into the top slot; the player
  // only gets to respond once it's landed (see handleDropCard).
  useEffect(() => {
    if (!gameStarted || !dealt || gameOver) return

    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    setFlight(null)

    timers.current.push(
      window.setTimeout(() => {
        const hasEligiblePlayerRecurringTarget = (type: string) =>
          activeRecurringEffects.current.some((e) => !e.stopped && e.side === 'player' && e.type === type)

        const handEntries = managerHand
          .map((c, i) => (c ? { card: c, id: MANAGER_SLOT_IDS[i] } : null))
          .filter((entry): entry is { card: ManagerCard; id: string } => entry !== null)
          .filter((entry) => !isCardLocked(entry.card, 'manager'))
        if (handEntries.length === 0) return

        // Normalized (percent-of-max) estimate of how much playing this card would
        // hurt the player — the higher, the more damaging. '*' and 'reset' clear a
        // stat to 0, which only helps the player, so they're scored as improving
        // (negative) that stat rather than raising it.
        const damage = (c: ManagerCard) => {
          const backlogDelta = c.action === 'reset' || c.backlog === '*' ? -backlog : (c.backlog ?? 0)
          const technicalDebtDelta =
            c.action === 'reset' || c.technicalDebt === '*' ? -technicalDebt : (c.technicalDebt ?? 0)
          return (
            backlogDelta / STAT_MAX +
            technicalDebtDelta / STAT_MAX +
            (c.burnout ?? 0) / BURNOUT_MAX -
            (c.vesting ?? 0) / VESTING_MAX
          )
        }

        // An eliminate card with something in hand eligible to eliminate takes
        // priority over raw damage — shutting down an active player recurring card
        // outweighs a one-off stat hit — and otherwise the manager plays whatever in
        // hand would hurt the player most.
        const eligibleEliminate = handEntries.filter(
          (e) => e.card.action === 'eliminate' && hasEligiblePlayerRecurringTarget(e.card.type),
        )
        const pool = eligibleEliminate.length > 0 ? eligibleEliminate : handEntries
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
              startManagerDraw(id)
            },
            300 + 550 + 450,
          ),
        )
      }, 500),
    )

    return () => {
      timers.current.forEach((t) => clearTimeout(t))
      timers.current = []
    }
    // managerHand/backlog/technicalDebt/usedManagerIds are deliberately read via
    // closure rather than listed here — this effect should only re-fire on an actual
    // new round, each time picking up whatever those are at that moment (always
    // settled by then: the previous round's slot refill finishes well before the next
    // round starts).
  }, [roundKey, gameStarted, dealt, gameOver])

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
      const reversed = activePlayerCard.type === 'reversal'
      const negateClearable = (v: number | '*' | undefined) => (v === undefined || v === '*' ? v : -v)

      // A 'cancel' card neutralizes the manager's card this same round outright — no
      // deltas, no recurring registration, no eliminate/reset effect — rather than
      // flipping its sign (that's what 'reversal' does) or stopping a later round
      // (that's 'eliminate', which targets a recurring effect, not the played card
      // itself).
      const cancelled = activePlayerCard.action === 'cancel'

      const playerIsRecurring = activePlayerCard.action === 'recurring'
      const managerIsRecurring = activeManagerCard.action === 'recurring' && !reversed && !cancelled

      // A 'reset' card wipes both backlog and technical debt to 0 outright — reuses
      // the same '*' clearable-delta sentinel applyClearableDelta already honors for
      // per-card wildcard values, so it overrides every other contributing delta that
      // round regardless of side.
      const isReset =
        activePlayerCard.action === 'reset' || (activeManagerCard.action === 'reset' && !reversed && !cancelled)
      const resetSentinel: '*' | undefined = isReset ? '*' : undefined

      // An 'eliminate' card stops the most recent still-active OPPOSING-side recurring
      // effect of the same type (searched before this round's own effects are pushed
      // below, so it can never target a card played this same round) — its deltas
      // stop compounding from here on, and the battle history round it came from gets
      // flagged so it renders the STOPPED overlay. Works both ways: a player eliminate
      // card targets the manager's recurring cards, and vice versa.
      const findStoppedRoundId = (eliminatingCard: PlayerCard | ManagerCard, targetSide: 'player' | 'manager') => {
        if (eliminatingCard.action !== 'eliminate') return null
        for (let i = activeRecurringEffects.current.length - 1; i >= 0; i--) {
          const effect = activeRecurringEffects.current[i]
          if (!effect.stopped && effect.side === targetSide && effect.type === eliminatingCard.type) {
            effect.stopped = true
            return effect.roundId
          }
        }
        return null
      }
      const stoppedManagerRoundId = findStoppedRoundId(activePlayerCard, 'manager')
      // A cancelled manager card had no effect this round, so it can't have eliminated
      // anything either.
      const stoppedPlayerRoundId = cancelled ? null : findStoppedRoundId(activeManagerCard, 'player')

      setHistory((prev) => {
        const next = [
          ...prev,
          { id: roundId, playerCard: activePlayerCard, managerCard: activeManagerCard, managerCardCancelled: cancelled },
        ]
        if (!stoppedManagerRoundId && !stoppedPlayerRoundId) return next
        return next.map((r) => {
          if (r.id === stoppedManagerRoundId) return { ...r, managerCardStopped: true }
          if (r.id === stoppedPlayerRoundId) return { ...r, playerCardStopped: true }
          return r
        })
      })

      // Recurring cards register their own delta here so it keeps compounding on
      // every future turn; this turn's contribution then flows through that
      // registration (see the recurring spread below) instead of being counted here
      // too, so it isn't applied twice on the turn it's first played.
      if (playerIsRecurring) {
        activeRecurringEffects.current.push({
          roundId,
          side: 'player',
          type: activePlayerCard.type,
          backlog: activePlayerCard.backlog,
          technicalDebt: activePlayerCard.technicalDebt,
          burnout: activePlayerCard.burnout,
          vesting: activePlayerCard.vesting,
          stopped: false,
        })
      }
      if (managerIsRecurring) {
        activeRecurringEffects.current.push({
          roundId,
          side: 'manager',
          type: activeManagerCard.type,
          backlog: activeManagerCard.backlog,
          technicalDebt: activeManagerCard.technicalDebt,
          burnout: activeManagerCard.burnout,
          vesting: activeManagerCard.vesting,
          stopped: false,
        })
      }

      // A 'character'-action card introduces its character to that side's story —
      // unlocking any 'coding' card naming the same character (see isCardLocked). A
      // cancelled manager card never took effect, so it doesn't introduce anyone.
      if (activePlayerCard.action === 'character' && activePlayerCard.character) {
        revealedCharacters.current.player.add(activePlayerCard.character)
      }
      if (activeManagerCard.action === 'character' && !cancelled && activeManagerCard.character) {
        revealedCharacters.current.manager.add(activeManagerCard.character)
      }

      const playerBacklog = reversed || playerIsRecurring ? undefined : activePlayerCard.backlog
      const managerBacklog =
        managerIsRecurring || cancelled
          ? undefined
          : reversed
            ? negateClearable(activeManagerCard.backlog)
            : activeManagerCard.backlog
      const playerTechnicalDebt = reversed || playerIsRecurring ? undefined : activePlayerCard.technicalDebt
      const managerTechnicalDebt =
        managerIsRecurring || cancelled
          ? undefined
          : reversed
            ? negateClearable(activeManagerCard.technicalDebt)
            : activeManagerCard.technicalDebt
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

      const liveRecurringEffects = activeRecurringEffects.current.filter((e) => !e.stopped)
      const recurringBacklog = liveRecurringEffects.map((e) => e.backlog)
      const recurringTechnicalDebt = liveRecurringEffects.map((e) => e.technicalDebt)
      const recurringBurnout = liveRecurringEffects.map((e) => e.burnout)
      const recurringVesting = liveRecurringEffects.map((e) => e.vesting)

      setBacklog((prev) => applyClearableDelta(prev, [playerBacklog, managerBacklog, resetSentinel, ...recurringBacklog]))
      setTechnicalDebt((prev) =>
        applyClearableDelta(prev, [playerTechnicalDebt, managerTechnicalDebt, resetSentinel, ...recurringTechnicalDebt]),
      )
      setBurnout((prev) =>
        Math.min(BURNOUT_MAX, Math.max(0, prev + sumDeltas([playerBurnout, managerBurnout, ...recurringBurnout]))),
      )
      // Vesting ticks up 1% every turn regardless of which cards were played, on top
      // of whatever the cards themselves add or subtract.
      setVesting((prev) =>
        Math.min(
          VESTING_MAX,
          Math.max(0, prev + VESTING_PER_TURN + sumDeltas([playerVesting, managerVesting, ...recurringVesting])),
        ),
      )

      // The meters ease to their new widths over the next beat (see .meter-bar-fill's
      // CSS transition) — the flash overlay and its sound land right as that motion
      // starts, then a full second of quiet before the round's Slack message posts
      // below, so the two updates read as sequential instead of competing for
      // attention.
      setMeterFlashKey((k) => k + 1)
      playSound('gm-action-meter-up')

      setActivePlayerCard(null)
      setActiveManagerCard(null)
      setRoundKey((k) => k + 1)

      // Once per round, a random still-unused flavor message (or whole conversation)
      // posts to its channel and nudges the meters same as a played card would. A
      // conversation's deltas are applied message-by-message as it plays out instead
      // of all at once here (see runConversation), so it's excluded below when picked.
      // While a previously picked conversation is still posting, skip picking anything
      // new this round — it resumes picking once that conversation finishes. Delayed a
      // second behind the meter flash/sound above (see slackDelayTimers).
      slackDelayTimers.current.push(
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
            setTechnicalDebt((prev) => applyClearableDelta(prev, [message.techDebt]))
            setBurnout((prev) => Math.min(BURNOUT_MAX, Math.max(0, prev + (message.burnout ?? 0))))
            setVesting((prev) => Math.min(VESTING_MAX, Math.max(0, prev + (message.vesting ?? 0))))
          }
        }, 1000),
      )
    }, 900)

    return () => clearTimeout(resolveTimer)
  }, [activePlayerCard, activeManagerCard])

  const lockedCardIds = new Set(
    hand.filter((c): c is PlayerCard => c !== null && isCardLocked(c, 'player')).map((c) => c.id),
  )

  return (
    <div className={`game-board${draggingCard ? ' game-board-dragging' : ''}`}>
      {!gameStarted && <SplashScreen onStart={() => setGameStarted(true)} />}
      {gameOver && <GameOverScreen result={gameOver} onRestart={startNewGame} />}

      <div className="top-bar">
        <div
          className="top-bar-manager"
          style={managerHandAreaWidth != null ? { width: managerHandAreaWidth } : undefined}
        >
          <p className="side-label">Your manager</p>
          <div className="side-row">
            <div className="deck-wrap" ref={managerDeckRef}>
              <Deck image="/cards/pc-manager-back-image.webp" count={30} />
            </div>
            <div className="manager-hand-wrap" ref={managerHandRef}>
              <ManagerHand ids={MANAGER_SLOT_IDS} usedIds={usedManagerIds} hiddenId={hiddenHandId} />
            </div>
          </div>
        </div>

        <div
          className="hud"
          style={slackPanelWidth != null ? { flex: `0 0 ${slackPanelWidth}px`, minWidth: 0 } : undefined}
        >
          <div className="hud-panel">
            <Meters
              backlog={backlog}
              technicalDebt={technicalDebt}
              burnout={burnout}
              vesting={vesting}
              flashKey={meterFlashKey}
            />
          </div>
        </div>
      </div>

      <div className="battle-row">
        <BattleArea
          ref={activeSlotRef}
          history={history}
          activePlayerCard={activePlayerCard}
          activeManagerCard={activeManagerCard}
          historyWidth={managerHandAreaWidth}
          lockMessage={lockMessage}
        />
        <SlackPanel
          ref={slackPanelRef}
          channels={CHANNEL_ORDER}
          activeChannel={activeSlackChannel}
          onSelectChannel={setActiveSlackChannel}
          messages={slackMessages}
        />
      </div>

      <div className="bottom-bar">
        <p className="side-label">You</p>
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
            />
          </div>
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
          <Card card={draggingCard} forceExpanded />
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
                <img src="/cards/pc-manager-back-image.webp" alt="" draggable={false} />
              </div>
              <div className="flip-face flip-face-back">
                <Card card={flight.card} />
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
                <Card card={playerFlight.card} />
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
          <img className="card-flight-back" src="/cards/pc-manager-back-image.webp" alt="" draggable={false} />
        </div>
      )}
    </div>
  )
}

export default GameBoard

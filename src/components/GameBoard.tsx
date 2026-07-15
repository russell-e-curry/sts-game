import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { ManagerCard, PlayerCard } from '../types'
import { sampleHand } from '../data/cards'
import { sampleManagerCards } from '../data/managerCards'
import { shuffle } from '../lib/shuffle'
import Deck from './Deck'
import ManagerHand from './ManagerHand'
import Meters from './Meters'
import AdSlot from './AdSlot'
import BattleArea, { type ResolvedRound } from './BattleArea'
import Hand from './Hand'
import Card from './Card'
import SlackPanel, { type PostedSlackMessage } from './SlackPanel'
import SplashScreen from './SplashScreen'
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

interface ManagerDrawFlight {
  key: number
  slotId: string
  source: Rect
  dest: Rect
  arrived: boolean
}

const MANAGER_SLOT_IDS = Array.from({ length: 5 }, (_, i) => `m${i}`)
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
  // in the same order every time — except the fat-slob card, which always opens.
  const managerDeck = useRef(
    (() => {
      const opener = sampleManagerCards.find((c) => c.id === 'mc-coding-fat-slob')
      const rest = sampleManagerCards.filter((c) => c.id !== 'mc-coding-fat-slob')
      return opener ? [opener, ...shuffle(rest)] : shuffle(rest)
    })(),
  ).current
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
  const [backlog, setBacklog] = useState(0)
  const [technicalDebt, setTechnicalDebt] = useState(0)
  const [burnout, setBurnout] = useState(STARTING_BURNOUT)
  const [vesting, setVesting] = useState(0)
  const [roundKey, setRoundKey] = useState(0)
  // Gates the round-start effect below so the manager doesn't play its opening card
  // until the player has dismissed the splash screen.
  const [gameStarted, setGameStarted] = useState(false)

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
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const playerDeckRef = useRef<HTMLDivElement>(null)
  const managerDeckRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const playerDrawTimers = useRef<number[]>([])
  const managerDrawTimers = useRef<number[]>([])
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
  // Total manager cards played so far — only used to detect the very first play (so
  // the fat-slob opener can jump the queue), since which card plays next is now
  // chosen from the manager's hand each round rather than by deck position.
  const managerPlayCount = useRef(0)
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
      window.setTimeout(() => setPlayerFlight((f) => (f ? { ...f, flipped: true } : f)), 300),
    )

    playerDrawTimers.current.push(
      window.setTimeout(() => setPlayerFlight((f) => (f ? { ...f, arrived: true } : f)), 300 + 550),
    )

    playerDrawTimers.current.push(
      window.setTimeout(
        () => {
          setHand((prev) => prev.map((c, i) => (i === slotIndex ? card : c)))
          setPlayerFlight(null)
          onComplete?.()
        },
        300 + 550 + 450,
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

    setManagerDrawFlight({
      key: ++flightKeyCounter.current,
      slotId: id,
      source: { top: s.top, left: s.left, width: s.width, height: s.height },
      dest: { top: d.top, left: d.left, width: d.width, height: d.height },
      arrived: false,
    })

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
      }, 20 + 450),
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
      conversationTimers.current.forEach((t) => clearTimeout(t))
      conversationTimers.current = []
    }
  }, [])

  const handleDropCard = (cardId: string) => {
    if (!activeManagerCard || activePlayerCard) return
    const slotIndex = hand.findIndex((c) => c?.id === cardId)
    if (slotIndex === -1) return
    const card = hand[slotIndex]!
    setHand((prev) => prev.map((c, i) => (i === slotIndex ? null : c)))
    setActivePlayerCard(card)
    playerDiscard.current.push(card)
    startPlayerDraw(slotIndex)
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
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.history-panel, .active-column')
      if (target) handleDropCard(draggingCard.id)
      setDraggingCard(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingCard])

  // Deals the opening hands once the splash screen is dismissed: all six manager
  // cards fly in first (face-down the whole way, since they stay hidden until
  // played), then all six player cards fly in and flip face-up as they land. Each
  // draw's completion callback kicks off the next, so the deal reads as one card at
  // a time rather than all twelve arriving in a pile.
  useEffect(() => {
    if (!gameStarted) return

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
  }, [gameStarted])

  // The manager opens every round by playing a card into the top slot; the player
  // only gets to respond once it's landed (see handleDropCard).
  useEffect(() => {
    if (!gameStarted || !dealt) return

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

        // The fat-slob opener always leads off the very first round. After that, an
        // eliminate card with something in hand eligible to eliminate takes priority
        // over raw damage — shutting down an active player recurring card outweighs a
        // one-off stat hit — and otherwise the manager plays whatever in hand would
        // hurt the player most.
        const opener =
          managerPlayCount.current === 0 ? handEntries.find((e) => e.card.id === 'mc-coding-fat-slob') : undefined
        const eligibleEliminate = handEntries.filter(
          (e) => e.card.action === 'eliminate' && hasEligiblePlayerRecurringTarget(e.card.type),
        )
        const pool = eligibleEliminate.length > 0 ? eligibleEliminate : handEntries
        const chosen = opener ?? pool.reduce((best, e) => (damage(e.card) > damage(best.card) ? e : best))
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
          window.setTimeout(() => setFlight((f) => (f ? { ...f, flipped: true } : f)), 300),
        )

        timers.current.push(
          window.setTimeout(() => setFlight((f) => (f ? { ...f, arrived: true } : f)), 300 + 550),
        )

        timers.current.push(
          window.setTimeout(
            () => {
              setActiveManagerCard(card)
              managerPlayCount.current += 1
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
  }, [roundKey, gameStarted, dealt])

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

      const playerIsRecurring = activePlayerCard.action === 'recurring'
      const managerIsRecurring = activeManagerCard.action === 'recurring' && !reversed

      // A 'reset' card wipes both backlog and technical debt to 0 outright — reuses
      // the same '*' clearable-delta sentinel applyClearableDelta already honors for
      // per-card wildcard values, so it overrides every other contributing delta that
      // round regardless of side.
      const isReset = activePlayerCard.action === 'reset' || (activeManagerCard.action === 'reset' && !reversed)
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
      const stoppedPlayerRoundId = findStoppedRoundId(activeManagerCard, 'player')

      setHistory((prev) => {
        const next = [...prev, { id: roundId, playerCard: activePlayerCard, managerCard: activeManagerCard }]
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

      const playerBacklog = reversed || playerIsRecurring ? undefined : activePlayerCard.backlog
      const managerBacklog = managerIsRecurring
        ? undefined
        : reversed
          ? negateClearable(activeManagerCard.backlog)
          : activeManagerCard.backlog
      const playerTechnicalDebt = reversed || playerIsRecurring ? undefined : activePlayerCard.technicalDebt
      const managerTechnicalDebt = managerIsRecurring
        ? undefined
        : reversed
          ? negateClearable(activeManagerCard.technicalDebt)
          : activeManagerCard.technicalDebt
      const playerBurnout = reversed || playerIsRecurring ? 0 : activePlayerCard.burnout ?? 0
      const managerBurnout = managerIsRecurring
        ? 0
        : reversed
          ? -(activeManagerCard.burnout ?? 0)
          : activeManagerCard.burnout ?? 0
      const playerVesting = reversed || playerIsRecurring ? 0 : activePlayerCard.vesting ?? 0
      const managerVesting = managerIsRecurring
        ? 0
        : reversed
          ? -(activeManagerCard.vesting ?? 0)
          : activeManagerCard.vesting ?? 0

      const liveRecurringEffects = activeRecurringEffects.current.filter((e) => !e.stopped)
      const recurringBacklog = liveRecurringEffects.map((e) => e.backlog)
      const recurringTechnicalDebt = liveRecurringEffects.map((e) => e.technicalDebt)
      const recurringBurnout = liveRecurringEffects.map((e) => e.burnout)
      const recurringVesting = liveRecurringEffects.map((e) => e.vesting)

      // Once per round, a random still-unused flavor message (or whole conversation)
      // posts to its channel and nudges the meters same as a played card would. A
      // conversation's deltas are applied message-by-message as it plays out instead
      // of all at once here (see runConversation), so it's excluded below when picked.
      // While a previously picked conversation is still posting, skip picking anything
      // new this round — it resumes picking once that conversation finishes.
      let immediateMessage: SlackMessageJson | null = null
      let startedConversation: { channel: string; messages: SlackMessageJson[] } | null = null

      const picked = conversationInProgress.current ? null : pickSlackItem()
      if (picked) {
        usedSlackItems.current.add(picked.key)
        if (isSlackConversation(picked.item)) {
          startedConversation = { channel: picked.channel, messages: picked.item.messages }
          conversationInProgress.current = true
          setActiveSlackChannel(picked.channel)
        } else {
          immediateMessage = picked.item
          postSlackMessage(picked.channel, picked.item)
        }
      }

      setBacklog((prev) =>
        applyClearableDelta(prev, [
          playerBacklog,
          managerBacklog,
          resetSentinel,
          immediateMessage?.backlog,
          ...recurringBacklog,
        ]),
      )
      setTechnicalDebt((prev) =>
        applyClearableDelta(prev, [
          playerTechnicalDebt,
          managerTechnicalDebt,
          resetSentinel,
          immediateMessage?.techDebt,
          ...recurringTechnicalDebt,
        ]),
      )
      setBurnout((prev) =>
        Math.min(
          BURNOUT_MAX,
          Math.max(
            0,
            prev + sumDeltas([playerBurnout, managerBurnout, immediateMessage?.burnout, ...recurringBurnout]),
          ),
        ),
      )
      // Vesting ticks up 1% every turn regardless of which cards were played, on top
      // of whatever the cards themselves add or subtract.
      setVesting((prev) =>
        Math.min(
          VESTING_MAX,
          Math.max(
            0,
            prev +
              VESTING_PER_TURN +
              sumDeltas([playerVesting, managerVesting, immediateMessage?.vesting, ...recurringVesting]),
          ),
        ),
      )
      setActivePlayerCard(null)
      setActiveManagerCard(null)

      // A conversation plays out on its own timer (see runConversation) alongside
      // the round loop, which always advances to the next round right away.
      if (startedConversation) {
        runConversation(startedConversation.channel, startedConversation.messages, 0)
      }
      setRoundKey((k) => k + 1)
    }, 900)

    return () => clearTimeout(resolveTimer)
  }, [activePlayerCard, activeManagerCard])

  return (
    <div className={`game-board${draggingCard ? ' game-board-dragging' : ''}`}>
      {!gameStarted && <SplashScreen onStart={() => setGameStarted(true)} />}

      <div className="top-bar">
        <div className="top-bar-manager">
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

        <div className="hud">
          <div className="hud-panel">
            <Meters backlog={backlog} technicalDebt={technicalDebt} burnout={burnout} vesting={vesting} />
          </div>
        </div>

        <AdSlot />
      </div>

      <div className="battle-row">
        <BattleArea
          ref={activeSlotRef}
          history={history}
          activePlayerCard={activePlayerCard}
          activeManagerCard={activeManagerCard}
        />
        <SlackPanel
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
            <Hand cards={hand} draggingCardId={draggingCard?.id ?? null} onCardPointerDown={handleCardPointerDown} />
          </div>
        </div>
      </div>

      <div className="game-credit">
        <p className="game-credit-title">Slay the Sprint</p>
        <p className="game-credit-copyright">Copyright (c) 2026, Russell Curry, All Rights Reserved</p>
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

      {managerDrawFlight && (
        <div
          key={managerDrawFlight.key}
          className="card-flight"
          style={{
            top: managerDrawFlight.arrived ? managerDrawFlight.dest.top : managerDrawFlight.source.top,
            left: managerDrawFlight.arrived ? managerDrawFlight.dest.left : managerDrawFlight.source.left,
            width: managerDrawFlight.arrived ? managerDrawFlight.dest.width : managerDrawFlight.source.width,
            height: managerDrawFlight.arrived ? managerDrawFlight.dest.height : managerDrawFlight.source.height,
          }}
        >
          <img className="card-flight-back" src="/cards/pc-manager-back-image.webp" alt="" draggable={false} />
        </div>
      )}
    </div>
  )
}

export default GameBoard

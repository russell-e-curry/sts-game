// Every sound effect the game can trigger, named `{side}-action-{event}` (side is
// "mc" for the manager or "pc" for the player, matching the mc-/pc- prefix already
// used for card content filenames — or "gm" for a game-wide event that isn't either
// side's, like a Slack message landing) — add a new name here whenever a new game
// action gets a sound. The file itself lives at public/sounds/{name}.mp3 and doesn't
// need to exist yet: playSound() no-ops quietly if it's missing, so sounds can be
// wired up before the actual audio is recorded.
export type SoundName =
  | 'mc-action-draw-card'
  | 'pc-action-draw-card'
  | 'mc-action-flip-card'
  | 'pc-action-flip-card'
  | 'gm-action-player-discard'
  | 'gm-action-slack-message'
  | 'gm-action-meter-up'
  | 'gm-action-meter-full'

// iOS Safari only lets a freshly-created <audio>/AudioContext start playback when
// that call happens synchronously inside a user-gesture handler. Most of this game's
// sounds fire from setTimeout chains (timed to card-flip animations), which is no
// longer "inside" the gesture by the time they run — so playback gets silently
// blocked after the first sound or two. The Web Audio API sidesteps this: unlock one
// shared AudioContext synchronously on the very first touch/click, and every
// subsequent start() call succeeds regardless of what triggered it, because the
// unlock lives on the context rather than on each individual play call.
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioContext = new Ctor()
  }
  return audioContext
}

function unlockAudioContext() {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchend', 'keydown'] as const
  for (const eventName of unlockEvents) {
    window.addEventListener(eventName, unlockAudioContext, { passive: true })
  }
}

const bufferCache = new Map<SoundName, Promise<AudioBuffer | null>>()

function getSoundBuffer(name: SoundName): Promise<AudioBuffer | null> {
  let cached = bufferCache.get(name)
  if (!cached) {
    cached = (async () => {
      const ctx = getAudioContext()
      if (!ctx) return null
      try {
        const response = await fetch(`/sounds/${name}.mp3`)
        if (!response.ok) return null
        const arrayBuffer = await response.arrayBuffer()
        return await ctx.decodeAudioData(arrayBuffer)
      } catch {
        // File may not exist yet during development, or decoding may be
        // unsupported — either way, missing sound shouldn't break the game.
        return null
      }
    })()
    bufferCache.set(name, cached)
  }
  return cached
}

// Fires a sound. Safe to call repeatedly in quick succession — each call gets its
// own AudioBufferSourceNode, so overlapping sounds (e.g. two draws landing close
// together) don't cut each other off.
export function playSound(name: SoundName) {
  const ctx = getAudioContext()
  if (!ctx) return
  unlockAudioContext()
  getSoundBuffer(name).then((buffer) => {
    if (!buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  })
}

// Resolves a sound file's actual playback length in milliseconds, so a caller can
// time an animation to match it instead of the two drifting independently (e.g. a
// card-draw flight finishing well before, or after, its whoosh sound). Cached per
// name via getSoundBuffer — only ever loads each file's data once. Resolves null if
// the duration can't be determined (file missing, blocked, etc.), so callers should
// fall back to a fixed default in that case.
export function getSoundDurationMs(name: SoundName): Promise<number | null> {
  return getSoundBuffer(name).then((buffer) => (buffer ? buffer.duration * 1000 : null))
}

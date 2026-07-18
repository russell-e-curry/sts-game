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

// A fresh Audio() per call (rather than one reused instance) so the same sound can
// overlap or retrigger — e.g. two draws landing close together — without cutting
// itself off.
export function playSound(name: SoundName) {
  const audio = new Audio(`/sounds/${name}.mp3`)
  audio.play().catch(() => {
    // Autoplay can be blocked before the player's first interaction, and the file
    // may not exist yet during development — either way, missing sound shouldn't
    // break the game.
  })
}

const durationCache = new Map<SoundName, Promise<number | null>>()

// Resolves a sound file's actual playback length in milliseconds, so a caller can
// time an animation to match it instead of the two drifting independently (e.g. a
// card-draw flight finishing well before, or after, its whoosh sound). Cached per
// name — only ever loads each file's metadata once. Resolves null if the duration
// can't be determined (file missing, blocked, etc.), so callers should fall back to
// a fixed default in that case.
export function getSoundDurationMs(name: SoundName): Promise<number | null> {
  let cached = durationCache.get(name)
  if (!cached) {
    cached = new Promise((resolve) => {
      const audio = new Audio(`/sounds/${name}.mp3`)
      audio.addEventListener('loadedmetadata', () => resolve(audio.duration * 1000), { once: true })
      audio.addEventListener('error', () => resolve(null), { once: true })
    })
    durationCache.set(name, cached)
  }
  return cached
}

import type { PlayerCard } from '../types'
import type { CardJson } from './cardContent/schema'

// Every .json file in cardContent/player is one card in the player's deck — drop a
// new file in there (plus its art in public/cards/player) and it shows up automatically.
const modules = import.meta.glob<CardJson>('./cardContent/player/*.json', {
  eager: true,
  import: 'default',
})

export const sampleHand: PlayerCard[] = Object.entries(modules).flatMap(([path, data]) => {
  const id = path.split('/').pop()!.replace(/\.json$/, '')
  return Array.from({ length: data.count ?? 1 }, (_, i) => ({
    id: i === 0 ? id : `${id}#${i + 1}`,
    side: 'player' as const,
    ...data,
    // The JSON file and its art share a filename, so the image never needs its own field.
    image: `/cards/player/${id}.webp`,
  }))
})

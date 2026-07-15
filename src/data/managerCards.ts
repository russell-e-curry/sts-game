import type { ManagerCard } from '../types'
import type { CardJson } from './cardContent/schema'

// Every .json file in cardContent/manager is one card in the manager's deck — drop a
// new file in there (plus its art in public/cards/manager) and it shows up automatically.
const modules = import.meta.glob<CardJson>('./cardContent/manager/*.json', {
  eager: true,
  import: 'default',
})

export const sampleManagerCards: ManagerCard[] = Object.entries(modules).map(([path, data]) => {
  const id = path.split('/').pop()!.replace(/\.json$/, '')
  return {
    id,
    side: 'manager',
    ...data,
    // The JSON file and its art share a filename, so the image never needs its own field.
    image: `/cards/manager/${id}.webp`,
  }
})

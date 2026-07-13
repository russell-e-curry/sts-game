export interface Objective {
  id: string
  title: string
  description: string
  image: string
  rsuTarget: number
}

export const sampleObjectives: Objective[] = [
  {
    id: 'refactor-monolith',
    title: 'Migrate the monolith by EOD',
    description: 'Hit your vesting target before burnout hits 100%.',
    image: '/cards/objectives/objective-refactor-monolith.png',
    rsuTarget: 100000,
  },
]

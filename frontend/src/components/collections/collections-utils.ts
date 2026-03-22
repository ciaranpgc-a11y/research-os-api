import type { CollectionColour, CollectionPayload } from '@/types/collections'

export const ALL_COLOURS: CollectionColour[] = [
  'indigo', 'amber', 'emerald', 'red', 'violet',
  'sky', 'pink', 'teal', 'orange', 'slate',
]

export type ViewportMode = 'organise' | 'browse'
export type PubFilter = 'all' | 'uncollected'

/**
 * Pick the next unused colour from the palette.
 * If all are used, cycle from the start.
 */
export function autoAssignColour(existingCollections: CollectionPayload[]): CollectionColour {
  const usedColours = new Set(existingCollections.map((c) => c.colour))
  const unused = ALL_COLOURS.find((c) => !usedColours.has(c))
  if (unused) return unused
  // All used — pick the least-used
  const counts = new Map<CollectionColour, number>()
  for (const c of ALL_COLOURS) counts.set(c, 0)
  for (const coll of existingCollections) {
    counts.set(coll.colour, (counts.get(coll.colour) ?? 0) + 1)
  }
  let min = Infinity
  let pick: CollectionColour = ALL_COLOURS[0]
  for (const [colour, count] of counts) {
    if (count < min) { min = count; pick = colour }
  }
  return pick
}

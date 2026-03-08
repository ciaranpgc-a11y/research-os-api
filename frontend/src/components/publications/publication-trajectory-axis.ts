export type TrajectoryYearAxisTick = {
  key: string
  label: string
  subLabel?: string
  leftPct: number
}

export type TrajectoryYearTickAnchor = 'left' | 'center' | 'right'

export function getTrajectoryYearTickAnchor(leftPct: number): TrajectoryYearTickAnchor {
  if (leftPct <= 2) {
    return 'left'
  }
  if (leftPct >= 98) {
    return 'right'
  }
  return 'center'
}

export function buildTrajectoryYearTicks(years: number[]): TrajectoryYearAxisTick[] {
  if (!years.length) {
    return []
  }

  const lastIndex = years.length - 1
  const minTerminalGapPct = 16
  const rawIndices = (() => {
    if (years.length <= 6) {
      return years.map((_, index) => index)
    }
    if (years.length <= 12) {
      const indices: number[] = []
      for (let index = 0; index <= lastIndex; index += 2) {
        indices.push(index)
      }
      if (indices[indices.length - 1] !== lastIndex) {
        const previousIndex = indices[indices.length - 1] ?? 0
        const previousPct = lastIndex <= 0 ? 0 : (previousIndex / lastIndex) * 100
        const terminalPct = 100
        if ((terminalPct - previousPct) >= minTerminalGapPct) {
          indices.push(lastIndex)
        }
      }
      return indices
    }
    return Array.from({ length: 5 }, (_, index) => Math.round((lastIndex * index) / 4))
  })()

  const tickIndices = rawIndices.filter((index, position) => (
    index >= 0
      && index <= lastIndex
      && rawIndices.indexOf(index) === position
  ))

  return tickIndices.map((index) => ({
    key: `trajectory-axis-${years[index]}-${index}`,
    label: String(years[index]),
    subLabel: undefined,
    leftPct: lastIndex <= 0 ? 0 : (index / lastIndex) * 100,
  }))
}

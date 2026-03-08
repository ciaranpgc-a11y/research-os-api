export type PublicationTrajectoryTooltipSlice = {
  key: string
  year: number
  rawValue: number
  movingAvgValue: number
  cumulativeValue: number
  activeValue: number
  previousRawValue: number | null
  rawDelta: number | null
  rawDeltaPct: number | null
  xPct: number
  yPct: number
  leftPct: number
  widthPct: number
  movingAvgYPct: number | null
}

type TrajectoryPointLike = {
  x: number
  y: number
}

export function buildTrajectoryTooltipSlices({
  years,
  rawValues,
  movingAvgValues,
  cumulativeValues,
  activeValues,
  activePoints,
  movingPoints,
  fullRawValues,
  visibleStartIndex,
}: {
  years: number[]
  rawValues: number[]
  movingAvgValues: number[]
  cumulativeValues: number[]
  activeValues: number[]
  activePoints: TrajectoryPointLike[]
  movingPoints: TrajectoryPointLike[]
  fullRawValues: number[]
  visibleStartIndex: number
}): PublicationTrajectoryTooltipSlice[] {
  const visibleLength = Math.min(
    years.length,
    rawValues.length,
    movingAvgValues.length,
    cumulativeValues.length,
    activeValues.length,
    activePoints.length,
  )
  if (!visibleLength) {
    return []
  }
  const safeVisibleStartIndex = Math.max(0, Math.floor(visibleStartIndex))
  const clampPct = (value: number) => Math.max(0, Math.min(100, value))

  return activePoints.slice(0, visibleLength).map((point, index, points) => {
    const xPct = clampPct(point.x)
    const year = years[index] || 0
    const rawValue = Number(rawValues[index] || 0)
    const movingAvgValue = Number(movingAvgValues[index] || 0)
    const cumulativeValue = Number(cumulativeValues[index] || 0)
    const activeValue = Number(activeValues[index] || 0)
    const movingAvgYPct = movingPoints[index] ? clampPct(movingPoints[index].y) : null
    const fullIndex = safeVisibleStartIndex + index
    const previousRawValue = fullIndex > 0 ? Number(fullRawValues[fullIndex - 1] || 0) : null
    const rawDelta = previousRawValue === null ? null : rawValue - previousRawValue
    const rawDeltaPct = previousRawValue === null
      ? null
      : previousRawValue > 0
        ? ((rawValue - previousRawValue) / previousRawValue) * 100
        : rawDelta === 0
          ? 0
          : null

    if (points.length === 1) {
      return {
        key: `trajectory-tooltip-${year}-${index}`,
        year,
        rawValue,
        movingAvgValue,
        cumulativeValue,
        activeValue,
        previousRawValue,
        rawDelta,
        rawDeltaPct,
        xPct,
        yPct: clampPct(point.y),
        leftPct: 0,
        widthPct: 100,
        movingAvgYPct,
      }
    }

    const previousPoint = points[index - 1] || point
    const nextPoint = points[index + 1] || point
    const previousX = clampPct(previousPoint.x)
    const nextX = clampPct(nextPoint.x)
    const leftPct = index === 0 ? 0 : (previousX + xPct) / 2
    const rightPct = index === points.length - 1 ? 100 : (xPct + nextX) / 2

    return {
      key: `trajectory-tooltip-${year}-${index}`,
      year,
      rawValue,
      movingAvgValue,
      cumulativeValue,
      activeValue,
      previousRawValue,
      rawDelta,
      rawDeltaPct,
      xPct,
      yPct: clampPct(point.y),
      leftPct: clampPct(leftPct),
      widthPct: Math.max(0.75, Math.min(100, rightPct - leftPct)),
      movingAvgYPct,
    }
  })
}

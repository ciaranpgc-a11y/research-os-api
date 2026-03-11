export type PublicationTrajectorySeriesRecord = {
  year: number | null
  publicationDate: string | null
  publicationMonthStart: string | null
}

export type PublicationTrajectoryMovingAverageSeries = {
  values: number[]
  windowMonths: number[]
}

function shiftUtcMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
}

function formatMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthDiffInclusive(start: Date, end: Date): number {
  const yearDelta = end.getUTCFullYear() - start.getUTCFullYear()
  const monthDelta = end.getUTCMonth() - start.getUTCMonth()
  return (yearDelta * 12) + monthDelta + 1
}

function parseIsoMonthStart(value: string | null | undefined): Date | null {
  const token = String(value || '').trim()
  if (!token) {
    return null
  }
  const match = token.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(Date.UTC(Math.round(year), Math.round(month) - 1, 1))
}

function parseIsoPublicationDate(value: string | null | undefined): Date | null {
  const token = String(value || '').trim()
  if (!token) {
    return null
  }
  const match = token.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3] || 1)
  if (
    !Number.isFinite(year)
    || !Number.isFinite(month)
    || !Number.isFinite(day)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
  ) {
    return null
  }
  return new Date(Date.UTC(Math.round(year), Math.round(month) - 1, Math.round(day)))
}

export function resolvePublicationTrajectoryMonthStart(record: PublicationTrajectorySeriesRecord): Date | null {
  const parsedMonth = parseIsoMonthStart(record.publicationMonthStart)
  if (parsedMonth) {
    return parsedMonth
  }
  const parsedDate = parseIsoPublicationDate(record.publicationDate)
  if (parsedDate) {
    return new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1))
  }
  if (typeof record.year === 'number' && Number.isFinite(record.year)) {
    return new Date(Date.UTC(Math.round(record.year), 0, 1))
  }
  return null
}

function resolveObservedPublicationTrajectoryMonthStart(
  record: PublicationTrajectorySeriesRecord,
): Date | null {
  const parsedMonth = parseIsoMonthStart(record.publicationMonthStart)
  if (parsedMonth) {
    return parsedMonth
  }
  const parsedDate = parseIsoPublicationDate(record.publicationDate)
  if (parsedDate) {
    return new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1))
  }
  return null
}

export function resolvePublicationTrajectoryYear(record: PublicationTrajectorySeriesRecord): number | null {
  if (typeof record.year === 'number' && Number.isFinite(record.year)) {
    return Math.round(record.year)
  }
  const parsedMonth = parseIsoMonthStart(record.publicationMonthStart)
  if (parsedMonth) {
    return parsedMonth.getUTCFullYear()
  }
  const parsedDate = parseIsoPublicationDate(record.publicationDate)
  if (parsedDate) {
    return parsedDate.getUTCFullYear()
  }
  return null
}

export function mergePublicationTrajectoryYears(recordYears: number[], fallbackYears: number[]): number[] {
  const yearSet = new Set<number>()
  recordYears.forEach((year) => {
    if (Number.isInteger(year)) {
      yearSet.add(year)
    }
  })
  fallbackYears.forEach((year) => {
    if (Number.isInteger(year)) {
      yearSet.add(year)
    }
  })
  return Array.from(yearSet).sort((left, right) => left - right)
}

export function buildPublicationTrajectoryMovingAverageSeries({
  years,
  rawValues,
  records,
  asOfDate,
  monthlyValuesLifetime = [],
  monthLabelsLifetime = [],
  lifetimeMonthStart = null,
}: {
  years: number[]
  rawValues: number[]
  records: PublicationTrajectorySeriesRecord[]
  asOfDate: Date
  monthlyValuesLifetime?: number[]
  monthLabelsLifetime?: string[]
  lifetimeMonthStart?: string | null
}): PublicationTrajectoryMovingAverageSeries {
  const safeAsOfDate = Number.isFinite(asOfDate.getTime()) ? asOfDate : new Date()
  const asOfYear = safeAsOfDate.getUTCFullYear()
  const asOfMonthIndex = safeAsOfDate.getUTCMonth()
  const currentMonthStart = new Date(Date.UTC(asOfYear, asOfMonthIndex, 1))
  const lastCompleteMonthStart = shiftUtcMonth(currentMonthStart, -1)
  const lifetimeCounts = monthlyValuesLifetime
    .map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
  const lifetimeLabels = monthLabelsLifetime
    .map((value) => String(value || '').trim())
  const parsedLifetimeStart = parseIsoPublicationDate(lifetimeMonthStart)
  const monthlyCountByKey = new Map<string, number>()
  let firstAvailableMonthStart: Date | null = null

  lifetimeCounts.forEach((count, index) => {
    const parsedMonthStart = parseIsoMonthStart(lifetimeLabels[index] || '')
    const monthStart = parsedMonthStart
      || (parsedLifetimeStart ? shiftUtcMonth(parsedLifetimeStart, index) : null)
      || shiftUtcMonth(currentMonthStart, index - lifetimeCounts.length)
    if (!monthStart || monthStart.getTime() >= currentMonthStart.getTime()) {
      return
    }
    monthlyCountByKey.set(formatMonthKey(monthStart), count)
    if (!firstAvailableMonthStart || monthStart.getTime() < firstAvailableMonthStart.getTime()) {
      firstAvailableMonthStart = monthStart
    }
  })

  records.forEach((record) => {
    const monthStart = resolveObservedPublicationTrajectoryMonthStart(record)
    if (!monthStart || monthStart.getTime() >= currentMonthStart.getTime()) {
      return
    }
    const monthKey = formatMonthKey(monthStart)
    if (monthlyCountByKey.has(monthKey)) {
      return
    }
    monthlyCountByKey.set(monthKey, (monthlyCountByKey.get(monthKey) || 0) + 1)
    if (!firstAvailableMonthStart || monthStart.getTime() < firstAvailableMonthStart.getTime()) {
      firstAvailableMonthStart = monthStart
    }
  })

  const annualFallbackValue = (index: number): number => {
    const start = Math.max(0, index - 2)
    const rawWindow = rawValues.slice(start, index + 1)
    return rawWindow.length ? (rawWindow.reduce((sum, value) => sum + value, 0) / rawWindow.length) : 0
  }
  const annualFallbackWindowMonths = (index: number): number => {
    const start = Math.max(0, index - 2)
    return Math.max(1, index - start + 1) * 12
  }

  const values: number[] = []
  const windowMonths: number[] = []
  rawValues.forEach((_, index) => {
    const year = years[index]
    if (!firstAvailableMonthStart) {
      values.push(annualFallbackValue(index))
      windowMonths.push(annualFallbackWindowMonths(index))
      return
    }
    const endMonthStart = year >= asOfYear
      ? lastCompleteMonthStart
      : new Date(Date.UTC(year, 11, 1))
    if (endMonthStart.getTime() < firstAvailableMonthStart.getTime()) {
      values.push(annualFallbackValue(index))
      windowMonths.push(annualFallbackWindowMonths(index))
      return
    }
    const windowStart = shiftUtcMonth(endMonthStart, -35)
    const effectiveWindowStart = windowStart.getTime() < firstAvailableMonthStart.getTime()
      ? firstAvailableMonthStart
      : windowStart
    const monthsCovered = Math.max(1, monthDiffInclusive(effectiveWindowStart, endMonthStart))
    let total = 0
    for (let monthIndex = 0; monthIndex < monthsCovered; monthIndex += 1) {
      const monthStart = shiftUtcMonth(effectiveWindowStart, monthIndex)
      total += monthlyCountByKey.get(formatMonthKey(monthStart)) || 0
    }
    values.push((total / monthsCovered) * 12)
    windowMonths.push(monthsCovered)
  })
  return { values, windowMonths }
}

export function formatTrajectoryMovingAveragePeriodLabel(year: number, asOfDate: Date): string {
  const safeAsOfDate = Number.isFinite(asOfDate.getTime()) ? asOfDate : new Date()
  const endMonth = year >= safeAsOfDate.getUTCFullYear()
    ? shiftUtcMonth(new Date(Date.UTC(safeAsOfDate.getUTCFullYear(), safeAsOfDate.getUTCMonth(), 1)), -1)
    : new Date(Date.UTC(year, 11, 1))
  return endMonth.toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatTrajectoryMovingAverageWindowLabel(windowMonths: number): string {
  const safeMonths = Math.max(1, Math.round(windowMonths || 0))
  return `Rolling ${safeMonths}-month pace`
}

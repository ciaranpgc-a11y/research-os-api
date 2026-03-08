export type PublicationTrajectorySeriesRecord = {
  year: number | null
  publicationDate: string | null
  publicationMonthStart: string | null
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

function resolvePublicationTrajectoryMonthStart(record: PublicationTrajectorySeriesRecord): Date | null {
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
}: {
  years: number[]
  rawValues: number[]
  records: PublicationTrajectorySeriesRecord[]
  asOfDate: Date
}): number[] {
  const safeAsOfDate = Number.isFinite(asOfDate.getTime()) ? asOfDate : new Date()
  const asOfYear = safeAsOfDate.getUTCFullYear()
  const asOfMonthIndex = safeAsOfDate.getUTCMonth()
  const lastCompleteMonthIndex = asOfMonthIndex === 0 ? 11 : asOfMonthIndex - 1
  const comparableCountsByYear = new Map<number, number>()

  records.forEach((record) => {
    const recordYear = resolvePublicationTrajectoryYear(record)
    if (recordYear === null) {
      return
    }
    const monthStart = resolvePublicationTrajectoryMonthStart(record)
    if (!monthStart) {
      comparableCountsByYear.set(recordYear, (comparableCountsByYear.get(recordYear) || 0) + 1)
      return
    }
    if (recordYear === asOfYear && asOfMonthIndex === 0) {
      return
    }
    const cutoffMonthStart = new Date(Date.UTC(recordYear, lastCompleteMonthIndex, 1))
    if (monthStart.getTime() <= cutoffMonthStart.getTime()) {
      comparableCountsByYear.set(recordYear, (comparableCountsByYear.get(recordYear) || 0) + 1)
    }
  })

  return rawValues.map((_, index) => {
    const start = Math.max(0, index - 2)
    const windowYears = years.slice(start, index + 1)
    const rawWindow = rawValues.slice(start, index + 1)
    if (years[index] !== asOfYear) {
      return rawWindow.length ? (rawWindow.reduce((sum, value) => sum + value, 0) / rawWindow.length) : 0
    }
    const comparableWindow = windowYears.map((windowYear, windowIndex) => (
      comparableCountsByYear.get(windowYear) ?? rawWindow[windowIndex] ?? 0
    ))
    return comparableWindow.length ? (comparableWindow.reduce((sum, value) => sum + value, 0) / comparableWindow.length) : 0
  })
}

export function formatTrajectoryMovingAveragePeriodLabel(year: number, asOfDate: Date): string {
  const safeAsOfDate = Number.isFinite(asOfDate.getTime()) ? asOfDate : new Date()
  if (year !== safeAsOfDate.getUTCFullYear() || safeAsOfDate.getUTCMonth() === 0) {
    return String(year)
  }
  return new Date(Date.UTC(year, safeAsOfDate.getUTCMonth() - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

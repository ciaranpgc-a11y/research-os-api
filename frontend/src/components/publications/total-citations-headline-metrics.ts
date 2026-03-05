import type { PublicationMetricTilePayload } from '@/types/impact'

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const parsed = Number(item)
      return Number.isFinite(parsed) ? parsed : 0
    })
    .filter((item) => Number.isFinite(item))
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function formatInt(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0
  const boundedValue = Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, finiteValue))
  return Math.round(boundedValue).toLocaleString('en-GB')
}

function parseMetricNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseMonthIndex(value: string): number | null {
  const token = String(value || '').trim().toLowerCase()
  if (!token) {
    return null
  }
  const direct = MONTH_INDEX_BY_NAME[token]
  if (typeof direct === 'number') {
    return direct
  }
  const firstWord = token.split(/[\s/-]+/)[0]
  const fromFirstWord = MONTH_INDEX_BY_NAME[firstWord]
  return typeof fromFirstWord === 'number' ? fromFirstWord : null
}

export function buildTotalCitationsHeadlineMetricTiles(tile: PublicationMetricTilePayload): Array<{ label: string; value: string }> {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const yearsRaw = toNumberArray(chartData.years).map((item) => Math.round(item))
  const valuesRaw = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const pairCount = Math.min(yearsRaw.length, valuesRaw.length)
  const yearlyPairs = Array.from({ length: pairCount }, (_, index) => ({
    year: yearsRaw[index],
    value: valuesRaw[index],
  })).sort((left, right) => left.year - right.year)

  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const resolvedCurrentYearYtd = Number.isFinite(currentYearYtdRaw)
    ? Math.max(0, currentYearYtdRaw)
    : Math.max(
      0,
      yearlyPairs.find((entry) => entry.year === projectedYear)?.value
      ?? yearlyPairs[yearlyPairs.length - 1]?.value
      ?? 0,
    )

  const historyCitations = yearlyPairs
    .filter((entry) => entry.year !== projectedYear)
    .concat(
      yearlyPairs.length > 0 || Number.isFinite(currentYearYtdRaw)
        ? [{ year: projectedYear, value: resolvedCurrentYearYtd }]
        : [],
    )
    .sort((left, right) => left.year - right.year)

  const sumNumbers = (items: number[]) => items.reduce((sum, value) => sum + Math.max(0, value), 0)
  const tileValueRaw = parseMetricNumber(tile.value)
    ?? parseMetricNumber(tile.main_value)
    ?? parseMetricNumber(tile.value_display)
    ?? parseMetricNumber(tile.main_value_display)
  const totalCitations = tileValueRaw !== null && tileValueRaw >= 0
    ? Math.round(tileValueRaw)
    : Math.round(sumNumbers(historyCitations.map((entry) => entry.value)))

  const meanValueRaw = Number(chartData.mean_value)
  const meanCitations = Number.isFinite(meanValueRaw) && meanValueRaw > 0
    ? (Math.round(meanValueRaw * 10) / 10).toFixed(1)
    : historyCitations.length > 0
      ? (Math.round((sumNumbers(historyCitations.map((entry) => entry.value)) / historyCitations.length) * 10) / 10).toFixed(1)
      : '\u2014'

  const lifetimeMonthlySeries = toNumberArray(chartData.monthly_values_lifetime).map((item) => Math.max(0, item))
  const rollingWindowYearsSum = (windowYears: number) => sumNumbers(historyCitations.slice(-windowYears).map((entry) => entry.value))
  const rollingWindowMonthsSum = (windowMonths: number) => {
    if (lifetimeMonthlySeries.length > 0) {
      return sumNumbers(lifetimeMonthlySeries.slice(-windowMonths))
    }
    return rollingWindowYearsSum(Math.max(1, Math.round(windowMonths / 12)))
  }

  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const monthlyLabels = toStringArray(chartData.month_labels_12m)
  const currentMonthIndex = new Date().getUTCMonth()
  const sourceLastMonthIndex = monthlyLabels.length ? parseMonthIndex(monthlyLabels[monthlyLabels.length - 1]) : null
  const sourceLikelyIncludesCurrentMonth = sourceLastMonthIndex !== null && sourceLastMonthIndex === currentMonthIndex
  const sourceValuesWindow = monthlySeries.length >= 13 && sourceLikelyIncludesCurrentMonth
    ? monthlySeries.slice(-13, -1)
    : monthlySeries.length >= 12
      ? monthlySeries.slice(-12)
      : monthlySeries
  const rolling1Year = Math.round(
    monthlySeries.length > 0
      ? sumNumbers(sourceValuesWindow)
      : rollingWindowYearsSum(1),
  )
  const rolling3Year = Math.round(rollingWindowMonthsSum(36))
  const rolling5Year = Math.round(rollingWindowMonthsSum(60))

  const firstCitationYearCandidates = historyCitations
    .filter((entry) => entry.value > 0)
    .map((entry) => entry.year)
  const firstCitationYear = firstCitationYearCandidates.length ? Math.min(...firstCitationYearCandidates) : null
  const activeYears = firstCitationYear !== null ? Math.max(1, projectedYear - firstCitationYear + 1) : 0

  return [
    { label: 'Total citations', value: formatInt(totalCitations) },
    { label: 'Active years', value: activeYears > 0 ? formatInt(activeYears) : '\u2014' },
    { label: 'Mean yearly citations', value: meanCitations },
    { label: 'Last 1 year', value: formatInt(rolling1Year) },
    { label: 'Last 3 years', value: formatInt(rolling3Year) },
    { label: 'Last 5 years', value: formatInt(rolling5Year) },
    { label: 'Year-to-date', value: formatInt(Math.round(resolvedCurrentYearYtd)) },
  ]
}

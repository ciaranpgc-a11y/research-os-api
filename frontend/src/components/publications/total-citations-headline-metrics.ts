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
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
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
  const projectedValueRaw = Number(chartData.projected_value)
  const projectedCurrentYear = Number.isFinite(projectedValueRaw)
    ? Math.max(0, Math.round(projectedValueRaw))
    : Math.round(resolvedCurrentYearYtd)

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

  const publications = Array.isArray(drilldown.publications) ? drilldown.publications : []
  const publicationYears = publications
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const year = Number((item as Record<string, unknown>).year)
      return Number.isInteger(year) ? year : null
    })
    .filter((year): year is number => year !== null)
  const firstCitationYearCandidates = (publicationYears.length > 0 ? publicationYears : historyCitations
    .filter((entry) => entry.value > 0)
    .map((entry) => entry.year))
  const firstCitationYear = firstCitationYearCandidates.length ? Math.min(...firstCitationYearCandidates) : null
  const activeYears = firstCitationYear !== null ? Math.max(1, projectedYear - firstCitationYear + 1) : 0

  const meanValueRaw = Number(chartData.mean_value)
  const computedMeanCitations = activeYears > 0
    ? totalCitations / activeYears
    : Number.isFinite(meanValueRaw) && meanValueRaw > 0
      ? meanValueRaw
      : historyCitations.length > 0
      ? sumNumbers(historyCitations.map((entry) => entry.value)) / historyCitations.length
      : '\u2014'
  const meanCitations = typeof computedMeanCitations === 'number'
    ? formatInt(Math.round(computedMeanCitations))
    : computedMeanCitations

  const rollingWindowYearsSum = (windowYears: number) => sumNumbers(historyCitations.slice(-windowYears).map((entry) => entry.value))

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
  const medianCitationsValue = (() => {
    const publicationCitationValues = publications
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const row = item as Record<string, unknown>
        const citations = Number(row.citations_lifetime ?? row.citations ?? row.cited_by_count)
        return Number.isFinite(citations) ? Math.max(0, Math.round(citations)) : null
      })
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)
    if (!publicationCitationValues.length) {
      return '\u2014'
    }
    const middleIndex = Math.floor(publicationCitationValues.length / 2)
    const median = publicationCitationValues.length % 2 === 0
      ? (publicationCitationValues[middleIndex - 1] + publicationCitationValues[middleIndex]) / 2
      : publicationCitationValues[middleIndex]
    const rounded = Math.round(median * 10) / 10
    return Math.abs(rounded - Math.round(rounded)) <= 1e-9
      ? formatInt(Math.round(rounded))
      : rounded.toFixed(1)
  })()
  const topCitedPaperValue = (() => {
    const publicationCitationValues = publications
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const row = item as Record<string, unknown>
        const citations = Number(row.citations_lifetime ?? row.citations ?? row.cited_by_count)
        return Number.isFinite(citations) ? Math.max(0, Math.round(citations)) : null
      })
      .filter((value): value is number => value !== null)
    if (!publicationCitationValues.length) {
      return '\u2014'
    }
    return formatInt(Math.max(...publicationCitationValues))
  })()
  const bestCitationYear = (() => {
    const completedYears = historyCitations.filter((entry) => entry.year !== projectedYear && entry.value > 0)
    if (!completedYears.length) {
      return null
    }
    return completedYears.reduce((best, entry) => (entry.value > best.value ? entry : best), completedYears[0])
  })()

  return [
    { label: 'Total citations', value: formatInt(totalCitations) },
    { label: `Projected ${projectedYear}`, value: formatInt(projectedCurrentYear) },
    { label: 'Last 1 year (rolling)', value: formatInt(rolling1Year) },
    { label: 'Year-to-date', value: formatInt(Math.round(resolvedCurrentYearYtd)) },
    { label: 'Mean yearly citations', value: meanCitations },
    { label: 'Median citations', value: medianCitationsValue },
    { label: 'Top cited paper', value: topCitedPaperValue },
    {
      label: bestCitationYear ? `Best year (${bestCitationYear.year})` : 'Best year',
      value: bestCitationYear ? formatInt(Math.round(bestCitationYear.value)) : '\u2014',
    },
  ]
}

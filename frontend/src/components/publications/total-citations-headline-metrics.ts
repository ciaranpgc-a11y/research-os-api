import type { PublicationMetricTilePayload } from '@/types/impact'

export type TotalCitationsHeadlineStats = {
  publicationCount: number
  totalCitations: number
  projectedYear: number
  projectedCurrentYear: number
  rolling1Year: number
  resolvedCurrentYearYtd: number
  citationsPerPaperValue: string
  citationsPerPaperRaw: number | null
  meanCitations: string
  meanCitationsRaw: number | null
  medianCitationsValue: string
  medianCitationsRaw: number | null
  uncitedPapersValue: string
  uncitedPapersCount: number
  uncitedPapersPct: number
  citedPapers10PlusCount: number
  citedPapers10PlusPct: number
  citedPapers25PlusCount: number
  citedPapers25PlusPct: number
  citedPapers100PlusCount: number
  citedPapers100PlusPct: number
  recentConcentrationValue: string
  recentConcentrationPct: number | null
  recentConcentrationTopThreeCitations: number
  recentConcentrationOtherCitations: number
  newlyCitedPapersValue: string
  newlyCitedPapersCount: number
  citationHalfLifeProxyValue: string
  citationHalfLifeOlderPct: number | null
  citationHalfLifeOlderCitations: number
  citationHalfLifeNewerCitations: number
  topDecilePaperCount: number
  topDecileCitationCount: number
  topDecileCitationSharePct: number | null
  topCitedPaperValue: string
  topCitedPaperRaw: number | null
  bestCitationYear: { year: number; value: number } | null
}

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

function formatDecimal(value: number, decimals: number = 1): string {
  const boundedValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(boundedValue * (10 ** decimals)) / (10 ** decimals)
  return rounded.toFixed(decimals)
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

export function buildTotalCitationsHeadlineStats(tile: PublicationMetricTilePayload): TotalCitationsHeadlineStats {
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
  const publicationRows = publications
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = item as Record<string, unknown>
      const year = Number(row.year)
      const citationsLifetime = parseMetricNumber(row.citations_lifetime ?? row.citations ?? row.cited_by_count)
      const citations1yRolling = parseMetricNumber(row.citations_1y_rolling)
      return {
        year: Number.isInteger(year) ? year : null,
        citationsLifetime: citationsLifetime !== null ? Math.max(0, citationsLifetime) : 0,
        citations1yRolling: citations1yRolling !== null ? Math.max(0, citations1yRolling) : 0,
      }
    })
    .filter((row): row is { year: number | null; citationsLifetime: number; citations1yRolling: number } => row !== null)
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
  const publicationCount = publicationRows.length
  const publicationCitationValues = publicationRows
    .map((row) => Math.max(0, Math.round(row.citationsLifetime)))
  const sortedPublicationCitationValuesAsc = [...publicationCitationValues].sort((left, right) => left - right)
  const sortedPublicationCitationValuesDesc = [...publicationCitationValues].sort((left, right) => right - left)
  const uncitedCount = publicationCitationValues.filter((value) => value <= 0).length
  const countAtLeast = (threshold: number) => publicationCitationValues.filter((value) => value >= threshold).length
  const citedPapers10PlusCount = countAtLeast(10)
  const citedPapers25PlusCount = countAtLeast(25)
  const citedPapers100PlusCount = countAtLeast(100)
  const topDecilePaperCount = publicationCount > 0 ? Math.max(1, Math.ceil(publicationCount * 0.1)) : 0
  const topDecileCitationCount = topDecilePaperCount > 0
    ? sortedPublicationCitationValuesDesc.slice(0, topDecilePaperCount).reduce((sum, value) => sum + value, 0)
    : 0
  const topDecileCitationSharePctRaw = totalCitations > 0 && topDecilePaperCount > 0
    ? (topDecileCitationCount / totalCitations) * 100
    : null
  const citationsPerPaperValue = publicationCount > 0
    ? formatDecimal(totalCitations / publicationCount, 1)
    : '\u2014'
  const medianCitationsValue = (() => {
    if (!sortedPublicationCitationValuesAsc.length) {
      return '\u2014'
    }
    const middleIndex = Math.floor(sortedPublicationCitationValuesAsc.length / 2)
    const median = sortedPublicationCitationValuesAsc.length % 2 === 0
      ? (sortedPublicationCitationValuesAsc[middleIndex - 1] + sortedPublicationCitationValuesAsc[middleIndex]) / 2
      : sortedPublicationCitationValuesAsc[middleIndex]
    const rounded = Math.round(median * 10) / 10
    return Math.abs(rounded - Math.round(rounded)) <= 1e-9
      ? formatInt(Math.round(rounded))
      : rounded.toFixed(1)
  })()
  const uncitedPapersValue = (() => {
    if (!publicationCount) {
      return '\u2014'
    }
    const uncitedShare = publicationCount > 0 ? (uncitedCount / publicationCount) * 100 : 0
    return `${formatInt(uncitedCount)} (${Math.round(uncitedShare)}%)`
  })()
  const recentConcentrationValue = (() => {
    const rollingValues = publicationRows
      .map((row) => Math.max(0, row.citations1yRolling))
      .filter((value) => value > 0)
      .sort((left, right) => right - left)
    if (!rollingValues.length) {
      return '\u2014'
    }
    const totalRecentCitations = rollingValues.reduce((sum, value) => sum + value, 0)
    if (totalRecentCitations <= 0) {
      return '\u2014'
    }
    const topThreeRecentCitations = rollingValues.slice(0, 3).reduce((sum, value) => sum + value, 0)
    return `${Math.round((topThreeRecentCitations / totalRecentCitations) * 100)}%`
  })()
  const recentConcentrationTopThreeCitations = (() => {
    const rollingValues = publicationRows
      .map((row) => Math.max(0, row.citations1yRolling))
      .filter((value) => value > 0)
      .sort((left, right) => right - left)
    return rollingValues.slice(0, 3).reduce((sum, value) => sum + value, 0)
  })()
  const recentConcentrationOtherCitations = (() => {
    const rollingValues = publicationRows
      .map((row) => Math.max(0, row.citations1yRolling))
      .filter((value) => value > 0)
      .sort((left, right) => right - left)
    return Math.max(0, rollingValues.slice(3).reduce((sum, value) => sum + value, 0))
  })()
  const recentConcentrationPctRaw = recentConcentrationTopThreeCitations + recentConcentrationOtherCitations > 0
    ? (recentConcentrationTopThreeCitations / (recentConcentrationTopThreeCitations + recentConcentrationOtherCitations)) * 100
    : null
  const newlyCitedPapersValue = (() => {
    if (!publicationCount) {
      return '\u2014'
    }
    const citedRecentlyCount = publicationRows.filter((row) => row.citations1yRolling > 0).length
    return formatInt(citedRecentlyCount)
  })()
  const citationHalfLifeProxyValue = (() => {
    if (!publicationRows.length || totalCitations <= 0) {
      return '\u2014'
    }
    const olderCitationCutoffYear = projectedYear - 5
    const olderPaperCitations = publicationRows.reduce((sum, row) => (
      row.year !== null && row.year <= olderCitationCutoffYear
        ? sum + Math.max(0, row.citationsLifetime)
        : sum
    ), 0)
    return `${Math.round((olderPaperCitations / totalCitations) * 100)}% older`
  })()
  const citationHalfLifeOlderCitations = publicationRows.reduce((sum, row) => (
    row.year !== null && row.year <= projectedYear - 5
      ? sum + Math.max(0, row.citationsLifetime)
      : sum
  ), 0)
  const citationHalfLifeNewerCitations = Math.max(0, totalCitations - citationHalfLifeOlderCitations)
  const citationHalfLifeOlderPctRaw = totalCitations > 0
    ? (citationHalfLifeOlderCitations / totalCitations) * 100
    : null
  const topCitedPaperValue = (() => {
    if (!sortedPublicationCitationValuesDesc.length) {
      return '\u2014'
    }
    return formatInt(sortedPublicationCitationValuesDesc[0])
  })()
  const bestCitationYear = (() => {
    const completedYears = historyCitations.filter((entry) => entry.year !== projectedYear && entry.value > 0)
    if (!completedYears.length) {
      return null
    }
    return completedYears.reduce((best, entry) => (entry.value > best.value ? entry : best), completedYears[0])
  })()

  return {
    publicationCount,
    totalCitations,
    projectedYear,
    projectedCurrentYear,
    rolling1Year,
    resolvedCurrentYearYtd: Math.round(resolvedCurrentYearYtd),
    citationsPerPaperValue,
    citationsPerPaperRaw: publicationCount > 0 ? totalCitations / publicationCount : null,
    meanCitations,
    meanCitationsRaw: typeof computedMeanCitations === 'number' ? computedMeanCitations : null,
    medianCitationsValue,
    medianCitationsRaw: typeof medianCitationsValue === 'string' && medianCitationsValue !== '\u2014'
      ? parseMetricNumber(medianCitationsValue)
      : null,
    uncitedPapersValue,
    uncitedPapersCount: uncitedCount,
    uncitedPapersPct: publicationCount > 0
      ? (uncitedCount / publicationCount) * 100
      : 0,
    citedPapers10PlusCount,
    citedPapers10PlusPct: publicationCount > 0 ? (citedPapers10PlusCount / publicationCount) * 100 : 0,
    citedPapers25PlusCount,
    citedPapers25PlusPct: publicationCount > 0 ? (citedPapers25PlusCount / publicationCount) * 100 : 0,
    citedPapers100PlusCount,
    citedPapers100PlusPct: publicationCount > 0 ? (citedPapers100PlusCount / publicationCount) * 100 : 0,
    recentConcentrationValue,
    recentConcentrationPct: recentConcentrationPctRaw,
    recentConcentrationTopThreeCitations,
    recentConcentrationOtherCitations,
    newlyCitedPapersValue,
    newlyCitedPapersCount: publicationCount > 0 ? publicationRows.filter((row) => row.citations1yRolling > 0).length : 0,
    citationHalfLifeProxyValue,
    citationHalfLifeOlderPct: citationHalfLifeOlderPctRaw,
    citationHalfLifeOlderCitations,
    citationHalfLifeNewerCitations,
    topDecilePaperCount,
    topDecileCitationCount,
    topDecileCitationSharePct: topDecileCitationSharePctRaw,
    topCitedPaperValue,
    topCitedPaperRaw: topCitedPaperValue === '\u2014' ? null : parseMetricNumber(topCitedPaperValue),
    bestCitationYear,
  }
}

export function buildTotalCitationsHeadlineMetricTiles(tile: PublicationMetricTilePayload): Array<{ label: string; value: string }> {
  const stats = buildTotalCitationsHeadlineStats(tile)
  return [
    { label: 'Total citations', value: formatInt(stats.totalCitations) },
    { label: `Projected in ${stats.projectedYear}`, value: formatInt(stats.projectedCurrentYear) },
    { label: 'Last 1 year (rolling)', value: formatInt(stats.rolling1Year) },
    { label: 'Year-to-date', value: formatInt(stats.resolvedCurrentYearYtd) },
    { label: 'Citations per publication', value: stats.citationsPerPaperValue },
    { label: 'Top 3 publications, last 12 months', value: stats.recentConcentrationValue },
    { label: 'Top cited publication', value: stats.topCitedPaperValue },
    {
      label: stats.bestCitationYear ? `Best year (${stats.bestCitationYear.year})` : 'Best year',
      value: stats.bestCitationYear ? formatInt(Math.round(stats.bestCitationYear.value)) : '\u2014',
    },
  ]
}

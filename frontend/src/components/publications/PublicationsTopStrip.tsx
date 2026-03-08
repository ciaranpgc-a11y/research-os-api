import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowUpRight, Download, Eye, EyeOff, FileText, Hammer, Share2, X } from 'lucide-react'

import { Button, Card, CardContent, DrilldownSheet, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { HelpTooltipIconButton, InsightsGlyph, SectionTools } from '@/components/patterns'
import { Section, SectionHeader } from '@/components/primitives'
import { readAccountSettings } from '@/lib/account-preferences'
import { fetchPublicationInsightsAgent, fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationInsightsAgentPayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { dashboardTileStyles } from './dashboard-tile-styles'
import {
  publicationsHouseActions,
  publicationsHouseDividers,
  publicationsHouseCharts,
  publicationsHouseDrilldown,
  publicationsHouseHeadings,
  publicationsHouseMotion,
  publicationsHouseSurfaces,
} from './publications-house-style'
import {
  buildTotalCitationsHeadlineMetricTiles,
  buildTotalCitationsHeadlineStats,
  type TotalCitationsHeadlineStats,
} from './total-citations-headline-metrics'
import {
  buildHIndexDrilldownStats,
  buildHIndexHeadlineMetricTiles,
  type HIndexDrilldownStats,
} from './h-index-drilldown-metrics'
import { buildHIndexMethodsSections } from './h-index-methods'
import {
  buildAuthorshipCompositionDrilldownStats,
  buildCollaborationStructureDrilldownStats,
  buildFieldPercentileShareDrilldownStats,
  buildImpactConcentrationDrilldownStats,
  buildInfluentialCitationsDrilldownStats,
  buildMomentumDrilldownStats,
  buildRemainingMetricMethodsSections,
  isEnhancedGenericMetricKey,
  type AuthorshipCompositionDrilldownStats,
  type CollaborationStructureDrilldownStats,
  type FieldPercentileShareDrilldownStats,
  type ImpactConcentrationDrilldownStats,
  type InfluentialCitationsDrilldownStats,
  type MomentumDrilldownStats,
} from './remaining-metric-drilldown'
import { buildTotalPublicationsMethodsSections } from './total-publications-methods'
import { PublicationBreakdownTable } from './PublicationBreakdownTable'
import { buildTrajectoryYearTicks, getTrajectoryYearTickAnchor } from './publication-trajectory-axis'
import {
  buildPublicationTrajectoryMovingAverageSeries,
  formatTrajectoryMovingAveragePeriodLabel,
  mergePublicationTrajectoryYears,
  resolvePublicationTrajectoryYear,
} from './publication-trajectory-series'
import { buildTrajectoryTooltipSlices, type PublicationTrajectoryTooltipSlice } from './publication-trajectory-tooltip'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
  forceInsightsVisible?: boolean
}

type PublicationInsightsSectionKey = 'uncited_works' | 'citation_drivers' | 'citation_activation' | 'citation_activation_history' | 'publication_output_pattern' | 'publication_production_phase' | 'publication_volume_over_time' | 'publication_article_type_over_time' | 'publication_type_over_time'
type PublicationInsightAction = {
  key: string
  label: string
  description: string
  onSelect: () => void
}

function estimatePolylineLength(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) {
    return 0
  }
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const dx = current.x - previous.x
    const dy = current.y - previous.y
    total += Math.hypot(dx, dy)
  }
  return total
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

function formatInt(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0
  const boundedValue = Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, finiteValue))
  return Math.round(boundedValue).toLocaleString('en-GB')
}

function normalizePublicationYearSeries(publicationsPerYear: number[]): number[] {
  return publicationsPerYear
    .map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
    .filter((value) => Number.isFinite(value))
}

export function calculatePublicationConsistencyIndex(publicationsPerYear: number[]): number {
  const series = normalizePublicationYearSeries(publicationsPerYear)
  if (!series.length) {
    return 0
  }
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length
  if (mean <= 1e-9) {
    return 0
  }
  const variance = series.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / series.length
  const coefficientOfVariation = Math.sqrt(variance) / mean
  const rawScore = 1 - coefficientOfVariation
  return Math.max(0, Math.min(1, rawScore))
}

export function calculatePublicationBurstinessScore(publicationsPerYear: number[]): number {
  const series = normalizePublicationYearSeries(publicationsPerYear)
  if (!series.length) {
    return 0
  }
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length
  if (mean <= 1e-9) {
    return 0
  }
  const variance = series.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / series.length
  const coefficientOfVariation = Math.sqrt(variance) / mean
  return Math.max(0, Math.min(1, coefficientOfVariation / (1 + coefficientOfVariation)))
}

export function calculatePublicationPeakYearShare(publicationsPerYear: number[]): number {
  const series = normalizePublicationYearSeries(publicationsPerYear)
  if (!series.length) {
    return 0
  }
  const total = series.reduce((sum, value) => sum + value, 0)
  if (total <= 1e-9) {
    return 0
  }
  return Math.max(0, Math.min(1, Math.max(...series) / total))
}

export function getPublicationConsistencyInterpretation(value: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (normalized >= 0.75) {
    return 'Very consistent'
  }
  if (normalized >= 0.55) {
    return 'Consistent'
  }
  if (normalized >= 0.35) {
    return 'Moderately variable'
  }
  if (normalized >= 0.2) {
    return 'Bursty'
  }
  return 'Highly bursty'
}

export function getPublicationBurstinessInterpretation(value: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (normalized > 0.8) {
    return 'Highly bursty'
  }
  if (normalized > 0.6) {
    return 'Bursty'
  }
  if (normalized > 0.4) {
    return 'Moderately bursty'
  }
  if (normalized > 0.2) {
    return 'Moderately steady'
  }
  return 'Very steady'
}

export function getPublicationPeakYearShareInterpretation(value: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (normalized < 0.12) {
    return 'Very distributed'
  }
  if (normalized < 0.2) {
    return 'Distributed'
  }
  if (normalized < 0.3) {
    return 'Moderately concentrated'
  }
  if (normalized < 0.4) {
    return 'Concentrated'
  }
  return 'Highly concentrated'
}

export function getPublicationPeakYearShareCaution(totalPublications: number): string | null {
  const normalized = Number.isFinite(totalPublications) ? Math.max(0, totalPublications) : 0
  if (normalized > 0 && normalized < 15) {
    return 'Interpret with caution: small portfolio'
  }
  return null
}

export function shouldShowPublicationPeakYearShareInterpretation(totalPublications: number): boolean {
  const normalized = Number.isFinite(totalPublications) ? Math.max(0, totalPublications) : 0
  return normalized >= 10
}

export function calculatePublicationOutputContinuity(publicationsPerYear: number[]): number {
  const series = normalizePublicationYearSeries(publicationsPerYear)
  if (!series.length) {
    return 0
  }
  const yearsWithOutput = series.filter((value) => value >= 1).length
  return Math.max(0, Math.min(1, yearsWithOutput / series.length))
}

export function calculatePublicationLongestStreak(publicationsPerYear: number[]): number {
  const series = normalizePublicationYearSeries(publicationsPerYear)
  let currentStreak = 0
  let longestStreak = 0
  series.forEach((value) => {
    if (value >= 1) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
      return
    }
    currentStreak = 0
  })
  return longestStreak
}

export function getPublicationOutputContinuityInterpretation(value: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  if (normalized >= 0.85) {
    return 'Continuous output'
  }
  if (normalized >= 0.7) {
    return 'Highly active'
  }
  if (normalized >= 0.5) {
    return 'Intermittent'
  }
  if (normalized >= 0.3) {
    return 'Episodic'
  }
  return 'Sporadic'
}

function calculatePublicationProductionTrendSlope(years: number[], values: number[]): number | null {
  const pairCount = Math.min(years.length, values.length)
  if (pairCount < 2) {
    return null
  }
  const safeYears = years.slice(0, pairCount).map((year) => Number(year))
  const safeValues = values.slice(0, pairCount).map((value) => Math.max(0, Number(value)))
  const meanYear = safeYears.reduce((sum, year) => sum + year, 0) / pairCount
  const meanValue = safeValues.reduce((sum, value) => sum + value, 0) / pairCount
  const denominator = safeYears.reduce((sum, year) => sum + ((year - meanYear) ** 2), 0)
  if (denominator <= 1e-9) {
    return 0
  }
  const numerator = safeYears.reduce(
    (sum, year, index) => sum + ((year - meanYear) * ((safeValues[index] ?? 0) - meanValue)),
    0,
  )
  return numerator / denominator
}

function meanPublicationSeries(values: number[]): number | null {
  if (!values.length) {
    return null
  }
  return values.reduce((sum, value) => sum + Math.max(0, value), 0) / values.length
}

export type PublicationProductionPatternStats = {
  totalPublications: number
  scopedPublicationCount: number
  firstPublicationYear: number | null
  lastPublicationYear: number | null
  activeSpan: number
  years: number[]
  series: number[]
  yearsWithOutput: number
  outputContinuity: number | null
  longestStreak: number
  consistencyIndex: number | null
  burstinessScore: number | null
  peakYearShare: number | null
  lowVolume: boolean
  includesPartialYear: boolean
  partialYear: number | null
  emptyReason: string | null
}

type PublicationProductionYearSeriesScope = {
  totalPublications: number
  scopedPublicationCount: number
  firstPublicationYear: number | null
  lastPublicationYear: number | null
  activeSpan: number
  years: number[]
  series: number[]
  lowVolume: boolean
  includesPartialYear: boolean
  partialYear: number | null
  emptyReason: string | null
}

export type PublicationProductionPhaseLabel =
  | 'Emerging'
  | 'Scaling'
  | 'Established'
  | 'Plateauing'
  | 'Contracting'
  | 'Rebuilding'

export type PublicationProductionPhaseStats = {
  phase: PublicationProductionPhaseLabel | null
  phaseLabel: string
  interpretation: string
  confidenceLow: boolean
  confidenceNote: string | null
  insufficientHistory: boolean
  totalPublications: number
  activeSpan: number
  usableYears: number
  years: number[]
  series: number[]
  slope: number | null
  recentMean: number | null
  baselineMean: number | null
  momentum: number | null
  recentShare: number | null
  peakYear: number | null
  peakCount: number | null
  historicalGapYearsPresent: boolean
  emptyReason: string | null
}

type PublicationVolumeOverTimeRollingBlock = {
  label: string
  count: number
}

type PublicationVolumeOverTimeInsightStats = {
  totalPublications: number
  spanLabel: string | null
  firstPublicationYear: number | null
  lastPublicationYear: number | null
  peakYears: number[]
  peakCount: number | null
  lowYears: number[]
  lowCount: number | null
  recentWindowLabel: string | null
  recentWindowEndLabel: string | null
  recentWindowTotal: number
  recentWindowActiveMonths: number
  recentWindowPeakLabels: string[]
  threeYearWindowLabel: string | null
  threeYearBlocks: PublicationVolumeOverTimeRollingBlock[]
  fiveYearWindowLabel: string | null
  fiveYearBlocks: PublicationVolumeOverTimeRollingBlock[]
  recentDetailCount: number
  recentDetailRangeLabel: string | null
  recentMostRecentDateLabel: string | null
  recentMostRecentTitle: string | null
}

type PublicationArticleTypeWindowInsightSummary = {
  windowId: PublicationsWindowMode
  rangeLabel: string | null
  totalCount: number
  distinctTypeCount: number
  topLabels: string[]
  topCount: number
  topSharePct: number | null
  secondLabel: string | null
  secondSharePct: number | null
  orderedLabels: string[]
}

type PublicationArticleTypeOverTimeInsightStats = {
  emptyReason: string | null
  spanLabel: string | null
  firstPublicationYear: number | null
  lastPublicationYear: number | null
  totalCount: number
  allWindow: PublicationArticleTypeWindowInsightSummary | null
  fiveYearWindow: PublicationArticleTypeWindowInsightSummary | null
  threeYearWindow: PublicationArticleTypeWindowInsightSummary | null
  oneYearWindow: PublicationArticleTypeWindowInsightSummary | null
  latestYearIsPartial: boolean
  latestPartialYearLabel: string | null
}

type PublicationPublicationTypeWindowInsightSummary = PublicationArticleTypeWindowInsightSummary
type PublicationPublicationTypeOverTimeInsightStats = PublicationArticleTypeOverTimeInsightStats

function parsePublicationProductionPatternAsOfDate(value: unknown): Date | null {
  const clean = String(value || '').trim()
  if (!clean) {
    return null
  }
  const parsed = new Date(`${clean}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildPublicationProductionYearSeries(
  tile: PublicationMetricTilePayload,
  yearScopeMode: PublicationProductionYearScopeMode = 'complete',
): PublicationProductionYearSeriesScope {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const publicationRows = Array.isArray(drilldown.publications) ? drilldown.publications : []
  const totalPublicationsCandidates = [
    Number(tile.main_value),
    Number(tile.value),
    publicationRows.length,
  ].filter((value) => Number.isFinite(value))
  const totalPublications = Math.max(0, Math.round(totalPublicationsCandidates[0] ?? 0))

  if (totalPublications <= 0) {
    return {
      totalPublications: 0,
      scopedPublicationCount: 0,
      firstPublicationYear: null,
      lastPublicationYear: null,
      activeSpan: 0,
      years: [],
      series: [],
      lowVolume: false,
      includesPartialYear: false,
      partialYear: null,
      emptyReason: 'No publications available for the current filter.',
    }
  }

  const chartYears = Array.isArray(chartData.years)
    ? chartData.years
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1900 && value <= 3000)
    : []
  const chartValues = Array.isArray(chartData.values)
    ? chartData.values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    : []
  const yearCounts = new Map<number, number>()
  chartYears.forEach((year, index) => {
    yearCounts.set(year, Math.max(0, Number(chartValues[index] || 0)))
  })

  if (!yearCounts.size) {
    publicationRows.forEach((row) => {
      if (!row || typeof row !== 'object') {
        return
      }
      const record = row as Record<string, unknown>
      const publicationDate = typeof record.publication_date === 'string' ? record.publication_date : null
      const publicationMonthStart = typeof record.publication_month_start === 'string' ? record.publication_month_start : null
      const yearRaw = Number(record.year)
      const year = resolvePublicationTrajectoryYear({
        year: Number.isInteger(yearRaw) ? yearRaw : null,
        publicationDate,
        publicationMonthStart,
      })
      if (year === null) {
        return
      }
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1)
    })
  }

  const asOfDate = parsePublicationProductionPatternAsOfDate(drilldown.as_of_date) ?? new Date()
  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw)
    ? Math.round(projectedYearRaw)
    : asOfDate.getUTCFullYear()
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const existingCurrentYearValue = yearCounts.get(projectedYear) ?? 0
  if (Number.isFinite(currentYearYtdRaw)) {
    yearCounts.set(projectedYear, Math.max(0, currentYearYtdRaw))
  } else if (existingCurrentYearValue > 0) {
    yearCounts.set(projectedYear, existingCurrentYearValue)
  }

  const currentYearIsPartial = isPublicationProductionPatternPartialYear(asOfDate, projectedYear)
  const scopedYearCounts = new Map(yearCounts)
  if (yearScopeMode === 'complete' && currentYearIsPartial) {
    scopedYearCounts.delete(projectedYear)
  }

  const positiveYears = [...scopedYearCounts.entries()]
    .filter((entry) => entry[1] > 0)
    .map((entry) => entry[0])
    .sort((left, right) => left - right)

  if (!positiveYears.length) {
    const currentYearCount = yearCounts.get(projectedYear) ?? 0
    return {
      totalPublications,
      scopedPublicationCount: 0,
      firstPublicationYear: null,
      lastPublicationYear: null,
      activeSpan: 0,
      years: [],
      series: [],
      lowVolume: totalPublications < 10,
      includesPartialYear: false,
      partialYear: null,
      emptyReason: yearScopeMode === 'complete' && currentYearIsPartial && currentYearCount > 0
        ? `No complete publication years are available yet because ${projectedYear} is still in progress.`
        : 'Publication year data is unavailable for the current filter.',
    }
  }

  const firstPublicationYear = positiveYears[0]
  const lastPublicationYear = positiveYears[positiveYears.length - 1]
  const years = Array.from(
    { length: Math.max(1, lastPublicationYear - firstPublicationYear + 1) },
    (_, index) => firstPublicationYear + index,
  )
  const series = years.map((year) => Math.max(0, Number(scopedYearCounts.get(year) || 0)))
  const scopedPublicationCount = Math.round(series.reduce((sum, value) => sum + Math.max(0, value), 0))
  const includesPartialYear = (
    yearScopeMode === 'include_current'
    && currentYearIsPartial
    && lastPublicationYear === projectedYear
    && (scopedYearCounts.get(projectedYear) ?? 0) > 0
  )

  return {
    totalPublications,
    scopedPublicationCount,
    firstPublicationYear,
    lastPublicationYear,
    activeSpan: series.length,
    years,
    series,
    lowVolume: totalPublications < 10,
    includesPartialYear,
    partialYear: includesPartialYear ? projectedYear : null,
    emptyReason: null,
  }
}

function isPublicationProductionPatternPartialYear(asOfDate: Date, year: number): boolean {
  return year === asOfDate.getUTCFullYear()
    && (asOfDate.getUTCMonth() < 11 || asOfDate.getUTCDate() < 31)
}

function getPublicationProductionPatternLowVolumeNote(totalPublications: number): string | null {
  const normalized = Number.isFinite(totalPublications) ? Math.max(0, Math.round(totalPublications)) : 0
  if (normalized > 0 && normalized < 10) {
    return 'Low-volume caution: pattern metrics are directional with fewer than 10 publications.'
  }
  return null
}

function getPublicationConsistencySupportingText(value: number | null): string {
  if (value === null) {
    return 'Need at least two active years to compare year-to-year variation.'
  }
  if (value >= 0.75) {
    return 'Publication output is spread very evenly across active years.'
  }
  if (value >= 0.55) {
    return 'Publication output varies modestly year to year.'
  }
  if (value >= 0.35) {
    return 'Publication output shows noticeable year-to-year variation.'
  }
  if (value >= 0.2) {
    return 'Publication output clusters into several stronger years.'
  }
  return 'Publication output is concentrated into distinct spike years.'
}

function getPublicationProductionPatternGapYearCount(stats: PublicationProductionPatternStats): number {
  if (stats.activeSpan <= 0) {
    return 0
  }
  return Math.max(0, stats.activeSpan - stats.yearsWithOutput)
}

function formatPublicationProductionSpanPeriodText(stats: PublicationProductionPatternStats): string | null {
  if (stats.firstPublicationYear === null || stats.lastPublicationYear === null) {
    return null
  }
  return stats.firstPublicationYear === stats.lastPublicationYear
    ? `in ${stats.firstPublicationYear}`
    : `between ${stats.firstPublicationYear} and ${stats.lastPublicationYear}`
}

function getPublicationProductionPatternRangeDetails(stats: PublicationProductionPatternStats): {
  maxCount: number
  minCount: number
  maxYears: number[]
  minYears: number[]
} | null {
  if (!stats.years.length || stats.years.length !== stats.series.length) {
    return null
  }

  const maxCount = Math.max(...stats.series)
  const minCount = Math.min(...stats.series)
  return {
    maxCount,
    minCount,
    maxYears: stats.years.filter((_year, index) => (stats.series[index] ?? Number.NEGATIVE_INFINITY) === maxCount),
    minYears: stats.years.filter((_year, index) => (stats.series[index] ?? Number.POSITIVE_INFINITY) === minCount),
  }
}

function formatPublicationProductionCoverageSummary(stats: PublicationProductionPatternStats): string {
  if (stats.activeSpan <= 0) {
    return 'your active publication span is not available yet.'
  }

  const spanPeriodText = formatPublicationProductionSpanPeriodText(stats)
  if (stats.yearsWithOutput >= stats.activeSpan) {
    return spanPeriodText
      ? `you published in every year ${spanPeriodText}.`
      : 'you published in every year of this span.'
  }

  return spanPeriodText
    ? `you published in ${formatInt(stats.yearsWithOutput)} of the ${formatInt(stats.activeSpan)} years ${spanPeriodText}.`
    : `you published in ${formatInt(stats.yearsWithOutput)} of the ${formatInt(stats.activeSpan)} years in this span.`
}

function formatPublicationProductionGapYearSummary(stats: PublicationProductionPatternStats): string {
  const gapYears = getPublicationProductionPatternGapYearCount(stats)
  if (stats.activeSpan <= 0) {
    return 'gap-year context is not available yet.'
  }
  if (gapYears <= 0) {
    return 'there were no gap years without recorded publications.'
  }
  if (gapYears === 1) {
    return 'there was 1 gap year without a recorded publication in this span.'
  }
  return `there were ${formatInt(gapYears)} gap years without recorded publications in this span.`
}

function formatPublicationProductionLongestStreakSummary(stats: PublicationProductionPatternStats): string {
  if (stats.longestStreak <= 0) {
    return 'a continuous publication streak is not available yet.'
  }
  if (stats.activeSpan > 0 && stats.longestStreak >= stats.activeSpan && stats.yearsWithOutput >= stats.activeSpan) {
    return `your longest uninterrupted publication streak ran through the full ${formatInt(stats.activeSpan)} years.`
  }
  return `your longest uninterrupted publication streak lasted ${formatInt(stats.longestStreak)} ${pluralize(stats.longestStreak, 'year')}.`
}

function getPublicationConsistencyUserMeaning(value: number | null, stats: PublicationProductionPatternStats | null = null): string {
  const gapYears = stats ? getPublicationProductionPatternGapYearCount(stats) : 0

  if (value === null) {
    return 'There is not enough publication history to estimate year-to-year consistency reliably.'
  }
  if (value >= 0.75) {
    return gapYears === 0
      ? 'This means your publication output is very evenly distributed from year to year.'
      : 'This means your publication output is still broadly even overall, despite occasional quieter years.'
  }
  if (value >= 0.55) {
    return gapYears === 0
      ? 'This means your publication output is fairly even from year to year, with only modest variation.'
      : 'This means your publication output is fairly even overall, although quieter years still pull it away from full consistency.'
  }
  if (value >= 0.35) {
    return gapYears === 0
      ? 'This means your publication output varies from year to year rather than staying tightly even.'
      : 'This means your publication output varies from year to year and includes quieter years.'
  }
  if (value >= 0.2) {
    return gapYears === 0
      ? 'This means your publication output is clustered into stronger years rather than staying even across your active span.'
      : 'This means your publication output is clustered into stronger years, with quieter gaps lowering overall consistency.'
  }
  return gapYears === 0
    ? 'This means your publication output is concentrated into distinct spike years rather than being spread evenly across your active span.'
    : 'This means your publication output is concentrated into distinct spike years, separated by quiet or zero-output years.'
}

function getPublicationBurstinessSupportingText(value: number | null): string {
  if (value === null) {
    return 'Need at least two active years to assess spike behaviour.'
  }
  if (value <= 0.2) {
    return 'Output follows a very steady annual cadence.'
  }
  if (value <= 0.4) {
    return 'Some peak years occur but production stays broadly balanced.'
  }
  if (value <= 0.6) {
    return 'Output shows a mix of steady years and noticeable spikes.'
  }
  if (value <= 0.8) {
    return 'Output is concentrated into several pronounced spike years.'
  }
  return 'Output is dominated by sharp publication surges rather than steady flow.'
}

function getPublicationBurstinessStandoutYears(stats: PublicationProductionPatternStats): Array<{ year: number; count: number }> {
  const value = stats.burstinessScore
  if (value === null || stats.years.length < 2 || stats.years.length !== stats.series.length || stats.activeSpan <= 0) {
    return []
  }

  const averagePerActiveYear = stats.scopedPublicationCount / stats.activeSpan
  if (!Number.isFinite(averagePerActiveYear) || averagePerActiveYear <= 0) {
    return []
  }

  return stats.years
    .map((year, index) => ({
      year,
      count: Math.max(0, Number(stats.series[index] ?? 0)),
    }))
    .filter((entry) => entry.count > averagePerActiveYear && (entry.count >= averagePerActiveYear * 1.35 || (entry.count - averagePerActiveYear) >= 2))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count
      }
      return left.year - right.year
    })
}

function getPublicationBurstinessUserMeaning(value: number | null, stats: PublicationProductionPatternStats | null = null): string {
  const standoutYearCount = stats ? getPublicationBurstinessStandoutYears(stats).length : 0

  if (value === null) {
    return 'There is not enough publication history to estimate spike behaviour reliably.'
  }
  if (value <= 0.2) {
    return 'This means your publication output follows a very steady annual cadence.'
  }
  if (value <= 0.4) {
    return standoutYearCount <= 1
      ? 'This means your publication output remains broadly balanced, with only limited signs of a stronger year.'
      : 'This means your publication output remains broadly balanced, although a few stronger years stand above the rest.'
  }
  if (value <= 0.6) {
    return standoutYearCount <= 1
      ? 'This means your publication output mixes steadier years with one clear spike year.'
      : 'This means your publication output mixes steadier years with a small set of noticeable spike years.'
  }
  if (value <= 0.8) {
    return standoutYearCount <= 1
      ? 'This means your publication output is concentrated into a pronounced surge year.'
      : 'This means your publication output is concentrated into several pronounced surge years.'
  }
  return standoutYearCount <= 1
    ? 'This means your publication output is dominated by a sharp publication surge rather than a steady annual flow.'
    : 'This means your publication output is dominated by sharp publication surges rather than a steady annual flow.'
}

function formatPublicationPeakYearGroupLabel(count: number): string {
  if (count <= 1) {
    return 'a single peak year'
  }
  if (count === 2) {
    return 'two peak years'
  }
  if (count === 3) {
    return 'three peak years'
  }
  return 'a small set of peak years'
}

function getPublicationPeakYearShareUserMeaning(value: number | null, peakYearCount = 1): string {
  const peakYearGroupLabel = formatPublicationPeakYearGroupLabel(peakYearCount)
  const peakYearGroupPluralVerb = peakYearCount === 1 ? 'stands' : 'stand'

  if (value === null) {
    return 'There is not enough publication history to estimate peak-year concentration reliably.'
  }
  if (value < 0.12) {
    return `This means your publication output is broadly distributed across your publication span, rather than being dominated by ${peakYearGroupLabel}.`
  }
  if (value < 0.2) {
    return `This means your publication output is distributed overall, although ${peakYearGroupLabel} ${peakYearGroupPluralVerb} above the rest.`
  }
  if (value < 0.3) {
    return `This means a moderate share of your publication output is concentrated in ${peakYearGroupLabel}.`
  }
  if (value < 0.4) {
    return `This means ${peakYearGroupLabel} carr${peakYearCount === 1 ? 'ies' : 'y'} a substantial share of your publication output.`
  }
  return `This means your publication output is heavily concentrated in ${peakYearGroupLabel}.`
}

function formatPublicationProductionPatternYearList(years: number[]): string {
  const labels = years
    .filter((year) => Number.isInteger(year))
    .map((year) => String(year))

  if (labels.length <= 1) {
    return labels[0] ?? ''
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

function formatPublicationBurstinessSpikePatternExplanation(stats: PublicationProductionPatternStats): string {
  const value = stats.burstinessScore
  const fallback = getPublicationBurstinessSupportingText(value).replace(/^Output/i, 'your publication output')
  const standoutYears = getPublicationBurstinessStandoutYears(stats)
  const averagePerActiveYear = stats.activeSpan > 0 ? stats.scopedPublicationCount / stats.activeSpan : null

  if (!standoutYears.length || averagePerActiveYear === null || averagePerActiveYear <= 0) {
    return fallback
  }

  const typicalPaceText = `${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} publications per year`
  const burstinessValue = value ?? 0

  if (standoutYears.length === 1) {
    const standout = standoutYears[0]!
    const leadLabel = burstinessValue <= 0.4 ? 'your main high-output year' : 'your clearest spike'
    return `${leadLabel} was ${standout.year}, with ${formatInt(standout.count)} ${pluralize(standout.count, 'publication')} against a typical pace of ${typicalPaceText}.`
  }

  const first = standoutYears[0]!
  const second = standoutYears[1]!
  const leadLabel = burstinessValue <= 0.4 ? 'your main high-output years were' : 'your clearest spikes came in'
  return `${leadLabel} ${first.year} (${formatInt(first.count)} ${pluralize(first.count, 'publication')}) and ${second.year} (${formatInt(second.count)} ${pluralize(second.count, 'publication')}), against a typical pace of ${typicalPaceText}.`
}

function getPublicationProductionPatternPeakYearDetails(stats: PublicationProductionPatternStats): {
  peakYear: number | null
  peakCount: number | null
  tiedPeakYears: number[]
} {
  if (stats.years.length === 0 || stats.years.length !== stats.series.length) {
    return {
      peakYear: null,
      peakCount: null,
      tiedPeakYears: [],
    }
  }

  const peakCount = Math.max(...stats.series)
  const tiedPeakYears = stats.years.filter((_year, index) => (stats.series[index] ?? -1) === peakCount)

  return {
    peakYear: tiedPeakYears[0] ?? null,
    peakCount,
    tiedPeakYears,
  }
}

function formatPublicationPeakYearSummary(details: {
  peakYear: number | null
  peakCount: number | null
  tiedPeakYears: number[]
}): string {
  const { peakYear, peakCount, tiedPeakYears } = details

  if (peakYear === null) {
    return 'your highest-output year is not available yet.'
  }

  if (peakCount === null) {
    return tiedPeakYears.length > 1
      ? `your highest-output years were ${formatPublicationProductionPatternYearList(tiedPeakYears)}.`
      : `your highest-output year was ${peakYear}.`
  }

  if (tiedPeakYears.length > 1) {
    return `your highest-output years were ${formatPublicationProductionPatternYearList(tiedPeakYears)}, with ${formatInt(peakCount)} ${pluralize(peakCount, 'publication')} each.`
  }

  return `your highest-output year was ${peakYear}, with ${formatInt(peakCount)} ${pluralize(peakCount, 'publication')}.`
}

function formatPublicationPeakYearPortfolioShareSummary(
  stats: PublicationProductionPatternStats,
  details: {
    peakYear: number | null
    peakCount: number | null
    tiedPeakYears: number[]
  },
  peakYearShare: number | null,
): string {
  const { peakYear, peakCount, tiedPeakYears } = details

  if (peakYear === null || peakCount === null || peakYearShare === null || stats.scopedPublicationCount <= 0) {
    return 'the share carried by your highest-output year is not available yet.'
  }

  const perYearShareLabel = formatPercentWhole(peakYearShare * 100)
  if (tiedPeakYears.length > 1) {
    const combinedCount = peakCount * tiedPeakYears.length
    const combinedShareLabel = formatPercentWhole((combinedCount / stats.scopedPublicationCount) * 100)
    return `each of those years contributed ${formatInt(peakCount)} of your ${formatInt(stats.scopedPublicationCount)} publications (${perYearShareLabel}). Together, those tied peak years contributed ${formatInt(combinedCount)} publications (${combinedShareLabel}).`
  }

  return `${formatInt(peakCount)} of your ${formatInt(stats.scopedPublicationCount)} publications (${perYearShareLabel}) came in ${peakYear}.`
}

function formatPublicationPeakYearEvenSpreadSummary(
  stats: PublicationProductionPatternStats,
  details: {
    peakYear: number | null
    peakCount: number | null
    tiedPeakYears: number[]
  },
  peakYearShare: number | null,
): string {
  if (peakYearShare === null) {
    return 'an even-spread comparison is not available yet.'
  }

  if (stats.activeSpan <= 1) {
    return 'with only one active publication year, the full portfolio sits in that year.'
  }

  const evenSharePct = 100 / stats.activeSpan
  const peakSharePct = peakYearShare * 100
  const multiple = evenSharePct > 0 ? peakSharePct / evenSharePct : null
  const perYearSubject = details.tiedPeakYears.length > 1 ? 'each of your tied peak years accounts for' : 'your peak year accounts for'
  const multipleText = multiple !== null && Number.isFinite(multiple) && multiple >= 1.15
    ? ` That is about ${formatRoundedOneDecimalTrimmed(multiple)}x an even annual share.`
    : ''

  return `across a ${formatPublicationProductionSpanLabel(stats.activeSpan)}, an even spread would be about ${formatRoundedOneDecimalTrimmed(evenSharePct)}% per year. ${perYearSubject} ${formatPercentWhole(peakSharePct)}.${multipleText}`
}

function formatPublicationConsistencyPatternExplanation(stats: PublicationProductionPatternStats): string {
  const fallback = getPublicationConsistencySupportingText(stats.consistencyIndex).replace(/^Publication output/i, 'your publication output')
  const details = getPublicationProductionPatternRangeDetails(stats)
  const gapYears = getPublicationProductionPatternGapYearCount(stats)

  if (!details) {
    return fallback
  }

  if (details.maxCount === details.minCount) {
    return `every active year recorded ${formatInt(details.maxCount)} ${pluralize(details.maxCount, 'publication')}.`
  }

  if (gapYears > 0 && details.minCount === 0) {
    if (details.maxYears.length > 1) {
      return `${formatInt(gapYears)} ${pluralize(gapYears, 'year')} had no recorded publications, while your strongest years were ${formatPublicationProductionPatternYearList(details.maxYears)} with ${formatInt(details.maxCount)} each.`
    }
    return `${formatInt(gapYears)} ${pluralize(gapYears, 'year')} had no recorded publications, while your strongest year was ${details.maxYears[0]} with ${formatInt(details.maxCount)} publications.`
  }

  if ((details.maxCount - details.minCount) <= 2) {
    return `annual output stayed within a fairly tight range of ${formatInt(details.minCount)} to ${formatInt(details.maxCount)} publications.`
  }

  if (details.maxYears.length === 1 && details.minYears.length === 1) {
    return `annual output ranged from ${formatInt(details.minCount)} publications in ${details.minYears[0]} to ${formatInt(details.maxCount)} in ${details.maxYears[0]}.`
  }

  return `annual output ranged from ${formatInt(details.minCount)} to ${formatInt(details.maxCount)} publications across your active years.`
}

function formatPublicationConsistencyAverageComparison(stats: PublicationProductionPatternStats, averagePerActiveYear: number | null): string {
  if (averagePerActiveYear === null) {
    return 'a comparison with your average annual pace is not available yet.'
  }

  const details = getPublicationProductionPatternRangeDetails(stats)
  const gapYears = getPublicationProductionPatternGapYearCount(stats)
  if (!details) {
    return `your average pace was ${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} publications per year.`
  }

  if (details.maxCount === details.minCount) {
    return `every active year sat right on your average pace of ${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} publications per year.`
  }

  const strongestYearText = details.maxYears.length > 1
    ? `your strongest years reached ${formatInt(details.maxCount)} publications`
    : `your strongest year reached ${formatInt(details.maxCount)} publications`

  if (gapYears > 0 && details.minCount === 0) {
    return `${strongestYearText}, while ${formatInt(gapYears)} gap ${gapYears === 1 ? 'year' : 'years'} pulled the overall average to ${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} per year.`
  }

  return `${strongestYearText}, against an average pace of ${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} publications per year.`
}

function formatPublicationConsistencyExtremesSummary(stats: PublicationProductionPatternStats): string {
  const details = getPublicationProductionPatternRangeDetails(stats)
  if (!details) {
    return 'your strongest and quietest years are not available yet.'
  }

  if (details.maxCount === details.minCount) {
    return `your strongest and quietest years sat at the same level, with ${formatInt(details.maxCount)} ${pluralize(details.maxCount, 'publication')} in every active year.`
  }

  const strongestYearsLabel = formatPublicationProductionPatternYearList(details.maxYears)
  const quietestYearsLabel = formatPublicationProductionPatternYearList(details.minYears)
  const quietestCountLabel = details.minCount === 0
    ? 'no recorded publications'
    : `${formatInt(details.minCount)} ${pluralize(details.minCount, 'publication')}`

  return `your strongest ${details.maxYears.length === 1 ? 'year was' : 'years were'} ${strongestYearsLabel} with ${formatInt(details.maxCount)} ${pluralize(details.maxCount, 'publication')}, while your quietest ${details.minYears.length === 1 ? 'year was' : 'years were'} ${quietestYearsLabel} with ${quietestCountLabel}.`
}

function formatPublicationBurstinessTypicalYearSummary(stats: PublicationProductionPatternStats, averagePerActiveYear: number | null): string {
  if (averagePerActiveYear === null || !stats.series.length) {
    return 'your typical-year baseline is not available yet.'
  }

  const standoutYears = getPublicationBurstinessStandoutYears(stats)
  const yearsAtOrBelowAverage = stats.series.filter((value) => value <= averagePerActiveYear).length
  const yearsNearAverage = stats.series.filter((value) => Math.abs(value - averagePerActiveYear) <= 1).length
  const typicalPaceText = `${formatRoundedOneDecimalTrimmed(averagePerActiveYear)} publications per year`

  if (!standoutYears.length) {
    if (yearsNearAverage >= Math.max(1, Math.ceil(stats.series.length * 0.6))) {
      return `most years stayed close to your typical pace of ${typicalPaceText}.`
    }
    return `your yearly output generally stayed around a typical pace of ${typicalPaceText}, without a major spike year standing apart.`
  }

  if (yearsAtOrBelowAverage >= stats.series.length - standoutYears.length) {
    return `${formatInt(yearsAtOrBelowAverage)} of your ${formatInt(stats.series.length)} active years sat at or below your typical pace of ${typicalPaceText}, with the spikes doing the rest of the lifting.`
  }

  return `your spike years sat above a typical pace of ${typicalPaceText}, but several other years still ran close to that baseline.`
}

function formatPublicationBurstinessLowerTailSummary(stats: PublicationProductionPatternStats): string {
  const details = getPublicationProductionPatternRangeDetails(stats)
  if (!details) {
    return 'your quieter years are not available yet.'
  }

  if (details.minCount === details.maxCount) {
    return 'there is no lower-output tail here; every active year contributed at the same level.'
  }

  const quietestYearsLabel = formatPublicationProductionPatternYearList(details.minYears)
  if (details.minCount === 0) {
    return `the contrast is amplified by ${details.minYears.length === 1 ? `a zero-output year in ${quietestYearsLabel}` : `zero-output years in ${quietestYearsLabel}`}.`
  }

  return `outside the stronger years, output fell as low as ${formatInt(details.minCount)} ${pluralize(details.minCount, 'publication')} in ${quietestYearsLabel}.`
}

function getPublicationOutputContinuitySupportingText(value: number | null): string {
  if (value === null) {
    return 'Publication continuity is unavailable for the selected scope.'
  }
  if (value >= 0.85) {
    return 'Publications occur nearly every year across the active span.'
  }
  if (value >= 0.7) {
    return 'Publications occur in most years within the active span.'
  }
  if (value >= 0.5) {
    return 'Publication activity is present in roughly half of the active years.'
  }
  if (value >= 0.3) {
    return 'Publication activity appears in scattered runs across the active span.'
  }
  return 'Publication activity appears only sporadically across the active span.'
}

function getPublicationOutputContinuityUserMeaning(value: number | null, stats: PublicationProductionPatternStats | null = null): string {
  const gapYears = stats ? getPublicationProductionPatternGapYearCount(stats) : 0

  if (value === null) {
    return 'There is not enough publication history to estimate continuity reliably.'
  }
  if (value >= 0.85) {
    return gapYears === 0
      ? 'This means your publication activity is continuous across your publication span.'
      : 'This means your publication activity is highly continuous, with only occasional gap years.'
  }
  if (value >= 0.7) {
    return gapYears <= 2
      ? 'This means your publication activity is present in most years, with only a few breaks.'
      : 'This means your publication activity is present in most years, but not continuously.'
  }
  if (value >= 0.5) {
    return 'This means your publication activity is intermittent rather than continuous across your publication span.'
  }
  if (value >= 0.3) {
    return 'This means your publication activity is episodic, with substantial breaks between active years.'
  }
  return 'This means your publication activity is sporadic, with output appearing only in scattered years.'
}

type PublicationProductionPatternTone = 'accent' | 'positive' | 'neutral' | 'warning' | 'danger'

function resolvePublicationProductionPatternToneColor(tone: PublicationProductionPatternTone): string {
  switch (tone) {
    case 'positive':
      return 'hsl(var(--tone-positive-500))'
    case 'warning':
      return 'hsl(var(--tone-warning-500))'
    case 'danger':
      return 'hsl(var(--tone-danger-500))'
    case 'neutral':
      return 'hsl(var(--tone-neutral-500))'
    default:
      return 'hsl(var(--tone-accent-600))'
  }
}

function getPublicationConsistencyTone(value: number): PublicationProductionPatternTone {
  if (value >= 0.55) {
    return 'positive'
  }
  if (value >= 0.35) {
    return 'neutral'
  }
  if (value >= 0.2) {
    return 'warning'
  }
  return 'danger'
}

function getPublicationBurstinessTone(value: number): PublicationProductionPatternTone {
  if (value > 0.8) {
    return 'danger'
  }
  if (value > 0.6) {
    return 'warning'
  }
  if (value > 0.4) {
    return 'neutral'
  }
  if (value > 0.2) {
    return 'accent'
  }
  return 'positive'
}

function getPublicationPeakYearShareTone(value: number): PublicationProductionPatternTone {
  if (value >= 0.4) {
    return 'danger'
  }
  if (value >= 0.3) {
    return 'warning'
  }
  if (value >= 0.2) {
    return 'neutral'
  }
  if (value >= 0.12) {
    return 'accent'
  }
  return 'positive'
}

function getPublicationOutputContinuityTone(value: number): PublicationProductionPatternTone {
  if (value >= 0.85) {
    return 'positive'
  }
  if (value >= 0.7) {
    return 'accent'
  }
  if (value >= 0.5) {
    return 'neutral'
  }
  if (value >= 0.3) {
    return 'warning'
  }
  return 'danger'
}

export function buildPublicationProductionPatternStats(
  tile: PublicationMetricTilePayload,
  yearScopeMode: PublicationProductionYearScopeMode = 'complete',
): PublicationProductionPatternStats {
  const yearSeries = buildPublicationProductionYearSeries(tile, yearScopeMode)

  if (yearSeries.emptyReason) {
    return {
      totalPublications: yearSeries.totalPublications,
      scopedPublicationCount: 0,
      firstPublicationYear: null,
      lastPublicationYear: null,
      activeSpan: 0,
      years: [],
      series: [],
      yearsWithOutput: 0,
      outputContinuity: null,
      longestStreak: 0,
      consistencyIndex: null,
      burstinessScore: null,
      peakYearShare: null,
      lowVolume: yearSeries.lowVolume,
      includesPartialYear: yearSeries.includesPartialYear,
      partialYear: yearSeries.partialYear,
      emptyReason: yearSeries.emptyReason,
    }
  }

  const series = yearSeries.series
  const outputContinuity = series.length ? calculatePublicationOutputContinuity(series) : null

  return {
    totalPublications: yearSeries.totalPublications,
    scopedPublicationCount: yearSeries.scopedPublicationCount,
    firstPublicationYear: yearSeries.firstPublicationYear,
    lastPublicationYear: yearSeries.lastPublicationYear,
    activeSpan: yearSeries.activeSpan,
    years: yearSeries.years,
    series,
    yearsWithOutput: series.filter((value) => value >= 1).length,
    outputContinuity,
    longestStreak: calculatePublicationLongestStreak(series),
    consistencyIndex: series.length >= 2 ? calculatePublicationConsistencyIndex(series) : null,
    burstinessScore: series.length >= 2 ? calculatePublicationBurstinessScore(series) : null,
    peakYearShare: yearSeries.scopedPublicationCount > 0 ? calculatePublicationPeakYearShare(series) : null,
    lowVolume: yearSeries.lowVolume,
    includesPartialYear: yearSeries.includesPartialYear,
    partialYear: yearSeries.partialYear,
    emptyReason: null,
  }
}

function resolvePublicationProductionPhaseTone(phase: PublicationProductionPhaseLabel | null): PublicationProductionPatternTone {
  switch (phase) {
    case 'Scaling':
    case 'Established':
      return 'positive'
    case 'Emerging':
      return 'accent'
    case 'Plateauing':
      return 'warning'
    case 'Contracting':
      return 'danger'
    case 'Rebuilding':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function getPublicationProductionPhaseInterpretation(phase: PublicationProductionPhaseLabel | null, insufficientHistory: boolean): string {
  if (insufficientHistory || phase === null) {
    return 'At least two complete publication years are needed to estimate a production phase.'
  }
  switch (phase) {
    case 'Emerging':
      return 'Early-stage publication portfolio beginning to grow.'
    case 'Scaling':
      return 'Publication output is increasing steadily.'
    case 'Established':
      return 'Publication output is stable across recent years.'
    case 'Plateauing':
      return 'Publication growth has levelled off recently.'
    case 'Contracting':
      return 'Publication output has declined from earlier levels.'
    case 'Rebuilding':
      return 'Publication activity is recovering after an earlier lull.'
    default:
      return 'Publication phase is not available.'
  }
}

function getPublicationProductionPhaseUserMeaning(phase: PublicationProductionPhaseLabel | null): string {
  switch (phase) {
    case 'Emerging':
      return 'This means your publication record is still in its early build-up phase.'
    case 'Scaling':
      return 'This means your portfolio is in a growth phase, with annual output rising over time.'
    case 'Established':
      return 'This means your publication record is mature, with annual output staying broadly stable.'
    case 'Plateauing':
      return 'This means earlier growth has levelled off and annual output is no longer rising strongly.'
    case 'Contracting':
      return 'This means annual output has fallen back from earlier levels.'
    case 'Rebuilding':
      return 'This means annual output is picking up again after an earlier lull.'
    default:
      return 'This means the current stage cannot yet be interpreted reliably.'
  }
}

function formatPublicationProductionPhaseSlopeExplanation(
  slope: number | null,
  slopePeriodText: string | null,
): string {
  if (slope === null) {
    return 'your trend slope is not available yet.'
  }

  const absSlope = Math.abs(slope)
  const periodText = slopePeriodText ?? 'across the observed period'
  const roundedSlope = absSlope.toFixed(1)

  if (absSlope < 0.05) {
    return `your annual publication output was broadly flat ${periodText}, changing by less than 0.1 publications per year on average.`
  }

  if (slope > 0) {
    return `your annual publication output increased by an average of ${roundedSlope} publications per year ${periodText}.`
  }

  return `your annual publication output decreased by an average of ${roundedSlope} publications per year ${periodText}.`
}

function formatPublicationProductionSpanLabel(years: number): string {
  return `${formatInt(years)}-year publication span`
}

function formatPublicationProductionPatternAsOfDateLabel(asOfDate: Date | null): string | null {
  if (!asOfDate || Number.isNaN(asOfDate.getTime())) {
    return null
  }

  return asOfDate.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function resolvePublicationProductionPatternCurrentYearLabel(
  stats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string {
  const partialYear = stats.partialYear ?? (asOfDate && !Number.isNaN(asOfDate.getTime()) ? asOfDate.getUTCFullYear() : null)
  return partialYear !== null ? String(partialYear) : 'the current year'
}

function formatPublicationProductionPatternPartialYearContext(
  stats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string {
  const cutoffLabel = formatPublicationProductionPatternAsOfDateLabel(asOfDate)
  const currentYearLabel = resolvePublicationProductionPatternCurrentYearLabel(stats, asOfDate)

  if (cutoffLabel) {
    return `Including your ${currentYearLabel} publications recorded through ${cutoffLabel}`
  }

  return `Including your ${currentYearLabel} publications recorded so far`
}

type PublicationProductionPatternYtdMetricSnapshot = {
  interpretationLabel: string | null
  valueLabel: string | null
}

function buildPublicationProductionPatternYtdChangeSummary({
  metricLabel,
  complete,
  current,
}: {
  metricLabel: string
  complete: PublicationProductionPatternYtdMetricSnapshot
  current: PublicationProductionPatternYtdMetricSnapshot
}): string | null {
  const valueChanged = complete.valueLabel !== current.valueLabel
  const interpretationChanged = complete.interpretationLabel !== current.interpretationLabel

  if (!valueChanged && !interpretationChanged) {
    return null
  }

  if (!complete.valueLabel && !complete.interpretationLabel) {
    if (current.valueLabel && current.interpretationLabel) {
      return `produces a provisional ${metricLabel} of ${current.valueLabel} (${current.interpretationLabel})`
    }
    if (current.valueLabel) {
      return `produces a provisional ${metricLabel} of ${current.valueLabel}`
    }
    if (current.interpretationLabel) {
      return `produces a provisional ${metricLabel} reading of ${current.interpretationLabel}`
    }
    return null
  }

  if (!current.valueLabel && !current.interpretationLabel) {
    if (complete.valueLabel && complete.interpretationLabel) {
      return `removes the provisional ${metricLabel} reading; completed years alone still read as ${complete.valueLabel} (${complete.interpretationLabel})`
    }
    if (complete.valueLabel) {
      return `removes the provisional ${metricLabel} reading; completed years alone still read as ${complete.valueLabel}`
    }
    if (complete.interpretationLabel) {
      return `removes the provisional ${metricLabel} reading; completed years alone still read as ${complete.interpretationLabel}`
    }
    return null
  }

  if (valueChanged && interpretationChanged && complete.valueLabel && current.valueLabel && complete.interpretationLabel && current.interpretationLabel) {
    return `changes the displayed ${metricLabel} from ${complete.valueLabel} (${complete.interpretationLabel}) to ${current.valueLabel} (${current.interpretationLabel})`
  }

  if (!valueChanged && interpretationChanged && current.valueLabel && complete.interpretationLabel && current.interpretationLabel) {
    return `keeps the displayed ${metricLabel} at ${current.valueLabel}, but shifts the reading from ${complete.interpretationLabel} to ${current.interpretationLabel}`
  }

  if (valueChanged && complete.valueLabel && current.valueLabel) {
    if (current.interpretationLabel && complete.interpretationLabel && current.interpretationLabel === complete.interpretationLabel) {
      return `changes the displayed ${metricLabel} from ${complete.valueLabel} to ${current.valueLabel}, while the overall reading stays ${current.interpretationLabel}`
    }
    return `changes the displayed ${metricLabel} from ${complete.valueLabel} to ${current.valueLabel}`
  }

  if (interpretationChanged && complete.interpretationLabel && current.interpretationLabel) {
    return `shifts the ${metricLabel} reading from ${complete.interpretationLabel} to ${current.interpretationLabel}`
  }

  return null
}

function renderPublicationProductionPatternTooltipNote(note: string | null): ReactNode {
  if (!note) {
    return null
  }

  return (
    <div className="border-t border-[hsl(var(--stroke-soft)/0.7)] pt-2">
      <p>
        <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Note:</span>
        {' '}
        {note}
      </p>
    </div>
  )
}

function buildPublicationConsistencyYtdNote(
  completeStats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string | null {
  if (!currentStats.includesPartialYear) {
    return null
  }

  const changeSummary = buildPublicationProductionPatternYtdChangeSummary({
    metricLabel: 'consistency index',
    complete: {
      valueLabel: completeStats.consistencyIndex === null ? null : completeStats.consistencyIndex.toFixed(2),
      interpretationLabel: completeStats.consistencyIndex === null ? null : getPublicationConsistencyInterpretation(completeStats.consistencyIndex),
    },
    current: {
      valueLabel: currentStats.consistencyIndex === null ? null : currentStats.consistencyIndex.toFixed(2),
      interpretationLabel: currentStats.consistencyIndex === null ? null : getPublicationConsistencyInterpretation(currentStats.consistencyIndex),
    },
  })
  if (!changeSummary) {
    return null
  }

  const currentYearLabel = resolvePublicationProductionPatternCurrentYearLabel(currentStats, asOfDate)
  return `${formatPublicationProductionPatternPartialYearContext(currentStats, asOfDate)} ${changeSummary}. Because ${currentYearLabel} is still incomplete, the YTD view can make your year-to-year output look more or less even than it does across completed years.`
}

function buildPublicationBurstinessYtdNote(
  completeStats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string | null {
  if (!currentStats.includesPartialYear) {
    return null
  }

  const changeSummary = buildPublicationProductionPatternYtdChangeSummary({
    metricLabel: 'burstiness score',
    complete: {
      valueLabel: completeStats.burstinessScore === null ? null : completeStats.burstinessScore.toFixed(2),
      interpretationLabel: completeStats.burstinessScore === null ? null : getPublicationBurstinessInterpretation(completeStats.burstinessScore),
    },
    current: {
      valueLabel: currentStats.burstinessScore === null ? null : currentStats.burstinessScore.toFixed(2),
      interpretationLabel: currentStats.burstinessScore === null ? null : getPublicationBurstinessInterpretation(currentStats.burstinessScore),
    },
  })
  if (!changeSummary) {
    return null
  }

  const currentYearLabel = resolvePublicationProductionPatternCurrentYearLabel(currentStats, asOfDate)
  return `${formatPublicationProductionPatternPartialYearContext(currentStats, asOfDate)} ${changeSummary}. Because ${currentYearLabel} is still incomplete, the YTD view can temporarily exaggerate or soften how spiky your publication pattern looks.`
}

function buildPublicationPeakYearShareYtdNote(
  completeStats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string | null {
  if (!currentStats.includesPartialYear) {
    return null
  }

  const changeSummary = buildPublicationProductionPatternYtdChangeSummary({
    metricLabel: 'peak-year share',
    complete: {
      valueLabel: completeStats.peakYearShare === null ? null : formatPercentWhole(completeStats.peakYearShare * 100),
      interpretationLabel: completeStats.peakYearShare === null ? null : getPublicationPeakYearShareInterpretation(completeStats.peakYearShare),
    },
    current: {
      valueLabel: currentStats.peakYearShare === null ? null : formatPercentWhole(currentStats.peakYearShare * 100),
      interpretationLabel: currentStats.peakYearShare === null ? null : getPublicationPeakYearShareInterpretation(currentStats.peakYearShare),
    },
  })
  if (!changeSummary) {
    return null
  }

  const currentYearLabel = resolvePublicationProductionPatternCurrentYearLabel(currentStats, asOfDate)
  return `${formatPublicationProductionPatternPartialYearContext(currentStats, asOfDate)} ${changeSummary}. Because ${currentYearLabel} is still incomplete, its share of your whole publication portfolio is still provisional and can shift as the year fills out.`
}

function buildPublicationOutputContinuityYtdNote(
  completeStats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats,
  asOfDate: Date | null,
): string | null {
  if (!currentStats.includesPartialYear) {
    return null
  }

  const changeSummary = buildPublicationProductionPatternYtdChangeSummary({
    metricLabel: 'years-with-output ratio',
    complete: {
      valueLabel: `${formatInt(completeStats.yearsWithOutput)} / ${formatInt(completeStats.activeSpan)}`,
      interpretationLabel: completeStats.outputContinuity === null ? null : getPublicationOutputContinuityInterpretation(completeStats.outputContinuity),
    },
    current: {
      valueLabel: `${formatInt(currentStats.yearsWithOutput)} / ${formatInt(currentStats.activeSpan)}`,
      interpretationLabel: currentStats.outputContinuity === null ? null : getPublicationOutputContinuityInterpretation(currentStats.outputContinuity),
    },
  })
  if (!changeSummary) {
    return null
  }

  const currentYearLabel = resolvePublicationProductionPatternCurrentYearLabel(currentStats, asOfDate)
  return `${formatPublicationProductionPatternPartialYearContext(currentStats, asOfDate)} ${changeSummary}. Because the YTD view already counts ${currentYearLabel} as an output year before it is finished, the visible continuity ratio can move ahead of the completed-years pattern.`
}

function renderPublicationConsistencyTooltipContent(
  stats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats = stats,
  asOfDate: Date | null = null,
) {
  const value = stats.consistencyIndex
  const averagePerActiveYear = stats.activeSpan > 0
    ? stats.scopedPublicationCount / stats.activeSpan
    : null
  const lowVolumeNote = stats.lowVolume ? getPublicationProductionPatternLowVolumeNote(stats.totalPublications) : null
  const ytdNote = buildPublicationConsistencyYtdNote(stats, currentStats, asOfDate)
  const yearPatternExplanation = value === null
    ? null
    : formatPublicationConsistencyPatternExplanation(stats)

  return (
    <div className="space-y-2.5">
      {value === null ? (
        <>
          <p>
            <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">
              Your consistency index cannot yet be estimated confidently.
            </span>
            {' '}
            {getPublicationConsistencySupportingText(value)}
          </p>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[hsl(var(--tone-neutral-600))]">Your consistency index is:</p>
            <p
              className="text-center text-sm font-semibold leading-tight"
              style={{ color: resolvePublicationProductionPatternToneColor(getPublicationConsistencyTone(value)) }}
            >
              {value.toFixed(2)}
            </p>
            <p>{getPublicationConsistencyUserMeaning(value, stats)}</p>
          </div>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Year-to-year pattern:</span>
              {' '}
              {yearPatternExplanation}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Strongest vs quietest years:</span>
              {' '}
              {formatPublicationConsistencyExtremesSummary(stats)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Compared with your average:</span>
              {' '}
              {formatPublicationConsistencyAverageComparison(stats, averagePerActiveYear)}
            </li>
          </ul>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      )}
    </div>
  )
}

function renderPublicationBurstinessTooltipContent(
  stats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats = stats,
  asOfDate: Date | null = null,
) {
  const value = stats.burstinessScore
  const averagePerActiveYear = stats.activeSpan > 0
    ? stats.scopedPublicationCount / stats.activeSpan
    : null
  const lowVolumeNote = stats.lowVolume ? getPublicationProductionPatternLowVolumeNote(stats.totalPublications) : null
  const ytdNote = buildPublicationBurstinessYtdNote(stats, currentStats, asOfDate)
  const spikePatternExplanation = value === null
    ? null
    : formatPublicationBurstinessSpikePatternExplanation(stats)

  return (
    <div className="space-y-2.5">
      {value === null ? (
        <>
          <p>
            <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">
              Your burstiness score cannot yet be estimated confidently.
            </span>
            {' '}
            {getPublicationBurstinessSupportingText(value)}
          </p>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[hsl(var(--tone-neutral-600))]">Your burstiness score is:</p>
            <p
              className="text-center text-sm font-semibold leading-tight"
              style={{ color: resolvePublicationProductionPatternToneColor(getPublicationBurstinessTone(value)) }}
            >
              {value.toFixed(2)}
            </p>
            <p>{getPublicationBurstinessUserMeaning(value, stats)}</p>
          </div>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Spike pattern:</span>
              {' '}
              {spikePatternExplanation}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Typical years:</span>
              {' '}
              {formatPublicationBurstinessTypicalYearSummary(stats, averagePerActiveYear)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Lower tail:</span>
              {' '}
              {formatPublicationBurstinessLowerTailSummary(stats)}
            </li>
          </ul>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      )}
    </div>
  )
}

function renderPublicationPeakYearShareTooltipContent(
  stats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats = stats,
  asOfDate: Date | null = null,
) {
  const value = stats.peakYearShare
  const lowVolumeNote = getPublicationPeakYearShareCaution(stats.scopedPublicationCount) ?? (
    stats.lowVolume ? getPublicationProductionPatternLowVolumeNote(stats.totalPublications) : null
  )
  const ytdNote = buildPublicationPeakYearShareYtdNote(stats, currentStats, asOfDate)
  const peakYearDetails = getPublicationProductionPatternPeakYearDetails(stats)

  return (
    <div className="space-y-2.5">
      {value === null ? (
        <>
          <p>
            <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">
              Your peak-year share cannot yet be estimated confidently.
            </span>
            {' '}
            Peak-year concentration is unavailable for the selected scope.
          </p>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[hsl(var(--tone-neutral-600))]">Your peak-year share is:</p>
            <p
              className="text-center text-sm font-semibold leading-tight"
              style={{ color: resolvePublicationProductionPatternToneColor(getPublicationPeakYearShareTone(value)) }}
            >
              {formatPercentWhole(value * 100)}
            </p>
            <p>{getPublicationPeakYearShareUserMeaning(value, Math.max(1, peakYearDetails.tiedPeakYears.length))}</p>
          </div>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Peak year:</span>
              {' '}
              {formatPublicationPeakYearSummary(peakYearDetails)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Portfolio share:</span>
              {' '}
              {formatPublicationPeakYearPortfolioShareSummary(stats, peakYearDetails, value)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Compared with an even spread:</span>
              {' '}
              {formatPublicationPeakYearEvenSpreadSummary(stats, peakYearDetails, value)}
            </li>
          </ul>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      )}
    </div>
  )
}

function renderPublicationOutputContinuityTooltipContent(
  stats: PublicationProductionPatternStats,
  currentStats: PublicationProductionPatternStats = stats,
  asOfDate: Date | null = null,
) {
  const value = stats.outputContinuity
  const lowVolumeNote = stats.lowVolume ? getPublicationProductionPatternLowVolumeNote(stats.totalPublications) : null
  const ytdNote = buildPublicationOutputContinuityYtdNote(stats, currentStats, asOfDate)
  return (
    <div className="space-y-2.5">
      {value === null ? (
        <>
          <p>
            <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">
              Your years-with-output pattern cannot yet be estimated confidently.
            </span>
            {' '}
            {getPublicationOutputContinuitySupportingText(value)}
          </p>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[hsl(var(--tone-neutral-600))]">Your years with output are:</p>
            <p
              className="text-center text-sm font-semibold leading-tight tabular-nums"
              style={{ color: resolvePublicationProductionPatternToneColor(getPublicationOutputContinuityTone(value)) }}
            >
              {`${formatInt(stats.yearsWithOutput)} / ${formatInt(stats.activeSpan)}`}
            </p>
            <p>{getPublicationOutputContinuityUserMeaning(value, stats)}</p>
          </div>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Coverage across the span:</span>
              {' '}
              {formatPublicationProductionCoverageSummary(stats)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Longest streak:</span>
              {' '}
              {formatPublicationProductionLongestStreakSummary(stats)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Gap years:</span>
              {' '}
              {formatPublicationProductionGapYearSummary(stats)}
            </li>
          </ul>
          {lowVolumeNote ? <p>{lowVolumeNote}</p> : null}
          {renderPublicationProductionPatternTooltipNote(ytdNote)}
        </>
      )}
    </div>
  )
}

function getPublicationProductionPhaseTooltipLabelClass(phase: PublicationProductionPhaseLabel | null): string {
  switch (resolvePublicationProductionPhaseTone(phase)) {
    case 'positive':
      return 'text-[hsl(var(--tone-positive-700))]'
    case 'accent':
      return 'text-[hsl(var(--tone-accent-800))]'
    case 'warning':
      return 'text-[hsl(var(--tone-warning-700))]'
    case 'danger':
      return 'text-[hsl(var(--tone-danger-700))]'
    default:
      return 'text-[hsl(var(--tone-neutral-900))]'
  }
}

export function buildPublicationProductionPhaseStats(tile: PublicationMetricTilePayload): PublicationProductionPhaseStats {
  const yearSeries = buildPublicationProductionYearSeries(tile, 'complete')

  if (yearSeries.emptyReason) {
    return {
      phase: null,
      phaseLabel: 'Insufficient history',
      interpretation: 'At least two complete publication years are needed to estimate a production phase.',
      confidenceLow: true,
      confidenceNote: null,
      insufficientHistory: true,
      totalPublications: yearSeries.totalPublications,
      activeSpan: yearSeries.activeSpan,
      usableYears: yearSeries.series.length,
      years: yearSeries.years,
      series: yearSeries.series,
      slope: null,
      recentMean: null,
      baselineMean: null,
      momentum: null,
      recentShare: null,
      peakYear: null,
      peakCount: null,
      historicalGapYearsPresent: false,
      emptyReason: yearSeries.emptyReason,
    }
  }

  const years = yearSeries.years
  const series = yearSeries.series
  const activeSpan = yearSeries.activeSpan
  const usableYears = series.length
  const recentWindowSize = Math.max(1, Math.min(3, usableYears))
  const recentSeries = series.slice(-recentWindowSize)
  const baselineSeries = series.slice(0, Math.max(0, usableYears - recentWindowSize))
  const recentMean = meanPublicationSeries(recentSeries)
  const baselineMean = baselineSeries.length ? meanPublicationSeries(baselineSeries) : 0
  const momentum = recentMean === null || baselineMean === null ? null : recentMean - baselineMean
  const recentShare = yearSeries.scopedPublicationCount > 0
    ? recentSeries.reduce((sum, value) => sum + Math.max(0, value), 0) / yearSeries.scopedPublicationCount
    : null
  const slope = calculatePublicationProductionTrendSlope(years, series)
  const historicalGapYearsPresent = baselineSeries.some((value) => value <= 0)
  const peakIndex = series.length
    ? series.reduce((selectedIndex, value, index, collection) => (
      value > (collection[selectedIndex] ?? -1)
        ? index
        : selectedIndex
    ), 0)
    : -1
  const peakYear = peakIndex >= 0 ? (years[peakIndex] ?? null) : null
  const peakCount = peakIndex >= 0 ? (series[peakIndex] ?? null) : null
  const careerLength = activeSpan
  const lowConfidence = yearSeries.totalPublications < 10 || activeSpan < 4 || usableYears < 4
  const confidenceNote = lowConfidence
    ? 'Phase estimate has lower confidence due to limited publication history.'
    : null

  if (usableYears <= 1) {
    return {
      phase: null,
      phaseLabel: 'Insufficient history',
      interpretation: 'At least two complete publication years are needed to estimate a production phase.',
      confidenceLow: true,
      confidenceNote,
      insufficientHistory: true,
      totalPublications: yearSeries.totalPublications,
      activeSpan,
      usableYears,
      years,
      series,
      slope,
      recentMean,
      baselineMean,
      momentum,
      recentShare,
      peakYear,
      peakCount,
      historicalGapYearsPresent,
      emptyReason: null,
    }
  }

  const safeSlope = slope ?? 0
  const safeMomentum = momentum ?? 0
  const safeRecentShare = recentShare ?? 0
  let phase: PublicationProductionPhaseLabel

  if (safeMomentum > 1 && safeRecentShare > 0.35 && historicalGapYearsPresent) {
    phase = 'Rebuilding'
  } else if (safeSlope < -0.3 && safeMomentum < 0 && safeRecentShare < 0.2) {
    phase = 'Contracting'
  } else if (careerLength > 8 && Math.abs(safeSlope) < 0.3 && safeMomentum < 0) {
    phase = 'Plateauing'
  } else if (careerLength > 8 && Math.abs(safeSlope) < 0.3 && safeRecentShare >= 0.2 && safeRecentShare <= 0.4) {
    phase = 'Established'
  } else if (careerLength <= 5 && (recentMean ?? 0) >= (baselineMean ?? 0)) {
    phase = 'Emerging'
  } else if (safeSlope > 0.3 && safeMomentum > 0 && safeRecentShare > 0.3) {
    phase = 'Scaling'
  } else if (historicalGapYearsPresent && safeMomentum > 0) {
    phase = 'Rebuilding'
  } else if (careerLength <= 5) {
    phase = 'Emerging'
  } else if (safeSlope < -0.1 || safeMomentum < -0.5) {
    phase = safeRecentShare < 0.2 ? 'Contracting' : 'Plateauing'
  } else if (safeSlope > 0.1 || safeMomentum > 0.5) {
    phase = 'Scaling'
  } else {
    phase = 'Established'
  }

  return {
    phase,
    phaseLabel: phase,
    interpretation: getPublicationProductionPhaseInterpretation(phase, false),
    confidenceLow: lowConfidence,
    confidenceNote,
    insufficientHistory: false,
    totalPublications: yearSeries.totalPublications,
    activeSpan,
    usableYears,
    years,
    series,
    slope,
    recentMean,
    baselineMean,
    momentum,
    recentShare,
    peakYear,
    peakCount,
    historicalGapYearsPresent,
    emptyReason: null,
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(Math.round(count)) === 1 ? singular : plural
}

function formatUncitedPapersTooltip(stats: TotalCitationsHeadlineStats): string {
  return `You have ${formatInt(stats.uncitedPapersCount)} uncited publications, representing ${Math.round(stats.uncitedPapersPct)}% of your publication set.`
}

function formatUncitedPapersTableTooltip(stats: TotalCitationsHeadlineStats): string {
  return `You have ${formatInt(stats.uncitedPapersCount)} uncited publications. Select a title to open it in your library.`
}

function formatRecentConcentrationWindowTooltip({
  windowPhrase,
  topPublicationCount,
  topThreeCitations,
  otherCitations,
}: {
  windowPhrase: string
  topPublicationCount: number
  topThreeCitations: number
  otherCitations: number
}): string {
  const total = topThreeCitations + otherCitations
  if (total <= 0) {
    return `You have no recorded citations ${windowPhrase}.`
  }
  const publicationLabel = pluralize(topPublicationCount, 'publication')
  const topShare = Math.round((topThreeCitations / total) * 100)
  return `${windowPhrase.charAt(0).toUpperCase()}${windowPhrase.slice(1)}, your top ${formatInt(topPublicationCount)} ${publicationLabel} account for ${formatInt(topThreeCitations)} of ${formatInt(total)} citations (${topShare}%).`
}

function formatRecentConcentrationTableTooltip(recordsCount: number, windowPhrase: string): string {
  return `Your top ${formatInt(recordsCount)} publications ${windowPhrase} are listed here. Select a title to open it in your library.`
}

function formatCitationHistogramTooltip(totalPublications: number, maxCitations: number): string {
  if (totalPublications <= 0) {
    return 'This histogram groups publications by lifetime citations per publication once publication-level citation counts are available.'
  }
  if (maxCitations <= 0) {
    return `This histogram groups your ${formatInt(totalPublications)} publications by lifetime citations per publication. All currently sit in the uncited bucket.`
  }
  return `This histogram groups your ${formatInt(totalPublications)} publications by lifetime citations per publication. The zero-citation bucket stays separate, and the highest bucket adapts to your current maximum of ${formatInt(maxCitations)} citations.`
}

function formatCitationActivationStateTooltip({
  totalPublications,
  newlyActiveCount,
  stillActiveCount,
  inactiveCount,
}: {
  totalPublications: number
  newlyActiveCount: number
  stillActiveCount: number
  inactiveCount: number
}): string {
  return `Of your ${formatInt(totalPublications)} publications, ${formatInt(newlyActiveCount)} are newly active, ${formatInt(stillActiveCount)} are still active, and ${formatInt(inactiveCount)} had no citations in the last 12 months.`
}

function formatCitationActivationTableTooltip(mode: CitationActivationTableMode, recordsCount: number): string {
  if (mode === 'stillActive') {
    return `Your ${formatInt(recordsCount)} still active publications are listed here with rolling last-12-month and lifetime citations. Select a title to open it in your library.`
  }
  if (mode === 'inactive') {
    return `Your ${formatInt(recordsCount)} inactive publications are listed here with rolling last-12-month and lifetime citations. These had no citations in the last 12 completed months. Select a title to open it in your library.`
  }
  return `Your ${formatInt(recordsCount)} newly active publications are listed here with rolling last-12-month and lifetime citations. These picked up citations in the last 12 completed months after no citations in the prior 24-month lookback. Select a title to open it in your library.`
}

function formatCitationActivationHistoryTooltip(lastCompleteYear: number | null, focusRangeLabel?: string | null): string {
  return `${focusRangeLabel ? `Showing ${focusRangeLabel}. ` : ''}This chart shows citation activity over time, split into newly active, still active, and inactive publications. The line extends only through completed periods, while axis labels mark the broader time scale${lastCompleteYear ? ` through ${formatInt(lastCompleteYear)}` : ''}.`
}

function formatCitationMomentumTooltip({
  mode,
  sleepingCount,
  freshPickupCount,
}: {
  mode: CitationMomentumViewMode
  sleepingCount: number
  freshPickupCount: number
}): string {
  if (mode === 'sleeping') {
    return `Sleeping publications are older titles with established lifetime citations but just 0-1 citations in the last 12 months. This view currently surfaces ${formatInt(sleepingCount)} publications.`
  }
  return `Fresh-pickup publications are older titles whose last 12 months outperformed their prior 24 months combined. This view currently surfaces ${formatInt(freshPickupCount)} publications.`
}

function formatHIndexThresholdStepsTooltip(stats: HIndexDrilldownStats): string {
  const nextStep = stats.summaryThresholdSteps[0]
  const followingStep = stats.summaryThresholdSteps[1]
  if (!nextStep) {
    return 'This view shows the next two h-index thresholds using the current publication set once publication-level citation data is available.'
  }
  return followingStep
    ? `This view shows the step-by-step path to H${formatInt(nextStep.targetH)} and H${formatInt(followingStep.targetH)}. Each row reports how many papers already clear that citation line, the combined citation gap still needed, and the nearest individual gaps.`
    : `This view shows the step-by-step path to H${formatInt(nextStep.targetH)}. It reports how many papers already clear that citation line, the combined citation gap still needed, and the nearest individual gaps.`
}

function formatHIndexThresholdCandidateTableTooltip(
  targetH: number,
  count: number,
): string {
  if (count <= 0) {
    return `No nearby publications are currently available for H${formatInt(targetH)}.`
  }
  return `This table lists the ${formatInt(count)} ${pluralize(count, 'publication')} currently closest to H${formatInt(targetH)}, showing current citations, the remaining gap, the simple 12-month projection, and a pace-based outlook. The outlook is directional, not a literal probability.`
}

function formatHIndexCoreTooltip(stats: HIndexDrilldownStats): string {
  return `For this drilldown, the h-core is the set of papers with at least h citations, where h is currently ${formatInt(stats.currentH)}. Because tied papers can sit on that threshold, this set can contain more than h papers. It currently contains ${formatInt(stats.hCorePublicationCount)} papers and accounts for ${stats.hCoreShareValue} of citations.`
}

function formatHIndexTrajectoryTooltip(stats: HIndexDrilldownStats): string {
  const firstYear = stats.fullHistoryYears[0]
  const lastYear = stats.fullHistoryYears[stats.fullHistoryYears.length - 1]
  const spanText = firstYear && lastYear
    ? `from ${formatInt(firstYear)} through ${formatInt(lastYear)}`
    : 'across the full observed publication history'
  return `This chart traces every observed h-index step ${spanText}, up to the current h${formatInt(stats.currentH)}. Because h-index only moves when another paper crosses the next qualifying line, the series advances in discrete thresholds rather than as a smooth cumulative citation curve.`
}

function formatHIndexMilestonesTooltip(stats: HIndexDrilldownStats): string {
  const milestoneCount = stats.milestones.length
  return milestoneCount > 0
    ? `Each row records when a new h threshold was first reached and how long it took to move from the previous one. ${formatInt(milestoneCount)} ${pluralize(milestoneCount, 'milestone')} ${milestoneCount === 1 ? 'is' : 'are'} currently available.`
    : 'This table records when each h threshold was first reached and how long it took to move from the previous one once milestone data is available.'
}

function formatHIndexTrajectoryPointLabel(label: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(label.trim())
  if (!match) {
    return label
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return label
  }
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function renderHIndexOutlookPill(label: string): ReactNode {
  let toneClass: string = HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
  switch (label) {
    case 'Strong':
    case 'On pace':
    case 'At line':
      toneClass = HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
      break
    case 'Live':
      toneClass = HOUSE_DRILLDOWN_BADGE_ACCENT_CLASS
      break
    case 'Stretch':
      toneClass = HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
      break
    case 'Off pace':
    case 'No recent pace':
      toneClass = HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
      break
    default:
      toneClass = HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
      break
  }
  const allowsWrap = label === 'No recent pace'
  return (
    <span
      className={cn(
        HOUSE_DRILLDOWN_BADGE_CLASS,
        toneClass,
        'justify-center text-center',
        allowsWrap ? 'leading-tight whitespace-normal py-1' : 'whitespace-nowrap',
      )}
    >
      {allowsWrap ? <>No recent<br />pace</> : label}
    </span>
  )
}

function renderTrajectoryPhaseBadge(label: string): ReactNode {
  let toneClass: string = HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
  switch (label) {
    case 'Expanding':
      toneClass = HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
      break
    case 'Contracting':
      toneClass = HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
      break
    default:
      toneClass = HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
      break
  }
  return (
    <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, toneClass, 'whitespace-nowrap')}>
      {label}
    </span>
  )
}

function renderPublicationConsistencyBadge(value: number): ReactNode {
  const label = getPublicationConsistencyInterpretation(value)
  const tone = getPublicationConsistencyTone(value)
  const toneClass = tone === 'positive'
    ? HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
    : tone === 'neutral'
      ? HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
      : tone === 'warning'
        ? HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
        : HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
  return (
    <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, toneClass, 'whitespace-nowrap')}>
      {label}
    </span>
  )
}

function renderPublicationBurstinessBadge(value: number): ReactNode {
  const label = getPublicationBurstinessInterpretation(value)
  const tone = getPublicationBurstinessTone(value)
  const toneClass = tone === 'danger'
    ? HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
    : tone === 'warning'
      ? HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
      : tone === 'neutral'
        ? HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
        : tone === 'accent'
          ? HOUSE_DRILLDOWN_BADGE_ACCENT_CLASS
          : HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
  return (
    <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, toneClass, 'whitespace-nowrap')}>
      {label}
    </span>
  )
}

function renderPublicationPeakYearShareBadge(value: number): ReactNode {
  const label = getPublicationPeakYearShareInterpretation(value)
  const tone = getPublicationPeakYearShareTone(value)
  const toneClass = tone === 'danger'
    ? HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
    : tone === 'warning'
      ? HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
      : tone === 'neutral'
        ? HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
        : tone === 'accent'
          ? HOUSE_DRILLDOWN_BADGE_ACCENT_CLASS
          : HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
  return (
    <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, toneClass, 'whitespace-nowrap')}>
      {label}
    </span>
  )
}

function renderPublicationOutputContinuityBadge(value: number): ReactNode {
  const label = getPublicationOutputContinuityInterpretation(value)
  const tone = getPublicationOutputContinuityTone(value)
  const toneClass = tone === 'danger'
    ? HOUSE_DRILLDOWN_BADGE_DANGER_CLASS
    : tone === 'warning'
      ? HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
      : tone === 'neutral'
        ? HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS
        : tone === 'accent'
          ? HOUSE_DRILLDOWN_BADGE_ACCENT_CLASS
          : HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
  return (
    <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, toneClass, 'whitespace-nowrap')}>
      {label}
    </span>
  )
}

type PublicationProductionPatternCardProps = {
  dataUi: string
  title: string
  primaryValue: string
  secondaryValue?: string
  semanticLabel: ReactNode
  tooltip: ReactNode
  meterValue?: number | null
  meterTone?: PublicationProductionPatternTone
  meterIndex?: number
}

function PublicationProductionPatternCard({
  dataUi,
  title,
  primaryValue,
  secondaryValue,
  semanticLabel,
  tooltip,
  meterValue,
  meterTone = 'accent',
  meterIndex = 0,
}: PublicationProductionPatternCardProps) {
  const boundedMeterValue = meterValue === null || meterValue === undefined
    ? null
    : Math.max(0, Math.min(1, meterValue))
  const progressAnimationKey = useMemo(
    () => `${title}|${Math.round((boundedMeterValue ?? 0) * 1000)}`,
    [boundedMeterValue, title],
  )
  const progressExpanded = useUnifiedToggleBarAnimation(progressAnimationKey, boundedMeterValue !== null)
  const isEntryCycle = useIsFirstChartEntry(progressAnimationKey, boundedMeterValue !== null)
  const progressTransitionDuration = tileMotionEntryDuration(meterIndex, isEntryCycle && progressExpanded)

  return (
    <div
      data-ui={dataUi}
      className={cn(
        HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS,
        'items-stretch justify-start gap-3.5 px-[1.05rem] py-[1.05rem] text-left',
      )}
    >
      <div className="flex w-full items-start justify-between gap-3.5">
        <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS, 'min-h-0 justify-start text-left')}>
          {title}
        </p>
        <HelpTooltipIconButton
          ariaLabel={`Explain ${title}`}
          content={tooltip}
          align="end"
          side="top"
          buttonClassName="h-6 w-6 shrink-0"
          iconClassName="text-[0.82rem]"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'text-left tabular-nums')}>
          {primaryValue}
        </p>
        {secondaryValue ? (
          <p className="text-sm font-semibold tabular-nums text-[hsl(var(--tone-neutral-700))]">
            {secondaryValue}
          </p>
        ) : null}
      </div>

      <div className="w-full pt-0.5">
        {semanticLabel}
      </div>

      {boundedMeterValue !== null ? (
        <div className="w-full pt-1">
          <div className={HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS}>
            <div
              className={cn(HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS, 'house-progress-fill-motion')}
              style={{
                width: `${progressExpanded ? boundedMeterValue * 100 : 0}%`,
                backgroundColor: resolvePublicationProductionPatternToneColor(meterTone),
                transitionDelay: tileMotionEntryDelay(meterIndex, isEntryCycle && progressExpanded),
                '--chart-transition-duration': progressTransitionDuration,
              } as React.CSSProperties}
              aria-hidden="true"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PublicationProductionPhaseChart({
  years,
  values,
  tone,
}: {
  years: number[]
  values: number[]
  tone: PublicationProductionPatternTone
}) {
  const [lineRevealProgress, setLineRevealProgress] = useState(0)
  const phaseRevealIdBase = useId().replace(/:/g, '')
  const phaseRevealMaskId = `${phaseRevealIdBase}-mask`
  const phaseRevealGradientId = `${phaseRevealIdBase}-gradient`
  const bars = useMemo(() => (
    years.map((year, index) => ({
      key: `publication-production-phase-${year}-${index}`,
      year,
      value: Math.max(0, Number(values[index] || 0)),
    }))
  ), [values, years])
  const hasBars = bars.length > 0
  const animationKey = useMemo(
    () => `publication-production-phase-chart:${bars.map((bar) => `${bar.year}-${bar.value}`).join('|') || 'empty'}`,
    [bars],
  )
  const lineEntryCycle = useIsFirstChartEntry(`${animationKey}|phase-line`, hasBars)
  const lineAnimationProfileRef = useRef<{ key: string, delayMs: number, durationMs: number } | null>(null)
  if (!lineAnimationProfileRef.current || lineAnimationProfileRef.current.key !== animationKey) {
    lineAnimationProfileRef.current = {
      key: animationKey,
      delayMs: lineEntryCycle ? 120 : 48,
      durationMs: lineEntryCycle ? 940 : 720,
    }
  }
  const lineAnimationDelayMs = lineAnimationProfileRef.current.delayMs
  const lineAnimationDurationMs = lineAnimationProfileRef.current.durationMs
  const axisScale = useMemo(
    () => buildNiceAxis(Math.max(1, ...bars.map((bar) => bar.value))),
    [bars],
  )
  const axisMax = Math.max(1, axisScale.axisMax)
  const yAxisTickValues = axisScale.ticks
  const yAxisTickRatios = useMemo(
    () => yAxisTickValues.map((tickValue) => (axisMax <= 0 ? 0 : tickValue / axisMax)),
    [axisMax, yAxisTickValues],
  )
  const gridTickRatiosWithoutTop = yAxisTickRatios.filter((ratio) => ratio < 0.999)
  const hasTopYAxisTick = yAxisTickRatios.some((ratio) => ratio >= 0.999)
  const positionedTicks = useMemo(() => {
    const rawTicks = buildTrajectoryYearTicks(years)
    return rawTicks.map((tick) => {
      const tickYear = Number(tick.label)
      const tickIndex = years.findIndex((year) => year === tickYear)
      return {
        ...tick,
        leftPct: years.length <= 1
          ? 50
          : tickIndex < 0
            ? 50
            : (tickIndex / Math.max(1, years.length - 1)) * 100,
      }
    })
  }, [years])
  const verticalGridPercents = useMemo(
    () => positionedTicks
      .map((tick) => Math.max(0, Math.min(100, tick.leftPct)))
      .filter((value) => value > 0.5 && value < 99.5)
      .filter((value, index, collection) => index === 0 || Math.abs(value - collection[index - 1]) > 0.5),
    [positionedTicks],
  )
  const xAxisLayout = useMemo(
    () => buildChartAxisLayout({
      axisLabels: positionedTicks.map((tick) => tick.label),
      showXAxisName: true,
      xAxisName: 'Publication year',
      dense: positionedTicks.length >= 5,
      maxLabelLines: 1,
      maxSubLabelLines: 1,
      maxAxisNameLines: 1,
    }),
    [positionedTicks],
  )
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(yAxisTickValues, true, 0.5)
  const chartLeftInset = `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${xAxisLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${xAxisLayout.axisBottomRem}rem`,
    minHeight: `${xAxisLayout.axisMinHeightRem}rem`,
  }
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${xAxisLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const yAxisTitleLeft = '36%'
  const yAxisLabel = 'Publications (per year)'
  const toneColor = resolvePublicationProductionPatternToneColor(tone)
  const points = useMemo(() => (
    bars.map((bar, index) => ({
      ...bar,
      xPct: bars.length <= 1 ? 50 : (index / Math.max(1, bars.length - 1)) * 100,
      yPct: Math.max(0, Math.min(100, (bar.value / axisMax) * 100)),
    }))
  ), [axisMax, bars])
  const linePath = useMemo(() => {
    if (!points.length) {
      return ''
    }
    if (points.length === 1) {
      const point = points[0]
      return point ? `M ${point.xPct} ${100 - point.yPct}` : ''
    }
    return monotonePathFromPoints(points.map((point) => ({
      x: point.xPct,
      y: 100 - point.yPct,
    })))
  }, [points])
  const areaPath = useMemo(() => {
    if (points.length < 2 || !linePath) {
      return ''
    }
    const firstPoint = points[0]
    const lastPoint = points[points.length - 1]
    if (!firstPoint || !lastPoint) {
      return ''
    }
    return `${linePath} L ${lastPoint.xPct} 100 L ${firstPoint.xPct} 100 Z`
  }, [linePath, points])
  const revealLeadPct = Math.max(0, Math.min(100, lineRevealProgress * 100))
  const revealRemainingPct = Math.max(0, 100 - revealLeadPct)
  const revealFeatherPct = lineRevealProgress >= 0.999
    ? 0
    : Math.min(8, Math.max(1.5, revealLeadPct * 0.22), revealRemainingPct + 0.75)
  const revealSolidPct = lineRevealProgress >= 0.999
    ? 100
    : Math.max(0, revealLeadPct - revealFeatherPct)

  useEffect(() => {
    if (!hasBars || !linePath) {
      setLineRevealProgress(0)
      return
    }
    if (prefersReducedMotion()) {
      setLineRevealProgress(1)
      return
    }
    let raf = 0
    const startedAt = performance.now()
    const easePhaseWipe = (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress))
      return clamped * clamped * (3 - (2 * clamped))
    }
    setLineRevealProgress(0)
    const step = (now: number) => {
      const elapsed = now - startedAt
      if (elapsed < lineAnimationDelayMs) {
        setLineRevealProgress(0)
        raf = window.requestAnimationFrame(step)
        return
      }
      const progress = Math.min(1, (elapsed - lineAnimationDelayMs) / Math.max(1, lineAnimationDurationMs))
      setLineRevealProgress(easePhaseWipe(progress))
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, hasBars, lineAnimationDelayMs, lineAnimationDurationMs, linePath])

  if (!hasBars) {
    return null
  }

  return (
    <div
      className={cn(
        'relative h-[13.25rem] w-full',
        HOUSE_CHART_TRANSITION_CLASS,
        HOUSE_CHART_ENTERED_CLASS,
        'house-publications-trend-chart-frame-borderless',
      )}
      data-ui="publication-production-phase-chart"
      data-house-role="chart-frame"
    >
      <div className="absolute overflow-visible" style={plotAreaStyle}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0"
            style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.7)' }}
          />
          {gridTickRatiosWithoutTop.map((ratio, index) => (
            <div
              key={`publication-production-phase-grid-y-${index}`}
              className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS)}
              style={{
                bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                borderTop: `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`,
              }}
            />
          ))}
          {hasTopYAxisTick ? (
            <div
              className={cn('absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS)}
              style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
            />
          ) : null}
          {verticalGridPercents.map((leftPct, index) => (
            <div
              key={`publication-production-phase-grid-x-${index}`}
              className={cn('absolute inset-y-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS)}
              style={{ left: `${leftPct}%`, borderLeft: '1px solid hsl(var(--stroke-soft) / 0.58)' }}
              aria-hidden="true"
            />
          ))}
          <div
            className="absolute inset-y-0 right-0"
            style={{ borderRight: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
            aria-hidden="true"
          />
        </div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Publication production phase chart"
        >
          <defs>
            <linearGradient id={phaseRevealGradientId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="white" />
              <stop offset="72%" stopColor="white" />
              <stop offset="100%" stopColor="black" />
            </linearGradient>
            <mask id={phaseRevealMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect x="0" y="0" width="100" height="100" fill="black" />
              <rect x="0" y="0" width={revealSolidPct} height="100" fill="white" />
              {revealFeatherPct > 0 ? (
                <rect
                  x={revealSolidPct}
                  y="0"
                  width={revealFeatherPct}
                  height="100"
                  fill={`url(#${phaseRevealGradientId})`}
                />
              ) : null}
            </mask>
          </defs>
          {areaPath ? (
            <path
              d={areaPath}
              fill={toneColor}
              opacity={0.12 * Math.max(0, Math.min(1, (lineRevealProgress - 0.28) / 0.72))}
              vectorEffect="non-scaling-stroke"
              mask={`url(#${phaseRevealMaskId})`}
            />
          ) : null}
          {linePath && points.length > 1 ? (
            <path
              d={linePath}
              fill="none"
              stroke={toneColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              mask={`url(#${phaseRevealMaskId})`}
            />
          ) : null}
        </svg>
      </div>

      <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
        {yAxisTickValues.map((tickValue, index) => {
          const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
          const tickRatioKey = Math.round((yAxisTickRatios[index] || 0) * 1000)
          return (
            <p
              key={`publication-production-phase-y-axis-${tickRatioKey}`}
              className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS)}
              style={{ bottom: `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM}rem)` }}
            >
              {formatInt(Math.round(Number(tickValue || 0)))}
            </p>
          )
        })}
        <p
          className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
          style={{ left: yAxisTitleLeft }}
        >
          {yAxisLabel}
        </p>
      </div>

      <div
        className={cn(
          'pointer-events-none absolute',
          HOUSE_TOGGLE_CHART_LABEL_CLASS,
        )}
        style={xAxisTicksStyle}
        data-ui="publication-production-phase-x-axis"
      >
        {positionedTicks.map((tick, index) => {
          const tickAnchor = getTrajectoryYearTickAnchor(tick.leftPct)
          const isFirst = index === 0
          const isLast = index === positionedTicks.length - 1
          return (
            <div
              key={tick.key}
              className={cn(
                'house-chart-axis-period-item absolute top-0 leading-none',
                tickAnchor === 'left' ? 'text-left' : tickAnchor === 'right' ? 'text-right' : 'text-center',
                HOUSE_CHART_SCALE_TICK_CLASS,
              )}
              style={{
                left: `${tick.leftPct}%`,
                transform: tickAnchor === 'left'
                  ? 'translateX(0)'
                  : tickAnchor === 'right'
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
              }}
              aria-label={`${isFirst ? 'Start' : isLast ? 'End' : 'Middle'} phase year: ${tick.label}`}
            >
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                {tick.label}
              </p>
            </div>
          )
        })}
      </div>

      <div
        className="pointer-events-none absolute"
        style={{
          left: chartLeftInset,
          right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
          bottom: `${xAxisLayout.xAxisNameBottomRem}rem`,
          minHeight: `${xAxisLayout.xAxisNameMinHeightRem}rem`,
        }}
      >
        <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
          Publication year
        </p>
      </div>
    </div>
  )
}

function renderPublicationProductionPhaseTooltipContent(stats: PublicationProductionPhaseStats) {
  const recentWindowSize = Math.max(1, Math.min(3, stats.usableYears || stats.years.length || 1))
  const firstYear = stats.years[0] ?? null
  const lastYear = stats.years[stats.years.length - 1] ?? null
  const recentYears = stats.years.slice(-recentWindowSize)
  const recentSeries = stats.series.slice(-recentWindowSize)
  const recentPublicationCount = recentSeries.reduce((sum, value) => sum + Math.max(0, value), 0)
  const recentStartYear = recentYears[0] ?? null
  const recentEndYear = recentYears[recentYears.length - 1] ?? null
  const slopePeriodText = firstYear === null || lastYear === null
    ? null
    : firstYear === lastYear
      ? `in ${firstYear}`
      : `between ${firstYear} and ${lastYear}`
  const recentPeriodText = recentStartYear === null || recentEndYear === null
    ? null
    : recentStartYear === recentEndYear
      ? `in ${recentStartYear}`
      : `between ${recentStartYear} and ${recentEndYear}`

  return (
    <div className="space-y-2.5">
      {stats.emptyReason ? (
        <p>{stats.emptyReason}</p>
      ) : stats.insufficientHistory ? (
        <>
          <p>
            <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">
              Your publication-output stage cannot yet be estimated confidently.
            </span>
            {' '}
            There is not enough complete-year history to classify it reliably.
          </p>
          {stats.confidenceNote ? <p>{stats.confidenceNote}</p> : null}
        </>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[hsl(var(--tone-neutral-600))]">Your publication-output stage is:</p>
            <p className={cn('text-center text-sm font-semibold leading-tight', getPublicationProductionPhaseTooltipLabelClass(stats.phase))}>
              {stats.phaseLabel}
            </p>
            <p>{getPublicationProductionPhaseUserMeaning(stats.phase)}</p>
          </div>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Trend slope:</span>
              {' '}
              {formatPublicationProductionPhaseSlopeExplanation(stats.slope, slopePeriodText)}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Recent share:</span>
              {' '}
              {stats.recentShare !== null
                ? `${formatInt(recentPublicationCount)} of your ${formatInt(stats.totalPublications)} publications (${Math.round(stats.recentShare * 100)}%) came ${recentPeriodText ?? 'in your recent complete years'}, within a ${formatPublicationProductionSpanLabel(stats.activeSpan)}.`
                : 'your recent-share context is not available yet.'}
            </li>
            <li>
              <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Peak year:</span>
              {' '}
              {stats.peakYear !== null
                ? stats.peakCount !== null
                  ? `your highest-output year was ${stats.peakYear}, with ${formatInt(stats.peakCount)} publications.`
                  : `your highest-output year was ${stats.peakYear}.`
                : 'your peak-year context is not available yet.'}
            </li>
          </ul>
          {stats.confidenceNote ? <p>{stats.confidenceNote}</p> : null}
        </>
      )}
    </div>
  )
}

function formatPublicationInsightFullDate(value: Date | null): string | null {
  if (!value) {
    return null
  }
  return value.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatPublicationInsightDayMonthYear(value: string | null | undefined): string | null {
  const parsed = typeof value === 'string' && value.trim()
    ? new Date(`${value.trim()}T00:00:00Z`)
    : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null
  }
  return formatPublicationInsightFullDate(parsed)
}

function formatPublicationInsightMonthWindowLabel(start: Date | null, end: Date | null): string | null {
  if (!start || !end) {
    return null
  }
  const startLabel = formatPublicationMonthYear(start)
  const endLabel = formatPublicationMonthYear(end)
  return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`
}

function resolvePublicationInsightRecordDateLabel(record: PublicationDrilldownRecord): string | null {
  if (record.publicationDate) {
    return formatPublicationInsightDayMonthYear(record.publicationDate)
  }
  if (record.publicationMonthStart) {
    const parsedMonth = parseIsoMonthStart(record.publicationMonthStart)
    return formatPublicationMonthYear(parsedMonth)
  }
  if (typeof record.year === 'number' && Number.isFinite(record.year)) {
    return String(Math.round(record.year))
  }
  return null
}

function formatPublicationInsightYearList(years: number[]): string {
  const cleanYears = years.filter((year) => Number.isInteger(year))
  if (cleanYears.length <= 1) {
    return `${cleanYears[0] ?? ''}`.trim()
  }
  if (cleanYears.length === 2) {
    return `${cleanYears[0]} and ${cleanYears[1]}`
  }
  return `${cleanYears.slice(0, -1).join(', ')}, and ${cleanYears[cleanYears.length - 1]}`
}

function formatPublicationInsightPeriodLabel(label: string | null | undefined): string | null {
  const clean = String(label || '').trim()
  if (!clean) {
    return null
  }
  const match = /^([A-Za-z]{3}) (\d{4})-([A-Za-z]{3}) (\d{4})$/.exec(clean)
  if (!match) {
    return clean
  }
  const startYear = Number(match[2])
  const endYear = Number(match[4])
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return clean
  }
  if (startYear === endYear) {
    return `${startYear} period`
  }
  return `${startYear}-${String(endYear).slice(-2)} period`
}

function buildPublicationVolumeOverTimeRollingBlocks(
  monthStarts: Date[],
  counts: number[],
  years: number,
): { windowLabel: string | null; blocks: PublicationVolumeOverTimeRollingBlock[] } {
  const monthCount = Math.max(0, years * 12)
  if (monthStarts.length < monthCount || counts.length < monthCount) {
    return { windowLabel: null, blocks: [] }
  }
  const sourceMonthStarts = monthStarts.slice(-monthCount)
  const sourceCounts = counts.slice(-monthCount)
  const blocks: PublicationVolumeOverTimeRollingBlock[] = []
  for (let index = 0; index < sourceCounts.length; index += 12) {
    const chunkCounts = sourceCounts.slice(index, index + 12)
    const chunkMonthStarts = sourceMonthStarts.slice(index, index + 12)
    if (!chunkCounts.length || !chunkMonthStarts.length) {
      continue
    }
    blocks.push({
      label: formatPublicationInsightMonthWindowLabel(
        chunkMonthStarts[0] ?? null,
        chunkMonthStarts[chunkMonthStarts.length - 1] ?? null,
      ) ?? `Window ${blocks.length + 1}`,
      count: chunkCounts.reduce((sum, value) => sum + Math.max(0, value), 0),
    })
  }
  return {
    windowLabel: formatPublicationInsightMonthWindowLabel(
      sourceMonthStarts[0] ?? null,
      sourceMonthStarts[sourceMonthStarts.length - 1] ?? null,
    ),
    blocks,
  }
}

function buildPublicationVolumeOverTimeInsightStats(
  tile: PublicationMetricTilePayload,
  publicationRecords: PublicationDrilldownRecord[],
): PublicationVolumeOverTimeInsightStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const asOfDate = parsePublicationProductionPatternAsOfDate(drilldown.as_of_date) ?? new Date()
  const currentMonthStart = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), 1))
  const recentMonthStarts = Array.from({ length: 12 }, (_value, index) => (
    shiftUtcMonth(currentMonthStart, index - 12)
  ))
  const recentRawValues = toNumberArray(chartData.monthly_values_12m).map((value) => Math.max(0, Math.round(value)))
  const recentSourceLabels = toStringArray(chartData.month_labels_12m)
  const recentLastMonthIndex = recentSourceLabels.length ? parseMonthIndex(recentSourceLabels[recentSourceLabels.length - 1]) : null
  const recentIncludesCurrentMonth = recentLastMonthIndex !== null && recentLastMonthIndex === currentMonthStart.getUTCMonth()
  const recentSourceWindow = recentRawValues.length >= 13 && recentIncludesCurrentMonth
    ? recentRawValues.slice(-13, -1)
    : recentRawValues.length >= 12
      ? recentRawValues.slice(-12)
      : recentRawValues
  const recentCounts = recentSourceWindow.length >= 12
    ? recentSourceWindow.slice(-12)
    : recentSourceWindow.length > 0
      ? [...Array.from({ length: 12 - recentSourceWindow.length }, () => 0), ...recentSourceWindow]
      : Array.from({ length: 12 }, () => 0)
  const recentWindowLabel = formatPublicationInsightMonthWindowLabel(
    recentMonthStarts[0] ?? null,
    recentMonthStarts[recentMonthStarts.length - 1] ?? null,
  )
  const recentWindowEndLabel = formatPublicationInsightFullDate(new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), 0)))
  const recentPeakCount = Math.max(...recentCounts, 0)
  const recentWindowPeakLabels = recentPeakCount > 0
    ? recentCounts.flatMap((count, index) => count === recentPeakCount ? [formatPublicationMonthYear(recentMonthStarts[index])] : []).slice(0, 3)
    : []

  const lifetimeCounts = toNumberArray(chartData.monthly_values_lifetime).map((value) => Math.max(0, Math.round(value)))
  const lifetimeLabels = toStringArray(chartData.month_labels_lifetime)
  const lifetimeMonthStarts = lifetimeCounts.map((_value, index) => {
    const parsed = parseIsoMonthStart(lifetimeLabels[index] || '')
    if (parsed) {
      return parsed
    }
    const lifetimeStart = parseIsoPublicationDate(String(chartData.lifetime_month_start || '').trim())
    return lifetimeStart ? shiftUtcMonth(lifetimeStart, index) : shiftUtcMonth(currentMonthStart, index - lifetimeCounts.length)
  })
  const rolling3y = buildPublicationVolumeOverTimeRollingBlocks(lifetimeMonthStarts, lifetimeCounts, 3)
  const rolling5y = buildPublicationVolumeOverTimeRollingBlocks(lifetimeMonthStarts, lifetimeCounts, 5)

  const yearSeries = buildPublicationProductionYearSeries(tile, 'complete')
  const peakCount = yearSeries.series.length ? Math.max(...yearSeries.series) : null
  const peakYears = peakCount === null
    ? []
    : yearSeries.years.filter((_year, index) => yearSeries.series[index] === peakCount)
  const lowCount = yearSeries.series.length ? Math.min(...yearSeries.series) : null
  const lowYears = lowCount === null
    ? []
    : yearSeries.years.filter((_year, index) => yearSeries.series[index] === lowCount)

  const recentDetailedRecords = publicationRecords
    .map((record) => ({
      ...record,
      parsedPublicationDate: parsePublicationRecordDate(record),
      displayPublicationDateLabel: resolvePublicationInsightRecordDateLabel(record),
    }))
    .filter((record) => record.parsedPublicationDate && record.parsedPublicationDate.getTime() >= recentMonthStarts[0].getTime() && record.parsedPublicationDate.getTime() < currentMonthStart.getTime())
    .sort((left, right) => (right.parsedPublicationDate?.getTime() ?? 0) - (left.parsedPublicationDate?.getTime() ?? 0))
  const recentOldestRecord = recentDetailedRecords[recentDetailedRecords.length - 1] ?? null
  const recentMostRecentRecord = recentDetailedRecords[0] ?? null
  const recentRangeStartLabel = recentOldestRecord?.displayPublicationDateLabel || null
  const recentRangeEndLabel = recentMostRecentRecord?.displayPublicationDateLabel || null

  return {
    totalPublications: yearSeries.totalPublications,
    spanLabel: yearSeries.firstPublicationYear !== null && yearSeries.lastPublicationYear !== null
      ? yearSeries.firstPublicationYear === yearSeries.lastPublicationYear
        ? `${yearSeries.firstPublicationYear}`
        : `${yearSeries.firstPublicationYear}-${yearSeries.lastPublicationYear}`
      : null,
    firstPublicationYear: yearSeries.firstPublicationYear,
    lastPublicationYear: yearSeries.lastPublicationYear,
    peakYears,
    peakCount,
    lowYears,
    lowCount,
    recentWindowLabel,
    recentWindowEndLabel,
    recentWindowTotal: recentCounts.reduce((sum, value) => sum + Math.max(0, value), 0),
    recentWindowActiveMonths: recentCounts.filter((value) => value > 0).length,
    recentWindowPeakLabels,
    threeYearWindowLabel: rolling3y.windowLabel,
    threeYearBlocks: rolling3y.blocks,
    fiveYearWindowLabel: rolling5y.windowLabel,
    fiveYearBlocks: rolling5y.blocks,
    recentDetailCount: recentDetailedRecords.length,
    recentDetailRangeLabel: recentRangeStartLabel && recentRangeEndLabel
      ? recentRangeStartLabel === recentRangeEndLabel
        ? recentRangeStartLabel
        : `${recentRangeStartLabel} to ${recentRangeEndLabel}`
      : null,
    recentMostRecentDateLabel: recentRangeEndLabel,
    recentMostRecentTitle: recentMostRecentRecord?.title?.trim() || null,
  }
}

function formatPublicationInsightLabelList(labels: string[]): string {
  const safeLabels = labels.map((label) => String(label || '').trim()).filter(Boolean)
  if (!safeLabels.length) {
    return 'Unspecified'
  }
  if (safeLabels.length === 1) {
    return safeLabels[0]
  }
  if (safeLabels.length === 2) {
    return `${safeLabels[0]} and ${safeLabels[1]}`
  }
  return `${safeLabels.slice(0, -1).join(', ')}, and ${safeLabels[safeLabels.length - 1]}`
}

function buildPublicationArticleTypeWindowInsightSummary({
  publicationRecords,
  fullYears,
  windowId,
}: {
  publicationRecords: PublicationDrilldownRecord[]
  fullYears: number[]
  windowId: PublicationsWindowMode
}): PublicationArticleTypeWindowInsightSummary | null {
  if (!fullYears.length) {
    return null
  }
  const windowSize = windowId === '1y'
    ? 1
    : windowId === '3y'
      ? 3
      : windowId === '5y'
        ? 5
        : null
  const windowYears = windowSize === null ? fullYears : fullYears.slice(-windowSize)
  if (!windowYears.length) {
    return null
  }
  const yearSet = new Set(windowYears)
  const counts = new Map<string, number>()
  publicationRecords.forEach((record) => {
    if (record.year === null || !yearSet.has(record.year)) {
      return
    }
    const label = categoryLabelFromPublication(record, 'article')
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  const sortedEntries = Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }
      return left[0].localeCompare(right[0])
    })
  const totalCount = sortedEntries.reduce((sum, [, count]) => sum + Math.max(0, count), 0)
  const topCount = sortedEntries.length ? Math.max(...sortedEntries.map(([, count]) => count)) : 0
  const topLabels = topCount > 0
    ? sortedEntries.filter(([, count]) => count === topCount).map(([label]) => label)
    : []
  const secondEntry = sortedEntries.find(([, count]) => count < topCount) || null
  return {
    windowId,
    rangeLabel: windowYears[0] === windowYears[windowYears.length - 1]
      ? String(windowYears[0])
      : `${windowYears[0]}-${windowYears[windowYears.length - 1]}`,
    totalCount,
    distinctTypeCount: sortedEntries.length,
    topLabels,
    topCount,
    topSharePct: totalCount > 0 && topCount > 0 ? (topCount / totalCount) * 100 : null,
    secondLabel: secondEntry?.[0] || null,
    secondSharePct: totalCount > 0 && secondEntry ? (secondEntry[1] / totalCount) * 100 : null,
    orderedLabels: sortedEntries.slice(0, 4).map(([label]) => label),
  }
}

function buildPublicationArticleTypeOverTimeInsightStats(
  publicationRecords: PublicationDrilldownRecord[],
  asOfDate: Date | null,
): PublicationArticleTypeOverTimeInsightStats {
  const yearsWithData = publicationRecords
    .map((record) => record.year)
    .filter((value): value is number => Number.isInteger(value))
    .sort((left, right) => left - right)
  if (!yearsWithData.length) {
    return {
      emptyReason: 'No article type data is available yet.',
      spanLabel: null,
      firstPublicationYear: null,
      lastPublicationYear: null,
      totalCount: 0,
      allWindow: null,
      fiveYearWindow: null,
      threeYearWindow: null,
      oneYearWindow: null,
      latestYearIsPartial: false,
      latestPartialYearLabel: null,
    }
  }
  const firstPublicationYear = yearsWithData[0]
  const lastPublicationYear = yearsWithData[yearsWithData.length - 1]
  const fullYears: number[] = []
  for (let year = firstPublicationYear; year <= lastPublicationYear; year += 1) {
    fullYears.push(year)
  }
  const allWindow = buildPublicationArticleTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: 'all',
  })
  const fiveYearWindow = buildPublicationArticleTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '5y',
  })
  const threeYearWindow = buildPublicationArticleTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '3y',
  })
  const oneYearWindow = buildPublicationArticleTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '1y',
  })
  const latestYearIsPartial = Boolean(
    asOfDate
    && lastPublicationYear === asOfDate.getUTCFullYear()
    && (asOfDate.getUTCMonth() < 11 || asOfDate.getUTCDate() < 31),
  )
  return {
    emptyReason: allWindow?.totalCount ? null : 'No article type data is available yet.',
    spanLabel: firstPublicationYear === lastPublicationYear ? `${firstPublicationYear}` : `${firstPublicationYear}-${lastPublicationYear}`,
    firstPublicationYear,
    lastPublicationYear,
    totalCount: allWindow?.totalCount || 0,
    allWindow,
    fiveYearWindow,
    threeYearWindow,
    oneYearWindow,
    latestYearIsPartial,
    latestPartialYearLabel: latestYearIsPartial && asOfDate
      ? `${lastPublicationYear} (through ${formatPublicationInsightFullDate(asOfDate)})`
      : null,
  }
}

function buildPublicationPublicationTypeWindowInsightSummary({
  publicationRecords,
  fullYears,
  windowId,
}: {
  publicationRecords: PublicationDrilldownRecord[]
  fullYears: number[]
  windowId: PublicationsWindowMode
}): PublicationPublicationTypeWindowInsightSummary | null {
  if (!fullYears.length) {
    return null
  }
  const windowSize = windowId === '1y'
    ? 1
    : windowId === '3y'
      ? 3
      : windowId === '5y'
        ? 5
        : null
  const windowYears = windowSize === null ? fullYears : fullYears.slice(-windowSize)
  if (!windowYears.length) {
    return null
  }
  const yearSet = new Set(windowYears)
  const counts = new Map<string, number>()
  publicationRecords.forEach((record) => {
    if (record.year === null || !yearSet.has(record.year)) {
      return
    }
    const label = categoryLabelFromPublication(record, 'publication')
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  const sortedEntries = Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }
      return left[0].localeCompare(right[0])
    })
  const totalCount = sortedEntries.reduce((sum, [, count]) => sum + Math.max(0, count), 0)
  const topCount = sortedEntries.length ? Math.max(...sortedEntries.map(([, count]) => count)) : 0
  const topLabels = topCount > 0
    ? sortedEntries.filter(([, count]) => count === topCount).map(([label]) => label)
    : []
  const secondEntry = sortedEntries.find(([, count]) => count < topCount) || null
  return {
    windowId,
    rangeLabel: windowYears[0] === windowYears[windowYears.length - 1]
      ? String(windowYears[0])
      : `${windowYears[0]}-${windowYears[windowYears.length - 1]}`,
    totalCount,
    distinctTypeCount: sortedEntries.length,
    topLabels,
    topCount,
    topSharePct: totalCount > 0 && topCount > 0 ? (topCount / totalCount) * 100 : null,
    secondLabel: secondEntry?.[0] || null,
    secondSharePct: totalCount > 0 && secondEntry ? (secondEntry[1] / totalCount) * 100 : null,
    orderedLabels: sortedEntries.slice(0, 4).map(([label]) => label),
  }
}

function buildPublicationPublicationTypeOverTimeInsightStats(
  publicationRecords: PublicationDrilldownRecord[],
  asOfDate: Date | null,
): PublicationPublicationTypeOverTimeInsightStats {
  const yearsWithData = publicationRecords
    .map((record) => record.year)
    .filter((value): value is number => Number.isInteger(value))
    .sort((left, right) => left - right)
  if (!yearsWithData.length) {
    return {
      emptyReason: 'No publication type data is available yet.',
      spanLabel: null,
      firstPublicationYear: null,
      lastPublicationYear: null,
      totalCount: 0,
      allWindow: null,
      fiveYearWindow: null,
      threeYearWindow: null,
      oneYearWindow: null,
      latestYearIsPartial: false,
      latestPartialYearLabel: null,
    }
  }
  const firstPublicationYear = yearsWithData[0]
  const lastPublicationYear = yearsWithData[yearsWithData.length - 1]
  const fullYears: number[] = []
  for (let year = firstPublicationYear; year <= lastPublicationYear; year += 1) {
    fullYears.push(year)
  }
  const allWindow = buildPublicationPublicationTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: 'all',
  })
  const fiveYearWindow = buildPublicationPublicationTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '5y',
  })
  const threeYearWindow = buildPublicationPublicationTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '3y',
  })
  const oneYearWindow = buildPublicationPublicationTypeWindowInsightSummary({
    publicationRecords,
    fullYears,
    windowId: '1y',
  })
  const latestYearIsPartial = Boolean(
    asOfDate
    && lastPublicationYear === asOfDate.getUTCFullYear()
    && (asOfDate.getUTCMonth() < 11 || asOfDate.getUTCDate() < 31),
  )
  return {
    emptyReason: allWindow?.totalCount ? null : 'No publication type data is available yet.',
    spanLabel: firstPublicationYear === lastPublicationYear ? `${firstPublicationYear}` : `${firstPublicationYear}-${lastPublicationYear}`,
    firstPublicationYear,
    lastPublicationYear,
    totalCount: allWindow?.totalCount || 0,
    allWindow,
    fiveYearWindow,
    threeYearWindow,
    oneYearWindow,
    latestYearIsPartial,
    latestPartialYearLabel: latestYearIsPartial && asOfDate
      ? `${lastPublicationYear} (through ${formatPublicationInsightFullDate(asOfDate)})`
      : null,
  }
}

function renderPublicationVolumeOverTimeTooltipContent(stats: PublicationVolumeOverTimeInsightStats) {
  const spanLabel = stats.spanLabel
    ? stats.firstPublicationYear === stats.lastPublicationYear
      ? `${stats.spanLabel}`
      : `${stats.spanLabel}`
    : 'your full publication record'
  const earlyLowYears = stats.lowYears.filter((year) => (
    stats.firstPublicationYear !== null
      ? year <= stats.firstPublicationYear + 2
      : false
  ))
  const peakAveragePosition = stats.peakYears.length
    ? stats.peakYears.reduce((sum, year) => sum + year, 0) / stats.peakYears.length
    : null
  const spanMidpoint = stats.firstPublicationYear !== null && stats.lastPublicationYear !== null
    ? (stats.firstPublicationYear + stats.lastPublicationYear) / 2
    : null
  const peakPosition = peakAveragePosition === null || spanMidpoint === null
    ? 'mixed'
    : peakAveragePosition > spanMidpoint + 0.5
      ? 'later'
      : peakAveragePosition < spanMidpoint - 0.5
        ? 'earlier'
        : 'mixed'
  const allSummary = stats.peakYears.length === 0
    ? `Across ${spanLabel}, the full record does not yet isolate a clear peak year.`
    : peakPosition === 'later' && stats.lowCount !== null && earlyLowYears.length > 0 && stats.peakCount !== null
      ? `Between ${spanLabel}, annual output rises from ${formatInt(stats.lowCount)} in the opening years to ${formatInt(stats.peakCount)} in ${formatPublicationInsightYearList(stats.peakYears)}.`
      : peakPosition === 'earlier' && stats.peakCount !== null
        ? `Between ${spanLabel}, the strongest publication years come earlier in the record, reaching ${formatInt(stats.peakCount)} in ${formatPublicationInsightYearList(stats.peakYears)}.`
        : stats.peakCount !== null
          ? `Between ${spanLabel}, the strongest years reach ${formatInt(stats.peakCount)} in ${formatPublicationInsightYearList(stats.peakYears)} rather than staying flat across the record.`
          : `Between ${spanLabel}, the strongest publication years occur in ${formatPublicationInsightYearList(stats.peakYears)}.`

  const firstFiveYearBlock = stats.fiveYearBlocks[0] ?? null
  const lastFiveYearBlock = stats.fiveYearBlocks[stats.fiveYearBlocks.length - 1] ?? null
  const firstFiveYearPeriod = formatPublicationInsightPeriodLabel(firstFiveYearBlock?.label ?? null)
  const lastFiveYearPeriod = formatPublicationInsightPeriodLabel(lastFiveYearBlock?.label ?? null)
  const fiveYearSummary = firstFiveYearBlock && lastFiveYearBlock && stats.fiveYearBlocks.length >= 2
    ? lastFiveYearBlock.count > firstFiveYearBlock.count
      ? `Across the latest rolling 5-year view, annual output rises from ${formatInt(firstFiveYearBlock.count)} in the ${firstFiveYearPeriod ?? 'earliest period'} to ${formatInt(lastFiveYearBlock.count)} in the ${lastFiveYearPeriod ?? 'latest period'}.`
      : lastFiveYearBlock.count < firstFiveYearBlock.count
        ? `Across the latest rolling 5-year view, annual output softens from ${formatInt(firstFiveYearBlock.count)} in the ${firstFiveYearPeriod ?? 'earliest period'} to ${formatInt(lastFiveYearBlock.count)} in the ${lastFiveYearPeriod ?? 'latest period'}.`
        : `Across the latest rolling 5-year view, annual output is broadly level at around ${formatInt(lastFiveYearBlock.count)} publications per year-sized period.`
    : 'The 5y view is not yet available.'

  const previousThreeYearBlock = stats.threeYearBlocks.length >= 2 ? stats.threeYearBlocks[stats.threeYearBlocks.length - 2] : null
  const latestThreeYearBlock = stats.threeYearBlocks.length >= 1 ? stats.threeYearBlocks[stats.threeYearBlocks.length - 1] : null
  const previousThreeYearPeriod = formatPublicationInsightPeriodLabel(previousThreeYearBlock?.label ?? null)
  const latestThreeYearPeriod = formatPublicationInsightPeriodLabel(latestThreeYearBlock?.label ?? null)
  const threeYearSummary = previousThreeYearBlock && latestThreeYearBlock
    ? latestThreeYearBlock.count > previousThreeYearBlock.count
      ? `Within the latest rolling 3-year view, output steps up from ${formatInt(previousThreeYearBlock.count)} in the ${previousThreeYearPeriod ?? 'earlier period'} to ${formatInt(latestThreeYearBlock.count)} in the ${latestThreeYearPeriod ?? 'latest period'}, so recent volume is still strengthening.`
      : latestThreeYearBlock.count < previousThreeYearBlock.count
        ? `Within the latest rolling 3-year view, output softens from ${formatInt(previousThreeYearBlock.count)} in the ${previousThreeYearPeriod ?? 'earlier period'} to ${formatInt(latestThreeYearBlock.count)} in the ${latestThreeYearPeriod ?? 'latest period'}, so the newest period is lighter than the recent high point.`
        : `Within the latest rolling 3-year view, output is broadly steady at ${formatInt(latestThreeYearBlock.count)} publications across its recent periods.`
    : 'The 3y view is not yet available.'

  const recentPeriodLabel = formatPublicationInsightPeriodLabel(stats.recentWindowLabel)
  const recentWindowSummary = stats.recentWindowTotal > 0
    ? stats.recentWindowActiveMonths <= 3
      ? `The latest 12-month window${recentPeriodLabel ? ` (${recentPeriodLabel})` : ''} contains only ${formatInt(stats.recentWindowTotal)} publications, concentrated into ${formatInt(stats.recentWindowActiveMonths)} active months.`
      : `The latest 12-month window${recentPeriodLabel ? ` (${recentPeriodLabel})` : ''} contains ${formatInt(stats.recentWindowTotal)} publications across ${formatInt(stats.recentWindowActiveMonths)} active months.`
    : 'The latest 12-month period contains no publications.'

  const tableSummary = stats.recentDetailCount > 0
    ? stats.recentDetailCount <= 3
      ? `Only ${formatInt(stats.recentDetailCount)} dated publication${stats.recentDetailCount === 1 ? '' : 's'} appear in that recent window${stats.recentDetailRangeLabel ? `, spanning ${stats.recentDetailRangeLabel}` : ''}.`
      : `The table lists ${formatInt(stats.recentDetailCount)} dated publications in that recent window${stats.recentDetailRangeLabel ? `, spanning ${stats.recentDetailRangeLabel}` : ''}.`
    : 'Dated-publication detail is limited for the most recent period.'

  const openingSummary = previousThreeYearBlock && latestThreeYearBlock
    ? latestThreeYearBlock.count < previousThreeYearBlock.count
      ? 'Your publication volume rose to stronger years, but the latest 3-year and 12-month windows are now lighter.'
      : latestThreeYearBlock.count > previousThreeYearBlock.count
        ? 'Your publication volume rose to stronger years and is still holding up in the latest 3-year window.'
        : 'Your publication volume rose over time and is now broadly holding in the latest windows.'
    : 'This section shows how your publication volume changes across the full record and the latest windows.'

  const recentComparisonSummary = (() => {
    if (!firstFiveYearBlock || !lastFiveYearBlock || !previousThreeYearBlock || !latestThreeYearBlock) {
      return `${fiveYearSummary} ${threeYearSummary}`.trim()
    }
    if (lastFiveYearBlock.count > firstFiveYearBlock.count && latestThreeYearBlock.count < previousThreeYearBlock.count) {
      return `The latest 5-year window still sits above your earlier baseline, but the latest 3-year window has dropped below the recent high point. ${recentWindowSummary}`
    }
    if (lastFiveYearBlock.count > firstFiveYearBlock.count && latestThreeYearBlock.count >= previousThreeYearBlock.count) {
      return `The latest 5-year and 3-year windows both remain stronger than the early part of the record. ${recentWindowSummary}`
    }
    if (lastFiveYearBlock.count < firstFiveYearBlock.count && latestThreeYearBlock.count < previousThreeYearBlock.count) {
      return `Both the latest 5-year and 3-year windows are softer than earlier periods, so the recent part of the record is lighter than the longer-run pattern. ${recentWindowSummary}`
    }
    return `${threeYearSummary} ${recentWindowSummary}`.trim()
  })()

  const tableSupportSummary = stats.recentDetailCount > 0
    ? stats.recentDetailCount <= 3
      ? `The table supports that reading because recent output really is sparse, not just unevenly timed: ${tableSummary}`
      : `The table supports that reading because recent output is spread across multiple dated publications: ${tableSummary}`
    : tableSummary

  return (
    <div className="space-y-2.5">
      <p>{openingSummary}</p>
      <ul className="ml-4 list-disc space-y-1.5">
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Overall trajectory:</span>
          {' '}
          {allSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Recent position:</span>
          {' '}
          {recentComparisonSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Recent publication detail:</span>
          {' '}
          {tableSupportSummary}
        </li>
      </ul>
    </div>
  )
}

function renderPublicationArticleTypeOverTimeTooltipContent(stats: PublicationArticleTypeOverTimeInsightStats) {
  if (stats.emptyReason || !stats.allWindow) {
    return <p>{stats.emptyReason || 'No article type data is available yet.'}</p>
  }
  const allWindow = stats.allWindow
  const fiveYearWindow = stats.fiveYearWindow
  const threeYearWindow = stats.threeYearWindow
  const oneYearWindow = stats.oneYearWindow
  const allLeaderLabel = formatPublicationInsightLabelList(allWindow.topLabels)
  const latestWindow = oneYearWindow || threeYearWindow || fiveYearWindow || allWindow
  const latestLeaderLabel = formatPublicationInsightLabelList(latestWindow?.topLabels || [])
  const sameLeaderSet = (
    left: PublicationArticleTypeWindowInsightSummary | null,
    right: PublicationArticleTypeWindowInsightSummary | null,
  ) => {
    if (!left || !right) {
      return true
    }
    if (left.topLabels.length !== right.topLabels.length) {
      return false
    }
    return left.topLabels.every((label) => right.topLabels.includes(label))
  }
  const distinctRecentWindows = [fiveYearWindow, threeYearWindow, oneYearWindow]
    .filter((summary): summary is PublicationArticleTypeWindowInsightSummary => Boolean(summary))
    .filter((summary, index, array) => (
      summary.rangeLabel !== allWindow.rangeLabel
      && array.findIndex((candidate) => candidate.rangeLabel === summary.rangeLabel) === index
    ))
  const allComparableWindowsKeepLeader = distinctRecentWindows.every((summary) => sameLeaderSet(summary, allWindow))
  const recentWindowsShiftLeader = distinctRecentWindows.some((summary) => !sameLeaderSet(summary, allWindow))
  const latestShareRounded = latestWindow?.topSharePct === null || latestWindow?.topSharePct === undefined
    ? null
    : Math.round(latestWindow.topSharePct)
  const openingSummary = (() => {
    if (!distinctRecentWindows.length) {
      return `Your article-type mix is currently led by ${allLeaderLabel}, and the publication span is still short enough that the recent windows mostly collapse into the same record.`
    }
    if (recentWindowsShiftLeader && latestLeaderLabel !== allLeaderLabel) {
      return `Your full record is led by ${allLeaderLabel}, but the latest windows tilt toward ${latestLeaderLabel}.`
    }
    if (
      allComparableWindowsKeepLeader
      && latestShareRounded !== null
      && (allWindow.topSharePct || 0) > 0
      && latestShareRounded >= Math.round((allWindow.topSharePct || 0) + 12)
    ) {
      return `Your article-type mix stays anchored in ${allLeaderLabel}, and the latest windows are even more concentrated there.`
    }
    if (
      latestWindow
      && latestWindow.distinctTypeCount > allWindow.distinctTypeCount
      && latestWindow.rangeLabel !== allWindow.rangeLabel
    ) {
      return 'Your article-type mix is broader in the latest windows than it is across the full record.'
    }
    if ((allWindow.topSharePct || 0) < 45) {
      return 'Your article-type mix stays fairly mixed across the publication span, rather than being dominated by one article type.'
    }
    return `Your article-type mix stays anchored in ${allLeaderLabel} across the full record and the recent windows.`
  })()
  const overallSummary = (() => {
    if (allWindow.topLabels.length > 1) {
      return `Across ${stats.spanLabel || 'the full record'}, the largest article types are ${allLeaderLabel}, with ${formatInt(allWindow.topCount)} publications each. The full record contains ${formatInt(allWindow.distinctTypeCount)} visible article ${pluralize(allWindow.distinctTypeCount, 'type')}.`
    }
    const shareLabel = allWindow.topSharePct === null ? '' : ` (${Math.round(allWindow.topSharePct)}%)`
    const secondarySentence = allWindow.secondLabel && allWindow.secondSharePct !== null
      ? ` The next largest type is ${allWindow.secondLabel} at ${Math.round(allWindow.secondSharePct)}%.`
      : ''
    return `Across ${stats.spanLabel || 'the full record'}, ${allLeaderLabel} is the main article type, with ${formatInt(allWindow.topCount)} of ${formatInt(allWindow.totalCount)} publications${shareLabel}.${secondarySentence}`
  })()
  const recentSummary = (() => {
    if (!distinctRecentWindows.length) {
      return 'Recent windows do not yet separate much from the full record, so this section is mainly showing the current article-type mix rather than a settled shift over time.'
    }
    const fiveLabel = fiveYearWindow?.rangeLabel ? `the latest 5-year period (${fiveYearWindow.rangeLabel})` : 'the latest 5-year period'
    const threeLabel = threeYearWindow?.rangeLabel ? `the latest 3-year period (${threeYearWindow.rangeLabel})` : 'the latest 3-year period'
    const oneLabel = oneYearWindow?.rangeLabel ? `the latest 1-year period (${oneYearWindow.rangeLabel})` : 'the latest 1-year period'
    if (
      fiveYearWindow
      && threeYearWindow
      && oneYearWindow
      && sameLeaderSet(fiveYearWindow, allWindow)
      && !sameLeaderSet(threeYearWindow, allWindow)
      && !sameLeaderSet(oneYearWindow, allWindow)
    ) {
      return `${fiveLabel} still looks like the full record, but ${threeLabel} and ${oneLabel} shift toward ${formatPublicationInsightLabelList(oneYearWindow.topLabels)}.`
    }
    if (recentWindowsShiftLeader && latestLeaderLabel !== allLeaderLabel) {
      return `${oneYearWindow ? oneLabel : 'The latest window'} moves toward ${latestLeaderLabel} rather than the full-record lead of ${allLeaderLabel}, so the recent mix is not just a smaller version of the whole portfolio.`
    }
    if (
      oneYearWindow
      && sameLeaderSet(oneYearWindow, allWindow)
      && latestShareRounded !== null
      && allWindow.topSharePct !== null
      && latestShareRounded >= Math.round(allWindow.topSharePct + 12)
    ) {
      return `The same core type still leads in ${fiveYearWindow?.rangeLabel !== allWindow.rangeLabel ? fiveLabel : 'the longer recent periods'} and ${threeYearWindow?.rangeLabel !== allWindow.rangeLabel ? threeLabel : 'the shorter recent periods'}, and it rises to ${latestShareRounded}% of publications in ${oneLabel}.`
    }
    if (
      oneYearWindow
      && oneYearWindow.distinctTypeCount < allWindow.distinctTypeCount
      && sameLeaderSet(oneYearWindow, allWindow)
    ) {
      return `${oneLabel} is narrower than the full record, with ${formatInt(oneYearWindow.distinctTypeCount)} visible article ${pluralize(oneYearWindow.distinctTypeCount, 'type')} rather than ${formatInt(allWindow.distinctTypeCount)}.`
    }
    if (
      oneYearWindow
      && oneYearWindow.distinctTypeCount > allWindow.distinctTypeCount
    ) {
      return `${oneLabel} brings more secondary types into view than the full record, so the recent mix looks broader rather than more concentrated.`
    }
    return `Across ${distinctRecentWindows.map((summary) => summary.rangeLabel).filter(Boolean).join(', ')}, the recent windows broadly preserve the same article-type centre of gravity as the full record.`
  })()
  const orderingSummary = (() => {
    if (!oneYearWindow) {
      return 'The ordering is still mainly being set by the full record because the latest 1-year view does not yet add much separate information.'
    }
    const oneLabel = oneYearWindow.rangeLabel ? `the latest 1-year period (${oneYearWindow.rangeLabel})` : 'the latest 1-year period'
    const partialYearNote = stats.latestYearIsPartial && stats.latestPartialYearLabel
      ? ` Because this latest 1-year view includes the current partial year (${stats.latestPartialYearLabel}), that newest ordering can still move.`
      : ''
    if (oneYearWindow.totalCount <= 3) {
      return `Only ${formatInt(oneYearWindow.totalCount)} publication${oneYearWindow.totalCount === 1 ? '' : 's'} sit in ${oneLabel}, so the newest ordering is still thin rather than settled.${partialYearNote}`
    }
    if (!sameLeaderSet(oneYearWindow, allWindow)) {
      return `In ${oneLabel}, ${formatPublicationInsightLabelList(oneYearWindow.topLabels)} moves ahead of the full-record lead of ${allLeaderLabel}.${partialYearNote}`
    }
    if (oneYearWindow.orderedLabels.length <= 2) {
      return `${oneLabel} has narrowed to ${formatPublicationInsightLabelList(oneYearWindow.orderedLabels)} as the only visible article ${pluralize(oneYearWindow.orderedLabels.length, 'type')}.${partialYearNote}`
    }
    return `In ${oneLabel}, ${formatPublicationInsightLabelList(oneYearWindow.topLabels)} stays first, followed by ${oneYearWindow.secondLabel || oneYearWindow.orderedLabels[1] || 'other smaller types'}.${partialYearNote}`
  })()

  return (
    <div className="space-y-2.5">
      <p>{openingSummary}</p>
      <ul className="ml-4 list-disc space-y-1.5">
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Overall mix:</span>
          {' '}
          {overallSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">How it changes:</span>
          {' '}
          {recentSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Ordering:</span>
          {' '}
          {orderingSummary}
        </li>
      </ul>
    </div>
  )
}

function renderPublicationPublicationTypeOverTimeTooltipContent(stats: PublicationPublicationTypeOverTimeInsightStats) {
  if (stats.emptyReason || !stats.allWindow) {
    return <p>{stats.emptyReason || 'No publication type data is available yet.'}</p>
  }
  const allWindow = stats.allWindow
  const fiveYearWindow = stats.fiveYearWindow
  const threeYearWindow = stats.threeYearWindow
  const oneYearWindow = stats.oneYearWindow
  const allLeaderLabel = formatPublicationInsightLabelList(allWindow.topLabels)
  const latestWindow = oneYearWindow || threeYearWindow || fiveYearWindow || allWindow
  const latestLeaderLabel = formatPublicationInsightLabelList(latestWindow?.topLabels || [])
  const sameLeaderSet = (
    left: PublicationPublicationTypeWindowInsightSummary | null,
    right: PublicationPublicationTypeWindowInsightSummary | null,
  ) => {
    if (!left || !right) {
      return true
    }
    if (left.topLabels.length !== right.topLabels.length) {
      return false
    }
    return left.topLabels.every((label) => right.topLabels.includes(label))
  }
  const distinctRecentWindows = [fiveYearWindow, threeYearWindow, oneYearWindow]
    .filter((summary): summary is PublicationPublicationTypeWindowInsightSummary => Boolean(summary))
    .filter((summary, index, array) => (
      summary.rangeLabel !== allWindow.rangeLabel
      && array.findIndex((candidate) => candidate.rangeLabel === summary.rangeLabel) === index
    ))
  const allComparableWindowsKeepLeader = distinctRecentWindows.every((summary) => sameLeaderSet(summary, allWindow))
  const recentWindowsShiftLeader = distinctRecentWindows.some((summary) => !sameLeaderSet(summary, allWindow))
  const latestShareRounded = latestWindow?.topSharePct === null || latestWindow?.topSharePct === undefined
    ? null
    : Math.round(latestWindow.topSharePct)
  const openingSummary = (() => {
    if (!distinctRecentWindows.length) {
      return `Your publication-type mix is currently led by ${allLeaderLabel}, and the publication span is still short enough that the recent windows mostly collapse into the same record.`
    }
    if (recentWindowsShiftLeader && latestLeaderLabel !== allLeaderLabel) {
      return `Your full record is led by ${allLeaderLabel}, but the latest windows tilt toward ${latestLeaderLabel}.`
    }
    if (
      allComparableWindowsKeepLeader
      && latestShareRounded !== null
      && (allWindow.topSharePct || 0) > 0
      && latestShareRounded >= Math.round((allWindow.topSharePct || 0) + 12)
    ) {
      return `Your publication-type mix stays anchored in ${allLeaderLabel}, and the latest windows are even more concentrated there.`
    }
    if (
      latestWindow
      && latestWindow.distinctTypeCount > allWindow.distinctTypeCount
      && latestWindow.rangeLabel !== allWindow.rangeLabel
    ) {
      return 'Your publication-type mix is broader in the latest windows than it is across the full record.'
    }
    if ((allWindow.topSharePct || 0) < 45) {
      return 'Your publication-type mix stays fairly mixed across the publication span, rather than being dominated by one publication type.'
    }
    return `Your publication-type mix stays anchored in ${allLeaderLabel} across the full record and the recent windows.`
  })()
  const overallSummary = (() => {
    if (allWindow.topLabels.length > 1) {
      return `Across ${stats.spanLabel || 'the full record'}, the largest publication types are ${allLeaderLabel}, with ${formatInt(allWindow.topCount)} publications each. The full record contains ${formatInt(allWindow.distinctTypeCount)} visible publication ${pluralize(allWindow.distinctTypeCount, 'type')}.`
    }
    const shareLabel = allWindow.topSharePct === null ? '' : ` (${Math.round(allWindow.topSharePct)}%)`
    const secondarySentence = allWindow.secondLabel && allWindow.secondSharePct !== null
      ? ` The next largest type is ${allWindow.secondLabel} at ${Math.round(allWindow.secondSharePct)}%.`
      : ''
    return `Across ${stats.spanLabel || 'the full record'}, ${allLeaderLabel} is the main publication type, with ${formatInt(allWindow.topCount)} of ${formatInt(allWindow.totalCount)} publications${shareLabel}.${secondarySentence}`
  })()
  const recentSummary = (() => {
    if (!distinctRecentWindows.length) {
      return 'Recent windows do not yet separate much from the full record, so this section is mainly showing the current publication-type mix rather than a settled shift over time.'
    }
    const fiveLabel = fiveYearWindow?.rangeLabel ? `the latest 5-year period (${fiveYearWindow.rangeLabel})` : 'the latest 5-year period'
    const threeLabel = threeYearWindow?.rangeLabel ? `the latest 3-year period (${threeYearWindow.rangeLabel})` : 'the latest 3-year period'
    const oneLabel = oneYearWindow?.rangeLabel ? `the latest 1-year period (${oneYearWindow.rangeLabel})` : 'the latest 1-year period'
    if (
      fiveYearWindow
      && threeYearWindow
      && oneYearWindow
      && sameLeaderSet(fiveYearWindow, allWindow)
      && !sameLeaderSet(threeYearWindow, allWindow)
      && !sameLeaderSet(oneYearWindow, allWindow)
    ) {
      return `${fiveLabel} still looks like the full record, but ${threeLabel} and ${oneLabel} shift toward ${formatPublicationInsightLabelList(oneYearWindow.topLabels)}.`
    }
    if (recentWindowsShiftLeader && latestLeaderLabel !== allLeaderLabel) {
      return `${oneYearWindow ? oneLabel : 'The latest window'} moves toward ${latestLeaderLabel} rather than the full-record lead of ${allLeaderLabel}, so the recent mix is not just a smaller version of the whole portfolio.`
    }
    if (
      oneYearWindow
      && sameLeaderSet(oneYearWindow, allWindow)
      && latestShareRounded !== null
      && allWindow.topSharePct !== null
      && latestShareRounded >= Math.round(allWindow.topSharePct + 12)
    ) {
      return `The same core type still leads in ${fiveYearWindow?.rangeLabel !== allWindow.rangeLabel ? fiveLabel : 'the longer recent periods'} and ${threeYearWindow?.rangeLabel !== allWindow.rangeLabel ? threeLabel : 'the shorter recent periods'}, and it rises to ${latestShareRounded}% of publications in ${oneLabel}.`
    }
    if (
      oneYearWindow
      && oneYearWindow.distinctTypeCount < allWindow.distinctTypeCount
      && sameLeaderSet(oneYearWindow, allWindow)
    ) {
      return `${oneLabel} is narrower than the full record, with ${formatInt(oneYearWindow.distinctTypeCount)} visible publication ${pluralize(oneYearWindow.distinctTypeCount, 'type')} rather than ${formatInt(allWindow.distinctTypeCount)}.`
    }
    if (
      oneYearWindow
      && oneYearWindow.distinctTypeCount > allWindow.distinctTypeCount
    ) {
      return `${oneLabel} brings more secondary types into view than the full record, so the recent mix looks broader rather than more concentrated.`
    }
    return `Across ${distinctRecentWindows.map((summary) => summary.rangeLabel).filter(Boolean).join(', ')}, the recent windows broadly preserve the same publication-type centre of gravity as the full record.`
  })()
  const orderingSummary = (() => {
    if (!oneYearWindow) {
      return 'The ordering is still mainly being set by the full record because the latest 1-year view does not yet add much separate information.'
    }
    const oneLabel = oneYearWindow.rangeLabel ? `the latest 1-year period (${oneYearWindow.rangeLabel})` : 'the latest 1-year period'
    const partialYearNote = stats.latestYearIsPartial && stats.latestPartialYearLabel
      ? ` Because this latest 1-year view includes the current partial year (${stats.latestPartialYearLabel}), that newest ordering can still move.`
      : ''
    if (oneYearWindow.totalCount <= 3) {
      return `Only ${formatInt(oneYearWindow.totalCount)} publication${oneYearWindow.totalCount === 1 ? '' : 's'} sit in ${oneLabel}, so the newest ordering is still thin rather than settled.${partialYearNote}`
    }
    if (!sameLeaderSet(oneYearWindow, allWindow)) {
      return `In ${oneLabel}, ${formatPublicationInsightLabelList(oneYearWindow.topLabels)} moves ahead of the full-record lead of ${allLeaderLabel}.${partialYearNote}`
    }
    if (oneYearWindow.orderedLabels.length <= 2) {
      return `${oneLabel} has narrowed to ${formatPublicationInsightLabelList(oneYearWindow.orderedLabels)} as the only visible publication ${pluralize(oneYearWindow.orderedLabels.length, 'type')}.${partialYearNote}`
    }
    return `In ${oneLabel}, ${formatPublicationInsightLabelList(oneYearWindow.topLabels)} stays first, followed by ${oneYearWindow.secondLabel || oneYearWindow.orderedLabels[1] || 'other smaller types'}.${partialYearNote}`
  })()

  return (
    <div className="space-y-2.5">
      <p>{openingSummary}</p>
      <ul className="ml-4 list-disc space-y-1.5">
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Overall mix:</span>
          {' '}
          {overallSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">How it changes:</span>
          {' '}
          {recentSummary}
        </li>
        <li>
          <span className="font-semibold text-[hsl(var(--tone-neutral-900))]">Ordering:</span>
          {' '}
          {orderingSummary}
        </li>
      </ul>
    </div>
  )
}

function PublicationProductionPhaseSummary({
  stats,
}: {
  stats: PublicationProductionPhaseStats
}) {
  const tone = resolvePublicationProductionPhaseTone(stats.phase)
  const slopeLabel = stats.slope === null
    ? '\u2014'
    : `${stats.slope >= 0 ? '+' : ''}${stats.slope.toFixed(1)} papers/year`
  const recentShareLabel = stats.recentShare === null
    ? '\u2014'
    : `${Math.round(stats.recentShare * 100)}%`
  const peakYearLabel = stats.peakYear === null
    ? '\u2014'
    : stats.peakCount === null
      ? `${stats.peakYear}`
      : `${formatInt(stats.peakCount)} (${stats.peakYear})`
  const showSummaryTiles = !stats.emptyReason && !stats.insufficientHistory

  return (
    <div className="house-drilldown-stack-2">
      <div className="flex justify-center">
        <p
          className={cn(
            HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS,
            'text-center',
          )}
        >
          {stats.phaseLabel}
        </p>
      </div>

      {stats.confidenceNote ? (
        <p className={cn(HOUSE_DRILLDOWN_NOTE_SOFT_CLASS, HOUSE_DRILLDOWN_NOTE_WARNING_CLASS, 'text-left')}>
          {stats.confidenceNote}
        </p>
      ) : null}

      {stats.emptyReason ? (
        <p className="house-publications-drilldown-empty-state">
          {stats.emptyReason}
        </p>
      ) : null}

      {stats.insufficientHistory && !stats.emptyReason ? (
        <p className="house-publications-drilldown-empty-state">
          At least two complete publication years are needed to estimate a production phase.
        </p>
      ) : null}

      {showSummaryTiles ? (
        <>
          <div className="grid gap-2 lg:grid-cols-3">
            <div className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS, 'min-h-0 items-start gap-2 px-4 py-3 text-left')}>
              <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Trend slope</p>
              <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{slopeLabel}</p>
            </div>
            <div className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS, 'min-h-0 items-start gap-2 px-4 py-3 text-left')}>
              <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Recent share of output</p>
              <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{recentShareLabel}</p>
            </div>
            <div className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS, 'min-h-0 items-start gap-2 px-4 py-3 text-left')}>
              <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Peak year</p>
              <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{peakYearLabel}</p>
            </div>
          </div>

          <div className="pt-1">
            <PublicationProductionPhaseChart
              years={stats.years}
              values={stats.series}
              tone={tone}
            />
          </div>
        </>
      ) : null}

      {stats.insufficientHistory && !stats.emptyReason && stats.series.length > 0 ? (
        <div className="pt-1">
          <PublicationProductionPhaseChart
            years={stats.years}
            values={stats.series}
            tone={tone}
          />
        </div>
      ) : null}
    </div>
  )
}

function getTrajectoryGrowthTileTintStyle(value: number): CSSProperties | undefined {
  if (value > 0.2) {
    return { backgroundColor: 'hsl(var(--tone-positive-100) / 0.9)' }
  }
  if (value < -0.2) {
    return { backgroundColor: 'hsl(var(--tone-danger-100) / 0.82)' }
  }
  return undefined
}

function getTrajectoryVolatilityTileTintStyle(value: number): CSSProperties | undefined {
  if (value <= 0.35) {
    return { backgroundColor: 'hsl(var(--tone-positive-100) / 0.9)' }
  }
  if (value > 0.75) {
    return { backgroundColor: 'hsl(var(--tone-warning-100) / 0.9)' }
  }
  return undefined
}

function renderMomentumStateBanner(state: string): ReactNode {
  const normalized = String(state || '').trim()
  let toneClass: string = HOUSE_SURFACE_BANNER_INFO_CLASS
  if (normalized === 'Accelerating') {
    toneClass = HOUSE_SURFACE_BANNER_SUCCESS_CLASS
  } else if (normalized === 'Slowing') {
    toneClass = HOUSE_SURFACE_BANNER_WARNING_CLASS
  } else if (normalized && normalized !== 'Stable') {
    toneClass = HOUSE_SURFACE_BANNER_DANGER_CLASS
  }
  return (
    <span className={cn(HOUSE_SURFACE_BANNER_CLASS, toneClass, 'inline-flex items-center justify-center px-3 py-1.5 text-sm leading-none')}>
      {normalized || 'Stable'}
    </span>
  )
}

function formatHIndexContextTooltip(stats: HIndexDrilldownStats): string {
  const careerSpanText = stats.yearsSinceFirstCitedPaper === null
    ? 'the observed citation-active span'
    : `${formatInt(stats.yearsSinceFirstCitedPaper)} citation-active years`
  return `Companion indices contextualise scale, pace, and depth around the h-index. m-index normalises h across ${careerSpanText}, g-index captures citation depth beyond the h-core, and i10-index counts papers with at least ten citations.`
}

function formatHIndexCorePerformanceTooltip(stats: HIndexDrilldownStats): string {
  const careerSpanText = stats.yearsSinceFirstCitedPaper === null
    ? 'citation-active span unavailable'
    : `${formatInt(stats.yearsSinceFirstCitedPaper)} citation-active years`
  return `This panel combines the main context values behind the current h-core. h-core citation density is ${stats.hCoreCitationDensityValue}, h-core share of citations is ${stats.hCoreShareValue}, and the observed citation-active span is ${careerSpanText}. Read them together: higher density and share suggest a compact strong core, while longer span with lower density usually points to broader but more gradual accumulation.`
}

function formatMomentumOverviewTooltip(stats: MomentumDrilldownStats): string {
  return `Momentum is currently ${stats.state.toLowerCase()} at index ${formatInt(stats.momentumIndex)}. This chart compares recent citation pace against the immediately preceding baseline window, so it is a recency signal rather than a lifetime scale measure.`
}

function formatMomentumContributorsTooltip(stats: MomentumDrilldownStats): string {
  return stats.topContributors.length
    ? `This table highlights the papers that best explain the momentum shift, using each paper's change from the prior baseline window to the recent window.`
    : 'No paper-level momentum contributors are currently available.'
}

function formatMomentumTrajectoryTooltip(stats: MomentumDrilldownStats): string {
  return `This table shows the operational inputs feeding the current momentum state, including ${formatInt(stats.monthlyValues12m.length)} monthly points and ${formatInt(stats.weightedMonthlyValues12m.length)} weighted points. It explains how the current score is being produced rather than showing a lifetime citation curve.`
}

function formatMomentumContextTooltip(stats: MomentumDrilldownStats): string {
  return `Momentum currently tracks ${formatInt(stats.trackedPapers)} papers with usable citation history. Confidence buckets show the mix of match or enrichment quality behind that signal, so this section is mainly about how much weight to place on the headline.`
}

function formatSignedPercentCompact(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const normalized = Math.abs(rounded) < 1 ? 0 : rounded
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(0)}%`
}

function formatDrilldownValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '\u2014'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '\u2014'
    }
    return Number.isInteger(value) ? formatInt(value) : value.toFixed(2)
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  const text = String(value).trim()
  return text || '\u2014'
}

void formatDrilldownValue

type ChartAxisLayoutOptions = {
  axisLabels: Array<string | null | undefined>
  axisSubLabels?: Array<string | null | undefined>
  showXAxisName?: boolean
  xAxisName?: string | null
  dense?: boolean
  maxLabelLines?: number
  maxSubLabelLines?: number
  maxAxisNameLines?: number
}

type ChartAxisLayout = {
  framePaddingBottomRem: number
  plotBottomRem: number
  axisBottomRem: number
  axisMinHeightRem: number
  xAxisNameBottomRem: number
  xAxisNameMinHeightRem: number
}

function mergeChartAxisLayouts(layouts: ChartAxisLayout[]): ChartAxisLayout {
  if (!layouts.length) {
    return buildChartAxisLayout({ axisLabels: [] })
  }
  return layouts.reduce((acc, layout) => ({
    framePaddingBottomRem: Math.max(acc.framePaddingBottomRem, layout.framePaddingBottomRem),
    plotBottomRem: Math.max(acc.plotBottomRem, layout.plotBottomRem),
    axisBottomRem: Math.max(acc.axisBottomRem, layout.axisBottomRem),
    axisMinHeightRem: Math.max(acc.axisMinHeightRem, layout.axisMinHeightRem),
    xAxisNameBottomRem: Math.max(acc.xAxisNameBottomRem, layout.xAxisNameBottomRem),
    xAxisNameMinHeightRem: Math.max(acc.xAxisNameMinHeightRem, layout.xAxisNameMinHeightRem),
  }))
}

function estimateAxisLabelLines(label: string, maxCharsPerLine: number, maxLines: number): number {
  if (maxLines <= 1) {
    return 1
  }
  const segments = String(label || '')
    .split(/\r?\n/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
  if (!segments.length || !segments.some((segment) => segment.length > 0)) {
    return 1
  }
  if (maxCharsPerLine <= 1) {
    const chars = segments.reduce((total, segment) => total + Math.max(1, segment.length), 0)
    return Math.max(1, Math.min(maxLines, chars))
  }
  let totalLines = 0
  for (const segment of segments) {
    if (!segment) {
      totalLines += 1
      continue
    }
    const words = segment.split(' ')
    let lines = 1
    let lineChars = 0
    for (const word of words) {
      const tokenLength = Math.max(1, word.length)
      if (lineChars === 0) {
        if (tokenLength <= maxCharsPerLine) {
          lineChars = tokenLength
          continue
        }
        lines += Math.max(0, Math.ceil(tokenLength / maxCharsPerLine) - 1)
        lineChars = tokenLength % maxCharsPerLine || maxCharsPerLine
        continue
      }
      if (lineChars + 1 + tokenLength <= maxCharsPerLine) {
        lineChars += 1 + tokenLength
        continue
      }
      lines += 1
      if (tokenLength <= maxCharsPerLine) {
        lineChars = tokenLength
        continue
      }
      lines += Math.max(0, Math.ceil(tokenLength / maxCharsPerLine) - 1)
      lineChars = tokenLength % maxCharsPerLine || maxCharsPerLine
    }
    totalLines += lines
    if (totalLines >= maxLines) {
      return maxLines
    }
  }
  return Math.max(1, Math.min(maxLines, totalLines))
}

function buildChartAxisLayout({
  axisLabels,
  axisSubLabels = [],
  showXAxisName = false,
  xAxisName = null,
  dense = false,
  maxLabelLines = 3,
  maxSubLabelLines = 2,
  maxAxisNameLines = 2,
}: ChartAxisLayoutOptions): ChartAxisLayout {
  const normalizedLabels = axisLabels
    .map((label) => String(label || '').trim())
    .filter((label) => label.length > 0)
  const normalizedSubLabels = axisSubLabels
    .map((label) => String(label || '').trim())
    .filter((label) => label.length > 0)
  const barCount = Math.max(1, normalizedLabels.length)
  const charsPerLine = dense
    ? barCount >= 10
      ? 3
      : barCount >= 8
        ? 4
        : barCount >= 6
          ? 5
          : 6
    : barCount >= 10
      ? 4
      : barCount >= 8
        ? 5
        : barCount >= 6
          ? 6
          : barCount >= 4
            ? 8
            : 12
  const labelLineCount = Math.max(
    1,
    ...(normalizedLabels.length
      ? normalizedLabels.map((label) => estimateAxisLabelLines(label, charsPerLine, maxLabelLines))
      : [1]),
  )
  const subLabelCharsPerLine = Math.max(3, charsPerLine + 1)
  const subLabelLineCount = Math.max(
    0,
    ...(normalizedSubLabels.length
      ? normalizedSubLabels.map((label) => estimateAxisLabelLines(label, subLabelCharsPerLine, maxSubLabelLines))
      : [0]),
  )
  const axisNameCharsPerLine = dense
    ? 26
    : 34
  const normalizedXAxisName = String(xAxisName || '').trim()
  const hasXAxisName = showXAxisName && normalizedXAxisName.length > 0
  const axisNameLineCount = hasXAxisName
    ? estimateAxisLabelLines(normalizedXAxisName, axisNameCharsPerLine, maxAxisNameLines)
    : 0
  const axisLineHeightRem = 0.82
  const subAxisLineHeightRem = 0.78
  const axisMinHeightRem = (labelLineCount * axisLineHeightRem) + (subLabelLineCount * subAxisLineHeightRem) + 0.28
  const xAxisNameHeightRem = hasXAxisName
    ? (axisNameLineCount * subAxisLineHeightRem) + 0.24
    : 0
  const xAxisNameBottomRem = hasXAxisName ? 0.24 : 0
  const axisTitleGapRem = subLabelLineCount > 0 ? 0.38 : 0.2
  const plotToAxisGapRem = subLabelLineCount > 0 ? 0.36 : 0.28
  const axisBottomRem = hasXAxisName ? xAxisNameBottomRem + xAxisNameHeightRem + axisTitleGapRem : 0.3
  const plotBottomRem = axisBottomRem + axisMinHeightRem + plotToAxisGapRem
  const framePaddingBottomRem = plotBottomRem + 0.45
  return {
    framePaddingBottomRem,
    plotBottomRem,
    axisBottomRem,
    axisMinHeightRem,
    xAxisNameBottomRem,
    xAxisNameMinHeightRem: xAxisNameHeightRem,
  }
}

function buildYAxisPanelWidthRem(ticks: number[], showAxisName: boolean, extraTickChars = 0): number {
  const maxTickChars = Math.max(
    1,
    ...ticks.map((tick) => formatInt(Math.max(0, Math.round(Number.isFinite(tick) ? tick : 0))).length),
  ) + Math.max(0, Math.round(extraTickChars))
  // Add extra gutter spacing once tick labels reach 3+ digits so title/ticks do not crowd.
  const hasLargeTicks = maxTickChars >= 3
  const tickColumnWidthRem = 1.3 + (maxTickChars * 0.28) + (hasLargeTicks ? 0.24 : 0)
  const axisNameAllowanceRem = showAxisName ? (hasLargeTicks ? 1.02 : 0.68) : 0
  const preferredWidthRem = tickColumnWidthRem + axisNameAllowanceRem
  const minWidthRem = showAxisName ? (hasLargeTicks ? 3.65 : 3.1) : 2.65
  const maxWidthRem = showAxisName ? (hasLargeTicks ? 4.7 : 3.95) : 3.3
  return Math.min(maxWidthRem, Math.max(minWidthRem, preferredWidthRem))
}

type MomentumBreakdown = {
  bars: Array<{ label: string; value: number }>
  baselineWindowLabel: string | null
  recentWindowLabel: string | null
  recent3Total: number | null
  baseline9Total: number | null
  rate3m: number | null
  rate9m: number | null
  liftPct: number | null
  insufficientBaseline: boolean
}

type MomentumYearBreakdown = {
  bars: Array<{ label: string; value: number }>
  priorYearsLabel: string | null
  recentYearLabel: string | null
  recent1Total: number | null
  baseline4Total: number | null
  rate1y: number | null
  rate4y: number | null
  liftPct: number | null
  insufficientBaseline: boolean
}

type MomentumWindowMode = '12m' | '5y'
type PublicationsWindowMode = '1y' | '3y' | '5y' | 'all'
type RecentConcentrationWindowMode = PublicationsWindowMode
type PublicationTrendsVisualMode = 'bars' | 'line' | 'table'
type CitationActivationHistorySeriesMode = 'default' | 'activeInactive'
type CitationMomentumViewMode = 'sleeping' | 'freshPickup'
type CitationActivationTableMode = 'newlyActive' | 'stillActive' | 'inactive'
type PublicationCategoryValueMode = 'absolute' | 'percentage' | 'perPaper'
type PublicationCategoryDisplayMode = 'chart' | 'table'
type JournalBreakdownViewMode = 'top-ten' | 'all-journals'
type TopicBreakdownViewMode = 'top-ten' | 'all-topics'
type HIndexViewMode = 'trajectory' | 'needed'
type HIndexSummaryThresholdTableMode = 'next' | 'after'
type HIndexInsightKey =
  | 'summary-threshold-steps'
  | 'summary-threshold-candidates'
  | 'breakdown-structure-table'
  | 'breakdown-authorship-table'
  | 'breakdown-publication-type-table'
  | 'trajectory-chart'
  | 'trajectory-milestones'
  | 'context-complementary-indices'
  | 'context-index-reference'
  | 'context-h-core-performance'
type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99
type DrilldownTab = 'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'
type PublicationProductionYearScopeMode = 'complete' | 'include_current'

type SplitBreakdownViewMode = 'bar' | 'table'

const DRILLDOWN_TABS: Array<{ value: DrilldownTab; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'trajectory', label: 'Trajectory' },
  { value: 'context', label: 'Context' },
  { value: 'methods', label: 'Methods' },
]

const PUBLICATIONS_WINDOW_OPTIONS: Array<{ value: PublicationsWindowMode; label: string }> = [
  { value: '1y', label: '1y' },
  { value: '3y', label: '3y' },
  { value: '5y', label: '5y' },
  { value: 'all', label: 'All' },
]
const RECENT_CONCENTRATION_WINDOW_OPTIONS: Array<{ value: RecentConcentrationWindowMode; label: string }> = [
  { value: '1y', label: '1y' },
  { value: '3y', label: '3y' },
  { value: '5y', label: '5y' },
  { value: 'all', label: 'All' },
]
const PUBLICATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'percentage', label: '%' },
  { value: 'absolute', label: 'Absolute' },
]
const PUBLICATION_CITATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage', label: '%' },
  { value: 'perPaper', label: 'Per item' },
]
const PUBLICATION_INSIGHTS_TITLE = 'Publication insights'
const PUBLICATION_INSIGHTS_LABEL = 'publication insights'
const HOUSE_HEADING_H2_CLASS = publicationsHouseHeadings.h2
const HOUSE_METRIC_SUBTITLE_CLASS = publicationsHouseHeadings.metricSubtitle
const HOUSE_METRIC_DETAIL_CLASS = publicationsHouseHeadings.metricDetail
const HOUSE_METRIC_NARRATIVE_CLASS = publicationsHouseHeadings.metricNarrative
const HOUSE_TILE_SUBTITLE_CLASS = cn('house-metric-subtitle-row', HOUSE_METRIC_SUBTITLE_CLASS)
const HOUSE_TILE_DETAIL_CLASS = cn('mt-0.5 min-h-[2.4rem]', HOUSE_METRIC_DETAIL_CLASS)
const HOUSE_METRIC_RIGHT_CHART_TITLE_CLASS = 'house-metric-right-chart-title'
const HOUSE_METRIC_RIGHT_CHART_HEADER_CLASS = 'house-metric-right-chart-header'
const HOUSE_METRIC_RIGHT_CHART_PANEL_CLASS = 'house-metric-right-chart-panel'
const HOUSE_METRIC_RIGHT_CHART_PANEL_TOGGLE_CLASS = 'house-metric-right-chart-panel-toggle'
const HOUSE_METRIC_RIGHT_CHART_BODY_CLASS = 'house-metric-right-chart-body'
const HOUSE_METRIC_TILE_PILL_CONTAINER_CLASS = 'house-metric-tile-pill-container'
const HOUSE_METRIC_TILE_PILL_CONTAINER_BOTTOM_CLASS = 'house-metric-tile-pill-container-bottom'
const HOUSE_METRIC_TILE_PILL_CONTAINER_BOTTOM_CENTER_CLASS = 'house-metric-tile-pill-container-bottom-center'
const HOUSE_METRIC_TILE_PILL_CLASS = 'house-metric-tile-pill'
const HOUSE_HEADING_LABEL_CLASS = publicationsHouseHeadings.label
const HOUSE_CHART_TRANSITION_CLASS = publicationsHouseMotion.chartPanel
const HOUSE_CHART_SERIES_BY_SLOT_CLASS = publicationsHouseMotion.chartSeriesBySlot
const HOUSE_CHART_ENTERED_CLASS = publicationsHouseMotion.chartEnter
const HOUSE_CHART_RING_ENTERED_CLASS = publicationsHouseMotion.ringChartEnter
const HOUSE_CHART_SCALE_LAYER_CLASS = publicationsHouseMotion.chartScaleLayer
const HOUSE_CHART_SCALE_TICK_CLASS = publicationsHouseMotion.chartScaleTick
const HOUSE_CHART_SCALE_AXIS_TITLE_CLASS = publicationsHouseMotion.chartScaleAxisTitle
const HOUSE_TOGGLE_TRACK_CLASS = publicationsHouseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = publicationsHouseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = publicationsHouseMotion.toggleButton
const HOUSE_TOGGLE_CHART_BAR_CLASS = publicationsHouseMotion.toggleChartBar
const HOUSE_TOGGLE_CHART_MORPH_CLASS = publicationsHouseMotion.toggleChartMorph
const HOUSE_TOGGLE_CHART_SWAP_CLASS = publicationsHouseMotion.toggleChartSwap
const HOUSE_TOGGLE_CHART_LABEL_CLASS = publicationsHouseMotion.toggleChartLabel
const HOUSE_TOGGLE_CHART_LINE_CLASS = publicationsHouseMotion.toggleChartLine
const HOUSE_SURFACE_SECTION_PANEL_CLASS = publicationsHouseSurfaces.sectionPanel
const HOUSE_SURFACE_STRONG_PANEL_CLASS = publicationsHouseSurfaces.strongPanel
const HOUSE_SURFACE_PANEL_BARE_CLASS = publicationsHouseSurfaces.panelBare
const HOUSE_SURFACE_TABLE_SHELL_CLASS = publicationsHouseSurfaces.tableShell
const HOUSE_SURFACE_TABLE_HEAD_CLASS = publicationsHouseSurfaces.tableHead
const HOUSE_SURFACE_TABLE_ROW_CLASS = publicationsHouseSurfaces.tableRow
const HOUSE_SURFACE_BANNER_CLASS = publicationsHouseSurfaces.banner
const HOUSE_SURFACE_BANNER_INFO_CLASS = publicationsHouseSurfaces.bannerInfo
const HOUSE_SURFACE_BANNER_SUCCESS_CLASS = publicationsHouseSurfaces.bannerSuccess
const HOUSE_SURFACE_BANNER_WARNING_CLASS = publicationsHouseSurfaces.bannerWarning
const HOUSE_SURFACE_BANNER_DANGER_CLASS = publicationsHouseSurfaces.bannerDanger
const HOUSE_SURFACE_METRIC_PILL_CLASS = publicationsHouseSurfaces.metricPill
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_CLASS = publicationsHouseSurfaces.metricPillPublications
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_REGULAR_CLASS = publicationsHouseSurfaces.metricPillPublicationsRegular
const HOUSE_DIVIDER_BORDER_SOFT_CLASS = publicationsHouseDividers.borderSoft
const HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS = publicationsHouseActions.sectionToolButton
const HOUSE_DRILLDOWN_PLACEHOLDER_CLASS = publicationsHouseDrilldown.placeholder
const HOUSE_DRILLDOWN_ALERT_CLASS = publicationsHouseDrilldown.alert
const HOUSE_DRILLDOWN_HINT_CLASS = publicationsHouseDrilldown.hint
const HOUSE_DRILLDOWN_ROW_CLASS = publicationsHouseDrilldown.row
const HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS = publicationsHouseDrilldown.progressTrack
const HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS = publicationsHouseDrilldown.progressFill
const HOUSE_DRILLDOWN_BADGE_CLASS = publicationsHouseDrilldown.badge
const HOUSE_DRILLDOWN_BADGE_ACCENT_CLASS = publicationsHouseDrilldown.badgeAccent
const HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS = publicationsHouseDrilldown.badgePositive
const HOUSE_DRILLDOWN_BADGE_WARNING_CLASS = publicationsHouseDrilldown.badgeWarning
const HOUSE_DRILLDOWN_BADGE_DANGER_CLASS = publicationsHouseDrilldown.badgeDanger
const HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS = publicationsHouseDrilldown.badgeNeutral
const HOUSE_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_DRILLDOWN_STAT_VALUE_CLASS = publicationsHouseDrilldown.statValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS = publicationsHouseDrilldown.summaryStatValueEmphasis
const HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS = publicationsHouseDrilldown.summaryStatCard
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS = 'house-drilldown-summary-stat-card-small'
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_DRILLDOWN_OVERLINE_CLASS = publicationsHouseDrilldown.overline
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = publicationsHouseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_NOTE_CLASS = publicationsHouseDrilldown.note
const HOUSE_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_DRILLDOWN_NOTE_WARNING_CLASS = publicationsHouseDrilldown.noteWarning
const HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS = publicationsHouseDrilldown.chartMainSvg
const HOUSE_DRILLDOWN_CHART_TOOLTIP_CLASS = publicationsHouseDrilldown.chartTooltip
const HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS = publicationsHouseDrilldown.skeletonBlock
const HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS = publicationsHouseDrilldown.tableEmpty
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = publicationsHouseDrilldown.toggleButtonMuted
const HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS = publicationsHouseDrilldown.summaryStatsGrid
const HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS = publicationsHouseDrilldown.chartControlsRow
const HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS = publicationsHouseDrilldown.chartControlsLeft
const HOUSE_DRILLDOWN_CHART_META_CLASS = publicationsHouseDrilldown.chartMeta
const HOUSE_CHART_BAR_ACCENT_CLASS = publicationsHouseCharts.barAccent
const HOUSE_CHART_BAR_POSITIVE_CLASS = publicationsHouseCharts.barPositive
const HOUSE_CHART_BAR_WARNING_CLASS = publicationsHouseCharts.barWarning
const HOUSE_CHART_BAR_NEUTRAL_CLASS = publicationsHouseCharts.barNeutral
const HOUSE_CHART_BAR_DANGER_CLASS = 'bg-[hsl(var(--tone-danger-500))]'
const HOUSE_CHART_BAR_CURRENT_CLASS = publicationsHouseCharts.barCurrent
const HOUSE_CHART_GRID_LINE_CLASS = publicationsHouseCharts.gridLine
const HOUSE_CHART_GRID_DASHED_CLASS = publicationsHouseCharts.gridDashed
const HOUSE_CHART_GRID_LINE_SUBTLE_CLASS = publicationsHouseCharts.gridLineSubtle
const HOUSE_CHART_MEAN_LINE_CLASS = publicationsHouseCharts.meanLine
const HOUSE_CHART_AXIS_TEXT_CLASS = publicationsHouseCharts.axisText
const HOUSE_CHART_AXIS_TEXT_TREND_CLASS = publicationsHouseCharts.axisTextTrend
const HOUSE_CHART_AXIS_TITLE_CLASS = publicationsHouseCharts.axisTitle
const HOUSE_CHART_AXIS_SUBTEXT_CLASS = publicationsHouseCharts.axisSubtext
const HOUSE_CHART_AXIS_PERIOD_TAG_CLASS = publicationsHouseCharts.axisPeriodTag
const HOUSE_CHART_LINE_SOFT_SVG_CLASS = publicationsHouseCharts.lineSoftSvg
const HOUSE_CHART_RING_TRACK_SVG_CLASS = publicationsHouseCharts.ringTrackSvg
const HOUSE_CHART_RING_MAIN_SVG_CLASS = publicationsHouseCharts.ringMainSvg
const HOUSE_CHART_RING_REMAINDER_SVG_CLASS = publicationsHouseCharts.ringRemainderSvg
const HOUSE_CHART_RING_THRESHOLD_50_SVG_CLASS = publicationsHouseCharts.ringThreshold50Svg
const HOUSE_CHART_RING_THRESHOLD_75_SVG_CLASS = publicationsHouseCharts.ringThreshold75Svg
const HOUSE_CHART_RING_THRESHOLD_90_SVG_CLASS = publicationsHouseCharts.ringThreshold90Svg
const HOUSE_CHART_RING_THRESHOLD_95_SVG_CLASS = publicationsHouseCharts.ringThreshold95Svg
const HOUSE_CHART_RING_THRESHOLD_99_SVG_CLASS = publicationsHouseCharts.ringThreshold99Svg
const HOUSE_CHART_RING_TOGGLE_VISUAL_CLASS = publicationsHouseCharts.ringToggleVisual
const HOUSE_CHART_RING_CENTER_LABEL_CLASS = publicationsHouseCharts.ringCenterLabel
const HOUSE_CHART_RING_PANEL_CLASS = publicationsHouseCharts.ringPanel
const HOUSE_CHART_RING_SIZE_CLASS = publicationsHouseCharts.ringSize
const HOUSE_CHART_MINI_DONUT_CLASS = publicationsHouseCharts.miniDonut
void HOUSE_DRILLDOWN_PLACEHOLDER_CLASS
void HOUSE_DRILLDOWN_HINT_CLASS
void HOUSE_DRILLDOWN_ROW_CLASS
void HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS
void HOUSE_DRILLDOWN_SECTION_LABEL_CLASS
void HOUSE_DRILLDOWN_NOTE_CLASS
void HOUSE_DRILLDOWN_NOTE_SOFT_CLASS
const HOUSE_METRIC_PROGRESS_PANEL_CLASS =
  cn(
    HOUSE_SURFACE_STRONG_PANEL_CLASS,
    'house-metric-tile-chart-surface flex flex-1 flex-col gap-2.5 px-2 py-2 min-w-0 transition-[opacity,transform,filter] duration-[var(--motion-duration-chart-toggle)] ease-out',
  )
const HOUSE_LINE_CHART_SURFACE_CLASS =
  cn(HOUSE_SURFACE_STRONG_PANEL_CLASS, 'relative flex-1 px-1.5 pb-1.5 pt-2')
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_SLOT_CLASS = 'pointer-events-none flex h-full items-stretch justify-center'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_CLASS = 'grid w-full min-h-0 items-stretch'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_COLUMNS_CLASS = 'grid-cols-[2.5rem_minmax(0,1fr)]'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_GAP_CLASS = 'gap-2'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_PANEL_CLASS = 'h-full min-h-0 min-w-0 w-full'
const HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH = 14

/**
 * Chart Animation Token System - Semantic Motion Timing
 * 
 * This system provides context-aware animation durations and staggers for chart elements.
 * Values mirror CSS custom properties in index.css for consistency across the application.
 * 
 * Key Principles:
 * 1. Animation CONTEXT matters more than duration numbers
 * 2. Entry animations are theatrical (slow, staggered)
 * 3. Toggle animations are responsive (fast, immediate)
 * 4. Morph animations are graceful (medium, minimal stagger)
 * 5. Axis animations coordinate with data (overlap by ~100ms)
 * 
 * Usage Examples:
 * ```ts
 * // Bar charts
 * const duration = getChartAnimationDuration('entry', 'bar')  // 560ms
 * const stagger = getChartStaggerDelay(index, 'entry')        // 0-390ms
 * 
 * // Ring charts
 * const ringDuration = ringChartDurationVar(isEntryCycle)     // '560ms' or '540ms'
 * 
 * // Axis updates
 * const axisDuration = getAxisAnimationDuration('toggle')     // 540ms
 * ```
 * 
 * Animation Flow:
 * - Entry:   delay(140ms) → stagger each bar(65ms) → max stagger(390ms)
 * - Toggle:  immediate(0ms) → all at once(0ms stagger)
 * - Morph:   minimal stagger(25ms) → graceful transition
 */
type ChartAnimationContext = 'entry' | 'toggle' | 'morph' | 'refresh'
type ChartType = 'bar' | 'ring' | 'line'

const CHART_MOTION = {
  entry: {
    duration: 560,      // --motion-chart-entry-duration
    delay: 140,         // --motion-chart-entry-delay
    stagger: 65,        // --motion-chart-entry-stagger
    staggerMax: 390,    // --motion-chart-entry-stagger-max
  },
  toggle: {
    duration: 540,      // --motion-chart-toggle-duration
    delay: 0,           // --motion-chart-toggle-delay
    stagger: 0,         // --motion-chart-toggle-stagger
  },
  morph: {
    duration: 440,      // --motion-chart-morph-duration
    stagger: 25,        // --motion-chart-morph-stagger
  },
  axis: {
    entry: 560,         // --motion-chart-axis-entry
    toggle: 540,        // --motion-chart-axis-toggle
    overlap: 100,       // --motion-chart-axis-overlap
  },
  refresh: {
    duration: 420,      // --motion-chart-refresh-duration
  },
  ring: {
    entry: 560,         // --motion-chart-ring-entry
    toggle: 540,        // --motion-chart-ring-toggle
  },
  line: {
    entry: 560,         // --motion-chart-line-entry
    toggle: 540,        // --motion-chart-line-toggle
  },
} as const

const PUBLICATIONS_CHART_TOP_INSET_REM = 0.625
const PUBLICATIONS_CHART_RIGHT_INSET_REM = 0.5
const PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM = 0.25
const PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM = 0.55
const PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM = 0.4
const PUBLICATIONS_CHART_TOOLTIP_OFFSET_REM = 0.35
const PUBLICATIONS_CHART_SLOT_GAP_PCT_DENSE = 1.1
const PUBLICATIONS_CHART_SLOT_GAP_PCT_MEDIUM = 1.5
const PUBLICATIONS_CHART_SLOT_GAP_PCT_DEFAULT = 2
const PUBLICATIONS_CHART_SLOT_MIN_WIDTH_PCT = 2
const FIELD_PERCENTILE_RING_CLASS_BY_THRESHOLD: Record<FieldPercentileThreshold, string> = {
  50: HOUSE_CHART_RING_THRESHOLD_50_SVG_CLASS,
  75: HOUSE_CHART_RING_THRESHOLD_75_SVG_CLASS,
  90: HOUSE_CHART_RING_THRESHOLD_90_SVG_CLASS,
  95: HOUSE_CHART_RING_THRESHOLD_95_SVG_CLASS,
  99: HOUSE_CHART_RING_THRESHOLD_99_SVG_CLASS,
}
const FIELD_PERCENTILE_EMPHASIS_TONE_VAR_BY_THRESHOLD: Record<FieldPercentileThreshold, string> = {
  50: '--tone-accent-500',
  75: '--tone-accent-500',
  90: '--tone-accent-600',
  95: '--tone-accent-700',
  99: '--tone-accent-800',
}
const HOUSE_DRILLDOWN_TOOLTIP_CLASS =
  cn(
    HOUSE_DRILLDOWN_CHART_TOOLTIP_CLASS,
    'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-[opacity,transform] duration-[var(--motion-micro)] ease-out',
  )
const MAX_PUBLICATION_CHART_BARS = 12
const HOUSE_METRIC_TOGGLE_TRACK_CLASS = HOUSE_TOGGLE_TRACK_CLASS

// Chart Animation Helpers - Semantic timing by context
function getChartAnimationDuration(context: ChartAnimationContext, chartType: ChartType = 'bar'): number {
  if (chartType === 'ring') {
    return context === 'entry' ? CHART_MOTION.ring.entry : CHART_MOTION.ring.toggle
  }
  if (chartType === 'line') {
    return context === 'entry' ? CHART_MOTION.line.entry : CHART_MOTION.line.toggle
  }
  // Bar charts
  if (context === 'entry') return CHART_MOTION.entry.duration
  if (context === 'toggle') return CHART_MOTION.toggle.duration
  if (context === 'morph') return CHART_MOTION.morph.duration
  return CHART_MOTION.refresh.duration
}

function getAxisAnimationDuration(context: ChartAnimationContext): number {
  return context === 'entry' ? CHART_MOTION.axis.entry : CHART_MOTION.axis.toggle
}

function getChartStaggerDelay(index: number, context: ChartAnimationContext): string {
  if (context === 'toggle') {
    return '0ms' // Toggles are immediate, no stagger
  }
  if (context === 'morph') {
    return `${Math.max(0, index) * CHART_MOTION.morph.stagger}ms`
  }
  // Entry animation with stagger cap
  return `${Math.min(CHART_MOTION.entry.staggerMax, Math.max(0, index) * CHART_MOTION.entry.stagger)}ms`
}

function tileMotionEntryDelay(index = 0, animateIn = false): string {
  if (!animateIn) {
    return '0ms'
  }
  return getChartStaggerDelay(index, 'entry')
}

function tileMotionEntryDuration(index = 0, animateIn = false): string {
  if (!animateIn) {
    return `${CHART_MOTION.toggle.duration}ms`
  }
  const delayMs = Math.min(CHART_MOTION.entry.staggerMax, Math.max(0, index) * CHART_MOTION.entry.stagger)
  const durationMs = Math.max(160, CHART_MOTION.entry.duration - delayMs)
  return `${durationMs}ms`
}

function buildTileToggleThumbStyle(activeIndex: number, optionCount: number, isEntryCycle = false): CSSProperties {
  const safeCount = Math.max(1, optionCount)
  const safeIndex = Math.max(0, Math.min(activeIndex, safeCount - 1))
  const widthPercent = 100 / safeCount
  const leftPercent = safeIndex * widthPercent
  const finalWidth = `${safeIndex === safeCount - 1 ? 100 - leftPercent : widthPercent}%`
  return {
    width: finalWidth,
    left: `${leftPercent}%`,
    willChange: 'left,width',
    transitionDuration: isEntryCycle ? '0ms' : undefined,
  }
}

function PublicationTrendsVisualToggle({
  value,
  onChange,
}: {
  value: PublicationTrendsVisualMode
  onChange: (mode: PublicationTrendsVisualMode) => void
}) {
  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'overflow-hidden')}
        data-stop-tile-open="true"
        data-ui="publications-trends-visual-toggle"
        data-house-role="chart-toggle"
        style={{ width: '7.75rem', gridTemplateColumns: '1fr 1fr 1fr' }}
      >
        {(['bars', 'line', 'table'] as const).map((mode, optionIndex, options) => (
          <button
            key={mode}
            type="button"
            data-stop-tile-open="true"
            className={cn(
              HOUSE_TOGGLE_BUTTON_CLASS,
              'relative z-[1] inline-flex min-w-0 items-center justify-center px-1.5',
              optionIndex === 0
                ? '!rounded-l-full !rounded-r-none'
                : optionIndex === options.length - 1
                  ? '!rounded-l-none !rounded-r-full'
                  : '!rounded-none',
              value === mode
                ? 'bg-foreground text-background shadow-sm'
                : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
            )}
            aria-pressed={value === mode}
            onClick={(event) => {
              event.stopPropagation()
              onChange(mode)
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {mode === 'bars' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(HOUSE_TOGGLE_CHART_BAR_CLASS, 'h-3.5 w-3.5 fill-current')}>
                <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
                <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
                <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
              </svg>
            ) : mode === 'line' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                <polyline
                  points="2,11 6,8 9,9 14,4"
                  fill="none"
                  className="house-toggle-chart-line"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-expanded="true"
                />
                <circle cx="2" cy="11" r="1.1" fill="currentColor" />
                <circle cx="6" cy="8" r="1.1" fill="currentColor" />
                <circle cx="9" cy="9" r="1.1" fill="currentColor" />
                <circle cx="14" cy="4" r="1.1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                <rect x="2.2" y="3" width="11.6" height="10" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <line x1="2.9" y1="6.1" x2="13.1" y2="6.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="2.9" y1="9.1" x2="13.1" y2="9.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="6.1" y1="3.7" x2="6.1" y2="12.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isChartDebugEnabled(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return false
  }
  const debugWindow = window as Window & { __HOUSE_CHART_DEBUG__?: boolean }
  if (typeof debugWindow.__HOUSE_CHART_DEBUG__ === 'boolean') {
    return debugWindow.__HOUSE_CHART_DEBUG__
  }
  try {
    if (window.localStorage.getItem('house:chart-debug') === '1') {
      return true
    }
  } catch {
    return false
  }
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('chartDebug') === '1'
  } catch {
    return false
  }
}

function logChartDebug(scope: string, payload: Record<string, unknown>): void {
  if (!isChartDebugEnabled()) {
    return
  }
  console.info(`[chart-debug] ${scope}`, payload)
}

function useUnifiedToggleBarAnimation(
  animationKey: string,
  enabled: boolean,
  mode: 'replay-on-change' | 'entry-only' = 'replay-on-change',
): boolean {
  const [barsExpanded, setBarsExpanded] = useState(false)
  const hasAnimatedEntryRef = useRef(false)

  useLayoutEffect(() => {
    logChartDebug('useUnifiedToggleBarAnimation:start', {
      animationKey,
      enabled,
      mode,
    })
    if (!enabled) {
      setBarsExpanded(false)
      hasAnimatedEntryRef.current = false
      logChartDebug('useUnifiedToggleBarAnimation:disabled', {
        animationKey,
      })
      return
    }
    if (prefersReducedMotion()) {
      setBarsExpanded(true)
      hasAnimatedEntryRef.current = true
      logChartDebug('useUnifiedToggleBarAnimation:reduced-motion', {
        animationKey,
      })
      return
    }
    if (mode === 'entry-only' && hasAnimatedEntryRef.current) {
      setBarsExpanded(true)
      logChartDebug('useUnifiedToggleBarAnimation:entry-only-reuse', {
        animationKey,
      })
      return
    }
    // Set to false first to reset animation
    setBarsExpanded(false)
    // Use requestAnimationFrame to flip to true on the next frame
    // Using useLayoutEffect ensures all components schedule their RAF at the same time
    const raf = window.requestAnimationFrame(() => {
      setBarsExpanded(true)
      hasAnimatedEntryRef.current = true
      logChartDebug('useUnifiedToggleBarAnimation:expanded', {
        animationKey,
      })
    })
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, enabled, mode])

  return barsExpanded
}

function useIsFirstChartEntry(animationKey: string, enabled: boolean): boolean {
  const hasEnteredRef = useRef(false)
  const [isEntryCycle, setIsEntryCycle] = useState<boolean>(() => enabled)

  useEffect(() => {
    if (!enabled) {
      setIsEntryCycle(false)
      hasEnteredRef.current = false
      logChartDebug('useIsFirstChartEntry:disabled', {
        animationKey,
      })
      return
    }
    if (hasEnteredRef.current) {
      logChartDebug('useIsFirstChartEntry:reuse', {
        animationKey,
        entryCycle: false,
      })
      return
    }

    hasEnteredRef.current = true
    setIsEntryCycle(true)
    logChartDebug('useIsFirstChartEntry:update', {
      animationKey,
      entryCycle: true,
    })
  }, [animationKey, enabled])

  useEffect(() => {
    if (!isEntryCycle) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      setIsEntryCycle(false)
      logChartDebug('useIsFirstChartEntry:complete', {
        animationKey,
        entryCycle: false,
      })
    }, CHART_MOTION.entry.duration)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [animationKey, isEntryCycle])

  return isEntryCycle
}

function tileChartDurationVar(isEntryCycle: boolean): string {
  const context: ChartAnimationContext = isEntryCycle ? 'entry' : 'toggle'
  const duration = getChartAnimationDuration(context, 'bar')
  return `${duration}ms`
}

function ringChartDurationVar(isEntryCycle: boolean): string {
  const context: ChartAnimationContext = isEntryCycle ? 'entry' : 'toggle'
  const duration = getChartAnimationDuration(context, 'ring')
  return `${duration}ms`
}

function tileAxisDurationMs(isEntryCycle: boolean): number {
  const context: ChartAnimationContext = isEntryCycle ? 'entry' : 'toggle'
  return getAxisAnimationDuration(context)
}

function useHouseBarSetTransition<T extends { key: string }>({
  bars,
  animationKey,
  enabled,
  collapseMs = 0,
  structureSwap = 'collapse',
  crossfadeMs = CHART_MOTION.toggle.duration,
  barExpandMode = 'replay-on-change',
}: {
  bars: T[]
  animationKey: string
  enabled: boolean
  collapseMs?: number
  structureSwap?: 'collapse' | 'crossfade'
  crossfadeMs?: number
  barExpandMode?: 'replay-on-change' | 'entry-only'
}): {
  renderBars: T[]
  outgoingBars: T[]
  isCrossfading: boolean
  pendingBars: T[]
  isSwappingStructure: boolean
  barsExpanded: boolean
} {
  const [frozenRenderBars, setFrozenRenderBars] = useState<T[] | null>(null)
  const [outgoingBars, setOutgoingBars] = useState<T[]>([])
  const [pendingBars, setPendingBars] = useState<T[]>([])
  const [isCrossfading, setIsCrossfading] = useState(false)
  const [isSwappingStructure, setIsSwappingStructure] = useState(false)
  const barsRef = useRef<T[]>(bars)
  const previousBarsRef = useRef<T[]>(bars)
  const swapRafRef = useRef<number | null>(null)
  const swapTimerRef = useRef<number | null>(null)

  useEffect(() => {
    barsRef.current = bars
  }, [bars])

  useEffect(() => {
    return () => {
      if (swapRafRef.current !== null) {
        window.cancelAnimationFrame(swapRafRef.current)
        swapRafRef.current = null
      }
      if (swapTimerRef.current !== null) {
        window.clearTimeout(swapTimerRef.current)
        swapTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const nextBars = barsRef.current
    const clearSwapState = () => {
      setOutgoingBars((current) => (current.length > 0 ? [] : current))
      setPendingBars((current) => (current.length > 0 ? [] : current))
      setIsCrossfading((current) => (current ? false : current))
      setIsSwappingStructure((current) => (current ? false : current))
      setFrozenRenderBars((current) => (current === null ? current : null))
    }
    if (swapRafRef.current !== null) {
      window.cancelAnimationFrame(swapRafRef.current)
      swapRafRef.current = null
    }
    if (swapTimerRef.current !== null) {
      window.clearTimeout(swapTimerRef.current)
      swapTimerRef.current = null
    }

    if (!enabled) {
      previousBarsRef.current = nextBars
      clearSwapState()
      return
    }

    const previousBars = previousBarsRef.current
    const hadPrevious = previousBars.length > 0
    const structureChanged =
      previousBars.length !== nextBars.length
      || previousBars.some((bar, index) => bar.key !== nextBars[index]?.key)

    previousBarsRef.current = nextBars

    if (!hadPrevious || !structureChanged) {
      clearSwapState()
      return
    }

    if (prefersReducedMotion()) {
      clearSwapState()
      return
    }

    const safeCrossfadeMs = Math.max(0, crossfadeMs)
    const safeCollapseMs = Math.max(0, collapseMs)

    if (structureSwap === 'crossfade') {
      setFrozenRenderBars(null)
      setOutgoingBars(previousBars)
      setPendingBars(nextBars)
      setIsCrossfading(false)
      setIsSwappingStructure(true)
      swapRafRef.current = window.requestAnimationFrame(() => {
        setIsCrossfading(true)
      })
      swapTimerRef.current = window.setTimeout(() => {
        setOutgoingBars([])
        setPendingBars([])
        setIsCrossfading(false)
        setIsSwappingStructure(false)
      }, safeCrossfadeMs)
      return
    }

    setFrozenRenderBars(previousBars)
    setOutgoingBars(previousBars)
    setPendingBars(nextBars)
    setIsCrossfading(false)
    setIsSwappingStructure(true)

    swapTimerRef.current = window.setTimeout(() => {
      setFrozenRenderBars(null)
      setOutgoingBars((current) => (current.length > 0 ? [] : current))
      setPendingBars((current) => (current.length > 0 ? [] : current))
      setIsCrossfading((current) => (current ? false : current))
      setIsSwappingStructure((current) => (current ? false : current))
    }, safeCollapseMs)
  }, [animationKey, collapseMs, crossfadeMs, enabled, structureSwap])

  const barsExpanded = useUnifiedToggleBarAnimation(
    `${animationKey}|${bars.map((bar) => bar.key).join('|')}`,
    enabled,
    barExpandMode,
  )
  return {
    renderBars: frozenRenderBars ?? bars,
    outgoingBars,
    isCrossfading,
    pendingBars,
    isSwappingStructure,
    barsExpanded,
  }
}

void useHouseBarSetTransition

function useEasedValue(target: number, animationKey: string, enabled: boolean, durationMs: number = CHART_MOTION.axis.toggle): number {
  const [value, setValue] = useState<number>(() => (enabled ? 0 : target))
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0)
      valueRef.current = 0
      logChartDebug('useEasedValue:invalid-target', {
        animationKey,
        target,
      })
      return
    }
    if (!enabled || prefersReducedMotion()) {
      setValue(target)
      valueRef.current = target
      logChartDebug('useEasedValue:direct-set', {
        animationKey,
        target,
        enabled,
      })
      return
    }
    const from = Number.isFinite(valueRef.current) ? valueRef.current : 0
    const to = target
    if (Math.abs(from - to) < 0.0001) {
      logChartDebug('useEasedValue:unchanged', {
        animationKey,
        value: to,
      })
      return
    }
    logChartDebug('useEasedValue:animate-start', {
      animationKey,
      from,
      to,
      durationMs,
    })
    let raf = 0
    const startedAt = performance.now()
    const easeOutCubic = (progress: number) => 1 - ((1 - progress) ** 3)
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs))
      const eased = easeOutCubic(progress)
      const nextValue = from + ((to - from) * eased)
      valueRef.current = nextValue
      setValue(nextValue)
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      } else {
        logChartDebug('useEasedValue:animate-end', {
          animationKey,
          value: to,
          durationMs,
        })
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, durationMs, enabled, target])

  return value
}

function useEasedSeries(target: number[], animationKey: string, enabled: boolean, durationMs: number = CHART_MOTION.axis.toggle): number[] {
  const [values, setValues] = useState<number[]>(() => (enabled ? target.map(() => 0) : target))
  const valuesRef = useRef(values)

  useEffect(() => {
    valuesRef.current = values
  }, [values])

  useEffect(() => {
    if (!target.length) {
      if (valuesRef.current.length !== 0) {
        setValues([])
        valuesRef.current = []
      }
      logChartDebug('useEasedSeries:empty', {
        animationKey,
      })
      return
    }
    const to = target.map((value) => (Number.isFinite(value) ? value : 0))
    if (!enabled || prefersReducedMotion()) {
      const current = valuesRef.current
      const unchanged = current.length === to.length && current.every((value, index) => Math.abs(value - to[index]) < 0.0001)
      if (!unchanged) {
        setValues(to)
        valuesRef.current = to
      }
      logChartDebug('useEasedSeries:direct-set', {
        animationKey,
        enabled,
        count: to.length,
      })
      return
    }
    const from = to.map((_, index) => {
      const current = valuesRef.current[index]
      return Number.isFinite(current) ? current : 0
    })
    const unchanged = from.length === to.length && from.every((value, index) => Math.abs(value - to[index]) < 0.0001)
    if (unchanged) {
      logChartDebug('useEasedSeries:unchanged', {
        animationKey,
        count: to.length,
      })
      return
    }

    logChartDebug('useEasedSeries:animate-start', {
      animationKey,
      count: to.length,
      durationMs,
    })

    let raf = 0
    const startedAt = performance.now()
    const easeOutCubic = (progress: number) => 1 - ((1 - progress) ** 3)
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs))
      const eased = easeOutCubic(progress)
      const next = to.map((targetValue, index) => from[index] + ((targetValue - from[index]) * eased))
      valuesRef.current = next
      setValues(next)
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      } else {
        logChartDebug('useEasedSeries:animate-end', {
          animationKey,
          count: to.length,
          durationMs,
        })
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, durationMs, enabled, target])

  if (values.length === target.length) {
    return values
  }
  return target.map((_, index) => values[index] ?? 0)
}

type HIndexProgressMeta = {
  currentH: number
  targetH: number
  progressPct: number
  immediateCount: number
  nearCount: number
  longerCount: number
  hasGapData: boolean
}

function buildTrailingMonthStarts(count: number, endAtLastCompleteMonth = false): Date[] {
  const today = new Date()
  const anchorMonth = endAtLastCompleteMonth ? today.getUTCMonth() - 1 : today.getUTCMonth()
  return Array.from({ length: count }, (_, index) => {
    const shift = count - 1 - index
    return new Date(Date.UTC(today.getUTCFullYear(), anchorMonth - shift, 1))
  })
}

function fallbackMonthLabels(count: number, endAtLastCompleteMonth = false): string[] {
  return buildTrailingMonthStarts(count, endAtLastCompleteMonth)
    .map((monthDate) => MONTH_SHORT[monthDate.getUTCMonth()] || '—')
}

function fallbackMonthYearShortLabels(count: number, endAtLastCompleteMonth = false): string[] {
  return buildTrailingMonthStarts(count, endAtLastCompleteMonth)
    .map((monthDate) => String(monthDate.getUTCFullYear()).slice(-2))
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

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

function parseIsoMonthStart(value: string): Date | null {
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

function parseIsoPublicationDate(value: string): Date | null {
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

function getSpanMonths(startMs: number, endMs: number): number {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const startIndex = (start.getUTCFullYear() * 12) + start.getUTCMonth()
  const endIndex = (end.getUTCFullYear() * 12) + end.getUTCMonth()
  return Math.max(0, endIndex - startIndex)
}

type PublicationLineAxisTick = {
  key: string
  label: string
  subLabel?: string
  leftPct: number
}

function isNonNullish<T>(value: T | null | undefined): value is T {
  return value != null
}

export function buildLineTicksFromRange(startMs: number, endMs: number, mode: PublicationsWindowMode): PublicationLineAxisTick[] {
  // For rolling window modes (3y, 5y), use only real year-boundary ticks.
  if (mode === '3y' || mode === '5y') {
    const spanMs = Math.max(1, endMs - startMs)
    const startDate = new Date(startMs)
    const endDate = new Date(endMs)
    const startYear = startDate.getUTCFullYear()
    const endYear = endDate.getUTCFullYear()

    const yearBoundaryTicks: PublicationLineAxisTick[] = []
    for (let year = startYear; year <= endYear; year += 1) {
      const yearStartMs = new Date(Date.UTC(year, 0, 1)).getTime()
      if (yearStartMs < startMs || yearStartMs > endMs) {
        continue
      }
      const position = Math.max(0, Math.min(1, (yearStartMs - startMs) / spanMs))
      yearBoundaryTicks.push({
        key: `line-axis-${mode}-${year}`,
        label: String(year),
        subLabel: undefined,
        leftPct: position * 100,
      })
    }

    const interiorTicks = yearBoundaryTicks.filter((tick) => tick.leftPct > 0.5 && tick.leftPct < 99.5)
    if (interiorTicks.length > 0) {
      return interiorTicks
    }

    if (yearBoundaryTicks.length > 0) {
      return yearBoundaryTicks
    }

    const fallbackStartYear = startDate.getUTCFullYear()
    const fallbackEndYear = endDate.getUTCFullYear()
    return [
      {
        key: `line-axis-${mode}-fallback-start`,
        label: String(fallbackStartYear),
        subLabel: undefined,
        leftPct: 0,
      },
      {
        key: `line-axis-${mode}-fallback-end`,
        label: String(fallbackEndYear),
        subLabel: undefined,
        leftPct: 100,
      },
    ]
  }

  if (mode === '1y') {
    const spanMs = Math.max(1, endMs - startMs)
    const startDate = new Date(startMs)
    const endDate = new Date(endMs)
    const monthAnchors = [0, 3, 6, 9].map((offset) => (
      new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + offset, 1))
    ))
    const ticks = monthAnchors
      .map<PublicationLineAxisTick | null>((anchor, index) => {
        const anchorMs = anchor.getTime()
        if (anchorMs < startMs || anchorMs > endMs) {
          return null
        }
        const position = Math.max(0, Math.min(1, (anchorMs - startMs) / spanMs))
        return {
          key: `line-axis-${mode}-${index}`,
          label: MONTH_SHORT[anchor.getUTCMonth()],
          subLabel: String(anchor.getUTCFullYear()),
          leftPct: position * 100,
        }
      })
      .filter(isNonNullish)

    const endTick: PublicationLineAxisTick = {
      key: `line-axis-${mode}-end`,
      label: MONTH_SHORT[endDate.getUTCMonth()],
      subLabel: String(endDate.getUTCFullYear()),
      leftPct: 100,
    }

    const combinedTicks = [...ticks, endTick]
      .filter((tick, index, values) => index === 0 || Math.abs(tick.leftPct - values[index - 1].leftPct) > 4)

    return combinedTicks
  }

  if (mode === 'all') {
    const spanMs = Math.max(1, endMs - startMs)
    const startDate = new Date(startMs)
    const endDate = new Date(endMs)
    const startYear = startDate.getUTCFullYear()
    const endYear = endDate.getUTCFullYear()
    const lastLabelYear = endYear
    const targetTickCount = lastLabelYear - startYear <= 5
      ? 5
      : lastLabelYear - startYear <= 12
        ? 4
        : lastLabelYear - startYear <= 25
          ? 4
          : 3
    const step = Math.max(1, Math.ceil((lastLabelYear - startYear + 1) / Math.max(1, targetTickCount)))
    const tickYears = new Set<number>()
    for (let year = startYear; year <= lastLabelYear; year += step) {
      tickYears.add(year)
    }
    if (tickYears.size <= 1 && lastLabelYear !== startYear) {
      tickYears.add(lastLabelYear)
    }

    const yearBoundaryTicks = Array.from(tickYears)
      .sort((left, right) => left - right)
      .map((year) => {
        const yearStartMs = new Date(Date.UTC(year, 0, 1)).getTime()
        if (yearStartMs < startMs || yearStartMs > endMs) {
          return null
        }
        const position = Math.max(0, Math.min(1, (yearStartMs - startMs) / spanMs))
        return {
          key: `line-axis-${mode}-${year}`,
          label: String(year),
          subLabel: undefined,
          leftPct: position * 100,
        }
      })
      .filter(isNonNullish)
      .filter((tick, index, ticks) => index === 0 || Math.abs(tick.leftPct - ticks[index - 1].leftPct) > 0.5)

    const MIN_LABEL_SPACING_PCT = 12
    const filteredTicks: PublicationLineAxisTick[] = []
    for (const tick of yearBoundaryTicks) {
      const previousTick = filteredTicks[filteredTicks.length - 1]
      if (!previousTick) {
        filteredTicks.push(tick)
        continue
      }
      const isLastTick = tick === yearBoundaryTicks[yearBoundaryTicks.length - 1]
      if (tick.leftPct - previousTick.leftPct < MIN_LABEL_SPACING_PCT) {
        if (isLastTick) {
          filteredTicks[filteredTicks.length - 1] = tick
        }
        continue
      }
      filteredTicks.push(tick)
    }

    if (filteredTicks.length > 0) {
      return filteredTicks
    }
  }
  
  const spanMonths = getSpanMonths(startMs, endMs)
  const spanYears = spanMonths / 12
  const tickCount = spanYears <= 5
    ? 5
    : spanYears <= 12
      ? 4
      : spanYears <= 25
        ? 4
        : 3
  const count = Math.max(2, tickCount)
  const spanMs = Math.max(1, endMs - startMs)
  const showMonth = spanMonths <= 18
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0 : index / (count - 1)
    const timeMs = Math.round(startMs + (spanMs * position))
    const date = new Date(timeMs)
    return {
      key: `line-axis-${mode}-${index}`,
      label: showMonth ? MONTH_SHORT[date.getUTCMonth()] : String(date.getUTCFullYear()),
      subLabel: showMonth ? String(date.getUTCFullYear()) : undefined,
      leftPct: position * 100,
    }
  })
}

function buildRollingWindowLabel(monthLabels: string[], endYear: number): string | null {
  if (!monthLabels.length || !Number.isFinite(endYear)) {
    return null
  }
  const startLabel = monthLabels[0]
  const endLabel = monthLabels[monthLabels.length - 1]
  const startMonthIndex = parseMonthIndex(startLabel)
  const endMonthIndex = parseMonthIndex(endLabel)
  if (startMonthIndex === null || endMonthIndex === null) {
    return null
  }
  const wrapsYearBoundary = startMonthIndex > endMonthIndex
  const startYear = wrapsYearBoundary ? endYear - 1 : endYear
  return `${MONTH_SHORT[startMonthIndex]} ${String(startYear).slice(-2)}-${MONTH_SHORT[endMonthIndex]} ${String(endYear).slice(-2)}`
}

function selectPublicationBucketSize(count: number): number {
  if (count <= MAX_PUBLICATION_CHART_BARS) {
    return 1
  }
  if (count <= 36) {
    return 3
  }
  if (count <= 60) {
    return 5
  }
  if (count <= 120) {
    return 10
  }
  return Math.max(10, Math.ceil(count / MAX_PUBLICATION_CHART_BARS))
}

function formatPublicationYearLabel(startYear: number, endYear: number, fullYear: boolean): string {
  if (startYear === endYear) {
    return fullYear ? String(startYear) : String(startYear).slice(-2)
  }
  const startLabel = fullYear ? String(startYear) : String(startYear).slice(-2)
  const endLabel = fullYear ? String(endYear) : String(endYear).slice(-2)
  return `${startLabel}-${endLabel}`
}

function shortYearLabel(year: number): string {
  return String(year).slice(-2).padStart(2, '0')
}

function formatMonthYearLabel(timeMs: number): string {
  const date = new Date(timeMs)
  if (!Number.isFinite(date.getTime())) {
    return '\u2014'
  }
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function buildNiceAxis(maxObservedValue: number): { axisMax: number; ticks: number[] } {
  const safeMax = Math.max(1, maxObservedValue)
  if (safeMax <= 6) {
    const axisMax = Math.max(3, Math.ceil(safeMax * 1.15))
    const ticks = Array.from({ length: axisMax + 1 }, (_, index) => index)
    return { axisMax, ticks }
  }
  const intervals = safeMax >= 250 ? 5 : 4
  const targetMax = safeMax * 1.08
  const roughStep = Math.max(1, targetMax / intervals)
  const step = roughStep <= 10
    ? Math.ceil(roughStep)
    : roughStep <= 50
      ? Math.ceil(roughStep / 5) * 5
      : roughStep <= 200
        ? Math.ceil(roughStep / 10) * 10
        : roughStep <= 500
          ? Math.ceil(roughStep / 25) * 25
          : Math.ceil(roughStep / 50) * 50
  const axisMax = step * intervals
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => step * index)
  return { axisMax, ticks }
}

export type CitationHistogramBucket = {
  key: string
  label: string
  minCitations: number
  maxCitations: number | null
  count: number
  sharePct: number
}

type CitationHistogramBucketDefinition = {
  minCitations: number
  maxCitations: number | null
  label: string
}

export type CitationConcentrationLadderStep = {
  key: string
  label: string
  paperCount: number
  paperSharePct: number
  citationCount: number
  citationSharePct: number
}

const CITATION_HISTOGRAM_BASE_BUCKETS: CitationHistogramBucketDefinition[] = [
  { minCitations: 0, maxCitations: 0, label: '0' },
  { minCitations: 1, maxCitations: 1, label: '1' },
  { minCitations: 2, maxCitations: 4, label: '2-4' },
  { minCitations: 5, maxCitations: 9, label: '5-9' },
  { minCitations: 10, maxCitations: 24, label: '10-24' },
]

const CITATION_HISTOGRAM_HIGH_BUCKET_STARTS = [25, 50, 100, 200, 500, 1000] as const
const CITATION_CONCENTRATION_LADDER_COUNTS = [1, 3, 5, 10] as const

function formatCitationHistogramBoundary(value: number): string {
  return String(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
}

export function buildCitationConcentrationLadder(citationCounts: number[]): CitationConcentrationLadderStep[] {
  const normalizedCounts = citationCounts
    .map((value) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        return 0
      }
      return Math.max(0, Math.round(parsed))
    })
  const totalPublications = normalizedCounts.length
  if (!totalPublications) {
    return []
  }
  const sortedCounts = normalizedCounts.slice().sort((left, right) => right - left)
  const totalCitations = sortedCounts.reduce((sum, value) => sum + value, 0)
  const quartileCount = Math.max(1, Math.ceil(totalPublications * 0.25))
  const stepDefinitions: Array<{ count: number; label: string }> = []
  const seenCounts = new Set<number>()
  const addStep = (count: number, label: string) => {
    if (count < 1 || count > totalPublications || seenCounts.has(count)) {
      return
    }
    seenCounts.add(count)
    stepDefinitions.push({ count, label })
  }

  CITATION_CONCENTRATION_LADDER_COUNTS.forEach((count) => {
    addStep(count, `Top ${formatInt(count)} ${pluralize(count, 'paper')}`)
  })
  addStep(quartileCount, 'Top 25%')

  if (!stepDefinitions.length) {
    addStep(1, 'Top 1 paper')
  }

  const sortedDefinitions = stepDefinitions.slice().sort((left, right) => left.count - right.count)
  const prefixSums = sortedCounts.reduce<number[]>((acc, value, index) => {
    acc[index] = value + (acc[index - 1] || 0)
    return acc
  }, [])

  return sortedDefinitions.map((definition) => {
    const citationCount = prefixSums[definition.count - 1] || 0
    return {
      key: `citation-concentration-${definition.count}`,
      label: definition.label,
      paperCount: definition.count,
      paperSharePct: (definition.count / totalPublications) * 100,
      citationCount,
      citationSharePct: totalCitations > 0 ? (citationCount / totalCitations) * 100 : 0,
    }
  })
}

export function buildCitationHistogramBuckets(citationCounts: number[]): CitationHistogramBucket[] {
  const normalizedCounts = citationCounts
    .map((value) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        return 0
      }
      return Math.max(0, Math.round(parsed))
    })
  if (!normalizedCounts.length) {
    return []
  }
  const totalPublications = normalizedCounts.length
  const maxCitations = Math.max(0, ...normalizedCounts)
  const bucketDefinitions = CITATION_HISTOGRAM_BASE_BUCKETS
    .filter((bucket) => bucket.minCitations <= maxCitations)
    .map((bucket) => ({ ...bucket }))

  if (maxCitations >= 25) {
    const eligibleHighStarts = CITATION_HISTOGRAM_HIGH_BUCKET_STARTS.filter((start) => start <= maxCitations)
    eligibleHighStarts.forEach((start, index) => {
      const nextStart = eligibleHighStarts[index + 1]
      const isLastBucket = index === eligibleHighStarts.length - 1
      bucketDefinitions.push({
        minCitations: start,
        maxCitations: isLastBucket ? null : nextStart - 1,
        label: isLastBucket
          ? `${formatCitationHistogramBoundary(start)}+`
          : `${formatCitationHistogramBoundary(start)}-${formatCitationHistogramBoundary(nextStart - 1)}`,
      })
    })
  }

  if (!bucketDefinitions.length) {
    bucketDefinitions.push({ minCitations: 0, maxCitations: 0, label: '0' })
  }

  return bucketDefinitions.map((bucket) => {
    const count = normalizedCounts.filter((value) => {
      if (value < bucket.minCitations) {
        return false
      }
      if (bucket.maxCitations === null) {
        return true
      }
      return value <= bucket.maxCitations
    }).length
    return {
      key: `citation-histogram-${bucket.minCitations}-${bucket.maxCitations === null ? 'plus' : bucket.maxCitations}`,
      label: bucket.label,
      minCitations: bucket.minCitations,
      maxCitations: bucket.maxCitations,
      count,
      sharePct: totalPublications > 0 ? (count / totalPublications) * 100 : 0,
    }
  })
}

function buildMomentumBreakdown(tile: PublicationMetricTilePayload): MomentumBreakdown {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const sourceLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const normalizedMonthlyLabels = sourceLabels.length >= monthlySeries.length
    ? sourceLabels.slice(-monthlySeries.length)
    : fallbackMonthLabels(monthlySeries.length)
  const fullSeries = monthlySeries.length ? monthlySeries : fallbackSeries
  const lastNineValues = fullSeries.length >= 9 ? fullSeries.slice(-9) : fullSeries.slice()
  const labels = fullSeries === monthlySeries && normalizedMonthlyLabels.length >= lastNineValues.length
    ? normalizedMonthlyLabels.slice(-lastNineValues.length)
    : sourceLabels.length >= lastNineValues.length
      ? sourceLabels.slice(-lastNineValues.length)
      : fallbackMonthLabels(lastNineValues.length)
  const bars = lastNineValues.map((value, index) => ({
    label: labels[index] || `M${index + 1}`,
    value,
  }))
  const fullLabels = fullSeries === monthlySeries && normalizedMonthlyLabels.length >= fullSeries.length
    ? normalizedMonthlyLabels.slice(-fullSeries.length)
    : sourceLabels.length >= fullSeries.length
      ? sourceLabels.slice(-fullSeries.length)
    : fallbackMonthLabels(fullSeries.length)
  const baselineWindow = fullSeries.length >= 12 ? fullLabels.slice(-12, -3) : []
  const recentWindow = fullSeries.length >= 3 ? fullLabels.slice(-3) : []
  const baselineWindowLabel = baselineWindow.length > 0
    ? baselineWindow[0] === baselineWindow[baselineWindow.length - 1]
      ? baselineWindow[0]
      : `${baselineWindow[0]}-${baselineWindow[baselineWindow.length - 1]}`
    : null
  const recentWindowLabel = recentWindow.length > 0
    ? recentWindow[0] === recentWindow[recentWindow.length - 1]
      ? recentWindow[0]
      : `${recentWindow[0]}-${recentWindow[recentWindow.length - 1]}`
    : null

  const recent3 = fullSeries.length >= 3 ? fullSeries.slice(-3) : []
  const baseline9 = fullSeries.length >= 12 ? fullSeries.slice(-12, -3) : []
  const recent3Total = recent3.length === 3 ? recent3.reduce((sum, item) => sum + item, 0) : null
  const baseline9Total = baseline9.length === 9 ? baseline9.reduce((sum, item) => sum + item, 0) : null
  const rate3m = recent3Total === null ? null : recent3Total / 3
  const rate9m = baseline9Total === null ? null : baseline9Total / 9
  const insufficientBaseline = rate3m === null || rate9m === null || rate9m <= 1e-6
  const liftPct = insufficientBaseline || rate3m === null || rate9m === null ? null : ((rate3m / rate9m) - 1) * 100

  return {
    bars,
    baselineWindowLabel,
    recentWindowLabel,
    recent3Total,
    baseline9Total,
    rate3m,
    rate9m,
    liftPct,
    insufficientBaseline,
  }
}

function buildMomentumYearBreakdown(totalCitationsTile: PublicationMetricTilePayload | null): MomentumYearBreakdown | null {
  if (!totalCitationsTile) {
    return null
  }
  const chartData = (totalCitationsTile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const pairCount = Math.min(years.length, values.length)
  if (pairCount <= 0) {
    return null
  }
  const lastFivePairs = Array.from({ length: pairCount }, (_, index) => ({
    year: years[index],
    value: values[index],
  })).slice(-5)
  const bars = lastFivePairs.map((item) => ({
    label: String(item.year),
    value: item.value,
  }))
  const priorYears = lastFivePairs.slice(0, -1).map((item) => item.year)
  const priorYearsLabel = priorYears.length > 0
    ? priorYears.length === 1
      ? String(priorYears[0])
      : `${priorYears[0]}-${priorYears[priorYears.length - 1]}`
    : null
  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const monthLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const normalizedMonthlyLabels = monthLabels.length >= monthlySeries.length
    ? monthLabels.slice(-monthlySeries.length)
    : fallbackMonthLabels(monthlySeries.length)
  const recent12Total = monthlySeries.length >= 12
    ? monthlySeries.slice(-12).reduce((sum, item) => sum + item, 0)
    : null
  const trailingWindowLabels = normalizedMonthlyLabels.length >= 12 ? normalizedMonthlyLabels.slice(-12) : []
  const rollingWindowLabel = trailingWindowLabels.length ? buildRollingWindowLabel(trailingWindowLabels, projectedYear) : null
  const latestYearValue = lastFivePairs.length > 0 ? lastFivePairs[lastFivePairs.length - 1].value : null
  const recentYearLabel = rollingWindowLabel || (lastFivePairs.length > 0 ? String(lastFivePairs[lastFivePairs.length - 1].year) : null)
  const latest = recent12Total ?? latestYearValue
  const priorFourValues = lastFivePairs.slice(0, -1).map((item) => item.value)
  const baseline4Total = priorFourValues.length >= 4
    ? priorFourValues.slice(-4).reduce((sum, item) => sum + item, 0)
    : null
  const rate1y = latest === null ? null : latest
  const rate4y = baseline4Total === null ? null : baseline4Total / 4
  const insufficientBaseline = rate1y === null || rate4y === null || rate4y <= 1e-6
  const liftPct = insufficientBaseline || rate1y === null || rate4y === null ? null : ((rate1y / rate4y) - 1) * 100
  return {
    bars,
    priorYearsLabel,
    recentYearLabel,
    recent1Total: rate1y,
    baseline4Total,
    rate1y,
    rate4y,
    liftPct,
    insufficientBaseline,
  }
}

function buildHIndexProgressMeta(tile: PublicationMetricTilePayload): HIndexProgressMeta {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const currentCandidates = [
    Number(chartData.current_h_index),
    Number(tile.main_value),
    Number(tile.value),
  ]
  const currentCandidate = currentCandidates.find((item) => Number.isFinite(item) && item >= 0)
  const currentH = Math.max(0, Math.round(currentCandidate ?? 0))
  const nextHRaw = Number(chartData.next_h_index)
  const nextHCandidate = Number.isFinite(nextHRaw) ? Math.round(nextHRaw) : currentH + 1
  const targetH = nextHCandidate > currentH ? nextHCandidate : currentH + 1
  const progressRaw = Number(chartData.progress_to_next_pct)
  const progressPct = Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(100, progressRaw))
    : 0
  const candidateGaps = toNumberArray(chartData.candidate_gaps)
    .map((item) => Math.max(0, Math.round(item)))
  const immediateCount = candidateGaps.filter((gap) => gap <= 1).length
  const nearCount = candidateGaps.filter((gap) => gap >= 2 && gap <= 3).length
  const longerCount = candidateGaps.filter((gap) => gap >= 4).length
  return {
    currentH,
    targetH,
    progressPct,
    immediateCount,
    nearCount,
    longerCount,
    hasGapData: candidateGaps.length > 0,
  }
}

type LinePoint = {
  x: number
  y: number
  value: number
  label: string
}

type MonotonePathSegment =
  | {
    kind: 'line'
    start: Pick<LinePoint, 'x' | 'y'>
    end: Pick<LinePoint, 'x' | 'y'>
  }
  | {
    kind: 'cubic'
    start: Pick<LinePoint, 'x' | 'y'>
    cp1: Pick<LinePoint, 'x' | 'y'>
    cp2: Pick<LinePoint, 'x' | 'y'>
    end: Pick<LinePoint, 'x' | 'y'>
  }

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeSeriesLabels(value: unknown, count: number, prefix: string): string[] {
  const labels = toStringArray(value)
  if (labels.length >= count) {
    return labels.slice(-count)
  }
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)
}

function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  labels: string[],
  padding = 6,
): LinePoint[] {
  if (!values.length) {
    return []
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1e-6, max - min)
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: padding + index * step,
    y: height - padding - ((value - min) / range) * (height - padding * 2),
    value,
    label: labels[index] || `${index + 1}`,
  }))
}

function buildLinePointsFromBounds(
  values: number[],
  width: number,
  height: number,
  labels: string[],
  minValue: number,
  maxValue: number,
  paddingX = 6,
  paddingY = 6,
): LinePoint[] {
  if (!values.length) {
    return []
  }
  const safeMin = Number.isFinite(minValue) ? minValue : 0
  const safeMax = Number.isFinite(maxValue) ? maxValue : safeMin + 1
  const range = Math.max(1e-6, safeMax - safeMin)
  const xStep = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0
  const yMin = paddingY
  const yMax = height - paddingY
  const yRange = Math.max(1e-6, yMax - yMin)
  return values.map((value, index) => {
    const boundedValue = Math.max(safeMin, Math.min(safeMax, Number.isFinite(value) ? value : safeMin))
    const normalized = Math.max(0, Math.min(1, (boundedValue - safeMin) / range))
    const y = yMax - (normalized * yRange)
    return {
      x: paddingX + index * xStep,
      y,
      value: boundedValue,
      label: labels[index] || `${index + 1}`,
    }
  })
}

function monotonePathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ''
  }
  return serializeMonotonePath(points[0], buildMonotonePathSegments(points))
}

function buildMonotonePathSegments(points: Array<{ x: number; y: number }>): MonotonePathSegment[] {
  if (points.length < 2) {
    return []
  }
  if (points.length === 2) {
    return [
      {
        kind: 'line',
        start: points[0],
        end: points[1],
      },
    ]
  }

  const n = points.length
  const slopes: number[] = []
  for (let index = 0; index < n - 1; index += 1) {
    const dx = points[index + 1].x - points[index].x
    slopes.push(dx === 0 ? 0 : (points[index + 1].y - points[index].y) / dx)
  }

  const tangents = new Array<number>(n).fill(0)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let index = 1; index < n - 1; index += 1) {
    const left = slopes[index - 1]
    const right = slopes[index]
    tangents[index] = left * right <= 0 ? 0 : (left + right) / 2
  }

  for (let index = 0; index < n - 1; index += 1) {
    const slope = slopes[index]
    if (Math.abs(slope) < 1e-9) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    const a = tangents[index] / slope
    const b = tangents[index + 1] / slope
    const magnitude = (a * a) + (b * b)
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude)
      tangents[index] = scale * a * slope
      tangents[index + 1] = scale * b * slope
    }
  }

  const segments: MonotonePathSegment[] = []
  for (let index = 0; index < n - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const dx = next.x - current.x
    segments.push({
      kind: 'cubic',
      start: current,
      cp1: {
        x: current.x + (dx / 3),
        y: current.y + ((tangents[index] * dx) / 3),
      },
      cp2: {
        x: next.x - (dx / 3),
        y: next.y - ((tangents[index + 1] * dx) / 3),
      },
      end: next,
    })
  }
  return segments
}

function serializeMonotonePath(
  startPoint: { x: number; y: number },
  segments: MonotonePathSegment[],
): string {
  let d = `M ${startPoint.x} ${startPoint.y}`
  for (const segment of segments) {
    if (segment.kind === 'line') {
      d += ` L ${segment.end.x} ${segment.end.y}`
      continue
    }
    d += ` C ${segment.cp1.x} ${segment.cp1.y}, ${segment.cp2.x} ${segment.cp2.y}, ${segment.end.x} ${segment.end.y}`
  }
  return d
}

type TotalCitationsMeanRelation = 'above' | 'below' | 'at'

type TotalCitationsBar = {
  key: string
  axisLabel: string
  axisSubLabel?: string
  value: number
  isYtd: boolean
  relation: TotalCitationsMeanRelation
}

type TotalCitationsChartModel = {
  bars: TotalCitationsBar[]
  meanValue: number | null
}

const TOTAL_CITATIONS_MEAN_TOLERANCE = 0.025

function relationVsMean(value: number, meanValue: number | null): TotalCitationsMeanRelation {
  if (meanValue === null || meanValue <= 0) {
    return 'at'
  }
  const tolerance = meanValue * TOTAL_CITATIONS_MEAN_TOLERANCE
  if (value > meanValue + tolerance) {
    return 'above'
  }
  if (value < meanValue - tolerance) {
    return 'below'
  }
  return 'at'
}

function totalCitationsBarToneClass(bar: TotalCitationsBar): string {
  if (bar.isYtd) {
    return HOUSE_CHART_BAR_CURRENT_CLASS
  }
  if (bar.relation === 'above') {
    return HOUSE_CHART_BAR_POSITIVE_CLASS
  }
  if (bar.relation === 'below') {
    return HOUSE_CHART_BAR_WARNING_CLASS
  }
  return HOUSE_CHART_BAR_NEUTRAL_CLASS
}

function buildTotalCitationsChartModel(tile: PublicationMetricTilePayload): TotalCitationsChartModel {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const yearsRaw = toNumberArray(chartData.years).map((item) => Math.round(item))
  const valuesRaw = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const pairCount = Math.min(yearsRaw.length, valuesRaw.length)
  const yearlyPairs = Array.from({ length: pairCount }, (_, index) => ({
    year: yearsRaw[index],
    value: valuesRaw[index],
  }))
  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const historicalYearPairs = yearlyPairs.filter((item) => item.year !== projectedYear)
  const historicalValues = historicalYearPairs.map((item) => item.value)
  const meanValueRaw = Number(chartData.mean_value)
  const meanYearValue = Number.isFinite(meanValueRaw) && meanValueRaw > 0
    ? meanValueRaw
    : historicalValues.length
      ? historicalValues.reduce((sum, item) => sum + item, 0) / historicalValues.length
      : null
  const currentYearFallback = yearlyPairs.find((item) => item.year === projectedYear)?.value ?? 0
  const currentYearYtd = Number.isFinite(currentYearYtdRaw)
    ? Math.max(0, currentYearYtdRaw)
    : currentYearFallback
  if (!historicalYearPairs.length && currentYearYtd <= 0) {
    return { bars: [], meanValue: meanYearValue }
  }
  const bars: TotalCitationsBar[] = [
    ...historicalYearPairs.map((item) => {
      const relation = relationVsMean(item.value, meanYearValue)
      return {
        key: `year-${item.year}`,
        axisLabel: String(item.year).slice(-2),
        value: item.value,
        isYtd: false,
        relation,
      }
    }),
    {
      key: `year-${projectedYear}-ytd`,
      axisLabel: String(projectedYear).slice(-2),
      value: currentYearYtd,
      isYtd: true,
      relation: relationVsMean(currentYearYtd, meanYearValue),
    },
  ]
  return {
    bars,
    meanValue: meanYearValue,
  }
}

function TotalCitationsModeChart({
  tile,
  chartTitle,
  chartTitleClassName,
}: {
  tile: PublicationMetricTilePayload
  chartTitle?: string
  chartTitleClassName?: string
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const model = useMemo(() => buildTotalCitationsChartModel(tile), [tile])
  const animationKey = useMemo(
    () => `year:${model.bars.map((bar) => `${bar.key}-${bar.value}`).join('|')}:${model.meanValue ?? 'none'}`,
    [model.bars, model.meanValue],
  )
  const hasBars = model.bars.length > 0
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars)
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>No citation data</div>
  }

  const maxValue = Math.max(
    1,
    ...model.bars.map((bar) => Math.max(0, bar.value)),
    model.meanValue !== null ? Math.max(0, model.meanValue) : 0,
  )
  const scaledMax = maxValue * 1.18
  const meanLinePercent = model.meanValue !== null
    ? Math.max(0, Math.min(100, (Math.max(0, model.meanValue) / scaledMax) * 100))
    : null
  const axisLayout = buildChartAxisLayout({
    axisLabels: model.bars.map((bar) => bar.axisLabel),
    axisSubLabels: model.bars.map((bar) => bar.axisSubLabel || null),
    dense: model.bars.length >= 6,
    maxLabelLines: 2,
    maxSubLabelLines: 2,
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {chartTitle ? (
        <p className={cn(chartTitleClassName || HOUSE_CHART_AXIS_TITLE_CLASS, 'mb-0.5')}>
          {chartTitle}
        </p>
      ) : null}
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div
          className="absolute inset-x-2 top-4"
          style={{ bottom: `${axisLayout.plotBottomRem}rem` }}
        >
          {[50].map((pct) => (
            <div
              key={`grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          {meanLinePercent !== null ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0',
                HOUSE_CHART_GRID_DASHED_CLASS,
                HOUSE_TOGGLE_CHART_MORPH_CLASS,
              )}
              style={{
                bottom: `${meanLinePercent}%`,
                opacity: barsExpanded ? 1 : 0,
                transitionDuration: barTransitionDuration,
              }}
              aria-hidden="true"
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-1">
            {model.bars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      totalCitationsBarToneClass(bar),
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: '0ms',
                      transitionDuration: 'var(--motion-duration-chart-toggle)',
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-2 grid grid-flow-col auto-cols-fr items-start gap-1"
          style={{ bottom: `${axisLayout.axisBottomRem}rem`, minHeight: `${axisLayout.axisMinHeightRem}rem` }}
        >
          {model.bars.map((bar) => (
            <div key={`${bar.key}-axis`} className="text-center leading-none">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 leading-tight')}>{bar.axisLabel}</p>
              {bar.axisSubLabel ? (
                <p className={cn(HOUSE_CHART_AXIS_SUBTEXT_CLASS, 'break-words px-0.5')}>
                  {bar.axisSubLabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TotalCitationsTile({
  tile,
  onOpen,
  shouldIgnoreTileOpen,
}: {
  tile: PublicationMetricTilePayload
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
}) {
  const primaryValue = tile.value_display || '\u2014'

  return (
    <div
      role="button"
      tabIndex={0}
      data-metric-key={tile.key}
      onClick={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        dashboardTileStyles.tileShellPublications,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'w-full px-3 py-2.5',
      )}
    >
      <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
        <div className="flex min-h-0 flex-col">
          <p
            className={HOUSE_HEADING_H2_CLASS}
            data-testid={`metric-label-${tile.key}`}
          >
            CITATIONS
          </p>
          <p
            className="mt-2.5 text-display font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          <p className={HOUSE_TILE_SUBTITLE_CLASS}>Lifetime citations</p>
        </div>

        <div className={cn('min-h-0 border-l pl-3', HOUSE_DIVIDER_BORDER_SOFT_CLASS)}>
          <TotalCitationsModeChart
            tile={tile}
            chartTitle="Citations per year (last 5 years)"
            chartTitleClassName={HOUSE_METRIC_RIGHT_CHART_TITLE_CLASS}
          />
        </div>
      </div>
    </div>
  )
}

function StructuredMetricTile({
  tile,
  primaryValue,
  badge,
  pinBadgeBottom = true,
  centerBadge = false,
  badgePlacement = 'inline',
  subtitle,
  detail,
  visual,
  contentGridClassName,
  rightPaneClassName,
  onOpen,
  shouldIgnoreTileOpen,
}: {
  tile: PublicationMetricTilePayload
  primaryValue: ReactNode
  badge?: ReactNode
  pinBadgeBottom?: boolean
  centerBadge?: boolean
  badgePlacement?: 'inline' | 'topRight' | 'bottomRight' | 'bottomCenter' | 'leftChart'
  subtitle?: ReactNode
  detail?: ReactNode
  visual: ReactNode
  contentGridClassName?: string
  rightPaneClassName?: string
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
}) {
  const isTopRightBadge = badgePlacement === 'topRight'
  const isLeftChartBadge = badgePlacement === 'leftChart'
  const isBottomRightBadge = badgePlacement === 'bottomRight'
  const isBottomCenterBadge = badgePlacement === 'bottomCenter'
  const isFloatingBadge = isTopRightBadge || isBottomRightBadge || isBottomCenterBadge || isLeftChartBadge
  const hasSubtitle = !(
    subtitle === undefined
    || subtitle === null
    || (typeof subtitle === 'string' && subtitle.trim().length === 0)
  )
  return (
    <div
      role="button"
      tabIndex={0}
      data-metric-key={tile.key}
      onClick={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        dashboardTileStyles.tileShellPublications,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'w-full px-3 py-2.5',
      )}
    >
      <div className={cn('grid h-full min-h-[9.5rem] gap-3', contentGridClassName || 'grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)]')}>
        <div className="flex min-h-0 flex-col">
          <p
            className={HOUSE_HEADING_H2_CLASS}
            data-testid={`metric-label-${tile.key}`}
          >
            {tile.key === 'total_citations'
              ? 'CITATIONS'
              : tile.key === 'impact_concentration'
              ? (
                <>
                  IMPACT
                  <br />
                  CONCENTRATION
                </>
              )
              : String(tile.label || '').toUpperCase()}
          </p>
          <p
            className="mt-2.5 text-display font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          {hasSubtitle ? <p className={HOUSE_TILE_SUBTITLE_CLASS}>{subtitle}</p> : null}
          {typeof detail === 'string'
            ? <p className={HOUSE_TILE_DETAIL_CLASS}>{detail}</p>
            : detail
              ? <div className="pt-0.5">{detail}</div>
              : null}
          {badge && !isFloatingBadge ? (
            <div className={cn(pinBadgeBottom ? 'mt-auto pt-1' : 'pt-1', centerBadge && 'flex w-full justify-center')}>
              {badge}
            </div>
          ) : null}
        </div>
        <div className={cn(
          'flex h-full min-h-0 border-l',
          HOUSE_DIVIDER_BORDER_SOFT_CLASS,
          isLeftChartBadge
            ? 'items-stretch pl-3'
            : isFloatingBadge
              ? 'relative items-stretch pl-3'
            : 'items-center pl-3',
          rightPaneClassName,
        )}>
          {badge && isTopRightBadge ? (
            <div className={HOUSE_METRIC_TILE_PILL_CONTAINER_CLASS}>
              <div className="pointer-events-auto">{badge}</div>
            </div>
          ) : null}
          {badge && isBottomRightBadge ? (
            <div className={HOUSE_METRIC_TILE_PILL_CONTAINER_BOTTOM_CLASS}>
              <div className="pointer-events-auto">{badge}</div>
            </div>
          ) : null}
          {badge && isBottomCenterBadge ? (
            <div className={HOUSE_METRIC_TILE_PILL_CONTAINER_BOTTOM_CENTER_CLASS}>
              <div className="pointer-events-auto">{badge}</div>
            </div>
          ) : null}
          {badge && isLeftChartBadge ? (
            <div
              className={cn(
                HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_CLASS,
                HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_COLUMNS_CLASS,
                HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_GAP_CLASS,
              )}
            >
              <div className={HOUSE_FIELD_PERCENTILE_LEFT_CHART_SLOT_CLASS}>
                <div className="pointer-events-auto">{badge}</div>
              </div>
              <div className={HOUSE_FIELD_PERCENTILE_LEFT_CHART_PANEL_CLASS}>
                {visual}
              </div>
            </div>
          ) : visual}
        </div>
      </div>
    </div>
  )
}

function HIndexYearChart({
  tile,
  series: overrideSeries,
  showCaption = false,
  animate = true,
  collapse = false,
}: {
  tile: PublicationMetricTilePayload
  series?: Array<{ x: number; label: string; value: number }>
  showCaption?: boolean
  animate?: boolean
  collapse?: boolean
}) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const fallbackYears = toNumberArray(chartData.years).map((item) => Math.round(item))
  const fallbackValues = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const series = useMemo<Array<{ x: number; label: string; value: number }>>(
    () => {
      if (overrideSeries && overrideSeries.length > 0) {
        return overrideSeries
      }
      if (fallbackYears.length > 0 && fallbackYears.length === fallbackValues.length) {
        return fallbackYears.map((year, index) => ({
          x: year,
          label: String(year),
          value: fallbackValues[index],
        }))
      }
      return []
    },
    [fallbackValues, fallbackYears, overrideSeries],
  )
  const animationKey = series.map((point) => `${point.x}-${point.value}`).join('|')
  const hasSeries = series.length > 0
  const lineExpanded = useUnifiedToggleBarAnimation(`${animationKey}|hindex-year`, hasSeries)
  const isEntryCycle = useIsFirstChartEntry(`${animationKey}|hindex-year`, hasSeries)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const rawTargetValues = useMemo(
    () => series.map((point) => Math.max(0, point.value)),
    [series],
  )
  const targetValues = useMemo(
    () => (collapse ? rawTargetValues.map(() => 0) : rawTargetValues),
    [collapse, rawTargetValues],
  )
  const animatedValues = useEasedSeries(
    targetValues,
    `${animationKey}|values|${collapse ? 'collapse' : 'expand'}`,
    animate && hasSeries,
    axisDurationMs,
  )
  const targetAxisScale = useMemo(
    () => buildNiceAxis(rawTargetValues.length ? Math.max(1, ...rawTargetValues) : 1),
    [rawTargetValues],
  )
  const animatedMax = useEasedValue(
    Math.max(1, targetAxisScale.axisMax),
    `${animationKey}|max`,
    animate && hasSeries,
    axisDurationMs,
  )

  if (!hasSeries) {
    return <div className={dashboardTileStyles.emptyChart}>No h-index timeline</div>
  }

  const scaledMax = Math.max(1, animatedMax)
  const minX = Math.min(...series.map((point) => point.x))
  const maxX = Math.max(...series.map((point) => point.x))
  const xRange = Math.max(1e-6, maxX - minX)
  const tickStartYear = Math.ceil(minX)
  const tickEndYear = Math.floor(maxX)
  const yearTicks = Array.from(
    { length: Math.max(1, tickEndYear - tickStartYear + 1) },
    (_, index) => tickStartYear + index,
  )
  const tickStep = yearTicks.length <= 5 ? 1 : Math.max(2, Math.ceil(yearTicks.length / 4))
  const axisLabels = yearTicks.map((year, index) => (
    index === 0 || index === yearTicks.length - 1 || index % tickStep === 0 ? String(year) : ''
  ))
  const axisLayout = buildChartAxisLayout({
    axisLabels,
    axisSubLabels: yearTicks.map(() => null),
    showXAxisName: true,
    xAxisName: 'Year',
    dense: yearTicks.length >= 7,
    maxLabelLines: 1,
    maxSubLabelLines: 1,
    maxAxisNameLines: 1,
  })
  const yAxisTickValues = targetAxisScale.ticks
  const yAxisTickRatios = yAxisTickValues.map((tick) => Math.max(0, Math.min(1, tick / scaledMax)))
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(yAxisTickValues, true, 0.85)
  const chartLeftInset = `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${axisLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${axisLayout.axisBottomRem}rem`,
    minHeight: `${axisLayout.axisMinHeightRem}rem`,
  }
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${axisLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const linePoints = series.map((point, index) => {
    const normalizedX = (point.x - minX) / xRange
    const boundedValue = Math.max(0, Math.min(scaledMax, animatedValues[index] ?? point.value))
    const normalizedY = scaledMax <= 0 ? 0 : boundedValue / scaledMax
    return {
      x: normalizedX * 100,
      y: 100 - (normalizedY * 100),
      value: boundedValue,
      label: point.label,
    }
  })
  const linePath = (() => {
    if (!linePoints.length) {
      return ''
    }
    let path = `M ${linePoints[0].x} ${linePoints[0].y}`
    for (let index = 1; index < linePoints.length; index += 1) {
      const previous = linePoints[index - 1]
      const current = linePoints[index]
      path += ` L ${current.x} ${previous.y} L ${current.x} ${current.y}`
    }
    return path
  })()
  const verticalGridPercents = yearTicks
    .map((year, index) => (axisLabels[index] ? ((year - minX) / xRange) * 100 : null))
    .filter((value): value is number => value !== null)
    .filter((value, index, items) => index === 0 || Math.abs(value - items[index - 1]) > 0.5)

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_SERIES_BY_SLOT_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
          'house-publications-trend-chart-frame-borderless',
          'h-full',
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div className="absolute overflow-visible" style={plotAreaStyle}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              className={cn('absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.78)' }}
            />
            <div
              className={cn('absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.58)' }}
            />
            <div
              className={cn('absolute inset-x-0 bottom-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.9)' }}
            />
            {yAxisTickRatios
              .filter((_, index) => index > 0 && index < yAxisTickRatios.length - 1)
              .map((ratio, index) => (
                <div
                  key={`h-index-grid-y-${index}`}
                  className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                  style={{ bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`, borderTop: '1px solid hsl(var(--stroke-soft) / 0.72)' }}
                />
              ))}
            {yAxisTickRatios.length > 1 ? (
              <div
                className={cn('absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.72)' }}
              />
            ) : null}
            {verticalGridPercents.map((leftPct, index) => (
              <div
                key={`h-index-grid-x-${index}`}
                className={cn('absolute inset-y-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ left: `${leftPct}%`, borderLeft: '1px solid hsl(var(--stroke-soft) / 0.58)' }}
              />
            ))}
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-hidden">
            <path
              d={linePath}
              fill="none"
              stroke="hsl(var(--tone-accent-600) / 0.96)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
              vectorEffect="non-scaling-stroke"
              style={{
                opacity: lineExpanded ? 1 : 0,
                transitionDuration: tileMotionEntryDuration(0, isEntryCycle && lineExpanded),
              }}
            />
          </svg>

          <TooltipProvider delayDuration={120}>
            <div className="absolute inset-0">
              {series.map((point, index) => {
                const linePoint = linePoints[index]
                const yPct = linePoint?.y ?? 0
                if (!linePoint) {
                  return null
                }
                const pointLabel = formatHIndexTrajectoryPointLabel(point.label)
                return (
                  <Tooltip key={`h-index-tooltip-${point.x}-${point.value}-${index}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="absolute focus-visible:outline-none"
                        style={{
                          left: `calc(${linePoint.x}% - 0.8rem)`,
                          top: `calc(${yPct}% - 0.8rem)`,
                          width: '1.6rem',
                          height: '1.6rem',
                        }}
                        aria-label={`${pointLabel}: h-index ${formatInt(point.value)}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="center"
                      sideOffset={4}
                      className="house-approved-tooltip max-w-[14rem] whitespace-normal px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{pointLabel}</p>
                        <p>{`H-index: ${formatInt(point.value)}`}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>
        </div>

        <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
          {yAxisTickValues.map((tick, index) => {
            const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
            return (
              <p
                key={`h-index-y-axis-${tick}-${index}`}
                className={cn('absolute right-0 whitespace-nowrap tabular-nums text-[0.68rem] leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                style={{ bottom: `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM}rem)` }}
              >
                {formatInt(tick)}
              </p>
            )
          })}
          <p
            className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
            style={{ left: '36%' }}
          >
            H-index
          </p>
        </div>

        <div
          className={cn('pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1', HOUSE_TOGGLE_CHART_LABEL_CLASS)}
          style={xAxisTicksStyle}
        >
          {axisLabels.map((label, index) => (
            <div key={`h-index-axis-${yearTicks[index] ?? index}`} className="text-center leading-none">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 leading-tight')}>{label}</p>
            </div>
          ))}
        </div>
      </div>
      {showCaption ? <p className={dashboardTileStyles.tileMicroLabel}>h-index by year.</p> : null}
    </div>
  )
}

export function PublicationsPerYearChart({
  tile,
  animate = true,
  showCaption = false,
  showAxes = false,
  fullYearLabels = false,
  xAxisLabel = 'Publication year',
  yAxisLabel = 'Publications',
  enableWindowToggle = false,
  subtleGrid = false,
  showPeriodHint = true,
  showCurrentPeriodSemantic = true,
  useCompletedMonthWindowLabels = false,
  autoScaleByWindow = false,
  showMeanLine = false,
  showMeanValueLabel = false,
  meanValueOneDecimalIn1y = false,
  roundMeanValueInLongWindows = false,
  longWindowLineXAxisTitleTranslateRem = 0,
  chartTitle,
  chartTitleClassName,
  activeWindowMode,
  onWindowModeChange,
  showWindowToggle = true,
  visualMode,
  onVisualModeChange,
  showVisualModeToggle = false,
}: {
  tile: PublicationMetricTilePayload
  animate?: boolean
  showCaption?: boolean
  showAxes?: boolean
  fullYearLabels?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  enableWindowToggle?: boolean
  subtleGrid?: boolean
  showPeriodHint?: boolean
  showCurrentPeriodSemantic?: boolean
  useCompletedMonthWindowLabels?: boolean
  autoScaleByWindow?: boolean
  showMeanLine?: boolean
  showMeanValueLabel?: boolean
  meanValueOneDecimalIn1y?: boolean
  roundMeanValueInLongWindows?: boolean
  longWindowLineXAxisTitleTranslateRem?: number
  chartTitle?: string
  chartTitleClassName?: string
  activeWindowMode?: PublicationsWindowMode
  onWindowModeChange?: (mode: PublicationsWindowMode) => void
  showWindowToggle?: boolean
  visualMode?: PublicationTrendsVisualMode
  onVisualModeChange?: (mode: PublicationTrendsVisualMode) => void
  showVisualModeToggle?: boolean
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('all')
  const [localVisualMode, setLocalVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const effectiveWindowMode: PublicationsWindowMode = enableWindowToggle
    ? (activeWindowMode ?? windowMode)
    : 'all'
  const effectiveVisualMode: PublicationTrendsVisualMode = visualMode ?? localVisualMode
  const setEffectiveVisualMode = (mode: PublicationTrendsVisualMode) => {
    if (visualMode === undefined) {
      setLocalVisualMode(mode)
    }
    if (onVisualModeChange) {
      onVisualModeChange(mode)
    }
  }
  useEffect(() => {
    if (!enableWindowToggle) {
      return
    }
    if (activeWindowMode !== undefined) {
      setWindowMode(activeWindowMode)
      return
    }
    setWindowMode('all')
  }, [tile.key, enableWindowToggle, activeWindowMode])
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
  const meanValueRaw = Number(chartData.mean_value)
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const historyBars = useMemo(() => {
    const validYears = hasValidSeries ? years : []
    const validValues = hasValidSeries ? values : []
    const baseBars: Array<{
      year: number
      value: number
      current: boolean
    }> = validYears.map((year, index) => {
      const value = validValues[index]
      return { year, value, current: false }
    })
    const existingCurrentBar = baseBars.find((item) => item.year === projectedYear)
    const nextHistoryBars = baseBars.filter((item) => item.year !== projectedYear)
    const currentYearValue = Math.max(
      0,
      Number.isFinite(currentYearYtdRaw)
        ? currentYearYtdRaw
        : existingCurrentBar
          ? existingCurrentBar.value
          : 0,
    )
    if (hasValidSeries) {
      nextHistoryBars.push({
        year: projectedYear,
        value: currentYearValue,
        current: true,
      })
    }
    return nextHistoryBars
  }, [currentYearYtdRaw, hasValidSeries, projectedYear, values, years])

  const isCompactTileMode = !showAxes && !enableWindowToggle

  type PublicationChartBar = {
    key: string
    value: number
    current: boolean
    axisLabel: string
    axisSubLabel?: string
    monthStartMs?: number
  }

  type PublicationYearWindowBars = {
    bars: PublicationChartBar[]
    bucketSize: number
    rangeLabel: string | null
  }

  const compactTileBars = useMemo<PublicationChartBar[]>(() => (
    historyBars
      .slice(-6)
      .map((bar) => ({
        key: `compact-${bar.year}`,
        value: Math.max(0, bar.value),
        current: bar.current,
        axisLabel: String(bar.year).slice(-2),
        axisSubLabel: undefined,
        monthStartMs: undefined,
      }))
  ), [historyBars])

  const groupedYearBarsByWindow = useMemo(() => {
    const build = (
      mode: Exclude<PublicationsWindowMode, '1y'>,
      windowYears: number | null,
      useCompactRangeLabels: boolean,
    ): PublicationYearWindowBars => {
      const sourceBars = windowYears === null
        ? historyBars
        : historyBars.slice(-windowYears)
      if (!sourceBars.length) {
        return { bars: [], bucketSize: 1, rangeLabel: null }
      }
      const bucketSize = selectPublicationBucketSize(sourceBars.length)
      const grouped: PublicationChartBar[] = []
      for (let index = 0; index < sourceBars.length; index += bucketSize) {
        const chunk = sourceBars.slice(index, index + bucketSize)
        if (!chunk.length) {
          continue
        }
        const startYear = chunk[0].year
        const endYear = chunk[chunk.length - 1].year
        const isSingleCurrentYear = showCurrentPeriodSemantic && chunk.some((item) => item.current) && startYear === endYear
        grouped.push({
          key: `${startYear}-${endYear}`,
          value: chunk.reduce((sum, item) => sum + Math.max(0, item.value), 0),
          current: isSingleCurrentYear,
          axisLabel: useCompactRangeLabels
            ? startYear === endYear
              ? shortYearLabel(startYear)
              : `${shortYearLabel(startYear)}-${shortYearLabel(endYear)}`
            : formatPublicationYearLabel(startYear, endYear, fullYearLabels),
          axisSubLabel: undefined,
        })
      }
      let visibleBars = grouped.slice(-MAX_PUBLICATION_CHART_BARS)
      if (useCompletedMonthWindowLabels && mode !== 'all' && windowYears !== null && visibleBars.length === windowYears) {
        const trailingMonths = buildTrailingMonthStarts(windowYears * 12, true)
        const rollingLabels = Array.from({ length: windowYears }, (_, index) => {
          const start = trailingMonths[index * 12]
          const end = trailingMonths[(index * 12) + 11]
          if (!(start instanceof Date) || !(end instanceof Date)) {
            return {
              label: visibleBars[index]?.axisLabel || '',
              subLabel: visibleBars[index]?.axisSubLabel,
            }
          }
          const label = `${MONTH_SHORT[start.getUTCMonth()]}-${MONTH_SHORT[end.getUTCMonth()]}`
          const startYear = shortYearLabel(start.getUTCFullYear())
          const endYear = shortYearLabel(end.getUTCFullYear())
          return {
            label,
            subLabel: startYear === endYear ? startYear : `${startYear}-${endYear}`,
          }
        })
        visibleBars = visibleBars.map((bar, index) => ({
          ...bar,
          axisLabel: rollingLabels[index]?.label || bar.axisLabel,
          axisSubLabel: rollingLabels[index]?.subLabel || bar.axisSubLabel,
        }))
      }
      const firstBar = visibleBars[0] || null
      const lastBar = visibleBars[visibleBars.length - 1] || null
      const rangeLabel = firstBar && lastBar
        ? (() => {
          const startYear = Number(firstBar.key.split('-')[0] || firstBar.axisLabel)
          const endYear = Number(lastBar.key.split('-').slice(-1)[0] || lastBar.axisLabel)
          const suffix = ''
          if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
            if (startYear === endYear) {
              return `${startYear}${suffix}`
            }
            return `${startYear}-${endYear}${suffix}`
          }
          return null
        })()
        : null
      return { bars: visibleBars, bucketSize, rangeLabel }
    }
    return {
      '3y': build('3y', 3, false),
      '5y': build('5y', 5, false),
      all: build('all', null, historyBars.length > MAX_PUBLICATION_CHART_BARS),
    } as const
  }, [fullYearLabels, historyBars, showCurrentPeriodSemantic, useCompletedMonthWindowLabels])

  const usingMonthlyBars = effectiveWindowMode === '1y'
  const groupedMonthBars = useMemo(() => {
    const sourceValues = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
    const sourceLabels = toStringArray(chartData.month_labels_12m)
    const currentMonthIndex = new Date().getUTCMonth()
    const sourceLastMonthIndex = sourceLabels.length ? parseMonthIndex(sourceLabels[sourceLabels.length - 1]) : null
    const sourceLikelyIncludesCurrentMonth = sourceLastMonthIndex !== null && sourceLastMonthIndex === currentMonthIndex
    const sourceValuesWindow = sourceValues.length >= 13 && sourceLikelyIncludesCurrentMonth
      ? sourceValues.slice(-13, -1)
      : sourceValues.length >= 12
        ? sourceValues.slice(-12)
        : sourceValues
    const values12 = sourceValuesWindow.length >= 12
      ? sourceValuesWindow.slice(-12)
      : sourceValues.length > 0
        ? [...Array.from({ length: 12 - sourceValuesWindow.length }, () => 0), ...sourceValuesWindow]
        : Array.from({ length: 12 }, () => 0)
    const monthLabels12 = fallbackMonthLabels(12, true)
    const yearShortLabels12 = fallbackMonthYearShortLabels(12, true)
    const monthStarts12 = buildTrailingMonthStarts(12, true)
    const bars: PublicationChartBar[] = values12.map((value, index) => ({
      key: `month-${yearShortLabels12[index] || '00'}-${monthLabels12[index] || `M${index + 1}`}-${index}`,
      value: Math.max(0, value),
      current: false,
      axisLabel: monthLabels12[index] || `M${index + 1}`,
      axisSubLabel: yearShortLabels12[index] || undefined,
      monthStartMs: monthStarts12[index]?.getTime(),
    }))
    return {
      bars,
      bucketSize: 1,
      rangeLabel: `${monthLabels12[0] || 'Start'} ${yearShortLabels12[0] || ''}-${monthLabels12[monthLabels12.length - 1] || 'End'} ${yearShortLabels12[yearShortLabels12.length - 1] || ''}`.trim(),
    }
  }, [chartData.month_labels_12m, chartData.monthly_values_12m])

  const lifetimeMonthlyBars = useMemo(() => {
    const sourceValues = toNumberArray(chartData.monthly_values_lifetime).map((item) => Math.max(0, item))
    const sourceLabels = toStringArray(chartData.month_labels_lifetime)
    if (!sourceValues.length) {
      return {
        bars: [] as PublicationChartBar[],
        bucketSize: 1,
        rangeLabel: null as string | null,
      }
    }
    const fallbackMonthStarts = buildTrailingMonthStarts(sourceValues.length, true)
    const bars: PublicationChartBar[] = sourceValues.map((value, index) => {
      const parsed = parseIsoMonthStart(sourceLabels[index] || '')
      const monthStart = parsed || fallbackMonthStarts[index] || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
      const monthLabel = MONTH_SHORT[monthStart.getUTCMonth()] || `M${index + 1}`
      const yearShort = shortYearLabel(monthStart.getUTCFullYear())
      return {
        key: `lmonth-${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${index}`,
        value: Math.max(0, value),
        current: false,
        axisLabel: monthLabel,
        axisSubLabel: yearShort,
        monthStartMs: monthStart.getTime(),
      }
    })
    const firstMs = bars[0]?.monthStartMs
    const lastMs = bars[bars.length - 1]?.monthStartMs
    const firstDate = Number.isFinite(firstMs) ? new Date(firstMs as number) : null
    const lastDate = Number.isFinite(lastMs) ? new Date(lastMs as number) : null
    const rangeLabel = firstDate && lastDate
      ? `${MONTH_SHORT[firstDate.getUTCMonth()]} ${shortYearLabel(firstDate.getUTCFullYear())}-${MONTH_SHORT[lastDate.getUTCMonth()]} ${shortYearLabel(lastDate.getUTCFullYear())}`
      : null
    return {
      bars,
      bucketSize: 1,
      rangeLabel,
    }
  }, [chartData.month_labels_lifetime, chartData.monthly_values_lifetime])

  const buildRollingYearBarsFromMonthly = useCallback((mode: Exclude<PublicationsWindowMode, '1y'>): PublicationYearWindowBars | null => {
    if (!lifetimeMonthlyBars.bars.length) {
      return null
    }
    const monthCount = mode === '3y'
      ? 36
      : mode === '5y'
        ? 60
        : lifetimeMonthlyBars.bars.length
    const sourceBars = lifetimeMonthlyBars.bars.slice(-monthCount)
    if (!sourceBars.length) {
      return null
    }

    const yearlyBars: PublicationChartBar[] = []
    for (let index = 0; index < sourceBars.length; index += 12) {
      const chunk = sourceBars.slice(index, index + 12)
      if (!chunk.length) {
        continue
      }
      const firstMs = chunk[0]?.monthStartMs
      const lastMs = chunk[chunk.length - 1]?.monthStartMs
      const firstDate = Number.isFinite(firstMs) ? new Date(firstMs as number) : null
      const lastDate = Number.isFinite(lastMs) ? new Date(lastMs as number) : null
      yearlyBars.push({
        key: firstDate && lastDate
          ? `${firstDate.getUTCFullYear()}-${lastDate.getUTCFullYear()}-${index}`
          : `${mode}-${index}`,
        value: chunk.reduce((sum, item) => sum + Math.max(0, item.value), 0),
        current: false,
        axisLabel: firstDate && lastDate
          ? `${MONTH_SHORT[firstDate.getUTCMonth()]}-${MONTH_SHORT[lastDate.getUTCMonth()]}`
          : String(index + 1),
        axisSubLabel: firstDate && lastDate
          ? (firstDate.getUTCFullYear() === lastDate.getUTCFullYear()
            ? shortYearLabel(firstDate.getUTCFullYear())
            : `${shortYearLabel(firstDate.getUTCFullYear())}-${shortYearLabel(lastDate.getUTCFullYear())}`)
          : undefined,
        monthStartMs: firstMs ?? undefined,
      })
    }

    const bucketSize = mode === 'all'
      ? selectPublicationBucketSize(yearlyBars.length)
      : 1
    const groupedBars: PublicationChartBar[] = []
    for (let index = 0; index < yearlyBars.length; index += bucketSize) {
      const chunk = yearlyBars.slice(index, index + bucketSize)
      if (!chunk.length) {
        continue
      }
      const firstBar = chunk[0]
      const lastBar = chunk[chunk.length - 1]
      groupedBars.push({
        key: `${firstBar.key}|${lastBar.key}`,
        value: chunk.reduce((sum, item) => sum + Math.max(0, item.value), 0),
        current: false,
        axisLabel: bucketSize === 1
          ? firstBar.axisLabel
          : `${firstBar.axisLabel}-${lastBar.axisLabel}`,
        axisSubLabel: bucketSize === 1
          ? firstBar.axisSubLabel
          : `${firstBar.axisSubLabel || ''}-${lastBar.axisSubLabel || ''}`.replace(/^-|-$/g, ''),
        monthStartMs: firstBar.monthStartMs,
      })
    }

    const firstMs = sourceBars[0]?.monthStartMs
    const lastMs = sourceBars[sourceBars.length - 1]?.monthStartMs
    const firstDate = Number.isFinite(firstMs) ? new Date(firstMs as number) : null
    const lastDate = Number.isFinite(lastMs) ? new Date(lastMs as number) : null
    const rangeLabel = firstDate && lastDate
      ? `${MONTH_SHORT[firstDate.getUTCMonth()]} ${shortYearLabel(firstDate.getUTCFullYear())}-${MONTH_SHORT[lastDate.getUTCMonth()]} ${shortYearLabel(lastDate.getUTCFullYear())}`
      : null

    return {
      bars: groupedBars.slice(-MAX_PUBLICATION_CHART_BARS),
      bucketSize: bucketSize * 12,
      rangeLabel,
    }
  }, [lifetimeMonthlyBars.bars])

  const publicationEventDatesMs = useMemo(() => (
    toStringArray(chartData.publication_event_dates)
      .map((value) => parseIsoPublicationDate(value)?.getTime())
      .filter((value): value is number => Number.isFinite(value))
      .sort((left, right) => left - right)
  ), [chartData.publication_event_dates])

  const hasLifetimeMonthlyLineSeries = publicationEventDatesMs.length === 0 && lifetimeMonthlyBars.bars.length > 0

  const buildLifetimeMonthlyLineWindowBars = useCallback((mode: PublicationsWindowMode): PublicationYearWindowBars | null => {
    if (!hasLifetimeMonthlyLineSeries) {
      return null
    }
    const monthCount = mode === '1y'
      ? 12
      : mode === '3y'
        ? 36
        : mode === '5y'
          ? 60
          : lifetimeMonthlyBars.bars.length
    const sourceBars = lifetimeMonthlyBars.bars.slice(-monthCount)
    if (!sourceBars.length) {
      return null
    }
    const firstMs = sourceBars[0]?.monthStartMs
    const lastMs = sourceBars[sourceBars.length - 1]?.monthStartMs
    const firstDate = Number.isFinite(firstMs) ? new Date(firstMs as number) : null
    const lastDate = Number.isFinite(lastMs) ? new Date(lastMs as number) : null
    const rangeLabel = firstDate && lastDate
      ? `${MONTH_SHORT[firstDate.getUTCMonth()]} ${shortYearLabel(firstDate.getUTCFullYear())}-${MONTH_SHORT[lastDate.getUTCMonth()]} ${shortYearLabel(lastDate.getUTCFullYear())}`
      : null
    return {
      bars: sourceBars,
      bucketSize: 1,
      rangeLabel,
    }
  }, [hasLifetimeMonthlyLineSeries, lifetimeMonthlyBars.bars])

  const resolveBarsForWindowMode = (mode: PublicationsWindowMode): PublicationYearWindowBars => {
    if (mode === '1y') {
      return {
        bars: groupedMonthBars.bars,
        bucketSize: groupedMonthBars.bucketSize,
        rangeLabel: groupedMonthBars.rangeLabel,
      }
    }
    if (mode === '3y' || mode === '5y' || mode === 'all') {
      const rollingBars = buildRollingYearBarsFromMonthly(mode)
      if (rollingBars) {
        return rollingBars
      }
    }
    return groupedYearBarsByWindow[mode]
  }

  const resolveLineBarsForWindowMode = useCallback((mode: PublicationsWindowMode): PublicationYearWindowBars => {
    const lifetimeMonthlyWindowBars = buildLifetimeMonthlyLineWindowBars(mode)
    if (lifetimeMonthlyWindowBars) {
      return lifetimeMonthlyWindowBars
    }
    if (mode === '1y') {
      const hasMonthlySignal = groupedMonthBars.bars.some((bar) => Math.max(0, bar.value) > 0)
      if (hasMonthlySignal) {
        return {
          bars: groupedMonthBars.bars,
          bucketSize: groupedMonthBars.bucketSize,
          rangeLabel: groupedMonthBars.rangeLabel,
        }
      }
    }
    let sourceBars = historyBars
    if (mode === '3y' || mode === '5y') {
      const totalMonths = mode === '3y' ? 36 : 60
      const trailingMonthStarts = buildTrailingMonthStarts(totalMonths, true)
      const windowStartDate = trailingMonthStarts[0]
      if (windowStartDate) {
        const windowStartYear = windowStartDate.getUTCFullYear()
        sourceBars = historyBars.filter((bar) => bar.year >= windowStartYear)
      } else {
        sourceBars = historyBars.slice(mode === '3y' ? -3 : -5)
      }
    } else if (mode === '1y') {
      sourceBars = historyBars.slice(-1)
    }
    const shouldUseShortYearAxisLabels = mode === 'all' && sourceBars.length >= 10
    const bars: PublicationChartBar[] = sourceBars.map((bar) => ({
      key: `${bar.year}-${bar.year}`,
      value: Math.max(0, bar.value),
      current: Boolean(bar.current),
      axisLabel: shouldUseShortYearAxisLabels ? shortYearLabel(bar.year) : String(bar.year),
      axisSubLabel: undefined,
      monthStartMs: Date.UTC(bar.year, 0, 1),
    }))
    const rangeLabel = sourceBars.length
      ? sourceBars[0].year === sourceBars[sourceBars.length - 1].year
        ? String(sourceBars[0].year)
        : `${sourceBars[0].year}-${sourceBars[sourceBars.length - 1].year}`
      : null
    return {
      bars,
      bucketSize: 1,
      rangeLabel,
    }
  }, [
    groupedMonthBars.bars,
    groupedMonthBars.bucketSize,
    groupedMonthBars.rangeLabel,
    historyBars,
    buildLifetimeMonthlyLineWindowBars,
  ])

  const activeLineWindowBars = isCompactTileMode
    ? { bars: compactTileBars, bucketSize: 1, rangeLabel: null as string | null }
    : resolveLineBarsForWindowMode(effectiveWindowMode)
  const lineUsesMonthlyTimeline = useMemo(() => {
    const bars = activeLineWindowBars.bars
    if (bars.length < 2) {
      return false
    }
    const monthStartMsValues = bars
      .map((bar) => Number(bar.monthStartMs))
      .filter((value): value is number => Number.isFinite(value))
      .sort((left, right) => left - right)
    if (monthStartMsValues.length < 2) {
      return false
    }
    const monthStepSampleCount = Math.min(6, monthStartMsValues.length - 1)
    const maxMonthlyStepMs = 1000 * 60 * 60 * 24 * 45
    for (let index = 1; index <= monthStepSampleCount; index += 1) {
      const deltaMs = monthStartMsValues[index] - monthStartMsValues[index - 1]
      if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > maxMonthlyStepMs) {
        return false
      }
    }
    return true
  }, [activeLineWindowBars.bars])
  const usingMonthlyTimelineForMode = effectiveWindowMode === '1y' || (effectiveVisualMode === 'line' && lineUsesMonthlyTimeline)

  const activeWindowBars = isCompactTileMode
    ? { bars: compactTileBars, bucketSize: 1, rangeLabel: null as string | null }
    : effectiveVisualMode === 'line'
      ? activeLineWindowBars
      : resolveBarsForWindowMode(effectiveWindowMode)

  const activeBars = activeWindowBars.bars
  const activeBucketSize = activeWindowBars.bucketSize
  const meanValue = isCompactTileMode && showMeanLine && Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : effectiveWindowMode === '1y'
      ? activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)
      : activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)
  const meanDisplayValue = useMemo(() => {
    if (isCompactTileMode && showMeanLine && Number.isFinite(meanValueRaw) && meanValueRaw >= 0) {
      return Math.max(0, meanValueRaw)
    }
    if (effectiveWindowMode === '1y') {
      const total = groupedMonthBars.bars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0)
      return total / Math.max(1, groupedMonthBars.bars.length)
    }
    if (effectiveWindowMode === '3y' || effectiveWindowMode === '5y') {
      if (lifetimeMonthlyBars.bars.length > 0) {
        const monthCount = effectiveWindowMode === '3y' ? 36 : 60
        const sourceBars = lifetimeMonthlyBars.bars.slice(-monthCount)
        if (sourceBars.length > 0) {
          const total = sourceBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0)
          const yearSpan = sourceBars.length / 12
          return yearSpan > 0 ? total / yearSpan : total
        }
      }
      return activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)
    }
    if (effectiveWindowMode === 'all') {
      if (lifetimeMonthlyBars.bars.length > 0) {
        const total = lifetimeMonthlyBars.bars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0)
        const yearSpan = lifetimeMonthlyBars.bars.length / 12
        return yearSpan > 0 ? total / yearSpan : total
      }
      const sourceBars = historyBars
      const total = sourceBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0)
      return total / Math.max(1, sourceBars.length)
    }
    return activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)
  }, [
    activeBars,
    effectiveWindowMode,
    groupedMonthBars.bars,
    historyBars,
    isCompactTileMode,
    lifetimeMonthlyBars.bars,
    meanValueRaw,
    showMeanLine,
  ])
  const meanDisplayUnit = effectiveWindowMode === '1y' ? 'month' : 'year'
  const meanDisplay = Number.isFinite(meanDisplayValue)
    ? (() => {
      if (effectiveWindowMode === '1y') {
        if (meanValueOneDecimalIn1y) {
          return (Math.round(meanDisplayValue * 10) / 10).toFixed(1)
        }
        return formatInt(Math.round(meanDisplayValue))
      }
      if (roundMeanValueInLongWindows) {
        return formatInt(Math.round(meanDisplayValue))
      }
      const rounded = Math.round(meanDisplayValue * 10) / 10
      if (Math.abs(rounded - Math.round(rounded)) <= 1e-9) {
        return formatInt(Math.round(rounded))
      }
      return rounded.toFixed(1)
    })()
    : null

  const animationKey = useMemo(
    () => `${effectiveWindowMode}|${activeBucketSize}|${activeBars.map((bar) => `${bar.key}-${bar.value}-${bar.current ? 1 : 0}`).join('|')}`,
    [activeBars, activeBucketSize, effectiveWindowMode],
  )
  const hasBars = effectiveVisualMode === 'line'
    ? activeBars.length > 0
    : hasValidSeries && historyBars.length > 0 && activeBars.length > 0
  const isEntryCycle = useIsFirstChartEntry(animationKey, animate && hasBars)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const renderBars = activeBars
  const barsExpanded = useUnifiedToggleBarAnimation(
    `${animationKey}|publications-bars`,
    animate && hasBars && effectiveVisualMode === 'bars',
    'entry-only',
  )
  const renderedValuesTarget = useMemo(
    () => renderBars.map((bar) => Math.max(0, bar.value)),
    [renderBars],
  )
  const resolveLineCumulativeValuesForWindowMode = useCallback((mode: PublicationsWindowMode): number[] => {
    const lineBars = resolveLineBarsForWindowMode(mode).bars
    if (!lineBars.length) {
      return []
    }
    let runningTotal = 0
    return lineBars.map((bar) => {
      runningTotal += Math.max(0, bar.value)
      return runningTotal
    })
  }, [resolveLineBarsForWindowMode])
  const renderedCumulativeValuesTarget = useMemo(() => {
    if (effectiveVisualMode === 'line') {
      return resolveLineCumulativeValuesForWindowMode(effectiveWindowMode)
    }
    let runningTotal = 0
    return renderedValuesTarget.map((value) => {
      runningTotal += Math.max(0, value)
      return runningTotal
    })
  }, [
    effectiveVisualMode,
    effectiveWindowMode,
    renderedValuesTarget,
    resolveLineCumulativeValuesForWindowMode,
  ])
  const renderedValuesAnimated = renderedValuesTarget
  const renderedCumulativeValuesAnimated = renderedCumulativeValuesTarget

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  const valuesForScale = effectiveVisualMode === 'line'
    ? [renderedCumulativeValuesTarget[renderedCumulativeValuesTarget.length - 1] ?? 0]
    : renderedValuesTarget
  const maxValue = Math.max(
    1,
    ...valuesForScale,
  )
  const maxYearlyValue = Math.max(1, ...historyBars.map((bar) => Math.max(0, bar.value)))
  const maxMonthlyValue = Math.max(0, ...groupedMonthBars.bars.map((bar) => Math.max(0, bar.value)))
  const maxWindowValueBars = Math.max(maxYearlyValue, maxMonthlyValue)
  const maxWindowValueLine = Math.max(
    1,
    ...PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
      resolveLineCumulativeValuesForWindowMode(option.value).slice(-1)[0] ?? 0
    )),
  )
  const maxWindowValueForAxisWidth = Math.max(maxWindowValueBars, maxWindowValueLine)
  const maxWindowValue = effectiveVisualMode === 'line' ? maxWindowValueLine : maxWindowValueBars
  const maxAnimatedDisplayValue = Math.max(1, Math.max(maxWindowValue, maxValue) * 1.5)
  const stableAxisScale = enableWindowToggle && !autoScaleByWindow ? buildNiceAxis(maxWindowValue) : null
  const targetAxisScale = showAxes
    ? stableAxisScale || buildNiceAxis(maxValue)
    : null
  const targetAxisMax = targetAxisScale
    ? targetAxisScale.axisMax
    : Math.max(1, maxValue * (isCompactTileMode ? 1.06 : 1.1), Math.max(0, meanValue) * 1.1)
  const axisMax = targetAxisMax
  const displayedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|y-axis-max`,
    animate && hasBars && showAxes && enableWindowToggle,
    axisDurationMs,
  )
  const renderedMeanValue = Math.max(0, meanValue)
  const barHeightAxisMax = Math.max(1, axisMax)
  const rawYAxisTickRatios = useMemo(
    () => (
      targetAxisScale
        ? targetAxisScale.ticks.map((tickValue) => (targetAxisScale.axisMax <= 0 ? 0 : tickValue / targetAxisScale.axisMax))
        : [0, 0.25, 0.5, 0.75, 1]
    ),
    [targetAxisScale],
  )
  const rawYAxisTickValues = useMemo(
    () => rawYAxisTickRatios.map((ratio) => ratio * Math.max(1, displayedAxisMax)),
    [displayedAxisMax, rawYAxisTickRatios],
  )
  const yAxisTickValues = useMemo(() => {
    if (effectiveVisualMode !== 'line') {
      return rawYAxisTickValues
    }
    const hasZero = rawYAxisTickValues.some((value) => Math.abs(value) <= 1e-9)
    return hasZero ? rawYAxisTickValues : [0, ...rawYAxisTickValues]
  }, [effectiveVisualMode, rawYAxisTickValues])
  const yAxisTickRatios = useMemo(() => {
    if (effectiveVisualMode !== 'line') {
      return rawYAxisTickRatios
    }
    const hasZero = rawYAxisTickRatios.some((ratio) => Math.abs(ratio) <= 1e-9)
    return hasZero ? rawYAxisTickRatios : [0, ...rawYAxisTickRatios]
  }, [effectiveVisualMode, rawYAxisTickRatios])
  const hideYearTickTabs = false
  const showXAxisTickTabs = !hideYearTickTabs
  const buildLineModeTicksForWindow = useCallback((mode: PublicationsWindowMode): PublicationLineAxisTick[] => {
    const lineWindowBars = resolveLineBarsForWindowMode(mode).bars
    const monthStartMsValues = lineWindowBars.map((bar) => Number(bar.monthStartMs))
    const hasLineMonthTimeline = monthStartMsValues.length > 0
      && monthStartMsValues.length === lineWindowBars.length
      && monthStartMsValues.every((value) => Number.isFinite(value))
    
    if (mode === '3y' || mode === '5y') {
      if (!hasLineMonthTimeline || lineWindowBars.length < 2) {
        return []
      }

      const totalMonths = mode === '3y' ? 36 : 60
      const trailingMonthStarts = buildTrailingMonthStarts(totalMonths, true)
      if (trailingMonthStarts.length < 2) {
        return []
      }

      const windowStartMs = trailingMonthStarts[0].getTime()
      const windowEndMs = trailingMonthStarts[trailingMonthStarts.length - 1].getTime()
      const spanMs = Math.max(1, windowEndMs - windowStartMs)

      const januaryTicks = trailingMonthStarts
        .filter((date) => date.getUTCMonth() === 0)
        .map((date) => {
          const position = ((date.getTime() - windowStartMs) / spanMs) * 100
          return {
            key: `line-axis-${mode}-${date.getUTCFullYear()}`,
            label: String(date.getUTCFullYear()),
            subLabel: undefined,
            leftPct: position,
          }
        })
        .filter((tick) => tick.leftPct > 0.5 && tick.leftPct < 99.5)

      if (!januaryTicks.length) {
        return []
      }

      return januaryTicks.filter((tick, index, ticks) => {
        if (index === 0) {
          return true
        }
        return Math.abs(tick.leftPct - ticks[index - 1].leftPct) > 0.1
      })
    }
    
    const positions = [0, 0.5, 1]
    
    if (hasLineMonthTimeline) {
      return positions.map((position, index) => {
        const rawMonthIndex = Math.round((monthStartMsValues.length - 1) * position)
        const monthIndex = Math.max(0, Math.min(monthStartMsValues.length - 1, rawMonthIndex))
        const date = new Date(monthStartMsValues[monthIndex])
        return {
          key: `line-axis-${mode}-${index}`,
          label: MONTH_SHORT[date.getUTCMonth()],
          subLabel: String(date.getUTCFullYear()),
          leftPct: position * 100,
        }
      })
    }
    if (mode === 'all') {
      const firstYear = historyBars[0]?.year
      const lastYear = historyBars[historyBars.length - 1]?.year
      if (!Number.isFinite(firstYear) || !Number.isFinite(lastYear)) {
        return []
      }
      const startYear = Number(firstYear)
      const endYear = Number(lastYear)
      return positions.map((position, index) => {
        const interpolatedYear = Math.round(startYear + ((endYear - startYear) * position))
        return {
          key: `line-axis-${mode}-${index}`,
          label: String(interpolatedYear),
          subLabel: undefined,
          leftPct: position * 100,
        }
      })
    }
    const totalMonths = mode === '1y'
      ? 12
      : mode === '3y'
        ? 36
        : 60
    const trailingMonthStarts = buildTrailingMonthStarts(totalMonths, true)
    if (!trailingMonthStarts.length) {
      return []
    }
    return positions.map((position, index) => {
      const rawMonthIndex = Math.round((trailingMonthStarts.length - 1) * position)
      const monthIndex = Math.max(0, Math.min(trailingMonthStarts.length - 1, rawMonthIndex))
      const date = trailingMonthStarts[monthIndex]
      return {
        key: `line-axis-${mode}-${index}`,
        label: MONTH_SHORT[date.getUTCMonth()],
        subLabel: String(date.getUTCFullYear()),
        leftPct: position * 100,
      }
    })
  }, [historyBars, resolveLineBarsForWindowMode])
  const activePeriodRangeLabel = activeWindowBars.rangeLabel
  const resolveXAxisTitleForWindowMode = (
    mode: PublicationsWindowMode,
    visualMode: PublicationTrendsVisualMode = effectiveVisualMode,
  ): string => {
    if (visualMode === 'line') {
      return 'Date'
    }
    if (mode === '1y') {
      return 'Publication month'
    }
    if (mode === 'all') {
      return xAxisLabel
    }
    return 'Rolling 12-month period'
  }
  const resolvedXAxisLabel = usingMonthlyBars
    ? resolveXAxisTitleForWindowMode('1y')
      : (hideYearTickTabs && activePeriodRangeLabel
        ? `${resolveXAxisTitleForWindowMode(effectiveWindowMode)} (${activePeriodRangeLabel})`
        : resolveXAxisTitleForWindowMode(effectiveWindowMode))
  const stableToggleTickValues = enableWindowToggle ? buildNiceAxis(maxWindowValueForAxisWidth).ticks : yAxisTickValues
  const gridTickRatios = effectiveVisualMode === 'line' ? yAxisTickRatios : yAxisTickRatios.slice(1)
  const gridTickRatiosWithoutTop = gridTickRatios.filter((ratio) => ratio < 0.999)
  const hasTopYAxisTick = yAxisTickRatios.some((ratio) => ratio >= 0.999)
  const buildXAxisLayoutForWindow = (
    mode: PublicationsWindowMode,
    visualMode: PublicationTrendsVisualMode,
  ): ChartAxisLayout => {
    const optionWindowBars = resolveBarsForWindowMode(mode)
    const optionBars = optionWindowBars.bars
    const optionLineTicks = buildLineModeTicksForWindow(mode)
    const axisLabels = visualMode === 'line'
      ? optionLineTicks.map((tick) => tick.label)
      : optionBars.map((bar) => bar.axisLabel)
    const axisSubLabels = visualMode === 'line'
      ? optionLineTicks.map((tick) => tick.subLabel || null)
      : optionBars.map((bar) => bar.axisSubLabel || null)
    return buildChartAxisLayout({
      axisLabels,
      axisSubLabels,
      showXAxisName: showAxes,
      xAxisName: showAxes ? resolveXAxisTitleForWindowMode(mode, visualMode) : null,
      dense: visualMode === 'line' ? false : optionBars.length >= 7 || mode === '1y',
      maxLabelLines: 2,
      maxSubLabelLines: 2,
      maxAxisNameLines: 2,
    })
  }
  const xAxisLabelLayout = enableWindowToggle && !hideYearTickTabs
    ? mergeChartAxisLayouts(
      PUBLICATIONS_WINDOW_OPTIONS.flatMap((option) => ([
        buildXAxisLayoutForWindow(option.value, 'bars'),
        buildXAxisLayoutForWindow(option.value, 'line'),
      ])),
    )
    : isCompactTileMode
      ? buildChartAxisLayout({
        axisLabels: compactTileBars.map((bar) => bar.axisLabel),
        axisSubLabels: compactTileBars.map((bar) => bar.axisSubLabel || null),
        dense: compactTileBars.length >= 6,
        maxLabelLines: 2,
        maxSubLabelLines: 2,
      })
      : mergeChartAxisLayouts([
        buildXAxisLayoutForWindow(effectiveWindowMode, 'bars'),
        buildXAxisLayoutForWindow(effectiveWindowMode, 'line'),
      ])
  const yAxisPanelWidthRem = showAxes
    ? buildYAxisPanelWidthRem(stableToggleTickValues, Boolean(yAxisLabel), enableWindowToggle ? 1.7 : 1.2)
    : 0
  const yAxisTitleLeft = '36%'
  const shouldReserveMeanLabelBand = showMeanValueLabel && Boolean(meanDisplay)
  const meanLabelBandInsetRem = shouldReserveMeanLabelBand ? 0.75 : 0
  const chartTopInsetRem = PUBLICATIONS_CHART_TOP_INSET_REM + meanLabelBandInsetRem
  const chartLeftInset = showAxes
    ? `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
    : `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`

  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${chartTopInsetRem}rem`,
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${xAxisLabelLayout.axisBottomRem}rem`,
    minHeight: `${xAxisLabelLayout.axisMinHeightRem}rem`,
  }
  const isLifeBarChart = effectiveVisualMode !== 'line' && effectiveWindowMode === 'all'
  const lifeXAxisTitleNudgeRem = isLifeBarChart ? 0.28 : 0
  const lifeXAxisTitleTranslateRem = isLifeBarChart ? 0.22 : 0
  const longWindowLineXAxisTitleTranslate = effectiveVisualMode === 'line'
    && (effectiveWindowMode === '3y' || effectiveWindowMode === '5y' || effectiveWindowMode === 'all')
    ? longWindowLineXAxisTitleTranslateRem
    : 0
  const slotMetrics = useMemo(() => {
    const slotCount = Math.max(1, renderBars.length)
    const slotGapPct = slotCount >= 10
      ? PUBLICATIONS_CHART_SLOT_GAP_PCT_DENSE
      : slotCount >= 7
        ? PUBLICATIONS_CHART_SLOT_GAP_PCT_MEDIUM
        : PUBLICATIONS_CHART_SLOT_GAP_PCT_DEFAULT
    const totalGapPct = slotGapPct * Math.max(0, slotCount - 1)
    const slotWidthPct = Math.max(PUBLICATIONS_CHART_SLOT_MIN_WIDTH_PCT, (100 - totalGapPct) / slotCount)
    const slotStepPct = slotWidthPct + slotGapPct
    return {
      slotCount,
      slotGapPct,
      slotWidthPct,
      slotStepPct,
    }
  }, [renderBars.length])
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${chartTopInsetRem}rem`,
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const chartFrameStyle = {
    paddingBottom: `${xAxisLabelLayout.framePaddingBottomRem}rem`,
  }
  const yAxisTickOffsetRem = PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM
  const gridLineToneClass = effectiveVisualMode === 'line'
    ? HOUSE_CHART_GRID_LINE_SUBTLE_CLASS
    : subtleGrid
      ? HOUSE_CHART_GRID_LINE_SUBTLE_CLASS
      : HOUSE_CHART_GRID_LINE_CLASS
  const computeBarHeightPct = (value: number): number => (
    value <= 0 ? 3 : Math.min(100, Math.max(6, (value / barHeightAxisMax) * 100))
  )
  const computeLineHeightPct = (value: number): number => (
    value <= 0 ? 0 : Math.max(0, Math.min(100, (value / barHeightAxisMax) * 100))
  )
  const useCurrentPeriodBarTone = showCurrentPeriodSemantic && usingMonthlyBars
  const resolveBarToneClass = (barValue: number, isCurrentPeriod: boolean): string => {
    const relative = barValue >= meanValue * 1.1 ? 'above' : barValue <= meanValue * 0.9 ? 'below' : 'near'
    if (isCurrentPeriod && useCurrentPeriodBarTone) {
      return HOUSE_CHART_BAR_CURRENT_CLASS
    }
    if (relative === 'above') {
      return HOUSE_CHART_BAR_POSITIVE_CLASS
    }
    if (relative === 'below') {
      return HOUSE_CHART_BAR_WARNING_CLASS
    }
    return HOUSE_CHART_BAR_ACCENT_CLASS
  }
  const activeWindowIndex = PUBLICATIONS_WINDOW_OPTIONS.findIndex((option) => option.value === effectiveWindowMode)
  const monthRangeLabel = usingMonthlyTimelineForMode ? activeWindowBars.rangeLabel : null
  const yearRangeLabel = usingMonthlyTimelineForMode ? null : activeWindowBars.rangeLabel
  const periodHintText = monthRangeLabel || yearRangeLabel || '\u00A0'
  const periodHintVisible = Boolean(monthRangeLabel || yearRangeLabel)
  const rightMetaVisible = showPeriodHint
  const rightMetaText = periodHintText
  const rightMetaOpaque = periodHintVisible
  const controlsRightVisible = rightMetaVisible || showVisualModeToggle
  const lineSeriesModel = useMemo(() => {
    const clampPct = (value: number) => Math.max(0, Math.min(100, value))
    if (effectiveVisualMode !== 'line') {
      const points = renderBars.map((bar, index) => {
        const rawAnimatedValue = renderedCumulativeValuesAnimated[index]
        const fallbackValue = renderedCumulativeValuesTarget[index] ?? 0
        const finiteAnimatedValue = Number.isFinite(rawAnimatedValue) ? rawAnimatedValue : fallbackValue
        const animatedValue = Math.max(0, Math.min(maxAnimatedDisplayValue, finiteAnimatedValue))
        return {
          key: bar.key,
          xPct: (index * slotMetrics.slotStepPct) + (slotMetrics.slotWidthPct / 2),
          yPct: clampPct((animatedValue / Math.max(1, barHeightAxisMax)) * 100),
          value: animatedValue,
          timeMs: null as number | null,
        }
      })
      return {
        points,
        markerPoints: points,
        timelineStartMs: null as number | null,
        timelineEndMs: null as number | null,
      }
    }
    if (!renderBars.length) {
      return {
        points: [],
        markerPoints: [],
        timelineStartMs: null as number | null,
        timelineEndMs: null as number | null,
      }
    }
    if (publicationEventDatesMs.length) {
      const now = new Date()
      const trailing12MonthStarts = buildTrailingMonthStarts(12, true)
      const trailing36MonthStarts = buildTrailingMonthStarts(36, true)
      const trailing60MonthStarts = buildTrailingMonthStarts(60, true)
      const trailingStart = trailing12MonthStarts[0] || null
      const trailingEnd = trailing12MonthStarts[trailing12MonthStarts.length - 1] || null
      const oneYearStartMs = trailingStart ? trailingStart.getTime() : null
      const oneYearEndExclusiveMs = trailingEnd
        ? Date.UTC(trailingEnd.getUTCFullYear(), trailingEnd.getUTCMonth() + 1, 1)
        : null
      const threeYearStart = trailing36MonthStarts[0] || null
      const threeYearStartMs = threeYearStart ? threeYearStart.getTime() : Date.UTC(now.getUTCFullYear() - 2, 0, 1)
      const fiveYearStart = trailing60MonthStarts[0] || null
      const fiveYearStartMs = fiveYearStart ? fiveYearStart.getTime() : Date.UTC(now.getUTCFullYear() - 4, 0, 1)
      const currentMonthEndExclusiveMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
      const filteredEventMs = publicationEventDatesMs.filter((timeMs) => {
        if (effectiveWindowMode === '1y') {
          if (oneYearStartMs === null || oneYearEndExclusiveMs === null) {
            return true
          }
          return timeMs >= oneYearStartMs && timeMs < oneYearEndExclusiveMs
        }
        if (effectiveWindowMode === '3y') {
          return timeMs >= threeYearStartMs
        }
        if (effectiveWindowMode === '5y') {
          return timeMs >= fiveYearStartMs
        }
        return true
      })
      if (filteredEventMs.length) {
        const DAY_MS = 24 * 60 * 60 * 1000
        const groupedEvents: Array<{ timeMs: number; count: number }> = []
        for (const timeMs of filteredEventMs) {
          const lastGroup = groupedEvents[groupedEvents.length - 1]
          if (lastGroup && lastGroup.timeMs === timeMs) {
            lastGroup.count += 1
          } else {
            groupedEvents.push({ timeMs, count: 1 })
          }
        }
        const expandedEventMs: number[] = []
        for (let groupIndex = 0; groupIndex < groupedEvents.length; groupIndex += 1) {
          const group = groupedEvents[groupIndex]
          const nextGroup = groupedEvents[groupIndex + 1] || null
          const nextAnchorMs = nextGroup
            ? nextGroup.timeMs
            : (effectiveWindowMode === '1y'
              ? (oneYearEndExclusiveMs ?? (group.timeMs + (31 * DAY_MS)))
              : (group.timeMs + (365 * DAY_MS)))
          const intervalMs = Math.max(1, nextAnchorMs - group.timeMs)
          const distributionWindowMs = Math.max(1, Math.floor(intervalMs * 0.9))
          if (group.count <= 1) {
            expandedEventMs.push(group.timeMs)
            continue
          }
          for (let itemIndex = 0; itemIndex < group.count; itemIndex += 1) {
            const offsetMs = Math.floor(((itemIndex + 1) / (group.count + 1)) * distributionWindowMs)
            expandedEventMs.push(group.timeMs + offsetMs)
          }
        }
        const resolvedWindowStartMs = effectiveWindowMode === '1y'
          ? oneYearStartMs
          : effectiveWindowMode === '3y'
            ? threeYearStartMs
            : effectiveWindowMode === '5y'
              ? fiveYearStartMs
              : expandedEventMs[0]
        const resolvedWindowEndMs = effectiveWindowMode === '1y'
          ? (oneYearEndExclusiveMs === null ? null : oneYearEndExclusiveMs - 1)
          : (currentMonthEndExclusiveMs - 1)
        const timelineStartMs = Number.isFinite(resolvedWindowStartMs ?? Number.NaN)
          ? Number(resolvedWindowStartMs)
          : expandedEventMs[0]
        const timelineEndMsRaw = Number.isFinite(resolvedWindowEndMs ?? Number.NaN)
          ? Number(resolvedWindowEndMs)
          : expandedEventMs[expandedEventMs.length - 1]
        const timelineEndMs = Math.max(timelineStartMs + 1, timelineEndMsRaw)
        const spanMs = Math.max(1, timelineEndMs - timelineStartMs)
        const eventPoints = expandedEventMs.map((timeMs, index) => {
          const position = (timeMs - timelineStartMs) / spanMs
          const cumulativeValue = index + 1
          return {
            key: `line-event-${timeMs}-${index}`,
            xPct: clampPct(position * 100),
            yPct: clampPct((cumulativeValue / Math.max(1, barHeightAxisMax)) * 100),
            value: cumulativeValue,
            timeMs,
          }
        })
        const pathPoints = [
          {
            key: 'line-event-period-start',
            xPct: 0,
            yPct: 0,
            value: 0,
            timeMs: timelineStartMs,
          },
          ...eventPoints,
        ]
        return {
          points: pathPoints,
          markerPoints: eventPoints,
          timelineStartMs,
          timelineEndMs,
        }
      }
    }
    if (hasLifetimeMonthlyLineSeries) {
      const firstMonthStartMs = Number(renderBars[0]?.monthStartMs)
      const lastMonthStartMs = Number(renderBars[renderBars.length - 1]?.monthStartMs)
      if (Number.isFinite(firstMonthStartMs) && Number.isFinite(lastMonthStartMs)) {
        const timelineStartMs = Number(firstMonthStartMs)
        const lastMonthDate = new Date(Number(lastMonthStartMs))
        const timelineEndMs = Date.UTC(
          lastMonthDate.getUTCFullYear(),
          lastMonthDate.getUTCMonth() + 1,
          1,
        ) - 1
        const spanMs = Math.max(1, timelineEndMs - timelineStartMs)
        const cumulativePoints = renderBars.map((bar, index) => {
          const monthStartMs = Number(bar.monthStartMs)
          const monthEndMs = Number.isFinite(monthStartMs)
            ? (Date.UTC(new Date(monthStartMs).getUTCFullYear(), new Date(monthStartMs).getUTCMonth() + 1, 1) - 1)
            : timelineStartMs
          const cumulativeValue = renderedCumulativeValuesTarget[index] ?? 0
          return {
            key: `line-cumulative-${bar.key}-${index}`,
            xPct: clampPct(((monthEndMs - timelineStartMs) / spanMs) * 100),
            yPct: clampPct((cumulativeValue / Math.max(1, barHeightAxisMax)) * 100),
            value: cumulativeValue,
            timeMs: monthEndMs,
          }
        })
        const pathPoints = [
          {
            key: 'line-period-start',
            xPct: 0,
            yPct: 0,
            value: 0,
            timeMs: timelineStartMs,
          },
          ...cumulativePoints,
        ]
        return {
          points: pathPoints,
          markerPoints: cumulativePoints,
          timelineStartMs,
          timelineEndMs,
        }
      }
    }
    let cumulativeValue = 0
    const cumulativePoints = renderBars.map((bar, index) => {
      cumulativeValue += Math.max(0, bar.value)
      const monthStartMs = Number.isFinite(bar.monthStartMs ?? Number.NaN)
        ? Number(bar.monthStartMs)
        : null
      return {
        key: `line-cumulative-${bar.key}-${index}`,
        xPct: clampPct((index * slotMetrics.slotStepPct) + (slotMetrics.slotWidthPct / 2)),
        yPct: clampPct((cumulativeValue / Math.max(1, barHeightAxisMax)) * 100),
        value: cumulativeValue,
        timeMs: monthStartMs,
      }
    })
    const timelineMsValues = cumulativePoints
      .map((point) => point.timeMs)
      .filter((value): value is number => Number.isFinite(value))
      .sort((left, right) => left - right)
    const timelineStartMs = timelineMsValues.length ? timelineMsValues[0] : null
    const timelineEndMs = timelineMsValues.length ? timelineMsValues[timelineMsValues.length - 1] : null
    const pathPoints = [
      {
        key: 'line-period-start',
        xPct: 0,
        yPct: 0,
        value: 0,
        timeMs: timelineStartMs,
      },
      ...cumulativePoints,
    ]
    return {
      points: pathPoints,
      markerPoints: cumulativePoints,
      timelineStartMs,
      timelineEndMs,
    }
  }, [
    barHeightAxisMax,
    effectiveVisualMode,
    maxAnimatedDisplayValue,
    renderedCumulativeValuesAnimated,
    renderedCumulativeValuesTarget,
    renderBars,
    effectiveWindowMode,
    hasLifetimeMonthlyLineSeries,
    publicationEventDatesMs,
    slotMetrics.slotStepPct,
    slotMetrics.slotWidthPct,
  ])
  const lineModeXAxisTicks = useMemo(() => {
    if (effectiveVisualMode !== 'line') {
      return []
    }
    const startMs = lineSeriesModel.timelineStartMs
    const endMs = lineSeriesModel.timelineEndMs
    if (startMs == null || endMs == null || endMs <= startMs) {
      return buildLineModeTicksForWindow(effectiveWindowMode)
    }
    return buildLineTicksFromRange(
      startMs,
      endMs,
      effectiveWindowMode,
    )
  }, [
    buildLineModeTicksForWindow,
    effectiveVisualMode,
    effectiveWindowMode,
    lineSeriesModel.timelineEndMs,
    lineSeriesModel.timelineStartMs,
  ])
  const lineSeriesPathPoints = lineSeriesModel.points
  const linePathD = useMemo(() => {
    if (effectiveVisualMode !== 'line' || lineSeriesPathPoints.length === 0) {
      return ''
    }
    const points = lineSeriesPathPoints
      .map((point) => {
        const clampedX = Math.max(0, Math.min(100, Number(point.xPct)))
        const clampedY = Math.max(0, Math.min(100, 100 - Number(point.yPct)))
        if (!Number.isFinite(clampedX) || !Number.isFinite(clampedY)) {
          return null
        }
        return { x: clampedX, y: clampedY }
      })
      .filter((point): point is { x: number; y: number } => point !== null)
    if (points.length === 0) {
      return ''
    }
    const orderedPoints = [...points].sort((left, right) => left.x - right.x)
    const lastPoint = orderedPoints[orderedPoints.length - 1]
    const smoothedPoints = lastPoint.x < 100
      ? [...orderedPoints, { x: 100, y: lastPoint.y }]
      : orderedPoints
    if (smoothedPoints.length < 2) {
      const onlyPoint = smoothedPoints[0]
      return onlyPoint ? `M ${onlyPoint.x} ${onlyPoint.y}` : ''
    }
    return monotonePathFromPoints(smoothedPoints)
  }, [effectiveVisualMode, lineSeriesPathPoints])
  const lineModeVerticalGridPercents = useMemo(() => {
    if (effectiveVisualMode !== 'line') {
      return []
    }
    const sortedUnique = lineModeXAxisTicks
      .map((tick) => Math.max(0, Math.min(100, tick.leftPct)))
      .sort((left, right) => left - right)
      .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.5)
    return sortedUnique
  }, [effectiveVisualMode, lineModeXAxisTicks])

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>No publication timeline</div>
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-ui="publications-per-year-chart"
      data-house-role="metric-chart"
    >
      {chartTitle ? (
        <p className={cn(chartTitleClassName || HOUSE_CHART_AXIS_TITLE_CLASS, 'mb-0.5')}>
          {chartTitle}
        </p>
      ) : null}
      {enableWindowToggle && showWindowToggle ? (
        <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, controlsRightVisible ? 'justify-between' : 'justify-start')}>
          <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-4')}
              data-stop-tile-open="true"
              data-ui="publications-window-toggle"
              data-house-role="chart-toggle"
            >
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={buildTileToggleThumbStyle(activeWindowIndex, PUBLICATIONS_WINDOW_OPTIONS.length, isEntryCycle)}
                  aria-hidden="true"
                />
              {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
                <button
                  key={`pub-window-${option.value}`}
                  type="button"
                  data-stop-tile-open="true"
                  className={cn(
                    HOUSE_TOGGLE_BUTTON_CLASS,
                    effectiveWindowMode === option.value
                      ? 'text-white'
                      : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (effectiveWindowMode === option.value) {
                      return
                    }
                    if (onWindowModeChange) {
                      onWindowModeChange(option.value)
                    }
                    setWindowMode(option.value)
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-pressed={effectiveWindowMode === option.value}
                >
                    {option.label}
                  </button>
                ))}
            </div>
          </div>
          {controlsRightVisible ? (
            <div className="flex items-center gap-2">
              {rightMetaVisible ? (
                <p
                  className={cn(
                    HOUSE_DRILLDOWN_CHART_META_CLASS,
                    HOUSE_HEADING_LABEL_CLASS,
                    HOUSE_TOGGLE_CHART_LABEL_CLASS,
                    rightMetaOpaque ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-live="polite"
                >
                  {rightMetaText}
                </p>
              ) : null}
              {showVisualModeToggle ? (
                <PublicationTrendsVisualToggle
                  value={effectiveVisualMode}
                  onChange={setEffectiveVisualMode}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          enableWindowToggle && HOUSE_CHART_SERIES_BY_SLOT_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={chartFrameStyle}
        data-ui="publications-chart-frame"
        data-house-role="chart-frame"
      >
        {showMeanValueLabel && meanDisplay && effectiveVisualMode !== 'line' ? (
          <p
              className={cn(
                HOUSE_DRILLDOWN_CHART_META_CLASS,
                HOUSE_HEADING_LABEL_CLASS,
                'pointer-events-none absolute right-2 top-0 z-[2]',
              )}
          >
            Mean: {meanDisplay} per {meanDisplayUnit}
          </p>
        ) : null}
        <div className="absolute overflow-visible" style={plotAreaStyle}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {showAxes ? (
              <div
                className={cn('absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ borderLeft: `1px solid hsl(var(--stroke-soft) / ${effectiveVisualMode === 'line' ? 0.7 : 0.55})` }}
              />
            ) : null}
            {gridTickRatiosWithoutTop.map((ratio, index) => (
              <div
                key={`pub-grid-${index}`}
                className={cn('absolute inset-x-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{
                  bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                  borderTop: effectiveVisualMode === 'line'
                    ? `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`
                    : undefined,
                }}
              />
            ))}
            {hasTopYAxisTick ? (
              <div
                className={cn('absolute inset-x-0 top-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{
                  borderTop: effectiveVisualMode === 'line'
                    ? '1px solid hsl(var(--stroke-soft) / 0.76)'
                    : undefined,
                }}
              />
            ) : null}
            {effectiveVisualMode !== 'line' ? (
              <div
                className={cn('absolute inset-x-0 bottom-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
                aria-hidden="true"
              />
            ) : null}
            {enableWindowToggle ? (
              <>
                <div
                  className={cn('absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
                  style={{ borderRight: `1px solid hsl(var(--stroke-soft) / ${effectiveVisualMode === 'line' ? 0.76 : 0.55})` }}
                  aria-hidden="true"
                />
                {hasTopYAxisTick || effectiveVisualMode === 'line' ? (
                  <div
                    className={cn('pointer-events-none absolute inset-x-0 top-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
                    aria-hidden="true"
                  />
                ) : null}
              </>
            ) : null}
            {effectiveVisualMode === 'line' && lineModeVerticalGridPercents.length ? (
              <svg className="absolute inset-0 z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="crispEdges">
                {lineModeVerticalGridPercents.map((leftPct, index) => (
                  <line
                    key={`pub-line-grid-${index}`}
                    x1={String(leftPct)}
                    y1="0"
                    x2={String(leftPct)}
                    y2="100"
                    stroke={`hsl(var(--stroke-soft) / 0.76)`}
                    strokeWidth="1"
                    shapeRendering="crispEdges"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            ) : null}
          </div>
          {showMeanLine && effectiveVisualMode !== 'line' ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0',
                HOUSE_CHART_MEAN_LINE_CLASS,
                HOUSE_TOGGLE_CHART_MORPH_CLASS,
              )}
              style={{
                bottom: `${Math.max(0, Math.min(100, (renderedMeanValue / barHeightAxisMax) * 100))}%`,
                transitionDelay: '0ms',
              }}
              aria-hidden="true"
            />
          ) : null}
          {effectiveVisualMode === 'line' ? (
            <>
              {linePathD ? (
                <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                      d={linePathD}
                      className={HOUSE_TOGGLE_CHART_LINE_CLASS}
                      fill="none"
                      stroke="hsl(var(--tone-accent-600) / 0.96)"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={{
                        transitionDuration: `${getAxisAnimationDuration(isEntryCycle ? 'entry' : 'toggle')}ms`,
                      }}
                    />
                  </svg>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="absolute inset-0" data-ui="chart-bars" data-house-role="chart-bars">
            {renderBars.map((bar, index) => {
              const rawAnimatedValue = renderedValuesAnimated[index]
              const finiteAnimatedValue = Number.isFinite(rawAnimatedValue) ? rawAnimatedValue : bar.value
              const animatedValue = Math.max(0, Math.min(maxAnimatedDisplayValue, finiteAnimatedValue))
              const rawLineAnimatedValue = renderedCumulativeValuesAnimated[index]
              const fallbackLineValue = renderedCumulativeValuesTarget[index] ?? 0
              const finiteLineAnimatedValue = Number.isFinite(rawLineAnimatedValue) ? rawLineAnimatedValue : fallbackLineValue
              const lineAnimatedValue = Math.max(0, Math.min(maxAnimatedDisplayValue, finiteLineAnimatedValue))
              const heightPct = computeBarHeightPct(animatedValue)
              const lineHeightPct = computeLineHeightPct(lineAnimatedValue)
              const tooltipAnchorHeightPct = effectiveVisualMode === 'line' ? lineHeightPct : heightPct
              const tooltipValue = bar.value
              const barLeadingInsetPct = effectiveVisualMode === 'line' ? 0 : slotMetrics.slotGapPct
              const barSlotScale = effectiveVisualMode === 'line' ? 1 : (100 - barLeadingInsetPct) / 100
              const leftPct = barLeadingInsetPct + (index * slotMetrics.slotStepPct * barSlotScale)
              const slotWidthPct = slotMetrics.slotWidthPct * barSlotScale
              const isActive = hoveredIndex === index
              const toneClass = resolveBarToneClass(bar.value, bar.current)
              const baseScaleX = isActive ? 1.035 : 1
              const barScaleY = effectiveVisualMode === 'bars' && barsExpanded ? 1 : 0
              return (
                <div
                  key={`slot-${index}`}
                  className="absolute inset-y-0 z-[1]"
                  style={{
                    left: `${leftPct}%`,
                    width: `${slotWidthPct}%`,
                    pointerEvents: effectiveVisualMode === 'line' ? 'none' : undefined,
                  }}
                >
                  {effectiveVisualMode !== 'line' ? (
                    <span
                      className={cn(
                        HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                      )}
                      style={{ bottom: `calc(${tooltipAnchorHeightPct}% + ${PUBLICATIONS_CHART_TOOLTIP_OFFSET_REM}rem)` }}
                      aria-hidden="true"
                    >
                      {formatInt(tooltipValue)}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'absolute bottom-0 block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      enableWindowToggle && HOUSE_TOGGLE_CHART_MORPH_CLASS,
                      effectiveVisualMode === 'line' && 'opacity-0',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    onMouseEnter={effectiveVisualMode === 'line' ? undefined : () => setHoveredIndex(index)}
                    onMouseLeave={effectiveVisualMode === 'line' ? undefined : () => setHoveredIndex((current) => (current === index ? null : current))}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${baseScaleX}) scaleY(${barScaleY})`,
                      transformOrigin: 'bottom',
                      transitionProperty: 'height,transform,filter,box-shadow,opacity',
                      transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barScaleY > 0),
                      transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barScaleY > 0),
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {showAxes ? (
          <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
            {yAxisTickValues.map((tickValue, index) => {
              const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
              const tickRatioKey = Math.round((yAxisTickRatios[index] || 0) * 1000)
                return (
                  <p
                    key={`pub-y-axis-${tickRatioKey}`}
                    className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                    style={{
                      bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)`,
                      transitionDuration: `${axisDurationMs}ms`,
                      transitionProperty: 'bottom,opacity',
                    }}
                  >
                    {formatInt(tickValue)}
                  </p>
                )
              })}
            <p
              className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
              style={{ left: yAxisTitleLeft }}
            >
              {yAxisLabel}
            </p>
          </div>
        ) : null}

        {showXAxisTickTabs ? (
          effectiveVisualMode === 'line' ? (
            <div
              className={cn('pointer-events-none absolute', HOUSE_TOGGLE_CHART_LABEL_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={xAxisTicksStyle}
            >
              {lineModeXAxisTicks.map((tick, index) => {
                const lastIndex = lineModeXAxisTicks.length - 1
                const shouldClampEdgeTickLabel = effectiveWindowMode === '1y'
                const isNearLeftEdge = tick.leftPct <= 2
                const isNearRightEdge = tick.leftPct >= 98
                const isFirst = index === 0
                const isLast = index === lastIndex
                const tickRoleLabel = isFirst ? 'Start' : isLast ? 'End' : 'Middle'
                const tickAlignmentClass = shouldClampEdgeTickLabel
                  ? isFirst
                    ? 'text-left'
                    : isLast
                      ? 'text-right'
                      : 'text-center'
                  : 'text-center'
                return (
                  <div
                    key={tick.key}
                    className={cn(
                      'house-chart-axis-period-item absolute top-0 leading-none',
                      tickAlignmentClass,
                      HOUSE_CHART_SCALE_TICK_CLASS,
                    )}
                    style={{
                      left: `${tick.leftPct}%`,
                      transform: shouldClampEdgeTickLabel
                        ? isFirst
                          ? 'translateX(0)'
                          : isLast
                            ? 'translateX(-100%)'
                            : 'translateX(-50%)'
                        : isNearLeftEdge
                          ? 'translateX(0)'
                          : isNearRightEdge
                            ? 'translateX(-100%)'
                            : 'translateX(-50%)',
                      transitionDuration: `${axisDurationMs}ms`,
                      transitionProperty: 'opacity',
                    }}
                    aria-label={`${tickRoleLabel}: ${tick.label}${tick.subLabel ? ` ${tick.subLabel}` : ''}`}
                  >
                    <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                      {tick.label}
                    </p>
                    {tick.subLabel ? (
                      <p className={cn(HOUSE_CHART_AXIS_SUBTEXT_CLASS, HOUSE_CHART_AXIS_PERIOD_TAG_CLASS, 'relative -top-px break-words px-0.5')}>
                        {tick.subLabel}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className={cn(
                'pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1',
                HOUSE_TOGGLE_CHART_LABEL_CLASS,
                HOUSE_CHART_SCALE_LAYER_CLASS,
              )}
              style={xAxisTicksStyle}
            >
              {renderBars.map((bar, index) => (
                <div
                  key={`${bar.key}-${index}-axis`}
                  className={cn(
                    'house-chart-axis-period-item text-center leading-none',
                    HOUSE_CHART_SCALE_TICK_CLASS,
                  )}
                  style={isLifeBarChart ? { transform: 'translateY(0.42rem)' } : undefined}
                >
                  <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                    {bar.axisLabel}
                  </p>
                  {bar.axisSubLabel ? (
                    <p className={cn(HOUSE_CHART_AXIS_SUBTEXT_CLASS, HOUSE_CHART_AXIS_PERIOD_TAG_CLASS, 'break-words px-0.5')}>
                      {bar.axisSubLabel}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : null}

        {showAxes ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: chartLeftInset,
              right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
              bottom: `${Math.max(0, xAxisLabelLayout.xAxisNameBottomRem - lifeXAxisTitleNudgeRem)}rem`,
              minHeight: `${xAxisLabelLayout.xAxisNameMinHeightRem}rem`,
            }}
          >
            <p
              className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}
              style={
                lifeXAxisTitleTranslateRem > 0 || longWindowLineXAxisTitleTranslate !== 0
                  ? { transform: `translateY(${lifeXAxisTitleTranslateRem - longWindowLineXAxisTitleTranslate}rem)` }
                  : undefined
              }
            >
              {resolvedXAxisLabel}
            </p>
          </div>
        ) : null}
      </div>
      {showCaption ? (
        <p className={cn(dashboardTileStyles.tileMicroLabel, 'mt-1')}>
          Dashed bar is current year to date.
        </p>
      ) : null}
    </div>
  )
}

function ImpactConcentrationPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const top3 = values[0] || 0
  const rest = values[1] || 0
  const total = Math.max(0, top3 + rest)
  const ringRadius = 38
  const ringCircumference = 2 * Math.PI * ringRadius
  const top3Pct = total > 0 ? (top3 / total) * 100 : 0
  const top3PctRounded = Math.max(0, Math.min(100, Math.round(top3Pct)))
  const top3AnimatedDash = (top3PctRounded / 100) * ringCircumference
  const explicitTotalPublicationsCandidates = [
    Number(chartData.total_publications),
    Number(chartData.total_publications_count),
    Number(chartData.total_papers),
    Number(chartData.paper_count),
  ]
  const explicitTotalPublications = explicitTotalPublicationsCandidates.find(
    (item) => Number.isFinite(item) && item >= 0,
  )
  const uncitedCountRaw = Number(chartData.uncited_publications_count)
  const uncitedPctRaw = Number(chartData.uncited_publications_pct)
  const inferredTotalPublications = Number.isFinite(uncitedCountRaw) && Number.isFinite(uncitedPctRaw) && uncitedPctRaw > 0
    ? Math.max(0, Math.round(uncitedCountRaw / (uncitedPctRaw / 100)))
    : null
  const totalPublications = explicitTotalPublications !== undefined
    ? Math.max(0, Math.round(explicitTotalPublications))
    : inferredTotalPublications
  const topPapersCountRaw = Number(chartData.top_papers_count ?? chartData.top_paper_count ?? 3)
  const topPapersCount = Math.max(0, Math.round(Number.isFinite(topPapersCountRaw) ? topPapersCountRaw : 3))
  const effectiveTopPapersCount = totalPublications === null
    ? topPapersCount
    : Math.max(0, Math.min(topPapersCount, totalPublications))
  const ringStrokeWidth = HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH
  const ringAnimationKey = useMemo(
    () => `${top3PctRounded}|${totalPublications ?? 'na'}|${effectiveTopPapersCount}`,
    [effectiveTopPapersCount, top3PctRounded, totalPublications],
  )
  const isImpactConcentrationEntryCycle = useIsFirstChartEntry(ringAnimationKey, total > 0)
  const ringVisible = useUnifiedToggleBarAnimation(ringAnimationKey, total > 0)
  const ringVisibleDash = ringVisible ? top3AnimatedDash : 0
  const ringTransitionDuration = ringChartDurationVar(isImpactConcentrationEntryCycle)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex-1 min-h-0 flex flex-col py-1.5">
        <div className="flex-1" />
        <div
          className={cn(
            HOUSE_CHART_TRANSITION_CLASS,
            HOUSE_CHART_RING_ENTERED_CLASS,
          )}
        >
          {total > 0 ? (
            <div className={HOUSE_CHART_RING_PANEL_CLASS}>
              <svg
                viewBox="0 0 100 100"
                className={HOUSE_CHART_RING_SIZE_CLASS}
                data-stop-tile-open="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  className={HOUSE_CHART_RING_REMAINDER_SVG_CLASS}
                  strokeWidth={ringStrokeWidth}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  className={cn(HOUSE_CHART_RING_MAIN_SVG_CLASS, 'house-chart-ring-dasharray-motion')}
                  strokeWidth={ringStrokeWidth}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{
                    strokeDasharray: `${ringVisibleDash} ${ringCircumference}`,
                    strokeDashoffset: 0,
                    '--chart-transition-duration': ringTransitionDuration,
                  } as React.CSSProperties}
                />
              </svg>
            </div>
          ) : (
            <div className={dashboardTileStyles.emptyChart}>No concentration data</div>
          )}
        </div>
        <div className="flex-1" />
      </div>
    </div>
  )
}

function MomentumTilePanel({
  tile,
  mode,
  yearBreakdown,
}: {
  tile: PublicationMetricTilePayload
  mode: MomentumWindowMode
  yearBreakdown: MomentumYearBreakdown | null
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const monthlyBreakdown = buildMomentumBreakdown(tile)
  const useYearMode = mode === '5y' && Boolean(yearBreakdown?.bars.length)
  const monthlyComparisonBars = useMemo(() => {
    const baseline = monthlyBreakdown.rate9m
    const recent = monthlyBreakdown.rate3m
    if (baseline === null && recent === null) {
      return []
    }
    return [
      {
        key: 'baseline',
        label: 'Prior 9 month average',
        subLabel: null,
        value: baseline ?? 0,
        recent: false,
      },
      {
        key: 'recent',
        label: 'Recent 3 month average',
        subLabel: null,
        value: recent ?? 0,
        recent: true,
      },
    ]
  }, [
    monthlyBreakdown.rate3m,
    monthlyBreakdown.rate9m,
  ])
  const yearlyComparisonBars = useMemo(() => {
    const baseline = yearBreakdown?.rate4y ?? null
    const recent = yearBreakdown?.rate1y ?? null
    if (baseline === null && recent === null) {
      return []
    }
    return [
      {
        key: 'baseline',
        label: 'Prior 4yr rolling average',
        subLabel: null,
        value: baseline ?? 0,
        recent: false,
      },
      {
        key: 'recent',
        label: 'Rolling 1y average',
        subLabel: null,
        value: recent ?? 0,
        recent: true,
      },
    ]
  }, [
    yearBreakdown?.rate1y,
    yearBreakdown?.rate4y,
  ])
  const comparisonBars = useYearMode ? yearlyComparisonBars : monthlyComparisonBars
  const getMomentumAxisLabel = (bar: { label: string; subLabel?: string | null }) =>
    bar.subLabel ? `${bar.label} (${bar.subLabel})` : bar.label
  const emptyLabel = useYearMode ? 'No 5-year citation data' : 'No monthly citation data'
  const barValues = comparisonBars.map((bar) => Math.max(0, bar.value))
  const maxValue = Math.max(1, ...barValues)
  const minValue = barValues.length ? Math.min(...barValues) : 0
  const spreadRatio = (maxValue - minValue) / Math.max(1, maxValue)
  const headroomFactor = spreadRatio <= 0.1 ? 1.03 : spreadRatio <= 0.25 ? 1.06 : 1.1
  const scaledMaxTarget = maxValue * headroomFactor
  const animationKey = useMemo(
    () => `${mode}|${comparisonBars.map((bar) => `${bar.key}-${bar.value.toFixed(3)}`).join('|')}`,
    [comparisonBars, mode],
  )
  const hasComparisonBars = comparisonBars.length > 0
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasComparisonBars)
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasComparisonBars)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])
  const renderedValuesTarget = useMemo(
    () => comparisonBars.map((bar) => Math.max(0, bar.value)),
    [comparisonBars],
  )
  const renderedValuesAnimated = useEasedSeries(
    renderedValuesTarget,
    `${animationKey}|momentum-values`,
    hasComparisonBars,
    axisDurationMs,
  )
  const heightTargets = useMemo(
    () =>
      comparisonBars.map((bar) => {
        const safeValue = Math.max(0, bar.value)
        if (safeValue <= 0) {
          return 5
        }
        return Math.max(10, (safeValue / Math.max(1, scaledMaxTarget)) * 100)
      }),
    [comparisonBars, scaledMaxTarget],
  )
  const heightTargetsAnimated = useEasedSeries(
    heightTargets,
    `${animationKey}|momentum-heights`,
    hasComparisonBars,
    axisDurationMs,
  )

  const axisLayout = useMemo(() => {
    const candidates: ChartAxisLayout[] = []
    const monthlyLayoutSource = monthlyComparisonBars.length ? monthlyComparisonBars : comparisonBars
    if (monthlyLayoutSource.length) {
      candidates.push(
        buildChartAxisLayout({
          axisLabels: monthlyLayoutSource.map((bar) => getMomentumAxisLabel(bar)),
          dense: false,
          maxLabelLines: 2,
          maxSubLabelLines: 1,
        }),
      )
    }
    if (yearlyComparisonBars.length) {
      candidates.push(
        buildChartAxisLayout({
          axisLabels: yearlyComparisonBars.map((bar) => getMomentumAxisLabel(bar)),
          dense: false,
          maxLabelLines: 2,
          maxSubLabelLines: 1,
        }),
      )
    }
    return mergeChartAxisLayouts(candidates)
  }, [comparisonBars, monthlyComparisonBars, yearlyComparisonBars])

  if (!hasComparisonBars) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }

  return (
    <div className="flex h-full min-h-[8.2rem] w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div
          className="absolute inset-x-2 top-[0.625rem]"
          style={{ bottom: `${axisLayout.plotBottomRem}rem` }}
        >
          {[50].map((pct) => (
            <div
              key={`momentum-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {comparisonBars.map((bar, index) => {
              const animatedValue = Math.max(0, renderedValuesAnimated[index] ?? renderedValuesTarget[index] ?? 0)
              const heightPct = Math.max(0, Math.min(100, heightTargetsAnimated[index] ?? heightTargets[index] ?? 5))
              const isActive = hoveredIndex === index
              const yOffset = isActive ? -1 : 0
              const toneClass = bar.recent ? HOUSE_CHART_BAR_POSITIVE_CLASS : HOUSE_CHART_BAR_ACCENT_CLASS
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(animatedValue)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      HOUSE_TOGGLE_CHART_SWAP_CLASS,
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${yOffset}px) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      opacity: 1,
                      transformOrigin: 'bottom',
                      transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                      transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-2 grid grid-flow-col auto-cols-fr items-start gap-1"
          style={{ bottom: `${axisLayout.axisBottomRem}rem`, minHeight: `${axisLayout.axisMinHeightRem}rem` }}
        >
          {comparisonBars.map((bar) => (
            <div
              key={`${bar.key}-axis`}
              className={cn('leading-none text-center', HOUSE_TOGGLE_CHART_LABEL_CLASS)}
            >
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-1 text-center leading-tight')}>
                {getMomentumAxisLabel(bar)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatMomentumOverviewTick(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  const rounded = roundMomentumOverviewValue(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function parsePublicationRecordDate(record: Pick<PublicationDrilldownRecord, 'publicationMonthStart' | 'publicationDate' | 'year'>): Date | null {
  if (record.publicationMonthStart) {
    const parsedMonth = new Date(`${record.publicationMonthStart}T00:00:00Z`)
    if (!Number.isNaN(parsedMonth.getTime())) {
      return parsedMonth
    }
  }
  if (record.publicationDate) {
    const parsedDate = new Date(`${record.publicationDate}T00:00:00Z`)
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate
    }
  }
  if (typeof record.year === 'number' && Number.isFinite(record.year)) {
    return new Date(Date.UTC(Math.round(record.year), 0, 1))
  }
  return null
}

function formatPublicationMonthYear(value: Date | null): string {
  if (!value) {
    return 'Not available'
  }
  return value.toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function roundMomentumOverviewValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.round(value * 10) / 10
}

function shiftUtcMonth(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
}

function parsePublicationMonthStart(value: string | null | undefined, year: number | null | undefined): Date | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(`${value.trim()}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1))
    }
  }
  if (typeof year === 'number' && Number.isFinite(year)) {
    return new Date(Date.UTC(Math.round(year), 0, 1))
  }
  return null
}

function formatMomentumTableAverageValue({
  totalCitations,
  months,
  publicationMonthStart,
  windowStart,
}: {
  totalCitations: number
  months: number
  publicationMonthStart: Date | null
  windowStart: Date
}): string {
  if (publicationMonthStart && publicationMonthStart.getTime() >= windowStart.getTime()) {
    return 'N/A'
  }
  if (totalCitations > 0) {
    return formatMomentumOverviewTick(totalCitations / months)
  }
  return formatMomentumOverviewTick(0)
}

type MomentumRecentCellTone = 'positive' | 'accent' | 'danger' | 'neutral'

function getMomentumRecentCellTone({
  recentTotalCitations,
  recentMonths,
  priorTotalCitations,
  priorMonths,
  isNotComparable,
}: {
  recentTotalCitations: number
  recentMonths: number
  priorTotalCitations: number
  priorMonths: number
  isNotComparable: boolean
}): MomentumRecentCellTone {
  if (isNotComparable) {
    return 'neutral'
  }
  const recentRate = recentMonths > 0 ? recentTotalCitations / recentMonths : 0
  const priorRate = priorMonths > 0 ? priorTotalCitations / priorMonths : 0
  if (recentRate <= 1e-6 && priorRate <= 1e-6) {
    return 'accent'
  }
  const ratio = recentRate / priorRate
  if (ratio >= 1.15) {
    return 'positive'
  }
  if (ratio <= 0.85) {
    return 'danger'
  }
  return 'accent'
}

function getMomentumRecentCellTintClass(tone: MomentumRecentCellTone): string {
  switch (tone) {
    case 'positive':
      return 'border-[hsl(var(--tone-positive-300)/0.92)] bg-[hsl(var(--tone-positive-50)/0.9)] text-[hsl(var(--tone-positive-800))]'
    case 'danger':
      return 'border-[hsl(var(--tone-danger-300)/0.92)] bg-[hsl(var(--tone-danger-50)/0.92)] text-[hsl(var(--tone-danger-800))]'
    case 'accent':
      return 'border-[hsl(var(--tone-accent-300)/0.92)] bg-[hsl(var(--tone-accent-50)/0.92)] text-[hsl(var(--tone-accent-800))]'
    default:
      return 'border-[hsl(var(--tone-neutral-300)/0.9)] bg-[hsl(var(--tone-neutral-100)/0.78)] text-[hsl(var(--tone-neutral-600))]'
  }
}

function isMomentumWindowComparable(publicationMonthStart: Date | null, windowStart: Date): boolean {
  return !publicationMonthStart || publicationMonthStart.getTime() < windowStart.getTime()
}

function buildMomentumOverviewTicks(values: number[]): [number, number, number] {
  const maxValue = Math.max(0, ...values)
  if (maxValue <= 0) {
    return [0, 1, 2]
  }
  const paddedMax = maxValue * 1.08
  const minimumStep = paddedMax / 2
  const exponent = Math.floor(Math.log10(Math.max(minimumStep, 1e-6)))
  const magnitude = 10 ** exponent
  const normalized = minimumStep / magnitude
  const niceNormalizedStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = niceNormalizedStep * magnitude
  return [0, step, step * 2]
}

function MomentumOverviewChart({
  tile,
  mode,
  yearBreakdown,
}: {
  tile: PublicationMetricTilePayload
  mode: MomentumWindowMode
  yearBreakdown: MomentumYearBreakdown | null
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const monthlyBreakdown = buildMomentumBreakdown(tile)
  const useYearMode = mode === '5y' && Boolean(yearBreakdown?.bars.length)
  const bars = useMemo(() => {
    const baseline = useYearMode ? yearBreakdown?.rate4y ?? null : monthlyBreakdown.rate9m
    const recent = useYearMode ? yearBreakdown?.rate1y ?? null : monthlyBreakdown.rate3m
    if (baseline === null && recent === null) {
      return []
    }
    return [
      {
        key: 'baseline',
        label: useYearMode ? 'Prior 4 years' : 'Prior 9 months',
        value: Math.max(0, baseline ?? 0),
        toneClass: HOUSE_CHART_BAR_ACCENT_CLASS,
      },
      {
        key: 'recent',
        label: useYearMode ? 'Recent 1 year' : 'Recent 3 months',
        value: Math.max(0, recent ?? 0),
        toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
      },
    ]
  }, [mode, monthlyBreakdown.rate3m, monthlyBreakdown.rate9m, useYearMode, yearBreakdown?.rate1y, yearBreakdown?.rate4y])

  const yTickValues = useMemo(() => {
    return buildMomentumOverviewTicks(bars.map((bar) => bar.value))
  }, [bars])
  const hasBars = bars.length > 0
  const animationKey = useMemo(
    () => `momentum-overview:${bars.map((bar) => `${bar.key}-${bar.value.toFixed(3)}`).join('|') || 'empty'}`,
    [bars],
  )
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars)

  const scaledMax = Math.max(1, yTickValues[yTickValues.length - 1] || 1)
  const chartLeftInsetRem = 3.35
  const chartBottomInsetRem = 3
  const chartTopInsetRem = 0.55
  const yAxisTickOffsetRem = 0.42

  if (!bars.length) {
    return <div className={HOUSE_DRILLDOWN_PLACEHOLDER_CLASS}>No monthly citation data.</div>
  }

  return (
    <div className={cn('relative h-[15rem] w-full', 'house-publications-trend-chart-frame-borderless')}>
      <div
        className="absolute"
        style={{
          left: `${chartLeftInsetRem}rem`,
          right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
          top: `${chartTopInsetRem}rem`,
          bottom: `${chartBottomInsetRem}rem`,
        }}
      >
        {[0, 0.5, 1].map((ratio) => (
          <div
            key={`momentum-overview-grid-${ratio}`}
            className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
            style={{
              bottom: `${ratio * 100}%`,
              borderTop: `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`,
            }}
            aria-hidden="true"
          />
        ))}
        <div
          className={cn('pointer-events-none absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
          style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.7)' }}
          aria-hidden="true"
        />
        <div
          className={cn('pointer-events-none absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
          style={{ borderRight: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 grid grid-cols-2 items-end gap-3 px-4">
          {bars.map((bar, index) => {
            const heightPct = bar.value <= 0 ? 3 : Math.max(6, (bar.value / scaledMax) * 100)
            const isActive = hoveredIndex === index
            return (
              <div
                key={bar.key}
                className="relative flex h-full min-h-0 items-end"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
              >
                <span
                  className={cn(
                    HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                    isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                  )}
                  style={{ bottom: `calc(${heightPct}% + ${PUBLICATIONS_CHART_TOOLTIP_OFFSET_REM}rem)` }}
                  aria-hidden="true"
                >
                  {formatMomentumOverviewTick(bar.value)}
                </span>
                <div
                  className={cn('w-full rounded-sm', HOUSE_TOGGLE_CHART_BAR_CLASS, bar.toneClass)}
                  style={{
                    height: `${heightPct}%`,
                    transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                    transformOrigin: 'bottom',
                    transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                    transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                  }}
                  aria-label={`${bar.label}: ${formatMomentumOverviewTick(bar.value)} average citations per month`}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div
        className="pointer-events-none absolute"
        style={{
          left: '0',
          width: `${chartLeftInsetRem - 0.55}rem`,
          top: `${chartTopInsetRem}rem`,
          bottom: `${chartBottomInsetRem}rem`,
        }}
        aria-hidden="true"
      >
        {yTickValues.map((tickValue, index) => {
          const ratio = scaledMax <= 0 ? 0 : tickValue / scaledMax
          return (
            <p
              key={`momentum-overview-y-${index}`}
              className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
              style={{ bottom: `calc(${ratio * 100}% - ${yAxisTickOffsetRem}rem)` }}
            >
              {formatMomentumOverviewTick(tickValue)}
            </p>
          )
        })}
        <p
          className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
          style={{ left: '0.65rem' }}
        >
          {useYearMode ? 'Avg cites / year' : 'Avg cites / month'}
        </p>
      </div>

      <div
        className={cn('pointer-events-none absolute grid grid-cols-2 gap-3 px-4', HOUSE_TOGGLE_CHART_LABEL_CLASS)}
        style={{
          left: `${chartLeftInsetRem}rem`,
          right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
          bottom: '1.3rem',
        }}
      >
        {bars.map((bar) => (
          <div key={`momentum-overview-label-${bar.key}`} className={cn('text-center leading-none', HOUSE_CHART_SCALE_TICK_CLASS)}>
            <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>{bar.label}</p>
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute"
        style={{
          left: `${chartLeftInsetRem}rem`,
          right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
          bottom: '0',
          minHeight: '1rem',
        }}
      >
        <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
          Comparison window
        </p>
      </div>
    </div>
  )
}

function parseNumericKeyedMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const output: Record<number, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numericKey = Number(key)
    const numericValue = Number(raw)
    if (!Number.isFinite(numericKey) || !Number.isFinite(numericValue)) {
      continue
    }
    output[Math.round(numericKey)] = numericValue
  }
  return output
}

function FieldPercentilePanel({
  tile,
  threshold,
  toggleControl,
}: {
  tile: PublicationMetricTilePayload
  threshold: FieldPercentileThreshold
  toggleControl?: ReactNode
}) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const shareMap = parseNumericKeyedMap(chartData.share_by_threshold_pct)
  const countMap = parseNumericKeyedMap(chartData.count_by_threshold)
  const evaluatedPapersRaw = Number(chartData.evaluated_papers)
  const evaluatedPapers = Number.isFinite(evaluatedPapersRaw)
    ? Math.max(0, Math.round(evaluatedPapersRaw))
    : 0
  const shareAboveRaw = shareMap[threshold]
  const shareAbove = Number.isFinite(shareAboveRaw)
    ? Math.max(0, Math.min(100, Number(shareAboveRaw)))
    : evaluatedPapers > 0
      ? (Math.max(0, Number(countMap[threshold] || 0)) / evaluatedPapers) * 100
      : 0
  const papersAtThresholdRaw = Number(countMap[threshold])
  const papersAtThreshold = Number.isFinite(papersAtThresholdRaw)
    ? Math.max(0, Math.round(papersAtThresholdRaw))
    : Math.max(0, Math.round((shareAbove / 100) * evaluatedPapers))
  const papersAtThresholdLabel = `${formatInt(papersAtThreshold)} ${papersAtThreshold === 1 ? 'paper' : 'papers'}`
  const hasPercentileData = evaluatedPapers > 0
  const shareClamped = Math.max(0, Math.min(100, shareAbove))
  const ringRadius = 38
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringAnimatedDash = (shareClamped / 100) * ringCircumference
  const ringEntryKey = useMemo(
    () => `${evaluatedPapers}`,
    [evaluatedPapers],
  )
  const isRingEntryCycle = useIsFirstChartEntry(ringEntryKey, hasPercentileData)
  const entryRingVisible = useUnifiedToggleBarAnimation(
    `${ringEntryKey}|entry`,
    hasPercentileData && isRingEntryCycle,
  )
  const ringVisible = isRingEntryCycle ? entryRingVisible : true
  const ringTransitionDuration = ringChartDurationVar(isRingEntryCycle)
  const ringTargetOffset = ringCircumference - ringAnimatedDash
  const ringVisibleOffset = ringVisible ? ringTargetOffset : ringCircumference
  const ringShareToneClass = FIELD_PERCENTILE_RING_CLASS_BY_THRESHOLD[threshold] || HOUSE_CHART_RING_MAIN_SVG_CLASS

  if (!hasPercentileData) {
    return <div className={dashboardTileStyles.emptyChart}>No field percentile data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {toggleControl ? (
        <div className="flex justify-center">
          <div className="pointer-events-auto">{toggleControl}</div>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 flex flex-col py-1.5">
        <div className="flex-1" />
        <div
          className={cn(
            HOUSE_CHART_RING_PANEL_CLASS,
            HOUSE_CHART_RING_TOGGLE_VISUAL_CLASS,
            HOUSE_CHART_TRANSITION_CLASS,
            HOUSE_CHART_RING_ENTERED_CLASS,
            'flex items-center justify-center',
          )}
        >
          <svg
            viewBox="0 0 100 100"
            className={cn(HOUSE_CHART_RING_SIZE_CLASS, 'shrink-0')}
            data-stop-tile-open="true"
          >
            <circle
              cx="50"
              cy="50"
              r={ringRadius}
              fill="none"
              className={HOUSE_CHART_RING_REMAINDER_SVG_CLASS}
              strokeWidth={HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
            <circle
              cx="50"
              cy="50"
              r={ringRadius}
              fill="none"
              className={cn(ringShareToneClass, 'house-chart-ring-dashoffset-motion')}
              strokeWidth={HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{
                strokeDasharray: ringCircumference,
                strokeDashoffset: ringVisibleOffset,
                '--chart-transition-duration': ringTransitionDuration,
              } as React.CSSProperties}
            />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className={HOUSE_CHART_RING_CENTER_LABEL_CLASS}>
              {papersAtThresholdLabel}
            </text>
          </svg>
        </div>
        <div className="flex-1" />
      </div>
    </div>
  )
}

function AuthorshipStructurePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const firstAuthorshipRaw = Number(chartData.first_authorship_pct)
  const secondAuthorshipRaw = Number(chartData.second_authorship_pct)
  const seniorAuthorshipRaw = Number(chartData.senior_authorship_pct)
  const leadershipIndexRaw = Number(chartData.leadership_index_pct)
  const firstAuthorshipPct = Number.isFinite(firstAuthorshipRaw)
    ? Math.max(0, Math.min(100, firstAuthorshipRaw))
    : 0
  const secondAuthorshipPct = Number.isFinite(secondAuthorshipRaw)
    ? Math.max(0, Math.min(100, secondAuthorshipRaw))
    : 0
  const seniorAuthorshipPct = Number.isFinite(seniorAuthorshipRaw)
    ? Math.max(0, Math.min(100, seniorAuthorshipRaw))
    : 0
  const leadershipIndexPct = Number.isFinite(leadershipIndexRaw)
    ? Math.max(0, Math.min(100, leadershipIndexRaw))
    : 0
  const totalPapersRaw = Number(chartData.total_papers)
  const totalPapers = Number.isFinite(totalPapersRaw) ? Math.max(0, Math.round(totalPapersRaw)) : 0
  const animationKey = useMemo(
    () => `${Math.round(firstAuthorshipPct)}-${Math.round(secondAuthorshipPct)}-${Math.round(seniorAuthorshipPct)}-${Math.round(leadershipIndexPct)}-${totalPapers}`,
    [firstAuthorshipPct, leadershipIndexPct, secondAuthorshipPct, seniorAuthorshipPct, totalPapers],
  )
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, totalPapers > 0)
  const isEntryCycle = useIsFirstChartEntry(animationKey, totalPapers > 0)

  if (totalPapers <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No authorship data</div>
  }

  const rows = [
    { key: 'first', label: 'First authorship', value: Math.round(firstAuthorshipPct), tone: HOUSE_CHART_BAR_ACCENT_CLASS },
    { key: 'second', label: 'Second authorship', value: Math.round(secondAuthorshipPct), tone: HOUSE_CHART_BAR_NEUTRAL_CLASS },
    { key: 'senior', label: 'Senior authorship', value: Math.round(seniorAuthorshipPct), tone: HOUSE_CHART_BAR_WARNING_CLASS },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_METRIC_PROGRESS_PANEL_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
      >
        {rows.map((row, index) => (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-caption leading-none">
              <span className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'house-metric-support-text font-semibold')}>{row.label}</span>
              <span className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'house-metric-support-text font-semibold')}>{row.value}%</span>
            </div>
            <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[var(--metric-progress-track-height)]')}>
              <div
                className={cn(
                  'h-full rounded-full house-progress-fill-motion',
                  row.tone,
                )}
                style={{
                  width: `${barsExpanded ? row.value : 0}%`,
                  transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                  '--chart-transition-duration': tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                } as React.CSSProperties}
                aria-hidden="true"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CollaborationStructurePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = useMemo(
    () => ((tile.chart_data || {}) as Record<string, unknown>),
    [tile.chart_data],
  )
  const drilldownData = useMemo(
    () => ((tile.drilldown || {}) as Record<string, unknown>),
    [tile.drilldown],
  )
  const uniqueCollaboratorsRaw = Number(chartData.unique_collaborators)
  const repeatRateRaw = Number(chartData.repeat_collaborator_rate_pct)
  const institutionCandidates = [
    Number(chartData.institutions),
    Number(chartData.institutions_count),
    Number(chartData.unique_institutions),
    Number(chartData.affiliated_institutions),
  ]
  const countryCandidates = [
    Number(chartData.countries),
    Number(chartData.countries_count),
    Number(chartData.unique_countries),
    Number(chartData.affiliated_countries),
  ]
  const continentCandidates = [
    Number(chartData.continents),
    Number(chartData.continents_count),
    Number(chartData.unique_continents),
    Number(chartData.affiliated_continents),
  ]

  const uniqueCollaborators = Number.isFinite(uniqueCollaboratorsRaw) ? Math.max(0, Math.round(uniqueCollaboratorsRaw)) : 0
  const repeatRatePct = Number.isFinite(repeatRateRaw) ? Math.max(0, Math.min(100, repeatRateRaw)) : 0
  const derivedCoverage = useMemo(() => {
    const normalizedInstitutionSet = new Set<string>()
    const normalizedCountrySet = new Set<string>()
    const normalizedContinentSet = new Set<string>()

    const pushValue = (set: Set<string>, raw: unknown) => {
      if (typeof raw !== 'string') {
        return
      }
      const clean = raw.trim().toLowerCase()
      if (!clean) {
        return
      }
      set.add(clean)
    }

    const collectInstitution = (raw: unknown) => {
      if (Array.isArray(raw)) {
        raw.forEach(collectInstitution)
        return
      }
      if (raw && typeof raw === 'object') {
        const row = raw as Record<string, unknown>
        pushValue(normalizedInstitutionSet, row.name)
        pushValue(normalizedInstitutionSet, row.display_name)
        pushValue(normalizedInstitutionSet, row.institution)
        pushValue(normalizedInstitutionSet, row.institution_name)
        pushValue(normalizedInstitutionSet, row.organization)
        pushValue(normalizedInstitutionSet, row.organization_name)
        return
      }
      pushValue(normalizedInstitutionSet, raw)
    }

    const collectCountry = (raw: unknown) => {
      if (Array.isArray(raw)) {
        raw.forEach(collectCountry)
        return
      }
      if (raw && typeof raw === 'object') {
        const row = raw as Record<string, unknown>
        pushValue(normalizedCountrySet, row.name)
        pushValue(normalizedCountrySet, row.display_name)
        pushValue(normalizedCountrySet, row.country)
        pushValue(normalizedCountrySet, row.country_name)
        pushValue(normalizedCountrySet, row.country_code)
        pushValue(normalizedContinentSet, row.continent)
        pushValue(normalizedContinentSet, row.continent_name)
        pushValue(normalizedContinentSet, row.region)
        pushValue(normalizedContinentSet, row.region_name)
        return
      }
      pushValue(normalizedCountrySet, raw)
    }

    const collectContinent = (raw: unknown) => {
      if (Array.isArray(raw)) {
        raw.forEach(collectContinent)
        return
      }
      if (raw && typeof raw === 'object') {
        const row = raw as Record<string, unknown>
        pushValue(normalizedContinentSet, row.name)
        pushValue(normalizedContinentSet, row.display_name)
        pushValue(normalizedContinentSet, row.continent)
        pushValue(normalizedContinentSet, row.continent_name)
        pushValue(normalizedContinentSet, row.region)
        pushValue(normalizedContinentSet, row.region_name)
        return
      }
      pushValue(normalizedContinentSet, raw)
    }

    const collectFromMapKeys = (
      target: Set<string>,
      raw: unknown,
    ) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return
      }
      Object.keys(raw as Record<string, unknown>).forEach((key) => pushValue(target, key))
    }

    collectInstitution(chartData.institutions_list)
    collectInstitution(chartData.institution_names)
    collectInstitution(chartData.top_institutions)
    collectInstitution(chartData.institutions_breakdown)
    collectCountry(chartData.countries_list)
    collectCountry(chartData.country_names)
    collectCountry(chartData.top_countries)
    collectCountry(chartData.countries_breakdown)
    collectContinent(chartData.continents_list)
    collectContinent(chartData.continent_names)
    collectContinent(chartData.top_continents)
    collectContinent(chartData.continents_breakdown)
    collectFromMapKeys(normalizedInstitutionSet, chartData.institutions_by_name)
    collectFromMapKeys(normalizedCountrySet, chartData.countries_by_name)
    collectFromMapKeys(normalizedContinentSet, chartData.continents_by_name)

    const drilldownPublications = Array.isArray(drilldownData.publications)
      ? drilldownData.publications
      : []
    drilldownPublications.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return
      }
      const row = entry as Record<string, unknown>
      collectInstitution(row.institution)
      collectInstitution(row.institution_name)
      collectInstitution(row.institutions)
      collectCountry(row.country)
      collectCountry(row.country_name)
      collectCountry(row.countries)
      collectContinent(row.continent)
      collectContinent(row.continent_name)
      collectContinent(row.continents)
      collectContinent(row.region)
      collectContinent(row.region_name)

      const affiliations = Array.isArray(row.affiliations) ? row.affiliations : []
      affiliations.forEach((affiliation) => {
        if (!affiliation || typeof affiliation !== 'object') {
          return
        }
        const aff = affiliation as Record<string, unknown>
        collectInstitution(aff.institution)
        collectInstitution(aff.institution_name)
        collectInstitution(aff.organization)
        collectCountry(aff.country)
        collectCountry(aff.country_name)
        collectContinent(aff.continent)
        collectContinent(aff.continent_name)
        collectContinent(aff.region)
        collectContinent(aff.region_name)
      })
    })

    return {
      institutionCount: normalizedInstitutionSet.size,
      countryCount: normalizedCountrySet.size,
      continentCount: normalizedContinentSet.size,
    }
  }, [chartData, drilldownData.publications])

  const explicitInstitutionCount = institutionCandidates.find((value) => Number.isFinite(value) && value > 0)
  const explicitCountryCount = countryCandidates.find((value) => Number.isFinite(value) && value > 0)
  const institutionsBase = Math.max(
    explicitInstitutionCount ? Math.round(explicitInstitutionCount) : 0,
    derivedCoverage.institutionCount,
  )
  const countriesBase = Math.max(
    explicitCountryCount ? Math.round(explicitCountryCount) : 0,
    derivedCoverage.countryCount,
  )
  const explicitContinentCount = continentCandidates.find((value) => Number.isFinite(value) && value > 0)
  const continentsBase = Math.max(
    explicitContinentCount ? Math.round(explicitContinentCount) : 0,
    derivedCoverage.continentCount,
  )
  const institutions = institutionsBase > 0 ? institutionsBase : 0
  const countries = countriesBase > 0 ? countriesBase : 0
  const continents = continentsBase > 0 ? continentsBase : 0

  const summaryRows = [
    { key: 'institutions', label: 'Institutions', value: institutions },
    { key: 'countries', label: 'Countries', value: countries },
    { key: 'continents', label: 'Continents', value: continents },
  ] as const

  const totalSignal = uniqueCollaborators + institutions + countries + continents + Math.round(repeatRatePct)
  const progressAnimationKey = useMemo(
    () => tile.key || 'collaboration_structure',
    [tile.key],
  )
  const isEntryCycle = useIsFirstChartEntry(progressAnimationKey, totalSignal > 0)
  const progressDurationMs = tileAxisDurationMs(isEntryCycle)
  const animatedRepeatRate = useEasedValue(
    Math.max(0, Math.min(100, repeatRatePct)),
    `${progressAnimationKey}|repeat-rate`,
    totalSignal > 0,
    progressDurationMs,
  )
  const progressWidth = Math.max(0, Math.min(100, animatedRepeatRate))
  if (totalSignal <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No collaboration data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_METRIC_PROGRESS_PANEL_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {summaryRows.map((row, index) => (
            <div key={row.key}>
              <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                <span className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'house-metric-support-text leading-tight')}>{row.label}</span>
                <span className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'house-metric-support-text leading-tight text-center')}>{formatInt(Math.max(0, Number(row.value)))}</span>
              </div>
              {index < summaryRows.length - 1 ? (
                <div className="my-1 h-px bg-[hsl(var(--stroke-soft)/0.72)]" />
              ) : null}
            </div>
          ))}
          <div className="mt-3.5 pt-0.5">
            <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'house-metric-support-text leading-tight')}>
                Repeat collaborator rate
              </p>
              <span className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'house-metric-support-text text-right leading-tight')}>
                {`${Math.round(repeatRatePct)}%`}
              </span>
            </div>
            <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[var(--metric-progress-track-height)]')}>
              <div
                className={cn('h-full rounded-full', HOUSE_CHART_BAR_POSITIVE_CLASS)}
                style={{
                  width: `${progressWidth}%`,
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export type PublicationDrilldownSortKey = 'year' | 'title' | 'role' | 'type' | 'venue' | 'citations'
export type PublicationTrajectoryMode = 'raw' | 'moving_avg' | 'cumulative'
type PublicationVolumeTableDateSortMode = 'newest' | 'oldest'

type PublicationDrilldownRecord = {
  workId: string
  year: number | null
  publicationDate: string | null
  publicationMonthStart: string | null
  title: string
  role: string
  type: string
  publicationType: string
  articleType: string
  venue: string
  citations: number
  citations1yRolling?: number
  citations3yRolling?: number
  citations5yRolling?: number
  citationsLifeRolling?: number
}

export type CitationMomentumSourceRecord = Pick<
  PublicationDrilldownRecord,
  'workId' | 'year' | 'title' | 'citations' | 'citations1yRolling' | 'citations3yRolling'
>

export type CitationMomentumRecord = CitationMomentumSourceRecord & {
  recentCitations: number
  prior24MonthCitations: number
  publicationAgeYears: number | null
  recentShareOf3yPct: number
  momentumDelta: number
}

function parsePublicationCitationCount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  }
  if (typeof value !== 'string') {
    return 0
  }
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) {
    return 0
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

function resolvePublicationCitationValueForWindow(
  record: PublicationDrilldownRecord,
  windowMode: PublicationsWindowMode,
): number {
  if (windowMode === '1y' && typeof record.citations1yRolling === 'number') {
    return Math.max(0, Number(record.citations1yRolling) || 0)
  }
  if (windowMode === '3y' && typeof record.citations3yRolling === 'number') {
    return Math.max(0, Number(record.citations3yRolling) || 0)
  }
  if (windowMode === '5y' && typeof record.citations5yRolling === 'number') {
    return Math.max(0, Number(record.citations5yRolling) || 0)
  }
  if (windowMode === 'all' && typeof record.citationsLifeRolling === 'number') {
    return Math.max(0, Number(record.citationsLifeRolling) || 0)
  }
  return Math.max(0, Number(record.citations || 0))
}

const CITATION_MOMENTUM_MIN_PUBLICATION_AGE = 3
const CITATION_MOMENTUM_DEFAULT_LIMIT = 5

export function buildCitationMomentumLists(
  publications: CitationMomentumSourceRecord[],
  {
    referenceYear = new Date().getUTCFullYear(),
    limit = CITATION_MOMENTUM_DEFAULT_LIMIT,
  }: {
    referenceYear?: number
    limit?: number
  } = {},
): {
  sleeping: CitationMomentumRecord[]
  freshPickup: CitationMomentumRecord[]
} {
  const safeReferenceYear = Number.isInteger(referenceYear) ? Number(referenceYear) : new Date().getUTCFullYear()
  const safeLimit = Math.max(0, Math.round(Number.isFinite(limit) ? limit : CITATION_MOMENTUM_DEFAULT_LIMIT))
  const normalizedRecords = publications.map<CitationMomentumRecord>((record) => {
    const normalizedYear = Number.isInteger(record.year) ? Number(record.year) : null
    const title = String(record.title || '').trim()
    const lifetimeCitations = parsePublicationCitationCount(record.citations)
    const recentCitations = parsePublicationCitationCount(record.citations1yRolling ?? 0)
    const rolling3Citations = Math.max(recentCitations, parsePublicationCitationCount(record.citations3yRolling ?? 0))
    const prior24MonthCitations = Math.max(0, rolling3Citations - recentCitations)
    const publicationAgeYears = normalizedYear === null ? null : Math.max(0, safeReferenceYear - normalizedYear)
    return {
      workId: record.workId,
      year: normalizedYear,
      title,
      citations: lifetimeCitations,
      citations1yRolling: recentCitations,
      citations3yRolling: rolling3Citations,
      recentCitations,
      prior24MonthCitations,
      publicationAgeYears,
      recentShareOf3yPct: rolling3Citations > 0 ? (recentCitations / rolling3Citations) * 100 : 0,
      momentumDelta: recentCitations - prior24MonthCitations,
    }
  })
  const isMatureEnough = (record: CitationMomentumRecord) => (
    record.publicationAgeYears === null || record.publicationAgeYears >= CITATION_MOMENTUM_MIN_PUBLICATION_AGE
  )
  const compareByTitle = (left: CitationMomentumRecord, right: CitationMomentumRecord) => (
    left.title.localeCompare(right.title, 'en-GB')
  )
  const sleeping = normalizedRecords
    .filter((record) => (
      isMatureEnough(record)
      && record.citations >= 10
      && record.recentCitations <= 1
      && (record.prior24MonthCitations > 0 || record.citations >= 25)
    ))
    .slice()
    .sort((left, right) => {
      if (right.citations !== left.citations) {
        return right.citations - left.citations
      }
      if (right.prior24MonthCitations !== left.prior24MonthCitations) {
        return right.prior24MonthCitations - left.prior24MonthCitations
      }
      if (left.recentCitations !== right.recentCitations) {
        return left.recentCitations - right.recentCitations
      }
      return compareByTitle(left, right)
    })
    .slice(0, safeLimit)
  const freshPickup = normalizedRecords
    .filter((record) => (
      isMatureEnough(record)
      && record.recentCitations >= 3
      && record.recentCitations > record.prior24MonthCitations
    ))
    .slice()
    .sort((left, right) => {
      if (right.momentumDelta !== left.momentumDelta) {
        return right.momentumDelta - left.momentumDelta
      }
      if (right.recentCitations !== left.recentCitations) {
        return right.recentCitations - left.recentCitations
      }
      if (right.citations !== left.citations) {
        return right.citations - left.citations
      }
      return compareByTitle(left, right)
    })
    .slice(0, safeLimit)
  return {
    sleeping,
    freshPickup,
  }
}

const PUBLICATION_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  article: 'Journal article',
  'journal-article': 'Journal article',
  'journal-paper': 'Journal article',
  preprint: 'Other',
  'pre-print': 'Other',
  'posted-content': 'Other',
  'conference-abstract': 'Conference abstract',
  'meeting-abstract': 'Conference abstract',
  'conference-paper': 'Conference abstract',
  'conference-poster': 'Conference abstract',
  'conference-presentation': 'Conference abstract',
  'proceedings-article': 'Conference abstract',
  proceedings: 'Conference abstract',
  review: 'Review article',
  'review-article': 'Review article',
  'book-chapter': 'Book chapter',
  book: 'Book chapter',
  dissertation: 'Other',
  dataset: 'Dataset',
  'data-set': 'Dataset',
  'published-dataset': 'Dataset',
  'published-data-set': 'Dataset',
}

function normalizePublicationCategoryKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toSentenceCaseLabel(value: string): string {
  const clean = String(value || '')
    .trim()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (!clean) {
    return 'Unspecified'
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function formatPublicationCategoryLabel(value: string | null | undefined): string {
  const normalized = normalizePublicationCategoryKey(value)
  if (!normalized) {
    return 'Unspecified'
  }
  return PUBLICATION_TYPE_LABEL_OVERRIDES[normalized] || toSentenceCaseLabel(value || '')
}

const ARTICLE_TYPE_META_ANALYSIS_PATTERN = /\b(meta[-\s]?analysis|meta[-\s]?review|pooled analysis)\b/i
const ARTICLE_TYPE_SCOPING_PATTERN = /\b(scoping review|evidence map)\b/i
const ARTICLE_TYPE_SR_PATTERN = /\b(systematic review|umbrella review|rapid review)\b/i
const ARTICLE_TYPE_LITERATURE_PATTERN = /\b(literature review|narrative review|review article|review)\b/i
const ARTICLE_TYPE_EDITORIAL_PATTERN = /\b(editorial|commentary|perspective|viewpoint|opinion)\b/i
const ARTICLE_TYPE_CASE_PATTERN = /\b(case report|case series)\b/i
const ARTICLE_TYPE_PROTOCOL_PATTERN = /\b(protocol|study protocol)\b/i
const ARTICLE_TYPE_LETTER_PATTERN = /\b(letter|correspondence)\b/i
const ARTICLE_TYPE_PUBLICATION_ONLY_KEYS = new Set([
  'article',
  'journal-article',
  'journal-paper',
  'conference-abstract',
  'conference-paper',
  'conference-poster',
  'conference-presentation',
  'proceedings',
  'proceedings-article',
  'book',
  'book-chapter',
  'dataset',
  'data-set',
  'preprint',
  'pre-print',
  'posted-content',
  'dissertation',
  'other',
])

function inferArticleTypeFromText(value: string | null | undefined): string {
  const clean = String(value || '').trim()
  if (!clean) {
    return 'Original'
  }
  if (ARTICLE_TYPE_META_ANALYSIS_PATTERN.test(clean)) {
    return 'Systematic review'
  }
  if (ARTICLE_TYPE_SCOPING_PATTERN.test(clean)) {
    return 'Systematic review'
  }
  if (ARTICLE_TYPE_SR_PATTERN.test(clean)) {
    return 'Systematic review'
  }
  if (ARTICLE_TYPE_LITERATURE_PATTERN.test(clean)) {
    return 'Literature review'
  }
  if (ARTICLE_TYPE_EDITORIAL_PATTERN.test(clean)) {
    return 'Editorial'
  }
  if (ARTICLE_TYPE_CASE_PATTERN.test(clean)) {
    return 'Case report'
  }
  if (ARTICLE_TYPE_PROTOCOL_PATTERN.test(clean)) {
    return 'Protocol'
  }
  if (ARTICLE_TYPE_LETTER_PATTERN.test(clean)) {
    return 'Letter'
  }
  return 'Original'
}

function formatArticleCategoryLabel(
  articleTypeValue: string | null | undefined,
  title: string | null | undefined,
  publicationTypeValue: string | null | undefined,
): string {
  const articleKey = normalizePublicationCategoryKey(articleTypeValue)
  if (!articleKey) {
    return inferArticleTypeFromText(title)
  }
  if (
    articleKey === 'sr' ||
    articleKey === 'systematic-review' ||
    articleKey === 'meta-analysis' ||
    articleKey === 'meta-review' ||
    articleKey === 'umbrella-review' ||
    articleKey === 'rapid-review'
  ) {
    return 'Systematic review'
  }
  if (articleKey === 'scoping' || articleKey === 'scoping-review' || articleKey === 'evidence-map') {
    return 'Systematic review'
  }
  if (articleKey === 'literature-review' || articleKey === 'narrative-review') {
    return 'Literature review'
  }
  if (articleKey === 'original' || articleKey === 'original-article' || articleKey === 'research-article') {
    return 'Original'
  }
  if (articleKey === 'editorial' || articleKey === 'commentary' || articleKey === 'perspective' || articleKey === 'opinion') {
    return 'Editorial'
  }
  if (articleKey === 'case-report' || articleKey === 'case-series') {
    return 'Case report'
  }
  if (articleKey === 'protocol' || articleKey === 'study-protocol') {
    return 'Protocol'
  }
  if (articleKey === 'letter' || articleKey === 'correspondence') {
    return 'Letter'
  }
  const publicationKey = normalizePublicationCategoryKey(publicationTypeValue)
  if (ARTICLE_TYPE_PUBLICATION_ONLY_KEYS.has(articleKey) || ARTICLE_TYPE_PUBLICATION_ONLY_KEYS.has(publicationKey)) {
    return inferArticleTypeFromText(title)
  }
  return toSentenceCaseLabel(articleTypeValue || '')
}

function normalizeRoleLabel(value: string): string {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'first') {
    return 'First'
  }
  if (clean === 'second') {
    return 'Second'
  }
  if (clean === 'last') {
    return 'Senior'
  }
  if (!clean || clean === 'unknown') {
    return 'Unknown'
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

void normalizeRoleLabel

type PublicationCategoryDimension = 'publication' | 'article'

type PublicationCategoryWindowBars = {
  bars: Array<{
    key: string
    label: string
    count: number
    percentage: number
    paperCount: number
    perPaper: number
  }>
  rangeLabel: string | null
  totalCount: number
}

const MIN_PUBLICATION_TYPE_BAR_VALUE = 1

function categoryLabelFromPublication(
  record: PublicationDrilldownRecord,
  dimension: PublicationCategoryDimension,
): string {
  if (dimension === 'article') {
    return formatArticleCategoryLabel(record.articleType, record.title, record.publicationType)
  }
  const label = formatPublicationCategoryLabel(record.publicationType || '')
  const normalized = normalizePublicationCategoryKey(label)
  if (normalized === 'conference-abstract') {
    return 'Abstract'
  }
  if (normalized === 'book' || normalized === 'book-chapter') {
    return 'Book chapter'
  }
  if (normalized === 'dissertation') {
    return 'Other'
  }
  return label
}

type TotalPublicationsContextMixShiftRow = {
  key: string
  dimensionLabel: string
  lifetimeValue: string
  recentValue: string
  reading: string
}

type TotalPublicationsContextStats = {
  emptyReason: string | null
  firstPublicationValue: string
  activeSpanValue: string
  yearsWithOutputValue: string
  longestStreakValue: string
  maturityNarrative: string
  maturityNote: string | null
  recentWindowLabel: string
  earlierWindowLabel: string
  recentSharePct: number | null
  earlierSharePct: number | null
  recentMeanValue: string
  baselineMeanValue: string
  momentumValue: string
  recentNarrative: string
  recentNote: string | null
  mixShiftRows: TotalPublicationsContextMixShiftRow[]
  mixShiftNote: string | null
}

type TotalPublicationsContextLeader = {
  label: string
  count: number
  sharePct: number
}

function buildTotalPublicationsContextLeader(
  records: PublicationDrilldownRecord[],
  labelResolver: (record: PublicationDrilldownRecord) => string,
): TotalPublicationsContextLeader | null {
  const counts = new Map<string, number>()
  let total = 0

  records.forEach((record) => {
    const label = labelResolver(record).trim()
    if (!label) {
      return
    }
    total += 1
    counts.set(label, (counts.get(label) || 0) + 1)
  })

  if (!counts.size || total <= 0) {
    return null
  }

  const [label, count] = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }
    return left[0].localeCompare(right[0])
  })[0]

  return {
    label,
    count,
    sharePct: (count / total) * 100,
  }
}

function buildTotalPublicationsMixShiftReading(
  lifetimeLeader: TotalPublicationsContextLeader | null,
  recentLeader: TotalPublicationsContextLeader | null,
  recentWindowLabel: string,
): string {
  if (!lifetimeLeader || !recentLeader) {
    return 'Not enough classified records in complete publication years.'
  }

  const normalizedRecentWindowLabel = recentWindowLabel.charAt(0).toLowerCase() + recentWindowLabel.slice(1)
  if (lifetimeLeader.label !== recentLeader.label) {
    return `Shifted from ${lifetimeLeader.label} to ${recentLeader.label} in ${normalizedRecentWindowLabel}.`
  }

  const shareDelta = recentLeader.sharePct - lifetimeLeader.sharePct
  if (shareDelta >= 10) {
    return `${recentLeader.label} is more concentrated in ${normalizedRecentWindowLabel}.`
  }
  if (shareDelta <= -10) {
    return `Recent output is less concentrated in ${recentLeader.label} than the lifetime pattern.`
  }
  return 'Recent mix is broadly consistent with the lifetime portfolio.'
}

function formatTotalPublicationsContextWindowDisplayLabel(label: string): string {
  return label
    .replace(' complete years', ' years')
    .replace(' complete year', ' year')
}

function buildTotalPublicationsMixShiftRow({
  key,
  dimensionLabel,
  lifetimeRecords,
  recentRecords,
  recentWindowLabel,
  labelResolver,
}: {
  key: string
  dimensionLabel: string
  lifetimeRecords: PublicationDrilldownRecord[]
  recentRecords: PublicationDrilldownRecord[]
  recentWindowLabel: string
  labelResolver: (record: PublicationDrilldownRecord) => string
}): TotalPublicationsContextMixShiftRow {
  const lifetimeLeader = buildTotalPublicationsContextLeader(lifetimeRecords, labelResolver)
  const recentLeader = buildTotalPublicationsContextLeader(recentRecords, labelResolver)
  const lifetimeValue = lifetimeLeader
    ? `${lifetimeLeader.label} (${formatPercentWhole(lifetimeLeader.sharePct)})`
    : 'Not enough data'
  const recentValue = recentLeader
    ? `${recentLeader.label} (${formatPercentWhole(recentLeader.sharePct)})`
    : 'Not enough data'

  return {
    key,
    dimensionLabel,
    lifetimeValue,
    recentValue,
    reading: buildTotalPublicationsMixShiftReading(lifetimeLeader, recentLeader, recentWindowLabel),
  }
}

function buildTotalPublicationsContextStats({
  publicationRecords,
  patternStats,
  phaseStats,
}: {
  publicationRecords: PublicationDrilldownRecord[]
  patternStats: PublicationProductionPatternStats
  phaseStats: PublicationProductionPhaseStats
}): TotalPublicationsContextStats {
  const firstPublicationValue = patternStats.firstPublicationYear === null
    ? '\u2014'
    : String(patternStats.firstPublicationYear)
  const activeSpanValue = patternStats.activeSpan > 0
    ? `${formatInt(patternStats.activeSpan)} years`
    : '\u2014'
  const yearsWithOutputValue = patternStats.activeSpan > 0
    ? `${formatInt(patternStats.yearsWithOutput)} / ${formatInt(patternStats.activeSpan)}`
    : '\u2014'
  const longestStreakValue = patternStats.longestStreak > 0
    ? `${formatInt(patternStats.longestStreak)} years`
    : '\u2014'

  let maturityNarrative = 'Portfolio maturity context is not available yet.'
  if (phaseStats.emptyReason) {
    maturityNarrative = phaseStats.emptyReason
  } else if (phaseStats.insufficientHistory) {
    maturityNarrative = `Complete-year history is still limited. ${phaseStats.interpretation}`
  } else {
    const continuityPhrase = patternStats.outputContinuity === null
      ? 'limited continuity context'
      : `${getPublicationOutputContinuityInterpretation(patternStats.outputContinuity).toLowerCase()} continuity`
    maturityNarrative = `The portfolio is currently ${phaseStats.phaseLabel.toLowerCase()}, spanning ${formatInt(patternStats.activeSpan)} active years with ${continuityPhrase} and a longest streak of ${formatInt(patternStats.longestStreak)} consecutive years.`
  }

  const maturityNote = phaseStats.confidenceNote
    ?? (patternStats.lowVolume ? getPublicationProductionPatternLowVolumeNote(patternStats.totalPublications) : null)

  const recentWindowSize = Math.max(1, Math.min(3, phaseStats.years.length || 1))
  const recentWindowLabel = recentWindowSize === 1
    ? 'Last complete year'
    : `Last ${formatInt(recentWindowSize)} complete years`
  const earlierYearCount = Math.max(0, phaseStats.years.length - recentWindowSize)
  const earlierWindowLabel = earlierYearCount > 0
    ? `Earlier ${formatInt(earlierYearCount)} years`
    : 'Earlier years'
  const recentSharePct = phaseStats.recentShare === null ? null : phaseStats.recentShare * 100
  const earlierSharePct = recentSharePct === null ? null : Math.max(0, 100 - recentSharePct)
  const recentMeanValue = phaseStats.recentMean === null ? '\u2014' : phaseStats.recentMean.toFixed(1)
  const baselineMeanValue = phaseStats.baselineMean === null ? '\u2014' : phaseStats.baselineMean.toFixed(1)
  const momentumValue = phaseStats.momentum === null
    ? '\u2014'
    : `${phaseStats.momentum >= 0 ? '+' : ''}${phaseStats.momentum.toFixed(1)}`

  let recentNarrative = 'Recent-versus-earlier comparison is not available yet.'
  if (phaseStats.emptyReason) {
    recentNarrative = phaseStats.emptyReason
  } else if (phaseStats.usableYears <= 1 || phaseStats.recentMean === null) {
    recentNarrative = 'More complete publication years are needed to compare recent output with an earlier baseline.'
  } else if (phaseStats.baselineMean === null || earlierYearCount <= 0) {
    recentNarrative = `${recentWindowLabel} currently account for most of the observed complete-year history.`
  } else if ((phaseStats.momentum ?? 0) > 0.5) {
    recentNarrative = `${recentWindowLabel} account for ${formatPercentWhole(recentSharePct ?? 0)} of complete-year output and are running above the earlier baseline.`
  } else if ((phaseStats.momentum ?? 0) < -0.5) {
    recentNarrative = `${recentWindowLabel} account for ${formatPercentWhole(recentSharePct ?? 0)} of complete-year output and sit below the earlier baseline.`
  } else {
    recentNarrative = `${recentWindowLabel} are broadly in line with the earlier output baseline.`
  }

  const recentNoteParts: string[] = []
  if (patternStats.totalPublications > patternStats.scopedPublicationCount) {
    recentNoteParts.push('Comparisons exclude the current partial year.')
  }
  if (phaseStats.confidenceNote) {
    recentNoteParts.push(phaseStats.confidenceNote)
  }

  const completeYears = new Set(phaseStats.years)
  const recentYears = new Set(phaseStats.years.slice(-recentWindowSize))
  const completeScopeRecords = publicationRecords.filter((record) => record.year !== null && completeYears.has(record.year))
  const recentRecords = completeScopeRecords.filter((record) => record.year !== null && recentYears.has(record.year))
  const mixShiftRows = completeScopeRecords.length > 0
    ? [
      buildTotalPublicationsMixShiftRow({
        key: 'publication-type',
        dimensionLabel: 'Publication type',
        lifetimeRecords: completeScopeRecords,
        recentRecords,
        recentWindowLabel,
        labelResolver: (record) => categoryLabelFromPublication(record, 'publication'),
      }),
      buildTotalPublicationsMixShiftRow({
        key: 'article-type',
        dimensionLabel: 'Article type',
        lifetimeRecords: completeScopeRecords,
        recentRecords,
        recentWindowLabel,
        labelResolver: (record) => categoryLabelFromPublication(record, 'article'),
      }),
      buildTotalPublicationsMixShiftRow({
        key: 'venue',
        dimensionLabel: 'Journal',
        lifetimeRecords: completeScopeRecords,
        recentRecords,
        recentWindowLabel,
        labelResolver: (record) => record.venue.trim() || 'Unspecified journal',
      }),
    ]
    : []
  const mixShiftNote = completeScopeRecords.length <= 0
    ? 'Composition shift needs publication-level classification data in complete publication years.'
    : recentNoteParts[0] || null

  return {
    emptyReason: phaseStats.emptyReason,
    firstPublicationValue,
    activeSpanValue,
    yearsWithOutputValue,
    longestStreakValue,
    maturityNarrative,
    maturityNote,
    recentWindowLabel,
    earlierWindowLabel,
    recentSharePct,
    earlierSharePct,
    recentMeanValue,
    baselineMeanValue,
    momentumValue,
    recentNarrative,
    recentNote: recentNoteParts.length ? recentNoteParts.join(' ') : null,
    mixShiftRows,
    mixShiftNote,
  }
}

export function PublicationCategoryDistributionChart({
  publications,
  dimension,
  xAxisLabel,
  yAxisLabel = 'Publications',
  emptyLabel,
  animate = true,
  enableValueModeToggle = false,
  valueMetric = 'count',
}: {
  publications: PublicationDrilldownRecord[]
  dimension: PublicationCategoryDimension
  xAxisLabel: string
  yAxisLabel?: string
  emptyLabel: string
  animate?: boolean
  enableValueModeToggle?: boolean
  valueMetric?: 'count' | 'citations'
}) {
  const valueModeOptions = valueMetric === 'citations'
    ? PUBLICATION_CITATION_VALUE_MODE_OPTIONS
    : PUBLICATION_VALUE_MODE_OPTIONS
  const perItemToggleLabel = dimension === 'article' ? 'Per article' : 'Per publication'
  const perItemAxisLabel = dimension === 'article' ? 'Citations per article' : 'Citations per publication'
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('all')
  const [valueMode, setValueMode] = useState<PublicationCategoryValueMode>('percentage')
  const [displayMode, setDisplayMode] = useState<PublicationCategoryDisplayMode>('chart')
  const [renderDisplayMode, setRenderDisplayMode] = useState<PublicationCategoryDisplayMode>('chart')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  useEffect(() => {
    setWindowMode('all')
    setValueMode('percentage')
    setDisplayMode('chart')
    setRenderDisplayMode('chart')
  }, [dimension, publications.length])

  useEffect(() => {
    setRenderDisplayMode(displayMode)
  }, [displayMode])

  const yearsWithData = useMemo(() => {
    const values = publications
      .map((record) => record.year)
      .filter((value): value is number => Number.isFinite(value) && value !== null)
    return Array.from(new Set(values)).sort((left, right) => left - right)
  }, [publications])
  const minYear = yearsWithData.length ? yearsWithData[0] : new Date().getUTCFullYear()
  const maxYear = yearsWithData.length ? yearsWithData[yearsWithData.length - 1] : minYear
  const fullYears = useMemo(() => {
    const output: number[] = []
    for (let year = minYear; year <= maxYear; year += 1) {
      output.push(year)
    }
    return output
  }, [maxYear, minYear])
  const windowYears = useMemo(() => {
    const windowSize = windowMode === '1y'
      ? 1
      : windowMode === '3y'
        ? 3
        : windowMode === '5y'
          ? 5
          : null
    return windowSize === null
      ? fullYears
      : fullYears.slice(-windowSize)
  }, [fullYears, windowMode])
  const resolvedAbsoluteYAxisLabel = useMemo(() => {
    const labelBase = valueMetric === 'citations' ? 'Citations' : 'Publications'
    switch (windowMode) {
      case '1y':
        return `${labelBase} (1 year)`
      case '3y':
        return `${labelBase} (3 years)`
      case '5y':
        return `${labelBase} (5 years)`
      default: {
        const now = new Date()
        const startYear = yearsWithData.length ? yearsWithData[0] : null
        if (startYear === null) {
          return yAxisLabel
        }
        const startDateMs = Date.UTC(startYear, 0, 1)
        const yearsCovered = Math.max(0.1, (now.getTime() - startDateMs) / (365.25 * 24 * 60 * 60 * 1000))
        return `${labelBase} (${formatRoundedOneDecimalTrimmed(yearsCovered)} years)`
      }
    }
  }, [valueMetric, windowMode, yAxisLabel, yearsWithData])

  const categoryConfig = useMemo(() => {
    const totals = new Map<string, number>()
    for (const record of publications) {
      if (record.year === null) {
        continue
      }
      const label = categoryLabelFromPublication(record, dimension)
      const metricValue = valueMetric === 'citations'
        ? Math.max(0, Number(record.citations || 0))
        : 1
      totals.set(label, (totals.get(label) || 0) + metricValue)
    }
    const sortedLabels = Array.from(totals.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1]
        }
        return left[0].localeCompare(right[0])
      })
      .map(([label]) => label)
    const maxPrimaryCategories = 7
    return {
      primaryLabels: sortedLabels.slice(0, maxPrimaryCategories),
      hasOtherBucket: sortedLabels.length > maxPrimaryCategories,
    }
  }, [dimension, publications, valueMetric])

  const barsByWindowMode = useMemo(() => {
    const primaryLabelSet = new Set(categoryConfig.primaryLabels)
    const categoryPaperCounts = new Map<string, number>()
    for (const record of publications) {
      const label = categoryLabelFromPublication(record, dimension)
      categoryPaperCounts.set(label, (categoryPaperCounts.get(label) || 0) + 1)
    }
    const build = (mode: PublicationsWindowMode): PublicationCategoryWindowBars => {
      const windowSize = mode === '1y'
        ? 1
        : mode === '3y'
          ? 3
          : mode === '5y'
            ? 5
            : null
      const windowYears = windowSize === null
        ? fullYears
        : fullYears.slice(-windowSize)
      const yearSet = new Set(windowYears)
      const counts = new Map<string, number>()
      let otherCount = 0
      let otherPaperCount = 0
      for (const record of publications) {
        const isYearWindowMatch = record.year !== null && yearSet.has(record.year)
        if (valueMetric === 'count' && !isYearWindowMatch) {
          continue
        }
        const label = categoryLabelFromPublication(record, dimension)
        const metricValue = valueMetric === 'citations'
          ? resolvePublicationCitationValueForWindow(record, mode)
          : 1
        if (primaryLabelSet.has(label)) {
          counts.set(label, (counts.get(label) || 0) + metricValue)
          continue
        }
        if (categoryConfig.hasOtherBucket) {
          otherCount += metricValue
        }
      }
      for (const [label, paperCount] of categoryPaperCounts.entries()) {
        if (primaryLabelSet.has(label)) {
          continue
        }
        if (categoryConfig.hasOtherBucket) {
          otherPaperCount += Math.max(0, paperCount)
        }
      }
      const bars = categoryConfig.primaryLabels.map((label) => ({
        key: label,
        label,
        count: Math.max(0, counts.get(label) || 0),
        percentage: 0,
        paperCount: Math.max(0, categoryPaperCounts.get(label) || 0),
        perPaper: 0,
      }))
      if (categoryConfig.hasOtherBucket) {
        bars.push({
          key: 'Other',
          label: 'Other',
          count: Math.max(0, otherCount),
          percentage: 0,
          paperCount: Math.max(0, otherPaperCount),
          perPaper: 0,
        })
      }
      const totalCount = Math.max(
        0,
        bars.reduce((sum, bar) => sum + Math.max(0, bar.count), 0),
      )
      const normalizedBars = bars.map((bar) => ({
        ...bar,
        percentage: totalCount > 0 ? (bar.count / totalCount) * 100 : 0,
        perPaper: bar.paperCount > 0 ? bar.count / bar.paperCount : 0,
      }))
      const visibleBars = normalizedBars.filter((bar) => Math.max(0, bar.count) >= MIN_PUBLICATION_TYPE_BAR_VALUE)
      const visibleTotalCount = Math.max(
        0,
        visibleBars.reduce((sum, bar) => sum + Math.max(0, bar.count), 0),
      )
      const visibleBarsWithPct = visibleBars.map((bar) => ({
        ...bar,
        percentage: visibleTotalCount > 0 ? (Math.max(0, bar.count) / visibleTotalCount) * 100 : 0,
      }))
      const rangeLabel = windowYears.length
        ? windowYears[0] === windowYears[windowYears.length - 1]
          ? String(windowYears[0])
          : `${windowYears[0]}-${windowYears[windowYears.length - 1]}`
        : null
      return { bars: visibleBarsWithPct, rangeLabel, totalCount: visibleTotalCount }
    }
    return {
      '1y': build('1y'),
      '3y': build('3y'),
      '5y': build('5y'),
      all: build('all'),
    } as const
  }, [categoryConfig.hasOtherBucket, categoryConfig.primaryLabels, dimension, fullYears, publications, valueMetric])
  const tableRows = useMemo(() => {
    const yearSet = new Set(windowYears)
    const counts = new Map<string, number>()
    const paperCounts = new Map<string, number>()
    for (const record of publications) {
      const label = categoryLabelFromPublication(record, dimension)
      paperCounts.set(label, (paperCounts.get(label) || 0) + 1)
    }
    for (const record of publications) {
      const isYearWindowMatch = record.year !== null && yearSet.has(record.year)
      if (valueMetric === 'count' && !isYearWindowMatch) {
        continue
      }
      const label = categoryLabelFromPublication(record, dimension)
      const metricValue = valueMetric === 'citations'
        ? resolvePublicationCitationValueForWindow(record, windowMode)
        : 1
      counts.set(label, (counts.get(label) || 0) + metricValue)
    }
    const visibleRows = Array.from(counts.entries())
      .filter(([, count]) => Math.max(0, count) >= MIN_PUBLICATION_TYPE_BAR_VALUE)
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1]
        }
        return left[0].localeCompare(right[0])
      })
    const totalCount = visibleRows.reduce((sum, [, count]) => sum + Math.max(0, count), 0)
    return visibleRows
      .map(([label, count]) => ({
        label,
        count,
        percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
        paperCount: Math.max(0, paperCounts.get(label) || 0),
        perPaper: Math.max(0, paperCounts.get(label) || 0) > 0
          ? count / Math.max(1, paperCounts.get(label) || 0)
          : 0,
      }))
  }, [dimension, publications, valueMetric, windowMode, windowYears])
  const tableShareWholePercents = useMemo(
    () => allocateWholePercentages(tableRows.map((row) => row.percentage)),
    [tableRows],
  )

  const activeWindowBars = barsByWindowMode[windowMode]
  const activeBars = activeWindowBars.bars
  const hasBars = activeBars.length > 0
  const showPercentageMode = enableValueModeToggle && valueMode === 'percentage'
  const showPerPaperMode = enableValueModeToggle && valueMode === 'perPaper' && valueMetric === 'citations'
  const renderValueForBar = (
    bar: { count: number; percentage: number; perPaper: number },
  ): number => (
    showPercentageMode
      ? Math.max(0, bar.percentage)
      : showPerPaperMode
        ? Math.max(0, bar.perPaper)
        : Math.max(0, bar.count)
  )
  const formatPerPaperValue = (value: number): string => (
    formatInt(Math.round(Math.max(0, value)))
  )
  const formatTooltipLabel = (
    bar: { label: string; count: number; percentage: number; paperCount: number; perPaper: number },
  ): string => {
    if (valueMetric === 'count') {
      const publicationCount = Math.max(0, Math.round(bar.count))
      const publicationsLabel = `${formatInt(publicationCount)} ${pluralize(publicationCount, 'publication')}`
      const shareLabel = `${Math.round(bar.percentage)}%`
      return showPercentageMode
        ? `${shareLabel} (${publicationsLabel})`
        : `${publicationsLabel} (${shareLabel})`
    }
    const citationCount = Math.max(0, Math.round(bar.count))
    const citationLabel = `${formatInt(citationCount)} ${pluralize(citationCount, 'citation')}`
    const shareLabel = `${Math.round(bar.percentage)}%`
    if (showPercentageMode) {
      return `${shareLabel} (${citationLabel})`
    }
    if (showPerPaperMode) {
      return `${formatPerPaperValue(Math.max(0, bar.perPaper))} per ${bar.label.toLowerCase()}`
    }
    return `${citationLabel} (${shareLabel})`
  }
  const animationKey = useMemo(
    () => `${dimension}|${windowMode}|${valueMode}|${activeBars.map((bar) => `${bar.label}-${bar.count}-${bar.perPaper}`).join('|')}`,
    [activeBars, dimension, valueMode, windowMode],
  )
  const isEntryCycle = useIsFirstChartEntry(animationKey, animate && hasBars)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const renderBars = activeBars
  const barsExpanded = useUnifiedToggleBarAnimation(
    `${animationKey}|distribution-bars`,
    animate && hasBars && renderDisplayMode === 'chart',
    'entry-only',
  )
  const renderedValuesTarget = useMemo(
    () => renderBars.map((bar) => (
      showPercentageMode
        ? Math.max(0, bar.percentage)
        : showPerPaperMode
          ? Math.max(0, bar.perPaper)
          : Math.max(0, bar.count)
    )),
    [renderBars, showPerPaperMode, showPercentageMode],
  )
  const renderedValuesAnimated = renderedValuesTarget

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  const maxAbsoluteWindowValue = Math.max(
    1,
    ...Object.values(barsByWindowMode).flatMap((windowBars) =>
      windowBars.bars.map((bar) => Math.max(0, bar.count)),
    ),
    ...[...activeBars, ...renderBars].map((bar) => Math.max(0, bar.count)),
  )
  const absoluteAxisScale = buildNiceAxis(maxAbsoluteWindowValue)
  const maxWindowValue = showPercentageMode
    ? 100
    : showPerPaperMode
      ? Math.max(
        1,
        ...[...activeBars, ...renderBars].map((bar) => Math.max(0, bar.perPaper)),
      )
    : Math.max(
      1,
      ...[...activeBars, ...renderBars].map((bar) => Math.max(0, bar.count)),
    )
  const targetAxisScale = showPercentageMode
    ? { axisMax: 100, ticks: [0, 25, 50, 75, 100] }
    : buildNiceAxis(maxWindowValue)
  const targetAxisMax = targetAxisScale.axisMax
  const axisMax = targetAxisMax
  const displayedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|distribution-y-axis-max`,
    animate && hasBars && renderDisplayMode === 'chart',
    axisDurationMs,
  )
  const yAxisTickRatios = targetAxisScale.ticks.map((tickValue) => (
    targetAxisScale.axisMax <= 0 ? 0 : tickValue / targetAxisScale.axisMax
  ))
  const yAxisTickValues = yAxisTickRatios.map((ratio) => ratio * Math.max(1, displayedAxisMax))
  const gridTickRatios = yAxisTickRatios.slice(1).filter((ratio) => Number.isFinite(ratio) && ratio > 0 && ratio < 1)

  const xAxisLabelLayout = mergeChartAxisLayouts(
    PUBLICATIONS_WINDOW_OPTIONS.map((option) =>
      buildChartAxisLayout({
        axisLabels: barsByWindowMode[option.value].bars.map((bar) => bar.label),
        showXAxisName: true,
        xAxisName: xAxisLabel,
        dense: barsByWindowMode[option.value].bars.length >= 6,
        maxLabelLines: 2,
        maxSubLabelLines: 1,
        maxAxisNameLines: 2,
      })),
  )
  const fixedToggleYAxisTicks = enableValueModeToggle
    ? Array.from(new Set<number>([
      ...absoluteAxisScale.ticks,
      ...(valueMetric === 'citations'
        ? Object.values(barsByWindowMode).flatMap((windowBars) =>
          buildNiceAxis(
            Math.max(1, ...windowBars.bars.map((bar) => Math.max(0, bar.perPaper))),
          ).ticks)
        : []),
      0,
      25,
      50,
      75,
      100,
    ])).sort((left, right) => left - right)
    : yAxisTickValues
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(
    fixedToggleYAxisTicks,
    true,
    enableValueModeToggle ? 2 : 0,
  )
  const yAxisTitleLeft = '34%'
  const chartLeftInset = `${yAxisPanelWidthRem + 0.55}rem`
  const plotAreaStyle = {
    left: chartLeftInset,
    right: '0.5rem',
    top: '1rem',
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: '0.5rem',
    bottom: `${xAxisLabelLayout.axisBottomRem}rem`,
    minHeight: `${xAxisLabelLayout.axisMinHeightRem}rem`,
  }
  const yAxisPanelStyle = {
    left: '0.25rem',
    top: '1rem',
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const chartFrameStyle = {
    paddingBottom: `${xAxisLabelLayout.framePaddingBottomRem}rem`,
  }
  const yAxisTickOffsetRem = 0.4
  const useSeparatedValueModeToggle = valueModeOptions.length >= 2
  const activeValueModeIndex = valueModeOptions.findIndex((option) => option.value === valueMode)
  const valueModeGridTemplate = useMemo(
    () => valueModeOptions.map(() => 'max-content').join(' '),
    [valueModeOptions],
  )
  const valueModeThumbStyle: CSSProperties = buildTileToggleThumbStyle(
    Math.max(0, activeValueModeIndex),
    valueModeOptions.length,
    isEntryCycle,
  )
  const tableHeadingLabel = dimension === 'article' ? 'Article type' : 'Publication type'
  const tableTotalCount = tableRows.reduce((sum, row) => sum + row.count, 0)
  const tableTotalPapers = tableRows.reduce((sum, row) => sum + row.paperCount, 0)
  const tableTotalPerPaper = tableTotalPapers > 0 ? tableTotalCount / tableTotalPapers : 0
  const distributionRootClassName = renderDisplayMode === 'table'
    ? 'flex h-auto min-h-0 w-full flex-col'
    : 'flex h-[17.6rem] min-h-[17.6rem] w-full flex-col'

  return (
    <div className={distributionRootClassName}>
      <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'house-publications-trends-controls-row justify-between')}>
        <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
          <PublicationWindowToggle value={windowMode} onChange={setWindowMode} />
          {enableValueModeToggle && renderDisplayMode !== 'table' ? (
            <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
              <div
                className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, useSeparatedValueModeToggle && 'overflow-hidden')}
                data-stop-tile-open="true"
                data-ui={`${dimension}-value-mode-toggle`}
                data-house-role="chart-toggle"
                style={{
                  width: 'auto',
                  minWidth: 'fit-content',
                  gridTemplateColumns: valueModeGridTemplate,
                }}
              >
                {!useSeparatedValueModeToggle ? (
                  <span
                    className={HOUSE_TOGGLE_THUMB_CLASS}
                    style={valueModeThumbStyle}
                    aria-hidden="true"
                  />
                ) : null}
                {valueModeOptions.map((option, optionIndex) => (
                  <button
                    key={`${dimension}-value-mode-${option.value}`}
                    type="button"
                    data-stop-tile-open="true"
                    className={cn(
                      HOUSE_TOGGLE_BUTTON_CLASS,
                      useSeparatedValueModeToggle
                        ? [
                          'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-1.5 text-center',
                          optionIndex === 0
                            ? '!rounded-l-full !rounded-r-none'
                            : optionIndex === valueModeOptions.length - 1
                              ? '!rounded-l-none !rounded-r-full'
                              : '!rounded-none',
                          option.value !== valueMode
                            ? HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS
                            : 'bg-foreground text-background',
                        ]
                        : valueMode === option.value
                          ? 'text-white'
                          : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                    )}
                    style={useSeparatedValueModeToggle && activeValueModeIndex !== -1
                      ? {
                        borderLeft: valueModeOptions[0]?.value === option.value
                          ? undefined
                          : '1px solid hsl(var(--stroke-soft) / 0.7)',
                      }
                      : undefined}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (valueMode === option.value) {
                        return
                      }
                      setValueMode(option.value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    aria-pressed={valueMode === option.value}
                  >
                    {option.value === 'perPaper' ? perItemToggleLabel : option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2 overflow-hidden')}
              data-stop-tile-open="true"
              data-ui={`${dimension}-display-mode-toggle`}
              data-house-role="chart-toggle"
              style={{ width: '5.25rem' }}
            >
              <button
                type="button"
                data-stop-tile-open="true"
                className={cn(
                  HOUSE_TOGGLE_BUTTON_CLASS,
                  'house-segmented-fill-toggle-button !rounded-l-full !rounded-r-none',
                  displayMode === 'chart' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  if (displayMode === 'chart') {
                    return
                  }
                  setDisplayMode('chart')
                }}
                onMouseDown={(event) => event.stopPropagation()}
                aria-pressed={displayMode === 'chart'}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(HOUSE_TOGGLE_CHART_BAR_CLASS, 'h-3.5 w-3.5 fill-current')}>
                  <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
                  <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
                  <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
                </svg>
              </button>
              <button
                type="button"
                data-stop-tile-open="true"
                className={cn(
                  HOUSE_TOGGLE_BUTTON_CLASS,
                  'house-segmented-fill-toggle-button !rounded-l-none !rounded-r-full border-l border-[hsl(var(--stroke-soft)/0.7)]',
                  displayMode === 'table' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  if (displayMode === 'table') {
                    return
                  }
                  setDisplayMode('table')
                }}
                onMouseDown={(event) => event.stopPropagation()}
                aria-pressed={displayMode === 'table'}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                  <rect
                    x="2.2"
                    y="3"
                    width="11.6"
                    height="10"
                    rx="1.1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <line x1="2.9" y1="6.1" x2="13.1" y2="6.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="2.9" y1="9.1" x2="13.1" y2="9.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <line x1="6.1" y1="3.7" x2="6.1" y2="12.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      {renderDisplayMode === 'table' ? (
        <div className="w-full overflow-visible" data-ui={`${dimension}-distribution-table-frame`}>
          <div
            className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
            style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
          >
            <table
              className="w-full border-collapse"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <thead className="house-table-head">
                <tr>
                  <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">
                    {tableHeadingLabel}
                  </th>
                  <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                    {showPerPaperMode ? (dimension === 'article' ? 'Cites/article' : 'Cites/publication') : 'Count'}
                  </th>
                  <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                    {showPerPaperMode ? 'Papers' : 'Share'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr key={`${dimension}-table-row-${row.label}`} className="house-table-row">
                    <td className="house-table-cell-text px-2 py-2">
                      <span className="block max-w-full break-words leading-snug">{row.label}</span>
                    </td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatPerPaperValue(row.perPaper) : formatInt(row.count)}
                    </td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatInt(row.paperCount) : `${tableShareWholePercents[index] || 0}%`}
                    </td>
                  </tr>
                ))}
                {tableRows.length ? (
                  <tr className="house-table-row">
                    <td className="house-table-cell-text px-2 py-2 font-semibold">Total</td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center font-semibold whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatPerPaperValue(tableTotalPerPaper) : formatInt(tableTotalCount)}
                    </td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center font-semibold whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatInt(tableTotalPapers) : '100%'}
                    </td>
                  </tr>
                ) : null}
                {!tableRows.length ? (
                  <tr>
                    <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS)} colSpan={3}>
                      {emptyLabel}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : hasBars ? (
        <div
          className={cn(
            HOUSE_CHART_TRANSITION_CLASS,
            HOUSE_CHART_SERIES_BY_SLOT_CLASS,
            HOUSE_CHART_ENTERED_CLASS,
            'house-publications-trend-chart-frame-borderless',
          )}
          style={chartFrameStyle}
          data-ui={`${dimension}-distribution-chart-frame`}
          data-house-role="chart-frame"
        >
        <div className="absolute" style={plotAreaStyle}>
          <div
            className={cn('pointer-events-none absolute inset-x-0 bottom-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
            aria-hidden="true"
          />
          {gridTickRatios.map((ratio, index) => (
            <div
              key={`${dimension}-grid-${index}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ bottom: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
              aria-hidden="true"
            />
          ))}
          <div
            className={cn('pointer-events-none absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
            style={{ borderRight: `1px solid hsl(var(--stroke-soft) / 0.55)` }}
            aria-hidden="true"
          />
          <div
            className={cn('pointer-events-none absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-end gap-1">
            {renderBars.map((bar, index) => {
              const animatedValue = Math.max(0, renderedValuesAnimated[index] ?? renderValueForBar(bar))
              const heightPct = animatedValue <= 0 ? 3 : Math.min(100, Math.max(6, (animatedValue / axisMax) * 100))
              const isActive = hoveredIndex === index
              const hoverScaleX = isActive && renderBars.length > 1 ? 1.035 : 1
              return (
                <div
                  key={`${bar.key}-${index}`}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                >
                    <span
                      className={cn(
                        HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                        'min-w-[5.5rem] text-center',
                        isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                      )}
                      style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                      aria-hidden="true"
                    >
                      <span className="block whitespace-nowrap">{formatTooltipLabel(bar)}</span>
                    </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      HOUSE_CHART_BAR_ACCENT_CLASS,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${hoverScaleX}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: '0ms',
                      transitionDuration: 'var(--motion-duration-chart-toggle)',
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
          {yAxisTickValues.map((tickValue, index) => {
            const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
            const tickRatioKey = Math.round((yAxisTickRatios[index] || 0) * 1000)
            return (
              <p
                key={`${dimension}-y-axis-${tickRatioKey}`}
                className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                style={{
                  bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)`,
                  transitionDuration: `${axisDurationMs}ms`,
                  transitionProperty: 'bottom,opacity',
                }}
              >
                {showPercentageMode ? `${Math.round(tickValue)}%` : showPerPaperMode ? formatPerPaperValue(tickValue) : formatInt(tickValue)}
              </p>
            )
          })}
          <p
            className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
            style={{ left: yAxisTitleLeft }}
          >
            {showPercentageMode ? 'Share (%)' : showPerPaperMode ? perItemAxisLabel : resolvedAbsoluteYAxisLabel}
          </p>
        </div>
        <div className={cn('pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1', HOUSE_TOGGLE_CHART_LABEL_CLASS)} style={xAxisTicksStyle}>
          {renderBars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className="text-center leading-none">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                {bar.label}
              </p>
            </div>
          ))}
        </div>
        <div
          className="pointer-events-none absolute"
          style={{
            left: chartLeftInset,
            right: '0.5rem',
            bottom: `${xAxisLabelLayout.xAxisNameBottomRem}rem`,
            minHeight: `${xAxisLabelLayout.xAxisNameMinHeightRem}rem`,
          }}
        >
          <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
            {xAxisLabel}
          </p>
        </div>
      </div>
      ) : (
        <div className={cn(dashboardTileStyles.emptyChart, 'mt-3 flex-1')}>
          {emptyLabel}
        </div>
      )}
    </div>
  )
}

function SplitBreakdownViewToggle({
  value,
  onChange,
}: {
  value: SplitBreakdownViewMode
  onChange: (mode: SplitBreakdownViewMode) => void
}) {
  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2 overflow-hidden')}
        data-stop-tile-open="true"
        data-house-role="chart-toggle"
        style={{ width: '5.25rem' }}
      >
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-full !rounded-r-none',
            value === 'bar' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'bar'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('bar')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(HOUSE_TOGGLE_CHART_BAR_CLASS, 'h-3.5 w-3.5 fill-current')}>
            <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
            <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
            <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
          </svg>
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-none !rounded-r-full border-l border-[hsl(var(--stroke-soft)/0.7)]',
            value === 'table' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'table'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('table')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
            <rect
              x="2.2"
              y="3"
              width="11.6"
              height="10"
              rx="1.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <line x1="2.9" y1="6.1" x2="13.1" y2="6.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="2.9" y1="9.1" x2="13.1" y2="9.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="6.1" y1="3.7" x2="6.1" y2="12.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function CitationActivationHistorySeriesToggle({
  value,
  onChange,
}: {
  value: CitationActivationHistorySeriesMode
  onChange: (mode: CitationActivationHistorySeriesMode) => void
}) {
  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className="house-segmented-auto-toggle"
        data-stop-tile-open="true"
      >
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-full !rounded-r-none px-3',
            value === 'default' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'default'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('default')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Default
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-none !rounded-r-full px-3',
            value === 'activeInactive' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'activeInactive'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('activeInactive')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Active/inactive
        </button>
      </div>
    </div>
  )
}

function PublicationProductionYearScopeToggle({
  value,
  onChange,
}: {
  value: PublicationProductionYearScopeMode
  onChange: (mode: PublicationProductionYearScopeMode) => void
}) {
  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div className="house-segmented-auto-toggle" data-stop-tile-open="true">
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-full !rounded-r-none px-3.5',
            value === 'complete' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'complete'}
          onClick={(event) => {
            event.stopPropagation()
            if (value === 'complete') {
              return
            }
            onChange('complete')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Full years
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-none !rounded-r-full px-3.5',
            value === 'include_current' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'include_current'}
          onClick={(event) => {
            event.stopPropagation()
            if (value === 'include_current') {
              return
            }
            onChange('include_current')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          YTD
        </button>
      </div>
    </div>
  )
}

function CitationMomentumViewToggle({
  value,
  onChange,
}: {
  value: CitationMomentumViewMode
  onChange: (mode: CitationMomentumViewMode) => void
}) {
  const activeIndex = value === 'sleeping' ? 0 : 1

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
        style={{ width: '13rem' }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeIndex, 2, false)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', value === 'sleeping' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'sleeping'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('sleeping')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Sleeping
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', value === 'freshPickup' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'freshPickup'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('freshPickup')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Fresh pickup
        </button>
      </div>
    </div>
  )
}

function CitationActivationTableModeToggle({
  value,
  onChange,
}: {
  value: CitationActivationTableMode
  onChange: (mode: CitationActivationTableMode) => void
}) {
  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div className="house-segmented-auto-toggle" data-stop-tile-open="true">
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-full !rounded-r-none px-3',
            value === 'newlyActive' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'newlyActive'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('newlyActive')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Newly active
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-none px-3',
            value === 'stillActive' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'stillActive'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('stillActive')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Still active
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'house-segmented-fill-toggle-button !rounded-l-none !rounded-r-full px-3',
            value === 'inactive' ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          aria-pressed={value === 'inactive'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('inactive')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Inactive
        </button>
      </div>
    </div>
  )
}

function HIndexThresholdCandidateToggle({
  nextLabel,
  afterLabel,
  value,
  onChange,
}: {
  nextLabel: string
  afterLabel: string
  value: HIndexSummaryThresholdTableMode
  onChange: (mode: HIndexSummaryThresholdTableMode) => void
}) {
  const activeIndex = value === 'after' ? 1 : 0

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
        style={{ width: '11rem', minWidth: '11rem', maxWidth: '11rem' }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeIndex, 2, false)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', value === 'next' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'next'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('next')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {nextLabel}
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', value === 'after' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'after'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('after')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {afterLabel}
        </button>
      </div>
    </div>
  )
}

function PublicationWindowToggle<TValue extends string>({
  value,
  onChange,
  options,
}: {
  value: TValue
  onChange: (mode: TValue) => void
  options?: Array<{ value: TValue; label: string }>
}) {
  const resolvedOptions = options ?? (PUBLICATIONS_WINDOW_OPTIONS as Array<{ value: TValue; label: string }>)
  const activeIndex = Math.max(0, resolvedOptions.findIndex((option) => option.value === value))
  const gridColsClass = resolvedOptions.length === 2
    ? 'grid-cols-2'
    : resolvedOptions.length === 3
      ? 'grid-cols-3'
      : 'grid-cols-[24%_24%_24%_28%]'
  const toggleWidth = resolvedOptions.length === 2
    ? '11rem'
    : resolvedOptions.length === 3
      ? '6.75rem'
      : '8.75rem'
  const thumbStyle: CSSProperties = resolvedOptions.length === 4
    ? (() => {
      const segmentWidths = [24, 24, 24, 28]
      const safeIndex = Math.max(0, Math.min(activeIndex, segmentWidths.length - 1))
      const left = segmentWidths.slice(0, safeIndex).reduce((sum, width) => sum + width, 0)
      return {
        width: `${segmentWidths[safeIndex]}%`,
        left: `${left}%`,
        willChange: 'left,width',
      }
    })()
    : buildTileToggleThumbStyle(activeIndex, resolvedOptions.length, false)

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, gridColsClass)}
        data-stop-tile-open="true"
        style={{ width: toggleWidth, minWidth: toggleWidth, maxWidth: toggleWidth }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={thumbStyle}
          aria-hidden="true"
        />
        {resolvedOptions.map((option) => (
          <button
            key={`recent-concentration-window-${option.value}`}
            type="button"
            data-stop-tile-open="true"
            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', value === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
            onClick={(event) => {
              event.stopPropagation()
              if (value === option.value) {
                return
              }
              onChange(option.value)
            }}
            onMouseDown={(event) => event.stopPropagation()}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TotalPublicationsDrilldownWorkspace({
  tile,
  activeTab,
  animateCharts = true,
  token = null,
  onOpenPublication: _onOpenPublication,
  onDrilldownTabChange,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  animateCharts?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  onDrilldownTabChange?: (tab: DrilldownTab) => void
}) {
  void _onOpenPublication
  const [publicationTrendsWindowMode, setPublicationTrendsWindowMode] = useState<PublicationsWindowMode>('all')
  const [publicationTrendsVisualMode, setPublicationTrendsVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const [publicationVolumeTableDateSortMode, setPublicationVolumeTableDateSortMode] = useState<PublicationVolumeTableDateSortMode>('newest')
  const [publicationProductionYearScopeMode, setPublicationProductionYearScopeMode] = useState<PublicationProductionYearScopeMode>('complete')
  const [publicationTrendsExpanded, setPublicationTrendsExpanded] = useState(true)
  const [publicationProductionPhaseExpanded, setPublicationProductionPhaseExpanded] = useState(true)
  const [publicationProductionPatternExpanded, setPublicationProductionPatternExpanded] = useState(true)
  const [publicationTypeTrendsExpanded, setPublicationTypeTrendsExpanded] = useState(true)
  const [articleTypeTrendsExpanded, setArticleTypeTrendsExpanded] = useState(true)
  const [trajectoryMode, setTrajectoryMode] = useState<PublicationTrajectoryMode>('raw')
  const [trajectoryRangeStart, setTrajectoryRangeStart] = useState(0)
  const [trajectoryRangeEnd, setTrajectoryRangeEnd] = useState(0)
  const [trajectoryTooltipYear, setTrajectoryTooltipYear] = useState<number | null>(null)
  const [venueBreakdownExpanded, setVenueBreakdownExpanded] = useState(true)
  const [journalBreakdownViewMode, setJournalBreakdownViewMode] = useState<JournalBreakdownViewMode>('top-ten')
  const [topicBreakdownViewMode, setTopicBreakdownViewMode] = useState<TopicBreakdownViewMode>('top-ten')
  const [topicBreakdownExpanded, setTopicBreakdownExpanded] = useState(true)
  const [oaStatusBreakdownExpanded, setOaStatusBreakdownExpanded] = useState(true)
  const [publicationInsightsByRequestKey, setPublicationInsightsByRequestKey] = useState<Record<string, PublicationInsightsAgentPayload>>({})
  const [publicationInsightsLoadingByRequestKey, setPublicationInsightsLoadingByRequestKey] = useState<Record<string, boolean>>({})
  const [publicationInsightsErrorByRequestKey, setPublicationInsightsErrorByRequestKey] = useState<Record<string, string>>({})
  const publicationInsightsInFlightRef = useRef<Partial<Record<string, Promise<PublicationInsightsAgentPayload | null>>>>({})
  const [publicationProductionPhaseInsightOpen, setPublicationProductionPhaseInsightOpen] = useState(false)
  const [publicationProductionPatternInsightOpen, setPublicationProductionPatternInsightOpen] = useState(false)
  const [publicationVolumeOverTimeInsightOpen, setPublicationVolumeOverTimeInsightOpen] = useState(false)
  const [publicationArticleTypeOverTimeInsightOpen, setPublicationArticleTypeOverTimeInsightOpen] = useState(false)
  const [publicationTypeOverTimeInsightOpen, setPublicationTypeOverTimeInsightOpen] = useState(false)
  const journalBreakdownThumbStyle: CSSProperties = journalBreakdownViewMode === 'all-journals'
    ? {
      width: '58%',
      left: '42%',
      willChange: 'left,width',
    }
    : {
      width: '42%',
      left: '0%',
      willChange: 'left,width',
    }
  const topicBreakdownThumbStyle: CSSProperties = topicBreakdownViewMode === 'all-topics'
    ? {
      width: '58%',
      left: '42%',
      willChange: 'left,width',
    }
    : {
      width: '42%',
      left: '0%',
      willChange: 'left,width',
    }

  useEffect(() => {
    setPublicationTrendsWindowMode('all')
    setPublicationTrendsVisualMode('bars')
    setPublicationProductionYearScopeMode('complete')
    setPublicationTrendsExpanded(true)
    setPublicationProductionPhaseExpanded(true)
    setPublicationProductionPatternExpanded(true)
    setPublicationTypeTrendsExpanded(true)
    setArticleTypeTrendsExpanded(true)
    setTrajectoryMode('raw')
    setTrajectoryRangeStart(0)
    setTrajectoryRangeEnd(0)
    setTrajectoryTooltipYear(null)
    setVenueBreakdownExpanded(true)
    setJournalBreakdownViewMode('top-ten')
    setTopicBreakdownViewMode('top-ten')
    setTopicBreakdownExpanded(true)
    setOaStatusBreakdownExpanded(true)
    publicationInsightsInFlightRef.current = {}
    setPublicationInsightsByRequestKey({})
    setPublicationInsightsLoadingByRequestKey({})
    setPublicationInsightsErrorByRequestKey({})
    setPublicationProductionPhaseInsightOpen(false)
    setPublicationProductionPatternInsightOpen(false)
    setPublicationVolumeOverTimeInsightOpen(false)
    setPublicationArticleTypeOverTimeInsightOpen(false)
    setPublicationTypeOverTimeInsightOpen(false)
  }, [tile.key])

  const requestPublicationInsights = useCallback(
    async ({
      windowId,
      sectionKey,
      scope = 'window',
    }: {
      windowId: PublicationsWindowMode
      sectionKey: PublicationInsightsSectionKey
      scope?: 'window' | 'section'
    }) => {
      const normalizedWindowId = windowId === 'all' ? 'all' : windowId
      const requestKey = `${sectionKey}:${scope}:${normalizedWindowId}`
      if (publicationInsightsByRequestKey[requestKey]) {
        return publicationInsightsByRequestKey[requestKey]
      }
      if (publicationInsightsInFlightRef.current[requestKey]) {
        return publicationInsightsInFlightRef.current[requestKey]
      }
      if (!token) {
        const message = 'Session token is required to generate publication insights.'
        setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: message }))
        return null
      }
      const requestPromise = (async () => {
        setPublicationInsightsLoadingByRequestKey((current) => ({ ...current, [requestKey]: true }))
        setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: '' }))
        try {
          const payload = await fetchPublicationInsightsAgent(token, {
            windowId: normalizedWindowId,
            scope,
            sectionKey,
          })
          setPublicationInsightsByRequestKey((current) => ({ ...current, [requestKey]: payload }))
          return payload
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not generate publication insights.'
          setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: message }))
          return null
        } finally {
          delete publicationInsightsInFlightRef.current[requestKey]
          setPublicationInsightsLoadingByRequestKey((current) => ({ ...current, [requestKey]: false }))
        }
      })()
      publicationInsightsInFlightRef.current[requestKey] = requestPromise
      return requestPromise
    },
    [publicationInsightsByRequestKey, token],
  )

  const onTogglePublicationProductionPatternInsight = useCallback(() => {
    setPublicationProductionPatternInsightOpen((current) => {
      const next = !current
      if (next) {
        setPublicationProductionPhaseInsightOpen(false)
        setPublicationVolumeOverTimeInsightOpen(false)
        setPublicationArticleTypeOverTimeInsightOpen(false)
        setPublicationTypeOverTimeInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'publication_output_pattern',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onTogglePublicationProductionPhaseInsight = useCallback(() => {
    setPublicationProductionPhaseInsightOpen((current) => {
      const next = !current
      if (next) {
        setPublicationProductionPatternInsightOpen(false)
        setPublicationVolumeOverTimeInsightOpen(false)
        setPublicationArticleTypeOverTimeInsightOpen(false)
        setPublicationTypeOverTimeInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'publication_production_phase',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onTogglePublicationVolumeOverTimeInsight = useCallback(() => {
    setPublicationVolumeOverTimeInsightOpen((current) => {
      const next = !current
      if (next) {
        setPublicationProductionPhaseInsightOpen(false)
        setPublicationProductionPatternInsightOpen(false)
        setPublicationArticleTypeOverTimeInsightOpen(false)
        setPublicationTypeOverTimeInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'publication_volume_over_time',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onTogglePublicationArticleTypeOverTimeInsight = useCallback(() => {
    setPublicationArticleTypeOverTimeInsightOpen((current) => {
      const next = !current
      if (next) {
        setPublicationProductionPhaseInsightOpen(false)
        setPublicationProductionPatternInsightOpen(false)
        setPublicationVolumeOverTimeInsightOpen(false)
        setPublicationTypeOverTimeInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'publication_article_type_over_time',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onTogglePublicationTypeOverTimeInsight = useCallback(() => {
    setPublicationTypeOverTimeInsightOpen((current) => {
      const next = !current
      if (next) {
        setPublicationProductionPhaseInsightOpen(false)
        setPublicationProductionPatternInsightOpen(false)
        setPublicationVolumeOverTimeInsightOpen(false)
        setPublicationArticleTypeOverTimeInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'publication_type_over_time',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  useEffect(() => {
    if (!publicationProductionPhaseInsightOpen) {
      return
    }
    const requestKey = 'publication_production_phase:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'publication_production_phase',
      scope: 'section',
    })
  }, [
    publicationInsightsByRequestKey,
    publicationProductionPhaseInsightOpen,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!publicationProductionPatternInsightOpen) {
      return
    }
    const requestKey = 'publication_output_pattern:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'publication_output_pattern',
      scope: 'section',
    })
  }, [
    publicationInsightsByRequestKey,
    publicationProductionPatternInsightOpen,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!publicationVolumeOverTimeInsightOpen) {
      return
    }
    const requestKey = 'publication_volume_over_time:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'publication_volume_over_time',
      scope: 'section',
    })
  }, [
    publicationInsightsByRequestKey,
    publicationVolumeOverTimeInsightOpen,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!publicationArticleTypeOverTimeInsightOpen) {
      return
    }
    const requestKey = 'publication_article_type_over_time:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'publication_article_type_over_time',
      scope: 'section',
    })
  }, [
    publicationArticleTypeOverTimeInsightOpen,
    publicationInsightsByRequestKey,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!publicationTypeOverTimeInsightOpen) {
      return
    }
    const requestKey = 'publication_type_over_time:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'publication_type_over_time',
      scope: 'section',
    })
  }, [
    publicationInsightsByRequestKey,
    publicationTypeOverTimeInsightOpen,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (activeTab === 'summary') {
      return
    }
    setPublicationProductionPhaseInsightOpen(false)
    setPublicationProductionPatternInsightOpen(false)
    setPublicationVolumeOverTimeInsightOpen(false)
    setPublicationArticleTypeOverTimeInsightOpen(false)
    setPublicationTypeOverTimeInsightOpen(false)
  }, [activeTab])

  const publicationDrilldownRecords = useMemo<PublicationDrilldownRecord[]>(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const publications = Array.isArray(drilldown.publications) ? drilldown.publications : []
    return publications
      .map<PublicationDrilldownRecord | null>((item, index) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const record = item as Record<string, unknown>
        const publicationDate = typeof record.publication_date === 'string' && record.publication_date.trim()
          ? record.publication_date.trim()
          : null
        const publicationMonthStart = typeof record.publication_month_start === 'string' && record.publication_month_start.trim()
          ? record.publication_month_start.trim()
          : null
        const yearRaw = Number(record.year)
        const year = resolvePublicationTrajectoryYear({
          year: Number.isInteger(yearRaw) ? yearRaw : null,
          publicationDate,
          publicationMonthStart,
        })
        const workId = String(record.work_id || record.id || `publication-${index}`)
        const title = String(record.title || '').trim()
        const role = String(record.role || record.user_author_role || '').trim()
        const type = String(record.type || record.publication_type || record.work_type || '').trim()
        const publicationType = String(record.work_type || record.workType || record.publication_type || record.publicationType || '').trim()
        const articleType = String(record.article_type || record.articleType || '').trim()
        const venue = String(record.venue || record.journal || '').trim()
        const citations = parsePublicationCitationCount(
          record.citations_lifetime ?? record.citations ?? record.cited_by_count ?? 0,
        )
        return {
          workId,
          year,
          publicationDate,
          publicationMonthStart,
          title,
          role,
          type,
          publicationType,
          articleType,
          venue,
          citations,
          citations1yRolling: parsePublicationCitationCount(record.citations_1y_rolling ?? 0),
          citations3yRolling: parsePublicationCitationCount(record.citations_3y_rolling ?? 0),
          citations5yRolling: parsePublicationCitationCount(record.citations_5y_rolling ?? 0),
          citationsLifeRolling: parsePublicationCitationCount(
            record.citations_life_rolling ?? record.citations_lifetime ?? record.citations ?? 0,
          ),
        }
      })
      .filter(isNonNullish)
  }, [tile.drilldown])

  const trajectoryFallbackYears = useMemo(
    () => toNumberArray((tile.chart_data || {}).years).map((value) => Math.round(value)),
    [tile.chart_data],
  )
  const trajectoryFallbackValues = useMemo(
    () => toNumberArray((tile.chart_data || {}).values).map((value) => Math.max(0, Math.round(value))),
    [tile.chart_data],
  )
  const trajectoryFallbackYearToCount = useMemo(() => {
    const output = new Map<number, number>()
    for (let index = 0; index < Math.min(trajectoryFallbackYears.length, trajectoryFallbackValues.length); index += 1) {
      output.set(trajectoryFallbackYears[index], trajectoryFallbackValues[index])
    }
    return output
  }, [trajectoryFallbackValues, trajectoryFallbackYears])
  const trajectoryAsOfDate = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const asOfRaw = String(drilldown.as_of_date || '').trim()
    const parsed = asOfRaw ? parseIsoPublicationDate(asOfRaw) : null
    return parsed ?? new Date()
  }, [tile.drilldown])

  const recordYearsWithData = useMemo(() => (
    publicationDrilldownRecords
      .map((record) => record.year)
      .filter((value): value is number => Number.isInteger(value))
  ), [publicationDrilldownRecords])
  const trajectoryAvailableYears = useMemo(
    () => mergePublicationTrajectoryYears(recordYearsWithData, trajectoryFallbackYears),
    [recordYearsWithData, trajectoryFallbackYears],
  )

  const trajectoryMinYear = useMemo(() => {
    if (trajectoryAvailableYears.length) {
      return trajectoryAvailableYears[0]
    }
    return new Date().getUTCFullYear()
  }, [trajectoryAvailableYears])

  const trajectoryMaxYear = useMemo(() => {
    if (trajectoryAvailableYears.length) {
      return trajectoryAvailableYears[trajectoryAvailableYears.length - 1]
    }
    return trajectoryMinYear
  }, [trajectoryAvailableYears, trajectoryMinYear])

  const trajectoryFullYears = useMemo(() => {
    const output: number[] = []
    for (let year = trajectoryMinYear; year <= trajectoryMaxYear; year += 1) {
      output.push(year)
    }
    return output
  }, [trajectoryMaxYear, trajectoryMinYear])

  const trajectoryCountsByYear = useMemo(() => {
    const output = new Map<number, number>()
    publicationDrilldownRecords.forEach((record) => {
      if (record.year === null) {
        return
      }
      output.set(record.year, (output.get(record.year) || 0) + 1)
    })
    trajectoryFullYears.forEach((year) => {
      if (!output.has(year) && trajectoryFallbackYearToCount.has(year)) {
        output.set(year, Number(trajectoryFallbackYearToCount.get(year) || 0))
      }
      if (!output.has(year)) {
        output.set(year, 0)
      }
    })
    return output
  }, [publicationDrilldownRecords, trajectoryFallbackYearToCount, trajectoryFullYears])

  const trajectoryYearSeriesRaw = useMemo(
    () => trajectoryFullYears.map((year) => Number(trajectoryCountsByYear.get(year) || 0)),
    [trajectoryCountsByYear, trajectoryFullYears],
  )

  const trajectoryYearSeriesMovingAvg = useMemo(
    () => buildPublicationTrajectoryMovingAverageSeries({
      years: trajectoryFullYears,
      rawValues: trajectoryYearSeriesRaw,
      records: publicationDrilldownRecords,
      asOfDate: trajectoryAsOfDate,
    }),
    [publicationDrilldownRecords, trajectoryAsOfDate, trajectoryFullYears, trajectoryYearSeriesRaw],
  )

  const trajectoryYearSeriesCumulative = useMemo(() => {
    let running = 0
    return trajectoryYearSeriesRaw.map((value) => {
      running += value
      return running
    })
  }, [trajectoryYearSeriesRaw])

  const trajectoryMaxIndex = Math.max(0, trajectoryFullYears.length - 1)
  const trajectoryMinSpan = Math.min(6, Math.max(1, trajectoryFullYears.length))

  useEffect(() => {
    if (!trajectoryFullYears.length) {
      setTrajectoryRangeStart(0)
      setTrajectoryRangeEnd(0)
      return
    }
    const initialCount = Math.max(trajectoryMinSpan, Math.min(12, trajectoryFullYears.length))
    setTrajectoryRangeStart(Math.max(0, trajectoryFullYears.length - initialCount))
    setTrajectoryRangeEnd(trajectoryMaxIndex)
  }, [trajectoryFullYears.length, trajectoryMaxIndex, trajectoryMinSpan])

  const trajectoryVisibleRange = useMemo(() => {
    if (!trajectoryFullYears.length) {
      return { start: 0, end: 0 }
    }
    const safeStart = Math.max(0, Math.min(trajectoryMaxIndex, trajectoryRangeStart))
    const safeEnd = Math.max(
      safeStart,
      Math.min(trajectoryMaxIndex, Math.max(trajectoryRangeEnd, Math.min(trajectoryMaxIndex, safeStart + trajectoryMinSpan - 1))),
    )
    const adjustedStart = Math.max(0, Math.min(safeStart, safeEnd - trajectoryMinSpan + 1))
    return {
      start: adjustedStart,
      end: safeEnd,
    }
  }, [trajectoryFullYears.length, trajectoryMaxIndex, trajectoryMinSpan, trajectoryRangeEnd, trajectoryRangeStart])

  const trajectoryVisibleYears = useMemo(
    () => trajectoryFullYears.slice(trajectoryVisibleRange.start, trajectoryVisibleRange.end + 1),
    [trajectoryFullYears, trajectoryVisibleRange.end, trajectoryVisibleRange.start],
  )
  useEffect(() => {
    if (trajectoryTooltipYear === null) {
      return
    }
    if (!trajectoryVisibleYears.includes(trajectoryTooltipYear)) {
      setTrajectoryTooltipYear(null)
    }
  }, [trajectoryTooltipYear, trajectoryVisibleYears])
  const trajectoryVisibleRaw = useMemo(
    () => trajectoryYearSeriesRaw.slice(trajectoryVisibleRange.start, trajectoryVisibleRange.end + 1),
    [trajectoryVisibleRange.end, trajectoryVisibleRange.start, trajectoryYearSeriesRaw],
  )
  const trajectoryVisibleMoving = useMemo(
    () => trajectoryYearSeriesMovingAvg.slice(trajectoryVisibleRange.start, trajectoryVisibleRange.end + 1),
    [trajectoryVisibleRange.end, trajectoryVisibleRange.start, trajectoryYearSeriesMovingAvg],
  )
  const trajectoryVisibleCumulative = useMemo(
    () => trajectoryYearSeriesCumulative.slice(trajectoryVisibleRange.start, trajectoryVisibleRange.end + 1),
    [trajectoryVisibleRange.end, trajectoryVisibleRange.start, trajectoryYearSeriesCumulative],
  )

  const trajectoryValues = trajectoryMode === 'cumulative'
    ? trajectoryVisibleCumulative
    : trajectoryMode === 'moving_avg'
      ? trajectoryVisibleMoving
      : trajectoryVisibleRaw
  const trajectoryAxisObservedMax = useMemo(() => {
    if (trajectoryMode === 'cumulative') {
      return Math.max(0, ...trajectoryVisibleCumulative)
    }
    if (trajectoryMode === 'moving_avg') {
      return Math.max(0, ...trajectoryVisibleMoving)
    }
    return Math.max(0, ...trajectoryVisibleRaw, ...trajectoryVisibleMoving)
  }, [trajectoryMode, trajectoryVisibleCumulative, trajectoryVisibleMoving, trajectoryVisibleRaw])
  const trajectoryAxisScale = useMemo(
    () => buildNiceAxis(trajectoryAxisObservedMax),
    [trajectoryAxisObservedMax],
  )
  const trajectoryTargetAxisMax = Math.max(1, trajectoryAxisScale.axisMax)
  const trajectoryTickRatios = useMemo(
    () => trajectoryAxisScale.ticks.map((tickValue) => (
      trajectoryAxisScale.axisMax <= 0 ? 0 : tickValue / trajectoryAxisScale.axisMax
    )),
    [trajectoryAxisScale.axisMax, trajectoryAxisScale.ticks],
  )
  const trajectoryGridTickRatiosWithoutTop = useMemo(
    () => trajectoryTickRatios.filter((ratio) => Number.isFinite(ratio) && ratio >= 0 && ratio < 0.999),
    [trajectoryTickRatios],
  )
  const trajectoryHasTopYAxisTick = trajectoryTickRatios.some((ratio) => Number.isFinite(ratio) && ratio >= 0.999)
  const trajectoryLabels = useMemo(
    () => trajectoryVisibleYears.map((year) => String(year)),
    [trajectoryVisibleYears],
  )
  const trajectoryPlotWidth = 100
  const trajectoryPlotHeight = 100
  const trajectoryPoints = useMemo(
    () => (
      trajectoryValues.length
        ? buildLinePointsFromBounds(
          trajectoryValues,
          trajectoryPlotWidth,
          trajectoryPlotHeight,
          trajectoryLabels,
          0,
          trajectoryTargetAxisMax,
          0,
          0,
        )
        : []
    ),
    [
      trajectoryTargetAxisMax,
      trajectoryLabels,
      trajectoryPlotHeight,
      trajectoryPlotWidth,
      trajectoryValues,
    ],
  )
  const trajectoryMovingPoints = useMemo(
    () => (
      trajectoryVisibleMoving.length
        ? buildLinePointsFromBounds(
          trajectoryVisibleMoving,
          trajectoryPlotWidth,
          trajectoryPlotHeight,
          trajectoryLabels,
          0,
          trajectoryTargetAxisMax,
          0,
          0,
        )
        : []
    ),
    [
      trajectoryTargetAxisMax,
      trajectoryLabels,
      trajectoryPlotHeight,
      trajectoryPlotWidth,
      trajectoryVisibleMoving,
    ],
  )
  const trajectoryTooltipSlices = useMemo(
    () => buildTrajectoryTooltipSlices({
      years: trajectoryVisibleYears,
      rawValues: trajectoryVisibleRaw,
      movingAvgValues: trajectoryVisibleMoving,
      cumulativeValues: trajectoryVisibleCumulative,
      activeValues: trajectoryValues,
      activePoints: trajectoryPoints,
      movingPoints: trajectoryMovingPoints,
      fullRawValues: trajectoryYearSeriesRaw,
      visibleStartIndex: trajectoryVisibleRange.start,
    }),
    [
      trajectoryMovingPoints,
      trajectoryPoints,
      trajectoryValues,
      trajectoryVisibleCumulative,
      trajectoryVisibleMoving,
      trajectoryVisibleRange.start,
      trajectoryVisibleRaw,
      trajectoryVisibleYears,
      trajectoryYearSeriesRaw,
    ],
  )
  const trajectoryActiveTooltipSlice = useMemo(
    () => trajectoryTooltipSlices.find((slice) => slice.year === trajectoryTooltipYear) || null,
    [trajectoryTooltipSlices, trajectoryTooltipYear],
  )
  const trajectoryPath = useMemo(
    () => monotonePathFromPoints(trajectoryPoints),
    [trajectoryPoints],
  )
  const trajectoryEntryRevealIdBase = useId().replace(/:/g, '')
  const trajectoryEntryRevealClipId = `${trajectoryEntryRevealIdBase}-clip`
  const trajectoryAnimationKey = useMemo(
    () => `${trajectoryMode}|${trajectoryVisibleYears.join('|')}|${trajectoryValues.join('|')}`,
    [trajectoryMode, trajectoryValues, trajectoryVisibleYears],
  )
  const trajectoryChartVisible = activeTab === 'trajectory' && trajectoryVisibleYears.length > 0
  const trajectoryLineExpanded = useUnifiedToggleBarAnimation(
    `${trajectoryAnimationKey}|publication-trajectory`,
    trajectoryChartVisible,
  )
  const trajectoryIsEntryCycle = useIsFirstChartEntry(
    `${trajectoryAnimationKey}|publication-trajectory`,
    trajectoryChartVisible,
  )
  const trajectoryAxisDurationMs = tileAxisDurationMs(trajectoryIsEntryCycle)
  const trajectoryLineTransitionDuration = tileChartDurationVar(trajectoryIsEntryCycle)
  const trajectoryDisplayedAxisTarget = trajectoryChartVisible ? trajectoryTargetAxisMax : 0
  const trajectoryDisplayedAxisMax = useEasedValue(
    trajectoryDisplayedAxisTarget,
    `${trajectoryAnimationKey}|y-axis-max|${trajectoryChartVisible ? 'visible' : 'hidden'}`,
    trajectoryChartVisible,
    trajectoryAxisDurationMs,
  )
  const trajectoryAnimatedAxisTickValues = useMemo(
    () => trajectoryTickRatios.map((ratio) => ratio * Math.max(1, trajectoryDisplayedAxisMax)),
    [trajectoryDisplayedAxisMax, trajectoryTickRatios],
  )
  const trajectoryWasVisibleRef = useRef(false)
  const [trajectoryEntryRevealActive, setTrajectoryEntryRevealActive] = useState(false)
  const [trajectoryEntryRevealProgress, setTrajectoryEntryRevealProgress] = useState(0)
  const trajectoryEntryRevealWidth = Math.max(0, Math.min(trajectoryPlotWidth, trajectoryPlotWidth * trajectoryEntryRevealProgress))

  useEffect(() => {
    const becameVisible = trajectoryChartVisible && !trajectoryWasVisibleRef.current
    trajectoryWasVisibleRef.current = trajectoryChartVisible

    if (!trajectoryChartVisible) {
      setTrajectoryEntryRevealActive(false)
      setTrajectoryEntryRevealProgress(0)
      return
    }

    if (becameVisible) {
      if (prefersReducedMotion()) {
        setTrajectoryEntryRevealActive(false)
        setTrajectoryEntryRevealProgress(1)
        return
      }
      setTrajectoryEntryRevealActive(true)
      setTrajectoryEntryRevealProgress(0)
    }
  }, [trajectoryChartVisible])

  useEffect(() => {
    if (!trajectoryChartVisible || !trajectoryPath || !trajectoryEntryRevealActive) {
      return
    }

    const entryDelayMs = 120
    const entryDurationMs = 940
    let raf = 0
    const startedAt = performance.now()
    const easeEntryReveal = (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress))
      return clamped * clamped * (3 - (2 * clamped))
    }

    setTrajectoryEntryRevealProgress(0)
    const step = (now: number) => {
      const elapsed = now - startedAt
      if (elapsed < entryDelayMs) {
        setTrajectoryEntryRevealProgress(0)
        raf = window.requestAnimationFrame(step)
        return
      }
      const progress = Math.min(1, (elapsed - entryDelayMs) / entryDurationMs)
      const easedProgress = easeEntryReveal(progress)
      setTrajectoryEntryRevealProgress(easedProgress)
      if (progress >= 1) {
        setTrajectoryEntryRevealActive(false)
      }
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      }
    }

    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [trajectoryChartVisible, trajectoryEntryRevealActive, trajectoryPath])

  const trajectoryVolatilityIndex = useMemo(() => {
    if (!trajectoryVisibleRaw.length) {
      return 0
    }
    const mean = trajectoryVisibleRaw.reduce((sum, value) => sum + value, 0) / trajectoryVisibleRaw.length
    if (mean <= 1e-9) {
      return 0
    }
    const variance = trajectoryVisibleRaw.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / trajectoryVisibleRaw.length
    return Math.sqrt(variance) / mean
  }, [trajectoryVisibleRaw])

  const trajectoryGrowthSlope = useMemo(() => {
    if (trajectoryVisibleRaw.length <= 1) {
      return 0
    }
    const n = trajectoryVisibleRaw.length
    const xs = Array.from({ length: n }, (_, index) => index + 1)
    const sumX = xs.reduce((sum, value) => sum + value, 0)
    const sumY = trajectoryVisibleRaw.reduce((sum, value) => sum + value, 0)
    const sumXY = trajectoryVisibleRaw.reduce((sum, value, index) => sum + (value * xs[index]), 0)
    const sumXX = xs.reduce((sum, value) => sum + (value * value), 0)
    const numerator = (n * sumXY) - (sumX * sumY)
    const denominator = (n * sumXX) - (sumX * sumX)
    if (Math.abs(denominator) <= 1e-9) {
      return 0
    }
    return numerator / denominator
  }, [trajectoryVisibleRaw])

  const trajectoryPhase = trajectoryGrowthSlope > 0.2
    ? 'Expanding'
    : trajectoryGrowthSlope < -0.2
      ? 'Contracting'
      : 'Stable'
  const trajectoryVolatilityTileTintStyle = getTrajectoryVolatilityTileTintStyle(trajectoryVolatilityIndex)
  const trajectoryGrowthTileTintStyle = getTrajectoryGrowthTileTintStyle(trajectoryGrowthSlope)
  const trajectoryStartYearLabel = trajectoryVisibleYears.length ? String(trajectoryVisibleYears[0]) : ''
  const trajectoryEndYearLabel = trajectoryVisibleYears.length ? String(trajectoryVisibleYears[trajectoryVisibleYears.length - 1]) : ''
  const trajectoryFocusRangeLabel = trajectoryVisibleYears.length
    ? `${trajectoryStartYearLabel} - ${trajectoryEndYearLabel}`
    : 'Publication years'
  const trajectoryXAxisTicks = useMemo(
    () => buildTrajectoryYearTicks(trajectoryVisibleYears),
    [trajectoryVisibleYears],
  )
  const trajectoryVerticalGridPercents = useMemo(
    () => trajectoryXAxisTicks
      .map((tick) => Math.max(0, Math.min(100, tick.leftPct)))
      .filter((value) => value > 0.5 && value < 99.5)
      .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.5),
    [trajectoryXAxisTicks],
  )
  const trajectoryXAxisLayout = useMemo(
    () => buildChartAxisLayout({
      axisLabels: trajectoryXAxisTicks.map((tick) => tick.label),
      showXAxisName: true,
      xAxisName: 'Publication year',
      dense: trajectoryXAxisTicks.length >= 5,
      maxLabelLines: 1,
      maxSubLabelLines: 1,
      maxAxisNameLines: 1,
    }),
    [trajectoryXAxisTicks],
  )
  const trajectoryYAxisPanelWidthRem = buildYAxisPanelWidthRem(trajectoryAxisScale.ticks, true, 0.5)
  const trajectoryChartLeftInset = `${trajectoryYAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
  const trajectoryPlotAreaStyle = {
    left: trajectoryChartLeftInset,
    right: '0.5rem',
    top: '1rem',
    bottom: `${trajectoryXAxisLayout.plotBottomRem}rem`,
  }
  const trajectoryXAxisTicksStyle = {
    left: trajectoryChartLeftInset,
    right: '0.5rem',
    bottom: `${trajectoryXAxisLayout.axisBottomRem}rem`,
    minHeight: `${trajectoryXAxisLayout.axisMinHeightRem}rem`,
  }
  const trajectoryYAxisPanelStyle = {
    left: '0.25rem',
    top: '1rem',
    bottom: `${trajectoryXAxisLayout.plotBottomRem}rem`,
    width: `${trajectoryYAxisPanelWidthRem}rem`,
  }
  const trajectoryChartFrameStyle = {
    paddingBottom: `${trajectoryXAxisLayout.framePaddingBottomRem}rem`,
  }

  const headlineMetricTiles = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const chartData = (tile.chart_data || {}) as Record<string, unknown>
    const publications = Array.isArray(drilldown.publications) ? drilldown.publications : []

    const years = Array.isArray(chartData.years)
      ? chartData.years
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
      : []
    const values = Array.isArray(chartData.values)
      ? chartData.values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
      : []
    const yearValuePairs = years
      .map((year, index) => ({ year, value: Math.max(0, Number(values[index] || 0)) }))
      .filter((entry) => Number.isFinite(entry.value))

    const publicationYears = publications
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const rawYear = Number((item as Record<string, unknown>).year)
        return Number.isInteger(rawYear) ? rawYear : null
      })
      .filter((year): year is number => year !== null)

    const asOfRaw = String(drilldown.as_of_date || '').trim()
    const asOfDate = asOfRaw ? new Date(`${asOfRaw}T00:00:00Z`) : new Date()
    const fallbackNow = Number.isFinite(asOfDate.getTime()) ? asOfDate : new Date()
    const fallbackNowYear = fallbackNow.getUTCFullYear()
    const projectedYearRaw = Number(chartData.projected_year)
    const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : fallbackNowYear
    const currentYearYtdRaw = Number(chartData.current_year_ytd)
    const resolvedCurrentYearYtd = Number.isFinite(currentYearYtdRaw)
      ? Math.max(0, currentYearYtdRaw)
      : Math.max(
        0,
        yearValuePairs.find((entry) => entry.year === projectedYear)?.value
        ?? yearValuePairs[yearValuePairs.length - 1]?.value
        ?? 0,
      )
    const historyBars = yearValuePairs
      .filter((entry) => entry.year !== projectedYear)
      .concat(
        yearValuePairs.length > 0 || Number.isFinite(currentYearYtdRaw)
          ? [{ year: projectedYear, value: resolvedCurrentYearYtd }]
          : [],
      )
      .sort((left, right) => left.year - right.year)
    const sumNumbers = (items: number[]) => items.reduce((sum, value) => sum + Math.max(0, value), 0)
    const rollingWindowSum = (windowYears: number) => sumNumbers(historyBars.slice(-windowYears).map((entry) => entry.value))

    const lifetimeMonthlySeries = toNumberArray(chartData.monthly_values_lifetime).map((item) => Math.max(0, item))
    const rollingWindowMonthsSum = (windowMonths: number) => {
      if (lifetimeMonthlySeries.length > 0) {
        return sumNumbers(lifetimeMonthlySeries.slice(-windowMonths))
      }
      return rollingWindowSum(Math.max(1, Math.round(windowMonths / 12)))
    }
    const rolling3Year = Math.round(rollingWindowMonthsSum(36))
    const rolling5Year = Math.round(rollingWindowMonthsSum(60))

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
        : rollingWindowSum(1),
    )

    const firstPublicationYearCandidates = [
      ...publicationYears,
      ...historyBars.filter((entry) => entry.value > 0).map((entry) => entry.year),
    ].filter((year) => Number.isInteger(year) && year >= 1900 && year <= projectedYear)
    const firstPublicationYear = firstPublicationYearCandidates.length
      ? Math.min(...firstPublicationYearCandidates)
      : null
    const activeYears = firstPublicationYear !== null
      ? Math.max(1, projectedYear - firstPublicationYear + 1)
      : 0
    const activeYearsValue = activeYears > 0 ? formatInt(activeYears) : '\u2014'

    const firstPublicationValue = firstPublicationYear !== null
      ? String(firstPublicationYear)
      : '\u2014'

    const totalPublicationsFromChart = Math.round(sumNumbers(historyBars.map((entry) => entry.value)))
    const totalPublicationsValue = totalPublicationsFromChart > 0
      ? formatInt(totalPublicationsFromChart)
      : formatDrilldownValue(tile.value_display || tile.main_value_display || tile.value)
    const meanYearlyPublications = activeYears > 0
      ? totalPublicationsFromChart / activeYears
      : Number(chartData.mean_value)
    const meanYearlyValue = Number.isFinite(meanYearlyPublications)
      ? (Math.round(meanYearlyPublications * 10) / 10).toFixed(1)
      : '\u2014'
    const yearToDateValue = formatInt(Math.round(resolvedCurrentYearYtd))

    return [
      { label: 'Total publications', value: totalPublicationsValue },
      { label: 'Active years', value: activeYearsValue },
      { label: 'Mean yearly publications', value: meanYearlyValue },
      { label: 'First publication', value: firstPublicationValue },
      { label: 'Last 1 year (rolling)', value: formatInt(rolling1Year) },
      { label: 'Last 3 years (rolling)', value: formatInt(rolling3Year) },
      { label: 'Last 5 years (rolling)', value: formatInt(rolling5Year) },
      { label: 'Year-to-date', value: yearToDateValue },
    ]
  }, [tile])
  const publicationProductionPatternCompleteStats = useMemo(
    () => buildPublicationProductionPatternStats(tile, 'complete'),
    [tile],
  )
  const publicationProductionPatternAsOfDate = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    return parsePublicationProductionPatternAsOfDate(drilldown.as_of_date) ?? null
  }, [tile])
  const publicationProductionPatternStats = useMemo(
    () => buildPublicationProductionPatternStats(tile, publicationProductionYearScopeMode),
    [publicationProductionYearScopeMode, tile],
  )
  const publicationProductionPhaseStats = useMemo(
    () => buildPublicationProductionPhaseStats(tile),
    [tile],
  )
  const totalPublicationsContextStats = useMemo(
    () => buildTotalPublicationsContextStats({
      publicationRecords: publicationDrilldownRecords,
      patternStats: publicationProductionPatternCompleteStats,
      phaseStats: publicationProductionPhaseStats,
    }),
    [publicationDrilldownRecords, publicationProductionPatternCompleteStats, publicationProductionPhaseStats],
  )
  const publicationProductionPatternNotes = useMemo(() => {
    const notes: string[] = []
    const lowVolumeNote = getPublicationProductionPatternLowVolumeNote(publicationProductionPatternStats.totalPublications)
    if (lowVolumeNote) {
      notes.push(lowVolumeNote)
    }
    return notes
  }, [publicationProductionPatternStats])

  const venueBreakdownData = useMemo(() => {
    const fallbackRows = (() => {
      const total = publicationDrilldownRecords.length
      if (!total) {
        return []
      }
      const counts = new Map<string, { count: number; citations: number }>()
      publicationDrilldownRecords.forEach((record) => {
        const label = String(record.venue || '').trim() || 'Unknown journal'
        const current = counts.get(label) || { count: 0, citations: 0 }
        current.count += 1
        current.citations += Math.max(0, Number(record.citations || 0))
        counts.set(label, current)
      })
      return Array.from(counts.entries())
        .sort((left, right) => {
          if (left[1].count === right[1].count) {
            return left[0].localeCompare(right[0])
          }
          return right[1].count - left[1].count
        })
        .map(([label, stats]) => ({
          key: label,
          label,
          value: stats.count,
          share_pct: Number(((stats.count / total) * 100).toFixed(1)),
          total_citations: stats.citations,
          avg_citations: Number((stats.citations / Math.max(1, stats.count)).toFixed(1)),
        }))
    })()

    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const breakdowns = Array.isArray(drilldown.breakdowns) ? drilldown.breakdowns : []
    const venueBreakdown = breakdowns.find((b) => {
      if (!b || typeof b !== 'object') return false
      const breakdown = b as Record<string, unknown>
      return breakdown.breakdown_id === 'by_venue_full'
    })
    if (!venueBreakdown || typeof venueBreakdown !== 'object') return fallbackRows
    const breakdown = venueBreakdown as Record<string, unknown>
    const items = Array.isArray(breakdown.items) ? breakdown.items : []
    const parsedRows = items.map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        key: String(row.key || ''),
        label: String(row.label || ''),
        value: Number(row.value || 0),
        share_pct: Number(row.share_pct || 0),
        total_citations: Number(row.total_citations ?? row.citations ?? row.citation_count ?? 0),
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; total_citations: number; avg_citations: number } => row !== null)
    return parsedRows.length > 0 ? parsedRows : fallbackRows
  }, [publicationDrilldownRecords, tile.drilldown])

  const venueTop10Data = useMemo(() => venueBreakdownData.slice(0, 10), [venueBreakdownData])

  const topicBreakdownData = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const breakdowns = Array.isArray(drilldown.breakdowns) ? drilldown.breakdowns : []
    const topicBreakdown = breakdowns.find((b) => {
      if (!b || typeof b !== 'object') return false
      const breakdown = b as Record<string, unknown>
      return breakdown.breakdown_id === 'by_topic'
    })
    if (!topicBreakdown || typeof topicBreakdown !== 'object') return []
    const breakdown = topicBreakdown as Record<string, unknown>
    const items = Array.isArray(breakdown.items) ? breakdown.items : []
    return items.map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        key: String(row.key || ''),
        label: String(row.label || ''),
        value: Number(row.value || 0),
        share_pct: Number(row.share_pct || 0),
        total_citations: Number(row.total_citations ?? row.citations ?? row.citation_count ?? 0),
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; total_citations: number; avg_citations: number } => row !== null)
  }, [tile.drilldown])
  const topicTop10Data = useMemo(() => topicBreakdownData.slice(0, 10), [topicBreakdownData])

  const oaStatusBreakdownData = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const breakdowns = Array.isArray(drilldown.breakdowns) ? drilldown.breakdowns : []
    const oaBreakdown = breakdowns.find((b) => {
      if (!b || typeof b !== 'object') return false
      const breakdown = b as Record<string, unknown>
      return breakdown.breakdown_id === 'by_oa_status'
    })
    if (!oaBreakdown || typeof oaBreakdown !== 'object') return []
    const breakdown = oaBreakdown as Record<string, unknown>
    const items = Array.isArray(breakdown.items) ? breakdown.items : []
    return items.map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      return {
        key: String(row.key || ''),
        label: String(row.label || ''),
        value: Number(row.value || 0),
        share_pct: Number(row.share_pct || 0),
        total_citations: Number(row.total_citations ?? row.citations ?? row.citation_count ?? 0),
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; total_citations: number; avg_citations: number } => row !== null)
  }, [tile.drilldown])
  const trajectoryOptions = [
    { key: 'raw' as const, label: 'Raw' },
    { key: 'moving_avg' as const, label: 'Moving avg' },
    { key: 'cumulative' as const, label: 'Cumulative' },
  ]
  const activeTrajectoryIndex = Math.max(0, trajectoryOptions.findIndex((option) => option.key === trajectoryMode))
  const totalPublicationsMethodsSections = useMemo(
    () => buildTotalPublicationsMethodsSections(tile),
    [tile],
  )
  const publicationVolumeYAxisLabel = useMemo(
    () => resolvePublicationVolumeYAxisLabel({
      windowMode: publicationTrendsWindowMode,
      visualMode: publicationTrendsVisualMode,
      publicationRecords: publicationDrilldownRecords,
      tile,
    }),
    [publicationDrilldownRecords, publicationTrendsVisualMode, publicationTrendsWindowMode, tile],
  )
  const publicationVolumeTableRows = useMemo(() => {
    const currentUtcMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const startDate = publicationTrendsWindowMode === '1y'
      ? shiftUtcMonth(currentUtcMonthStart, -12)
      : publicationTrendsWindowMode === '3y'
        ? new Date(Date.UTC(currentUtcMonthStart.getUTCFullYear() - 2, 0, 1))
        : publicationTrendsWindowMode === '5y'
          ? new Date(Date.UTC(currentUtcMonthStart.getUTCFullYear() - 4, 0, 1))
          : null
    return publicationDrilldownRecords
      .map((record) => {
        const publicationDate = parsePublicationRecordDate(record)
        return {
          ...record,
          publicationDate,
        }
      })
      .filter((record) => {
        if (!record.publicationDate) {
          return publicationTrendsWindowMode === 'all'
        }
        if (!startDate) {
          return true
        }
        return record.publicationDate.getTime() >= startDate.getTime()
          && record.publicationDate.getTime() < currentUtcMonthStart.getTime()
      })
      .sort((left, right) => {
        const leftTime = left.publicationDate?.getTime() ?? 0
        const rightTime = right.publicationDate?.getTime() ?? 0
        if (leftTime !== rightTime) {
          return publicationVolumeTableDateSortMode === 'oldest'
            ? leftTime - rightTime
            : rightTime - leftTime
        }
        return left.title.localeCompare(right.title)
      })
      .map((record) => ({
        key: record.workId,
        title: record.title,
        publicationDateLabel: formatPublicationMonthYear(record.publicationDate),
        articleType: record.articleType || 'Not available',
      }))
  }, [publicationDrilldownRecords, publicationTrendsWindowMode, publicationVolumeTableDateSortMode])
  const publicationVolumeOverTimeInsightStats = useMemo(
    () => buildPublicationVolumeOverTimeInsightStats(tile, publicationDrilldownRecords),
    [publicationDrilldownRecords, tile],
  )
  const publicationArticleTypeOverTimeInsightStats = useMemo(
    () => buildPublicationArticleTypeOverTimeInsightStats(publicationDrilldownRecords, trajectoryAsOfDate),
    [publicationDrilldownRecords, trajectoryAsOfDate],
  )
  const publicationTypeOverTimeInsightStats = useMemo(
    () => buildPublicationPublicationTypeOverTimeInsightStats(publicationDrilldownRecords, trajectoryAsOfDate),
    [publicationDrilldownRecords, trajectoryAsOfDate],
  )
  const totalPublicationsContextPortfolioTooltip = (
    <div className="house-publications-drilldown-stack-1">
      <p>{totalPublicationsContextStats.maturityNarrative}</p>
      {totalPublicationsContextStats.maturityNote ? <p>{totalPublicationsContextStats.maturityNote}</p> : null}
    </div>
  )
  const totalPublicationsContextRecentTooltip = (
    <div className="house-publications-drilldown-stack-1">
      <p>{totalPublicationsContextStats.recentNarrative}</p>
      <p>{`${totalPublicationsContextStats.recentWindowLabel}: mean ${totalPublicationsContextStats.recentMeanValue}. ${totalPublicationsContextStats.earlierWindowLabel}: mean ${totalPublicationsContextStats.baselineMeanValue}. Change vs baseline: ${totalPublicationsContextStats.momentumValue}.`}</p>
      {totalPublicationsContextStats.recentNote ? <p>{totalPublicationsContextStats.recentNote}</p> : null}
    </div>
  )
  const totalPublicationsContextCompositionTooltip = (
    <div className="house-publications-drilldown-stack-1">
      <p>{`Compares the dominant lifetime mix with ${totalPublicationsContextStats.recentWindowLabel.toLowerCase()} across the complete-year portfolio.`}</p>
      {totalPublicationsContextStats.mixShiftRows.map((row) => (
        <p key={`context-tooltip-${row.key}`}>{`${row.dimensionLabel}: ${row.reading}`}</p>
      ))}
      {totalPublicationsContextStats.mixShiftNote ? <p>{totalPublicationsContextStats.mixShiftNote}</p> : null}
    </div>
  )
  const publicationProductionPhaseInsightsRequestKey = 'publication_production_phase:section:all'
  const publicationProductionPhaseInsightsPayload = publicationInsightsByRequestKey[publicationProductionPhaseInsightsRequestKey] || null
  const publicationProductionPhaseInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[publicationProductionPhaseInsightsRequestKey])
  const publicationProductionPhaseInsightsError = publicationInsightsErrorByRequestKey[publicationProductionPhaseInsightsRequestKey] || ''
  const closePublicationProductionPhaseInsight = useCallback(() => setPublicationProductionPhaseInsightOpen(false), [])
  const publicationProductionPatternInsightsRequestKey = 'publication_output_pattern:section:all'
  const publicationProductionPatternInsightsPayload = publicationInsightsByRequestKey[publicationProductionPatternInsightsRequestKey] || null
  const publicationProductionPatternInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[publicationProductionPatternInsightsRequestKey])
  const publicationProductionPatternInsightsError = publicationInsightsErrorByRequestKey[publicationProductionPatternInsightsRequestKey] || ''
  const closePublicationProductionPatternInsight = useCallback(() => setPublicationProductionPatternInsightOpen(false), [])
  const publicationVolumeOverTimeInsightsRequestKey = 'publication_volume_over_time:section:all'
  const publicationVolumeOverTimeInsightsPayload = publicationInsightsByRequestKey[publicationVolumeOverTimeInsightsRequestKey] || null
  const publicationVolumeOverTimeInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[publicationVolumeOverTimeInsightsRequestKey])
  const publicationVolumeOverTimeInsightsError = publicationInsightsErrorByRequestKey[publicationVolumeOverTimeInsightsRequestKey] || ''
  const closePublicationVolumeOverTimeInsight = useCallback(() => setPublicationVolumeOverTimeInsightOpen(false), [])
  const publicationArticleTypeOverTimeInsightsRequestKey = 'publication_article_type_over_time:section:all'
  const publicationArticleTypeOverTimeInsightsPayload = publicationInsightsByRequestKey[publicationArticleTypeOverTimeInsightsRequestKey] || null
  const publicationArticleTypeOverTimeInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[publicationArticleTypeOverTimeInsightsRequestKey])
  const publicationArticleTypeOverTimeInsightsError = publicationInsightsErrorByRequestKey[publicationArticleTypeOverTimeInsightsRequestKey] || ''
  const closePublicationArticleTypeOverTimeInsight = useCallback(() => setPublicationArticleTypeOverTimeInsightOpen(false), [])
  const publicationTypeOverTimeInsightsRequestKey = 'publication_type_over_time:section:all'
  const publicationTypeOverTimeInsightsPayload = publicationInsightsByRequestKey[publicationTypeOverTimeInsightsRequestKey] || null
  const publicationTypeOverTimeInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[publicationTypeOverTimeInsightsRequestKey])
  const publicationTypeOverTimeInsightsError = publicationInsightsErrorByRequestKey[publicationTypeOverTimeInsightsRequestKey] || ''
  const closePublicationTypeOverTimeInsight = useCallback(() => setPublicationTypeOverTimeInsightOpen(false), [])
  const navigateToInsightTab = useCallback((tab: DrilldownTab) => {
    onDrilldownTabChange?.(tab)
    setPublicationProductionPhaseInsightOpen(false)
    setPublicationProductionPatternInsightOpen(false)
    setPublicationVolumeOverTimeInsightOpen(false)
    setPublicationArticleTypeOverTimeInsightOpen(false)
    setPublicationTypeOverTimeInsightOpen(false)
  }, [onDrilldownTabChange])
  const publicationProductionPhaseInsightActions = useMemo<PublicationInsightAction[]>(() => (
    [
      {
        key: 'publication-production-phase-open-trajectory',
        label: 'Open trajectory',
        description: 'View the full year-over-year publication chart.',
        onSelect: () => navigateToInsightTab('trajectory'),
      },
      {
        key: 'publication-production-phase-open-context',
        label: 'Open context',
        description: 'Compare recent output with earlier years and composition shifts.',
        onSelect: () => navigateToInsightTab('context'),
      },
    ]
  ), [navigateToInsightTab])
  const publicationProductionPatternInsightActions = useMemo<PublicationInsightAction[]>(() => (
    [
      {
        key: 'publication-output-pattern-open-trajectory',
        label: 'Open trajectory',
        description: 'View the full year-over-year publication chart.',
        onSelect: () => navigateToInsightTab('trajectory'),
      },
      {
        key: 'publication-output-pattern-open-context',
        label: 'Open context',
        description: 'Compare recent output with earlier years and composition shifts.',
        onSelect: () => navigateToInsightTab('context'),
      },
    ]
  ), [navigateToInsightTab])
  const publicationVolumeOverTimeInsightActions = useMemo<PublicationInsightAction[]>(() => (
    [
      {
        key: 'publication-volume-open-trajectory',
        label: 'Open trajectory',
        description: 'View the year-over-year publication chart and derived trend reads.',
        onSelect: () => navigateToInsightTab('trajectory'),
      },
      {
        key: 'publication-volume-open-context',
        label: 'Open context',
        description: 'Compare recent output with earlier years and composition shifts.',
        onSelect: () => navigateToInsightTab('context'),
      },
    ]
  ), [navigateToInsightTab])
  const publicationArticleTypeOverTimeInsightActions = useMemo<PublicationInsightAction[]>(() => (
    [
      {
        key: 'publication-article-type-open-summary',
        label: 'Open summary',
        description: 'Return to the summary view for the related publication mix sections.',
        onSelect: () => navigateToInsightTab('summary'),
      },
      {
        key: 'publication-article-type-open-context',
        label: 'Open context',
        description: 'Compare recent composition shifts against the wider publication record.',
        onSelect: () => navigateToInsightTab('context'),
      },
    ]
  ), [navigateToInsightTab])
  const publicationTypeOverTimeInsightActions = useMemo<PublicationInsightAction[]>(() => (
    [
      {
        key: 'publication-type-open-summary',
        label: 'Open summary',
        description: 'Return to the summary view for the related publication mix sections.',
        onSelect: () => navigateToInsightTab('summary'),
      },
      {
        key: 'publication-type-open-context',
        label: 'Open context',
        description: 'Compare recent composition shifts against the wider publication record.',
        onSelect: () => navigateToInsightTab('context'),
      },
    ]
  ), [navigateToInsightTab])
  const publicationProductionSummarySections = (
    <>
      <div className="house-publications-drilldown-bounded-section" data-ui="publication-production-phase">
        {publicationProductionPhaseInsightOpen ? (
          <>
            <button
              type="button"
              aria-label="Close production phase insight"
              className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
              onClick={closePublicationProductionPhaseInsight}
            />
            <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-[26rem]">
                <PublicationInsightsCallout
                  payload={publicationProductionPhaseInsightsPayload}
                  sectionKey="publication_production_phase"
                  loading={publicationProductionPhaseInsightsLoading}
                  error={publicationProductionPhaseInsightsError}
                  actions={publicationProductionPhaseInsightActions}
                  onClose={closePublicationProductionPhaseInsight}
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="house-drilldown-heading-block">
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <p className="house-drilldown-heading-block-title">Production Phase</p>
              <DrilldownSheet.HeadingToggle
                expanded={publicationProductionPhaseExpanded}
                onClick={(event) => {
                  event.stopPropagation()
                  setPublicationProductionPhaseExpanded((value) => !value)
                }}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex items-center justify-self-end gap-2">
              <HelpTooltipIconButton
                ariaLabel="Explain Production Phase"
                content={renderPublicationProductionPhaseTooltipContent(publicationProductionPhaseStats)}
                className="max-w-[20rem] px-3 py-2"
                align="end"
                side="top"
              />
              <PublicationInsightsTriggerButton
                ariaLabel="Open production phase insight"
                active={publicationProductionPhaseInsightOpen}
                onClick={onTogglePublicationProductionPhaseInsight}
              />
            </div>
          </div>
        </div>
        {publicationProductionPhaseExpanded ? (
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <PublicationProductionPhaseSummary stats={publicationProductionPhaseStats} />
          </div>
        ) : null}
      </div>

      <div className="house-publications-drilldown-bounded-section" data-ui="publication-production-pattern">
        {publicationProductionPatternInsightOpen ? (
          <>
            <button
              type="button"
              aria-label="Close publication output pattern insight"
              className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
              onClick={closePublicationProductionPatternInsight}
            />
            <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-[26rem]">
                <PublicationInsightsCallout
                  payload={publicationProductionPatternInsightsPayload}
                  sectionKey="publication_output_pattern"
                  loading={publicationProductionPatternInsightsLoading}
                  error={publicationProductionPatternInsightsError}
                  actions={publicationProductionPatternInsightActions}
                  onClose={closePublicationProductionPatternInsight}
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="house-drilldown-heading-block">
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
            <div className="inline-flex items-start gap-2 justify-self-start">
              <p className="house-drilldown-heading-block-title">Publication Production Pattern</p>
              <DrilldownSheet.HeadingToggle
                expanded={publicationProductionPatternExpanded}
                onClick={(event) => {
                  event.stopPropagation()
                  setPublicationProductionPatternExpanded((value) => !value)
                }}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex justify-center self-start">
              <PublicationProductionYearScopeToggle
                value={publicationProductionYearScopeMode}
                onChange={setPublicationProductionYearScopeMode}
              />
            </div>
            <div className="justify-self-end self-start">
              <PublicationInsightsTriggerButton
                ariaLabel="Open publication output pattern insight"
                active={publicationProductionPatternInsightOpen}
                onClick={onTogglePublicationProductionPatternInsight}
              />
            </div>
          </div>
        </div>
        {publicationProductionPatternExpanded ? (
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <div className="house-drilldown-stack-2">
              {publicationProductionPatternNotes.length > 0 ? (
                <div className="house-drilldown-stack-2">
                  {publicationProductionPatternNotes.map((note) => (
                    <p key={note} className={cn(HOUSE_DRILLDOWN_NOTE_SOFT_CLASS, 'text-left')}>
                      {note}
                    </p>
                  ))}
                </div>
              ) : null}

              {publicationProductionPatternStats.emptyReason ? (
                <p className="house-publications-drilldown-empty-state">
                  {publicationProductionPatternStats.emptyReason}
                </p>
              ) : (
                <div
                  className={cn(
                    HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS,
                    'house-publications-headline-metric-grid mt-0 lg:grid-cols-2',
                  )}
                >
                  <PublicationProductionPatternCard
                    dataUi="publication-production-pattern-card-consistency"
                    title="Consistency Index"
                    meterIndex={0}
                    primaryValue={publicationProductionPatternStats.consistencyIndex === null ? '\u2014' : publicationProductionPatternStats.consistencyIndex.toFixed(2)}
                    semanticLabel={publicationProductionPatternStats.consistencyIndex === null
                      ? <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS, 'whitespace-nowrap')}>Insufficient history</span>
                      : renderPublicationConsistencyBadge(publicationProductionPatternStats.consistencyIndex)}
                    tooltip={renderPublicationConsistencyTooltipContent(
                      publicationProductionPatternCompleteStats,
                      publicationProductionPatternStats,
                      publicationProductionPatternAsOfDate,
                    )}
                    meterValue={publicationProductionPatternStats.consistencyIndex}
                    meterTone={publicationProductionPatternStats.consistencyIndex === null
                      ? 'neutral'
                      : getPublicationConsistencyTone(publicationProductionPatternStats.consistencyIndex)}
                  />

                  <PublicationProductionPatternCard
                    dataUi="publication-production-pattern-card-burstiness"
                    title="Burstiness Score"
                    meterIndex={1}
                    primaryValue={publicationProductionPatternStats.burstinessScore === null ? '\u2014' : publicationProductionPatternStats.burstinessScore.toFixed(2)}
                    semanticLabel={publicationProductionPatternStats.burstinessScore === null
                      ? <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS, 'whitespace-nowrap')}>Insufficient history</span>
                      : renderPublicationBurstinessBadge(publicationProductionPatternStats.burstinessScore)}
                    tooltip={renderPublicationBurstinessTooltipContent(
                      publicationProductionPatternCompleteStats,
                      publicationProductionPatternStats,
                      publicationProductionPatternAsOfDate,
                    )}
                    meterValue={publicationProductionPatternStats.burstinessScore}
                    meterTone={publicationProductionPatternStats.burstinessScore === null
                      ? 'neutral'
                      : getPublicationBurstinessTone(publicationProductionPatternStats.burstinessScore)}
                  />

                  <PublicationProductionPatternCard
                    dataUi="publication-production-pattern-card-peak-year-share"
                    title="Peak-year Share"
                    meterIndex={2}
                    primaryValue={publicationProductionPatternStats.peakYearShare === null ? '\u2014' : `${Math.round(publicationProductionPatternStats.peakYearShare * 100)}%`}
                    semanticLabel={publicationProductionPatternStats.peakYearShare === null
                      ? <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS, 'whitespace-nowrap')}>Not available</span>
                      : renderPublicationPeakYearShareBadge(publicationProductionPatternStats.peakYearShare)}
                    tooltip={renderPublicationPeakYearShareTooltipContent(
                      publicationProductionPatternCompleteStats,
                      publicationProductionPatternStats,
                      publicationProductionPatternAsOfDate,
                    )}
                    meterValue={publicationProductionPatternStats.peakYearShare}
                    meterTone={publicationProductionPatternStats.peakYearShare === null
                      ? 'neutral'
                      : getPublicationPeakYearShareTone(publicationProductionPatternStats.peakYearShare)}
                  />

                  <PublicationProductionPatternCard
                    dataUi="publication-production-pattern-card-years-with-output"
                    title="Years with Output"
                    meterIndex={3}
                    primaryValue={`${formatInt(publicationProductionPatternStats.yearsWithOutput)} / ${formatInt(publicationProductionPatternStats.activeSpan)}`}
                    semanticLabel={publicationProductionPatternStats.outputContinuity === null
                      ? <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS, 'whitespace-nowrap')}>Not available</span>
                      : renderPublicationOutputContinuityBadge(publicationProductionPatternStats.outputContinuity)}
                    tooltip={renderPublicationOutputContinuityTooltipContent(
                      publicationProductionPatternCompleteStats,
                      publicationProductionPatternStats,
                      publicationProductionPatternAsOfDate,
                    )}
                    meterValue={publicationProductionPatternStats.outputContinuity}
                    meterTone={publicationProductionPatternStats.outputContinuity === null
                      ? 'neutral'
                      : getPublicationOutputContinuityTone(publicationProductionPatternStats.outputContinuity)}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )

  return (
    <div className="house-drilldown-stack-3" data-metric-key={tile.key}>
      <div className={cn(HOUSE_SURFACE_SECTION_PANEL_CLASS, 'house-drilldown-panel-no-pad')}>
        {activeTab === 'summary' ? (
          <div className="house-drilldown-content-block house-publications-headline-content house-drilldown-heading-content-block w-full">
            <div
              className={cn(HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS, 'house-publications-headline-metric-grid mt-0')}
              style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {headlineMetricTiles.map((tile) => (
                <div key={tile.label} className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS}>
                  <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>{tile.label}</p>
                  <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                    <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>{tile.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'summary' ? (
          <>
            {publicationProductionSummarySections}

            <div className="house-publications-drilldown-bounded-section" data-ui="publication-volume-over-time">
              {publicationVolumeOverTimeInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close publication volume over time insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closePublicationVolumeOverTimeInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={publicationVolumeOverTimeInsightsPayload}
                        sectionKey="publication_volume_over_time"
                        loading={publicationVolumeOverTimeInsightsLoading}
                        error={publicationVolumeOverTimeInsightsError}
                        actions={publicationVolumeOverTimeInsightActions}
                        onClose={closePublicationVolumeOverTimeInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="house-drilldown-heading-block-title">Publication Volume Over Time</p>
                    <DrilldownSheet.HeadingToggle
                      expanded={publicationTrendsExpanded}
                      onClick={(event) => {
                        event.stopPropagation()
                        setPublicationTrendsExpanded((value) => !value)
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <div className="flex items-center justify-self-end gap-2">
                    <HelpTooltipIconButton
                      ariaLabel="Explain Publication Volume Over Time"
                      content={renderPublicationVolumeOverTimeTooltipContent(publicationVolumeOverTimeInsightStats)}
                      className="max-w-[22rem] px-3 py-2"
                      align="end"
                      side="top"
                    />
                    <PublicationInsightsTriggerButton
                      ariaLabel="Open publication volume over time insight"
                      active={publicationVolumeOverTimeInsightOpen}
                      onClick={onTogglePublicationVolumeOverTimeInsight}
                    />
                  </div>
                </div>
              </div>
              {publicationTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'house-publications-trends-controls-row justify-between')}>
                    <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
                      <PublicationWindowToggle value={publicationTrendsWindowMode} onChange={setPublicationTrendsWindowMode} />
                    </div>
                    <PublicationTrendsVisualToggle
                      value={publicationTrendsVisualMode}
                      onChange={setPublicationTrendsVisualMode}
                    />
                  </div>

                  <div
                    className={cn(
                      'house-drilldown-content-block w-full',
                      publicationTrendsVisualMode === 'table'
                        ? 'h-auto'
                        : 'house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall',
                    )}
                  >
                    {publicationTrendsVisualMode === 'table' ? (
                      <CanonicalTablePanel
                        bare
                        variant="drilldown"
                        suppressTopRowHighlight
                        columns={[
                          { key: 'paper', label: 'Publication' },
                          {
                            key: 'date',
                            label: (
                              <button
                                type="button"
                                data-stop-tile-open="true"
                                className="inline-flex items-center justify-center gap-1 text-inherit transition-colors duration-[var(--motion-duration-ui)] ease-out hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:underline"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setPublicationVolumeTableDateSortMode((current) => current === 'newest' ? 'oldest' : 'newest')
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                                aria-label={`Sort by date ${publicationVolumeTableDateSortMode === 'newest' ? 'oldest first' : 'newest first'}`}
                                title={publicationVolumeTableDateSortMode === 'newest' ? 'Sort oldest to youngest' : 'Sort youngest to oldest'}
                              >
                                <span>Date</span>
                                <span aria-hidden="true" className="text-[0.7rem] leading-none">
                                  {publicationVolumeTableDateSortMode === 'newest' ? '↓' : '↑'}
                                </span>
                              </button>
                            ),
                            align: 'center',
                            width: '1%',
                          },
                          { key: 'articleType', label: 'Article type', align: 'center', width: '1%' },
                        ]}
                        rows={publicationVolumeTableRows.map((row) => ({
                          key: row.key,
                          cells: {
                            paper: _onOpenPublication ? (
                              <button
                                type="button"
                                data-stop-tile-open="true"
                                className="block w-full text-left text-[hsl(var(--tone-accent-700))] transition-colors duration-[var(--motion-duration-ui)] ease-out hover:text-[hsl(var(--tone-accent-800))] hover:underline focus-visible:outline-none focus-visible:underline"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  _onOpenPublication(row.key)
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <span className="block max-w-full break-words leading-snug">{row.title}</span>
                              </button>
                            ) : (
                              <span className="block max-w-full break-words leading-snug">{row.title}</span>
                            ),
                            date: row.publicationDateLabel,
                            articleType: row.articleType,
                          },
                        }))}
                        emptyMessage="No publications found in the selected period."
                      />
                    ) : (
                      <PublicationsPerYearChart
                        tile={tile}
                        animate={animateCharts}
                        showAxes
                        yAxisLabel={publicationVolumeYAxisLabel}
                        enableWindowToggle
                        showPeriodHint
                        showCurrentPeriodSemantic
                        useCompletedMonthWindowLabels
                        autoScaleByWindow
                        showMeanLine
                        showMeanValueLabel
                        meanValueOneDecimalIn1y
                        longWindowLineXAxisTitleTranslateRem={1.1}
                        subtleGrid
                        activeWindowMode={publicationTrendsWindowMode}
                        onWindowModeChange={setPublicationTrendsWindowMode}
                        visualMode={publicationTrendsVisualMode}
                        onVisualModeChange={setPublicationTrendsVisualMode}
                        showWindowToggle={false}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section" data-ui="publication-article-type-over-time">
              {publicationArticleTypeOverTimeInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close publication article type over time insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closePublicationArticleTypeOverTimeInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={publicationArticleTypeOverTimeInsightsPayload}
                        sectionKey="publication_article_type_over_time"
                        loading={publicationArticleTypeOverTimeInsightsLoading}
                        error={publicationArticleTypeOverTimeInsightsError}
                        actions={publicationArticleTypeOverTimeInsightActions}
                        onClose={closePublicationArticleTypeOverTimeInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="house-drilldown-heading-block-title">Type of Articles Published Over Time</p>
                    <DrilldownSheet.HeadingToggle
                      expanded={articleTypeTrendsExpanded}
                      onClick={(event) => {
                        event.stopPropagation()
                        setArticleTypeTrendsExpanded((value) => !value)
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <div className="flex items-center justify-self-end gap-2">
                    <HelpTooltipIconButton
                      ariaLabel="Explain Type of Articles Published Over Time"
                      content={renderPublicationArticleTypeOverTimeTooltipContent(publicationArticleTypeOverTimeInsightStats)}
                      className="max-w-[22rem] px-3 py-2"
                      align="end"
                      side="top"
                    />
                    <PublicationInsightsTriggerButton
                      ariaLabel="Open publication article type over time insight"
                      active={publicationArticleTypeOverTimeInsightOpen}
                      onClick={onTogglePublicationArticleTypeOverTimeInsight}
                    />
                  </div>
                </div>
              </div>
              {articleTypeTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="house-drilldown-content-block w-full">
                    <PublicationCategoryDistributionChart
                      publications={publicationDrilldownRecords}
                      dimension="article"
                      xAxisLabel="Article type"
                      yAxisLabel="Publications"
                      emptyLabel="No article type data"
                      animate={animateCharts}
                      enableValueModeToggle
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section" data-ui="publication-type-over-time">
              {publicationTypeOverTimeInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close publication type over time insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closePublicationTypeOverTimeInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={publicationTypeOverTimeInsightsPayload}
                        sectionKey="publication_type_over_time"
                        loading={publicationTypeOverTimeInsightsLoading}
                        error={publicationTypeOverTimeInsightsError}
                        actions={publicationTypeOverTimeInsightActions}
                        onClose={closePublicationTypeOverTimeInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="house-drilldown-heading-block-title">Type of Publications Published Over Time</p>
                    <DrilldownSheet.HeadingToggle
                      expanded={publicationTypeTrendsExpanded}
                      onClick={(event) => {
                        event.stopPropagation()
                        setPublicationTypeTrendsExpanded((value) => !value)
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <div className="flex items-center justify-self-end gap-2">
                    <HelpTooltipIconButton
                      ariaLabel="Explain Type of Publications Published Over Time"
                      content={renderPublicationPublicationTypeOverTimeTooltipContent(publicationTypeOverTimeInsightStats)}
                      className="max-w-[22rem] px-3 py-2"
                      align="end"
                      side="top"
                    />
                    <PublicationInsightsTriggerButton
                      ariaLabel="Open publication type over time insight"
                      active={publicationTypeOverTimeInsightOpen}
                      onClick={onTogglePublicationTypeOverTimeInsight}
                    />
                  </div>
                </div>
              </div>
              {publicationTypeTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="house-drilldown-content-block w-full">
                    <PublicationCategoryDistributionChart
                      publications={publicationDrilldownRecords}
                      dimension="publication"
                      xAxisLabel="Publication type"
                      yAxisLabel="Publications"
                      emptyLabel="No publication type data"
                      animate={animateCharts}
                      enableValueModeToggle
                    />
                  </div>
                </div>
              ) : null}
            </div>

          </>
        ) : null}

        {activeTab === 'breakdown' ? (
          <>
            <div className="house-drilldown-heading-block">
              <div className="flex items-center justify-between gap-2">
                <p className="house-drilldown-heading-block-title">Which journals have I published in?</p>
                <DrilldownSheet.HeadingToggle
                  expanded={venueBreakdownExpanded}
                  onClick={(event) => {
                    event.stopPropagation()
                    setVenueBreakdownExpanded((value) => !value)
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                />
              </div>
            </div>
            {venueBreakdownExpanded ? (
              <div className="house-publications-drilldown-bounded-section house-publications-drilldown-first-section house-drilldown-content-block">
                <div className="house-drilldown-content-block w-full space-y-4">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                        <div
                          className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[42%_58%]')}
                          data-stop-tile-open="true"
                          data-ui="publications-journals-view-toggle"
                          data-house-role="chart-toggle"
                          style={{ width: '10rem', minWidth: '10rem', maxWidth: '10rem' }}
                        >
                          <span
                            className={HOUSE_TOGGLE_THUMB_CLASS}
                            style={journalBreakdownThumbStyle}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', journalBreakdownViewMode === 'top-ten' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                            onClick={(event) => {
                              event.stopPropagation()
                              setJournalBreakdownViewMode('top-ten')
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={journalBreakdownViewMode === 'top-ten'}
                          >
                            Top ten
                          </button>
                          <button
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', journalBreakdownViewMode === 'all-journals' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                            onClick={(event) => {
                              event.stopPropagation()
                              setJournalBreakdownViewMode('all-journals')
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={journalBreakdownViewMode === 'all-journals'}
                          >
                            All journals
                          </button>
                        </div>
                      </div>
                    </div>
                    {journalBreakdownViewMode === 'top-ten' ? (
                      venueTop10Data.length > 0 ? (
                      <PublicationBreakdownTable
                        rows={venueTop10Data}
                        variant="summary-drilldown"
                        showAvgCitations
                        shareWholeNumbers
                        showSearch={false}
                        showRowCount={false}
                        nameColumnLabel="Journal"
                        emptyMessage="No journal data available"
                      />
                      ) : (
                        <p className="text-sm text-muted-foreground">No journal data available</p>
                      )
                    ) : venueBreakdownData.length > 0 ? (
                      <PublicationBreakdownTable
                        rows={venueBreakdownData}
                        variant="summary-drilldown"
                        showAvgCitations
                        shareWholeNumbers
                        showSearch={false}
                        showRowCount={false}
                        nameColumnLabel="Journal"
                        emptyMessage="No journals found"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No journal data available</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="house-drilldown-heading-block">
              <div className="flex items-center justify-between gap-2">
                <p className="house-drilldown-heading-block-title">What topics have I published on?</p>
                <DrilldownSheet.HeadingToggle
                  expanded={topicBreakdownExpanded}
                  onClick={(event) => {
                    event.stopPropagation()
                    setTopicBreakdownExpanded((value) => !value)
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                />
              </div>
            </div>
            {topicBreakdownExpanded ? (
              <div className="house-publications-drilldown-bounded-section house-drilldown-content-block">
                <div className="house-drilldown-content-block w-full space-y-4">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                        <div
                          className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[42%_58%]')}
                          data-stop-tile-open="true"
                          data-ui="publications-topics-view-toggle"
                          data-house-role="chart-toggle"
                          style={{ width: '10rem', minWidth: '10rem', maxWidth: '10rem' }}
                        >
                          <span
                            className={HOUSE_TOGGLE_THUMB_CLASS}
                            style={topicBreakdownThumbStyle}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', topicBreakdownViewMode === 'top-ten' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                            onClick={(event) => {
                              event.stopPropagation()
                              setTopicBreakdownViewMode('top-ten')
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={topicBreakdownViewMode === 'top-ten'}
                          >
                            Top ten
                          </button>
                          <button
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, 'inline-flex items-center justify-center', topicBreakdownViewMode === 'all-topics' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                            onClick={(event) => {
                              event.stopPropagation()
                              setTopicBreakdownViewMode('all-topics')
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={topicBreakdownViewMode === 'all-topics'}
                          >
                            All topics
                          </button>
                        </div>
                      </div>
                    </div>
                    {topicBreakdownViewMode === 'top-ten' ? (
                      topicTop10Data.length > 0 ? (
                        <PublicationBreakdownTable
                          rows={topicTop10Data}
                          variant="summary-drilldown"
                          showAvgCitations
                          shareWholeNumbers
                          showSearch={false}
                          showRowCount={false}
                          nameColumnLabel="Topic"
                          emptyMessage="No topic data available"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">No research topic data available. Topics are extracted from OpenAlex enrichment.</p>
                      )
                    ) : topicBreakdownData.length > 0 ? (
                      <PublicationBreakdownTable
                        rows={topicBreakdownData}
                        variant="summary-drilldown"
                        showAvgCitations
                        shareWholeNumbers
                        showSearch={false}
                        showRowCount={false}
                        nameColumnLabel="Topic"
                        emptyMessage="No topic data available"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No research topic data available. Topics are extracted from OpenAlex enrichment.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="house-drilldown-heading-block">
              <div className="flex items-center justify-between gap-2">
                <p className="house-drilldown-heading-block-title">What open access statuses have I published in?</p>
                <DrilldownSheet.HeadingToggle
                  expanded={oaStatusBreakdownExpanded}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOaStatusBreakdownExpanded((value) => !value)
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                />
              </div>
            </div>
            {oaStatusBreakdownExpanded ? (
              <div className="house-publications-drilldown-bounded-section house-drilldown-content-block">
                <div className="house-drilldown-content-block w-full space-y-4">
                  <div>
                    {oaStatusBreakdownData.length > 0 ? (
                      <PublicationBreakdownTable
                        rows={oaStatusBreakdownData}
                        variant="summary-drilldown"
                        showAvgCitations
                        shareWholeNumbers
                        showSearch={false}
                        showRowCount={false}
                        nameColumnLabel="OA status"
                        emptyMessage="No OA status data available"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No open access data available. OA status is extracted from OpenAlex enrichment.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'trajectory' ? (
          <div className="house-publications-drilldown-bounded-section">
            <div className="house-drilldown-heading-block">
              <p className="house-drilldown-heading-block-title">Year-over-year trajectory</p>
            </div>
            <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
              {trajectoryVisibleYears.length ? (
                <>
                  <CompletedPeriodRangeSlider
                    minIndex={0}
                    maxIndex={trajectoryMaxIndex}
                    startIndex={trajectoryVisibleRange.start}
                    endIndex={trajectoryVisibleRange.end}
                    minSpan={trajectoryMinSpan}
                    selectionLabel={trajectoryFocusRangeLabel}
                    trailingContent={(
                      <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                        <div
                          className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-3')}
                          data-stop-tile-open="true"
                          data-ui="publications-trajectory-mode-toggle"
                          data-house-role="chart-toggle"
                          style={{ width: '15rem', minWidth: '15rem', maxWidth: '15rem' }}
                        >
                          <span
                            className={HOUSE_TOGGLE_THUMB_CLASS}
                            style={buildTileToggleThumbStyle(activeTrajectoryIndex, trajectoryOptions.length)}
                            aria-hidden="true"
                          />
                          {trajectoryOptions.map((option) => (
                            <button
                              key={`trajectory-mode-${option.key}`}
                              type="button"
                              data-stop-tile-open="true"
                              className={cn(
                                HOUSE_TOGGLE_BUTTON_CLASS,
                                'whitespace-nowrap',
                                trajectoryMode === option.key ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (trajectoryMode === option.key) {
                                  return
                                }
                                setTrajectoryMode(option.key)
                              }}
                              onMouseDown={(event) => event.stopPropagation()}
                              aria-pressed={trajectoryMode === option.key}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    onChange={(nextStart, nextEnd) => {
                      setTrajectoryRangeStart(nextStart)
                      setTrajectoryRangeEnd(nextEnd)
                    }}
                  />
                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                    <div
                      className={cn(
                        HOUSE_CHART_TRANSITION_CLASS,
                        HOUSE_CHART_ENTERED_CLASS,
                        'house-publications-trend-chart-frame-borderless',
                      )}
                      style={trajectoryChartFrameStyle}
                      data-house-role="chart-frame"
                    >
                      <div className="absolute overflow-visible" style={trajectoryPlotAreaStyle}>
                        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                          <div
                            className={cn('absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
                            style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.7)' }}
                          />
                          {trajectoryGridTickRatiosWithoutTop.map((ratio, index) => (
                            <div
                              key={`trajectory-grid-${index}`}
                              className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                              style={{
                                bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                                borderTop: `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`,
                              }}
                            />
                          ))}
                          {trajectoryHasTopYAxisTick ? (
                            <div
                              className={cn('absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                              style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
                            />
                          ) : null}
                          {trajectoryVerticalGridPercents.map((leftPct, index) => (
                            <div
                              key={`trajectory-grid-x-${index}`}
                              className={cn('absolute inset-y-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                              style={{ left: `${leftPct}%`, borderLeft: '1px solid hsl(var(--stroke-soft) / 0.58)' }}
                              data-ui="publication-trajectory-grid-x"
                              aria-hidden="true"
                            />
                          ))}
                          <div
                            className={cn('absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
                            style={{ borderRight: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
                            aria-hidden="true"
                          />
                        </div>
                        {trajectoryActiveTooltipSlice ? (
                          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                            <div
                              className="absolute inset-y-0 rounded-[0.2rem] bg-[hsl(var(--tone-accent-200)/0.16)]"
                              style={{
                                left: `${trajectoryActiveTooltipSlice.leftPct}%`,
                                width: `${trajectoryActiveTooltipSlice.widthPct}%`,
                              }}
                            />
                          </div>
                        ) : null}
                        <svg viewBox={`0 0 ${trajectoryPlotWidth} ${trajectoryPlotHeight}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                          {trajectoryPath ? (
                            trajectoryEntryRevealActive ? (
                              <>
                                <defs>
                                  <clipPath id={trajectoryEntryRevealClipId} clipPathUnits="userSpaceOnUse">
                                    <rect x="0" y="0" width={trajectoryEntryRevealWidth} height={trajectoryPlotHeight} />
                                  </clipPath>
                                </defs>
                                <path
                                  d={trajectoryPath}
                                  className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS}
                                  strokeWidth="1.9"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                  shapeRendering="geometricPrecision"
                                  clipPath={`url(#${trajectoryEntryRevealClipId})`}
                                />
                              </>
                            ) : (
                              <path
                                d={trajectoryPath}
                                className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS}
                                strokeWidth="1.9"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                                shapeRendering="geometricPrecision"
                                data-expanded={trajectoryLineExpanded ? 'true' : 'false'}
                                style={{
                                  opacity: trajectoryLineExpanded ? 1 : 0,
                                  transitionDuration: trajectoryLineTransitionDuration,
                                }}
                              />
                            )
                          ) : null}
                        </svg>
                        {trajectoryActiveTooltipSlice ? (
                          <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
                            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <line
                                x1={String(trajectoryActiveTooltipSlice.xPct)}
                                y1="0"
                                x2={String(trajectoryActiveTooltipSlice.xPct)}
                                y2="100"
                                stroke="hsl(var(--tone-accent-500) / 0.9)"
                                strokeWidth="1"
                                strokeDasharray="4 3"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle
                                cx={String(trajectoryActiveTooltipSlice.xPct)}
                                cy={String(trajectoryActiveTooltipSlice.yPct)}
                                r="1.55"
                                fill="hsl(var(--tone-accent-700))"
                                stroke="white"
                                strokeWidth="0.7"
                                vectorEffect="non-scaling-stroke"
                              />
                            </svg>
                          </div>
                        ) : null}
                        <TooltipProvider delayDuration={120}>
                          <div className="absolute inset-0 z-[4]" data-ui="publication-trajectory-tooltip-overlay">
                            {trajectoryTooltipSlices.map((slice) => {
                              const movingAveragePeriodLabel = formatTrajectoryMovingAveragePeriodLabel(slice.year, trajectoryAsOfDate)
                              return (
                                <Tooltip key={slice.key}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="absolute inset-y-0 block rounded-[0.2rem] bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-200))]"
                                      style={{
                                        left: `${slice.leftPct}%`,
                                        width: `${slice.widthPct}%`,
                                      }}
                                      data-ui="publication-trajectory-tooltip-slice"
                                      aria-label={buildTrajectoryTooltipAriaLabel(slice, trajectoryMode, movingAveragePeriodLabel)}
                                      onMouseEnter={() => setTrajectoryTooltipYear(slice.year)}
                                      onMouseLeave={() => {
                                        setTrajectoryTooltipYear((currentYear) => (
                                          currentYear === slice.year ? null : currentYear
                                        ))
                                      }}
                                      onFocus={() => setTrajectoryTooltipYear(slice.year)}
                                      onBlur={() => {
                                        setTrajectoryTooltipYear((currentYear) => (
                                          currentYear === slice.year ? null : currentYear
                                        ))
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="center"
                                    sideOffset={8}
                                    className="house-approved-tooltip z-[80] max-w-[18rem] whitespace-normal px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none"
                                  >
                                    <div className="space-y-1">
                                      <p className="font-medium text-[hsl(var(--tone-neutral-900))]">
                                        {slice.year}
                                      </p>
                                      {trajectoryMode === 'moving_avg' ? (
                                        <p>{`3-year avg ending ${movingAveragePeriodLabel}: ${formatTrajectoryMovingAverageValue(slice.movingAvgValue)}`}</p>
                                      ) : trajectoryMode === 'cumulative' ? (
                                        <p>{`Cumulative through ${slice.year}: ${formatInt(slice.cumulativeValue)}`}</p>
                                      ) : (
                                        <p>{`Publications: ${formatInt(slice.rawValue)}`}</p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </TooltipProvider>
                      </div>

                      <div className="pointer-events-none absolute" style={trajectoryYAxisPanelStyle} aria-hidden="true">
                        {trajectoryAnimatedAxisTickValues.map((tickValue, index) => {
                          const pct = Math.max(0, Math.min(100, (trajectoryTickRatios[index] || 0) * 100))
                          const tickRatioKey = Math.round((trajectoryTickRatios[index] || 0) * 1000)
                          return (
                            <p
                              key={`trajectory-y-axis-${tickRatioKey}`}
                              className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                              style={{
                                bottom: `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM}rem)`,
                                transitionDuration: `${trajectoryAxisDurationMs}ms`,
                                transitionProperty: 'bottom,opacity',
                              }}
                            >
                              {formatInt(Math.round(Number(tickValue || 0)))}
                            </p>
                          )
                        })}
                        <p
                          className={cn(
                            HOUSE_CHART_AXIS_TITLE_CLASS,
                            HOUSE_CHART_SCALE_AXIS_TITLE_CLASS,
                            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap',
                          )}
                          style={{ left: '34%' }}
                        >
                          Publications
                        </p>
                      </div>

                      <div
                        className={cn(
                          'pointer-events-none absolute',
                          HOUSE_TOGGLE_CHART_LABEL_CLASS,
                          HOUSE_CHART_SCALE_LAYER_CLASS,
                        )}
                        style={trajectoryXAxisTicksStyle}
                        data-ui="publication-trajectory-x-axis"
                      >
                        {trajectoryXAxisTicks.map((tick, index) => {
                          const tickAnchor = getTrajectoryYearTickAnchor(tick.leftPct)
                          const isFirst = index === 0
                          const isLast = index === trajectoryXAxisTicks.length - 1
                          return (
                            <div
                              key={tick.key}
                              className={cn(
                                'house-chart-axis-period-item absolute top-0 leading-none',
                                tickAnchor === 'left' ? 'text-left' : tickAnchor === 'right' ? 'text-right' : 'text-center',
                                HOUSE_CHART_SCALE_TICK_CLASS,
                              )}
                              style={{
                                left: `${tick.leftPct}%`,
                                transform: tickAnchor === 'left'
                                  ? 'translateX(0)'
                                  : tickAnchor === 'right'
                                    ? 'translateX(-100%)'
                                    : 'translateX(-50%)',
                                transitionProperty: 'opacity',
                                transitionDuration: `${trajectoryAxisDurationMs}ms`,
                              }}
                              aria-label={`${isFirst ? 'Start' : isLast ? 'End' : 'Middle'} trajectory year: ${tick.label}`}
                            >
                              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                                {tick.label}
                              </p>
                            </div>
                          )
                        })}
                      </div>

                      <div
                        className="pointer-events-none absolute"
                        style={{
                          left: trajectoryChartLeftInset,
                          right: '0.5rem',
                          bottom: `${trajectoryXAxisLayout.xAxisNameBottomRem}rem`,
                          minHeight: `${trajectoryXAxisLayout.xAxisNameMinHeightRem}rem`,
                        }}
                      >
                        <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
                          Publication year
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                    <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS} style={trajectoryVolatilityTileTintStyle}>
                      <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>
                        Volatility index
                      </p>
                      <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                        <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>
                          {trajectoryVolatilityIndex.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS} style={trajectoryGrowthTileTintStyle}>
                      <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>
                        Growth slope
                      </p>
                      <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                        <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>
                          {trajectoryGrowthSlope >= 0 ? '+' : ''}{trajectoryGrowthSlope.toFixed(2)}/year
                        </p>
                      </div>
                    </div>
                    <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_SMALL_CLASS}>
                      <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>
                        Phase marker
                      </p>
                      <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                        <div className="flex w-full justify-center">
                          {renderTrajectoryPhaseBadge(trajectoryPhase)}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className={HOUSE_DRILLDOWN_PLACEHOLDER_CLASS}>
                  No trajectory data available.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === 'context' ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Portfolio maturity</p>
                  <HelpTooltipIconButton
                    ariaLabel="Explain portfolio maturity context"
                    content={totalPublicationsContextPortfolioTooltip}
                  />
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                {totalPublicationsContextStats.emptyReason ? (
                  <p className="house-publications-drilldown-empty-state">
                    {totalPublicationsContextStats.emptyReason}
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>First publication</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.firstPublicationValue}
                      </p>
                    </div>
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Active span</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.activeSpanValue}
                      </p>
                    </div>
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Years with output</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.yearsWithOutputValue}
                      </p>
                    </div>
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Longest streak</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.longestStreakValue}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Recent vs earlier output</p>
                  <HelpTooltipIconButton
                    ariaLabel="Explain recent versus earlier output context"
                    content={totalPublicationsContextRecentTooltip}
                  />
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  {totalPublicationsContextStats.recentSharePct !== null && totalPublicationsContextStats.earlierSharePct !== null ? (
                    <CitationSplitBarCard
                      bare
                      left={{
                        label: totalPublicationsContextStats.recentWindowLabel,
                        value: formatPercentWhole(totalPublicationsContextStats.recentSharePct),
                        ratioPct: totalPublicationsContextStats.recentSharePct,
                        toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
                      }}
                      right={{
                        label: totalPublicationsContextStats.earlierWindowLabel,
                        value: formatPercentWhole(totalPublicationsContextStats.earlierSharePct),
                        ratioPct: totalPublicationsContextStats.earlierSharePct,
                        toneClass: HOUSE_CHART_BAR_NEUTRAL_CLASS,
                      }}
                    />
                  ) : totalPublicationsContextStats.emptyReason ? (
                    <p className="house-publications-drilldown-empty-state">
                      {totalPublicationsContextStats.emptyReason}
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>
                        {`Recent mean (${formatTotalPublicationsContextWindowDisplayLabel(totalPublicationsContextStats.recentWindowLabel)})`}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.recentMeanValue}
                      </p>
                    </div>
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>
                        {`Earlier mean (${formatTotalPublicationsContextWindowDisplayLabel(totalPublicationsContextStats.earlierWindowLabel)})`}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.baselineMeanValue}
                      </p>
                    </div>
                    <div className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Change vs baseline</p>
                      <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))] tabular-nums">
                        {totalPublicationsContextStats.momentumValue}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Composition shift</p>
                  <HelpTooltipIconButton
                    ariaLabel="Explain composition shift context"
                    content={totalPublicationsContextCompositionTooltip}
                  />
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'dimension', label: 'Dimension' },
                    { key: 'lifetime', label: 'Lifetime leader', align: 'center', width: '1%' },
                    { key: 'recent', label: 'Recent leader', align: 'center', width: '1%' },
                  ]}
                  rows={totalPublicationsContextStats.mixShiftRows.map((row) => ({
                    key: row.key,
                    cells: {
                      dimension: row.dimensionLabel,
                      lifetime: row.lifetimeValue,
                      recent: row.recentValue,
                    },
                  }))}
                  emptyMessage={totalPublicationsContextStats.emptyReason ?? 'No composition-shift data available for the current publication set.'}
                />
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'methods' ? (
          <>
            {totalPublicationsMethodsSections.map((section) => (
              <div key={section.key} className="house-publications-drilldown-bounded-section">
                <div className="house-drilldown-heading-block">
                  <p className="house-drilldown-heading-block-title">{section.title}</p>
                </div>
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className={cn(HOUSE_SURFACE_STRONG_PANEL_CLASS, 'space-y-3 px-3 py-3')}>
                    <p className="text-sm leading-6 text-[hsl(var(--tone-neutral-700))]">{section.description}</p>
                    {section.facts.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {section.facts.map((fact) => (
                          <div key={`${section.key}-${fact.label}`} className={cn(HOUSE_DRILLDOWN_STAT_CARD_CLASS, 'px-2.5 py-2')}>
                            <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{fact.label}</p>
                            <p className="mt-1 text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))]">{fact.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {section.bullets.length ? (
                      <ul className="space-y-2 text-sm leading-6 text-[hsl(var(--tone-neutral-700))]">
                        {section.bullets.map((bullet) => (
                          <li key={bullet} className="flex gap-2">
                            <span
                              aria-hidden="true"
                              className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--tone-accent-500))]"
                            />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {section.note ? (
                      <p className="text-caption text-[hsl(var(--tone-neutral-600))]">{section.note}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}

      </div>
    </div>
  )
}

function GenericMetricDrilldownWorkspace({
  tile,
  activeTab,
  animateCharts = true,
  token = null,
  onOpenPublication,
  onDrilldownTabChange,
  totalCitationsTile,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  animateCharts?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  onDrilldownTabChange?: (tab: DrilldownTab) => void
  totalCitationsTile: PublicationMetricTilePayload | null
}) {
  const [publicationTrendsWindowMode, setPublicationTrendsWindowMode] = useState<PublicationsWindowMode>('all')
  const [publicationTrendsVisualMode, setPublicationTrendsVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const [publicationTrendsExpanded, setPublicationTrendsExpanded] = useState(true)
  const [articleTypeTrendsExpanded, setArticleTypeTrendsExpanded] = useState(true)
  const [publicationTypeTrendsExpanded, setPublicationTypeTrendsExpanded] = useState(true)
  const [uncitedBreakdownExpanded, setUncitedBreakdownExpanded] = useState(true)
  const [recentConcentrationExpanded, setRecentConcentrationExpanded] = useState(true)
  const [citationHistogramExpanded, setCitationHistogramExpanded] = useState(true)
  const [citationActivationExpanded, setCitationActivationExpanded] = useState(true)
  const [citationActivationHistoryExpanded, setCitationActivationHistoryExpanded] = useState(true)
  const [citationMomentumExpanded, setCitationMomentumExpanded] = useState(true)
  const [citationMomentumViewMode, setCitationMomentumViewMode] = useState<CitationMomentumViewMode>('sleeping')
  const [momentumWindowMode, setMomentumWindowMode] = useState<MomentumWindowMode>('12m')
  const [momentumOverviewViewMode, setMomentumOverviewViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [fieldPercentileDrilldownThreshold, setFieldPercentileDrilldownThreshold] = useState<FieldPercentileThreshold>(75)
  const [uncitedBreakdownViewMode, setUncitedBreakdownViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [recentConcentrationViewMode, setRecentConcentrationViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [citationActivationViewMode, setCitationActivationViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [citationActivationTableMode, setCitationActivationTableMode] = useState<CitationActivationTableMode>('newlyActive')
  const [citationActivationHistorySeriesMode, setCitationActivationHistorySeriesMode] = useState<CitationActivationHistorySeriesMode>('default')
  const [recentConcentrationWindowMode, setRecentConcentrationWindowMode] = useState<RecentConcentrationWindowMode>('1y')
  const [citationActivationHistoryRangeStart, setCitationActivationHistoryRangeStart] = useState(0)
  const [citationActivationHistoryRangeEnd, setCitationActivationHistoryRangeEnd] = useState(0)
  const [publicationInsightsByRequestKey, setPublicationInsightsByRequestKey] = useState<Record<string, PublicationInsightsAgentPayload>>({})
  const [publicationInsightsLoadingByRequestKey, setPublicationInsightsLoadingByRequestKey] = useState<Record<string, boolean>>({})
  const [publicationInsightsErrorByRequestKey, setPublicationInsightsErrorByRequestKey] = useState<Record<string, string>>({})
  const publicationInsightsInFlightRef = useRef<Partial<Record<string, Promise<PublicationInsightsAgentPayload | null>>>>({})
  const [uncitedInsightOpen, setUncitedInsightOpen] = useState(false)
  const [recentConcentrationInsightOpen, setRecentConcentrationInsightOpen] = useState(false)
  const [citationHistogramInsightOpen, setCitationHistogramInsightOpen] = useState(false)
  const [citationActivationInsightOpen, setCitationActivationInsightOpen] = useState(false)
  const [citationActivationHistoryInsightOpen, setCitationActivationHistoryInsightOpen] = useState(false)
  const [citationMomentumInsightOpen, setCitationMomentumInsightOpen] = useState(false)
  const [hIndexInsightKey, setHIndexInsightKey] = useState<HIndexInsightKey | null>(null)
  const [hIndexSummaryStepsExpanded, setHIndexSummaryStepsExpanded] = useState(true)
  const [hIndexSummaryCandidatesExpanded, setHIndexSummaryCandidatesExpanded] = useState(true)
  const [hIndexSummaryThresholdTableMode, setHIndexSummaryThresholdTableMode] = useState<HIndexSummaryThresholdTableMode>('next')
  const momentumYearBreakdown = useMemo(
    () => buildMomentumYearBreakdown(totalCitationsTile),
    [totalCitationsTile],
  )
  const subsectionTitleByTab: Partial<Record<DrilldownTab, string>> = {
    breakdown: 'Breakdown results',
    trajectory: 'Trajectory results',
    context: 'Context results',
    methods: 'Methods metadata',
  }
  const subsectionTitle = subsectionTitleByTab[activeTab] || null

  useEffect(() => {
    setPublicationTrendsWindowMode('all')
    setPublicationTrendsVisualMode('bars')
    setPublicationTrendsExpanded(true)
    setArticleTypeTrendsExpanded(true)
    setPublicationTypeTrendsExpanded(true)
    setUncitedBreakdownExpanded(true)
    setRecentConcentrationExpanded(true)
    setCitationActivationExpanded(true)
    setCitationActivationHistoryExpanded(true)
    setCitationMomentumExpanded(true)
    setCitationMomentumViewMode('sleeping')
    setUncitedBreakdownViewMode('bar')
    setRecentConcentrationViewMode('bar')
    setCitationActivationViewMode('bar')
    setCitationActivationTableMode('newlyActive')
    setCitationActivationHistorySeriesMode('default')
    setRecentConcentrationWindowMode('1y')
    setCitationActivationHistoryRangeStart(0)
    setCitationActivationHistoryRangeEnd(0)
    publicationInsightsInFlightRef.current = {}
    setPublicationInsightsByRequestKey({})
    setPublicationInsightsLoadingByRequestKey({})
    setPublicationInsightsErrorByRequestKey({})
    setUncitedInsightOpen(false)
    setRecentConcentrationInsightOpen(false)
    setCitationHistogramInsightOpen(false)
    setCitationActivationInsightOpen(false)
    setCitationActivationHistoryInsightOpen(false)
    setCitationMomentumInsightOpen(false)
    setHIndexInsightKey(null)
    setHIndexSummaryStepsExpanded(true)
    setHIndexSummaryCandidatesExpanded(true)
    setHIndexSummaryThresholdTableMode('next')
  }, [tile.key])

  const requestPublicationInsights = useCallback(
    async ({
      windowId,
      sectionKey,
      scope = 'window',
    }: {
      windowId: PublicationsWindowMode
      sectionKey: PublicationInsightsSectionKey
      scope?: 'window' | 'section'
    }) => {
      const normalizedWindowId = windowId === 'all' ? 'all' : windowId
      const requestKey = `${sectionKey}:${scope}:${normalizedWindowId}`
      if (publicationInsightsByRequestKey[requestKey]) {
        return publicationInsightsByRequestKey[requestKey]
      }
      if (publicationInsightsInFlightRef.current[requestKey]) {
        return publicationInsightsInFlightRef.current[requestKey]
      }
      if (!token) {
        const message = 'Session token is required to generate publication insights.'
        setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: message }))
        return null
      }
      const requestPromise = (async () => {
        setPublicationInsightsLoadingByRequestKey((current) => ({ ...current, [requestKey]: true }))
        setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: '' }))
        try {
          const payload = await fetchPublicationInsightsAgent(token, {
            windowId: normalizedWindowId,
            scope,
            sectionKey,
          })
          setPublicationInsightsByRequestKey((current) => ({ ...current, [requestKey]: payload }))
          return payload
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not generate publication insights.'
          setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: message }))
          return null
        } finally {
          delete publicationInsightsInFlightRef.current[requestKey]
          setPublicationInsightsLoadingByRequestKey((current) => ({ ...current, [requestKey]: false }))
        }
      })()
      publicationInsightsInFlightRef.current[requestKey] = requestPromise
      return requestPromise
    },
    [publicationInsightsByRequestKey, token],
  )

  const onToggleUncitedInsight = useCallback(() => {
    setUncitedInsightOpen((current) => {
      const next = !current
      if (next) {
        setRecentConcentrationInsightOpen(false)
        setCitationActivationInsightOpen(false)
        setCitationActivationHistoryInsightOpen(false)
        setCitationMomentumInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'uncited_works',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onToggleRecentConcentrationInsight = useCallback(() => {
    setRecentConcentrationInsightOpen((current) => {
      const next = !current
      if (next) {
        setUncitedInsightOpen(false)
        setCitationActivationInsightOpen(false)
        setCitationActivationHistoryInsightOpen(false)
        setCitationMomentumInsightOpen(false)
        void requestPublicationInsights({
          windowId: '1y',
          sectionKey: 'citation_drivers',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onToggleCitationActivationInsight = useCallback(() => {
    setCitationActivationInsightOpen((current) => {
      const next = !current
      if (next) {
        setUncitedInsightOpen(false)
        setRecentConcentrationInsightOpen(false)
        setCitationHistogramInsightOpen(false)
        setCitationActivationHistoryInsightOpen(false)
        setCitationMomentumInsightOpen(false)
        void requestPublicationInsights({
          windowId: '1y',
          sectionKey: 'citation_activation',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onToggleCitationHistogramInsight = useCallback(() => {
    setCitationHistogramInsightOpen((current) => {
      const next = !current
      if (next) {
        setUncitedInsightOpen(false)
        setRecentConcentrationInsightOpen(false)
        setCitationActivationInsightOpen(false)
        setCitationActivationHistoryInsightOpen(false)
        setCitationMomentumInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'citation_drivers',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onToggleCitationActivationHistoryInsight = useCallback(() => {
    setCitationActivationHistoryInsightOpen((current) => {
      const next = !current
      if (next) {
        setUncitedInsightOpen(false)
        setRecentConcentrationInsightOpen(false)
        setCitationHistogramInsightOpen(false)
        setCitationActivationInsightOpen(false)
        setCitationMomentumInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'citation_activation_history',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  const onToggleCitationMomentumInsight = useCallback(() => {
    setCitationMomentumInsightOpen((current) => {
      const next = !current
      if (next) {
        setUncitedInsightOpen(false)
        setRecentConcentrationInsightOpen(false)
        setCitationHistogramInsightOpen(false)
        setCitationActivationInsightOpen(false)
        setCitationActivationHistoryInsightOpen(false)
        void requestPublicationInsights({
          windowId: 'all',
          sectionKey: 'citation_drivers',
          scope: 'section',
        })
      }
      return next
    })
  }, [requestPublicationInsights])

  useEffect(() => {
    if (!recentConcentrationInsightOpen) {
      return
    }
    const requestKey = 'citation_drivers:section:1y'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: '1y',
      sectionKey: 'citation_drivers',
      scope: 'section',
    })
  }, [
    publicationInsightsByRequestKey,
    recentConcentrationInsightOpen,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!citationActivationInsightOpen) {
      return
    }
    const requestKey = 'citation_activation:section:1y'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: '1y',
      sectionKey: 'citation_activation',
      scope: 'section',
    })
  }, [
    citationActivationInsightOpen,
    publicationInsightsByRequestKey,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!citationHistogramInsightOpen) {
      return
    }
    const requestKey = 'citation_drivers:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'citation_drivers',
      scope: 'section',
    })
  }, [
    citationHistogramInsightOpen,
    publicationInsightsByRequestKey,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!citationActivationHistoryInsightOpen) {
      return
    }
    const requestKey = 'citation_activation_history:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'citation_activation_history',
      scope: 'section',
    })
  }, [
    citationActivationHistoryInsightOpen,
    publicationInsightsByRequestKey,
    requestPublicationInsights,
  ])

  useEffect(() => {
    if (!citationMomentumInsightOpen) {
      return
    }
    const requestKey = 'citation_drivers:section:all'
    if (publicationInsightsByRequestKey[requestKey]) {
      return
    }
    void requestPublicationInsights({
      windowId: 'all',
      sectionKey: 'citation_drivers',
      scope: 'section',
    })
  }, [
    citationMomentumInsightOpen,
    publicationInsightsByRequestKey,
    requestPublicationInsights,
  ])

  const publicationDrilldownRecords = useMemo<PublicationDrilldownRecord[]>(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const publications = Array.isArray(drilldown.publications) ? drilldown.publications : []
    return publications
      .map<PublicationDrilldownRecord | null>((item, index) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const record = item as Record<string, unknown>
        const yearRaw = Number(record.year)
        const year = Number.isInteger(yearRaw) ? yearRaw : null
        const workId = String(record.work_id || record.id || `publication-${index}`)
        const title = String(record.title || '').trim()
        const role = String(record.role || '').trim()
        const type = String(record.type || '').trim()
        const publicationType = String(record.work_type || record.workType || record.publication_type || record.publicationType || '').trim()
        const articleType = String(record.article_type || record.articleType || '').trim()
        const venue = String(record.venue || record.journal || '').trim()
        const citations = parsePublicationCitationCount(
          record.citations_lifetime ?? record.citations ?? record.cited_by_count ?? 0,
        )
        return {
          workId,
          year,
          publicationDate: typeof record.publication_date === 'string' && record.publication_date.trim()
            ? record.publication_date.trim()
            : null,
          publicationMonthStart: typeof record.publication_month_start === 'string' && record.publication_month_start.trim()
            ? record.publication_month_start.trim()
            : null,
          title,
          role,
          type,
          publicationType,
          articleType,
          venue,
          citations,
          citations1yRolling: parsePublicationCitationCount(record.citations_1y_rolling ?? 0),
          citations3yRolling: parsePublicationCitationCount(record.citations_3y_rolling ?? 0),
          citations5yRolling: parsePublicationCitationCount(record.citations_5y_rolling ?? 0),
          citationsLifeRolling: parsePublicationCitationCount(
            record.citations_life_rolling ?? record.citations_lifetime ?? record.citations ?? 0,
          ),
        }
      })
      .filter(isNonNullish)
  }, [tile.drilldown])
  const citationVolumeYAxisLabel = useMemo(
    () => resolveCitationVolumeYAxisLabel({
      windowMode: publicationTrendsWindowMode,
      visualMode: publicationTrendsVisualMode,
      publicationRecords: publicationDrilldownRecords,
      tile,
    }),
    [publicationDrilldownRecords, publicationTrendsVisualMode, publicationTrendsWindowMode, tile],
  )
  const citationVolumeTableRows = useMemo(
    () => buildCitationVolumeTableRows(tile, publicationTrendsWindowMode),
    [publicationTrendsWindowMode, tile],
  )
  const uncitedPublicationRecords = useMemo(
    () => publicationDrilldownRecords
      .filter((record) => record.citations <= 0)
      .sort((left, right) => left.title.localeCompare(right.title, 'en-GB')),
    [publicationDrilldownRecords],
  )
  const recentConcentrationWindowRecords = useMemo(
    () => publicationDrilldownRecords
      .map((record) => ({
        ...record,
        selectedWindowCitations: resolvePublicationCitationValueForWindow(record, recentConcentrationWindowMode),
      }))
      .filter((record) => record.selectedWindowCitations > 0)
      .slice()
      .sort((left, right) => {
        if (right.selectedWindowCitations !== left.selectedWindowCitations) {
          return right.selectedWindowCitations - left.selectedWindowCitations
        }
        return left.title.localeCompare(right.title, 'en-GB')
      }),
    [publicationDrilldownRecords, recentConcentrationWindowMode],
  )
  const recentConcentrationPublicationRecords = useMemo(
    () => recentConcentrationWindowRecords.slice(0, 3),
    [recentConcentrationWindowRecords],
  )
  const recentConcentrationOtherCitations = useMemo(
    () => recentConcentrationWindowRecords
      .slice(3)
      .reduce((sum, record) => sum + record.selectedWindowCitations, 0),
    [recentConcentrationWindowRecords],
  )
  const citationHistogramBuckets = useMemo(
    () => buildCitationHistogramBuckets(publicationDrilldownRecords.map((record) => record.citations)),
    [publicationDrilldownRecords],
  )
  const citationHistogramMaxCitations = useMemo(
    () => Math.max(0, ...publicationDrilldownRecords.map((record) => Math.max(0, record.citations))),
    [publicationDrilldownRecords],
  )
  const { sleeping: sleepingPublicationRecords, freshPickup: freshPickupPublicationRecords } = useMemo(
    () => buildCitationMomentumLists(publicationDrilldownRecords),
    [publicationDrilldownRecords],
  )
  const citationMomentumTableConfig = useMemo(() => {
    if (citationMomentumViewMode === 'sleeping') {
      return {
        nameColumnLabel: 'Sleeping paper',
        metricColumnLabel: 'Last 12m',
        secondaryMetricColumnLabel: 'Total',
        rows: sleepingPublicationRecords.map((record) => ({
          key: record.workId,
          label: record.title || 'Untitled publication',
          year: record.year,
          metricValue: formatInt(record.recentCitations),
          secondaryMetricValue: formatInt(record.citations),
          workId: record.workId,
        })),
        emptyMessage: 'No sleeping papers identified right now.',
      }
    }
    return {
      nameColumnLabel: 'Fresh-pickup paper',
      metricColumnLabel: 'Last 12m',
      secondaryMetricColumnLabel: 'Prior 24m',
      rows: freshPickupPublicationRecords.map((record) => ({
        key: record.workId,
        label: record.title || 'Untitled publication',
        year: record.year,
        metricValue: formatInt(record.recentCitations),
        secondaryMetricValue: formatInt(record.prior24MonthCitations),
        workId: record.workId,
      })),
      emptyMessage: 'No fresh-pickup papers identified right now.',
    }
  }, [citationMomentumViewMode, freshPickupPublicationRecords, sleepingPublicationRecords])
  const citationActivationPublicationRecords = useMemo(
    () => publicationDrilldownRecords
      .filter((record) => (record.citations1yRolling || 0) > 0)
      .slice()
      .sort((left, right) => {
        const rightCitations = right.citations1yRolling || 0
        const leftCitations = left.citations1yRolling || 0
        if (rightCitations !== leftCitations) {
          return rightCitations - leftCitations
        }
        return left.title.localeCompare(right.title, 'en-GB')
      }),
    [publicationDrilldownRecords],
  )
  const newlyActivePublicationRecords = useMemo(
    () => citationActivationPublicationRecords
      .filter((record) => Math.max(0, (record.citations3yRolling || 0) - (record.citations1yRolling || 0)) <= 0),
    [citationActivationPublicationRecords],
  )
  const stillActivePublicationRecords = useMemo(
    () => citationActivationPublicationRecords
      .filter((record) => Math.max(0, (record.citations3yRolling || 0) - (record.citations1yRolling || 0)) > 0),
    [citationActivationPublicationRecords],
  )
  const inactivePublicationRecords = useMemo(
    () => publicationDrilldownRecords
      .filter((record) => (record.citations1yRolling || 0) <= 0)
      .slice()
      .sort((left, right) => {
        if (right.citations !== left.citations) {
          return right.citations - left.citations
        }
        return left.title.localeCompare(right.title, 'en-GB')
      }),
    [publicationDrilldownRecords],
  )
  const inactivePublicationCount = useMemo(
    () => Math.max(0, publicationDrilldownRecords.length - citationActivationPublicationRecords.length),
    [citationActivationPublicationRecords.length, publicationDrilldownRecords.length],
  )
  const citationActivationTableConfig = useMemo(() => {
    if (citationActivationTableMode === 'stillActive') {
      return {
        mode: 'stillActive' as const,
        nameColumnLabel: 'Still active publication',
        metricColumnLabel: 'Last 12m',
        secondaryMetricColumnLabel: 'Total citations',
        rows: stillActivePublicationRecords.map((record) => ({
          key: record.workId,
          label: record.title || 'Untitled publication',
          year: record.year,
          metricValue: formatInt(record.citations1yRolling || 0),
          secondaryMetricValue: formatInt(record.citations),
          workId: record.workId,
        })),
        emptyMessage: 'No still active publications available.',
      }
    }
    if (citationActivationTableMode === 'inactive') {
      return {
        mode: 'inactive' as const,
        nameColumnLabel: 'Inactive publication',
        metricColumnLabel: 'Last 12m',
        secondaryMetricColumnLabel: 'Total citations',
        rows: inactivePublicationRecords.map((record) => ({
          key: record.workId,
          label: record.title || 'Untitled publication',
          year: record.year,
          metricValue: formatInt(record.citations1yRolling || 0),
          secondaryMetricValue: formatInt(record.citations),
          workId: record.workId,
        })),
        emptyMessage: 'No inactive publications available.',
      }
    }
    return {
      mode: 'newlyActive' as const,
      nameColumnLabel: 'Newly active publication',
      metricColumnLabel: 'Last 12m',
      secondaryMetricColumnLabel: 'Total citations',
      rows: newlyActivePublicationRecords.map((record) => ({
        key: record.workId,
        label: record.title || 'Untitled publication',
        year: record.year,
        metricValue: formatInt(record.citations1yRolling || 0),
        secondaryMetricValue: formatInt(record.citations),
        workId: record.workId,
      })),
      emptyMessage: 'No newly active publications available.',
    }
  }, [
    citationActivationTableMode,
    inactivePublicationRecords,
    newlyActivePublicationRecords,
    stillActivePublicationRecords,
  ])
  const citationActivationHistoryPoints = useMemo(() => {
    const fallbackRowsByYear = new Map<number, {
      key: string
      label: string
      timeMs: number
      newlyActiveCount: number
      stillActiveCount: number
      inactiveCount: number
      totalCount: number
    }>()
    publicationDrilldownRecords.forEach((record) => {
      if (!Number.isInteger(record.year)) {
        return
      }
      const year = Number(record.year)
      const current = fallbackRowsByYear.get(year) || {
        key: String(year),
        label: String(year),
        timeMs: Date.UTC(year, 0, 1),
        newlyActiveCount: 0,
        stillActiveCount: 0,
        inactiveCount: 0,
        totalCount: 0,
      }
      const recentCitations = record.citations1yRolling || 0
      const priorCitations = Math.max(0, (record.citations3yRolling || 0) - recentCitations)
      current.totalCount += 1
      if (recentCitations > 0 && priorCitations <= 0) {
        current.newlyActiveCount += 1
      } else if (recentCitations > 0) {
        current.stillActiveCount += 1
      } else {
        current.inactiveCount += 1
      }
      fallbackRowsByYear.set(year, current)
    })
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const metadata = drilldown.metadata && typeof drilldown.metadata === 'object'
      ? drilldown.metadata as Record<string, unknown>
      : {}
    const drilldownSeries = Array.isArray(drilldown.series)
      ? drilldown.series
      : []
    const activationHistory = metadata.activation_history && typeof metadata.activation_history === 'object'
      ? metadata.activation_history as Record<string, unknown>
      : {}
    const chartData = (tile.chart_data || {}) as Record<string, unknown>
    const yearlyActivationYears = toNumberArray(
      Array.isArray(activationHistory.years)
        ? activationHistory.years
        : chartData.activation_history_years,
    )
    const yearlyActivationNewly = toNumberArray(
      Array.isArray(activationHistory.newly_active)
        ? activationHistory.newly_active
        : chartData.activation_history_newly_active,
    )
    const yearlyActivationStill = toNumberArray(
      Array.isArray(activationHistory.still_active)
        ? activationHistory.still_active
        : chartData.activation_history_still_active,
    )
    const yearlyActivationInactive = toNumberArray(
      Array.isArray(activationHistory.inactive)
        ? activationHistory.inactive
        : chartData.activation_history_inactive,
    )
    const yearlyActivationPublished = toNumberArray(
      Array.isArray(activationHistory.published_total)
        ? activationHistory.published_total
        : chartData.activation_history_published,
    )
    const rollingNewlyActive = Array.isArray(activationHistory.rolling_newly_active)
      ? activationHistory.rolling_newly_active
      : Array.isArray(chartData.activation_history_rolling_newly_active)
        ? chartData.activation_history_rolling_newly_active
        : []
    const rollingStillActive = Array.isArray(activationHistory.rolling_still_active)
      ? activationHistory.rolling_still_active
      : Array.isArray(chartData.activation_history_rolling_still_active)
        ? chartData.activation_history_rolling_still_active
        : []
    const rollingInactive = Array.isArray(activationHistory.rolling_inactive)
      ? activationHistory.rolling_inactive
      : Array.isArray(chartData.activation_history_rolling_inactive)
        ? chartData.activation_history_rolling_inactive
        : []
    const rollingPublished = Array.isArray(activationHistory.rolling_published_total)
      ? activationHistory.rolling_published_total
      : Array.isArray(chartData.activation_history_rolling_published)
        ? chartData.activation_history_rolling_published
        : []
    const lifetimeLabels = toStringArray(chartData.month_labels_lifetime)
    const lifetimeStart = parseIsoPublicationDate(String(chartData.lifetime_month_start || '').trim())
    const rollingPoints: Array<{
      key: string
      label: string
      timeMs: number
      newlyActiveCount: number
      stillActiveCount: number
      inactiveCount: number
      totalCount: number
    }> = []
    if (lifetimeStart instanceof Date) {
      const pointCount = Math.min(
        rollingNewlyActive.length,
        rollingStillActive.length,
        rollingInactive.length,
        rollingPublished.length,
      )
      for (let index = 0; index < pointCount; index += 1) {
        const pointDate = new Date(Date.UTC(
          lifetimeStart.getUTCFullYear(),
          lifetimeStart.getUTCMonth() + index,
          1,
        ))
        rollingPoints.push({
          key: `rolling-${pointDate.getUTCFullYear()}-${pointDate.getUTCMonth() + 1}`,
          label: lifetimeLabels[index] || `${MONTH_SHORT[pointDate.getUTCMonth()]} ${pointDate.getUTCFullYear()}`,
          timeMs: pointDate.getTime(),
          newlyActiveCount: parsePublicationCitationCount(rollingNewlyActive[index]),
          stillActiveCount: parsePublicationCitationCount(rollingStillActive[index]),
          inactiveCount: parsePublicationCitationCount(rollingInactive[index]),
          totalCount: parsePublicationCitationCount(rollingPublished[index]),
        })
      }
    }
    const yearlyFallbackPoints: Array<{
      key: string
      label: string
      timeMs: number
      newlyActiveCount: number
      stillActiveCount: number
      inactiveCount: number
      totalCount: number
    }> = []
    const yearlyPointCount = Math.min(
      yearlyActivationYears.length,
      yearlyActivationNewly.length,
      yearlyActivationStill.length,
      yearlyActivationInactive.length,
      yearlyActivationPublished.length,
    )
    for (let index = 0; index < yearlyPointCount; index += 1) {
      const rawYear = yearlyActivationYears[index]
      const year = Number.isInteger(rawYear) ? rawYear : null
      if (year === null) {
        continue
      }
      yearlyFallbackPoints.push({
        key: `yearly-${year}`,
        label: String(year),
        timeMs: Date.UTC(year, 0, 1),
        newlyActiveCount: parsePublicationCitationCount(yearlyActivationNewly[index]),
        stillActiveCount: parsePublicationCitationCount(yearlyActivationStill[index]),
        inactiveCount: parsePublicationCitationCount(yearlyActivationInactive[index]),
        totalCount: parsePublicationCitationCount(yearlyActivationPublished[index]),
      })
    }
    const drilldownSeriesById = new Map<string, Array<{ label: string; value: number }>>()
    drilldownSeries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return
      }
      const item = entry as Record<string, unknown>
      const seriesId = String(item.series_id || '').trim()
      if (!seriesId) {
        return
      }
      const points = Array.isArray(item.points) ? item.points : []
      const normalizedPoints = points
        .map((point) => {
          if (!point || typeof point !== 'object') {
            return null
          }
          const record = point as Record<string, unknown>
          const label = String(record.label || '').trim()
          if (!label) {
            return null
          }
          return {
            label,
            value: parsePublicationCitationCount(record.value),
          }
        })
        .filter(isNonNullish)
      if (normalizedPoints.length) {
        drilldownSeriesById.set(seriesId, normalizedPoints)
      }
    })
    const seriesNewly = drilldownSeriesById.get('activation_newly_active') || []
    const seriesStill = drilldownSeriesById.get('activation_still_active') || []
    const seriesInactive = drilldownSeriesById.get('activation_inactive') || []
    const seriesPublished = drilldownSeriesById.get('activation_published_total') || []
    const seriesFallbackPoints: Array<{
      key: string
      label: string
      timeMs: number
      newlyActiveCount: number
      stillActiveCount: number
      inactiveCount: number
      totalCount: number
    }> = []
    const seriesPointCount = Math.min(
      seriesNewly.length,
      seriesStill.length,
      seriesInactive.length,
      seriesPublished.length,
    )
    for (let index = 0; index < seriesPointCount; index += 1) {
      const label = seriesPublished[index]?.label || seriesNewly[index]?.label || seriesStill[index]?.label || seriesInactive[index]?.label || ''
      const year = Number.parseInt(label, 10)
      if (!Number.isInteger(year)) {
        continue
      }
      seriesFallbackPoints.push({
        key: `series-${year}`,
        label: String(year),
        timeMs: Date.UTC(year, 0, 1),
        newlyActiveCount: seriesNewly[index]?.value || 0,
        stillActiveCount: seriesStill[index]?.value || 0,
        inactiveCount: seriesInactive[index]?.value || 0,
        totalCount: seriesPublished[index]?.value || 0,
      })
    }
    return rollingPoints.length
      ? rollingPoints
      : yearlyFallbackPoints.length
        ? yearlyFallbackPoints
        : seriesFallbackPoints.length
          ? seriesFallbackPoints
          : []
  }, [publicationDrilldownRecords, tile.chart_data, tile.drilldown])
  const citationActivationHistoryLastCompleteYear = useMemo(() => {
    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const metadata = drilldown.metadata && typeof drilldown.metadata === 'object'
      ? drilldown.metadata as Record<string, unknown>
      : {}
    const activationHistory = metadata.activation_history && typeof metadata.activation_history === 'object'
      ? metadata.activation_history as Record<string, unknown>
      : {}
    const raw = Number(activationHistory.last_complete_year)
    if (Number.isInteger(raw)) {
      return raw
    }
    const years = publicationDrilldownRecords
      .map((record) => record.year)
      .filter((value): value is number => Number.isInteger(value))
    return years.length ? Math.max(...years) : null
  }, [publicationDrilldownRecords, tile.drilldown])
  const citationActivationHistoryPointSpacingMonths = useMemo(() => {
    if (citationActivationHistoryPoints.length < 2) {
      return 1
    }
    const first = citationActivationHistoryPoints[0]?.timeMs
    const second = citationActivationHistoryPoints[1]?.timeMs
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return 1
    }
    const firstDate = new Date(first)
    const secondDate = new Date(second)
    return Math.max(
      1,
      (secondDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12
        + (secondDate.getUTCMonth() - firstDate.getUTCMonth()),
    )
  }, [citationActivationHistoryPoints])
  const citationActivationHistoryMinSpan = useMemo(
    () => Math.min(
      citationActivationHistoryPointSpacingMonths <= 2 ? 12 : 3,
      Math.max(1, citationActivationHistoryPoints.length),
    ),
    [citationActivationHistoryPointSpacingMonths, citationActivationHistoryPoints.length],
  )
  useEffect(() => {
    if (!citationActivationHistoryPoints.length) {
      setCitationActivationHistoryRangeStart(0)
      setCitationActivationHistoryRangeEnd(0)
      return
    }
    const maxIndex = citationActivationHistoryPoints.length - 1
    const pointSpacing = Math.max(1, citationActivationHistoryPointSpacingMonths)
    const usesRollingMonthlyPoints = pointSpacing <= 2
    if (!usesRollingMonthlyPoints) {
      setCitationActivationHistoryRangeStart(0)
      setCitationActivationHistoryRangeEnd(maxIndex)
      return
    }
    const defaultWindowMonths = 60
    const defaultPointCount = Math.max(
      citationActivationHistoryMinSpan,
      Math.floor(defaultWindowMonths / pointSpacing) + 1,
    )
    setCitationActivationHistoryRangeStart(Math.max(0, citationActivationHistoryPoints.length - defaultPointCount))
    setCitationActivationHistoryRangeEnd(maxIndex)
  }, [
    citationActivationHistoryMinSpan,
    citationActivationHistoryPointSpacingMonths,
    citationActivationHistoryPoints.length,
    tile.key,
  ])
  const citationActivationHistoryVisibleRange = useMemo(() => {
    if (!citationActivationHistoryPoints.length) {
      return { start: 0, end: 0 }
    }
    const maxIndex = citationActivationHistoryPoints.length - 1
    const safeEnd = Math.max(0, Math.min(maxIndex, citationActivationHistoryRangeEnd))
    const safeStart = Math.max(0, Math.min(safeEnd, citationActivationHistoryRangeStart))
    const adjustedEnd = Math.max(safeEnd, Math.min(maxIndex, safeStart + citationActivationHistoryMinSpan - 1))
    const adjustedStart = Math.max(0, Math.min(safeStart, adjustedEnd - citationActivationHistoryMinSpan + 1))
    return {
      start: adjustedStart,
      end: adjustedEnd,
    }
  }, [
    citationActivationHistoryMinSpan,
    citationActivationHistoryPoints.length,
    citationActivationHistoryRangeEnd,
    citationActivationHistoryRangeStart,
  ])
  const citationActivationHistoryVisiblePoints = useMemo(
    () => citationActivationHistoryPoints.slice(
      citationActivationHistoryVisibleRange.start,
      citationActivationHistoryVisibleRange.end + 1,
    ),
    [citationActivationHistoryPoints, citationActivationHistoryVisibleRange.end, citationActivationHistoryVisibleRange.start],
  )
  const citationActivationHistoryFocusRangeLabel = useMemo(() => {
    if (!citationActivationHistoryVisiblePoints.length) {
      return null
    }
    const startLabel = formatMonthYearLabel(citationActivationHistoryVisiblePoints[0].timeMs)
    const endLabel = formatMonthYearLabel(citationActivationHistoryVisiblePoints[citationActivationHistoryVisiblePoints.length - 1].timeMs)
    return `${startLabel} - ${endLabel}`
  }, [citationActivationHistoryVisiblePoints])
  const recentConcentrationTopThreeCitations = useMemo(
    () => recentConcentrationPublicationRecords.reduce((sum, record) => sum + record.selectedWindowCitations, 0),
    [recentConcentrationPublicationRecords],
  )
  const recentConcentrationWindowLabel = useMemo(
    () => RECENT_CONCENTRATION_WINDOW_OPTIONS.find((option) => option.value === recentConcentrationWindowMode)?.label || '1y',
    [recentConcentrationWindowMode],
  )
  const recentConcentrationWindowPhrase = useMemo(() => {
    switch (recentConcentrationWindowMode) {
      case '1y':
        return 'in the last year'
      case '3y':
        return 'in the last 3 years'
      case '5y':
        return 'in the last 5 years'
      case 'all':
        return 'across all years'
      default:
        return 'in the selected period'
    }
  }, [recentConcentrationWindowMode])
  const recentConcentrationPct = useMemo(() => {
    const total = recentConcentrationTopThreeCitations + recentConcentrationOtherCitations
    return total > 0 ? (recentConcentrationTopThreeCitations / total) * 100 : 0
  }, [recentConcentrationOtherCitations, recentConcentrationTopThreeCitations])
  const uncitedInsightsRequestKey = 'uncited_works:window:all'
  const recentConcentrationInsightsRequestKey = 'citation_drivers:section:1y'
  const citationHistogramInsightsRequestKey = 'citation_drivers:section:all'
  const citationActivationInsightsRequestKey = 'citation_activation:section:1y'
  const citationActivationHistoryInsightsRequestKey = 'citation_activation_history:section:all'
  const uncitedInsightsPayload = publicationInsightsByRequestKey[uncitedInsightsRequestKey] || null
  const recentConcentrationInsightsPayload = publicationInsightsByRequestKey[recentConcentrationInsightsRequestKey] || null
  const citationHistogramInsightsPayload = publicationInsightsByRequestKey[citationHistogramInsightsRequestKey] || null
  const citationActivationInsightsPayload = publicationInsightsByRequestKey[citationActivationInsightsRequestKey] || null
  const citationActivationHistoryInsightsPayload = publicationInsightsByRequestKey[citationActivationHistoryInsightsRequestKey] || null
  const uncitedInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[uncitedInsightsRequestKey])
  const recentConcentrationInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[recentConcentrationInsightsRequestKey])
  const citationHistogramInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[citationHistogramInsightsRequestKey])
  const citationActivationInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[citationActivationInsightsRequestKey])
  const citationActivationHistoryInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[citationActivationHistoryInsightsRequestKey])
  const uncitedInsightsError = publicationInsightsErrorByRequestKey[uncitedInsightsRequestKey] || ''
  const recentConcentrationInsightsError = publicationInsightsErrorByRequestKey[recentConcentrationInsightsRequestKey] || ''
  const citationHistogramInsightsError = publicationInsightsErrorByRequestKey[citationHistogramInsightsRequestKey] || ''
  const citationActivationInsightsError = publicationInsightsErrorByRequestKey[citationActivationInsightsRequestKey] || ''
  const citationActivationHistoryInsightsError = publicationInsightsErrorByRequestKey[citationActivationHistoryInsightsRequestKey] || ''
  const closeUncitedInsight = useCallback(() => setUncitedInsightOpen(false), [])
  const closeRecentConcentrationInsight = useCallback(() => setRecentConcentrationInsightOpen(false), [])
  const closeCitationHistogramInsight = useCallback(() => setCitationHistogramInsightOpen(false), [])
  const closeCitationActivationInsight = useCallback(() => setCitationActivationInsightOpen(false), [])
  const closeCitationActivationHistoryInsight = useCallback(() => setCitationActivationHistoryInsightOpen(false), [])
  const closeCitationMomentumInsight = useCallback(() => setCitationMomentumInsightOpen(false), [])
  const closeHIndexInsight = useCallback(() => setHIndexInsightKey(null), [])
  const toggleHIndexInsight = useCallback((key: HIndexInsightKey) => {
    setHIndexInsightKey((current) => (current === key ? null : key))
  }, [])
  const navigateToInsightTab = useCallback((tab: DrilldownTab) => {
    onDrilldownTabChange?.(tab)
    setUncitedInsightOpen(false)
    setRecentConcentrationInsightOpen(false)
    setCitationHistogramInsightOpen(false)
    setCitationActivationInsightOpen(false)
    setCitationActivationHistoryInsightOpen(false)
    setCitationMomentumInsightOpen(false)
    setHIndexInsightKey(null)
  }, [onDrilldownTabChange])
  const uncitedInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    const uncitedPattern = readInsightEvidenceString(uncitedInsightsPayload, 'uncited_works', 'pattern')
    const recentUncitedCount = readInsightEvidenceNumber(uncitedInsightsPayload, 'uncited_works', 'recent_publication_count') || 0
    if (uncitedBreakdownViewMode !== 'table' && uncitedPublicationRecords.length > 0) {
      actions.push({
        key: 'uncited-open-list',
        label: 'View uncited papers',
        description: 'Open the table of uncited publications.',
        onSelect: () => {
          setUncitedBreakdownExpanded(true)
          setUncitedBreakdownViewMode('table')
          setUncitedInsightOpen(false)
        },
      })
    }
    if (recentUncitedCount > 0 || uncitedPattern === 'mostly_recent') {
      actions.push({
        key: 'uncited-trajectory',
        label: 'Citation activation',
        description: 'See which papers have started gaining citations.',
        onSelect: () => navigateToInsightTab('trajectory'),
      })
    }
    if (uncitedPattern === 'mostly_older' || uncitedPattern === 'mixed_ages') {
      actions.push({
        key: 'uncited-context',
        label: 'Citation context',
        description: 'Compare older and newer citation performance.',
        onSelect: () => navigateToInsightTab('context'),
      })
    }
    return actions.slice(0, 3)
  }, [navigateToInsightTab, uncitedBreakdownViewMode, uncitedInsightsPayload, uncitedPublicationRecords.length])
  const recentConcentrationInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    const sectionPattern = readInsightEvidenceString(recentConcentrationInsightsPayload, 'citation_drivers', 'section_pattern')
    const recentCitationEvidence = getPublicationInsightsSection(recentConcentrationInsightsPayload, 'citation_drivers')?.evidence as Record<string, unknown> | undefined
    const topPublicationsEvidence = recentCitationEvidence?.['publications']
    const leadPublication = Array.isArray(topPublicationsEvidence) && topPublicationsEvidence.length > 0 && topPublicationsEvidence[0] && typeof topPublicationsEvidence[0] === 'object'
      ? topPublicationsEvidence[0] as Record<string, unknown>
      : null
    const leadPublicationId = String(leadPublication?.work_id || '').trim()
    if (recentConcentrationViewMode !== 'table' && recentConcentrationPublicationRecords.length > 0) {
      actions.push({
        key: 'citation-open-top-papers',
        label: 'View top papers',
        description: 'Open the table of papers driving citations.',
        onSelect: () => {
          setRecentConcentrationExpanded(true)
          setRecentConcentrationViewMode('table')
          setRecentConcentrationInsightOpen(false)
        },
      })
    }
    if (leadPublicationId && onOpenPublication) {
      actions.push({
        key: 'citation-open-lead-paper',
        label: 'Open lead paper',
        description: 'Open the current lead publication in your library.',
        onSelect: () => {
          onOpenPublication(leadPublicationId)
          setRecentConcentrationInsightOpen(false)
        },
      })
    }
    if (sectionPattern === 'persistent_leader' || sectionPattern === 'persistently_concentrated' || sectionPattern === 'single_standout') {
      actions.push({
        key: 'citation-context',
        label: 'Citation context',
        description: 'Compare concentration with overall citation performance.',
        onSelect: () => navigateToInsightTab('context'),
      })
    } else {
      actions.push({
        key: 'citation-trajectory',
        label: 'Citation activation',
        description: 'See how citation leaders change over time.',
        onSelect: () => navigateToInsightTab('trajectory'),
      })
    }
    return actions.slice(0, 3)
  }, [
    navigateToInsightTab,
    onOpenPublication,
    recentConcentrationInsightsPayload,
    recentConcentrationPublicationRecords.length,
    recentConcentrationViewMode,
  ])
  const citationHistogramInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    const citationEvidence = getPublicationInsightsSection(citationHistogramInsightsPayload, 'citation_drivers')?.evidence as Record<string, unknown> | undefined
    const topPublicationsEvidence = citationEvidence?.['publications']
    const leadPublication = Array.isArray(topPublicationsEvidence) && topPublicationsEvidence.length > 0 && topPublicationsEvidence[0] && typeof topPublicationsEvidence[0] === 'object'
      ? topPublicationsEvidence[0] as Record<string, unknown>
      : null
    const leadPublicationId = String(leadPublication?.work_id || '').trim()
    if (leadPublicationId && onOpenPublication) {
      actions.push({
        key: 'citation-distribution-open-lead-paper',
        label: 'Open lead paper',
        description: 'Open the strongest citation driver in your library.',
        onSelect: () => {
          onOpenPublication(leadPublicationId)
          setCitationHistogramInsightOpen(false)
        },
      })
    }
    actions.push({
      key: 'citation-distribution-context',
      label: 'Citation context',
      description: 'Compare this distribution with the wider citation profile.',
      onSelect: () => navigateToInsightTab('context'),
    })
    actions.push({
      key: 'citation-distribution-trajectory',
      label: 'Citation activation',
      description: 'See how active and inactive papers are changing over time.',
      onSelect: () => navigateToInsightTab('trajectory'),
    })
    return actions.slice(0, 3)
  }, [citationHistogramInsightsPayload, navigateToInsightTab, onOpenPublication])
  const citationActivationInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    if (citationActivationViewMode !== 'table' && newlyActivePublicationRecords.length > 0) {
      actions.push({
        key: 'activation-open-list',
        label: 'View newly active papers',
        description: 'Open the table of papers that picked up citations only in the last 12 months.',
        onSelect: () => {
          setCitationActivationExpanded(true)
          setCitationActivationViewMode('table')
          setCitationActivationInsightOpen(false)
        },
      })
    }
    actions.push({
      key: 'activation-breakdown',
      label: 'Citation breakdown',
      description: 'Compare uncited work and citation drivers in the breakdown tab.',
      onSelect: () => navigateToInsightTab('breakdown'),
    })
    actions.push({
      key: 'activation-context',
      label: 'Citation context',
      description: 'Compare activation with overall citation performance.',
      onSelect: () => navigateToInsightTab('context'),
    })
    return actions.slice(0, 3)
  }, [
    newlyActivePublicationRecords.length,
    citationActivationViewMode,
    navigateToInsightTab,
  ])
  const citationActivationHistoryInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    if (citationActivationViewMode !== 'table' && newlyActivePublicationRecords.length > 0) {
      actions.push({
        key: 'activation-history-open-list',
        label: 'View newly active papers',
        description: 'Open the current table of newly active publications.',
        onSelect: () => {
          setCitationActivationExpanded(true)
          setCitationActivationViewMode('table')
          setCitationActivationHistoryInsightOpen(false)
        },
      })
    }
    actions.push({
      key: 'activation-history-breakdown',
      label: 'Citation breakdown',
      description: 'Compare activation with uncited work and citation drivers.',
      onSelect: () => navigateToInsightTab('breakdown'),
    })
    actions.push({
      key: 'activation-history-context',
      label: 'Citation context',
      description: 'Compare activity changes with broader citation performance.',
      onSelect: () => navigateToInsightTab('context'),
    })
    return actions.slice(0, 3)
  }, [citationActivationViewMode, navigateToInsightTab, newlyActivePublicationRecords.length])
  const citationMomentumInsightActions = useMemo<PublicationInsightAction[]>(() => {
    const actions: PublicationInsightAction[] = []
    const leadRecord = citationMomentumViewMode === 'sleeping'
      ? sleepingPublicationRecords[0] || null
      : freshPickupPublicationRecords[0] || null
    if (citationMomentumViewMode !== 'sleeping' && sleepingPublicationRecords.length > 0) {
      actions.push({
        key: 'citation-momentum-view-sleeping',
        label: 'View sleeping papers',
        description: 'Switch to older papers that have gone quiet recently.',
        onSelect: () => {
          setCitationMomentumExpanded(true)
          setCitationMomentumViewMode('sleeping')
          setCitationMomentumInsightOpen(false)
        },
      })
    }
    if (citationMomentumViewMode !== 'freshPickup' && freshPickupPublicationRecords.length > 0) {
      actions.push({
        key: 'citation-momentum-view-fresh-pickup',
        label: 'View fresh pickup',
        description: 'Switch to older papers accelerating again in the last 12 months.',
        onSelect: () => {
          setCitationMomentumExpanded(true)
          setCitationMomentumViewMode('freshPickup')
          setCitationMomentumInsightOpen(false)
        },
      })
    }
    if (leadRecord && onOpenPublication) {
      actions.push({
        key: 'citation-momentum-open-lead-paper',
        label: 'Open lead paper',
        description: 'Open the top paper from the current view in your library.',
        onSelect: () => {
          onOpenPublication(leadRecord.workId)
          setCitationMomentumInsightOpen(false)
        },
      })
    }
    actions.push({
      key: 'citation-momentum-breakdown',
      label: 'Citation breakdown',
      description: 'Compare this with citation drivers and the lifetime distribution.',
      onSelect: () => navigateToInsightTab('breakdown'),
    })
    return actions.slice(0, 3)
  }, [
    citationMomentumViewMode,
    freshPickupPublicationRecords,
    navigateToInsightTab,
    onOpenPublication,
    sleepingPublicationRecords,
  ])

  const headlineMetricTiles = useMemo(() => {
    if (tile.key !== 'total_citations') {
      return []
    }
    return buildTotalCitationsHeadlineMetricTiles(tile)
  }, [tile])
  const hIndexHeadlineMetricTiles = useMemo(() => {
    if (tile.key !== 'h_index_projection') {
      return []
    }
    return buildHIndexHeadlineMetricTiles(tile)
  }, [tile])
  const totalCitationsHeadlineStats = useMemo<TotalCitationsHeadlineStats | null>(() => {
    if (tile.key !== 'total_citations') {
      return null
    }
    return buildTotalCitationsHeadlineStats(tile)
  }, [tile])
  const hIndexDrilldownStats = useMemo<HIndexDrilldownStats | null>(() => {
    if (tile.key !== 'h_index_projection') {
      return null
    }
    return buildHIndexDrilldownStats(tile)
  }, [tile])
  const hIndexSummaryThresholdCandidateGroups = useMemo(
    () => hIndexDrilldownStats?.summaryThresholdCandidates ?? [],
    [hIndexDrilldownStats],
  )
  const selectedHIndexSummaryThresholdCandidateGroup = useMemo(
    () => hIndexSummaryThresholdCandidateGroups[hIndexSummaryThresholdTableMode === 'after' ? 1 : 0] ?? null,
    [hIndexSummaryThresholdCandidateGroups, hIndexSummaryThresholdTableMode],
  )
  const hIndexSummaryStepsHeading = useMemo(() => {
    if (!hIndexDrilldownStats) {
      return 'Step-by-step to next h step'
    }
    const nextStep = hIndexDrilldownStats.summaryThresholdSteps[0]
    const followingStep = hIndexDrilldownStats.summaryThresholdSteps[1]
    return followingStep
      ? `Step-by-step to H${formatInt(nextStep?.targetH ?? hIndexDrilldownStats.targetH)} and H${formatInt(followingStep.targetH)}`
      : `Step-by-step to H${formatInt(nextStep?.targetH ?? hIndexDrilldownStats.targetH)}`
  }, [hIndexDrilldownStats])
  const hIndexTopAuthorshipBucket = useMemo(
    () => (hIndexDrilldownStats?.authorshipMix.length ? hIndexDrilldownStats.authorshipMix[0] : null),
    [hIndexDrilldownStats],
  )
  const hIndexTopPublicationTypeBucket = useMemo(
    () => (hIndexDrilldownStats?.publicationTypeMix.length ? hIndexDrilldownStats.publicationTypeMix[0] : null),
    [hIndexDrilldownStats],
  )
  const momentumDrilldownStats = useMemo<MomentumDrilldownStats | null>(() => {
    if (tile.key !== 'momentum') {
      return null
    }
    return buildMomentumDrilldownStats(tile)
  }, [tile])
  const impactConcentrationDrilldownStats = useMemo<ImpactConcentrationDrilldownStats | null>(() => {
    if (tile.key !== 'impact_concentration') {
      return null
    }
    return buildImpactConcentrationDrilldownStats(tile)
  }, [tile])
  const influentialCitationsDrilldownStats = useMemo<InfluentialCitationsDrilldownStats | null>(() => {
    if (tile.key !== 'influential_citations') {
      return null
    }
    return buildInfluentialCitationsDrilldownStats(tile)
  }, [tile])
  const fieldPercentileDrilldownStats = useMemo<FieldPercentileShareDrilldownStats | null>(() => {
    if (tile.key !== 'field_percentile_share') {
      return null
    }
    return buildFieldPercentileShareDrilldownStats(tile)
  }, [tile])
  const authorshipCompositionDrilldownStats = useMemo<AuthorshipCompositionDrilldownStats | null>(() => {
    if (tile.key !== 'authorship_composition') {
      return null
    }
    return buildAuthorshipCompositionDrilldownStats(tile)
  }, [tile])
  const collaborationStructureDrilldownStats = useMemo<CollaborationStructureDrilldownStats | null>(() => {
    if (tile.key !== 'collaboration_structure') {
      return null
    }
    return buildCollaborationStructureDrilldownStats(tile)
  }, [tile])
  const methodsSections = useMemo(() => {
    if (tile.key === 'h_index_projection') {
      return buildHIndexMethodsSections(tile)
    }
    if (isEnhancedGenericMetricKey(tile.key)) {
      return buildRemainingMetricMethodsSections(tile)
    }
    return buildTotalPublicationsMethodsSections(tile)
  }, [tile])

  useEffect(() => {
    if (fieldPercentileDrilldownStats) {
      setFieldPercentileDrilldownThreshold(fieldPercentileDrilldownStats.defaultThreshold)
    }
  }, [fieldPercentileDrilldownStats?.defaultThreshold, tile.key])

  return (
    <div className="house-drilldown-stack-3" data-metric-key={tile.key}>
      <div className={cn(HOUSE_SURFACE_SECTION_PANEL_CLASS, 'house-drilldown-panel-no-pad')}>
        {activeTab === 'summary' && headlineMetricTiles.length > 0 ? (
          <div className="house-drilldown-content-block house-publications-headline-content house-drilldown-heading-content-block w-full">
            <div
              className={cn(HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS, 'house-publications-headline-metric-grid mt-0')}
              style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {headlineMetricTiles.map((metricTile) => (
                <div key={metricTile.label} className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS}>
                  <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>{metricTile.label}</p>
                  <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                    <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>{metricTile.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'summary' && hIndexHeadlineMetricTiles.length > 0 ? (
          <div className="house-drilldown-content-block house-publications-headline-content house-drilldown-heading-content-block w-full">
            <div
              className={cn(HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS, 'house-publications-headline-metric-grid mt-0')}
              style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {hIndexHeadlineMetricTiles.map((metricTile) => (
                <div key={metricTile.label} className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS}>
                  <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>{metricTile.label}</p>
                  <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                    <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>{metricTile.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'summary' && !headlineMetricTiles.length && !hIndexHeadlineMetricTiles.length && !isEnhancedGenericMetricKey(tile.key) ? (
          <div className="house-drilldown-content-block w-full" />
        ) : null}

        {tile.key === 'total_citations' && activeTab === 'summary' ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Citation Counts Over Time</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={publicationTrendsExpanded}
                    onClick={(event) => {
                      event.stopPropagation()
                      setPublicationTrendsExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {publicationTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'house-publications-trends-controls-row justify-between')}>
                    <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
                      <PublicationWindowToggle value={publicationTrendsWindowMode} onChange={setPublicationTrendsWindowMode} />
                    </div>
                    <PublicationTrendsVisualToggle
                      value={publicationTrendsVisualMode}
                      onChange={setPublicationTrendsVisualMode}
                    />
                  </div>

                  <div
                    className={cn(
                      'house-drilldown-content-block w-full',
                      publicationTrendsVisualMode === 'table'
                        ? 'h-auto'
                        : 'house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall',
                    )}
                  >
                    {publicationTrendsVisualMode === 'table' ? (
                      <CanonicalTablePanel
                        bare
                        variant="drilldown"
                        suppressTopRowHighlight
                        columns={[
                          {
                            key: 'period',
                            label: publicationTrendsWindowMode === '1y' ? 'Month year' : 'Year',
                            align: 'center',
                            width: '1%',
                          },
                          { key: 'citations', label: 'Citations', align: 'center', width: '1%' },
                          { key: 'change', label: 'Change', align: 'center', width: '1%' },
                        ]}
                        rows={citationVolumeTableRows.map((row) => ({
                          key: row.key,
                          cells: {
                            period: row.projected ? (
                              <span className="inline-flex w-full items-center justify-center rounded-md border border-dashed border-[hsl(var(--stroke-soft)/0.92)] px-2 py-1 text-[hsl(var(--tone-neutral-800))]">
                                {row.periodLabel}
                              </span>
                            ) : row.periodLabel,
                            citations: row.projected ? (
                              <span className="inline-flex w-full items-center justify-center rounded-md border border-dashed border-[hsl(var(--stroke-soft)/0.92)] px-2 py-1 text-[hsl(var(--tone-neutral-800))]">
                                {row.citations}
                              </span>
                            ) : row.citations,
                            change: row.projected ? (
                              <span className="inline-flex w-full items-center justify-center rounded-md border border-dashed border-[hsl(var(--stroke-soft)/0.92)] px-2 py-1 text-[hsl(var(--tone-neutral-800))]">
                                {row.change}
                              </span>
                            ) : row.change,
                          },
                        }))}
                        emptyMessage="No citation counts found in the selected period."
                      />
                    ) : (
                      <PublicationsPerYearChart
                        tile={tile}
                        animate={animateCharts}
                        showAxes
                        yAxisLabel={citationVolumeYAxisLabel}
                        enableWindowToggle
                        showPeriodHint
                        showCurrentPeriodSemantic
                        useCompletedMonthWindowLabels
                        autoScaleByWindow
                        showMeanLine
                        showMeanValueLabel
                        roundMeanValueInLongWindows
                        longWindowLineXAxisTitleTranslateRem={1.1}
                        subtleGrid
                        activeWindowMode={publicationTrendsWindowMode}
                        onWindowModeChange={setPublicationTrendsWindowMode}
                        visualMode={publicationTrendsVisualMode}
                        onVisualModeChange={setPublicationTrendsVisualMode}
                        showWindowToggle={false}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Citation Counts Based on Article Type</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={articleTypeTrendsExpanded}
                    onClick={(event) => {
                      event.stopPropagation()
                      setArticleTypeTrendsExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {articleTypeTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="house-drilldown-content-block w-full">
                    <PublicationCategoryDistributionChart
                      publications={publicationDrilldownRecords}
                      dimension="article"
                      valueMetric="citations"
                      xAxisLabel="Article type"
                      yAxisLabel="Citations"
                      emptyLabel="No article type data"
                      animate={animateCharts}
                      enableValueModeToggle
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="house-drilldown-heading-block-title">Citation Counts Based on Publication Type</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={publicationTypeTrendsExpanded}
                    onClick={(event) => {
                      event.stopPropagation()
                      setPublicationTypeTrendsExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {publicationTypeTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="house-drilldown-content-block w-full">
                    <PublicationCategoryDistributionChart
                      publications={publicationDrilldownRecords}
                      dimension="publication"
                      valueMetric="citations"
                      xAxisLabel="Publication type"
                      yAxisLabel="Citations"
                      emptyLabel="No publication type data"
                      animate={animateCharts}
                      enableValueModeToggle
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'summary' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain step-by-step to next h milestones"
                  content={formatHIndexThresholdStepsTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open step-by-step h-index insight"
                  active={hIndexInsightKey === 'summary-threshold-steps'}
                  onClick={() => toggleHIndexInsight('summary-threshold-steps')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'summary-threshold-steps'}
                onClose={closeHIndexInsight}
                title={hIndexSummaryStepsHeading}
                body={hIndexDrilldownStats.summaryThresholdSteps[1]
                  ? `This ladder shows the immediate path from h${formatInt(hIndexDrilldownStats.currentH)} to H${formatInt(hIndexDrilldownStats.summaryThresholdSteps[0].targetH)} and then H${formatInt(hIndexDrilldownStats.summaryThresholdSteps[1].targetH)}. It makes the next two steps explicit by showing how many papers already clear each line and the exact nearest gaps that still matter.`
                  : `This ladder shows the immediate path from h${formatInt(hIndexDrilldownStats.currentH)} to H${formatInt(hIndexDrilldownStats.targetH)}. It makes the next step explicit by showing how many papers already clear that line and the exact nearest gaps that still matter.`}
                considerationLabel="How to read it"
                consideration="Read papers-at-threshold before total citations. h-index moves when enough papers cross the next line, not when one paper becomes much more cited than the rest."
                actions={[
                  {
                    key: 'h-index-summary-open-runway',
                    label: 'Open runway',
                    description: 'Jump to the trajectory tab for the full gap chart and candidate table.',
                    onSelect: () => navigateToInsightTab('trajectory'),
                  },
                ]}
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">{hIndexSummaryStepsHeading}</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={hIndexSummaryStepsExpanded}
                    expandedLabel="Collapse h-index step summary"
                    collapsedLabel="Expand h-index step summary"
                    onClick={(event) => {
                      event.stopPropagation()
                      setHIndexSummaryStepsExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {hIndexSummaryStepsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <HIndexThresholdStepsSummary steps={hIndexDrilldownStats.summaryThresholdSteps} />
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain which publications may get me there"
                  content={formatHIndexThresholdCandidateTableTooltip(
                    selectedHIndexSummaryThresholdCandidateGroup?.targetH ?? hIndexDrilldownStats.targetH,
                    selectedHIndexSummaryThresholdCandidateGroup?.candidates.length ?? 0,
                  )}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open publications that may get me there insight"
                  active={hIndexInsightKey === 'summary-threshold-candidates'}
                  onClick={() => toggleHIndexInsight('summary-threshold-candidates')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'summary-threshold-candidates'}
                onClose={closeHIndexInsight}
                title="Which publications may get me there?"
                body={selectedHIndexSummaryThresholdCandidateGroup
                  ? selectedHIndexSummaryThresholdCandidateGroup.targetH > hIndexDrilldownStats.targetH
                    ? `This table lists the publications currently closest to H${formatInt(selectedHIndexSummaryThresholdCandidateGroup.targetH)}. For the second step, the shortlist widens slightly so you can see a broader set of plausible papers instead of a near-duplicate of the first view.`
                    : `This table lists the publications currently closest to H${formatInt(selectedHIndexSummaryThresholdCandidateGroup.targetH)}. It is useful when you want to see exactly which papers are carrying the next step without switching to the trajectory tab.`
                  : 'This table lists the publications currently closest to the selected h-index step once publication-level citation data is available.'}
                considerationLabel="How to use it"
                consideration="Read the gap column before the projection column. The outlook column is just a pace signal from recent citation gains versus the remaining gap, not a certainty estimate."
                actions={[
                  {
                    key: 'h-index-summary-candidates-open-trajectory',
                    label: 'Open full runway',
                    description: 'Jump to the trajectory tab for the full runway chart and candidate table.',
                    onSelect: () => navigateToInsightTab('trajectory'),
                  },
                ]}
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Which publications may get me there?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={hIndexSummaryCandidatesExpanded}
                    expandedLabel="Collapse candidate publications"
                    collapsedLabel="Expand candidate publications"
                    onClick={(event) => {
                      event.stopPropagation()
                      setHIndexSummaryCandidatesExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {hIndexSummaryCandidatesExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="space-y-3">
                    {hIndexSummaryThresholdCandidateGroups.length > 1 ? (
                      <div className="flex justify-center">
                        <HIndexThresholdCandidateToggle
                          nextLabel={`To h${formatInt(hIndexSummaryThresholdCandidateGroups[0]?.targetH ?? hIndexDrilldownStats.targetH)}`}
                          afterLabel={`To h${formatInt(hIndexSummaryThresholdCandidateGroups[1]?.targetH ?? (hIndexDrilldownStats.targetH + 1))}`}
                          value={hIndexSummaryThresholdTableMode}
                          onChange={setHIndexSummaryThresholdTableMode}
                        />
                      </div>
                    ) : null}
                    <CanonicalTablePanel
                      bare
                      variant="drilldown"
                      suppressTopRowHighlight
                      columns={H_INDEX_CANDIDATE_TABLE_COLUMNS}
                      rows={(selectedHIndexSummaryThresholdCandidateGroup?.candidates ?? []).map((candidate) => ({
                        key: `${selectedHIndexSummaryThresholdCandidateGroup?.targetH || 'target'}-${candidate.workId}`,
                        cells: {
                          paper: onOpenPublication ? (
                            <button
                              type="button"
                              data-stop-tile-open="true"
                              className="block w-full text-left text-[hsl(var(--tone-accent-700))] transition-colors duration-[var(--motion-duration-ui)] ease-out hover:text-[hsl(var(--tone-accent-800))] hover:underline focus-visible:outline-none focus-visible:underline"
                              onClick={(event) => {
                                event.stopPropagation()
                                onOpenPublication(candidate.workId)
                              }}
                              onMouseDown={(event) => event.stopPropagation()}
                            >
                              <span className="block max-w-full break-words leading-snug">{candidate.title}</span>
                            </button>
                          ) : (
                            <span className="block max-w-full break-words leading-snug">{candidate.title}</span>
                          ),
                          current: formatInt(candidate.citations),
                          gap: `+${formatInt(candidate.citationsToNextH)}`,
                          projected: formatInt(candidate.projectedCitations12m),
                          outlook: renderHIndexOutlookPill(candidate.projectionOutlookLabel),
                        },
                      }))}
                      emptyMessage={selectedHIndexSummaryThresholdCandidateGroup
                        ? `No nearby publications available for H${formatInt(selectedHIndexSummaryThresholdCandidateGroup.targetH)}.`
                        : 'No nearby publications available.'}
                    />
                  </div>
                </div>
              ) : null}
            </div>

          </>
        ) : null}

        {activeTab === 'breakdown' && totalCitationsHeadlineStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain uncited papers"
                  content={
                    uncitedBreakdownViewMode === 'table'
                      ? formatUncitedPapersTableTooltip(totalCitationsHeadlineStats)
                      : formatUncitedPapersTooltip(totalCitationsHeadlineStats)
                  }
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open uncited publications insight"
                  active={uncitedInsightOpen}
                  onClick={onToggleUncitedInsight}
                />
              </div>
              {uncitedInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close uncited insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeUncitedInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={uncitedInsightsPayload}
                        sectionKey="uncited_works"
                        loading={uncitedInsightsLoading}
                        error={uncitedInsightsError}
                        actions={uncitedInsightActions}
                        onClose={closeUncitedInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">How many uncited publications do I have?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={uncitedBreakdownExpanded}
                    expandedLabel="Collapse uncited papers"
                    collapsedLabel="Expand uncited papers"
                    onClick={(event) => {
                      event.stopPropagation()
                      setUncitedBreakdownExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {uncitedBreakdownExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <SplitBreakdownViewToggle value={uncitedBreakdownViewMode} onChange={setUncitedBreakdownViewMode} />
                  </div>
                  {uncitedBreakdownViewMode === 'bar' ? (
                    <CitationSplitBarCard
                      bare
                      left={{
                        label: 'Uncited',
                        value: `${formatInt(totalCitationsHeadlineStats.uncitedPapersCount)} (${Math.round(totalCitationsHeadlineStats.uncitedPapersPct)}%)`,
                        ratioPct: totalCitationsHeadlineStats.uncitedPapersPct,
                        toneClass: HOUSE_CHART_BAR_DANGER_CLASS,
                      }}
                      right={{
                        label: 'Cited',
                        value: `${formatInt(Math.max(0, totalCitationsHeadlineStats.publicationCount - totalCitationsHeadlineStats.uncitedPapersCount))} (${Math.max(0, 100 - Math.round(totalCitationsHeadlineStats.uncitedPapersPct))}%)`,
                        ratioPct: Math.max(0, 100 - totalCitationsHeadlineStats.uncitedPapersPct),
                        toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
                      }}
                    />
                  ) : (
                    <PublicationLinkTable
                      nameColumnLabel="Name of publication with no citations"
                      rows={uncitedPublicationRecords.map((record) => ({
                        key: record.workId,
                        label: record.title || 'Untitled publication',
                        year: record.year,
                        workId: record.workId,
                      }))}
                      onOpenPublication={onOpenPublication}
                      emptyMessage="No uncited-paper breakdown available."
                    />
                  )}
                </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain recent concentration"
                  content={
                    recentConcentrationViewMode === 'table'
                      ? formatRecentConcentrationTableTooltip(recentConcentrationPublicationRecords.length, recentConcentrationWindowPhrase)
                      : formatRecentConcentrationWindowTooltip({
                        windowPhrase: recentConcentrationWindowPhrase,
                        topPublicationCount: recentConcentrationPublicationRecords.length,
                        topThreeCitations: recentConcentrationTopThreeCitations,
                        otherCitations: recentConcentrationOtherCitations,
                      })
                  }
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open citation driver insight"
                  active={recentConcentrationInsightOpen}
                  onClick={onToggleRecentConcentrationInsight}
                />
              </div>
              {recentConcentrationInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close citation insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeRecentConcentrationInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={recentConcentrationInsightsPayload}
                        sectionKey="citation_drivers"
                        loading={recentConcentrationInsightsLoading}
                        error={recentConcentrationInsightsError}
                        actions={recentConcentrationInsightActions}
                        onClose={closeRecentConcentrationInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Which publications are driving my citations?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={recentConcentrationExpanded}
                    expandedLabel="Collapse recent concentration"
                    collapsedLabel="Expand recent concentration"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRecentConcentrationExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {recentConcentrationExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <PublicationWindowToggle
                      value={recentConcentrationWindowMode}
                      onChange={(mode) => setRecentConcentrationWindowMode(mode as PublicationsWindowMode)}
                      options={RECENT_CONCENTRATION_WINDOW_OPTIONS}
                    />
                    <SplitBreakdownViewToggle value={recentConcentrationViewMode} onChange={setRecentConcentrationViewMode} />
                  </div>
                  {recentConcentrationViewMode === 'bar' ? (
                    <CitationSplitBarCard
                      bare
                      left={{
                        label: 'Top 3 publications',
                        value: `${formatInt(recentConcentrationTopThreeCitations)} (${Math.round(recentConcentrationPct)}%)`,
                        ratioPct: recentConcentrationPct,
                        toneClass: HOUSE_CHART_BAR_ACCENT_CLASS,
                      }}
                      right={{
                        label: 'All other publications',
                        value: `${formatInt(recentConcentrationOtherCitations)} (${Math.max(0, 100 - Math.round(recentConcentrationPct))}%)`,
                        ratioPct: Math.max(0, 100 - recentConcentrationPct),
                        toneClass: HOUSE_CHART_BAR_NEUTRAL_CLASS,
                      }}
                    />
                  ) : (
                    <PublicationLinkTable
                      nameColumnLabel={`Name of publication driving ${recentConcentrationWindowLabel} citations`}
                      rows={recentConcentrationPublicationRecords.map((record) => ({
                        key: record.workId,
                        label: record.title || 'Untitled publication',
                        year: record.year,
                        metricValue: formatInt(record.selectedWindowCitations),
                        workId: record.workId,
                      }))}
                      metricColumnLabel="Citations"
                      onOpenPublication={onOpenPublication}
                      emptyMessage="No recent concentration breakdown available."
                    />
                  )}
                </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain citation distribution"
                  content={formatCitationHistogramTooltip(publicationDrilldownRecords.length, citationHistogramMaxCitations)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open citation distribution insight"
                  active={citationHistogramInsightOpen}
                  onClick={onToggleCitationHistogramInsight}
                />
              </div>
              {citationHistogramInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close citation distribution insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeCitationHistogramInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={citationHistogramInsightsPayload}
                        sectionKey="citation_drivers"
                        loading={citationHistogramInsightsLoading}
                        error={citationHistogramInsightsError}
                        actions={citationHistogramInsightActions}
                        onClose={closeCitationHistogramInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">How are citations distributed across my publications?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={citationHistogramExpanded}
                    expandedLabel="Collapse citation distribution"
                    collapsedLabel="Expand citation distribution"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCitationHistogramExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {citationHistogramExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <CitationHistogramChart buckets={citationHistogramBuckets} />
                </div>
              ) : null}
            </div>

          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'breakdown' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-core structure"
                  content={formatHIndexCoreTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-core structure insight"
                  active={hIndexInsightKey === 'breakdown-structure-table'}
                  onClick={() => toggleHIndexInsight('breakdown-structure-table')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'breakdown-structure-table'}
                onClose={closeHIndexInsight}
                title={`h-core structure (H-index ${formatInt(hIndexDrilldownStats.currentH)})`}
                body={`This table compares papers, citations, and citation density inside and outside the h-core. Right now the h-core contains ${formatInt(hIndexDrilldownStats.hCorePublicationCount)} papers and ${hIndexDrilldownStats.hCoreShareValue} of citations, so it gives the full structural split behind the current h-index.`}
                considerationLabel="How to use it"
                consideration="Read density beside share. A compact h-core with very high density means the current h-index is being carried by a smaller elite set; a broader split suggests deeper support across the wider portfolio."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">{`h-core structure (H-index ${formatInt(hIndexDrilldownStats.currentH)})`}</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'segment', label: 'Segment' },
                    { key: 'papers', label: 'Papers', align: 'center', width: '1%' },
                    { key: 'citations', label: 'Citations', align: 'center', width: '1%' },
                    { key: 'density', label: 'Cites / paper', align: 'center', width: '1%' },
                  ]}
                  rows={[
                    {
                      key: 'h-core',
                      cells: {
                        segment: 'h-core',
                        papers: `${formatInt(hIndexDrilldownStats.hCorePublicationCount)} (${Math.round(hIndexDrilldownStats.hCorePublicationSharePct)}%)`,
                        citations: `${formatInt(hIndexDrilldownStats.hCoreCitations)} (${Math.round(hIndexDrilldownStats.hCoreSharePct)}%)`,
                        density: hIndexDrilldownStats.hCoreCitationDensityValue,
                      },
                    },
                    {
                      key: 'non-h-core',
                      cells: {
                        segment: 'Outside h-core',
                        papers: `${formatInt(hIndexDrilldownStats.nonHCorePublicationCount)} (${Math.max(0, 100 - Math.round(hIndexDrilldownStats.hCorePublicationSharePct))}%)`,
                        citations: `${formatInt(hIndexDrilldownStats.nonHCoreCitations)} (${Math.max(0, 100 - Math.round(hIndexDrilldownStats.hCoreSharePct))}%)`,
                        density: hIndexDrilldownStats.nonHCorePublicationCount > 0
                          ? (hIndexDrilldownStats.nonHCoreCitations / hIndexDrilldownStats.nonHCorePublicationCount).toFixed(1)
                          : '\u2014',
                      },
                    },
                    {
                      key: 'total',
                      cells: {
                        segment: 'Total portfolio',
                        papers: formatInt(hIndexDrilldownStats.totalPublications),
                        citations: formatInt(hIndexDrilldownStats.totalCitations),
                        density: hIndexDrilldownStats.totalPublications > 0
                          ? (hIndexDrilldownStats.totalCitations / hIndexDrilldownStats.totalPublications).toFixed(1)
                          : '\u2014',
                      },
                    },
                  ]}
                />
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-core authorship"
                  content={formatHIndexCoreTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-core authorship insight"
                  active={hIndexInsightKey === 'breakdown-authorship-table'}
                  onClick={() => toggleHIndexInsight('breakdown-authorship-table')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'breakdown-authorship-table'}
                onClose={closeHIndexInsight}
                title="h-core authorship"
                body={hIndexTopAuthorshipBucket
                  ? `${hIndexTopAuthorshipBucket.label} is the most common role inside the h-core, appearing in ${hIndexTopAuthorshipBucket.value}. This table shows the exact role split across the papers already strong enough to support the current h-index.`
                  : 'This table shows which authorship positions appear most often inside the h-core once authorship-role data is available.'}
                considerationLabel="Why it matters"
                consideration="This is descriptive of the current h-defining set, not a causal statement about authorship position. It is most useful for checking whether durable citation depth clusters in specific contribution roles."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">h-core authorship</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'bucket', label: 'Authorship bucket' },
                    { key: 'count', label: 'Count', align: 'center', width: '1%' },
                    { key: 'share', label: 'Share', align: 'center', width: '1%' },
                  ]}
                  rows={hIndexDrilldownStats.authorshipMix.map((metric) => {
                    const shareMatch = metric.value.match(/\((\d+)%\)$/)
                    return {
                      key: metric.label,
                      cells: {
                        bucket: metric.label,
                        count: formatInt(metric.raw),
                        share: shareMatch ? `${shareMatch[1]}%` : metric.value,
                      },
                    }
                  })}
                  emptyMessage="No h-core authorship data available."
                />
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-core publication types"
                  content={formatHIndexCoreTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-core publication types insight"
                  active={hIndexInsightKey === 'breakdown-publication-type-table'}
                  onClick={() => toggleHIndexInsight('breakdown-publication-type-table')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'breakdown-publication-type-table'}
                onClose={closeHIndexInsight}
                title="h-core publication types"
                body={hIndexTopPublicationTypeBucket
                  ? `${hIndexTopPublicationTypeBucket.label} is the most represented publication format inside the h-core, accounting for ${hIndexTopPublicationTypeBucket.value}. This table shows the exact format split across the papers that currently define the h-index.`
                  : 'This table shows which publication formats appear most often inside the h-core once publication-type data is available.'}
                considerationLabel="How to read it"
                consideration="This view is useful for structure rather than value judgement. It tells you which formats are most common in the h-core, not which format is inherently stronger in all contexts."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">h-core publication types</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'bucket', label: 'Publication type' },
                    { key: 'count', label: 'Count', align: 'center', width: '1%' },
                    { key: 'share', label: 'Share', align: 'center', width: '1%' },
                  ]}
                  rows={hIndexDrilldownStats.publicationTypeMix.map((metric) => {
                    const shareMatch = metric.value.match(/\((\d+)%\)$/)
                    return {
                      key: metric.label,
                      cells: {
                        bucket: metric.label,
                        count: formatInt(metric.raw),
                        share: shareMatch ? `${shareMatch[1]}%` : metric.value,
                      },
                    }
                  })}
                  emptyMessage="No h-core publication-type data available."
                />
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'trajectory' && totalCitationsHeadlineStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain citation activation"
                  content={
                    citationActivationViewMode === 'table'
                      ? formatCitationActivationTableTooltip(citationActivationTableConfig.mode, citationActivationTableConfig.rows.length)
                      : formatCitationActivationStateTooltip({
                        totalPublications: totalCitationsHeadlineStats.publicationCount,
                        newlyActiveCount: newlyActivePublicationRecords.length,
                        stillActiveCount: stillActivePublicationRecords.length,
                        inactiveCount: inactivePublicationCount,
                      })
                  }
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open citation activation insight"
                  active={citationActivationInsightOpen}
                  onClick={onToggleCitationActivationInsight}
                />
              </div>
              {citationActivationInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close citation activation insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeCitationActivationInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={citationActivationInsightsPayload}
                        sectionKey="citation_activation"
                        loading={citationActivationInsightsLoading}
                        error={citationActivationInsightsError}
                        actions={citationActivationInsightActions}
                        onClose={closeCitationActivationInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Citation activity of my portfolio (over the last 12 months)</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={citationActivationExpanded}
                    expandedLabel="Collapse citation activation"
                    collapsedLabel="Expand citation activation"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCitationActivationExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {citationActivationExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {citationActivationViewMode === 'table' ? (
                          <CitationActivationTableModeToggle
                            value={citationActivationTableMode}
                            onChange={setCitationActivationTableMode}
                          />
                        ) : null}
                      </div>
                      <SplitBreakdownViewToggle value={citationActivationViewMode} onChange={setCitationActivationViewMode} />
                    </div>
                    {citationActivationViewMode === 'bar' ? (
                      <CitationActivationStateBarCard
                        bare
                        segments={[
                          {
                            key: 'newly-active',
                            label: 'Newly active',
                            value: `${formatInt(newlyActivePublicationRecords.length)} (${totalCitationsHeadlineStats.publicationCount > 0 ? Math.round((newlyActivePublicationRecords.length / totalCitationsHeadlineStats.publicationCount) * 100) : 0}%)`,
                            ratioPct: totalCitationsHeadlineStats.publicationCount > 0
                              ? (newlyActivePublicationRecords.length / totalCitationsHeadlineStats.publicationCount) * 100
                              : 0,
                            toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
                            align: 'left',
                          },
                          {
                            key: 'still-active',
                            label: 'Still active',
                            value: `${formatInt(stillActivePublicationRecords.length)} (${totalCitationsHeadlineStats.publicationCount > 0 ? Math.round((stillActivePublicationRecords.length / totalCitationsHeadlineStats.publicationCount) * 100) : 0}%)`,
                            ratioPct: totalCitationsHeadlineStats.publicationCount > 0
                              ? (stillActivePublicationRecords.length / totalCitationsHeadlineStats.publicationCount) * 100
                              : 0,
                            toneClass: HOUSE_CHART_BAR_ACCENT_CLASS,
                            align: 'center',
                          },
                          {
                            key: 'inactive',
                            label: 'Inactive',
                            value: `${formatInt(inactivePublicationCount)} (${totalCitationsHeadlineStats.publicationCount > 0 ? Math.round((inactivePublicationCount / totalCitationsHeadlineStats.publicationCount) * 100) : 0}%)`,
                            ratioPct: totalCitationsHeadlineStats.publicationCount > 0
                              ? (inactivePublicationCount / totalCitationsHeadlineStats.publicationCount) * 100
                              : 0,
                            toneClass: HOUSE_CHART_BAR_DANGER_CLASS,
                            align: 'right',
                          },
                        ]}
                      />
                    ) : (
                      <PublicationLinkTable
                        nameColumnLabel={citationActivationTableConfig.nameColumnLabel}
                        metricColumnLabel={citationActivationTableConfig.metricColumnLabel}
                        secondaryMetricColumnLabel={citationActivationTableConfig.secondaryMetricColumnLabel}
                        rows={citationActivationTableConfig.rows}
                        onOpenPublication={onOpenPublication}
                        emptyMessage={citationActivationTableConfig.emptyMessage}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain citation activity over time"
                  content={formatCitationActivationHistoryTooltip(citationActivationHistoryLastCompleteYear, citationActivationHistoryFocusRangeLabel)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open citation activity over time insight"
                  active={citationActivationHistoryInsightOpen}
                  onClick={onToggleCitationActivationHistoryInsight}
                />
              </div>
              {citationActivationHistoryInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close citation activity over time insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeCitationActivationHistoryInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={citationActivationHistoryInsightsPayload}
                        sectionKey="citation_activation_history"
                        loading={citationActivationHistoryInsightsLoading}
                        error={citationActivationHistoryInsightsError}
                        actions={citationActivationHistoryInsightActions}
                        onClose={closeCitationActivationHistoryInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">How has citation activity changed over time?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={citationActivationHistoryExpanded}
                    expandedLabel="Collapse citation activity over time"
                    collapsedLabel="Expand citation activity over time"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCitationActivationHistoryExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {citationActivationHistoryExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="space-y-2">
                    <CompletedPeriodRangeSlider
                      minIndex={0}
                      maxIndex={Math.max(0, citationActivationHistoryPoints.length - 1)}
                      startIndex={citationActivationHistoryVisibleRange.start}
                      endIndex={citationActivationHistoryVisibleRange.end}
                      minSpan={citationActivationHistoryMinSpan}
                      selectionLabel={citationActivationHistoryFocusRangeLabel || 'Completed periods'}
                      trailingContent={(
                        <CitationActivationHistorySeriesToggle
                          value={citationActivationHistorySeriesMode}
                          onChange={setCitationActivationHistorySeriesMode}
                        />
                      )}
                      onChange={(nextStart, nextEnd) => {
                        setCitationActivationHistoryRangeStart(nextStart)
                        setCitationActivationHistoryRangeEnd(nextEnd)
                      }}
                    />
                    <CitationActivationHistoryChart
                      points={citationActivationHistoryVisiblePoints}
                      seriesMode={citationActivationHistorySeriesMode}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain sleeping and fresh pickup papers"
                  content={formatCitationMomentumTooltip({
                    mode: citationMomentumViewMode,
                    sleepingCount: sleepingPublicationRecords.length,
                    freshPickupCount: freshPickupPublicationRecords.length,
                  })}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open sleeping and fresh pickup insight"
                  active={citationMomentumInsightOpen}
                  onClick={onToggleCitationMomentumInsight}
                />
              </div>
              {citationMomentumInsightOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close sleeping and fresh pickup insight"
                    className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
                    onClick={closeCitationMomentumInsight}
                  />
                  <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-[26rem]">
                      <PublicationInsightsCallout
                        payload={citationHistogramInsightsPayload}
                        sectionKey="citation_drivers"
                        loading={citationHistogramInsightsLoading}
                        error={citationHistogramInsightsError}
                        actions={citationMomentumInsightActions}
                        onClose={closeCitationMomentumInsight}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Which publications are sleeping or picking up?</p>
                  <DrilldownSheet.HeadingToggle
                    expanded={citationMomentumExpanded}
                    expandedLabel="Collapse sleeping and fresh pickup publications"
                    collapsedLabel="Expand sleeping and fresh pickup publications"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCitationMomentumExpanded((value) => !value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
              {citationMomentumExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <CitationMomentumViewToggle
                        value={citationMomentumViewMode}
                        onChange={setCitationMomentumViewMode}
                      />
                    </div>
                    <PublicationLinkTable
                      nameColumnLabel={citationMomentumTableConfig.nameColumnLabel}
                      metricColumnLabel={citationMomentumTableConfig.metricColumnLabel}
                      secondaryMetricColumnLabel={citationMomentumTableConfig.secondaryMetricColumnLabel}
                      rows={citationMomentumTableConfig.rows}
                      onOpenPublication={onOpenPublication}
                      emptyMessage={citationMomentumTableConfig.emptyMessage}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'trajectory' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-index trajectory over time"
                  content={formatHIndexTrajectoryTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-index trajectory over time insight"
                  active={hIndexInsightKey === 'trajectory-chart'}
                  onClick={() => toggleHIndexInsight('trajectory-chart')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'trajectory-chart'}
                onClose={closeHIndexInsight}
                title="H-index over time"
                body={`This chart shows how the portfolio moved through successive h thresholds to the current h${formatInt(hIndexDrilldownStats.currentH)}. It is the clearest time-based view of when durable citation depth actually converted into new h-index milestones.`}
                considerationLabel="Why it matters"
                consideration="This is not a cumulative citation curve. Flat periods can still contain citation growth if the next qualifying paper has not yet crossed the threshold needed to lift h-index."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">H-index over time</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                  <HIndexYearChart
                    tile={tile}
                    series={hIndexDrilldownStats.trajectoryPoints}
                    animate={animateCharts}
                  />
                </div>
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-index milestones"
                  content={formatHIndexMilestonesTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-index milestones insight"
                  active={hIndexInsightKey === 'trajectory-milestones'}
                  onClick={() => toggleHIndexInsight('trajectory-milestones')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'trajectory-milestones'}
                onClose={closeHIndexInsight}
                title="Milestone progression"
                body={hIndexDrilldownStats.milestones.length
                  ? 'These rows show when each h threshold was first reached. The spacing between milestones is effectively the pace at which the portfolio converted citation accumulation into new durable h-index steps.'
                  : 'This table will show when each h threshold was first reached once milestone data is available.'}
                considerationLabel="How to read this"
                consideration="Longer gaps between milestones usually indicate that the portfolio is waiting on a smaller set of near-threshold papers. Shorter gaps suggest that multiple papers are rising together and creating broader runway."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Milestone progression</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'milestone', label: 'Milestone' },
                    { key: 'year', label: 'Year reached', align: 'center', width: '1%' },
                    { key: 'elapsed', label: 'Years since prior', align: 'center', width: '1%' },
                  ]}
                  rows={hIndexDrilldownStats.milestones.map((milestone) => ({
                    key: milestone.label,
                    cells: {
                      milestone: milestone.label,
                      year: milestone.value,
                      elapsed: milestone.yearsFromPrevious === null ? '\u2014' : formatInt(milestone.yearsFromPrevious),
                    },
                  }))}
                  emptyMessage="No h-index milestones available."
                />
              </div>
            </div>

          </>
        ) : null}

        {activeTab === 'context' && totalCitationsHeadlineStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Citation half-life proxy</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CitationSplitBarCard
                  bare
                  left={{
                    label: 'Older papers',
                    value: `${formatInt(totalCitationsHeadlineStats.citationHalfLifeOlderCitations)} (${Math.round(totalCitationsHeadlineStats.citationHalfLifeOlderPct || 0)}%)`,
                    ratioPct: totalCitationsHeadlineStats.citationHalfLifeOlderPct || 0,
                    toneClass: HOUSE_CHART_BAR_WARNING_CLASS,
                  }}
                  right={{
                    label: 'Newer papers',
                    value: `${formatInt(totalCitationsHeadlineStats.citationHalfLifeNewerCitations)} (${Math.max(0, 100 - Math.round(totalCitationsHeadlineStats.citationHalfLifeOlderPct || 0))}%)`,
                    ratioPct: Math.max(0, 100 - (totalCitationsHeadlineStats.citationHalfLifeOlderPct || 0)),
                    toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
                  }}
                />
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Portfolio efficiency</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CitationEfficiencyComparisonPanel
                  bare
                  metrics={[
                    {
                      label: 'Citations per paper',
                      value: totalCitationsHeadlineStats.citationsPerPaperValue,
                      raw: totalCitationsHeadlineStats.citationsPerPaperRaw,
                    },
                    {
                      label: 'Mean yearly citations',
                      value: totalCitationsHeadlineStats.meanCitations,
                      raw: totalCitationsHeadlineStats.meanCitationsRaw,
                    },
                    {
                      label: 'Median citations',
                      value: totalCitationsHeadlineStats.medianCitationsValue,
                      raw: totalCitationsHeadlineStats.medianCitationsRaw,
                    },
                  ]}
                />
              </div>
            </div>
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'context' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-index scholarly context"
                  content={formatHIndexContextTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open complementary indices insight"
                  active={hIndexInsightKey === 'context-complementary-indices'}
                  onClick={() => toggleHIndexInsight('context-complementary-indices')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'context-complementary-indices'}
                onClose={closeHIndexInsight}
                title="Complementary indices"
                body="m-index, g-index, and i10-index contextualise the h-index from different angles: pace, excess citation depth, and breadth of consistently cited papers. Together they show whether the same h-index is being achieved through slower mature accumulation or through broader or deeper citation support."
                considerationLabel="How to use them"
                consideration="Read them together, not as substitutes for each other. m-index is the pace lens, g-index is the depth lens, and i10-index is the breadth lens."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Complementary indices</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CitationEfficiencyComparisonPanel
                  bare
                  metrics={[
                    {
                      label: 'm-index',
                      value: hIndexDrilldownStats.mIndexValue,
                      raw: hIndexDrilldownStats.mIndexRaw,
                    },
                    {
                      label: 'g-index',
                      value: hIndexDrilldownStats.gIndexValue,
                      raw: hIndexDrilldownStats.gIndexRaw,
                    },
                    {
                      label: 'i10-index',
                      value: hIndexDrilldownStats.i10IndexValue,
                      raw: hIndexDrilldownStats.i10IndexRaw,
                    },
                  ]}
                />
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-index reference table"
                  content={formatHIndexContextTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-index reference table insight"
                  active={hIndexInsightKey === 'context-index-reference'}
                  onClick={() => toggleHIndexInsight('context-index-reference')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'context-index-reference'}
                onClose={closeHIndexInsight}
                title="Index reference table"
                body="This table is the plain-language interpretation layer for the companion indices. It is useful when you want an explicit reminder of what each metric adds rather than just the values."
                considerationLabel="Why it matters"
                consideration="Different portfolios can share the same h-index but have very different pace, depth, and breadth profiles. This table makes those distinctions explicit."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">Index reference table</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'measure', label: 'Measure' },
                    { key: 'value', label: 'Value', align: 'center', width: '1%' },
                    { key: 'meaning', label: 'What it adds' },
                  ]}
                  rows={[
                    {
                      key: 'm-index',
                      cells: {
                        measure: 'm-index',
                        value: hIndexDrilldownStats.mIndexValue,
                        meaning: 'Normalises h-index by career length, so it is a pace metric rather than a scale metric.',
                      },
                    },
                    {
                      key: 'g-index',
                      cells: {
                        measure: 'g-index',
                        value: hIndexDrilldownStats.gIndexValue,
                        meaning: 'Rewards excess depth from highly cited papers beyond the h-core threshold.',
                      },
                    },
                    {
                      key: 'i10-index',
                      cells: {
                        measure: 'i10-index',
                        value: hIndexDrilldownStats.i10IndexValue,
                        meaning: 'Counts papers with at least ten citations for a simpler breadth check.',
                      },
                    },
                  ]}
                />
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section relative">
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
                <HelpTooltipIconButton
                  ariaLabel="Explain h-core performance"
                  content={formatHIndexCorePerformanceTooltip(hIndexDrilldownStats)}
                />
                <PublicationInsightsTriggerButton
                  ariaLabel="Open h-core performance insight"
                  active={hIndexInsightKey === 'context-h-core-performance'}
                  onClick={() => toggleHIndexInsight('context-h-core-performance')}
                />
              </div>
              <StaticPublicationInsightsOverlay
                open={hIndexInsightKey === 'context-h-core-performance'}
                onClose={closeHIndexInsight}
                title="h-core performance"
                body="This panel combines three context signals around the h-core: citation density inside the core, the core's share of overall citations, and the citation-active career span supporting the current h-index."
                considerationLabel="How to read this"
                consideration="High density and a high citation share point to a compact but strong core. Lower density with a longer active span can indicate a broader, more gradually accumulated citation base."
              />
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2 pr-16">
                  <p className="house-drilldown-heading-block-title">h-core performance</p>
                </div>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CitationEfficiencyComparisonPanel
                  bare
                  metrics={[
                    {
                      label: 'h-core citation density',
                      value: hIndexDrilldownStats.hCoreCitationDensityValue,
                      raw: hIndexDrilldownStats.hCoreCitationDensityRaw,
                    },
                    {
                      label: 'h-core share of citations',
                      value: hIndexDrilldownStats.hCoreShareValue,
                      raw: hIndexDrilldownStats.hCoreSharePct,
                    },
                    {
                      label: 'Years since first cited paper',
                      value: hIndexDrilldownStats.yearsSinceFirstCitedPaper === null
                        ? '\u2014'
                        : formatInt(hIndexDrilldownStats.yearsSinceFirstCitedPaper),
                      raw: hIndexDrilldownStats.yearsSinceFirstCitedPaper,
                    },
                  ]}
                />
              </div>
            </div>

          </>
        ) : null}

        {isEnhancedGenericMetricKey(tile.key) && activeTab !== 'methods'
          ? renderEnhancedGenericMetricDrilldownSection({
            tile,
            activeTab,
            momentumStats: momentumDrilldownStats,
            momentumInsightOpen: citationMomentumInsightOpen,
            onToggleMomentumInsight: onToggleCitationMomentumInsight,
            onOpenPublication,
            momentumWindowMode,
            onMomentumWindowModeChange: setMomentumWindowMode,
            momentumYearBreakdown,
            momentumOverviewViewMode,
            onMomentumOverviewViewModeChange: setMomentumOverviewViewMode,
            impactStats: impactConcentrationDrilldownStats,
            influentialStats: influentialCitationsDrilldownStats,
            fieldPercentileStats: fieldPercentileDrilldownStats,
            authorshipStats: authorshipCompositionDrilldownStats,
            collaborationStats: collaborationStructureDrilldownStats,
            fieldPercentileThreshold: fieldPercentileDrilldownThreshold,
            onFieldPercentileThresholdChange: setFieldPercentileDrilldownThreshold,
            tileToggleMotionReady: true,
          })
          : null}

        {activeTab === 'methods' ? (
          <>
            {methodsSections.map((section) => (
              <div key={section.key} className="house-publications-drilldown-bounded-section">
                <div className="house-drilldown-heading-block">
                  <p className="house-drilldown-heading-block-title">{section.title}</p>
                </div>
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className="space-y-3">
                    <DrilldownNarrativeCard
                      eyebrow="Canonical method story"
                      title={section.description}
                      body={section.bullets[0] || 'No methods summary available.'}
                      note={section.note}
                    />
                    <CanonicalTablePanel
                      title="Method facts"
                      subtitle="Approved metadata view for this methods section."
                      columns={[
                        { key: 'label', label: 'Field' },
                        { key: 'value', label: 'Value' },
                      ]}
                      rows={section.facts.map((fact) => ({
                        key: `${section.key}-${fact.label}`,
                        cells: {
                          label: fact.label,
                          value: fact.value,
                        },
                      }))}
                      emptyMessage="No methods facts available."
                    />
                    {section.bullets.length > 1 ? (
                      <CanonicalTablePanel
                        title="Method notes"
                        subtitle="Operational notes used to interpret the numbers on this tab."
                        columns={[
                          { key: 'note', label: 'Note' },
                        ]}
                        rows={section.bullets.slice(1).map((bullet, index) => ({
                          key: `${section.key}-bullet-${index}`,
                          cells: {
                            note: bullet,
                          },
                        }))}
                        emptyMessage="No additional method notes."
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}

        {subsectionTitle
        && tile.key !== 'total_citations'
        && tile.key !== 'h_index_projection'
        && !isEnhancedGenericMetricKey(tile.key) ? (
          <>
            <div className="house-drilldown-heading-block-secondary">
              <p className={HOUSE_DRILLDOWN_OVERLINE_CLASS}>{subsectionTitle}</p>
            </div>
            <div className="house-drilldown-content-block w-full" />
          </>
        ) : null}
      </div>
    </div>
  )
}

function HIndexNeedsChart({
  tile,
  animate = true,
  collapse = false,
}: {
  tile: PublicationMetricTilePayload
  animate?: boolean
  collapse?: boolean
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const candidateGaps = toNumberArray(chartData.candidate_gaps)
    .map((item) => Math.max(0, Math.round(item)))
  const bars = useMemo(() => ([
    {
      key: 'need-1',
      label: '+1',
      needed: 1,
      count: candidateGaps.filter((gap) => gap === 1).length,
    },
    {
      key: 'need-3',
      label: '+3',
      needed: 3,
      // Keep the panel compact by folding higher gaps into the +3 bin.
      count: candidateGaps.filter((gap) => gap >= 3).length,
    },
  ]), [candidateGaps])
  const animationKey = useMemo(
    () => bars.map((bar) => `${bar.key}-${bar.count}`).join('|'),
    [bars],
  )
  const barsExpanded = useUnifiedToggleBarAnimation(`${animationKey}|hindex-needed`, bars.length > 0)
  const isEntryCycle = useIsFirstChartEntry(`${animationKey}|hindex-needed`, bars.length > 0)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const rawTargetCounts = useMemo(
    () => bars.map((bar) => Math.max(0, bar.count)),
    [bars],
  )
  const targetCounts = useMemo(
    () => (collapse ? rawTargetCounts.map(() => 0) : rawTargetCounts),
    [collapse, rawTargetCounts],
  )
  const animatedCounts = useEasedSeries(
    targetCounts,
    `${animationKey}|counts|${collapse ? 'collapse' : 'expand'}`,
    animate,
    axisDurationMs,
  )
  const targetMax = Math.max(1, ...rawTargetCounts) * 1.18
  const animatedMax = useEasedValue(targetMax, `${animationKey}|max`, animate, axisDurationMs)

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  const scaledMax = Math.max(1, animatedMax)
  const axisLayout = buildChartAxisLayout({
    axisLabels: bars.map((bar) => bar.label),
    showXAxisName: false,
    dense: false,
  })

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div
          className="absolute inset-x-2"
          style={{
            top: 'var(--metric-right-chart-top-inset, 1rem)',
            bottom: `${axisLayout.plotBottomRem}rem`,
          }}
        >
          {[50].map((pct) => (
            <div
              key={`h-needed-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const animatedCount = Math.max(0, animatedCounts[index] ?? 0)
              const heightPct = animatedCount <= 0 ? 3 : Math.max(6, (animatedCount / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const shouldShowTooltipInBar = heightPct >= 18
              const tooltipStyle = shouldShowTooltipInBar
                ? { top: `calc(${100 - heightPct}% + 0.2rem)` }
                : { bottom: `calc(${heightPct}% + 0.35rem)` }
              const toneClass = bar.needed <= 1
                ? HOUSE_CHART_BAR_POSITIVE_CLASS
                : bar.needed <= 3
                  ? HOUSE_CHART_BAR_ACCENT_CLASS
                  : HOUSE_CHART_BAR_WARNING_CLASS
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={tooltipStyle}
                    aria-hidden="true"
                  >
                    {formatInt(animatedCount)} {Math.round(animatedCount) === 1 ? 'paper' : 'papers'}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                      transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-2 grid grid-flow-col auto-cols-fr items-start gap-1"
          style={{ bottom: `${axisLayout.axisBottomRem}rem`, minHeight: `${axisLayout.axisMinHeightRem}rem` }}
        >
          {bars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className={cn('text-center leading-none', HOUSE_TOGGLE_CHART_LABEL_CLASS)}>
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 leading-tight')}>{bar.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

void HIndexNeedsChart

type HIndexToggleBarDatum = {
  key: string
  label: string
  value: number
  kind: 'trajectory' | 'needed'
  needed?: number
}

function HIndexToggleBarsChart({
  tile,
  mode,
}: {
  tile: PublicationMetricTilePayload
  mode: HIndexViewMode
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>

  const trajectoryBars = useMemo<HIndexToggleBarDatum[]>(() => {
    const years = toNumberArray(chartData.years).map((item) => Math.round(item))
    const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
    const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
    if (!hasValidSeries) {
      return []
    }
    return years.map((year, index) => ({
      key: `trajectory-${year}-${index}`,
      label: String(year).slice(-2),
      value: values[index],
      kind: 'trajectory',
    }))
  }, [chartData.values, chartData.years])

  const neededBars = useMemo<HIndexToggleBarDatum[]>(() => {
    const candidateGaps = toNumberArray(chartData.candidate_gaps)
      .map((item) => Math.max(0, Math.round(item)))
    return [
      {
        key: 'needed-1',
        label: '+1',
        needed: 1,
        value: candidateGaps.filter((gap) => gap === 1).length,
        kind: 'needed',
      },
      {
        key: 'needed-3',
        label: '+3',
        needed: 3,
        value: candidateGaps.filter((gap) => gap >= 3).length,
        kind: 'needed',
      },
    ]
  }, [chartData.candidate_gaps])

  const activeBars = mode === 'needed' ? neededBars : trajectoryBars
  const emptyLabel = mode === 'needed' ? 'No h-index citation-gap data' : 'No h-index timeline'
  const hasBars = activeBars.length > 0
  const animationKey = useMemo(
    () => `${mode}|${activeBars.map((bar) => `${bar.key}-${bar.value}`).join('|')}`,
    [activeBars, mode],
  )
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars)
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const targetValues = useMemo(
    () => activeBars.map((bar) => Math.max(0, bar.value)),
    [activeBars],
  )
  const animatedValues = useEasedSeries(
    targetValues,
    `${animationKey}|values`,
    hasBars,
    isEntryCycle ? 0 : axisDurationMs,
  )
  const targetAxisMax = useMemo(
    () => Math.max(1, ...targetValues) * 1.18,
    [targetValues],
  )
  const animatedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|axis-max`,
    hasBars,
    isEntryCycle ? 0 : axisDurationMs,
  )
  const scaledMax = Math.max(1, animatedAxisMax)
  const axisLayout = useMemo(
    () =>
      buildChartAxisLayout({
        axisLabels: activeBars.map((bar) => bar.label),
        axisSubLabels: activeBars.map(() => null),
        dense: activeBars.length >= 6,
      }),
    [activeBars],
  )
  const slotMetrics = useMemo(() => {
    const slotCount = Math.max(1, activeBars.length)
    const slotGapPct = slotCount >= 8 ? 1.8 : slotCount >= 6 ? 2.2 : 2.8
    const totalGapPct = slotGapPct * Math.max(0, slotCount - 1)
    const slotWidthPct = Math.max(2, (100 - totalGapPct) / slotCount)
    const slotStepPct = slotWidthPct + slotGapPct
    return {
      slotCount,
      slotWidthPct,
      slotStepPct,
    }
  }, [activeBars.length])

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_SERIES_BY_SLOT_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div
          className="absolute inset-x-2"
          style={{
            top: 'var(--metric-right-chart-top-inset, 1rem)',
            bottom: `${axisLayout.plotBottomRem}rem`,
          }}
        >
          {[50].map((pct) => (
            <div
              key={`h-index-toggle-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0">
            {activeBars.map((bar, index) => {
              const animatedValue = Math.max(0, animatedValues[index] ?? 0)
              const heightPct = animatedValue <= 0 ? 3 : Math.max(6, (animatedValue / scaledMax) * 100)
              const leftPct = index * slotMetrics.slotStepPct
              const isActive = hoveredIndex === index
              const shouldShowTooltipInBar = bar.kind === 'needed' && heightPct >= 18
              const tooltipStyle = shouldShowTooltipInBar
                ? { top: `calc(${100 - heightPct}% + 0.2rem)` }
                : { bottom: `calc(${heightPct}% + 0.35rem)` }
              const tooltipText = bar.kind === 'needed'
                ? `${formatInt(animatedValue)} ${Math.round(animatedValue) === 1 ? 'paper' : 'papers'}`
                : `h ${formatInt(animatedValue)}`
              const toneClass = bar.kind === 'needed'
                ? bar.needed === 1
                  ? HOUSE_CHART_BAR_POSITIVE_CLASS
                  : HOUSE_CHART_BAR_ACCENT_CLASS
                : HOUSE_CHART_BAR_ACCENT_CLASS
              return (
                <div
                  key={`h-index-slot-${index}`}
                  className={cn(
                    'absolute inset-y-0',
                    HOUSE_TOGGLE_CHART_MORPH_CLASS,
                  )}
                  style={{
                    left: `${leftPct}%`,
                    width: `${slotMetrics.slotWidthPct}%`,
                    transitionDuration: barTransitionDuration,
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={tooltipStyle}
                    aria-hidden="true"
                  >
                    {tooltipText}
                  </span>
                  <span
                    className={cn(
                      'absolute bottom-0 block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      HOUSE_TOGGLE_CHART_MORPH_CLASS,
                      HOUSE_TOGGLE_CHART_SWAP_CLASS,
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                      transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-x-2"
          style={{ bottom: `${axisLayout.axisBottomRem}rem`, minHeight: `${axisLayout.axisMinHeightRem}rem` }}
        >
          {activeBars.map((bar, index) => {
            const leftPct = index * slotMetrics.slotStepPct
            return (
              <div
                key={`h-index-slot-axis-${index}`}
                className={cn('absolute top-0 leading-none text-center', HOUSE_TOGGLE_CHART_LABEL_CLASS)}
                style={{ left: `${leftPct}%`, width: `${slotMetrics.slotWidthPct}%` }}
              >
                <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 leading-tight')}>{bar.label}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function HIndexTrajectoryPanel({
  tile,
  mode,
  chartHeader,
  chartHeaderClassName,
  chartHeaderKind = 'title',
}: {
  tile: PublicationMetricTilePayload
  mode: HIndexViewMode
  chartHeader?: ReactNode
  chartHeaderClassName?: string
  chartHeaderKind?: 'title' | 'toggle'
}) {
  return (
    <div
      className={cn(
        HOUSE_METRIC_RIGHT_CHART_PANEL_CLASS,
        chartHeader && chartHeaderKind === 'toggle' && HOUSE_METRIC_RIGHT_CHART_PANEL_TOGGLE_CLASS,
      )}
    >
      {chartHeader ? (
        <div className={cn(chartHeaderClassName || HOUSE_METRIC_RIGHT_CHART_HEADER_CLASS)}>
          {chartHeader}
        </div>
      ) : null}
      <div className={HOUSE_METRIC_RIGHT_CHART_BODY_CLASS}>
        <HIndexToggleBarsChart tile={tile} mode={mode} />
      </div>
    </div>
  )
}

function HIndexProgressInline({
  tile,
  progressLabel,
  compact = false,
}: {
  tile: PublicationMetricTilePayload
  progressLabel?: string
  compact?: boolean
}) {
  const progressMeta = buildHIndexProgressMeta(tile)
  const progressAnimationKey = useMemo(
    () => `${Math.round(progressMeta.progressPct)}|${progressMeta.currentH}|${progressMeta.targetH}`,
    [progressMeta.currentH, progressMeta.progressPct, progressMeta.targetH],
  )
  const progressExpanded = useUnifiedToggleBarAnimation(progressAnimationKey, true)
  const isEntryCycle = useIsFirstChartEntry(progressAnimationKey, true)
  const progressTransitionDuration = tileChartDurationVar(isEntryCycle)
  return (
    <div className={cn('w-full max-w-[11.7rem] space-y-1.5', compact ? '' : 'mt-6')}>
      {progressLabel ? (
        <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'house-metric-support-text leading-tight')}>{progressLabel}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[var(--metric-progress-track-height)] flex-1')}>
          <div
            className={cn('h-full rounded-full house-progress-fill-motion', HOUSE_CHART_BAR_POSITIVE_CLASS)}
            style={{
              width: `${progressExpanded ? progressMeta.progressPct : 0}%`,
              '--chart-transition-duration': progressTransitionDuration,
            } as React.CSSProperties}
            aria-hidden="true"
          />
        </div>
        <span className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'house-metric-support-text font-medium leading-none')}>
          {Math.round(progressMeta.progressPct)}%
        </span>
      </div>
    </div>
  )
}

function HIndexThresholdStepsSummary({
  steps,
}: {
  steps: HIndexDrilldownStats['summaryThresholdSteps']
}) {
  if (!steps.length) {
    return <p className={HOUSE_DRILLDOWN_HINT_CLASS}>No threshold-step summary available.</p>
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const toneClass = index === 0 ? HOUSE_CHART_BAR_POSITIVE_CLASS : HOUSE_CHART_BAR_NEUTRAL_CLASS
        const title = index === 0
          ? `Next step: h${formatInt(step.targetH)}`
          : `Step after: h${formatInt(step.targetH)}`
        return (
          <div
            key={`h-index-threshold-step-${step.targetH}`}
            className={cn(index > 0 ? 'border-t border-[hsl(var(--stroke-soft)/0.7)] pt-4' : '', 'space-y-2.5')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">
                  {`${formatInt(step.currentMeetingTarget)} of ${formatInt(step.targetH)} papers already at ${formatInt(step.targetH)}+ citations`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'text-[1.15rem] tabular-nums')}>{Math.round(step.progressPct)}%</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">
                  {step.papersNeeded > 0
                    ? `${formatInt(step.papersNeeded)} ${pluralize(step.papersNeeded, 'paper')} short`
                    : 'Threshold already met'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[0.72rem] flex-1')}>
                <div
                  className={cn('h-full rounded-full', toneClass)}
                  style={{ width: `${step.progressPct}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'whitespace-nowrap tabular-nums')}>
                {step.citationsNeeded > 0
                  ? `+${formatInt(step.citationsNeeded)} ${pluralize(step.citationsNeeded, 'citation')}`
                  : 'Ready'}
              </span>
            </div>
            {step.nearestGapValues.length ? (
              <p className={cn(HOUSE_DRILLDOWN_NOTE_SOFT_CLASS, 'tabular-nums')}>
                {`Nearest gaps: ${step.nearestGapValues.map((gap) => `+${formatInt(gap)}`).join(', ')}`}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function HIndexViewToggle({
  mode,
  onModeChange,
}: {
  mode: HIndexViewMode
  onModeChange: (mode: HIndexViewMode) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const trajectoryButtonRef = useRef<HTMLButtonElement>(null)
  const neededButtonRef = useRef<HTMLButtonElement>(null)
  const [thumbStyle, setThumbStyle] = useState<CSSProperties>({ left: '0px', width: '0px' })
  const [motionReady, setMotionReady] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMotionReady(true), CHART_MOTION.entry.duration)
    return () => window.clearTimeout(id)
  }, [])

  useLayoutEffect(() => {
    const updateThumbStyle = () => {
      const trackElement = trackRef.current
      const trajectoryElement = trajectoryButtonRef.current
      const neededElement = neededButtonRef.current
      if (!trackElement || !trajectoryElement || !neededElement) {
        return
      }
      const activeButton = mode === 'needed' ? neededElement : trajectoryElement
      const leftPx = activeButton.offsetLeft
      const widthPx = activeButton.offsetWidth
      setThumbStyle({
        left: `${Math.max(0, leftPx)}px`,
        width: `${Math.max(0, widthPx)}px`,
        transitionDuration: motionReady ? undefined : '0ms',
      })
    }

    updateThumbStyle()
    const frame = window.requestAnimationFrame(updateThumbStyle)

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateThumbStyle)
      : null
    if (observer) {
      if (trackRef.current) {
        observer.observe(trackRef.current)
      }
      if (trajectoryButtonRef.current) {
        observer.observe(trajectoryButtonRef.current)
      }
      if (neededButtonRef.current) {
        observer.observe(neededButtonRef.current)
      }
    }

    window.addEventListener('resize', updateThumbStyle)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateThumbStyle)
      if (observer) {
        observer.disconnect()
      }
    }
  }, [mode, motionReady])

  return (
    <div className="flex items-center">
      <div
        ref={trackRef}
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid')}
        style={{ gridTemplateColumns: 'auto auto' }}
        data-stop-tile-open="true"
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={thumbStyle}
          aria-hidden="true"
        />
        <button
          ref={trajectoryButtonRef}
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'whitespace-nowrap',
            mode === 'trajectory' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          onClick={(event) => {
            event.stopPropagation()
            if (mode === 'trajectory') {
              return
            }
            onModeChange('trajectory')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-pressed={mode === 'trajectory'}
        >
          Trend
        </button>
        <button
          ref={neededButtonRef}
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'whitespace-nowrap',
            mode === 'needed' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          onClick={(event) => {
            event.stopPropagation()
            if (mode === 'needed') {
              return
            }
            onModeChange('needed')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-pressed={mode === 'needed'}
        >
          Citations needed
        </button>
      </div>
    </div>
  )
}

function InfluentialTrendPanel({
  tile,
  chartTitle,
  chartTitleClassName,
  refreshKey,
}: {
  tile: PublicationMetricTilePayload
  chartTitle?: string
  chartTitleClassName?: string
  refreshKey?: string | null
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const [pathLength, setPathLength] = useState(0)
  
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const primarySeries = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const sourceValues = primarySeries.length ? primarySeries : fallbackSeries
  const values = useMemo(() => {
    if (!sourceValues.length) {
      return []
    }
    const cumulative: number[] = []
    let running = 0
    sourceValues.forEach((item) => {
      running = Math.max(running, Math.max(0, item))
      cumulative.push(running)
    })
    return cumulative
  }, [sourceValues])
  const labels = normalizeSeriesLabels(
    chartData.window_labels || chartData.labels || chartData.years,
    values.length,
    'W',
  )
  const hasValues = values.length > 0
  const width = 220
  const height = 92
  const points = useMemo(
    () => (hasValues ? buildLinePoints(values, width, height, labels, 8) : []),
    [hasValues, labels, values],
  )
  const path = useMemo(
    () => (points.length ? monotonePathFromPoints(points) : ''),
    [points],
  )
  const lineAnimationKey = useMemo(
    () => {
      const seriesKey = hasValues ? values.map((value) => value.toFixed(3)).join('|') : 'empty'
      return `${seriesKey}|${String(refreshKey || '')}`
    },
    [hasValues, refreshKey, values],
  )
  const lineEntryKey = `${lineAnimationKey}|influential-line`
  const fallbackPathLength = useMemo(
    () => Math.max(1, estimatePolylineLength(points)),
    [points],
  )
  const effectivePathLength = pathLength > 0 ? pathLength : fallbackPathLength
  const lineExpanded = useUnifiedToggleBarAnimation(lineEntryKey, hasValues)
  const lineTransitionDuration = tileChartDurationVar(
    useIsFirstChartEntry(lineEntryKey, hasValues),
  )

  useEffect(() => {
    setPathLength(0)
    if (pathRef.current) {
      try {
        const length = pathRef.current.getTotalLength()
        setPathLength(length)
      } catch {
        setPathLength(0)
      }
    }
  }, [path])

  if (!hasValues) {
    return <div className={dashboardTileStyles.emptyChart}>No influential citation trend</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {chartTitle ? (
        <p className={cn(chartTitleClassName || HOUSE_CHART_AXIS_TITLE_CLASS, 'mb-1')}>
          {chartTitle}
        </p>
      ) : null}
      <div
        className={cn(
          HOUSE_LINE_CHART_SURFACE_CLASS,
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
      >
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <path
              ref={pathRef}
              d={path}
              fill="none"
              stroke="hsl(var(--tone-accent-400))"
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
              className="house-toggle-chart-line"
              data-expanded={lineExpanded ? 'true' : 'false'}
              style={{
                '--chart-path-length': effectivePathLength,
                transitionDuration: lineTransitionDuration,
              } as React.CSSProperties}
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

function MiniBars({
  values,
  className = '',
  highlightFrom = -1,
}: {
  values: number[]
  className?: string
  highlightFrom?: number
}) {
  if (!values.length) {
    return <div className="h-8 rounded bg-card" />
  }
  const max = Math.max(1, ...values)
  return (
    <div className={cn('flex h-8 items-end gap-1', className)}>
      {values.map((value, index) => {
        const height = Math.max(12, Math.round((Math.max(0, value) / max) * 30))
        const highlighted = highlightFrom >= 0 && index >= highlightFrom
        return (
          <div
            key={`${index}-${value}`}
            className={cn('w-full rounded-sm', HOUSE_CHART_BAR_ACCENT_CLASS, highlighted && HOUSE_CHART_BAR_POSITIVE_CLASS)}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function MiniPairedBars({
  values,
}: {
  values: number[]
}) {
  const safe = values.slice(0, 2)
  if (safe.length < 2) {
    return <div className="h-8 rounded bg-card" />
  }
  const max = Math.max(1, ...safe)
  return (
    <div className="flex h-8 items-end gap-2">
      {safe.map((value, index) => (
        <div key={`${index}-${value}`} className="flex w-full flex-col items-center gap-1">
          <div
            className={cn('w-full rounded-sm', index === 0 ? HOUSE_CHART_BAR_POSITIVE_CLASS : HOUSE_CHART_BAR_ACCENT_CLASS)}
            style={{ height: `${Math.max(12, Math.round((Math.max(0, value) / max) * 30))}px` }}
          />
        </div>
      ))}
    </div>
  )
}

function MiniProgressRing({
  progress,
}: {
  progress: number
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0))
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8">
      <circle cx="18" cy="18" r={radius} fill="none" className={HOUSE_CHART_RING_TRACK_SVG_CLASS} strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        className={HOUSE_CHART_RING_MAIN_SVG_CLASS}
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

function MiniDonut({
  values,
}: {
  values: number[]
}) {
  const safe = values.slice(0, 2).map((item) => Math.max(0, item))
  const total = safe.reduce((sum, item) => sum + item, 0)
  if (total <= 0) {
    return <div className="h-8 w-8 rounded-full bg-card" />
  }
  const pct = safe[0] / total
  const angle = pct * 360
  const donutStyle = { '--house-donut-angle': `${angle}deg` } as CSSProperties
  return (
    <div className={cn('h-8 w-8 rounded-full', HOUSE_CHART_MINI_DONUT_CLASS)} style={donutStyle}>
      <div className="relative left-sz-7 top-sz-7 h-sz-18 w-sz-18 rounded-full bg-card" />
    </div>
  )
}

function MiniLine({
  values,
  overlay = [],
}: {
  values: number[]
  overlay?: number[]
}) {
  if (!values.length) {
    return <div className="h-8 rounded bg-card" />
  }
  const max = Math.max(...values, ...(overlay.length ? overlay : [0]))
  const min = Math.min(...values, ...(overlay.length ? overlay : [0]))
  const range = Math.max(1e-6, max - min)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')
  const overlayPoints = overlay.length
    ? overlay
        .map((value, index) => {
          const x = (index / Math.max(1, overlay.length - 1)) * 100
          const y = 100 - ((value - min) / range) * 100
          return `${x},${y}`
        })
        .join(' ')
    : ''
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full">
      {overlayPoints ? (
        <polyline
          fill="none"
          className={HOUSE_CHART_LINE_SOFT_SVG_CLASS}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={overlayPoints}
        />
      ) : null}
      <polyline
        fill="none"
        className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function MiniChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartType = String(tile.chart_type || '').trim().toLowerCase()
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  if (chartType === 'bar_year_5') {
    const values = toNumberArray(chartData.values)
    return <MiniBars values={values} />
  }
  if (chartType === 'paired_bar') {
    const values = toNumberArray(chartData.values)
    return <MiniPairedBars values={values} />
  }
  if (chartType === 'gauge') {
    const monthly = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
    const fallback = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
    const trendValues = monthly.length ? monthly : fallback
    return <MiniLine values={trendValues} />
  }
  if (chartType === 'progress_ring') {
    const progress = Number(chartData.progress_to_next_pct ?? 0)
    return <MiniProgressRing progress={progress} />
  }
  if (chartType === 'donut') {
    const values = toNumberArray(chartData.values)
    return <MiniDonut values={values} />
  }
  if (chartType === 'bar_month_12') {
    const values = toNumberArray(chartData.values)
    return <MiniBars values={values} />
  }
  return (
    <MiniLine
      values={tile.sparkline || []}
      overlay={tile.sparkline_overlay || []}
    />
  )
}

function CitationSplitBarCard({
  title,
  subtitle,
  bare = false,
  left,
  right,
}: {
  title?: string
  subtitle?: string
  bare?: boolean
  left: {
    label: string
    value: string
    ratioPct: number
    toneClass: string
  }
  right: {
    label: string
    value: string
    ratioPct: number
    toneClass: string
  }
}) {
  const leftWidth = Math.max(0, Math.min(100, left.ratioPct))
  const rightWidth = Math.max(0, Math.min(100, right.ratioPct))
  const animationKey = useMemo(
    () => `citation-split:${left.label}:${Math.round(leftWidth)}|${right.label}:${Math.round(rightWidth)}`,
    [left.label, leftWidth, right.label, rightWidth],
  )
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, leftWidth + rightWidth > 0, 'entry-only')
  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      {title || subtitle ? (
        <div className="space-y-1">
          {title ? <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p> : null}
          {subtitle ? <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p> : null}
        </div>
      ) : null}
      <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'flex h-[var(--metric-progress-track-height)] overflow-hidden rounded-full')}>
        <div
          className={cn('h-full border-r border-white/75', left.toneClass, HOUSE_TOGGLE_CHART_MORPH_CLASS)}
          style={{
            width: `${leftWidth}%`,
            transform: `scaleX(${barsExpanded ? 1 : 0})`,
            transformOrigin: 'left center',
          }}
          aria-hidden="true"
        />
        <div
          className={cn('h-full', right.toneClass, HOUSE_TOGGLE_CHART_MORPH_CLASS)}
          style={{
            width: `${rightWidth}%`,
            transform: `scaleX(${barsExpanded ? 1 : 0})`,
            transformOrigin: 'right center',
          }}
          aria-hidden="true"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>{left.label}</p>
          <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{left.value}</p>
        </div>
        <div className="space-y-1 text-right">
          <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>{right.label}</p>
          <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{right.value}</p>
        </div>
      </div>
    </div>
  )
}

function CitationConcentrationLadderCard({
  steps,
  bare = false,
}: {
  steps: CitationConcentrationLadderStep[]
  bare?: boolean
}) {
  const hasSteps = steps.length > 0
  const animationKey = useMemo(
    () => steps.map((step) => `${step.key}:${Math.round(step.citationSharePct)}`).join('|') || 'empty',
    [steps],
  )
  const barsExpanded = useUnifiedToggleBarAnimation(`${animationKey}|citation-concentration`, hasSteps)

  const toneClassForStep = (step: CitationConcentrationLadderStep, index: number) => {
    if (index === 0) {
      return HOUSE_CHART_BAR_POSITIVE_CLASS
    }
    if (step.label === 'Top 25%') {
      return HOUSE_CHART_BAR_WARNING_CLASS
    }
    if (index === 1) {
      return HOUSE_CHART_BAR_ACCENT_CLASS
    }
    return HOUSE_CHART_BAR_NEUTRAL_CLASS
  }

  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      {hasSteps ? (
        steps.map((step, index) => (
          <div key={step.key} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{step.label}</p>
                <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>
                  {`${formatInt(step.paperCount)} ${pluralize(step.paperCount, 'paper')} • ${formatPercentWhole(step.paperSharePct)} of papers`}
                </p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')}>{formatPercentWhole(step.citationSharePct)}</p>
                <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>{`${formatInt(step.citationCount)} citations`}</p>
              </div>
            </div>
            <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[0.72rem]')}>
              <div
                className={cn('h-full rounded-full house-progress-fill-motion', toneClassForStep(step, index))}
                style={{
                  width: `${barsExpanded ? Math.max(0, Math.min(100, step.citationSharePct)) : 0}%`,
                  transitionDuration: 'var(--motion-duration-chart-toggle)',
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        ))
      ) : (
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">No citation concentration data is available yet.</p>
      )}
    </div>
  )
}

function CitationActivationStateBarCard({
  bare = false,
  segments,
}: {
  bare?: boolean
  segments: Array<{
    key: string
    label: string
    value: string
    ratioPct: number
    toneClass: string
    align?: 'left' | 'center' | 'right'
  }>
}) {
  const animationKey = useMemo(
    () => `citation-activation-state:${segments.map((segment) => `${segment.key}:${Math.round(Math.max(0, Math.min(100, segment.ratioPct)))}`).join('|')}`,
    [segments],
  )
  const barsExpanded = useUnifiedToggleBarAnimation(
    animationKey,
    segments.some((segment) => segment.ratioPct > 0),
  )
  const getTextToneStyle = (key: string): CSSProperties | undefined => {
    if (key === 'newly-active') {
      return { color: 'hsl(var(--tone-positive-700))' }
    }
    if (key === 'still-active') {
      return { color: 'hsl(var(--tone-accent-700))' }
    }
    if (key === 'inactive') {
      return { color: 'hsl(var(--tone-danger-700))' }
    }
    return undefined
  }

  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'flex h-[var(--metric-progress-track-height)] overflow-hidden rounded-full')}>
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className={cn(
              'h-full',
              index < segments.length - 1 && 'border-r border-white/75',
              segment.toneClass,
              HOUSE_TOGGLE_CHART_MORPH_CLASS,
            )}
            style={{
              width: `${Math.max(0, Math.min(100, segment.ratioPct))}%`,
              transform: `scaleX(${barsExpanded ? 1 : 0})`,
              transformOrigin: index === 0 ? 'left center' : index === segments.length - 1 ? 'right center' : 'left center',
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {segments.map((segment) => {
          const textToneStyle = getTextToneStyle(segment.key)
          return (
            <div
              key={segment.key}
              className={cn(
                'space-y-1',
                segment.align === 'center' ? 'text-center' : segment.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>{segment.label}</p>
              <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'tabular-nums')} style={textToneStyle}>{segment.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CitationHistogramChart({
  buckets,
}: {
  buckets: CitationHistogramBucket[]
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hasBars = buckets.length > 0
  const animationKey = useMemo(
    () => `citation-histogram:${buckets.map((bucket) => `${bucket.key}-${bucket.count}`).join('|') || 'empty'}`,
    [buckets],
  )
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const targetValues = useMemo(
    () => buckets.map((bucket) => Math.max(0, bucket.count)),
    [buckets],
  )
  const animatedValues = useEasedSeries(
    targetValues,
    `${animationKey}|values`,
    hasBars,
    isEntryCycle ? 0 : axisDurationMs,
  )
  const targetAxisScale = useMemo(
    () => buildNiceAxis(targetValues.length ? Math.max(1, ...targetValues) : 1),
    [targetValues],
  )
  const scaledMax = Math.max(1, targetAxisScale.axisMax)
  const displayedAxisMax = useEasedValue(
    targetAxisScale.axisMax,
    `${animationKey}|citation-histogram-y-axis-max`,
    hasBars,
    axisDurationMs,
  )
  const axisLayout = useMemo(
    () => buildChartAxisLayout({
      axisLabels: buckets.map((bucket) => bucket.label),
      axisSubLabels: buckets.map(() => null),
      showXAxisName: true,
      xAxisName: 'Lifetime citations per publication',
      dense: buckets.length >= 8,
      maxLabelLines: 2,
      maxAxisNameLines: 1,
    }),
    [buckets],
  )
  const yAxisTickValues = targetAxisScale.ticks
  const yAxisLabelTicks = yAxisTickValues
  const yAxisTickRatios = useMemo(
    () => yAxisTickValues.map((tick) => Math.max(0, Math.min(1, tick / scaledMax))),
    [scaledMax, yAxisTickValues],
  )
  const displayedYAxisTickValues = useMemo(
    () => yAxisTickRatios.map((ratio) => ratio * Math.max(1, displayedAxisMax)),
    [displayedAxisMax, yAxisTickRatios],
  )
  const yAxisLabelItems = useMemo(
    () => yAxisTickValues
      .map((tick, index) => ({
        tick: displayedYAxisTickValues[index] ?? tick,
        targetTick: tick,
        ratio: yAxisTickRatios[index] || 0,
      }))
      .filter((item) => yAxisLabelTicks.includes(item.targetTick)),
    [displayedYAxisTickValues, yAxisLabelTicks, yAxisTickRatios, yAxisTickValues],
  )
  const interiorGridTickRatios = useMemo(
    () => yAxisTickRatios.filter((_, index) => index > 0 && index < yAxisTickRatios.length - 1),
    [yAxisTickRatios],
  )
  const hasTopYAxisGridLine = yAxisTickValues.length > 1
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(yAxisLabelTicks, true, 1.2)
  const chartLeftInset = `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${axisLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${axisLayout.axisBottomRem}rem`,
    minHeight: `${axisLayout.axisMinHeightRem}rem`,
  }
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${axisLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const yAxisTitleLeft = '36%'

  if (!hasBars) {
    return (
      <div className="py-1">
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">No citation distribution is available yet.</p>
      </div>
    )
  }

  const toneClassForBucket = (bucket: CitationHistogramBucket) => {
    if (bucket.minCitations === 0 && bucket.maxCitations === 0) {
      return 'bg-[hsl(var(--tone-positive-200))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 1) {
      return 'bg-[hsl(var(--tone-positive-300))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 4) {
      return 'bg-[hsl(var(--tone-positive-400))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 9) {
      return 'bg-[hsl(var(--tone-positive-400))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 24) {
      return 'bg-[hsl(var(--tone-positive-500))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 49) {
      return 'bg-[hsl(var(--tone-positive-500))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 99) {
      return 'bg-[hsl(var(--tone-positive-600))]'
    }
    if (bucket.maxCitations !== null && bucket.maxCitations <= 199) {
      return 'bg-[hsl(var(--tone-positive-600))]'
    }
    if (bucket.maxCitations === null || bucket.minCitations >= 200) {
      return 'bg-[hsl(var(--tone-positive-700))]'
    }
    return 'bg-[hsl(var(--tone-positive-500))]'
  }

  return (
    <div className="relative h-[20rem]">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_SERIES_BY_SLOT_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
          'house-publications-trend-chart-frame-borderless',
          'h-full',
        )}
        style={{ paddingBottom: `${axisLayout.framePaddingBottomRem}rem` }}
      >
        <div className="absolute" style={plotAreaStyle}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              className={cn('absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.78)' }}
            />
            <div
              className={cn('absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderRight: '1px solid hsl(var(--stroke-soft) / 0.78)' }}
            />
            <div
              className={cn('absolute inset-x-0 bottom-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.9)' }}
            />
            {interiorGridTickRatios.map((ratio, index) => (
              <div
                key={`citation-histogram-grid-y-${index}`}
                className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`, borderTop: '1px solid hsl(var(--stroke-soft) / 0.72)' }}
              />
            ))}
            {hasTopYAxisGridLine ? (
              <div
                className={cn('absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.72)' }}
              />
            ) : null}
          </div>

          <TooltipProvider delayDuration={120}>
            <div className="absolute inset-0 flex items-end gap-1">
              {buckets.map((bucket, index) => {
                const animatedValue = Math.max(0, animatedValues[index] ?? 0)
                const heightPct = animatedValue <= 0 ? 3 : Math.max(6, (animatedValue / scaledMax) * 100)
                const isActive = hoveredIndex === index
                return (
                  <div key={bucket.key} className="relative flex h-full min-h-0 flex-1 items-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'relative block w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                            HOUSE_TOGGLE_CHART_BAR_CLASS,
                            toneClassForBucket(bucket),
                            isActive && 'brightness-[1.08] saturate-[1.14]',
                          )}
                          style={{
                            height: `${heightPct}%`,
                            transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                            transformOrigin: 'bottom',
                            transitionDelay: tileMotionEntryDelay(index, isEntryCycle && barsExpanded),
                            transitionDuration: tileMotionEntryDuration(index, isEntryCycle && barsExpanded),
                          }}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                          onFocus={() => setHoveredIndex(index)}
                          onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                          aria-label={`${bucket.label} citations: ${formatInt(bucket.count)} ${pluralize(bucket.count, 'publication')}, ${Math.round(bucket.sharePct)}% of publications`}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="center"
                        sideOffset={3}
                        className="house-approved-tooltip max-w-[16rem] whitespace-normal px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none"
                      >
                        <div className="space-y-1">
                          <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{`${bucket.label} citations`}</p>
                          <p>{`${formatInt(bucket.count)} ${pluralize(bucket.count, 'publication')}`}</p>
                          <p>{`${Math.round(bucket.sharePct)}% of publication set`}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          </TooltipProvider>
        </div>

        <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
          {yAxisLabelItems.map(({ tick, ratio }) => {
            const pct = Math.max(0, Math.min(100, ratio * 100))
            const tickRatioKey = Math.round(ratio * 1000)
            const isTopTick = ratio >= 0.999
            return (
              <p
                key={`citation-histogram-y-axis-${tickRatioKey}`}
                className={cn('absolute right-0 whitespace-nowrap tabular-nums text-[0.68rem] leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                style={{
                  bottom: isTopTick
                    ? `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM + 0.62}rem)`
                    : `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM}rem)`,
                }}
              >
                {formatInt(tick)}
              </p>
            )
          })}
          <p
            className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
            style={{ left: yAxisTitleLeft }}
          >
            Number of publications per class
          </p>
        </div>

        <div
          className={cn('pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1', HOUSE_TOGGLE_CHART_LABEL_CLASS)}
          style={xAxisTicksStyle}
        >
          {buckets.map((bucket) => (
            <div key={`${bucket.key}-axis`} className="text-center leading-none">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 text-[0.68rem] leading-[1.05]')}>{bucket.label}</p>
            </div>
          ))}
        </div>

        <div
          className="pointer-events-none absolute"
          style={{
            left: chartLeftInset,
            right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
            bottom: `${axisLayout.xAxisNameBottomRem}rem`,
            minHeight: `${axisLayout.xAxisNameMinHeightRem}rem`,
          }}
        >
          <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
            Lifetime citations per publication
          </p>
        </div>
      </div>
    </div>
  )
}

function CompletedPeriodRangeSlider({
  minIndex,
  maxIndex,
  startIndex,
  endIndex,
  minSpan,
  selectionLabel,
  trailingContent,
  onChange,
}: {
  minIndex: number
  maxIndex: number
  startIndex: number
  endIndex: number
  minSpan: number
  selectionLabel: string
  trailingContent?: React.ReactNode
  onChange: (nextStart: number, nextEnd: number) => void
}) {
  const totalPoints = Math.max(0, maxIndex - minIndex + 1)
  if (totalPoints <= 1) {
    return null
  }

  const safeStart = Math.max(minIndex, Math.min(maxIndex, startIndex))
  const safeEnd = Math.max(
    safeStart,
    Math.min(maxIndex, Math.max(endIndex, Math.min(maxIndex, safeStart + minSpan - 1))),
  )
  const axisSpan = Math.max(1, maxIndex - minIndex)
  const startPct = ((safeStart - minIndex) / axisSpan) * 100
  const endPct = ((safeEnd - minIndex) / axisSpan) * 100
  const isAdjustable = totalPoints > minSpan
  const trackRef = useRef<HTMLDivElement | null>(null)
  const selectionLabelParts = selectionLabel.split(/\s+-\s+/)
  const hasSelectionRange = selectionLabelParts.length === 2

  const getIndexFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) {
      return minIndex
    }
    const rect = track.getBoundingClientRect()
    if (!rect.width) {
      return minIndex
    }
    const clamped = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const ratio = clamped / rect.width
    return minIndex + Math.round(ratio * axisSpan)
  }, [axisSpan, minIndex])

  const updateRangeFromClientX = useCallback((handle: 'start' | 'end', clientX: number) => {
    if (!isAdjustable) {
      return
    }
    const proposedIndex = getIndexFromClientX(clientX)
    if (handle === 'start') {
      const nextStart = Math.max(minIndex, Math.min(proposedIndex, safeEnd - minSpan + 1))
      onChange(nextStart, safeEnd)
      return
    }
    const nextEnd = Math.min(maxIndex, Math.max(proposedIndex, safeStart + minSpan - 1))
    onChange(safeStart, nextEnd)
  }, [getIndexFromClientX, isAdjustable, maxIndex, minIndex, minSpan, onChange, safeEnd, safeStart])

  const beginDrag = useCallback((handle: 'start' | 'end', clientX: number) => {
    updateRangeFromClientX(handle, clientX)
    const handlePointerMove = (event: PointerEvent) => {
      updateRangeFromClientX(handle, event.clientX)
    }
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [updateRangeFromClientX])

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAdjustable) {
      return
    }
    const proposedIndex = getIndexFromClientX(event.clientX)
    const nearestHandle = Math.abs(proposedIndex - safeStart) <= Math.abs(proposedIndex - safeEnd) ? 'start' : 'end'
    beginDrag(nearestHandle, event.clientX)
  }

  const handleStartPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    beginDrag('start', event.clientX)
  }

  const handleEndPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    beginDrag('end', event.clientX)
  }
  const sliderHandleClassName = cn(
    'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[hsl(var(--tone-positive-300))] bg-white shadow-[0_0_0_2px_hsl(var(--tone-neutral-0)),0_1px_4px_hsl(var(--tone-neutral-950)/0.14)] transition-[border-color,box-shadow,transform] duration-[var(--motion-duration-ui)] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-positive-200)/0.78)]',
    isAdjustable ? 'cursor-ew-resize hover:border-[hsl(var(--tone-positive-400))] hover:shadow-[0_0_0_2px_hsl(var(--tone-neutral-0)),0_2px_6px_hsl(var(--tone-neutral-950)/0.16)]' : 'cursor-default',
  )

  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-6">
        <div className="min-w-0 max-w-[24rem] flex-1">
          <div
            ref={trackRef}
            className={cn('relative h-8 px-2', isAdjustable ? 'cursor-ew-resize' : 'cursor-default')}
            onPointerDown={handleTrackPointerDown}
          >
            <div
              className="absolute left-0 right-0 top-1/2 h-[0.28rem] -translate-y-1/2 rounded-full bg-[hsl(var(--tone-neutral-400)/0.88)]"
              aria-hidden="true"
            />
            <div
              className="absolute top-1/2 h-[0.28rem] -translate-y-1/2 rounded-full bg-[hsl(var(--tone-positive-400))] shadow-[0_0_0_1px_hsl(var(--tone-positive-300)/0.24)]"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`,
              }}
              aria-hidden="true"
            />
            <button
              type="button"
              aria-label="Start of selected period"
              className={cn(sliderHandleClassName, 'z-20')}
              style={{ left: `calc(${startPct}% + 0.5rem)` }}
              disabled={!isAdjustable}
              onPointerDown={handleStartPointerDown}
            >
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 h-[0.34rem] w-[0.34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--tone-positive-400))]"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              aria-label="End of selected period"
              className={cn(sliderHandleClassName, 'z-30')}
              style={{ left: `calc(${endPct}% + 0.5rem)` }}
              disabled={!isAdjustable}
              onPointerDown={handleEndPointerDown}
            >
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 h-[0.34rem] w-[0.34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--tone-positive-400))]"
                aria-hidden="true"
              />
            </button>
          </div>
          {hasSelectionRange ? (
            <div className={cn('mx-auto grid w-[10.6rem] grid-cols-[1fr_auto_1fr] items-center justify-items-center pt-1 tabular-nums', HOUSE_CHART_AXIS_TEXT_TREND_CLASS)}>
              <span className="w-[4.45rem] text-center whitespace-nowrap">{selectionLabelParts[0]}</span>
              <span aria-hidden="true" className="px-0.5">-</span>
              <span className="w-[4.45rem] text-center whitespace-nowrap">{selectionLabelParts[1]}</span>
            </div>
          ) : (
            <p className={cn('mx-auto w-[10.6rem] pt-1 text-center tabular-nums', HOUSE_CHART_AXIS_TEXT_TREND_CLASS)}>
              {selectionLabel}
            </p>
          )}
        </div>
        {trailingContent ? (
          <div className="shrink-0 pt-0.5">
            {trailingContent}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CitationActivationHistoryChart({
  points,
  seriesMode = 'default',
}: {
  points: Array<{
    key: string
    label: string
    timeMs: number
    newlyActiveCount: number
    stillActiveCount: number
    inactiveCount: number
    totalCount: number
  }>
  seriesMode?: CitationActivationHistorySeriesMode
}) {
  if (!points.length) {
    return (
      <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">No activation history is available yet.</p>
      </div>
    )
  }

  const orderedPoints = points.slice().sort((left, right) => left.timeMs - right.timeMs)
  const startMs = orderedPoints[0]?.timeMs ?? Date.now()
  const endMs = orderedPoints[orderedPoints.length - 1]?.timeMs ?? startMs
  const pointSpacingMonths = orderedPoints.length > 1
    ? Math.max(1, getSpanMonths(orderedPoints[0].timeMs, orderedPoints[1].timeMs))
    : 12
  const usesMonthlyPoints = pointSpacingMonths <= 2
  const visibleSpanMonths = Math.max(0, getSpanMonths(startMs, endMs))
  const yAxisTickValues = [0, 50, 100]
  const yAxisTickRatios = yAxisTickValues.map((tick) => tick / 100)
  const gridTickRatiosWithoutTop = yAxisTickRatios.filter((ratio) => ratio < 0.999)
  const hasTopYAxisTick = yAxisTickRatios.some((ratio) => ratio >= 0.999)
  const xAxisTicks = buildLineTicksFromRange(startMs, endMs, usesMonthlyPoints && visibleSpanMonths <= 18 ? '1y' : 'all')
  const xAxisLabelLayout = buildChartAxisLayout({
    axisLabels: xAxisTicks.map((tick) => tick.label),
    axisSubLabels: xAxisTicks.map((tick) => tick.subLabel || null),
    showXAxisName: true,
    xAxisName: usesMonthlyPoints ? 'Completed month' : 'Publication year',
    dense: false,
    maxLabelLines: 2,
    maxSubLabelLines: 2,
    maxAxisNameLines: 2,
  })
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(yAxisTickValues, true, 1.2)
  const yAxisTitleLeft = '36%'
  const chartTopInsetRem = PUBLICATIONS_CHART_TOP_INSET_REM
  const chartLeftInset = `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${chartTopInsetRem}rem`,
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${xAxisLabelLayout.axisBottomRem}rem`,
    minHeight: `${xAxisLabelLayout.axisMinHeightRem}rem`,
  }
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${chartTopInsetRem}rem`,
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
    width: `${yAxisPanelWidthRem}rem`,
  }
  const chartFrameStyle = {
    paddingBottom: `${xAxisLabelLayout.framePaddingBottomRem}rem`,
    minHeight: '20rem',
  }
  const yAxisTickOffsetRem = PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM
  const lineModeVerticalGridPercents = xAxisTicks
    .map((tick) => Math.max(0, Math.min(100, tick.leftPct)))
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.5)
  const seriesPoints = orderedPoints.map((point) => {
    const position = endMs <= startMs
      ? 50
      : Math.max(0, Math.min(100, ((point.timeMs - startMs) / Math.max(1, endMs - startMs)) * 100))
    const totalCount = Math.max(0, point.totalCount)
    const newlyActivePct = totalCount > 0 ? Math.max(0, Math.min(100, (point.newlyActiveCount / totalCount) * 100)) : 0
    const stillActivePct = totalCount > 0 ? Math.max(0, Math.min(100, (point.stillActiveCount / totalCount) * 100)) : 0
    const inactivePct = totalCount > 0 ? Math.max(0, Math.min(100, (point.inactiveCount / totalCount) * 100)) : 0
    return {
      key: point.key,
      xPct: position,
      timeMs: point.timeMs,
      label: point.label,
      totalCount,
      newlyActivePct,
      stillActivePct,
      activePct: Math.max(0, Math.min(100, newlyActivePct + stillActivePct)),
      inactivePct,
      newlyActiveCount: point.newlyActiveCount,
      stillActiveCount: point.stillActiveCount,
      activeCount: point.newlyActiveCount + point.stillActiveCount,
      inactiveCount: point.inactiveCount,
    }
  })
  const series = seriesMode === 'activeInactive'
    ? [
      {
        key: 'active',
        label: 'Active',
        color: 'hsl(var(--tone-accent-500))',
        strokeWidth: 2,
        strokeDasharray: undefined,
        opacity: 1,
        selector: (point: typeof seriesPoints[number]) => point.activePct,
      },
      {
        key: 'inactive',
        label: 'Inactive',
        color: 'hsl(var(--tone-danger-500))',
        strokeWidth: 1.6,
        strokeDasharray: '5 4',
        opacity: 0.8,
        selector: (point: typeof seriesPoints[number]) => point.inactivePct,
      },
    ] as const
    : [
      {
        key: 'newly-active',
        label: 'Newly active',
        color: 'hsl(var(--tone-positive-500))',
        strokeWidth: 1.9,
        strokeDasharray: undefined,
        opacity: 1,
        selector: (point: typeof seriesPoints[number]) => point.newlyActivePct,
      },
      {
        key: 'still-active',
        label: 'Still active',
        color: 'hsl(var(--tone-accent-500))',
        strokeWidth: 1.9,
        strokeDasharray: undefined,
        opacity: 0.95,
        selector: (point: typeof seriesPoints[number]) => point.stillActivePct,
      },
      {
        key: 'inactive',
        label: 'Inactive',
        color: 'hsl(var(--tone-danger-500))',
        strokeWidth: 1.6,
        strokeDasharray: '5 4',
        opacity: 0.8,
        selector: (point: typeof seriesPoints[number]) => point.inactivePct,
      },
    ] as const
  const seriesPaths = series.map((item) => {
    const pathPoints = seriesPoints
      .map((point) => ({
        x: Math.max(0, Math.min(100, point.xPct)),
        y: Math.max(0, Math.min(100, 100 - item.selector(point))),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    return {
      ...item,
      pathPoints,
      path: pathPoints.length ? monotonePathFromPoints(pathPoints) : '',
    }
  })
  const tooltipSlices = seriesPoints.map((point, index) => {
    if (seriesPoints.length === 1) {
      return {
        ...point,
        leftPct: 0,
        widthPct: 100,
      }
    }
    const previousX = index > 0 ? seriesPoints[index - 1]?.xPct ?? point.xPct : point.xPct
    const nextX = index < seriesPoints.length - 1 ? seriesPoints[index + 1]?.xPct ?? point.xPct : point.xPct
    const leftPct = index === 0 ? 0 : (previousX + point.xPct) / 2
    const rightPct = index === seriesPoints.length - 1 ? 100 : (point.xPct + nextX) / 2
    return {
      ...point,
      leftPct: Math.max(0, Math.min(100, leftPct)),
      widthPct: Math.max(0.75, Math.min(100, rightPct - leftPct)),
    }
  })
  const latestPoint = seriesPoints[seriesPoints.length - 1] || null
  const latestSeriesPoints = latestPoint
    ? seriesMode === 'activeInactive'
      ? [
        {
          key: 'active',
          color: 'hsl(var(--tone-accent-500))',
          value: latestPoint.activePct,
        },
        {
          key: 'inactive',
          color: 'hsl(var(--tone-danger-500))',
          value: latestPoint.inactivePct,
        },
      ]
      : [
        {
          key: 'newly-active',
          color: 'hsl(var(--tone-positive-500))',
          value: latestPoint.newlyActivePct,
        },
        {
          key: 'still-active',
          color: 'hsl(var(--tone-accent-500))',
          value: latestPoint.stillActivePct,
        },
        {
          key: 'inactive',
          color: 'hsl(var(--tone-danger-500))',
          value: latestPoint.inactivePct,
        },
      ]
    : []
  const citationActivityEntryRevealIdBase = useId().replace(/:/g, '')
  const citationActivityEntryRevealClipId = `${citationActivityEntryRevealIdBase}-clip`
  const [citationActivityEntryRevealActive, setCitationActivityEntryRevealActive] = useState(false)
  const [citationActivityEntryRevealProgress, setCitationActivityEntryRevealProgress] = useState(0)
  const citationActivityEntryRevealWidth = Math.max(0, Math.min(100, 100 * citationActivityEntryRevealProgress))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCitationActivityEntryRevealActive(false)
      setCitationActivityEntryRevealProgress(1)
      return
    }

    const entryDelayMs = 120
    const entryDurationMs = 940
    let raf = 0
    const startedAt = performance.now()
    const easeEntryReveal = (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress))
      return clamped * clamped * (3 - (2 * clamped))
    }

    setCitationActivityEntryRevealActive(true)
    setCitationActivityEntryRevealProgress(0)

    const step = (now: number) => {
      const elapsed = now - startedAt
      if (elapsed < entryDelayMs) {
        setCitationActivityEntryRevealProgress(0)
        raf = window.requestAnimationFrame(step)
        return
      }
      const progress = Math.min(1, (elapsed - entryDelayMs) / entryDurationMs)
      const easedProgress = easeEntryReveal(progress)
      setCitationActivityEntryRevealProgress(easedProgress)
      if (progress >= 1) {
        setCitationActivityEntryRevealActive(false)
      } else {
        raf = window.requestAnimationFrame(step)
      }
    }

    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-col px-2 py-2">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
          'house-publications-trend-chart-frame-borderless',
        )}
        style={chartFrameStyle}
      >
        <div className="absolute overflow-visible" style={plotAreaStyle}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              className={cn('absolute inset-y-0 left-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderLeft: '1px solid hsl(var(--stroke-soft) / 0.7)' }}
            />
            {gridTickRatiosWithoutTop.map((ratio, index) => (
              <div
                key={`citation-activation-history-grid-y-${index}`}
                className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{
                  bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                  borderTop: `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`,
                }}
              />
            ))}
            {hasTopYAxisTick ? (
              <div
                className={cn('absolute inset-x-0 top-0', HOUSE_CHART_GRID_LINE_SUBTLE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
                style={{ borderTop: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
              />
            ) : null}
            <div
              className={cn('absolute inset-y-0 right-0', HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ borderRight: '1px solid hsl(var(--stroke-soft) / 0.76)' }}
              aria-hidden="true"
            />
            {lineModeVerticalGridPercents.length ? (
              <svg className="absolute inset-0 z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="crispEdges">
                {lineModeVerticalGridPercents.map((leftPct, index) => (
                  <line
                    key={`citation-activation-history-grid-x-${index}`}
                    x1={String(leftPct)}
                    y1="0"
                    x2={String(leftPct)}
                    y2="100"
                    stroke="hsl(var(--stroke-soft) / 0.76)"
                    strokeWidth="1"
                    shapeRendering="crispEdges"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            ) : null}
          </div>
          <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <clipPath id={citationActivityEntryRevealClipId} clipPathUnits="userSpaceOnUse">
                  <rect x="0" y="0" width={citationActivityEntryRevealWidth} height="100" />
                </clipPath>
              </defs>
              <g clipPath={citationActivityEntryRevealActive ? `url(#${citationActivityEntryRevealClipId})` : undefined}>
                {seriesPaths.map((item) => item.path ? (
                  item.strokeDasharray ? (
                    <path
                      key={`${item.key}-path`}
                      d={item.path}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={String(item.strokeWidth)}
                      strokeDasharray={item.strokeDasharray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={item.opacity}
                    />
                  ) : (
                    <path
                      key={`${item.key}-path`}
                      d={item.path}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={String(item.strokeWidth)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={item.opacity}
                    />
                  )
                ) : null)}
                {latestPoint ? latestSeriesPoints.map((item) => (
                  <circle
                    key={`${item.key}-latest`}
                    cx={String(Math.max(0, Math.min(100, latestPoint.xPct)))}
                    cy={String(Math.max(0, Math.min(100, 100 - item.value)))}
                    r="1.1"
                    fill={item.color}
                    stroke="white"
                    strokeWidth="0.6"
                    vectorEffect="non-scaling-stroke"
                    opacity={1}
                  />
                )) : null}
              </g>
            </svg>
          </div>
          <TooltipProvider delayDuration={120}>
            <div className="absolute inset-0 z-[4]">
              {tooltipSlices.map((point) => (
                <Tooltip key={point.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="absolute inset-y-0 block rounded-[0.2rem] bg-transparent transition-[background-color,box-shadow] hover:bg-[hsl(var(--tone-neutral-400)/0.14)] hover:shadow-[inset_1px_0_0_hsl(var(--stroke-soft)/0.95),inset_-1px_0_0_hsl(var(--stroke-soft)/0.95)] focus-visible:bg-[hsl(var(--tone-neutral-400)/0.16)] focus-visible:shadow-[inset_1px_0_0_hsl(var(--stroke-soft)),inset_-1px_0_0_hsl(var(--stroke-soft))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-200))]"
                      style={{
                        left: `${point.leftPct}%`,
                        width: `${point.widthPct}%`,
                      }}
                      aria-label={
                        seriesMode === 'activeInactive'
                          ? `Citation activity in ${usesMonthlyPoints ? formatMonthYearLabel(point.timeMs) : point.label}: ${Math.round(point.activePct)}% active and ${Math.round(point.inactivePct)}% inactive`
                          : `Citation activity in ${usesMonthlyPoints ? formatMonthYearLabel(point.timeMs) : point.label}: ${Math.round(point.newlyActivePct)}% newly active, ${Math.round(point.stillActivePct)}% still active, ${Math.round(point.inactivePct)}% inactive`
                      }
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="center"
                    sideOffset={8}
                    className="house-approved-tooltip z-[80] max-w-[18rem] whitespace-normal px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-[hsl(var(--tone-neutral-900))]">
                        {usesMonthlyPoints ? formatMonthYearLabel(point.timeMs) : point.label}
                      </p>
                      <p>{`${formatInt(point.totalCount)} publications in cohort`}</p>
                      {seriesMode === 'activeInactive' ? (
                        <div className="space-y-0.5">
                          <p>{`Active: ${Math.round(point.activePct)}% (${formatInt(point.activeCount)} publications)`}</p>
                          <p>{`Inactive: ${Math.round(point.inactivePct)}% (${formatInt(point.inactiveCount)} publications)`}</p>
                          <p>{`Active split: ${formatInt(point.newlyActiveCount)} newly active, ${formatInt(point.stillActiveCount)} still active publications`}</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <p>{`Newly active: ${Math.round(point.newlyActivePct)}% (${formatInt(point.newlyActiveCount)} publications)`}</p>
                          <p>{`Still active: ${Math.round(point.stillActivePct)}% (${formatInt(point.stillActiveCount)} publications)`}</p>
                          <p>{`Inactive: ${Math.round(point.inactivePct)}% (${formatInt(point.inactiveCount)} publications)`}</p>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>

        <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
          {yAxisTickValues.map((tickValue, index) => {
            const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
            const tickRatioKey = Math.round((yAxisTickRatios[index] || 0) * 1000)
            return (
              <p
                key={`citation-activation-history-y-axis-${tickRatioKey}`}
                className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                style={{ bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)` }}
              >
                {tickValue}%
              </p>
            )
          })}
          <p
            className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
            style={{ left: yAxisTitleLeft }}
          >
            Share of cohort
          </p>
        </div>

        <div
          className={cn('pointer-events-none absolute', HOUSE_TOGGLE_CHART_LABEL_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
          style={xAxisTicksStyle}
        >
          {xAxisTicks.map((tick) => {
            const isNearLeftEdge = tick.leftPct <= 2
            const isNearRightEdge = tick.leftPct >= 98
            return (
              <div
                key={tick.key}
                className={cn(
                  'house-chart-axis-period-item absolute top-0 leading-none text-center',
                  HOUSE_CHART_SCALE_TICK_CLASS,
                )}
                style={{
                  left: `${tick.leftPct}%`,
                  transform: isNearLeftEdge
                    ? 'translateX(0)'
                    : isNearRightEdge
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
                }}
              >
                <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>{tick.label}</p>
              </div>
            )
          })}
        </div>

        <div
          className="pointer-events-none absolute"
          style={{
            left: chartLeftInset,
            right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
            bottom: `${xAxisLabelLayout.xAxisNameBottomRem}rem`,
            minHeight: `${xAxisLabelLayout.xAxisNameMinHeightRem}rem`,
          }}
        >
          <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
            Publication year
          </p>
        </div>
      </div>
    </div>
  )
}

function CitationEfficiencyComparisonPanel({
  title,
  subtitle,
  bare = false,
  metrics,
}: {
  title?: string
  subtitle?: string
  bare?: boolean
  metrics: Array<{ label: string; value: string; raw: number | null }>
}) {
  const maxRaw = Math.max(
    1,
    ...metrics.map((metric) => Math.max(0, Number(metric.raw || 0))),
  )
  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      {title || subtitle ? (
        <div className="space-y-1">
          {title ? <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p> : null}
          {subtitle ? <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p> : null}
        </div>
      ) : null}
      <div className="space-y-3">
        {metrics.map((metric, index) => {
          const ratioPct = Math.max(0, Math.min(100, ((metric.raw || 0) / maxRaw) * 100))
          const toneClass = index === 0
            ? HOUSE_CHART_BAR_POSITIVE_CLASS
            : index === 1
              ? HOUSE_CHART_BAR_ACCENT_CLASS
              : HOUSE_CHART_BAR_WARNING_CLASS
          return (
            <div key={metric.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'leading-tight')}>{metric.label}</p>
                <p className={cn(HOUSE_DRILLDOWN_STAT_VALUE_CLASS, 'text-right tabular-nums')}>{metric.value}</p>
              </div>
              <div className={cn(HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS, 'h-[0.7rem]')}>
                <div
                  className={cn('h-full rounded-full', toneClass)}
                  style={{ width: `${ratioPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type CanonicalTableColumn = {
  key: string
  label: ReactNode
  align?: 'left' | 'center' | 'right'
  width?: string
}

const H_INDEX_CANDIDATE_TABLE_COLUMNS: CanonicalTableColumn[] = [
  { key: 'paper', label: 'Paper' },
  { key: 'current', label: 'Current', align: 'center', width: '4.25rem' },
  { key: 'gap', label: 'Gap', align: 'center', width: '3.5rem' },
  { key: 'projected', label: '12m proj.', align: 'center', width: '5.5rem' },
  { key: 'outlook', label: 'Outlook', align: 'center', width: '6.75rem' },
]

function DrilldownNarrativeCard({
  eyebrow,
  title,
  body,
  note,
}: {
  eyebrow?: string
  title: string
  body: string
  note?: string
}) {
  return (
    <div className={cn(HOUSE_SURFACE_STRONG_PANEL_CLASS, 'space-y-2 px-3 py-3')}>
      {eyebrow ? <p className={HOUSE_DRILLDOWN_OVERLINE_CLASS}>{eyebrow}</p> : null}
      <div className="space-y-1.5">
        <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p>
        <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-sm leading-6 text-[hsl(var(--tone-neutral-700))]')}>{body}</p>
      </div>
      {note ? (
        <p className="text-caption text-[hsl(var(--tone-neutral-600))]">{note}</p>
      ) : null}
    </div>
  )
}

function getPublicationInsightsSection(
  payload: PublicationInsightsAgentPayload | null | undefined,
  key: PublicationInsightsSectionKey,
) {
  if (!payload || !Array.isArray(payload.sections)) {
    return null
  }
  const match = payload.sections.find((section) => section?.key === key)
  return match || null
}

function readInsightEvidenceNumber(
  payload: PublicationInsightsAgentPayload | null | undefined,
  key: PublicationInsightsSectionKey,
  evidenceKey: string,
): number | null {
  const section = getPublicationInsightsSection(payload, key)
  const evidence = section?.evidence
  if (!evidence || typeof evidence !== 'object') {
    return null
  }
  const rawValue = (evidence as Record<string, unknown>)[evidenceKey]
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? parsed : null
}

function readInsightEvidenceString(
  payload: PublicationInsightsAgentPayload | null | undefined,
  key: PublicationInsightsSectionKey,
  evidenceKey: string,
): string {
  const section = getPublicationInsightsSection(payload, key)
  const evidence = section?.evidence
  if (!evidence || typeof evidence !== 'object') {
    return ''
  }
  return String((evidence as Record<string, unknown>)[evidenceKey] || '').trim()
}

function PublicationInsightsTriggerButton({
  ariaLabel,
  active = false,
  onClick,
}: {
  ariaLabel: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-[var(--elevation-xs)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-200))]',
        active
          ? 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-100)/0.95)]'
          : 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-neutral-50)/0.96)] hover:border-[hsl(var(--tone-accent-400))] hover:bg-[hsl(var(--tone-accent-50)/0.96)]',
      )}
    >
      <InsightsGlyph className="h-4 w-4" />
    </button>
  )
}

function PublicationInsightsCallout({
  payload,
  sectionKey,
  loading = false,
  error = '',
  actions = [],
  onClose,
}: {
  payload: PublicationInsightsAgentPayload | null
  sectionKey: PublicationInsightsSectionKey
  loading?: boolean
  error?: string
  actions?: PublicationInsightAction[]
  onClose: () => void
}) {
  const section = getPublicationInsightsSection(payload, sectionKey)
  const usesPositiveTone = sectionKey === 'uncited_works' || sectionKey === 'citation_activation' || sectionKey === 'citation_activation_history'
  const title = String(
    section?.headline
    || section?.title
    || (sectionKey === 'uncited_works'
      ? 'Uncited publications'
      : sectionKey === 'citation_activation'
        ? 'Citation activation'
        : sectionKey === 'citation_activation_history'
          ? 'Activation over time'
          : sectionKey === 'publication_production_phase'
            ? 'Production phase'
          : sectionKey === 'publication_volume_over_time'
            ? 'Publication volume over time'
          : sectionKey === 'publication_article_type_over_time'
            ? 'Type of articles published over time'
          : sectionKey === 'publication_type_over_time'
            ? 'Type of publications published over time'
          : sectionKey === 'publication_output_pattern'
            ? 'Publication output pattern'
            : 'Citation concentration'),
  ).trim()
  const considerationLabel = String(section?.consideration_label || '').trim() || 'Why this matters'
  const consideration = String(section?.consideration || '').trim()
  const generatedAt = String(((payload?.provenance as Record<string, unknown> | undefined) || {})['generated_at'] || '').trim()
  const showLoading = loading && !section && !error

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[1.1rem] border px-4 py-4',
        'border-[hsl(var(--tone-neutral-250))] bg-white',
        'shadow-[0_30px_70px_-34px_rgba(15,23,42,0.42)]',
      )}
      role="dialog"
      aria-label="Deeper insights"
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          usesPositiveTone ? 'bg-[hsl(var(--tone-positive-400))]' : 'bg-[hsl(var(--tone-accent-400))]',
        )}
      />
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--tone-neutral-200))] pb-2.5">
          <div className="space-y-1">
            <p className="text-[1rem] font-semibold leading-6 text-[hsl(var(--tone-neutral-950))]">{title}</p>
            <p className="max-w-[20rem] text-[0.72rem] leading-5 text-[hsl(var(--tone-neutral-600))]">
              {generatedAt
                ? 'Based on your latest publication metrics.'
                : 'Based on your current publication metrics.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white text-[hsl(var(--tone-neutral-700))] transition-colors focus-visible:outline-none focus-visible:ring-2',
                usesPositiveTone
                  ? 'hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50))] hover:text-[hsl(var(--tone-positive-700))] focus-visible:ring-[hsl(var(--tone-positive-200))]'
                  : 'hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))] focus-visible:ring-[hsl(var(--tone-accent-200))]',
              )}
              aria-label="Close deeper insights"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        {showLoading ? (
          <div className="space-y-2.5 py-1">
            <div className="h-3 w-4/5 rounded-full bg-[hsl(var(--tone-neutral-200))]" />
            <div className="h-3 w-full rounded-full bg-[hsl(var(--tone-neutral-200))]" />
            <div className="h-3 w-3/4 rounded-full bg-[hsl(var(--tone-neutral-200))]" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2.5">
            <p className="text-sm leading-6 text-[hsl(var(--tone-danger-700))]">{error}</p>
          </div>
        ) : section ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-[0.94rem] leading-7 text-[hsl(var(--tone-neutral-800))]')}>{section.body}</p>
            </div>
            {consideration ? (
              <div
                className={cn(
                  'rounded-[0.95rem] border px-3.5 py-3',
                  usesPositiveTone
                    ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))]'
                    : 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]',
                )}
              >
                <div
                  className={cn(
                    'space-y-1 border-l-2 pl-3',
                    usesPositiveTone ? 'border-[hsl(var(--tone-positive-400))]' : 'border-[hsl(var(--tone-accent-400))]',
                  )}
                >
                  <p className={cn(HOUSE_DRILLDOWN_STAT_TITLE_CLASS, usesPositiveTone ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-accent-700))]')}>{considerationLabel}</p>
                  <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-sm leading-6 text-[hsl(var(--tone-neutral-700))]')}>{consideration}</p>
                </div>
              </div>
            ) : null}
            {actions.length ? (
              <div className="space-y-1.5 border-t border-[hsl(var(--tone-neutral-200))] pt-3.5">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--tone-neutral-500))]">Explore next</p>
                <div className="grid gap-2">
                  {actions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        action.onSelect()
                      }}
                      className={cn(
                        'group flex items-center justify-between gap-3 rounded-[0.95rem] border px-3 py-2.5 text-left transition-colors',
                        'border-[hsl(var(--tone-neutral-200))] bg-white',
                        usesPositiveTone
                          ? 'hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50))] focus-visible:ring-[hsl(var(--tone-positive-200))]'
                          : 'hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] focus-visible:ring-[hsl(var(--tone-accent-200))]',
                        'focus-visible:outline-none focus-visible:ring-2',
                      )}
                    >
                      <div className="space-y-0.5 pr-2">
                        <p className="text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))]">{action.label}</p>
                        <p className="text-[0.72rem] leading-5 text-[hsl(var(--tone-neutral-600))]">{action.description}</p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                          usesPositiveTone
                            ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))] group-hover:border-[hsl(var(--tone-positive-300))] group-hover:bg-[hsl(var(--tone-positive-100))]'
                            : 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-700))] group-hover:border-[hsl(var(--tone-accent-300))] group-hover:bg-[hsl(var(--tone-accent-100))]',
                        )}
                      >
                        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-sm leading-6 text-[hsl(var(--tone-neutral-700))]')}>
            No insight copy is available yet for this section.
          </p>
        )}
      </div>
    </div>
  )
}

function StaticPublicationInsightsCallout({
  title,
  body,
  considerationLabel = 'Why this matters',
  consideration = '',
  actions = [],
  onClose,
  usesPositiveTone = false,
}: {
  title: string
  body: string
  considerationLabel?: string
  consideration?: string
  actions?: PublicationInsightAction[]
  onClose: () => void
  usesPositiveTone?: boolean
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[1.1rem] border px-4 py-4',
        'border-[hsl(var(--tone-neutral-250))] bg-white',
        'shadow-[0_30px_70px_-34px_rgba(15,23,42,0.42)]',
      )}
      role="dialog"
      aria-label="Deeper insights"
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1',
          usesPositiveTone ? 'bg-[hsl(var(--tone-positive-400))]' : 'bg-[hsl(var(--tone-accent-400))]',
        )}
      />
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--tone-neutral-200))] pb-2.5">
          <div className="space-y-1">
            <p className="text-[1rem] font-semibold leading-6 text-[hsl(var(--tone-neutral-950))]">{title}</p>
            <p className="max-w-[20rem] text-[0.72rem] leading-5 text-[hsl(var(--tone-neutral-600))]">
              Based on your current h-index metrics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white text-[hsl(var(--tone-neutral-700))] transition-colors focus-visible:outline-none focus-visible:ring-2',
                usesPositiveTone
                  ? 'hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50))] hover:text-[hsl(var(--tone-positive-700))] focus-visible:ring-[hsl(var(--tone-positive-200))]'
                  : 'hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))] focus-visible:ring-[hsl(var(--tone-accent-200))]',
              )}
              aria-label="Close deeper insights"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-[0.94rem] leading-7 text-[hsl(var(--tone-neutral-800))]')}>{body}</p>
          </div>
          {consideration ? (
            <div
              className={cn(
                'rounded-[0.95rem] border px-3.5 py-3',
                usesPositiveTone
                  ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))]'
                  : 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]',
              )}
            >
              <div
                className={cn(
                  'space-y-1 border-l-2 pl-3',
                  usesPositiveTone ? 'border-[hsl(var(--tone-positive-400))]' : 'border-[hsl(var(--tone-accent-400))]',
                )}
              >
                <p className={cn(HOUSE_DRILLDOWN_STAT_TITLE_CLASS, usesPositiveTone ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-accent-700))]')}>{considerationLabel}</p>
                <p className={cn(HOUSE_METRIC_NARRATIVE_CLASS, 'text-sm leading-6 text-[hsl(var(--tone-neutral-700))]')}>{consideration}</p>
              </div>
            </div>
          ) : null}
          {actions.length ? (
            <div className="space-y-1.5 border-t border-[hsl(var(--tone-neutral-200))] pt-3.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--tone-neutral-500))]">Explore next</p>
              <div className="grid gap-2">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      action.onSelect()
                    }}
                    className={cn(
                      'group flex items-center justify-between gap-3 rounded-[0.95rem] border px-3 py-2.5 text-left transition-colors',
                      'border-[hsl(var(--tone-neutral-200))] bg-white',
                      usesPositiveTone
                        ? 'hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50))] focus-visible:ring-[hsl(var(--tone-positive-200))]'
                        : 'hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] focus-visible:ring-[hsl(var(--tone-accent-200))]',
                      'focus-visible:outline-none focus-visible:ring-2',
                    )}
                  >
                    <div className="space-y-0.5 pr-2">
                      <p className="text-sm font-medium leading-5 text-[hsl(var(--tone-neutral-900))]">{action.label}</p>
                      <p className="text-[0.72rem] leading-5 text-[hsl(var(--tone-neutral-600))]">{action.description}</p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                        usesPositiveTone
                          ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))] group-hover:border-[hsl(var(--tone-positive-300))] group-hover:bg-[hsl(var(--tone-positive-100))]'
                          : 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-700))] group-hover:border-[hsl(var(--tone-accent-300))] group-hover:bg-[hsl(var(--tone-accent-100))]',
                      )}
                    >
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StaticPublicationInsightsOverlay({
  open,
  title,
  body,
  considerationLabel,
  consideration,
  actions = [],
  onClose,
  usesPositiveTone = false,
}: {
  open: boolean
  title: string
  body: string
  considerationLabel?: string
  consideration?: string
  actions?: PublicationInsightAction[]
  onClose: () => void
  usesPositiveTone?: boolean
}) {
  if (!open) {
    return null
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close deeper insights"
        className="fixed inset-0 z-40 cursor-default bg-[hsl(var(--tone-neutral-950)/0.08)] backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 top-24 z-[70] flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-[26rem]">
          <StaticPublicationInsightsCallout
            title={title}
            body={body}
            considerationLabel={considerationLabel}
            consideration={consideration}
            actions={actions}
            onClose={onClose}
            usesPositiveTone={usesPositiveTone}
          />
        </div>
      </div>
    </>
  )
}

function PublicationLinkTable({
  nameColumnLabel,
  metricColumnLabel,
  secondaryMetricColumnLabel,
  rows,
  onOpenPublication,
  emptyMessage,
}: {
  nameColumnLabel: string
  metricColumnLabel?: string
  secondaryMetricColumnLabel?: string
  rows: Array<{
    key: string
    label: string
    year: number | null
    metricValue?: string
    secondaryMetricValue?: string
    workId: string
  }>
  onOpenPublication?: (workId: string) => void
  emptyMessage: string
}) {
  return (
    <div className="w-full overflow-visible">
      <div
        className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
        style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
      >
        <table
          className="w-full border-collapse"
          data-house-no-column-resize="true"
          data-house-no-column-controls="true"
        >
          <thead className="house-table-head">
            <tr>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">
                {nameColumnLabel}
              </th>
              <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                Year
              </th>
              {metricColumnLabel ? (
                <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                  {metricColumnLabel}
                </th>
              ) : null}
              {secondaryMetricColumnLabel ? (
                <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                  {secondaryMetricColumnLabel}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[hsl(var(--stroke-soft)/0.55)] last:border-b-0">
                <td className="house-table-cell-text px-2 py-0">
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    disabled={!onOpenPublication}
                    className={cn(
                      'block w-full px-0 py-2 text-left transition-colors duration-[var(--motion-duration-ui)] ease-out',
                      onOpenPublication
                        ? 'cursor-pointer text-[hsl(var(--tone-accent-700))] hover:text-[hsl(var(--tone-accent-800))] hover:underline focus-visible:outline-none focus-visible:underline'
                        : 'cursor-default text-[hsl(var(--tone-neutral-700))]',
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!onOpenPublication) {
                        return
                      }
                      onOpenPublication(row.workId)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <span className="block max-w-full break-words leading-snug">{row.label}</span>
                  </button>
                </td>
                <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                  {row.year === null ? '\u2014' : String(row.year)}
                </td>
                {metricColumnLabel ? (
                  <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                    {row.metricValue ?? '\u2014'}
                  </td>
                ) : null}
                {secondaryMetricColumnLabel ? (
                  <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                    {row.secondaryMetricValue ?? '\u2014'}
                  </td>
                ) : null}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS)} colSpan={2 + (metricColumnLabel ? 1 : 0) + (secondaryMetricColumnLabel ? 1 : 0)}>
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CanonicalTablePanel({
  title,
  subtitle,
  columns,
  rows,
  bare = false,
  variant = 'default',
  suppressTopRowHighlight = false,
  emptyMessage = 'No rows available.',
}: {
  title?: string
  subtitle?: string
  columns: CanonicalTableColumn[]
  rows: Array<{ key: string; cells: Record<string, ReactNode> }>
  bare?: boolean
  variant?: 'default' | 'drilldown'
  suppressTopRowHighlight?: boolean
  emptyMessage?: string
}) {
  const alignClassName = (align: CanonicalTableColumn['align']) => {
    switch (align) {
      case 'center':
        return 'text-center'
      case 'right':
        return 'text-right'
      default:
        return 'text-left'
    }
  }

  if (variant === 'drilldown') {
    return (
      <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
        {title || subtitle ? (
          <div className="space-y-1">
            {title ? <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p> : null}
            {subtitle ? <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p> : null}
          </div>
        ) : null}
        <div className="w-full overflow-visible">
          <div
            className={cn(
              HOUSE_SURFACE_TABLE_SHELL_CLASS,
              'house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background',
              suppressTopRowHighlight && 'house-publications-trend-table-shell-no-top-highlight',
            )}
            style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
          >
            <table
              className="w-full border-collapse"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <thead className={HOUSE_SURFACE_TABLE_HEAD_CLASS}>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        'house-table-head-text h-10 px-2 align-middle font-semibold whitespace-nowrap',
                        alignClassName(column.align),
                      )}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.key} className={HOUSE_SURFACE_TABLE_ROW_CLASS}>
                      {columns.map((column) => (
                        <td
                          key={`${row.key}-${column.key}`}
                          className={cn(
                            'house-table-cell-text px-2 py-2 align-top leading-snug',
                            alignClassName(column.align),
                            column.width ? 'whitespace-nowrap tabular-nums' : '',
                          )}
                        >
                          {row.cells[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS)} colSpan={columns.length}>
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      {title || subtitle ? (
        <div className="space-y-1">
          {title ? <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p> : null}
          {subtitle ? <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p> : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[1rem] border border-[hsl(var(--stroke-soft)/0.78)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-surface-100)/0.9)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('house-table-head-text px-2 py-2 font-semibold whitespace-nowrap', alignClassName(column.align))}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.key} className="border-b border-[hsl(var(--stroke-soft)/0.55)] last:border-b-0">
                  {columns.map((column) => (
                    <td
                      key={`${row.key}-${column.key}`}
                      className={cn(
                        'house-table-cell-text px-2 py-2 align-top leading-snug',
                        alignClassName(column.align),
                      )}
                    >
                      {row.cells[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS)} colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatPercentWhole(value: number): string {
  return `${Math.round(Number.isFinite(value) ? value : 0)}%`
}

function formatPercentOne(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(1)}%`
}

function allocateWholePercentages(values: number[]): number[] {
  const safeValues = values.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0))
  const floors = safeValues.map((value) => Math.floor(value))
  let remainder = Math.max(0, 100 - floors.reduce((sum, value) => sum + value, 0))
  const rankedFractions = safeValues
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction
      }
      return left.index - right.index
    })
  const output = [...floors]
  for (const item of rankedFractions) {
    if (remainder <= 0) {
      break
    }
    output[item.index] += 1
    remainder -= 1
  }
  return output
}

function formatRoundedOneDecimalTrimmed(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatSignedNumber(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '\u2014'
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`
}

function formatTrajectoryMovingAverageValue(value: number): string {
  return formatRoundedOneDecimalTrimmed(Number.isFinite(value) ? value : 0)
}

function buildTrajectoryTooltipAriaLabel(
  slice: PublicationTrajectoryTooltipSlice,
  mode: PublicationTrajectoryMode,
  movingAveragePeriodLabel: string,
): string {
  if (mode === 'moving_avg') {
    return `Trajectory in ${slice.year}: 3-year average ending ${movingAveragePeriodLabel} is ${formatTrajectoryMovingAverageValue(slice.movingAvgValue)}`
  }
  if (mode === 'cumulative') {
    return `Trajectory in ${slice.year}: cumulative through ${slice.year} is ${formatInt(slice.cumulativeValue)}`
  }
  return `Trajectory in ${slice.year}: ${formatInt(slice.rawValue)} publications`
}

function resolvePublicationVolumeYAxisLabel({
  windowMode,
  visualMode,
  publicationRecords,
  tile,
}: {
  windowMode: PublicationsWindowMode
  visualMode: PublicationTrendsVisualMode
  publicationRecords: PublicationDrilldownRecord[]
  tile: PublicationMetricTilePayload
}): string {
  if (visualMode === 'bars') {
    switch (windowMode) {
      case '1y':
        return 'Publications (per month)'
      case '3y':
      case '5y':
        return 'Publications (per year)'
      default: {
        const chartData = (tile.chart_data || {}) as Record<string, unknown>
        const years = toNumberArray(chartData.years).map((value) => Math.round(value))
        const projectedYearRaw = Number(chartData.projected_year)
        const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : null
        const uniqueYears = new Set(years.filter((value) => Number.isFinite(value)))
        if (projectedYear !== null) {
          uniqueYears.add(projectedYear)
        }
        const bucketYears = selectPublicationBucketSize(Math.max(0, uniqueYears.size))
        return bucketYears <= 1
          ? 'Publications (per year)'
          : `Publications (per ${formatInt(bucketYears)}-year period)`
      }
    }
  }

  if (windowMode === '1y') {
    return 'Publications (1 year)'
  }
  if (windowMode === '3y') {
    return 'Publications (3 years)'
  }
  if (windowMode === '5y') {
    return 'Publications (5 years)'
  }

  const now = new Date()
  const earliestRecordDateMs = publicationRecords
    .map((record) => (
      typeof record.year === 'number' && Number.isFinite(record.year)
        ? Date.UTC(Math.round(record.year), 0, 1)
        : null
    ))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)[0] ?? null

  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((value) => Math.round(value))
  const earliestChartYear = years.length ? Math.min(...years) : null
  const fallbackDateMs = earliestChartYear !== null ? Date.UTC(earliestChartYear, 0, 1) : null
  const startDateMs = earliestRecordDateMs ?? fallbackDateMs
  if (startDateMs === null) {
    return 'Publications'
  }
  const yearsCovered = Math.max(0.1, (now.getTime() - startDateMs) / (365.25 * 24 * 60 * 60 * 1000))
  return `Publications (${formatRoundedOneDecimalTrimmed(yearsCovered)} years)`
}

function resolveCitationVolumeYAxisLabel({
  windowMode,
  visualMode,
  publicationRecords,
  tile,
}: {
  windowMode: PublicationsWindowMode
  visualMode: PublicationTrendsVisualMode
  publicationRecords: PublicationDrilldownRecord[]
  tile: PublicationMetricTilePayload
}): string {
  if (visualMode === 'bars') {
    switch (windowMode) {
      case '1y':
        return 'Citations (per month)'
      case '3y':
      case '5y':
        return 'Citations (per year)'
      default: {
        const chartData = (tile.chart_data || {}) as Record<string, unknown>
        const years = toNumberArray(chartData.years).map((value) => Math.round(value))
        const projectedYearRaw = Number(chartData.projected_year)
        const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : null
        const uniqueYears = new Set(years.filter((value) => Number.isFinite(value)))
        if (projectedYear !== null) {
          uniqueYears.add(projectedYear)
        }
        const bucketYears = selectPublicationBucketSize(Math.max(0, uniqueYears.size))
        return bucketYears <= 1
          ? 'Citations (per year)'
          : `Citations (per ${formatInt(bucketYears)}-year period)`
      }
    }
  }

  if (windowMode === '1y') {
    return 'Citations (1 year)'
  }
  if (windowMode === '3y') {
    return 'Citations (3 years)'
  }
  if (windowMode === '5y') {
    return 'Citations (5 years)'
  }

  const now = new Date()
  const earliestRecordDateMs = publicationRecords
    .map((record) => (
      typeof record.year === 'number' && Number.isFinite(record.year)
        ? Date.UTC(Math.round(record.year), 0, 1)
        : null
    ))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)[0] ?? null

  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((value) => Math.round(value))
  const earliestChartYear = years.length ? Math.min(...years) : null
  const fallbackDateMs = earliestChartYear !== null ? Date.UTC(earliestChartYear, 0, 1) : null
  const startDateMs = earliestRecordDateMs ?? fallbackDateMs
  if (startDateMs === null) {
    return 'Citations'
  }
  const yearsCovered = Math.max(0.1, (now.getTime() - startDateMs) / (365.25 * 24 * 60 * 60 * 1000))
  return `Citations (${formatRoundedOneDecimalTrimmed(yearsCovered)} years)`
}

function buildCitationVolumeTableRows(
  tile: PublicationMetricTilePayload,
  windowMode: PublicationsWindowMode,
): Array<{ key: string; periodLabel: string; citations: string; change: ReactNode; projected?: boolean }> {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>

  const renderCitationChangeCell = (
    currentValue: number,
    previousValue: number | null,
    suppress = false,
  ): ReactNode => {
    if (suppress || previousValue === null) {
      return '\u2014'
    }
    const safeCurrent = Math.max(0, currentValue)
    const safePrevious = Math.max(0, previousValue)
    const delta = safeCurrent - safePrevious
    const percentDelta = safePrevious > 0
      ? (delta / safePrevious) * 100
      : (safeCurrent > 0 ? null : 0)
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
    const toneClass = delta > 0
      ? 'text-[hsl(var(--tone-positive-700))]'
      : delta < 0
        ? 'text-[hsl(var(--tone-danger-700))]'
        : 'text-[hsl(var(--tone-neutral-700))]'
    const percentLabel = percentDelta === null
      ? 'new'
      : `${delta >= 0 ? '+' : ''}${Math.round(percentDelta)}%`
    return (
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums', toneClass)}>
        <span aria-hidden="true">{arrow}</span>
        <span>{`${delta >= 0 ? '+' : ''}${formatInt(Math.abs(delta))}`.replace('+0', '0').replace('-0', '0')}</span>
        <span className="opacity-70">{`(${percentLabel})`}</span>
      </span>
    )
  }

  if (windowMode === '1y') {
    const sourceValues = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
    const sourceLabels = toStringArray(chartData.month_labels_12m)
    const currentMonthIndex = new Date().getUTCMonth()
    const sourceLastMonthIndex = sourceLabels.length ? parseMonthIndex(sourceLabels[sourceLabels.length - 1]) : null
    const sourceLikelyIncludesCurrentMonth = sourceLastMonthIndex !== null && sourceLastMonthIndex === currentMonthIndex
    const sourceValuesWindow = sourceValues.length >= 13 && sourceLikelyIncludesCurrentMonth
      ? sourceValues.slice(-13, -1)
      : sourceValues.length >= 12
        ? sourceValues.slice(-12)
        : sourceValues
    const values12 = sourceValuesWindow.length >= 12
      ? sourceValuesWindow.slice(-12)
      : sourceValues.length > 0
        ? [...Array.from({ length: 12 - sourceValuesWindow.length }, () => 0), ...sourceValuesWindow]
        : Array.from({ length: 12 }, () => 0)
    const monthStarts12 = buildTrailingMonthStarts(12, true)
    return values12.map((value, index) => ({
      key: `citation-month-${index}`,
      periodLabel: formatMonthYearLabel(monthStarts12[index]?.getTime() ?? Date.now()),
      citations: formatInt(Math.round(Math.max(0, value))),
      change: renderCitationChangeCell(
        Math.round(Math.max(0, value)),
        index > 0 ? Math.round(Math.max(0, values12[index - 1] ?? 0)) : null,
      ),
    }))
  }

  const lifetimeValues = toNumberArray(chartData.monthly_values_lifetime).map((item) => Math.max(0, item))
  const lifetimeLabels = toStringArray(chartData.month_labels_lifetime)
  const fallbackMonthStarts = buildTrailingMonthStarts(lifetimeValues.length, true)
  const yearlyTotals = new Map<number, number>()
  lifetimeValues.forEach((value, index) => {
    const parsed = parseIsoMonthStart(lifetimeLabels[index] || '')
    const monthStart = parsed || fallbackMonthStarts[index] || null
    if (!monthStart) {
      return
    }
    const year = monthStart.getUTCFullYear()
    yearlyTotals.set(year, (yearlyTotals.get(year) || 0) + Math.max(0, value))
  })

  const nowYear = new Date().getUTCFullYear()
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedValueRaw = Number(chartData.projected_value)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : nowYear
  if (Number.isFinite(currentYearYtdRaw)) {
    yearlyTotals.set(projectedYear, Math.max(0, currentYearYtdRaw))
  }

  const dedupedBars = Array.from(yearlyTotals.entries())
    .map(([year, value]) => ({
      year,
      value: Math.max(0, value),
      current: year === projectedYear,
    }))
    .sort((left, right) => left.year - right.year)

  const currentYearBars = dedupedBars.filter((bar) => bar.current)
  const completedYearBars = dedupedBars.filter((bar) => !bar.current)
  const visibleBars = windowMode === '3y'
    ? [...completedYearBars.slice(-3), ...currentYearBars]
    : windowMode === '5y'
      ? [...completedYearBars.slice(-5), ...currentYearBars]
      : dedupedBars
  const rows: Array<{ key: string; periodLabel: string; citations: string; change: ReactNode; projected?: boolean }> = []
  visibleBars.forEach((bar) => {
    const completedIndex = completedYearBars.findIndex((entry) => entry.year === bar.year)
    const previousCompletedYearValue = bar.current
      ? (completedYearBars.length
        ? Math.round(Math.max(0, completedYearBars[completedYearBars.length - 1]?.value ?? 0))
        : null)
      : (completedIndex > 0
        ? Math.round(Math.max(0, completedYearBars[completedIndex - 1]?.value ?? 0))
        : null)
    if (bar.current && Number.isFinite(projectedValueRaw)) {
      rows.push({
        key: `citation-year-${bar.year}-projected`,
        periodLabel: `${bar.year} projected`,
        citations: formatInt(Math.round(Math.max(0, projectedValueRaw))),
        change: renderCitationChangeCell(
          Math.round(Math.max(0, projectedValueRaw)),
          previousCompletedYearValue,
        ),
        projected: true,
      })
    }
    rows.push({
      key: `citation-year-${bar.year}`,
      periodLabel: bar.current ? `${bar.year} YTD` : String(bar.year),
      citations: formatInt(Math.round(Math.max(0, bar.value))),
      change: renderCitationChangeCell(
        Math.round(Math.max(0, bar.value)),
        previousCompletedYearValue,
        bar.current,
      ),
    })
  })
  return rows
}

function renderMomentumDrilldownSection({
  tile,
  activeTab,
  stats,
  momentumInsightOpen,
  onToggleMomentumInsight,
  onOpenPublication,
  momentumWindowMode,
  onMomentumWindowModeChange,
  momentumYearBreakdown,
  momentumOverviewViewMode,
  onMomentumOverviewViewModeChange,
  tileToggleMotionReady,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  stats: MomentumDrilldownStats
  momentumInsightOpen: boolean
  onToggleMomentumInsight: () => void
  onOpenPublication?: (workId: string) => void
  momentumWindowMode: MomentumWindowMode
  onMomentumWindowModeChange: (next: MomentumWindowMode) => void
  momentumYearBreakdown: MomentumYearBreakdown | null
  momentumOverviewViewMode: SplitBreakdownViewMode
  onMomentumOverviewViewModeChange: (next: SplitBreakdownViewMode) => void
  tileToggleMotionReady: boolean
}): ReactNode {
  const renderMomentumOverviewTableHeader = (periodLabel: string) => (
    <span className="inline-flex flex-col whitespace-normal leading-tight">
      <span>{periodLabel}</span>
      <span className="font-medium normal-case tracking-normal text-[hsl(var(--tone-neutral-600))]">(Avg/month)</span>
    </span>
  )

  if (activeTab === 'summary') {
    const currentUtcMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const lastCompleteMonthStart = shiftUtcMonth(currentUtcMonthStart, -1)
    const recent3WindowStart = shiftUtcMonth(lastCompleteMonthStart, -2)
    const prior9WindowStart = shiftUtcMonth(lastCompleteMonthStart, -11)
    const recent1yWindowStart = shiftUtcMonth(lastCompleteMonthStart, -11)
    const prior4yWindowStart = new Date(Date.UTC(currentUtcMonthStart.getUTCFullYear() - 5, 0, 1))
    const useYearMode = momentumWindowMode === '5y' && Boolean(momentumYearBreakdown?.bars.length)
    const recentPace = useYearMode
      ? momentumYearBreakdown?.rate1y ?? 0
      : stats.monthlyValues12m.length >= 3
        ? stats.monthlyValues12m.slice(-3).reduce((sum, value) => sum + Math.max(0, value), 0) / 3
        : 0
    const priorPace = useYearMode
      ? momentumYearBreakdown?.rate4y ?? 0
      : stats.monthlyValues12m.length >= 12
        ? stats.monthlyValues12m.slice(-12, -3).reduce((sum, value) => sum + Math.max(0, value), 0) / 9
        : 0
    const paceUnitLabel = useYearMode ? '/year' : '/month'
    const recentPeriodCountLabel = useYearMode ? 'Recent 1y' : 'Recent 3m'
    const priorPeriodCountLabel = useYearMode ? 'Prior 4y' : 'Prior 9m'
    const momentumOverviewRows = stats.publications
      .slice()
      .filter((publication) => {
        const publicationMonthStart = parsePublicationMonthStart(publication.publicationMonthStart, publication.year)
        const recentTotal = useYearMode ? publication.recent1yCitations : publication.recent3mCitations
        const priorTotal = useYearMode ? (publication.prior4yCitations ?? 0) : publication.prior9mCitations
        const recentComparable = isMomentumWindowComparable(
          publicationMonthStart,
          useYearMode ? recent1yWindowStart : recent3WindowStart,
        )
        const priorComparable = isMomentumWindowComparable(
          publicationMonthStart,
          useYearMode ? prior4yWindowStart : prior9WindowStart,
        )
        const recentMonths = useYearMode ? 12 : 3
        const priorMonths = useYearMode ? 48 : 9
        const recentDisplayedValue = roundMomentumOverviewValue(recentTotal / recentMonths)
        const priorDisplayedValue = roundMomentumOverviewValue(priorTotal / priorMonths)
        if (!recentComparable && !priorComparable) {
          return false
        }
        if (recentComparable && !priorComparable && recentDisplayedValue <= 0) {
          return false
        }
        if (!recentComparable && priorComparable && priorDisplayedValue <= 0) {
          return false
        }
        return recentDisplayedValue > 0 || priorDisplayedValue > 0
      })
      .sort((left, right) => {
        const leftPublicationMonthStart = parsePublicationMonthStart(left.publicationMonthStart, left.year)
        const rightPublicationMonthStart = parsePublicationMonthStart(right.publicationMonthStart, right.year)
        const leftRecentTotal = useYearMode ? left.recent1yCitations : left.recent3mCitations
        const rightRecentTotal = useYearMode ? right.recent1yCitations : right.recent3mCitations
        const leftRecentMonths = useYearMode ? 12 : 3
        const rightRecentMonths = useYearMode ? 12 : 3
        const leftPriorTotal = useYearMode ? (left.prior4yCitations ?? 0) : left.prior9mCitations
        const rightPriorTotal = useYearMode ? (right.prior4yCitations ?? 0) : right.prior9mCitations
        const leftPriorMonths = useYearMode ? 48 : 9
        const rightPriorMonths = useYearMode ? 48 : 9
        const leftRecentWindowStart = useYearMode ? recent1yWindowStart : recent3WindowStart
        const rightRecentWindowStart = useYearMode ? recent1yWindowStart : recent3WindowStart
        const leftPriorWindowStart = useYearMode ? prior4yWindowStart : prior9WindowStart
        const rightPriorWindowStart = useYearMode ? prior4yWindowStart : prior9WindowStart
        const leftIsNotComparable = !isMomentumWindowComparable(leftPublicationMonthStart, leftRecentWindowStart)
          || !isMomentumWindowComparable(leftPublicationMonthStart, leftPriorWindowStart)
        const rightIsNotComparable = !isMomentumWindowComparable(rightPublicationMonthStart, rightRecentWindowStart)
          || !isMomentumWindowComparable(rightPublicationMonthStart, rightPriorWindowStart)
        const toneRank = (tone: MomentumRecentCellTone): number => {
          switch (tone) {
            case 'positive':
              return 0
            case 'accent':
              return 1
            case 'danger':
              return 2
            default:
              return 3
          }
        }
        const leftTone = getMomentumRecentCellTone({
          recentTotalCitations: leftRecentTotal,
          recentMonths: leftRecentMonths,
          priorTotalCitations: leftPriorTotal,
          priorMonths: leftPriorMonths,
          isNotComparable: leftIsNotComparable,
        })
        const rightTone = getMomentumRecentCellTone({
          recentTotalCitations: rightRecentTotal,
          recentMonths: rightRecentMonths,
          priorTotalCitations: rightPriorTotal,
          priorMonths: rightPriorMonths,
          isNotComparable: rightIsNotComparable,
        })
        const rankDifference = toneRank(leftTone) - toneRank(rightTone)
        if (rankDifference !== 0) {
          return rankDifference
        }
        const leftDelta = Math.abs((leftRecentTotal / leftRecentMonths) - (leftPriorTotal / leftPriorMonths))
        const rightDelta = Math.abs((rightRecentTotal / rightRecentMonths) - (rightPriorTotal / rightPriorMonths))
        if (Math.abs(rightDelta - leftDelta) > 1e-6) {
          return rightDelta - leftDelta
        }
        return rightRecentTotal - leftRecentTotal
      })
    return (
      <>
        <div
          className="house-publications-drilldown-bounded-section relative"
          style={{ border: '0', background: 'transparent', padding: '0' }}
        >
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <div
              className={cn(
                HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS,
                'house-publications-headline-metric-grid mt-0 w-full grid-cols-2 md:grid-cols-4',
              )}
              style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
            >
              {[
                { label: 'Momentum index', value: formatInt(stats.momentumIndex) },
                { label: 'State', value: renderMomentumStateBanner(stats.state) },
                {
                  label: useYearMode ? 'Recent 1y citation avg' : 'Recent 3m citation avg',
                  value: `${formatMomentumOverviewTick(recentPace)}${paceUnitLabel}`,
                },
                {
                  label: useYearMode ? 'Prior 4y citation avg' : 'Prior 9m citation avg',
                  value: `${formatMomentumOverviewTick(priorPace)}${paceUnitLabel}`,
                },
                { label: 'Tracked papers', value: formatInt(stats.trackedPapers) },
              ].map((metricTile) => (
                <div key={metricTile.label} className={HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS}>
                  <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, HOUSE_DRILLDOWN_STAT_TITLE_CLASS)}>{metricTile.label}</p>
                  <div className={HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS}>
                    {typeof metricTile.value === 'string' || typeof metricTile.value === 'number' ? (
                      <p className={cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums')}>{metricTile.value}</p>
                    ) : (
                      metricTile.value
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={cn('house-publications-drilldown-bounded-section relative', 'border-0 bg-transparent px-0 py-0')}>
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
            <HelpTooltipIconButton
              ariaLabel="Explain momentum overview"
              content={formatMomentumOverviewTooltip(stats)}
            />
            <PublicationInsightsTriggerButton
              ariaLabel="Open momentum overview insight"
              active={momentumInsightOpen}
              onClick={onToggleMomentumInsight}
            />
          </div>
          <div className="house-drilldown-heading-block">
            <div className="space-y-3 pr-16">
              <p className="house-drilldown-heading-block-title">How has citation pace changed recently?</p>
              <div className="flex items-center justify-between gap-3">
                <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                  <div
                    className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
                    data-stop-tile-open="true"
                  >
                    <span
                      className={HOUSE_TOGGLE_THUMB_CLASS}
                      style={buildTileToggleThumbStyle(momentumWindowMode === '5y' ? 1 : 0, 2, !tileToggleMotionReady)}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      data-stop-tile-open="true"
                      className={cn(
                        HOUSE_TOGGLE_BUTTON_CLASS,
                        momentumWindowMode === '12m' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (momentumWindowMode === '12m') {
                          return
                        }
                        onMomentumWindowModeChange('12m')
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      aria-pressed={momentumWindowMode === '12m'}
                    >
                      1y
                    </button>
                    <button
                      type="button"
                      data-stop-tile-open="true"
                      className={cn(
                        HOUSE_TOGGLE_BUTTON_CLASS,
                        momentumWindowMode === '5y' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (momentumWindowMode === '5y') {
                          return
                        }
                        onMomentumWindowModeChange('5y')
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      aria-pressed={momentumWindowMode === '5y'}
                    >
                      5y
                    </button>
                  </div>
                </div>
                <SplitBreakdownViewToggle
                  value={momentumOverviewViewMode}
                  onChange={onMomentumOverviewViewModeChange}
                />
              </div>
            </div>
          </div>
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <div className="min-h-[11rem]">
              {momentumOverviewViewMode === 'bar' ? (
                <MomentumOverviewChart tile={tile} mode={momentumWindowMode} yearBreakdown={momentumYearBreakdown} />
              ) : (
                <CanonicalTablePanel
                  bare
                  variant="drilldown"
                  suppressTopRowHighlight
                  columns={[
                    { key: 'paper', label: 'Paper' },
                    { key: 'recent', label: renderMomentumOverviewTableHeader(recentPeriodCountLabel), align: 'center', width: '1%' },
                    { key: 'prior', label: renderMomentumOverviewTableHeader(priorPeriodCountLabel), align: 'center', width: '1%' },
                  ]}
                  rows={momentumOverviewRows.map((publication) => {
                    const publicationMonthStart = parsePublicationMonthStart(
                      publication.publicationMonthStart,
                      publication.year,
                    )
                    const recentTotalCitations = useYearMode ? publication.recent1yCitations : publication.recent3mCitations
                    const recentMonths = useYearMode ? 12 : 3
                    const priorTotalCitations = useYearMode ? (publication.prior4yCitations ?? 0) : publication.prior9mCitations
                    const priorMonths = useYearMode ? 48 : 9
                    const recentWindowStart = useYearMode ? recent1yWindowStart : recent3WindowStart
                    const priorWindowStart = useYearMode ? prior4yWindowStart : prior9WindowStart
                    const isNotComparable = !isMomentumWindowComparable(publicationMonthStart, recentWindowStart)
                      || !isMomentumWindowComparable(publicationMonthStart, priorWindowStart)
                    const recentTone = getMomentumRecentCellTone({
                      recentTotalCitations,
                      recentMonths,
                      priorTotalCitations,
                      priorMonths,
                      isNotComparable,
                    })
                    return {
                      key: `momentum-overview-${publication.workId}`,
                      cells: {
                      paper: onOpenPublication ? (
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className="block w-full text-left text-[hsl(var(--tone-accent-700))] transition-colors duration-[var(--motion-duration-ui)] ease-out hover:text-[hsl(var(--tone-accent-800))] hover:underline focus-visible:outline-none focus-visible:underline"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenPublication(publication.workId)
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <span className="block max-w-full break-words leading-snug">{publication.title}</span>
                        </button>
                      ) : (
                        <span className="block max-w-full break-words leading-snug">{publication.title}</span>
                      ),
                      recent: (
                        <span
                          className={cn(
                            'inline-flex min-w-[4.35rem] items-center justify-center rounded-md border px-2 py-1 text-center font-medium tabular-nums',
                            getMomentumRecentCellTintClass(recentTone),
                          )}
                        >
                          {formatMomentumTableAverageValue({
                            totalCitations: recentTotalCitations,
                            months: recentMonths,
                            publicationMonthStart,
                            windowStart: recentWindowStart,
                          })}
                        </span>
                      ),
                      prior: formatMomentumTableAverageValue({
                        totalCitations: priorTotalCitations,
                        months: priorMonths,
                        publicationMonthStart,
                        windowStart: priorWindowStart,
                      }),
                    },
                  }})}
                  emptyMessage="No papers recorded citations in the selected comparison windows."
                />
              )}
            </div>
          </div>
        </div>

        <div className="house-publications-drilldown-bounded-section relative">
          <div className="absolute right-2 top-2 z-10">
            <HelpTooltipIconButton
              ariaLabel="Explain what is driving this"
              content={formatMomentumContributorsTooltip({
                ...stats,
                topContributors: stats.topContributors.slice(0, 3),
              })}
            />
          </div>
          <div className="house-drilldown-heading-block">
            <p className="house-drilldown-heading-block-title">Which papers explain the change?</p>
          </div>
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <CanonicalTablePanel
              bare
              variant="drilldown"
              suppressTopRowHighlight
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'shift', label: 'Shift', align: 'center', width: '1%' },
                { key: 'delta', label: 'Delta', align: 'center', width: '1%' },
              ]}
              rows={stats.topContributors.slice(0, 3).map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: onOpenPublication ? (
                    <button
                      type="button"
                      data-stop-tile-open="true"
                      className="block w-full text-left text-[hsl(var(--tone-accent-700))] transition-colors duration-[var(--motion-duration-ui)] ease-out hover:text-[hsl(var(--tone-accent-800))] hover:underline focus-visible:outline-none focus-visible:underline"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenPublication(publication.workId)
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <span className="block max-w-full break-words leading-snug">{publication.title}</span>
                    </button>
                  ) : (
                    <span className="block max-w-full break-words leading-snug">{publication.title}</span>
                  ),
                  shift: publication.prior9mAvg !== null && publication.recent3mAvg !== null
                    ? `${formatMomentumOverviewTick(publication.prior9mAvg)} -> ${formatMomentumOverviewTick(publication.recent3mAvg)}`
                    : '\u2014',
                  delta: (
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        publication.shiftDelta === null
                          ? 'text-[hsl(var(--tone-neutral-600))]'
                          : publication.shiftDelta >= 0
                          ? 'text-[hsl(var(--tone-positive-700))]'
                          : 'text-[hsl(var(--tone-danger-700))]',
                      )}
                    >
                      {publication.shiftDelta === null ? '\u2014' : formatSignedNumber(publication.shiftDelta, 1)}
                    </span>
                  ),
                },
              }))}
              emptyMessage="No momentum-shift drivers available."
            />
          </div>
        </div>
      </>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="house-publications-drilldown-bounded-section relative">
        <div className="absolute right-2 top-2 z-10">
          <HelpTooltipIconButton
            ariaLabel="Explain momentum contributors"
            content={formatMomentumContributorsTooltip(stats)}
          />
        </div>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Momentum contributors</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <CanonicalTablePanel
            bare
            variant="drilldown"
            suppressTopRowHighlight
            columns={[
              { key: 'paper', label: 'Paper' },
              { key: 'recent', label: '12m cites', align: 'center', width: '1%' },
              { key: 'contribution', label: 'Contribution', align: 'center', width: '1%' },
              { key: 'confidence', label: 'Confidence', align: 'center', width: '1%' },
              { key: 'venue', label: 'Venue' },
            ]}
            rows={stats.topContributors.map((publication) => ({
              key: publication.workId,
              cells: {
                paper: publication.title,
                recent: formatInt(publication.citationsLast12m),
                contribution: publication.momentumContribution.toFixed(1),
                confidence: publication.confidenceLabel,
                venue: publication.venue || '\u2014',
              },
            }))}
            emptyMessage="No paper-level momentum contributors available."
          />
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section relative">
        <div className="absolute right-2 top-2 z-10">
          <HelpTooltipIconButton
            ariaLabel="Explain momentum trajectory"
            content={formatMomentumTrajectoryTooltip(stats)}
          />
        </div>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Trajectory inputs</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <CanonicalTablePanel
            bare
            variant="drilldown"
            suppressTopRowHighlight
            columns={[
              { key: 'measure', label: 'Measure' },
              { key: 'value', label: 'Value', align: 'center', width: '1%' },
              { key: 'note', label: 'Interpretation' },
            ]}
            rows={[
              {
                key: 'months',
                cells: {
                  measure: 'Monthly points',
                  value: formatInt(stats.monthlyValues12m.length),
                  note: 'Observed monthly citation additions in the active 12-month view.',
                },
              },
              {
                key: 'weighted',
                cells: {
                  measure: 'Weighted monthly points',
                  value: formatInt(stats.weightedMonthlyValues12m.length),
                  note: 'Recency-weighted monthly series used where available.',
                },
              },
              {
                key: 'current',
                cells: {
                  measure: 'Current score',
                  value: stats.recentScore12m === null ? '\u2014' : stats.recentScore12m.toFixed(1),
                  note: 'Most recent active-window score.',
                },
              },
              {
                key: 'previous',
                cells: {
                  measure: 'Previous score',
                  value: stats.previousScore12m === null ? '\u2014' : stats.previousScore12m.toFixed(1),
                  note: 'Prior baseline score for comparison.',
                },
              },
            ]}
          />
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section relative">
        <div className="absolute right-2 top-2 z-10">
          <HelpTooltipIconButton
            ariaLabel="Explain momentum context"
            content={formatMomentumContextTooltip(stats)}
          />
        </div>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Momentum context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <CanonicalTablePanel
            bare
            variant="drilldown"
            suppressTopRowHighlight
            columns={[
              { key: 'measure', label: 'Measure' },
              { key: 'value', label: 'Value', align: 'center', width: '1%' },
              { key: 'note', label: 'Interpretation' },
            ]}
            rows={[
              {
                key: 'tracked',
                cells: {
                  measure: 'Tracked papers',
                  value: formatInt(stats.trackedPapers),
                  note: 'Papers with usable citation history for the momentum calculation.',
                },
              },
              ...stats.confidenceBuckets.map((bucket) => ({
                key: `confidence-${bucket.label}`,
                cells: {
                  measure: `${bucket.label} confidence`,
                  value: formatInt(bucket.count),
                  note: 'Match quality or enrichment confidence bucket.',
                },
              })),
            ]}
            emptyMessage="No confidence context available."
          />
        </div>
      </div>
    )
  }

  return null
}

function renderFieldPercentileDrilldownSection({
  activeTab,
  stats,
  tile,
  threshold,
  onThresholdChange,
  toggleMotionReady,
}: {
  activeTab: DrilldownTab
  stats: FieldPercentileShareDrilldownStats
  tile: PublicationMetricTilePayload
  threshold: FieldPercentileThreshold
  onThresholdChange: (next: FieldPercentileThreshold) => void
  toggleMotionReady: boolean
}): ReactNode {
  const activeThreshold = stats.thresholds.includes(threshold) ? threshold : stats.defaultThreshold
  const activeThresholdIndex = Math.max(0, stats.thresholds.indexOf(activeThreshold))
  const activeThresholdRow = stats.thresholdRows.find((row) => row.threshold === activeThreshold) || stats.thresholdRows[0]
  const toggleControl = (
    <div
      className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-5 w-full max-w-[13.5rem]')}
      style={{ gridTemplateColumns: `repeat(${stats.thresholds.length}, minmax(0, 1fr))` }}
      data-stop-tile-open="true"
    >
      <span
        className={cn(HOUSE_TOGGLE_THUMB_CLASS, `house-toggle-thumb-threshold-${activeThreshold}`)}
        style={buildTileToggleThumbStyle(activeThresholdIndex, stats.thresholds.length, !toggleMotionReady)}
        aria-hidden="true"
      />
      {stats.thresholds.map((option) => (
        <button
          key={`drilldown-field-threshold-${option}`}
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            'inline-flex h-full w-full min-h-0 flex-1 items-center justify-center px-0 py-0',
            activeThreshold === option ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
          )}
          onClick={(event) => {
            event.stopPropagation()
            if (activeThreshold === option) {
              return
            }
            onThresholdChange(option)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-pressed={activeThreshold === option}
        >
          {option}
        </button>
      ))}
    </div>
  )

  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Field percentile overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`At the ${activeThreshold}% threshold, ${formatInt(activeThresholdRow?.paperCount || 0)} papers sit above the benchmark line.`}
              body="This drilldown summarises how much of the benchmarked portfolio reaches or exceeds field-normalised percentile thresholds. It is a benchmarked-share view, not a raw citation-count view."
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Threshold selector</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Use the percentile ladder to inspect increasingly selective benchmark cut-offs.</p>
              </div>
              <div className="min-h-[12rem]">
                <FieldPercentilePanel tile={tile} threshold={activeThreshold} toggleControl={toggleControl} />
              </div>
            </div>
            <CanonicalTablePanel
              title="Threshold ladder"
              subtitle="Canonical benchmarked share at each available percentile threshold."
              columns={[
                { key: 'threshold', label: 'Threshold' },
                { key: 'papers', label: 'Papers', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
              ]}
              rows={stats.thresholdRows.map((row) => ({
                key: String(row.threshold),
                cells: {
                  threshold: `${row.threshold}%`,
                  papers: formatInt(row.paperCount),
                  share: formatPercentOne(row.sharePct),
                },
              }))}
              emptyMessage="No benchmark thresholds available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Benchmarked fields and papers</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Benchmark strength is distributed across fields and standout papers."
              body="The field table shows where benchmark coverage is concentrated, while the paper table surfaces the strongest field-normalised performers in the benchmarked set."
            />
            <CanonicalTablePanel
              title="Field coverage table"
              subtitle="Primary fields represented in the benchmarked publication set."
              columns={[
                { key: 'field', label: 'Field' },
                { key: 'papers', label: 'Papers', align: 'center', width: '1%' },
                { key: 'median', label: 'Median rank', align: 'center', width: '1%' },
              ]}
              rows={stats.topFields.map((field) => ({
                key: field.fieldName,
                cells: {
                  field: field.fieldName,
                  papers: formatInt(field.paperCount),
                  median: field.medianPercentileRank === null ? '\u2014' : formatInt(field.medianPercentileRank),
                },
              }))}
              emptyMessage="No benchmarked fields available."
            />
            <CanonicalTablePanel
              title="Top benchmarked papers"
              subtitle="Highest percentile-ranked papers in the benchmarked set."
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'rank', label: 'Percentile', align: 'center', width: '1%' },
                { key: 'field', label: 'Field' },
                { key: 'cohort', label: 'Cohort', align: 'center', width: '1%' },
                { key: 'sample', label: 'Cohort size', align: 'center', width: '1%' },
              ]}
              rows={stats.topPublications.map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: publication.title,
                  rank: publication.fieldPercentileRank === null ? '\u2014' : formatInt(publication.fieldPercentileRank),
                  field: publication.fieldName,
                  cohort: publication.cohortYear === null ? '\u2014' : formatInt(publication.cohortYear),
                  sample: publication.cohortSampleSize === null ? '\u2014' : formatInt(publication.cohortSampleSize),
                },
              }))}
              emptyMessage="No benchmarked papers available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Threshold trajectory</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Field percentile share currently behaves like a threshold ladder rather than a time line."
              body="The canonical payload ships selective percentile thresholds, so the trajectory discussion is about how the portfolio behaves as the benchmark becomes stricter, not about year-by-year movement."
            />
            <CanonicalTablePanel
              title="Threshold progression table"
              subtitle="How benchmarked share tightens as the percentile threshold becomes more selective."
              columns={[
                { key: 'threshold', label: 'Threshold' },
                { key: 'papers', label: 'Papers', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
                { key: 'interpretation', label: 'Interpretation' },
              ]}
              rows={stats.thresholdRows.map((row) => ({
                key: `trajectory-${row.threshold}`,
                cells: {
                  threshold: `${row.threshold}%`,
                  papers: formatInt(row.paperCount),
                  share: formatPercentOne(row.sharePct),
                  interpretation: row.threshold >= 95
                    ? 'Highly selective benchmark tier.'
                    : row.threshold >= 90
                      ? 'Top-decile performance signal.'
                      : 'Broader benchmark coverage tier.',
                },
              }))}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Benchmark context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Coverage and cohort size determine how much weight to place on the benchmarked share."
              body="This context table summarises how much of the portfolio is benchmarked and how large the comparison cohorts are, which are the two main caveats for reading percentile-share metrics well."
            />
            <CanonicalTablePanel
              title="Benchmark context table"
              subtitle="Coverage and cohort information for the field-percentile benchmark."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'evaluated',
                  cells: {
                    measure: 'Evaluated papers',
                    value: formatInt(stats.evaluatedPapers),
                    meaning: 'Papers with a usable field-year cohort match.',
                  },
                },
                {
                  key: 'coverage',
                  cells: {
                    measure: 'Coverage',
                    value: formatPercentWhole(stats.coveragePct),
                    meaning: 'Share of the total portfolio that can be benchmarked.',
                  },
                },
                {
                  key: 'median',
                  cells: {
                    measure: 'Median percentile rank',
                    value: stats.medianPercentileRank === null ? '\u2014' : formatInt(stats.medianPercentileRank),
                    meaning: 'Central benchmarked position of the evaluated papers.',
                  },
                },
                {
                  key: 'cohorts',
                  cells: {
                    measure: 'Cohort count / median size',
                    value: `${stats.cohortCount === null ? '\u2014' : formatInt(stats.cohortCount)} / ${stats.cohortMedianSampleSize === null ? '\u2014' : formatInt(stats.cohortMedianSampleSize)}`,
                    meaning: 'Breadth and typical size of the benchmark cohorts in use.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

function renderAuthorshipDrilldownSection({
  activeTab,
  stats,
  tile,
}: {
  activeTab: DrilldownTab
  stats: AuthorshipCompositionDrilldownStats
  tile: PublicationMetricTilePayload
}): ReactNode {
  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Authorship overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`Leadership share currently sits at ${formatPercentWhole(stats.leadershipIndexPct)}.`}
              body="This drilldown summarises contribution position rather than scale or influence. Leadership share and median author position together describe where the portfolio tends to sit in the author list."
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Role mix</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Current role composition across the authored publication set.</p>
              </div>
              <div className="min-h-[11rem]">
                <AuthorshipStructurePanel tile={tile} />
              </div>
            </div>
            <CanonicalTablePanel
              title="Authorship readout"
              subtitle="Canonical summary of leadership, role mix, and author-order position."
              columns={[
                { key: 'role', label: 'Measure' },
                { key: 'count', label: 'Count', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
              ]}
              rows={[
                ...stats.roleRows.map((row) => ({
                  key: row.key,
                  cells: {
                    role: row.label,
                    count: formatInt(row.count),
                    share: formatPercentOne(row.sharePct),
                  },
                })),
                {
                  key: 'median-position',
                  cells: {
                    role: 'Median author position',
                    count: stats.medianAuthorPositionDisplay,
                    share: '\u2014',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Leadership papers</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Leadership roles can be traced to specific papers."
              body="The table below focuses on first and senior authored papers so the authorship mix can be tied back to concrete outputs rather than percentages alone."
            />
            <CanonicalTablePanel
              title="Top leadership papers"
              subtitle="First and senior authored papers ranked by lifetime citation depth."
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'role', label: 'Role', align: 'center', width: '1%' },
                { key: 'citations', label: 'Citations', align: 'center', width: '1%' },
                { key: 'year', label: 'Year', align: 'center', width: '1%' },
                { key: 'type', label: 'Type' },
              ]}
              rows={stats.topLeadershipPapers.map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: publication.title,
                  role: publication.role,
                  citations: formatInt(publication.citations),
                  year: publication.year === null ? '\u2014' : formatInt(publication.year),
                  type: publication.publicationType,
                },
              }))}
              emptyMessage="No leadership-designated papers available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Structural role trajectory</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Authorship composition is currently a structural snapshot."
              body="The canonical payload captures the current role mix, not a role-by-year history. This tab therefore records the structure of that mix and its coverage rather than plotting a time trend."
            />
            <CanonicalTablePanel
              title="Role structure table"
              subtitle="Current role structure used for the headline leadership index."
              columns={[
                { key: 'role', label: 'Role' },
                { key: 'count', label: 'Count', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
                { key: 'note', label: 'Interpretation' },
              ]}
              rows={stats.roleRows.map((row) => ({
                key: `trajectory-${row.key}`,
                cells: {
                  role: row.label,
                  count: formatInt(row.count),
                  share: formatPercentOne(row.sharePct),
                  note: row.key === 'leadership' ? 'Combined first and senior authored share.' : 'Observed role share within the total publication set.',
                },
              }))}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Coverage context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Authorship interpretation depends on metadata completeness."
              body="Unknown roles and missing author-order positions directly affect how much confidence to place in the leadership and median-position summaries."
            />
            <CanonicalTablePanel
              title="Coverage table"
              subtitle="Metadata coverage supporting the authorship composition headline."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'known-roles',
                  cells: {
                    measure: 'Known roles',
                    value: formatInt(stats.knownRoleCount),
                    meaning: 'Papers with usable role labels.',
                  },
                },
                {
                  key: 'unknown-roles',
                  cells: {
                    measure: 'Unknown roles',
                    value: formatInt(stats.unknownRoleCount),
                    meaning: 'Papers present in the portfolio but lacking usable role labels.',
                  },
                },
                {
                  key: 'known-positions',
                  cells: {
                    measure: 'Known author positions',
                    value: formatInt(stats.knownPositionCount),
                    meaning: 'Coverage base for the median author-position statistic.',
                  },
                },
                {
                  key: 'median',
                  cells: {
                    measure: 'Median author position',
                    value: stats.medianAuthorPositionDisplay,
                    meaning: 'Typical author-order placement across papers with known position metadata.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

function renderCollaborationDrilldownSection({
  activeTab,
  stats,
  tile,
}: {
  activeTab: DrilldownTab
  stats: CollaborationStructureDrilldownStats
  tile: PublicationMetricTilePayload
}): ReactNode {
  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Collaboration overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`The collaboration network currently spans ${formatInt(stats.uniqueCollaborators)} unique collaborators.`}
              body="This drilldown focuses on network breadth, repeat relationships, and affiliation reach. It is intended to show how collaboration is structured, not whether collaborations are high impact."
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Network structure</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Current breadth and recurrence across collaborators, institutions, and countries.</p>
              </div>
              <div className="min-h-[11rem]">
                <CollaborationStructurePanel tile={tile} />
              </div>
            </div>
            <CanonicalTablePanel
              title="Network readout"
              subtitle="Canonical summary of breadth, recurrence, and reach."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'unique',
                  cells: {
                    measure: 'Unique collaborators',
                    value: formatInt(stats.uniqueCollaborators),
                    meaning: 'Distinct collaborators represented in the synced publication set.',
                  },
                },
                {
                  key: 'repeat',
                  cells: {
                    measure: 'Repeat collaborator rate',
                    value: formatPercentWhole(stats.repeatCollaboratorRatePct),
                    meaning: 'Share of collaborators with at least two shared works.',
                  },
                },
                {
                  key: 'institutions',
                  cells: {
                    measure: 'Institutions',
                    value: formatInt(stats.institutions),
                    meaning: 'Institutional breadth across available affiliation data.',
                  },
                },
                {
                  key: 'countries',
                  cells: {
                    measure: 'Countries / continents',
                    value: `${formatInt(stats.countries)} / ${formatInt(stats.continents)}`,
                    meaning: 'Geographic breadth of the collaboration network.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Collaborative works</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="The collaboration footprint can be traced back to individual works."
              body="The table below highlights the most collaborative outputs and how much of that collaboration comes from repeat working relationships."
            />
            <CanonicalTablePanel
              title="Top collaborative works"
              subtitle="Publications ranked by collaborator count and repeat-collaborator depth."
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'collaborators', label: 'Collaborators', align: 'center', width: '1%' },
                { key: 'repeat', label: 'Repeat', align: 'center', width: '1%' },
                { key: 'institutions', label: 'Institutions', align: 'center', width: '1%' },
                { key: 'countries', label: 'Countries', align: 'center', width: '1%' },
              ]}
              rows={stats.topCollaborativeWorks.map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: publication.title,
                  collaborators: formatInt(publication.collaboratorsInWork),
                  repeat: formatInt(publication.repeatCollaboratorsInWork),
                  institutions: formatInt(publication.institutionsInWork),
                  countries: formatInt(publication.countriesInWork),
                },
              }))}
              emptyMessage="No collaborative works available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Structural network trajectory</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Collaboration structure is currently reported as a network snapshot."
              body="The canonical payload does not yet provide a longitudinal collaborator-network series, so this tab records the depth signals that explain the current state of the network."
            />
            <CanonicalTablePanel
              title="Network depth table"
              subtitle="Structural depth and coverage signals behind the current network summary."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'works',
                  cells: {
                    measure: 'Collaborative works',
                    value: formatInt(stats.collaborativeWorks),
                    meaning: 'Works contributing to the observed collaboration network.',
                  },
                },
                {
                  key: 'repeat',
                  cells: {
                    measure: 'Repeat collaborators',
                    value: formatInt(stats.repeatCollaborators),
                    meaning: 'Collaborators appearing in at least two works.',
                  },
                },
                {
                  key: 'inst-works',
                  cells: {
                    measure: 'Institutions from works',
                    value: formatInt(stats.institutionsFromWorks),
                    meaning: 'Institution breadth recovered directly from work metadata.',
                  },
                },
                {
                  key: 'country-works',
                  cells: {
                    measure: 'Countries from works',
                    value: formatInt(stats.countriesFromWorks),
                    meaning: 'Country breadth recovered directly from work metadata.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Coverage context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Collaboration breadth is only as complete as the available affiliation coverage."
              body="Work-derived and collaborator-derived affiliation sources can differ. Reading them together helps explain why institution and country breadth may look stronger or weaker than expected."
            />
            <CanonicalTablePanel
              title="Affiliation coverage table"
              subtitle="Source-specific breadth used to interpret the collaboration network summary."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'inst-collab',
                  cells: {
                    measure: 'Institutions from collaborators',
                    value: formatInt(stats.institutionsFromCollaborators),
                    meaning: 'Institutional breadth recovered from collaborator-level affiliation data.',
                  },
                },
                {
                  key: 'country-collab',
                  cells: {
                    measure: 'Countries from collaborators',
                    value: formatInt(stats.countriesFromCollaborators),
                    meaning: 'Country breadth recovered from collaborator-level affiliation data.',
                  },
                },
                {
                  key: 'continents',
                  cells: {
                    measure: 'Continents',
                    value: formatInt(stats.continents),
                    meaning: 'Highest-level geographic spread of the collaboration network.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

function renderEnhancedGenericMetricDrilldownSection({
  tile,
  activeTab,
  momentumStats,
  momentumInsightOpen,
  onToggleMomentumInsight,
  onOpenPublication,
  momentumWindowMode,
  onMomentumWindowModeChange,
  momentumYearBreakdown,
  momentumOverviewViewMode,
  onMomentumOverviewViewModeChange,
  impactStats,
  influentialStats,
  fieldPercentileStats,
  authorshipStats,
  collaborationStats,
  fieldPercentileThreshold,
  onFieldPercentileThresholdChange,
  tileToggleMotionReady,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  momentumStats: MomentumDrilldownStats | null
  momentumInsightOpen: boolean
  onToggleMomentumInsight: () => void
  onOpenPublication?: (workId: string) => void
  momentumWindowMode: MomentumWindowMode
  onMomentumWindowModeChange: (next: MomentumWindowMode) => void
  momentumYearBreakdown: MomentumYearBreakdown | null
  momentumOverviewViewMode: SplitBreakdownViewMode
  onMomentumOverviewViewModeChange: (next: SplitBreakdownViewMode) => void
  impactStats: ImpactConcentrationDrilldownStats | null
  influentialStats: InfluentialCitationsDrilldownStats | null
  fieldPercentileStats: FieldPercentileShareDrilldownStats | null
  authorshipStats: AuthorshipCompositionDrilldownStats | null
  collaborationStats: CollaborationStructureDrilldownStats | null
  fieldPercentileThreshold: FieldPercentileThreshold
  onFieldPercentileThresholdChange: (next: FieldPercentileThreshold) => void
  tileToggleMotionReady: boolean
}): ReactNode {
  switch (tile.key) {
    case 'momentum':
      return momentumStats
        ? renderMomentumDrilldownSection({
          tile,
          activeTab,
          stats: momentumStats,
          momentumInsightOpen,
          onToggleMomentumInsight,
          onOpenPublication,
          momentumWindowMode,
          onMomentumWindowModeChange,
          momentumYearBreakdown,
          momentumOverviewViewMode,
          onMomentumOverviewViewModeChange,
          tileToggleMotionReady,
        })
        : null
    case 'impact_concentration':
      return impactStats ? renderImpactConcentrationDrilldownSection({ tile, activeTab, stats: impactStats }) : null
    case 'influential_citations':
      return influentialStats ? renderInfluentialCitationsDrilldownSection({ tile, activeTab, stats: influentialStats }) : null
    case 'field_percentile_share':
      return fieldPercentileStats
        ? renderFieldPercentileDrilldownSection({
          activeTab,
          stats: fieldPercentileStats,
          tile,
          threshold: fieldPercentileThreshold,
          onThresholdChange: onFieldPercentileThresholdChange,
          toggleMotionReady: tileToggleMotionReady,
        })
        : null
    case 'authorship_composition':
      return authorshipStats ? renderAuthorshipDrilldownSection({ activeTab, stats: authorshipStats, tile }) : null
    case 'collaboration_structure':
      return collaborationStats ? renderCollaborationDrilldownSection({ activeTab, stats: collaborationStats, tile }) : null
    default:
      return null
  }
}

function renderImpactConcentrationDrilldownSection({
  activeTab,
  stats,
  tile,
}: {
  activeTab: DrilldownTab
  stats: ImpactConcentrationDrilldownStats
  tile: PublicationMetricTilePayload
}): ReactNode {
  const concentrationLadderSteps = buildCitationConcentrationLadder(
    (Array.isArray((tile.drilldown as Record<string, unknown> | undefined)?.publications)
      ? (tile.drilldown as Record<string, unknown>).publications as Array<Record<string, unknown>>
      : []
    ).map((publication) => parsePublicationCitationCount(
      publication.citations_lifetime ?? publication.citations ?? publication.cited_by_count ?? 0,
    )),
  )

  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Impact concentration overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`The top 3 papers currently account for ${Math.round(stats.concentrationPct)}% of total citations.`}
              body="This drilldown shows how much of the citation portfolio is concentrated in a very small subset of papers. It is most useful for distinguishing broad portfolio depth from dependence on a handful of standout publications."
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Top-set concentration</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Visual split between the top-cited set and the remaining publication tail.</p>
              </div>
              <div className="min-h-[11rem]">
                <ImpactConcentrationPanel tile={tile} />
              </div>
            </div>
            <CanonicalTablePanel
              title="Concentration readout"
              subtitle="Canonical summary of concentration, dispersion, and inactive-tail context."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'share',
                  cells: {
                    measure: 'Top 3 citation share',
                    value: formatPercentWhole(stats.concentrationPct),
                    meaning: 'Share of total lifetime citations carried by the top 3 papers.',
                  },
                },
                {
                  key: 'classification',
                  cells: {
                    measure: 'Classification',
                    value: stats.classification,
                    meaning: 'Narrative descriptor for the current concentration profile.',
                  },
                },
                {
                  key: 'gini',
                  cells: {
                    measure: 'Gini coefficient',
                    value: stats.giniCoefficient === null ? '\u2014' : stats.giniCoefficient.toFixed(2),
                    meaning: 'Second lens on dispersion across the portfolio.',
                  },
                },
                {
                  key: 'uncited',
                  cells: {
                    measure: 'Uncited papers',
                    value: `${formatInt(stats.uncitedPublicationsCount)} (${formatPercentWhole(stats.uncitedPublicationsPct)})`,
                    meaning: 'Inactive part of the portfolio that adds breadth without adding citation volume.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <>
        <div className="house-publications-drilldown-bounded-section">
          <div className="house-drilldown-heading-block">
            <p className="house-drilldown-heading-block-title">Concentration ladder</p>
          </div>
          <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
            <div className="space-y-3">
              <DrilldownNarrativeCard
                eyebrow="Approved story"
                title="The portfolio concentration is driven by a very small citation core."
                body="Each rung shows the cumulative share of lifetime citations captured by progressively larger slices of the portfolio, so you can see whether concentration falls away quickly after the first few papers or stays steep deeper into the list."
              />
              <CitationConcentrationLadderCard steps={concentrationLadderSteps} bare />
            </div>
          </div>
        </div>

      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Top cited papers</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Concentration is explained by the top of the citation distribution."
              body="The table below identifies the papers most responsible for the portfolio concentration profile, together with each paper’s share of the total citation pool."
            />
            <CanonicalTablePanel
              title="Top concentration drivers"
              subtitle="Highest-cited papers and their share of the total citation portfolio."
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'citations', label: 'Citations', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
                { key: 'year', label: 'Year', align: 'center', width: '1%' },
                { key: 'type', label: 'Type' },
              ]}
              rows={stats.topPapers.map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: publication.title,
                  citations: formatInt(publication.citations),
                  share: formatPercentOne(publication.shareOfTotalPct),
                  year: publication.year === null ? '\u2014' : formatInt(publication.year),
                  type: publication.publicationType,
                },
              }))}
              emptyMessage="No concentration driver papers available."
            />
          </div>
        </div>
      </div>
      </>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Structural trajectory context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Impact concentration is currently a structural snapshot."
              body="The canonical payload does not yet ship a historical concentration series, so the trajectory tab captures the current top-set versus long-tail split rather than a year-by-year line."
            />
            <CanonicalTablePanel
              title="Current structural split"
              subtitle="Top-set versus long-tail citation structure used for the current concentration snapshot."
              columns={[
                { key: 'segment', label: 'Segment' },
                { key: 'citations', label: 'Citations', align: 'center', width: '1%' },
                { key: 'papers', label: 'Papers', align: 'center', width: '1%' },
                { key: 'share', label: 'Share', align: 'center', width: '1%' },
              ]}
              rows={[
                {
                  key: 'top',
                  cells: {
                    segment: 'Top cited set',
                    citations: formatInt(stats.top3Citations),
                    papers: formatInt(stats.topPapersCount),
                    share: formatPercentWhole(stats.concentrationPct),
                  },
                },
                {
                  key: 'rest',
                  cells: {
                    segment: 'Long tail',
                    citations: formatInt(stats.restCitations),
                    papers: formatInt(stats.remainingPapersCount),
                    share: formatPercentWhole(Math.max(0, 100 - stats.concentrationPct)),
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Dispersion context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Concentration should be read together with dispersion and tail inactivity."
              body="The headline percentage is intuitive, but it is more informative when paired with Gini-style dispersion and the share of papers that remain uncited."
            />
            <CanonicalTablePanel
              title="Concentration context table"
              subtitle="Interpretive context for the current concentration state."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'classification',
                  cells: {
                    measure: 'Profile label',
                    value: stats.classification,
                    meaning: 'Narrative interpretation of the current concentration level.',
                  },
                },
                {
                  key: 'gini',
                  cells: {
                    measure: 'Gini coefficient',
                    value: stats.giniCoefficient === null ? '\u2014' : stats.giniCoefficient.toFixed(2),
                    meaning: 'Dispersion across the full citation distribution.',
                  },
                },
                {
                  key: 'uncited',
                  cells: {
                    measure: 'Uncited share',
                    value: formatPercentWhole(stats.uncitedPublicationsPct),
                    meaning: 'Inactive tail of the publication portfolio.',
                  },
                },
                {
                  key: 'publications',
                  cells: {
                    measure: 'Total publications',
                    value: formatInt(stats.totalPublications),
                    meaning: 'Portfolio size behind the current concentration snapshot.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

function renderInfluentialCitationsDrilldownSection({
  tile,
  activeTab,
  stats,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  stats: InfluentialCitationsDrilldownStats
}): ReactNode {
  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Influential citation overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`Influential citations currently account for ${formatPercentWhole(stats.influentialRatioPct)} of the citation profile.`}
              body="This drilldown isolates citations tagged as influential by the enrichment provider so the summary focuses on quality-of-impact rather than raw volume alone."
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Influential citations over time</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Provider-supplied trend view for influential citation activity.</p>
              </div>
              <div className="min-h-[11rem]">
                <InfluentialTrendPanel
                  tile={tile}
                  chartTitle="Influential citations over time"
                  chartTitleClassName={HOUSE_METRIC_RIGHT_CHART_TITLE_CLASS}
                  refreshKey="drilldown-influential"
                />
              </div>
            </div>
            <CanonicalTablePanel
              title="Influential citation readout"
              subtitle="Canonical summary of influential volume and recent-window changes."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'total',
                  cells: {
                    measure: 'Influential citations',
                    value: formatInt(stats.totalInfluentialCitations),
                    meaning: 'Lifetime total tagged influential by the provider.',
                  },
                },
                {
                  key: 'ratio',
                  cells: {
                    measure: 'Influential ratio',
                    value: formatPercentWhole(stats.influentialRatioPct),
                    meaning: 'Influential share of the broader citation footprint.',
                  },
                },
                {
                  key: 'recent',
                  cells: {
                    measure: 'Last 12 months',
                    value: formatInt(stats.influenceLast12m),
                    meaning: 'Recent influential citation activity.',
                  },
                },
                {
                  key: 'previous',
                  cells: {
                    measure: 'Previous 12 months',
                    value: formatInt(stats.influencePrev12m),
                    meaning: 'Baseline recent-window comparator.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Paper-level influential contributors</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Influential impact is being driven by a defined paper set."
              body="The table below ranks papers by influential citations so the portfolio’s most substantively influential works are visible separately from the broader citation distribution."
            />
            <CanonicalTablePanel
              title="Top influential papers"
              subtitle="Provider-tagged influential citation leaders across the publication set."
              columns={[
                { key: 'paper', label: 'Paper' },
                { key: 'influential', label: 'Influential', align: 'center', width: '1%' },
                { key: 'recent', label: 'Last 12m', align: 'center', width: '1%' },
                { key: 'lifetime', label: 'Lifetime cites', align: 'center', width: '1%' },
                { key: 'venue', label: 'Venue' },
              ]}
              rows={stats.topPublications.map((publication) => ({
                key: publication.workId,
                cells: {
                  paper: publication.title,
                  influential: formatInt(publication.influentialCitations),
                  recent: formatInt(publication.influentialLast12m),
                  lifetime: formatInt(publication.lifetimeCitations),
                  venue: publication.venue || '\u2014',
                },
              }))}
              emptyMessage="No influential citation contributors available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Influential citation trajectory</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Recent influential activity matters more than the raw lifetime total when evaluating current trajectory."
              body="The trajectory table keeps the yearly influential series and the recent 12-month comparison together, so it is clear whether influence is still accumulating in the recent portfolio."
            />
            <CanonicalTablePanel
              title="Yearly influential series"
              subtitle="Canonical yearly history supplied for influential citations."
              columns={[
                { key: 'period', label: 'Period' },
                { key: 'value', label: 'Influential cites', align: 'center', width: '1%' },
              ]}
              rows={stats.yearlySeries.map((point) => ({
                key: point.label,
                cells: {
                  period: point.label,
                  value: formatInt(point.value),
                },
              }))}
              emptyMessage="No influential citation time series available."
            />
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Influential citation context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Influential citations provide a quality-of-impact lens."
              body="This metric should be interpreted as provider-tagged influence coverage. It complements total citations, but it depends on enrichment availability and year assignment coverage."
            />
            <CanonicalTablePanel
              title="Context table"
              subtitle="Coverage and recent-window context for influential citations."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'ratio',
                  cells: {
                    measure: 'Influential ratio',
                    value: formatPercentWhole(stats.influentialRatioPct),
                    meaning: 'Influential share inside the broader citation profile.',
                  },
                },
                {
                  key: 'delta',
                  cells: {
                    measure: '12m delta',
                    value: formatSignedNumber(stats.influenceDelta, 0),
                    meaning: 'Change in influential citations versus the previous 12-month window.',
                  },
                },
                {
                  key: 'unknown',
                  cells: {
                    measure: 'Unknown-year influential cites',
                    value: formatInt(stats.unknownYearInfluentialCitations),
                    meaning: 'Influential citations counted in totals but not confidently placed on the time axis.',
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

export function PublicationsTopStrip({
  metrics,
  loading = false,
  token = null,
  onOpenPublication,
  fetchMetricDetail = fetchPublicationMetricDetail,
  forceInsightsVisible = false,
}: PublicationsTopStripProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTileKey, setActiveTileKey] = useState<string>('')
  const [activeTileDetail, setActiveTileDetail] = useState<PublicationMetricTilePayload | null>(null)
  const [, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [activeDrilldownTab, setActiveDrilldownTab] = useState<DrilldownTab>('summary')
  const [momentumWindowMode, setMomentumWindowMode] = useState<MomentumWindowMode>('12m')
  const [hIndexViewMode, setHIndexViewMode] = useState<HIndexViewMode>('trajectory')
  const [fieldPercentileThreshold, setFieldPercentileThreshold] = useState<FieldPercentileThreshold>(75)
  const [insightsVisible, setInsightsVisible] = useState(
    () => forceInsightsVisible || readAccountSettings().publicationInsightsDefaultVisibility !== 'hidden',
  )
  const [toolboxOpen, setToolboxOpen] = useState(false)
  const [chartRefreshCycle, setChartRefreshCycle] = useState(0)

  // Suppress toggle-thumb sliding transitions until entry animations complete
  const [tileToggleMotionReady, setTileToggleMotionReady] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setTileToggleMotionReady(true), CHART_MOTION.entry.duration)
    return () => window.clearTimeout(id)
  }, [])

  const tileMotionStyle = useMemo(() => ({
    '--motion-duration-chart-refresh': `${CHART_MOTION.entry.duration}ms`,
    '--motion-duration-chart-toggle': `${CHART_MOTION.toggle.duration}ms`,
  }) as CSSProperties, [])

  useEffect(() => {
    if (!metrics || loading) {
      return
    }
    setChartRefreshCycle((current) => current + 1)
  }, [loading, metrics])

  const tiles = useMemo(() => {
    const source = metrics?.tiles ?? []
    const pinnedOrder: Record<string, number> = {
      this_year_vs_last: 0,
      total_citations: 1,
    }
    return source
      .map((tile, index) => ({ tile, index }))
      .sort((left, right) => {
        const leftRank = pinnedOrder[left.tile.key]
        const rightRank = pinnedOrder[right.tile.key]
        const leftSort = Number.isFinite(leftRank) ? Number(leftRank) : 10_000 + left.index
        const rightSort = Number.isFinite(rightRank) ? Number(rightRank) : 10_000 + right.index
        return leftSort - rightSort
      })
      .map((item) => item.tile)
  }, [metrics?.tiles])
  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.key === activeTileKey) || null,
    [activeTileKey, tiles],
  )
  const totalCitationsTile = useMemo(
    () => tiles.find((tile) => tile.key === 'total_citations') || null,
    [tiles],
  )
  const momentumYearBreakdown = useMemo(
    () => buildMomentumYearBreakdown(totalCitationsTile),
    [totalCitationsTile],
  )
  const activeTile = activeTileDetail || selectedTile
  const activeTileDefinition = useMemo(
    () => String(activeTile?.drilldown?.definition || '').trim(),
    [activeTile],
  )
  const sanitizedActiveTileDefinition = useMemo(() => {
    if (!activeTileDefinition) {
      return ''
    }
    if (activeTile?.key === 'this_year_vs_last') {
      return 'Your publication records'
    }
    if (activeTile?.key !== 'this_year_vs_last') {
      return activeTileDefinition
    }
    return activeTileDefinition
  }, [activeTileDefinition, activeTile?.key])
  const showActiveTileDefinition = useMemo(
    () => Boolean(sanitizedActiveTileDefinition) && !/fixture\s+drilldown/i.test(sanitizedActiveTileDefinition),
    [sanitizedActiveTileDefinition],
  )

  useEffect(() => {
    setActiveDrilldownTab('summary')
  }, [activeTileKey])

  useEffect(() => {
    if (forceInsightsVisible) {
      setInsightsVisible(true)
      setToolboxOpen(false)
    }
  }, [forceInsightsVisible])

  // Refresh settings when page becomes visible (user navigates back from settings)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !forceInsightsVisible) {
        setInsightsVisible(readAccountSettings().publicationInsightsDefaultVisibility !== 'hidden')
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [forceInsightsVisible])

  const onSelectTile = async (tile: PublicationMetricTilePayload) => {
    setActiveTileKey(tile.key)
    setActiveTileDetail(tile)
    setActiveDrilldownTab('summary')
    setDetailError('')
    setDrawerOpen(true)
    if (!token) {
      return
    }
    setDetailLoading(true)
    try {
      const detail = await fetchMetricDetail(token, tile.key)
      if (detail?.tile) {
        setActiveTileDetail(detail.tile)
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load metric drilldown.')
    } finally {
      setDetailLoading(false)
    }
  }

  const shouldIgnoreTileOpen = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false
    }
    return Boolean(target.closest('[data-stop-tile-open="true"]'))
  }

  const onOpenPublicationFromDrilldown = (workId: string) => {
    if (!onOpenPublication) {
      return
    }
    const normalizedWorkId = String(workId || '').trim()
    if (!normalizedWorkId) {
      return
    }
    onOpenPublication(normalizedWorkId)
    setDrawerOpen(false)
  }

  const activeDrilldownTitle = useMemo(() => {
    const rawTitle = String(activeTile?.label || activeTile?.drilldown?.title || '').trim()
    const baseTitle = (rawTitle || 'Publication metric').replace(/[.:;,\s]+$/g, '').trim()
    if (/insights?$/i.test(baseTitle)) {
      return baseTitle
    }
    if (/^total publications$/i.test(baseTitle)) {
      return 'Total publication insights'
    }
    if (/publications$/i.test(baseTitle)) {
      return `${baseTitle.replace(/publications$/i, 'publication')} insights`
    }
    return `${baseTitle} insights`
  }, [activeTile?.drilldown?.title, activeTile?.label])

  const activeDrilldownExpanderText = useMemo(() => {
    if (activeTile?.key === 'this_year_vs_last' && activeDrilldownTab === 'summary') {
      return 'A summary of your publication metrics'
    }
    if (activeTile?.key === 'this_year_vs_last' && activeDrilldownTab === 'breakdown') {
      return 'A deeper dive into your total publications'
    }
    return sanitizedActiveTileDefinition
  }, [activeDrilldownTab, activeTile?.key, sanitizedActiveTileDefinition])

  return (
    <>
      <Card className={HOUSE_SURFACE_PANEL_BARE_CLASS} style={tileMotionStyle}>
        <CardContent className="p-0">
          <SectionHeader
            heading={PUBLICATION_INSIGHTS_TITLE}
            className="house-publications-toolbar-header house-publications-insights-toolbar-header"
            actions={(
              <>
                {metrics?.status === 'FAILED' ? (
                  <p className={cn(HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_WARNING_CLASS)}>Last update failed</p>
                ) : null}
                <div
                  className={cn(
                    'ml-auto flex h-8 w-full items-center justify-end overflow-visible self-center',
                    insightsVisible && toolboxOpen ? 'gap-1' : 'gap-0',
                  )}
                >
                  <div
                    className={cn(
                      'overflow-visible transition-[max-width,opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
                      insightsVisible && toolboxOpen
                        ? 'max-w-[20rem] translate-x-0 opacity-100'
                        : 'pointer-events-none max-w-0 translate-x-1 opacity-0',
                    )}
                    data-stop-tile-open="true"
                    aria-hidden={!insightsVisible || !toolboxOpen}
                  >
                    <div className="flex min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
                      <div className="relative inline-flex">
                        <Button
                          type="button"
                          data-stop-tile-open="true"
                          variant="house"
                          size="icon"
                          className="peer h-8 w-8 house-publications-toolbox-item"
                          aria-label={`Generate ${PUBLICATION_INSIGHTS_LABEL} report`}
                        >
                          <FileText className="h-4 w-4" strokeWidth={2.1} />
                        </Button>
                        <span
                          className={cn(
                            HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                            'top-auto bottom-full mb-[0.35rem] z-[999]',
                            'opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100',
                          )}
                          aria-hidden="true"
                        >
                          Generate report
                        </span>
                      </div>
                      <div className="house-publications-toolbox-divider" aria-hidden="true" />
                      <div className="relative inline-flex">
                        <Button
                          type="button"
                          data-stop-tile-open="true"
                          variant="house"
                          size="icon"
                          className="peer h-8 w-8 house-publications-toolbox-item"
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" strokeWidth={2.1} />
                        </Button>
                        <span
                          className={cn(
                            HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                            'top-auto bottom-full mb-[0.35rem] z-[999]',
                            'opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100',
                          )}
                          aria-hidden="true"
                        >
                          Download
                        </span>
                      </div>
                      <div className="house-publications-toolbox-divider" aria-hidden="true" />
                      <div className="relative inline-flex">
                        <Button
                          type="button"
                          data-stop-tile-open="true"
                          variant="house"
                          size="icon"
                          className="peer h-8 w-8 house-publications-toolbox-item"
                          aria-label="Share"
                        >
                          <Share2 className="h-4 w-4" strokeWidth={2.1} />
                        </Button>
                        <span
                          className={cn(
                            HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                            'top-auto bottom-full mb-[0.35rem] z-[999]',
                            'opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100',
                          )}
                          aria-hidden="true"
                        >
                          Share
                        </span>
                      </div>
                    </div>
                  </div>
                  <SectionTools tone="publications" framed={false} className="ml-auto">
                    {insightsVisible ? (
                      <Button
                        type="button"
                        data-stop-tile-open="true"
                        data-state={toolboxOpen ? 'open' : 'closed'}
                        variant="house"
                        size="icon"
                        className={cn(
                          'h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                          HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS,
                          toolboxOpen && 'house-publications-tools-toggle-open',
                        )}
                        onClick={() => {
                          setToolboxOpen((current) => !current)
                        }}
                        aria-pressed={toolboxOpen}
                        aria-expanded={toolboxOpen}
                        aria-label={toolboxOpen ? 'Hide toolbox actions' : 'Show toolbox actions'}
                        title="Tools"
                      >
                        <Hammer
                          className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]"
                          strokeWidth={2.1}
                        />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      data-stop-tile-open="true"
                      data-state={insightsVisible ? 'open' : 'closed'}
                      variant="house"
                      size="icon"
                      className={cn(
                        'h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle',
                        HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS,
                      )}
                      onClick={() => {
                        setInsightsVisible((current) => {
                          const nextVisible = !current
                          if (!nextVisible) {
                            setToolboxOpen(false)
                          }
                          return nextVisible
                        })
                      }}
                      aria-pressed={insightsVisible}
                      aria-label={insightsVisible ? `Set ${PUBLICATION_INSIGHTS_LABEL} not visible` : `Set ${PUBLICATION_INSIGHTS_LABEL} visible`}
                    >
                      {insightsVisible ? (
                        <Eye className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                      ) : (
                        <EyeOff className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                      )}
                    </Button>
                  </SectionTools>
                </div>
              </>
            )}
          />

          {insightsVisible && loading && tiles.length === 0 ? (
            <Section surface="transparent" inset="none" spaceY="none" className="publications-insights-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="w-full min-h-36 px-3 py-2.5">
                  <div className={cn('h-full rounded-sm', HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS)} />
                </div>
              ))}
            </Section>
          ) : insightsVisible && tiles.length === 0 ? (
            <Section surface="transparent" inset="none" spaceY="none" className="pb-3">
              <div className={cn('rounded-sm px-3 py-2.5 text-sm', HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_WARNING_CLASS)}>
                <p>No publication insight tiles are available yet.</p>
                {metrics?.status === 'RUNNING' ? <p className="mt-1">Metrics are currently computing. This panel updates automatically.</p> : null}
                {metrics?.status === 'FAILED' ? <p className="mt-1">Metrics refresh failed. Use Sync Publications to retry.</p> : null}
              </div>
            </Section>
          ) : insightsVisible ? (
            <Section surface="transparent" inset="none" spaceY="none" className="publications-insights-grid">
              {tiles.map((tile) => {
                const subtitle = String(tile.subtext || '').trim()
                const rawDeltaDisplay = String(tile.delta_display || '').trim()
                const shouldHideLegacyTrendText =
                  tile.key === 'total_citations' && /(falling|rising|stable over)/i.test(rawDeltaDisplay)
                const effectiveDeltaDisplay = shouldHideLegacyTrendText ? '' : rawDeltaDisplay
                
                if (tile.key === 'total_citations') {
                  return (
                    <TotalCitationsTile
                      key={tile.key}
                      tile={tile}
                      onOpen={() => {
                        void onSelectTile(tile)
                      }}
                      shouldIgnoreTileOpen={shouldIgnoreTileOpen}
                    />
                  )
                }
                const tileValueSource = tile.main_value ?? tile.value
                const tileValueNumberRaw = typeof tileValueSource === 'number' ? tileValueSource : Number.NaN
                const mainValueDisplay = tile.key === 'impact_concentration' && Number.isFinite(tileValueNumberRaw)
                  ? `${Math.round(tileValueNumberRaw)}%`
                  : tile.value_display || '\u2014'
                const momentumBreakdown = tile.key === 'momentum' ? buildMomentumBreakdown(tile) : null
                let primaryValue: ReactNode = mainValueDisplay
                let badgeNode: ReactNode | undefined
                let badgePlacement: 'inline' | 'topRight' | 'bottomRight' | 'bottomCenter' | 'leftChart' = 'inline'
                const pinBadgeBottom = true
                let secondaryText: ReactNode = subtitle || '\u2014'
                let detailText: ReactNode | undefined = effectiveDeltaDisplay || undefined
                let contentGridClassName: string | undefined
                let rightPaneClassName: string | undefined
                let visual: ReactNode = (
                  <div className={cn('flex h-full min-h-0 items-center p-1', HOUSE_SURFACE_STRONG_PANEL_CLASS)}>
                    <MiniChart tile={tile} />
                  </div>
                )

                if (tile.key === 'this_year_vs_last') {
                  if (Number.isFinite(tileValueNumberRaw)) {
                    primaryValue = formatInt(Math.max(0, Math.round(tileValueNumberRaw)))
                  } else {
                    primaryValue = String(tile.value_display || mainValueDisplay || '\u2014').replace(/\s+papers?$/i, '')
                  }
                  secondaryText = 'Lifetime publications'
                  detailText = undefined
                  visual = (
                    <PublicationsPerYearChart
                      tile={tile}
                      showCaption={false}
                      chartTitle="Publications per year (last 5 years)"
                      chartTitleClassName={HOUSE_METRIC_RIGHT_CHART_TITLE_CLASS}
                    />
                  )
                } else if (tile.key === 'momentum') {
                  const activeLift = momentumWindowMode === '5y'
                    ? momentumYearBreakdown?.liftPct ?? null
                    : momentumBreakdown?.liftPct ?? null
                  const activeInsufficient = momentumWindowMode === '5y'
                    ? momentumYearBreakdown?.insufficientBaseline ?? true
                    : momentumBreakdown?.insufficientBaseline ?? true
                  const activeHasData = momentumWindowMode === '5y'
                    ? Boolean(momentumYearBreakdown?.bars.length)
                    : Boolean(momentumBreakdown?.bars.length)
                  primaryValue = activeLift !== null
                    ? formatSignedPercentCompact(activeLift)
                    : activeHasData && activeInsufficient
                      ? 'New'
                      : '\u2014'
                  badgeNode = (
                    <div className="flex items-center">
                      <div
                        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
                        data-stop-tile-open="true"
                      >
                        <span
                          className={HOUSE_TOGGLE_THUMB_CLASS}
                          style={buildTileToggleThumbStyle(momentumWindowMode === '5y' ? 1 : 0, 2, !tileToggleMotionReady)}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            HOUSE_TOGGLE_BUTTON_CLASS,
                            momentumWindowMode === '12m'
                              ? 'text-white'
                              : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (momentumWindowMode === '12m') {
                              return
                            }
                            setMomentumWindowMode('12m')
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          aria-pressed={momentumWindowMode === '12m'}
                        >
                          12m
                        </button>
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            HOUSE_TOGGLE_BUTTON_CLASS,
                            momentumWindowMode === '5y'
                              ? 'text-white'
                              : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (momentumWindowMode === '5y') {
                              return
                            }
                            setMomentumWindowMode('5y')
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          aria-pressed={momentumWindowMode === '5y'}
                        >
                          5y
                        </button>
                      </div>
                    </div>
                  )
                  secondaryText = 'Citation pace'
                  detailText = 'Comparing recent vs prior citation pace'
                  visual = (
                    <MomentumTilePanel
                      tile={tile}
                      mode={momentumWindowMode}
                      yearBreakdown={momentumYearBreakdown}
                    />
                  )
                } else if (tile.key === 'h_index_projection') {
                  const hIndexMeta = buildHIndexProgressMeta(tile)
                  primaryValue = Number.isFinite(hIndexMeta.currentH) ? `h ${formatInt(hIndexMeta.currentH)}` : mainValueDisplay
                  secondaryText = undefined
                  detailText = <HIndexProgressInline tile={tile} progressLabel={`Progress to h ${formatInt(hIndexMeta.targetH)}`} />
                  rightPaneClassName = 'items-stretch pl-3'
                  badgeNode = undefined
                  visual = (
                    <HIndexTrajectoryPanel
                      tile={tile}
                      mode={hIndexViewMode}
                      chartHeader={(
                        <HIndexViewToggle
                          mode={hIndexViewMode}
                          onModeChange={(nextMode) => {
                            if (nextMode === hIndexViewMode) {
                              return
                            }
                            setHIndexViewMode(nextMode)
                          }}
                        />
                      )}
                      chartHeaderKind="toggle"
                      chartHeaderClassName={HOUSE_METRIC_RIGHT_CHART_HEADER_CLASS}
                    />
                  )
                } else if (tile.key === 'impact_concentration') {
                  const impactChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const impactValues = toNumberArray(impactChartData.values).map((item) => Math.max(0, item))
                  const impactTop3 = impactValues[0] || 0
                  const impactRest = impactValues[1] || 0
                  const impactTotal = Math.max(0, impactTop3 + impactRest)
                  const impactTop3PctRounded = impactTotal > 0
                    ? Math.max(0, Math.min(100, Math.round((impactTop3 / impactTotal) * 100)))
                    : 0
                  const impactBadgeData = (tile.badge || {}) as Record<string, unknown>
                  const impactBadgeLabel = String(
                    impactBadgeData.label ?? impactChartData.gini_profile_label ?? '',
                  ).trim()
                  primaryValue = mainValueDisplay
                  secondaryText = `Top 3 cited publications account for ${impactTop3PctRounded}% of total citations`
                  detailText = undefined
                  contentGridClassName = 'grid-cols-[minmax(0,1.2fr)_minmax(0,0.98fr)]'
                  rightPaneClassName = 'justify-end pl-4'
                  if (impactBadgeLabel) {
                    badgeNode = (
                      <span className={cn(
                        HOUSE_SURFACE_METRIC_PILL_CLASS,
                        HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_CLASS,
                        HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_REGULAR_CLASS,
                        HOUSE_METRIC_TILE_PILL_CLASS,
                      )}
                      >
                        {impactBadgeLabel}
                      </span>
                    )
                  }
                  visual = <ImpactConcentrationPanel tile={tile} />
                } else if (tile.key === 'field_percentile_share') {
                  const fieldPercentileData = (tile.chart_data || {}) as Record<string, unknown>
                  const rawThresholds = toNumberArray(fieldPercentileData.thresholds)
                    .map((item) => Math.round(item))
                    .filter((item) => [50, 75, 90, 95, 99].includes(item))
                  const availableThresholds = (rawThresholds.length ? rawThresholds : [50, 75, 90, 95, 99])
                    .map((item) => item as FieldPercentileThreshold)
                  const defaultThresholdRaw = Math.round(Number(fieldPercentileData.default_threshold || 75))
                  const defaultThreshold = availableThresholds.includes(defaultThresholdRaw as FieldPercentileThreshold)
                    ? defaultThresholdRaw as FieldPercentileThreshold
                    : availableThresholds[0]
                  const activeThreshold = availableThresholds.includes(fieldPercentileThreshold)
                    ? fieldPercentileThreshold
                    : defaultThreshold
                  const shareMap = parseNumericKeyedMap(fieldPercentileData.share_by_threshold_pct)
                  const countMap = parseNumericKeyedMap(fieldPercentileData.count_by_threshold)
                  const evaluatedRaw = Number(fieldPercentileData.evaluated_papers)
                  const evaluated = Number.isFinite(evaluatedRaw) ? Math.max(0, Math.round(evaluatedRaw)) : 0
                  const shareAtThresholdRaw = shareMap[activeThreshold]
                  const shareAtThreshold = Number.isFinite(shareAtThresholdRaw)
                    ? Math.max(0, Math.min(100, Number(shareAtThresholdRaw)))
                    : evaluated > 0
                      ? (Math.max(0, Number(countMap[activeThreshold] || 0)) / evaluated) * 100
                      : 0
                  primaryValue = evaluated > 0
                    ? `${Math.round(shareAtThreshold)}%`
                    : mainValueDisplay
                  secondaryText = (
                    <>
                      Papers at or above{' '}
                      <span
                        className="font-bold text-foreground underline decoration-2 underline-offset-3"
                        style={{
                          textDecorationColor: `hsl(var(${FIELD_PERCENTILE_EMPHASIS_TONE_VAR_BY_THRESHOLD[activeThreshold]}))`,
                        }}
                      >
                        {activeThreshold}%
                      </span>{' '}
                      percentile
                    </>
                  )
                  detailText = undefined
                  contentGridClassName = 'grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)]'
                  const activeThresholdIndex = Math.max(0, availableThresholds.indexOf(activeThreshold))
                  const percentileToggleNode = (
                    <div
                      className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-5 w-full max-w-[13.5rem]')}
                      style={{
                        gridTemplateColumns: `repeat(${availableThresholds.length}, minmax(0, 1fr))`,
                      }}
                      data-stop-tile-open="true"
                    >
                      <span
                        className={cn(
                          HOUSE_TOGGLE_THUMB_CLASS,
                          `house-toggle-thumb-threshold-${activeThreshold}`,
                        )}
                        style={buildTileToggleThumbStyle(activeThresholdIndex, availableThresholds.length, !tileToggleMotionReady)}
                        aria-hidden="true"
                      />
                      {availableThresholds.map((threshold) => (
                        <button
                          key={`field-threshold-${threshold}`}
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            HOUSE_TOGGLE_BUTTON_CLASS,
                            'inline-flex h-full w-full min-h-0 flex-1 items-center justify-center px-0 py-0',
                            activeThreshold === threshold
                              ? 'text-white'
                              : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (activeThreshold === threshold) {
                              return
                            }
                            setFieldPercentileThreshold(threshold)
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          aria-pressed={activeThreshold === threshold}
                        >
                          {threshold}
                        </button>
                      ))}
                    </div>
                  )
                  badgeNode = undefined
                  visual = (
                    <FieldPercentilePanel
                      tile={tile}
                      threshold={activeThreshold}
                      toggleControl={percentileToggleNode}
                    />
                  )
                } else if (tile.key === 'authorship_composition') {
                  const authorshipChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const leadershipRaw = Number(authorshipChartData.leadership_index_pct)
                  const totalPapersRaw = Number(authorshipChartData.total_papers)
                  const medianAuthorPositionDisplay = String(
                    authorshipChartData.median_author_position_display || authorshipChartData.median_author_position || 'Not available',
                  ).trim() || 'Not available'
                  const leadershipPct = Number.isFinite(leadershipRaw)
                    ? Math.max(0, Math.min(100, leadershipRaw))
                    : Number.isFinite(tileValueNumberRaw)
                      ? Math.max(0, Math.min(100, tileValueNumberRaw))
                      : 0
                  const totalPapers = Number.isFinite(totalPapersRaw) ? Math.max(0, Math.round(totalPapersRaw)) : 0
                  primaryValue = totalPapers > 0 ? `${Math.round(leadershipPct)}%` : mainValueDisplay
                  secondaryText = 'Leadership index'
                  detailText = undefined
                  badgeNode = (
                    <span className={cn(
                      HOUSE_SURFACE_METRIC_PILL_CLASS,
                      HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_CLASS,
                      HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_REGULAR_CLASS,
                      HOUSE_METRIC_TILE_PILL_CLASS,
                    )}
                    >
                      Median author position {medianAuthorPositionDisplay}
                    </span>
                  )
                  badgePlacement = 'bottomCenter'
                  visual = <AuthorshipStructurePanel tile={tile} />
                } else if (tile.key === 'collaboration_structure') {
                  const collaborationChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const uniqueCollaboratorsRaw = Number(collaborationChartData.unique_collaborators)

                  const uniqueCollaborators = Number.isFinite(uniqueCollaboratorsRaw)
                    ? Math.max(0, Math.round(uniqueCollaboratorsRaw))
                    : Number.isFinite(tileValueNumberRaw)
                      ? Math.max(0, Math.round(tileValueNumberRaw))
                      : 0

                  primaryValue = formatInt(uniqueCollaborators)
                  secondaryText = 'Unique collaborators'
                  detailText = undefined
                  visual = <CollaborationStructurePanel tile={tile} />
                } else if (tile.key === 'influential_citations') {
                  const influentialChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const influentialRatioRaw = Number(influentialChartData.influential_ratio_pct)
                  const influentialRatioWhole = Number.isFinite(influentialRatioRaw)
                    ? Math.max(0, Math.round(influentialRatioRaw))
                    : null
                  const influentialValueText = String(mainValueDisplay || '\u2014').trim() || '\u2014'
                  primaryValue = influentialRatioWhole === null || influentialValueText === '\u2014'
                    ? influentialValueText
                    : `${influentialValueText} (${influentialRatioWhole}%)`
                  secondaryText = 'Influential citations'
                  detailText = undefined
                  visual = (
                    <InfluentialTrendPanel
                      tile={tile}
                      chartTitle="Influential citations over time"
                      chartTitleClassName={HOUSE_METRIC_RIGHT_CHART_TITLE_CLASS}
                      refreshKey={`${String(metrics?.data_last_refreshed || '')}|${chartRefreshCycle}`}
                    />
                  )
                }

                return (
                  <StructuredMetricTile
                    key={tile.key}
                    tile={tile}
                    onOpen={() => {
                      void onSelectTile(tile)
                    }}
                    shouldIgnoreTileOpen={shouldIgnoreTileOpen}
                    primaryValue={primaryValue}
                    badge={badgeNode}
                    badgePlacement={badgePlacement}
                    pinBadgeBottom={pinBadgeBottom}
                    centerBadge={tile.key === 'impact_concentration'}
                    subtitle={secondaryText}
                    detail={detailText}
                    contentGridClassName={contentGridClassName}
                    rightPaneClassName={rightPaneClassName}
                    visual={visual}
                  />
                )
              })}
            </Section>
          ) : (
            <Section surface="transparent" inset="none" spaceY="none" className="pb-3">
              <section className="house-notification-section" aria-live="polite">
                <div className={cn(HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_INFO_CLASS)}>
                  <p>Publication insights hidden by user.</p>
                </div>
              </section>
            </Section>
          )}
        </CardContent>
      </Card>

      <DrilldownSheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        {activeTile ? (
          <>
            <DrilldownSheet.Header
              title={activeDrilldownTitle}
              subtitle={showActiveTileDefinition ? activeDrilldownExpanderText : undefined}
              variant="publications"
              alert={detailError ? <p className={cn('mt-2', HOUSE_DRILLDOWN_ALERT_CLASS)}>{detailError}</p> : undefined}
            >
              <DrilldownSheet.Tabs
                activeTab={activeDrilldownTab}
                onTabChange={(tabId) => setActiveDrilldownTab(tabId as DrilldownTab)}
                tone="profile"
                className="house-drilldown-tabs"
                aria-label="Metric drilldown sections"
                tabIdPrefix="drilldown-tab-"
                panelIdPrefix="drilldown-panel-"
              >
                {DRILLDOWN_TABS.map((tab) => (
                  <DrilldownSheet.Tab key={tab.value} id={tab.value}>
                    {tab.label}
                  </DrilldownSheet.Tab>
                ))}
              </DrilldownSheet.Tabs>
            </DrilldownSheet.Header>

            <DrilldownSheet.TabPanel id={activeDrilldownTab} isActive={true}>
              {activeTile.key === 'this_year_vs_last' ? (
                <TotalPublicationsDrilldownWorkspace
                  tile={activeTile}
                  activeTab={activeDrilldownTab}
                  animateCharts={drawerOpen}
                  token={token}
                  onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                  onDrilldownTabChange={setActiveDrilldownTab}
                />
              ) : (
                <GenericMetricDrilldownWorkspace
                  tile={activeTile}
                  activeTab={activeDrilldownTab}
                  animateCharts={drawerOpen}
                  token={token}
                  onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                  onDrilldownTabChange={setActiveDrilldownTab}
                  totalCitationsTile={totalCitationsTile}
                />
              )}
            </DrilldownSheet.TabPanel>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Select a metric tile to inspect its drilldown.</div>
        )}
      </DrilldownSheet>
    </>
  )
}











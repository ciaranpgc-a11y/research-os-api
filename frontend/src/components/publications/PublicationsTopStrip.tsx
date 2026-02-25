import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, Eye, EyeOff, FileText, Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { readAccountSettings } from '@/lib/account-preferences'
import { fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { dashboardTileStyles } from './dashboard-tile-styles'
import {
  publicationsHouseCharts,
  publicationsHouseHeadings,
  publicationsHouseMotion,
  publicationsHouseSurfaces,
} from './publications-house-style'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
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
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString('en-GB')
}

function formatSignedPercentCompact(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const normalized = Math.abs(rounded) < 1 ? 0 : rounded
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(0)}%`
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
type HIndexViewMode = 'trajectory' | 'needed'
type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99
type DrilldownTab = 'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'

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
const HOUSE_HEADING_TITLE_CLASS = publicationsHouseHeadings.title
const HOUSE_HEADING_H1_CLASS = publicationsHouseHeadings.h1
const HOUSE_HEADING_H1_SOFT_CLASS = publicationsHouseHeadings.h1Soft
const HOUSE_HEADING_H2_CLASS = publicationsHouseHeadings.h2
const HOUSE_HEADING_H3_CLASS = publicationsHouseHeadings.h3
const HOUSE_TEXT_CLASS = publicationsHouseHeadings.text
const HOUSE_TEXT_SOFT_CLASS = publicationsHouseHeadings.textSoft
const HOUSE_HEADING_LABEL_CLASS = publicationsHouseHeadings.label
const HOUSE_CHART_TRANSITION_CLASS = publicationsHouseMotion.chartPanel
const HOUSE_CHART_ENTERED_CLASS = publicationsHouseMotion.chartEnter
const HOUSE_CHART_EXITED_CLASS = publicationsHouseMotion.chartExit
const HOUSE_TOGGLE_TRACK_CLASS = publicationsHouseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = publicationsHouseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = publicationsHouseMotion.toggleButton
const HOUSE_LABEL_TRANSITION_CLASS = publicationsHouseMotion.labelTransition
const HOUSE_SURFACE_TOP_PANEL_CLASS = publicationsHouseSurfaces.topPanel
const HOUSE_SURFACE_SECTION_PANEL_CLASS = publicationsHouseSurfaces.sectionPanel
const HOUSE_SURFACE_SOFT_PANEL_CLASS = publicationsHouseSurfaces.softPanel
const HOUSE_SURFACE_LEFT_BORDER_CLASS = publicationsHouseSurfaces.leftBorder
const HOUSE_CHART_BAR_ACCENT_CLASS = publicationsHouseCharts.barAccent
const HOUSE_CHART_BAR_POSITIVE_CLASS = publicationsHouseCharts.barPositive
const HOUSE_CHART_BAR_WARNING_CLASS = publicationsHouseCharts.barWarning
const HOUSE_CHART_BAR_NEUTRAL_CLASS = publicationsHouseCharts.barNeutral
const HOUSE_CHART_BAR_CURRENT_CLASS = publicationsHouseCharts.barCurrent
const HOUSE_CHART_GRID_LINE_CLASS = publicationsHouseCharts.gridLine
const HOUSE_CHART_GRID_DASHED_CLASS = publicationsHouseCharts.gridDashed
const HOUSE_CHART_AXIS_TEXT_CLASS = publicationsHouseCharts.axisText

const MAX_PUBLICATION_CHART_BARS = 12

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function directionalExitClass(direction: 1 | -1): string {
  return direction > 0
    ? 'opacity-0 translate-x-2 scale-[0.985] blur-[0.4px]'
    : 'opacity-0 -translate-x-2 scale-[0.985] blur-[0.4px]'
}

function directionalLabelExitClass(direction: 1 | -1): string {
  return direction > 0 ? 'opacity-0 translate-x-2' : 'opacity-0 -translate-x-2'
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

function fallbackMonthLabels(count: number): string[] {
  const today = new Date()
  return Array.from({ length: count }, (_, index) => {
    const shift = count - 1 - index
    const monthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - shift, 1))
    return monthDate.toLocaleString('en-GB', { month: 'short' })
  })
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

type RollingMonthPoint = {
  year: number
  month: number
  value: number
}

function buildRollingMonthWindow(months: number, now: Date): Array<{ year: number; month: number }> {
  const output: Array<{ year: number; month: number }> = []
  const endYear = now.getUTCFullYear()
  const endMonth = now.getUTCMonth() + 1
  for (let index = months - 1; index >= 0; index -= 1) {
    const serial = (endYear * 12 + (endMonth - 1)) - index
    const year = Math.floor(serial / 12)
    const month = (serial % 12) + 1
    output.push({ year, month })
  }
  return output
}

function formatMonthYearLabel(year: number, month: number): string {
  return `${MONTH_SHORT[Math.max(0, Math.min(11, month - 1))]} ${year}`
}

function shortYearLabel(year: number): string {
  return String(year).slice(-2).padStart(2, '0')
}

function buildNiceAxis(maxObservedValue: number): { axisMax: number; ticks: number[] } {
  const safeMax = Math.max(1, maxObservedValue)
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

function buildMomentumBreakdown(tile: PublicationMetricTilePayload): MomentumBreakdown {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const fullSeries = monthlySeries.length ? monthlySeries : fallbackSeries
  const lastNineValues = fullSeries.length >= 9 ? fullSeries.slice(-9) : fullSeries.slice()
  const sourceLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const labels = sourceLabels.length >= lastNineValues.length
    ? sourceLabels.slice(-lastNineValues.length)
    : fallbackMonthLabels(lastNineValues.length)
  const bars = lastNineValues.map((value, index) => ({
    label: labels[index] || `M${index + 1}`,
    value,
  }))
  const fullLabels = sourceLabels.length >= fullSeries.length
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
  const recent12Total = monthlySeries.length >= 12 ? monthlySeries.slice(-12).reduce((sum, item) => sum + item, 0) : null
  const monthLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const trailingWindowLabels = monthLabels.length >= 12 ? monthLabels.slice(-12) : []
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

function monotonePathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ''
  }
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x} ${p.y}`
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
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

  let d = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < n - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const dx = next.x - current.x
    const cp1x = current.x + (dx / 3)
    const cp1y = current.y + ((tangents[index] * dx) / 3)
    const cp2x = next.x - (dx / 3)
    const cp2y = next.y - ((tangents[index + 1] * dx) / 3)
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`
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
      axisSubLabel: 'YTD',
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

function TotalCitationsModeChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const model = useMemo(() => buildTotalCitationsChartModel(tile), [tile])
  const animationKey = useMemo(
    () => `year:${model.bars.map((bar) => `${bar.key}-${bar.value}`).join('|')}:${model.meanValue ?? 'none'}`,
    [model.bars, model.meanValue],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (!model.bars.length) {
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-7',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          {meanLinePercent !== null ? (
            <div
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_DASHED_CLASS)}
              style={{ bottom: `${meanLinePercent}%` }}
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
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                      totalCitationsBarToneClass(bar),
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid grid-flow-col auto-cols-fr items-start gap-1">
          {model.bars.map((bar) => (
            <div key={`${bar.key}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{bar.axisLabel}</p>
              {bar.axisSubLabel ? (
                <p className="mt-px text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
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
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 bg-card px-3 py-2.5 hover:bg-card hover:border-[hsl(var(--tone-neutral-300))]',
      )}
    >
      <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
        <div className="flex min-h-0 flex-col">
          <p
            className={HOUSE_HEADING_H2_CLASS}
            data-testid={`metric-label-${tile.key}`}
          >
            TOTAL CITATIONS
          </p>
          <p
            className="mt-2.5 text-[2.15rem] font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          <p className={cn('mt-1', HOUSE_TEXT_CLASS)}>Lifetime citations</p>
          <p className={HOUSE_TEXT_SOFT_CLASS}>Last 5 years shown</p>
        </div>

        <div className="min-h-0">
          <TotalCitationsModeChart tile={tile} />
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
  subtitle,
  detail,
  visual,
  contentGridClassName,
  onOpen,
  shouldIgnoreTileOpen,
}: {
  tile: PublicationMetricTilePayload
  primaryValue: ReactNode
  badge?: ReactNode
  pinBadgeBottom?: boolean
  subtitle: ReactNode
  detail?: ReactNode
  visual: ReactNode
  contentGridClassName?: string
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
}) {
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
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 bg-card px-3 py-2.5 hover:bg-card hover:border-[hsl(var(--tone-neutral-300))]',
      )}
    >
      <div className={cn('grid h-full min-h-[9.5rem] gap-3', contentGridClassName || 'grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)]')}>
        <div className="flex min-h-0 flex-col">
          <p
            className={HOUSE_HEADING_H2_CLASS}
            data-testid={`metric-label-${tile.key}`}
          >
            {String(tile.label || '').toUpperCase()}
          </p>
          <p
            className="mt-2.5 text-[2.15rem] font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          <p className={cn('mt-1', HOUSE_TEXT_CLASS)}>{subtitle}</p>
          {typeof detail === 'string'
            ? <p className={HOUSE_TEXT_SOFT_CLASS}>{detail}</p>
            : detail
              ? <div className="pt-0.5">{detail}</div>
              : null}
          {badge ? <div className={cn(pinBadgeBottom ? 'mt-auto pt-1' : 'pt-1')}>{badge}</div> : null}
        </div>
        <div className="flex h-full min-h-0 items-center">
          {visual}
        </div>
      </div>
    </div>
  )
}

function HIndexYearChart({ tile, showCaption = false }: { tile: PublicationMetricTilePayload; showCaption?: boolean }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const projectedYearRaw = Number(chartData.projected_year)
  const currentHIndexRaw = Number(chartData.current_h_index)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
  const baseBars: Array<{ year: number; value: number; current: boolean }> = hasValidSeries
    ? years.map((year, index) => ({
        year,
        value: values[index],
        current: false,
      }))
    : []
  const existingCurrentBar = baseBars.find((item) => item.year === projectedYear)
  const bars = baseBars.filter((item) => item.year !== projectedYear)
  const currentValue = Math.max(
    0,
    Number.isFinite(currentHIndexRaw)
      ? currentHIndexRaw
      : existingCurrentBar
        ? existingCurrentBar.value
        : bars.length
          ? bars[bars.length - 1].value
          : 0,
  )
  if (hasValidSeries) {
    bars.push({
      year: projectedYear,
      value: currentValue,
      current: true,
    })
  }
  const animationKey = useMemo(
    () => bars.map((bar) => `${bar.year}-${bar.value}-${bar.current ? 1 : 0}`).join('|'),
    [bars],
  )
  const hasBars = bars.length > 0
  useEffect(() => {
    if (!hasBars) {
      setChartVisible(true)
      setBarsExpanded(false)
      setHoveredIndex(null)
      return
    }
    setChartVisible(false)
    setBarsExpanded(false)
    setHoveredIndex(null)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey, hasBars])

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>No h-index timeline</div>
  }

  const maxValue = Math.max(1, ...bars.map((bar) => Math.max(0, bar.value)))
  const scaledMax = maxValue * 1.18

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-7',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`h-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const toneClass = bar.current
                ? HOUSE_CHART_BAR_CURRENT_CLASS
                : HOUSE_CHART_BAR_ACCENT_CLASS
              return (
                <div
                  key={`${bar.year}-${index}`}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    h {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid grid-flow-col auto-cols-fr items-start gap-1">
          {bars.map((bar, index) => (
            <div key={`${bar.year}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{String(bar.year).slice(-2)}</p>
              {bar.current ? (
                <p className="mt-px text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
                  YTD
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {showCaption ? <p className={dashboardTileStyles.tileMicroLabel}>h-index by year; dashed bar is current year.</p> : null}
    </div>
  )
}

function PublicationsPerYearChart({
  tile,
  showCaption = false,
  showAxes = false,
  fullYearLabels = false,
  xAxisLabel = 'Publication year',
  yAxisLabel = 'Publications',
  enableWindowToggle = false,
}: {
  tile: PublicationMetricTilePayload
  showCaption?: boolean
  showAxes?: boolean
  fullYearLabels?: boolean
  xAxisLabel?: string
  yAxisLabel?: string
  enableWindowToggle?: boolean
}) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('5y')
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1)
  const nowUtc = useMemo(() => new Date(), [])
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
  const validYears = hasValidSeries ? years : []
  const validValues = hasValidSeries ? values : []
  const meanValueRaw = Number(chartData.mean_value)
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const bars: Array<{
    year: number
    value: number
    current: boolean
  }> = validYears.map((year, index) => {
    const value = validValues[index]
    return { year, value, current: false }
  })
  const existingCurrentBar = bars.find((item) => item.year === projectedYear)
  const historyBars = bars.filter((item) => item.year !== projectedYear)
  const currentYearValue = Math.max(
    0,
    Number.isFinite(currentYearYtdRaw)
      ? currentYearYtdRaw
      : existingCurrentBar
        ? existingCurrentBar.value
        : 0,
  )
  if (hasValidSeries) {
    historyBars.push({
      year: projectedYear,
      value: currentYearValue,
      current: true,
    })
  }

  const isCompactTileMode = !showAxes && !enableWindowToggle
  const effectiveWindowMode: PublicationsWindowMode = enableWindowToggle ? windowMode : 'all'
  const useCompactAllRangeLabels = enableWindowToggle && effectiveWindowMode === 'all' && historyBars.length > MAX_PUBLICATION_CHART_BARS
  const monthlyWindowMonths = effectiveWindowMode === '1y'
    ? 12
    : effectiveWindowMode === '3y'
      ? 36
      : effectiveWindowMode === '5y'
        ? 60
        : null

  type PublicationChartBar = {
    key: string
    value: number
    current: boolean
    axisLabel: string
    axisSubLabel?: string
  }

  const compactTileBars = useMemo(() => (
    historyBars
      .slice(-6)
      .map((bar) => ({
        key: `compact-${bar.year}`,
        value: Math.max(0, bar.value),
        current: bar.current,
        axisLabel: String(bar.year).slice(-2),
        axisSubLabel: bar.current ? 'YTD' : undefined,
      }))
  ), [historyBars])

  const groupedYearBars = useMemo(() => {
    if (!historyBars.length) {
      return { bars: [] as PublicationChartBar[], bucketSize: 1 }
    }
    const bucketSize = selectPublicationBucketSize(historyBars.length)
    const grouped: PublicationChartBar[] = []
    for (let index = 0; index < historyBars.length; index += bucketSize) {
      const chunk = historyBars.slice(index, index + bucketSize)
      if (!chunk.length) {
        continue
      }
      const startYear = chunk[0].year
      const endYear = chunk[chunk.length - 1].year
      const isSingleCurrentYear = chunk.some((item) => item.current) && startYear === endYear
      grouped.push({
        key: `${startYear}-${endYear}`,
        value: chunk.reduce((sum, item) => sum + Math.max(0, item.value), 0),
        current: isSingleCurrentYear,
        axisLabel: useCompactAllRangeLabels
          ? startYear === endYear
            ? shortYearLabel(startYear)
            : `${shortYearLabel(startYear)}-${shortYearLabel(endYear)}`
          : formatPublicationYearLabel(startYear, endYear, fullYearLabels),
        axisSubLabel: isSingleCurrentYear ? 'YTD' : undefined,
      })
    }
    return { bars: grouped.slice(-MAX_PUBLICATION_CHART_BARS), bucketSize }
  }, [fullYearLabels, historyBars, useCompactAllRangeLabels])

  const monthlyWindowSeries = useMemo(() => {
    if (monthlyWindowMonths === null || !historyBars.length) {
      return [] as RollingMonthPoint[]
    }
    const totalsByYear = new Map<number, number>()
    historyBars.forEach((bar) => {
      totalsByYear.set(bar.year, Math.max(0, bar.value))
    })
    const currentYear = nowUtc.getUTCFullYear()
    const currentMonth = nowUtc.getUTCMonth() + 1
    return buildRollingMonthWindow(monthlyWindowMonths, nowUtc).map(({ year, month }) => {
      const annualTotal = Math.max(0, totalsByYear.get(year) ?? 0)
      const denominator = year === currentYear ? Math.max(1, currentMonth) : 12
      return {
        year,
        month,
        value: denominator > 0 ? annualTotal / denominator : 0,
      }
    })
  }, [historyBars, monthlyWindowMonths, nowUtc])

  const groupedMonthBars = useMemo(() => {
    if (!monthlyWindowSeries.length) {
      return { bars: [] as PublicationChartBar[], bucketSize: 1, rangeLabel: null as string | null }
    }
    let bucketSize = 1
    if (monthlyWindowMonths === 12) {
      bucketSize = 1
    } else if (monthlyWindowMonths === 36 || monthlyWindowMonths === 60) {
      bucketSize = 12
    } else {
      bucketSize = Math.max(1, Math.ceil(monthlyWindowSeries.length / MAX_PUBLICATION_CHART_BARS))
    }
    const grouped: PublicationChartBar[] = []
    for (let index = 0; index < monthlyWindowSeries.length; index += bucketSize) {
      const chunk = monthlyWindowSeries.slice(index, index + bucketSize)
      if (!chunk.length) {
        continue
      }
      const start = chunk[0]
      const end = chunk[chunk.length - 1]
      const isLatestChunk = index + bucketSize >= monthlyWindowSeries.length
      grouped.push({
        key: `${start.year}-${start.month}-${end.year}-${end.month}`,
        value: chunk.reduce((sum, item) => sum + Math.max(0, item.value), 0),
        current: isLatestChunk && bucketSize === 1,
        axisLabel: bucketSize === 1
          ? MONTH_SHORT[Math.max(0, Math.min(11, start.month - 1))]
          : `${MONTH_SHORT[Math.max(0, Math.min(11, start.month - 1))]}-${MONTH_SHORT[Math.max(0, Math.min(11, end.month - 1))]}`,
        axisSubLabel: bucketSize === 1
          ? String(start.year)
          : start.year === end.year
            ? String(start.year)
            : `${start.year}-${end.year}`,
      })
    }
    const start = monthlyWindowSeries[0]
    const end = monthlyWindowSeries[monthlyWindowSeries.length - 1]
    const rangeLabel = `${formatMonthYearLabel(start.year, start.month)}-${formatMonthYearLabel(end.year, end.month)}`
    return { bars: grouped, bucketSize, rangeLabel }
  }, [monthlyWindowMonths, monthlyWindowSeries])

  const usingMonthlyBars = monthlyWindowMonths !== null
  const activeBars = isCompactTileMode
    ? compactTileBars
    : usingMonthlyBars
      ? groupedMonthBars.bars
      : groupedYearBars.bars
  const activeBucketSize = isCompactTileMode
    ? 1
    : usingMonthlyBars
      ? groupedMonthBars.bucketSize
      : groupedYearBars.bucketSize
  const meanValue = isCompactTileMode && Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)

  const animationKey = useMemo(
    () => `${effectiveWindowMode}|${activeBucketSize}|${activeBars.map((bar) => `${bar.key}-${bar.value}-${bar.current ? 1 : 0}`).join('|')}`,
    [activeBars, activeBucketSize, effectiveWindowMode],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    setHoveredIndex(null)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (!hasValidSeries || !historyBars.length || !activeBars.length) {
    return <div className={dashboardTileStyles.emptyChart}>No publication timeline</div>
  }

  const maxValue = Math.max(1, ...activeBars.map((bar) => Math.max(0, bar.value)))
  const axisScale = showAxes
    ? buildNiceAxis(maxValue)
    : null
  const axisMax = axisScale
    ? axisScale.axisMax
    : Math.max(1, maxValue * (isCompactTileMode ? 1.06 : 1.1), Math.max(0, meanValue) * 1.1)
  const yAxisTickValues = axisScale
    ? axisScale.ticks
    : [0, axisMax * 0.25, axisMax * 0.5, axisMax * 0.75, axisMax]
  const gridTickValues = yAxisTickValues.slice(1, -1)
  const chartLeftInset = showAxes ? '3.4rem' : '0.5rem'

  const plotAreaStyle = {
    left: chartLeftInset,
    right: '0.5rem',
    top: '1rem',
    bottom: isCompactTileMode ? '1.75rem' : showAxes ? '3.1rem' : '2.2rem',
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: '0.5rem',
    bottom: isCompactTileMode ? '0.25rem' : showAxes ? '1.15rem' : '0.35rem',
  }
  const yAxisTickOffsetRem = 0.4
  const activeWindowIndex = PUBLICATIONS_WINDOW_OPTIONS.findIndex((option) => option.value === windowMode)
  const windowRangeLabel = usingMonthlyBars ? groupedMonthBars.rangeLabel : null
  const allRangeLabel = !usingMonthlyBars && historyBars.length
    ? (() => {
      const startYear = historyBars[0].year
      const endBar = historyBars[historyBars.length - 1]
      const endYear = endBar.year
      const endMonth = endBar.current ? (nowUtc.getUTCMonth() + 1) : 12
      return `${formatMonthYearLabel(startYear, 1)}-${formatMonthYearLabel(endYear, endMonth)}`
    })()
    : null
  const periodHintText = windowRangeLabel || allRangeLabel || '\u00A0'
  const periodHintVisible = Boolean(windowRangeLabel || allRangeLabel)
  const resolvedXAxisLabel = usingMonthlyBars ? 'Publication month' : xAxisLabel
  const averageLegendText = effectiveWindowMode === '1y'
    ? `Average monthly publications over 12 months = ${formatInt(meanValue)}`
    : effectiveWindowMode === '3y'
      ? `Average yearly publications over 3 years = ${formatInt(meanValue)}`
      : effectiveWindowMode === '5y'
        ? `Average yearly publications over 5 years = ${formatInt(meanValue)}`
        : `Average yearly publications over ${Math.max(1, historyBars.length)} years = ${formatInt(meanValue)}`

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {enableWindowToggle ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div
            className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid-cols-4')}
            data-stop-tile-open="true"
          >
            <span
              className={HOUSE_TOGGLE_THUMB_CLASS}
              style={{
                width: 'calc(25% - 0.2rem)',
                left: `calc(${Math.max(0, activeWindowIndex) * 25}% + 2px)`,
              }}
              aria-hidden="true"
            />
            {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
              <button
                key={`pub-window-${option.value}`}
                type="button"
                data-stop-tile-open="true"
                className={cn(
                  HOUSE_TOGGLE_BUTTON_CLASS,
                  windowMode === option.value
                    ? 'text-white'
                    : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  if (windowMode === option.value) {
                    return
                  }
                  const targetIndex = PUBLICATIONS_WINDOW_OPTIONS.findIndex((item) => item.value === option.value)
                  setTransitionDirection(targetIndex > activeWindowIndex ? 1 : -1)
                  setWindowMode(option.value)
                }}
                onMouseDown={(event) => event.stopPropagation()}
                aria-pressed={windowMode === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
            <p
              className={cn(
                'min-h-[0.9rem]',
                HOUSE_HEADING_LABEL_CLASS,
                HOUSE_LABEL_TRANSITION_CLASS,
                periodHintVisible ? 'opacity-100' : 'opacity-0',
              )}
              aria-live="polite"
          >
            {periodHintText}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          showAxes ? 'pb-12' : isCompactTileMode ? 'pb-7' : 'pb-8',
          chartVisible ? 'opacity-100 translate-x-0 scale-100 blur-0' : directionalExitClass(transitionDirection),
        )}
      >
        {showAxes && enableWindowToggle ? (
          <div
            className={cn(
              'pointer-events-none absolute right-2 top-1.5 z-[2] flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-1.5 py-0.5 text-[0.58rem] font-semibold text-[hsl(var(--tone-neutral-700))] transition-[opacity,transform] duration-320 ease-out',
              chartVisible ? 'opacity-100 translate-x-0' : directionalLabelExitClass(transitionDirection),
            )}
          >
            <span className="w-4 border-t border-dashed border-[hsl(var(--tone-neutral-500))]" aria-hidden="true" />
            <span>{averageLegendText}</span>
          </div>
        ) : null}
        <div className="absolute" style={plotAreaStyle}>
          {gridTickValues.map((tickValue) => (
            <div
              key={`pub-grid-${tickValue}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${(tickValue / axisMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <div
            className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_DASHED_CLASS)}
            style={{ bottom: `${Math.max(0, Math.min(100, (Math.max(0, meanValue) / axisMax) * 100))}%` }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-end gap-1">
            {activeBars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / axisMax) * 100)
              const isActive = hoveredIndex === index
              const relative = bar.value >= meanValue * 1.1 ? 'above' : bar.value <= meanValue * 0.9 ? 'below' : 'near'
              const toneClass = bar.current
                ? HOUSE_CHART_BAR_CURRENT_CLASS
                : relative === 'above'
                  ? HOUSE_CHART_BAR_POSITIVE_CLASS
                  : relative === 'below'
                    ? HOUSE_CHART_BAR_WARNING_CLASS
                    : HOUSE_CHART_BAR_ACCENT_CLASS
              return (
                <div
                  key={`${bar.key}-${index}`}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateX(${chartVisible ? 0 : transitionDirection * 8}px) translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {showAxes ? (
          <div className="pointer-events-none absolute bottom-[3.1rem] left-1 top-4 w-[2.8rem]" aria-hidden="true">
            {yAxisTickValues.map((tickValue) => {
              const pct = axisMax <= 0 ? 0 : (tickValue / axisMax) * 100
              return (
                <p
                  key={`pub-y-axis-${tickValue}`}
                  className="absolute right-0 whitespace-nowrap text-[0.6rem] font-semibold tabular-nums leading-none text-[hsl(var(--tone-neutral-600))]"
                  style={{ bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)` }}
                >
                  {formatInt(tickValue)}
                </p>
              )
            })}
            <p className={cn(HOUSE_HEADING_LABEL_CLASS, 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}>
              {yAxisLabel}
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            'pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1 transition-[opacity,transform] duration-320 ease-out',
            chartVisible ? 'opacity-100 translate-x-0' : directionalLabelExitClass(transitionDirection),
          )}
          style={xAxisTicksStyle}
        >
          {activeBars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.62rem] font-semibold leading-[1.05] text-[hsl(var(--tone-neutral-600))]">
                {bar.axisLabel}
              </p>
              {bar.axisSubLabel ? (
                <p className="mt-px text-[0.56rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
                  {bar.axisSubLabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {showAxes ? (
          <p className={cn(HOUSE_HEADING_LABEL_CLASS, 'pointer-events-none absolute bottom-[0.2rem] text-center')} style={{ left: chartLeftInset, right: '0.5rem' }}>
            {resolvedXAxisLabel}
          </p>
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
  const [chartVisible, setChartVisible] = useState(true)
  const [ringExpanded, setRingExpanded] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<'top3' | 'rest' | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const top3 = values[0] || 0
  const rest = values[1] || 0
  const total = Math.max(0, top3 + rest)
  const ringRadius = 38
  const ringCircumference = 2 * Math.PI * ringRadius
  const top3Pct = total > 0 ? (top3 / total) * 100 : 0
  const top3PctRounded = Math.max(0, Math.min(100, Math.round(top3Pct)))
  const restPctRounded = Math.max(0, 100 - top3PctRounded)
  const top3Dash = ((ringExpanded ? top3PctRounded : 0) / 100) * ringCircumference
  const restDash = ((ringExpanded ? restPctRounded : 100) / 100) * ringCircumference
  const restOffset = -top3Dash
  const explicitRemainingRaw = Number(chartData.remaining_papers_count)
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
  const remainingPapersCount = Number.isFinite(explicitRemainingRaw) && explicitRemainingRaw >= 0
    ? Math.max(0, Math.round(explicitRemainingRaw))
    : totalPublications === null
      ? null
      : Math.max(0, totalPublications - effectiveTopPapersCount)
  const ringStrokeWidth = 14
  const ringHitHalfWidth = (ringStrokeWidth / 2) + 3
  const top3ArcSpan = (top3PctRounded / 100) * 360
  const top3ArcStart = 270 - (top3ArcSpan / 2)
  const isAngleInArc = (angle: number, start: number, span: number): boolean => {
    if (span <= 0) {
      return false
    }
    if (span >= 360) {
      return true
    }
    const normalizedAngle = ((angle % 360) + 360) % 360
    const normalizedStart = ((start % 360) + 360) % 360
    const end = (normalizedStart + span) % 360
    if (normalizedStart <= end) {
      return normalizedAngle >= normalizedStart && normalizedAngle <= end
    }
    return normalizedAngle >= normalizedStart || normalizedAngle <= end
  }
  const animationKey = useMemo(
    () => `${top3PctRounded}-${restPctRounded}-${totalPublications ?? 'na'}-${effectiveTopPapersCount}`,
    [effectiveTopPapersCount, restPctRounded, top3PctRounded, totalPublications],
  )
  useEffect(() => {
    setChartVisible(false)
    setRingExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setRingExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-2 pt-2.5',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        {total > 0 ? (
          <div className="relative flex h-full items-center justify-center">
            {hoveredSegment ? (
              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                  hoveredSegment === 'top3' ? '-top-0.5' : '-bottom-0.5',
                )}
              >
                {hoveredSegment === 'top3'
                  ? `Top 3 papers: ${top3PctRounded}% (${formatInt(top3)} citations)`
                  : remainingPapersCount === null
                    ? `Remaining papers: ${restPctRounded}% (${formatInt(rest)} citations)`
                    : `Remaining ${formatInt(remainingPapersCount)} papers: ${restPctRounded}% (${formatInt(rest)} citations)`}
              </div>
            ) : null}
            <svg
              viewBox="0 0 100 100"
              className="h-[7rem] w-[7rem]"
              data-stop-tile-open="true"
              onMouseMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect()
                const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100
                const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100
                const dx = x - 50
                const dy = y - 50
                const distance = Math.sqrt((dx * dx) + (dy * dy))
                if (Math.abs(distance - ringRadius) > ringHitHalfWidth) {
                  setHoveredSegment(null)
                  return
                }
                const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
                if (isAngleInArc(angleDeg, top3ArcStart, top3ArcSpan)) {
                  setHoveredSegment('top3')
                  return
                }
                setHoveredSegment('rest')
              }}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-neutral-200))"
                strokeWidth={ringStrokeWidth}
              />
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-accent-700))"
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                transform={`rotate(${top3ArcStart} 50 50)`}
                style={{
                  strokeDasharray: `${top3Dash} ${ringCircumference}`,
                  strokeDashoffset: 0,
                  transition: 'stroke-dasharray 560ms cubic-bezier(0.2, 0.68, 0.16, 1)',
                }}
              />
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-accent-300))"
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                transform={`rotate(${top3ArcStart} 50 50)`}
                style={{
                  strokeDasharray: `${restDash} ${ringCircumference}`,
                  strokeDashoffset: restOffset,
                  transition: 'stroke-dasharray 560ms cubic-bezier(0.2, 0.68, 0.16, 1), stroke-dashoffset 560ms cubic-bezier(0.2, 0.68, 0.16, 1)',
                }}
              />
            </svg>
          </div>
        ) : (
          <div className={dashboardTileStyles.emptyChart}>No concentration data</div>
        )}
      </div>
    </div>
  )
}

function MomentumTilePanel({
  tile,
  mode,
  direction,
  yearBreakdown,
}: {
  tile: PublicationMetricTilePayload
  mode: MomentumWindowMode
  direction: 1 | -1
  yearBreakdown: MomentumYearBreakdown | null
}) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const monthlyBreakdown = buildMomentumBreakdown(tile)
  const useYearMode = mode === '5y' && Boolean(yearBreakdown?.bars.length)
  const comparisonBars = useMemo(() => {
    if (useYearMode) {
      const baseline = yearBreakdown?.rate4y ?? null
      const recent = yearBreakdown?.rate1y ?? null
      if (baseline === null && recent === null) {
        return []
      }
      return [
        {
          key: 'baseline',
          label: 'Prior 4-year avg',
          subLabel: yearBreakdown?.priorYearsLabel ? `(${yearBreakdown.priorYearsLabel})` : null,
          value: baseline ?? 0,
          recent: false,
        },
        {
          key: 'recent',
          label: 'Last 1-year avg',
          subLabel: yearBreakdown?.recentYearLabel ? `(${yearBreakdown.recentYearLabel})` : null,
          value: recent ?? 0,
          recent: true,
        },
      ]
    }
    const baseline = monthlyBreakdown.rate9m
    const recent = monthlyBreakdown.rate3m
    if (baseline === null && recent === null) {
      return []
    }
    return [
      {
        key: 'baseline',
        label: 'Prior 9-month avg',
        subLabel: monthlyBreakdown.baselineWindowLabel ? `(${monthlyBreakdown.baselineWindowLabel})` : null,
        value: baseline ?? 0,
        recent: false,
      },
      {
        key: 'recent',
        label: 'Last 3-month avg',
        subLabel: monthlyBreakdown.recentWindowLabel ? `(${monthlyBreakdown.recentWindowLabel})` : null,
        value: recent ?? 0,
        recent: true,
      },
    ]
  }, [
    monthlyBreakdown.baselineWindowLabel,
    monthlyBreakdown.rate3m,
    monthlyBreakdown.rate9m,
    monthlyBreakdown.recentWindowLabel,
    useYearMode,
    yearBreakdown?.priorYearsLabel,
    yearBreakdown?.rate1y,
    yearBreakdown?.rate4y,
    yearBreakdown?.recentYearLabel,
  ])
  const emptyLabel = useYearMode ? 'No 5-year citation data' : 'No monthly citation data'
  const barValues = comparisonBars.map((bar) => Math.max(0, bar.value))
  const maxValue = Math.max(1, ...barValues)
  const minValue = barValues.length ? Math.min(...barValues) : 0
  const spreadRatio = (maxValue - minValue) / Math.max(1, maxValue)
  const headroomFactor = spreadRatio <= 0.1 ? 1.03 : spreadRatio <= 0.25 ? 1.06 : 1.1
  const scaledMaxTarget = maxValue * headroomFactor
  const baselineTarget = comparisonBars.find((bar) => bar.key === 'baseline')?.value ?? 0
  const recentTarget = comparisonBars.find((bar) => bar.key === 'recent')?.value ?? 0

  const [animatedState, setAnimatedState] = useState<{
    baseline: number
    recent: number
    max: number
  }>(() => ({
    baseline: baselineTarget,
    recent: recentTarget,
    max: Math.max(1, scaledMaxTarget),
  }))
  const animationKey = useMemo(
    () => `${mode}|${comparisonBars.map((bar) => `${bar.key}-${bar.value.toFixed(3)}`).join('|')}`,
    [comparisonBars, mode],
  )
  const animatedStateRef = useRef(animatedState)
  useEffect(() => {
    animatedStateRef.current = animatedState
  }, [animatedState])
  useEffect(() => {
    if (!comparisonBars.length) {
      setChartVisible(true)
      setBarsExpanded(false)
      setLabelsVisible(true)
      setHoveredIndex(null)
      return
    }
    if (prefersReducedMotion()) {
      setChartVisible(true)
      setBarsExpanded(true)
      setLabelsVisible(true)
      setHoveredIndex(null)
      return
    }
    setChartVisible(false)
    setBarsExpanded(false)
    setLabelsVisible(false)
    setHoveredIndex(null)
    let rafOne = 0
    let rafTwo = 0
    let timeoutId: number | undefined
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
        timeoutId = window.setTimeout(() => {
          setLabelsVisible(true)
        }, 120)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [animationKey, comparisonBars.length, direction])
  useEffect(() => {
    const target = {
      baseline: baselineTarget,
      recent: recentTarget,
      max: Math.max(1, scaledMaxTarget),
    }
    const current = animatedStateRef.current
    if (
      Math.abs(current.baseline - target.baseline) < 0.001 &&
      Math.abs(current.recent - target.recent) < 0.001 &&
      Math.abs(current.max - target.max) < 0.001
    ) {
      return
    }
    if (prefersReducedMotion()) {
      animatedStateRef.current = target
      setAnimatedState(target)
      return
    }
    const from = current
    let raf = 0
    const durationMs = 420
    const startedAt = performance.now()
    const easeOutCubic = (value: number) => 1 - ((1 - value) ** 3)
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = easeOutCubic(progress)
      const next = {
        baseline: from.baseline + (target.baseline - from.baseline) * eased,
        recent: from.recent + (target.recent - from.recent) * eased,
        max: from.max + (target.max - from.max) * eased,
      }
      animatedStateRef.current = next
      setAnimatedState(next)
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [baselineTarget, recentTarget, scaledMaxTarget])

  if (!comparisonBars.length) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }

  const animatedMax = Math.max(1, animatedState.max)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-7',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : directionalExitClass(direction),
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`momentum-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {comparisonBars.map((bar, index) => {
              const animatedValue = bar.key === 'recent' ? animatedState.recent : animatedState.baseline
              const heightPct = animatedValue <= 0 ? 5 : Math.max(10, (Math.max(0, animatedValue) / animatedMax) * 100)
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
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(animatedValue)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateX(${chartVisible ? 0 : direction * 8}px) translateY(${yOffset}px) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      opacity: 1,
                      transformOrigin: 'bottom',
                      transitionDelay: barsExpanded ? '0ms' : `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid min-h-[1.22rem] grid-flow-col auto-cols-fr items-start gap-1">
          {comparisonBars.map((bar) => (
            <div
              key={`${bar.key}-axis`}
              className={cn(
                'leading-none text-center',
                HOUSE_LABEL_TRANSITION_CLASS,
                labelsVisible ? 'opacity-100 translate-x-0 translate-y-0' : directionalLabelExitClass(direction),
                !labelsVisible && 'translate-y-0.5',
              )}
            >
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'whitespace-nowrap text-center')}>
                {bar.label}
              </p>
              <p
                className="mt-px text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
                aria-hidden="true"
              >
                ytd
              </p>
            </div>
          ))}
        </div>
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
  direction,
}: {
  tile: PublicationMetricTilePayload
  threshold: FieldPercentileThreshold
  direction: 1 | -1
}) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
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
  const countAboveRaw = countMap[threshold]
  const countAbove = Number.isFinite(countAboveRaw)
    ? Math.max(0, Math.round(Number(countAboveRaw)))
    : Math.round((shareAbove / 100) * evaluatedPapers)
  const barLabel = `>= ${threshold}th`
  const heightPct = Math.max(0, Math.min(100, shareAbove))
  const animationKey = useMemo(
    () => `${threshold}-${shareAbove.toFixed(2)}-${evaluatedPapers}`,
    [evaluatedPapers, shareAbove, threshold],
  )
  useEffect(() => {
    if (prefersReducedMotion()) {
      setChartVisible(true)
      setBarsExpanded(true)
      setLabelsVisible(true)
      return
    }
    setChartVisible(false)
    setBarsExpanded(false)
    setLabelsVisible(false)
    setHovered(false)
    let rafOne = 0
    let rafTwo = 0
    let timeoutId: number | undefined
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
        timeoutId = window.setTimeout(() => {
          setLabelsVisible(true)
        }, 120)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [animationKey, direction])

  if (evaluatedPapers <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No field percentile data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-7',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : directionalExitClass(direction),
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`field-percentile-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-center">
            <div
              className="relative flex h-full min-h-0 w-[44%] items-end"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <span
                className={cn(
                  'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                  hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                )}
                style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                aria-hidden="true"
              >
                {Math.round(shareAbove)}% ({formatInt(countAbove)} papers)
              </span>
              <span
                className={cn(
                  'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                  HOUSE_CHART_BAR_POSITIVE_CLASS,
                  hovered && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                )}
                style={{
                  height: `${heightPct}%`,
                  transform: `translateX(${chartVisible ? 0 : direction * 8}px) translateY(${hovered ? '-1px' : '0px'}) scaleX(${hovered ? 1.03 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                  transformOrigin: 'bottom',
                }}
              />
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 min-h-[1.22rem]">
          <div
            className={cn(
              'leading-none text-center',
              HOUSE_LABEL_TRANSITION_CLASS,
              labelsVisible ? 'opacity-100 translate-x-0 translate-y-0' : directionalLabelExitClass(direction),
              !labelsVisible && 'translate-y-0.5',
            )}
          >
            <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'whitespace-nowrap text-center')}>
              {barLabel}
            </p>
            <p
              className="mt-px text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
              aria-hidden="true"
            >
              ytd
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthorshipStructurePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const [panelVisible, setPanelVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
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
  useEffect(() => {
    setPanelVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setPanelVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (totalPapers <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No authorship data</div>
  }

  const rows = [
    { key: 'first', label: 'First authorship', value: Math.round(firstAuthorshipPct), tone: HOUSE_CHART_BAR_ACCENT_CLASS },
    { key: 'second', label: 'Second authorship', value: Math.round(secondAuthorshipPct), tone: 'bg-[hsl(var(--tone-neutral-500))]' },
    { key: 'senior', label: 'Senior authorship', value: Math.round(seniorAuthorshipPct), tone: HOUSE_CHART_BAR_WARNING_CLASS },
    { key: 'leadership', label: 'Leadership index', value: Math.round(leadershipIndexPct), tone: HOUSE_CHART_BAR_POSITIVE_CLASS },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'flex flex-1 flex-col gap-2.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2.5 py-2.5 transition-[opacity,transform,filter] duration-320 ease-out',
          panelVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        {rows.map((row, index) => (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[0.61rem] leading-none">
              <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{row.label}</span>
              <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{row.value}%</span>
            </div>
            <div className="h-[0.44rem] overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-420 ease-out',
                  row.tone,
                )}
                style={{
                  width: `${barsExpanded ? row.value : 0}%`,
                  transitionDelay: `${Math.min(220, index * 45)}ms`,
                }}
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
  const [panelVisible, setPanelVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const uniqueCollaboratorsRaw = Number(chartData.unique_collaborators)
  const repeatRateRaw = Number(chartData.repeat_collaborator_rate_pct)
  const institutionsRaw = Number(chartData.institutions)
  const countriesRaw = Number(chartData.countries)

  const uniqueCollaborators = Number.isFinite(uniqueCollaboratorsRaw) ? Math.max(0, Math.round(uniqueCollaboratorsRaw)) : 0
  const repeatRatePct = Number.isFinite(repeatRateRaw) ? Math.max(0, Math.min(100, repeatRateRaw)) : 0
  const institutions = Number.isFinite(institutionsRaw) ? Math.max(0, Math.round(institutionsRaw)) : 0
  const countries = Number.isFinite(countriesRaw) ? Math.max(0, Math.round(countriesRaw)) : 0

  const animationKey = useMemo(
    () => `${uniqueCollaborators}-${Math.round(repeatRatePct)}-${institutions}-${countries}`,
    [countries, institutions, repeatRatePct, uniqueCollaborators],
  )
  useEffect(() => {
    setPanelVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setPanelVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  const rows = [
    { key: 'collaborators', label: 'Unique collaborators', value: uniqueCollaborators, unit: 'count', tone: 'bg-[hsl(var(--tone-accent-600))]' },
    { key: 'repeat_rate', label: 'Repeat collaborator rate', value: repeatRatePct, unit: 'percent', tone: HOUSE_CHART_BAR_POSITIVE_CLASS },
    { key: 'institutions', label: 'Institutions', value: institutions, unit: 'count', tone: HOUSE_CHART_BAR_WARNING_CLASS },
    { key: 'countries', label: 'Countries', value: countries, unit: 'count', tone: 'bg-[hsl(var(--tone-neutral-500))]' },
  ] as const

  const maxCountMetric = Math.max(1, uniqueCollaborators, institutions, countries)
  const totalSignal = uniqueCollaborators + institutions + countries + Math.round(repeatRatePct)
  if (totalSignal <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No collaboration data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'flex flex-1 flex-col gap-2.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2.5 py-2.5 transition-[opacity,transform,filter] duration-320 ease-out',
          panelVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        {rows.map((row, index) => {
          const isPercent = row.unit === 'percent'
          const clamped = isPercent
            ? Math.max(0, Math.min(100, Number(row.value)))
            : Math.max(0, Number(row.value))
          const widthPct = isPercent
            ? clamped
            : clamped <= 0
              ? 0
              : Math.max(10, Math.min(100, (clamped / maxCountMetric) * 100))
          const valueLabel = isPercent ? `${Math.round(clamped)}%` : formatInt(clamped)

          return (
            <div key={row.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[0.61rem] leading-none">
                <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{row.label}</span>
                <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{valueLabel}</span>
              </div>
              <div className="h-[0.44rem] overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-420 ease-out',
                    row.tone,
                  )}
                  style={{
                    width: `${barsExpanded ? widthPct : 0}%`,
                    transitionDelay: `${Math.min(220, index * 45)}ms`,
                  }}
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

type PublicationDrilldownSortKey = 'year' | 'title' | 'role' | 'type' | 'venue' | 'citations'
type PublicationTrajectoryMode = 'raw' | 'moving_avg' | 'cumulative'

type PublicationDrilldownRecord = {
  workId: string
  year: number | null
  title: string
  role: string
  type: string
  venue: string
  citations: number
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

function median(values: number[]): number {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function TotalPublicationsDrilldownWorkspace({
  tile,
  activeTab,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
}) {
  const publications = useMemo(() => {
    const source = Array.isArray(tile.drilldown?.publications)
      ? tile.drilldown.publications
      : []
    return source.map((item, index): PublicationDrilldownRecord => {
      const row = (item || {}) as Record<string, unknown>
      const yearRaw = Number(row.year)
      const year = Number.isFinite(yearRaw) && yearRaw > 0 ? Math.round(yearRaw) : null
      const citationsRaw = Number(row.citations_lifetime)
      const typeFromData = String(row.publication_type || row.work_type || '').trim()
      return {
        workId: String(row.work_id || `row-${index}`),
        year,
        title: String(row.title || 'Untitled').trim() || 'Untitled',
        role: normalizeRoleLabel(String(row.user_author_role || 'Unknown')),
        type: typeFromData || 'Unspecified',
        venue: String(row.journal || 'Unknown venue').trim() || 'Unknown venue',
        citations: Number.isFinite(citationsRaw) ? Math.max(0, Math.round(citationsRaw)) : 0,
      }
    })
  }, [tile.drilldown?.publications])

  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllVenues, setShowAllVenues] = useState(false)
  const [hoveredBreakdownYear, setHoveredBreakdownYear] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<PublicationDrilldownSortKey>('year')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [trajectoryMode, setTrajectoryMode] = useState<PublicationTrajectoryMode>('raw')
  const [trajectoryWindow, setTrajectoryWindow] = useState(12)

  useEffect(() => {
    setSelectedYear(null)
    setSelectedTypes([])
    setSelectedVenue(null)
    setSearchQuery('')
    setShowAllVenues(false)
    setHoveredBreakdownYear(null)
    setSortKey('year')
    setSortDirection('desc')
    setTrajectoryMode('raw')
  }, [tile.key])

  const yearsWithData = useMemo(() => {
    const values = publications
      .map((row) => row.year)
      .filter((value): value is number => Number.isFinite(value) && value !== null)
    return Array.from(new Set(values)).sort((left, right) => left - right)
  }, [publications])

  const fallbackChartData = (tile.chart_data || {}) as Record<string, unknown>
  const fallbackYears = toNumberArray(fallbackChartData.years).map((item) => Math.round(item))
  const fallbackValues = toNumberArray(fallbackChartData.values).map((item) => Math.max(0, Math.round(item)))
  const fallbackYearToCount = useMemo(() => {
    const output = new Map<number, number>()
    for (let index = 0; index < Math.min(fallbackYears.length, fallbackValues.length); index += 1) {
      output.set(fallbackYears[index], fallbackValues[index])
    }
    return output
  }, [fallbackValues, fallbackYears])

  const minYear = yearsWithData.length ? yearsWithData[0] : (fallbackYears.length ? Math.min(...fallbackYears) : new Date().getUTCFullYear() - 4)
  const maxYear = yearsWithData.length ? yearsWithData[yearsWithData.length - 1] : (fallbackYears.length ? Math.max(...fallbackYears) : new Date().getUTCFullYear())
  const fullYears = useMemo(() => {
    const output: number[] = []
    for (let year = minYear; year <= maxYear; year += 1) {
      output.push(year)
    }
    return output
  }, [maxYear, minYear])

  const countsByYear = useMemo(() => {
    const output = new Map<number, number>()
    for (const record of publications) {
      if (record.year === null) {
        continue
      }
      output.set(record.year, (output.get(record.year) || 0) + 1)
    }
    for (const year of fullYears) {
      if (!output.has(year) && fallbackYearToCount.has(year)) {
        output.set(year, Number(fallbackYearToCount.get(year) || 0))
      }
      if (!output.has(year)) {
        output.set(year, 0)
      }
    }
    return output
  }, [fallbackYearToCount, fullYears, publications])

  const yearSeriesRaw = useMemo(
    () => fullYears.map((year) => Number(countsByYear.get(year) || 0)),
    [countsByYear, fullYears],
  )
  const yearSeriesMovingAvg = useMemo(
    () => yearSeriesRaw.map((_, index) => {
      const start = Math.max(0, index - 2)
      const window = yearSeriesRaw.slice(start, index + 1)
      return window.length ? (window.reduce((sum, value) => sum + value, 0) / window.length) : 0
    }),
    [yearSeriesRaw],
  )
  const yearSeriesCumulative = useMemo(() => {
    let running = 0
    return yearSeriesRaw.map((value) => {
      running += value
      return running
    })
  }, [yearSeriesRaw])

  useEffect(() => {
    setTrajectoryWindow(Math.max(6, Math.min(12, fullYears.length || 12)))
  }, [fullYears.length])

  const roleCountsByYear = useMemo(() => {
    const output: Record<number, Record<string, number>> = {}
    for (const record of publications) {
      if (record.year === null) {
        continue
      }
      output[record.year] = output[record.year] || { First: 0, Second: 0, Senior: 0, Other: 0, Unknown: 0 }
      const roleKey = ['First', 'Second', 'Senior', 'Other'].includes(record.role) ? record.role : 'Unknown'
      output[record.year][roleKey] = (output[record.year][roleKey] || 0) + 1
    }
    return output
  }, [publications])

  const activeYears = yearSeriesRaw.filter((count) => count > 0).length
  const medianPerActiveYear = median(yearSeriesRaw.filter((count) => count > 0))
  const peakYearData = useMemo(() => {
    let bestYear = maxYear
    let bestCount = -1
    yearSeriesRaw.forEach((count, index) => {
      if (count > bestCount) {
        bestCount = count
        bestYear = fullYears[index]
      }
    })
    return { year: bestYear, count: Math.max(0, bestCount) }
  }, [fullYears, maxYear, yearSeriesRaw])

  const volatilityIndex = useMemo(() => {
    if (!yearSeriesRaw.length) {
      return 0
    }
    const mean = yearSeriesRaw.reduce((sum, value) => sum + value, 0) / yearSeriesRaw.length
    if (mean <= 1e-9) {
      return 0
    }
    const variance = yearSeriesRaw.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / yearSeriesRaw.length
    return Math.sqrt(variance) / mean
  }, [yearSeriesRaw])

  const growthSlope = useMemo(() => {
    if (yearSeriesRaw.length <= 1) {
      return 0
    }
    const n = yearSeriesRaw.length
    const xs = Array.from({ length: n }, (_, index) => index + 1)
    const sumX = xs.reduce((sum, value) => sum + value, 0)
    const sumY = yearSeriesRaw.reduce((sum, value) => sum + value, 0)
    const sumXY = yearSeriesRaw.reduce((sum, value, index) => sum + (value * xs[index]), 0)
    const sumXX = xs.reduce((sum, value) => sum + (value * value), 0)
    const numerator = (n * sumXY) - (sumX * sumY)
    const denominator = (n * sumXX) - (sumX * sumX)
    if (Math.abs(denominator) <= 1e-9) {
      return 0
    }
    return numerator / denominator
  }, [yearSeriesRaw])

  const trajectoryPhase = growthSlope > 0.2
    ? 'Expanding'
    : growthSlope < -0.2
      ? 'Contracting'
      : 'Stable'

  const unknownYearCount = publications.filter((record) => record.year === null).length
  const ytdCountRaw = Number((tile.chart_data || {}).current_year_ytd)
  const ytdCount = Number.isFinite(ytdCountRaw) ? Math.max(0, Math.round(ytdCountRaw)) : 0
  const workspaceSectionClass = HOUSE_SURFACE_SECTION_PANEL_CLASS
  const workspacePanelClass = cn(HOUSE_SURFACE_SOFT_PANEL_CLASS, 'px-3 py-2.5')
  const workspacePanelCompactClass = cn(HOUSE_SURFACE_SOFT_PANEL_CLASS, 'p-2')
  const workspaceHeadingClass = HOUSE_HEADING_H1_SOFT_CLASS
  const workspaceSubheadingClass = HOUSE_HEADING_H1_SOFT_CLASS

  const availableTypes = useMemo(
    () => Array.from(new Set(publications.map((record) => record.type))).sort((left, right) => left.localeCompare(right)),
    [publications],
  )

  const filteredPublications = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return publications.filter((record) => {
      if (selectedYear !== null && record.year !== selectedYear) {
        return false
      }
      if (selectedTypes.length && !selectedTypes.includes(record.type)) {
        return false
      }
      if (selectedVenue && record.venue !== selectedVenue) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      return (
        record.title.toLowerCase().includes(normalizedQuery)
        || record.venue.toLowerCase().includes(normalizedQuery)
        || record.type.toLowerCase().includes(normalizedQuery)
        || record.role.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [publications, searchQuery, selectedTypes, selectedVenue, selectedYear])

  const sortedPublications = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    const output = [...filteredPublications]
    output.sort((left, right) => {
      if (sortKey === 'year') {
        return ((left.year || 0) - (right.year || 0)) * direction
      }
      if (sortKey === 'citations') {
        return (left.citations - right.citations) * direction
      }
      if (sortKey === 'title') {
        return left.title.localeCompare(right.title) * direction
      }
      if (sortKey === 'role') {
        return left.role.localeCompare(right.role) * direction
      }
      if (sortKey === 'type') {
        return left.type.localeCompare(right.type) * direction
      }
      return left.venue.localeCompare(right.venue) * direction
    })
    return output
  }, [filteredPublications, sortDirection, sortKey])

  const venueConcentration = useMemo(() => {
    const counts = new Map<string, number>()
    const citations = new Map<string, number[]>()
    const roles = new Map<string, Record<string, number>>()
    for (const record of publications) {
      counts.set(record.venue, (counts.get(record.venue) || 0) + 1)
      const venueCitations = citations.get(record.venue) || []
      venueCitations.push(record.citations)
      citations.set(record.venue, venueCitations)
      const roleCounter = roles.get(record.venue) || { First: 0, Senior: 0, Other: 0, Unknown: 0 }
      if (record.role === 'First') {
        roleCounter.First += 1
      } else if (record.role === 'Senior') {
        roleCounter.Senior += 1
      } else if (record.role === 'Unknown') {
        roleCounter.Unknown += 1
      } else {
        roleCounter.Other += 1
      }
      roles.set(record.venue, roleCounter)
    }
    const total = Math.max(1, publications.length)
    return Array.from(counts.entries())
      .map(([venue, count]) => {
        const citationValues = citations.get(venue) || []
        return {
          venue,
          count,
          sharePct: (count / total) * 100,
          medianCitations: median(citationValues),
          roleMix: roles.get(venue) || { First: 0, Senior: 0, Other: 0, Unknown: 0 },
        }
      })
      .sort((left, right) => right.count - left.count)
  }, [publications])

  const visibleVenueRows = showAllVenues ? venueConcentration : venueConcentration.slice(0, 6)

  const toggleType = (type: string) => {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        return current.filter((item) => item !== type)
      }
      return [...current, type]
    })
  }

  const handleSort = (key: PublicationDrilldownSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'title' || key === 'role' || key === 'type' || key === 'venue' ? 'asc' : 'desc')
  }

  const sortIndicator = (key: PublicationDrilldownSortKey) => {
    if (sortKey !== key) {
      return ''
    }
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const breakdownYears = fullYears
  const breakdownMaxCount = Math.max(1, ...breakdownYears.map((year) => Number(countsByYear.get(year) || 0)))
  const hoveredYear = hoveredBreakdownYear
  const hoveredYearCount = hoveredYear === null ? 0 : Number(countsByYear.get(hoveredYear) || 0)
  const hoveredPrevCount = hoveredYear === null ? 0 : Number(countsByYear.get(hoveredYear - 1) || 0)
  const hoveredYearYoY = hoveredPrevCount > 0
    ? ((hoveredYearCount - hoveredPrevCount) / hoveredPrevCount) * 100
    : null

  const trajectoryVisibleCount = Math.max(6, Math.min(trajectoryWindow, fullYears.length))
  const visibleYears = fullYears.slice(-trajectoryVisibleCount)
  const visibleRaw = yearSeriesRaw.slice(-trajectoryVisibleCount)
  const visibleMoving = yearSeriesMovingAvg.slice(-trajectoryVisibleCount)
  const visibleCumulative = yearSeriesCumulative.slice(-trajectoryVisibleCount)
  const trajectoryValues = trajectoryMode === 'cumulative'
    ? visibleCumulative
    : trajectoryMode === 'moving_avg'
      ? visibleMoving
      : visibleRaw

  const trajectoryLabels = visibleYears.map((year) => String(year))
  const trajectoryPoints = buildLinePoints(trajectoryValues, 320, 138, trajectoryLabels, 8)
  const movingPoints = buildLinePoints(visibleMoving, 320, 138, trajectoryLabels, 8)
  const rawPoints = buildLinePoints(visibleRaw, 320, 138, trajectoryLabels, 8)
  const trajectoryPath = monotonePathFromPoints(trajectoryPoints)
  const movingPath = monotonePathFromPoints(movingPoints)
  const volatilityAreaPath = rawPoints.length && movingPoints.length
    ? `M ${rawPoints.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${[...movingPoints].reverse().map((point) => `${point.x} ${point.y}`).join(' L ')} Z`
    : ''

  const badgeTone = trajectoryPhase === 'Expanding'
    ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
    : trajectoryPhase === 'Contracting'
      ? 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-700))]'
      : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'

  const contextClassLabel = volatilityIndex > 0.55
    ? 'High-variability portfolio'
    : volatilityIndex > 0.3
      ? 'Moderately variable portfolio'
      : 'Steady portfolio'

  const clearFilters = () => {
    setSelectedYear(null)
    setSelectedTypes([])
    setSelectedVenue(null)
    setSearchQuery('')
  }

  if (activeTab === 'summary') {
    const headlineValue = String(tile.value_display || formatInt(publications.length))
    const rollingWindow5y = yearSeriesRaw.slice(-5)
    const rollingMean5y = rollingWindow5y.length
      ? (rollingWindow5y.reduce((sum, value) => sum + value, 0) / rollingWindow5y.length)
      : 0
    const rollingMean5yRounded = Math.round(rollingMean5y * 10) / 10
    const rollingMean5yDisplay = Number.isInteger(rollingMean5yRounded)
      ? String(Math.round(rollingMean5yRounded))
      : rollingMean5yRounded.toFixed(1)
    const microValueClass = 'mt-0.5 text-[0.88rem] font-semibold leading-none tabular-nums text-[hsl(var(--tone-neutral-800))]'
    return (
      <div className="space-y-3">
        <div className={workspaceSectionClass}>
          <p className={workspaceSubheadingClass}>Headline results</p>
          <div className="mt-2 grid gap-2 lg:grid-cols-[9rem_minmax(0,1fr)]">
            <div className={cn(workspacePanelClass, 'flex min-h-[4.5rem] flex-col justify-center text-center')}>
              <p className={HOUSE_HEADING_H3_CLASS}>
                Total publications
              </p>
              <p className="mt-1 text-[1.7rem] font-semibold leading-none tracking-tight text-foreground">{headlineValue}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className={cn(workspacePanelClass, 'grid min-h-[4.5rem] grid-rows-[2rem_auto] py-2 text-center')}>
                <p className={cn(HOUSE_HEADING_H3_CLASS, 'leading-[1.1]')}>Active years</p>
                <p className={microValueClass}>{formatInt(activeYears)}</p>
              </div>
              <div className={cn(workspacePanelClass, 'grid min-h-[4.5rem] grid-rows-[2rem_auto] py-2 text-center')}>
                <p className={cn(HOUSE_HEADING_H3_CLASS, 'leading-[1.1]')}>Median per year</p>
                <p className={microValueClass}>{formatInt(Math.round(medianPerActiveYear))}</p>
              </div>
              <div className={cn(workspacePanelClass, 'grid min-h-[4.5rem] grid-rows-[2rem_auto] py-2 text-center')}>
                <p className={cn(HOUSE_HEADING_H3_CLASS, 'leading-[1.1]')}>Current year to date</p>
                <p className={microValueClass}>{formatInt(ytdCount)}</p>
              </div>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className={cn(workspacePanelClass, 'py-2')}>
              <p className={HOUSE_HEADING_H3_CLASS}>5-year rolling mean</p>
              <p className="mt-0.5 text-[0.88rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{rollingMean5yDisplay}</p>
            </div>
            <div className={cn(workspacePanelClass, 'py-2')}>
              <p className={HOUSE_HEADING_H3_CLASS}>Career peak</p>
              <p className="mt-0.5 text-[0.88rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{`${formatInt(peakYearData.count)} (${peakYearData.year})`}</p>
            </div>
          </div>

          <div className="mt-3">
            <p className={workspaceSubheadingClass}>Publication trend</p>
            <div className="mt-2 h-[14.6rem]">
              <PublicationsPerYearChart
                tile={tile}
                showCaption={false}
                showAxes
                fullYearLabels
                xAxisLabel="Publication year"
                yAxisLabel="Publications"
                enableWindowToggle
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    return (
      <div className="space-y-3">
        <div className={workspaceSectionClass}>
          <p className={workspaceHeadingClass}>Publications by year</p>
          <div className={cn('mt-2', workspacePanelCompactClass)}>
            <div className="overflow-x-auto">
              <div className="relative min-w-[42.5rem]">
                <div className="absolute inset-x-0 top-0 h-28">
                  {[25, 50, 75].map((pct) => (
                    <div key={`breakdown-grid-${pct}`} className={cn('absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)} style={{ top: `${pct}%` }} />
                  ))}
                </div>
                <div className="relative flex h-28 items-end gap-1">
                  {breakdownYears.map((year) => {
                    const count = Number(countsByYear.get(year) || 0)
                    const heightPct = count <= 0 ? 4 : Math.max(7, (count / breakdownMaxCount) * 100)
                    const isSelected = selectedYear === year
                    return (
                      <button
                        key={`breakdown-year-${year}`}
                        type="button"
                        className={cn(
                          'relative flex min-w-[1.95rem] flex-1 items-end rounded border border-transparent transition-all duration-200',
                          isSelected && 'border-[hsl(var(--tone-accent-500))]',
                        )}
                        onMouseEnter={() => setHoveredBreakdownYear(year)}
                        onMouseLeave={() => setHoveredBreakdownYear((current) => (current === year ? null : current))}
                        onClick={() => setSelectedYear((current) => (current === year ? null : year))}
                        title={`${year}: ${count} publications`}
                      >
                        <span
                          className={cn(
                            'block w-full rounded transition-[height,filter] duration-220 ease-out',
                            isSelected ? 'bg-[hsl(var(--tone-accent-700))]' : HOUSE_CHART_BAR_ACCENT_CLASS,
                          )}
                          style={{ height: `${heightPct}%` }}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[0.56rem] text-[hsl(var(--tone-neutral-600))]">
                  {breakdownYears.map((year) => (
                    <span key={`breakdown-label-${year}`} className="min-w-[1.95rem] flex-1 text-center font-semibold">{String(year).slice(-2)}</span>
                  ))}
                </div>
              </div>
            </div>
            {hoveredYear !== null ? (
              <div className="mt-2 rounded border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background px-2 py-1.5 text-[0.64rem] text-[hsl(var(--tone-neutral-700))]">
                <span className="font-semibold">{hoveredYear}</span>
                <span>{` | Count ${formatInt(hoveredYearCount)}`}</span>
                <span>{` | YoY ${hoveredYearYoY === null ? 'n/a' : `${hoveredYearYoY >= 0 ? '+' : ''}${hoveredYearYoY.toFixed(0)}%`}`}</span>
                <span>{` | Roles First ${(roleCountsByYear[hoveredYear]?.First || 0)}, Senior ${(roleCountsByYear[hoveredYear]?.Senior || 0)}`}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className={workspaceSectionClass}>
          <p className={workspaceHeadingClass}>Publication type</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableTypes.map((type) => {
              const isActive = selectedTypes.includes(type)
              return (
                <button
                  key={`type-filter-${type}`}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-[0.25rem] text-[0.63rem] font-medium leading-none transition-colors',
                    isActive
                      ? 'border-[hsl(var(--tone-neutral-900))] bg-[hsl(var(--tone-neutral-900))] text-white'
                      : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))]',
                  )}
                  onClick={() => toggleType(type)}
                >
                  {type}
                </button>
              )
            })}
            {!availableTypes.length ? (
              <span className="text-xs text-[hsl(var(--tone-neutral-500))]">No type data available</span>
            ) : null}
          </div>
        </div>

        <div className={workspaceSectionClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={workspaceHeadingClass}>Venue concentration</p>
            <button
              type="button"
              className="rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.62rem] font-medium text-[hsl(var(--tone-neutral-700))]"
              onClick={() => setShowAllVenues((current) => !current)}
            >
              {showAllVenues ? 'View top' : 'View all'}
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {visibleVenueRows.map((row) => {
              const isSelected = selectedVenue === row.venue
              return (
                <button
                  key={`venue-row-${row.venue}`}
                  type="button"
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
                    isSelected
                      ? 'border-[hsl(var(--tone-accent-500))] bg-[hsl(var(--tone-accent-50))]'
                      : 'border-[hsl(var(--tone-neutral-200)/0.72)] bg-background',
                  )}
                  onClick={() => setSelectedVenue((current) => (current === row.venue ? null : row.venue))}
                  title={`Median citations ${row.medianCitations.toFixed(1)} | First ${row.roleMix.First} | Senior ${row.roleMix.Senior}`}
                >
                  <div className="flex items-center justify-between gap-2 text-[0.62rem] text-[hsl(var(--tone-neutral-700))]">
                    <span className="truncate font-medium">{row.venue}</span>
                    <span>{`${formatInt(row.count)} (${row.sharePct.toFixed(0)}%)`}</span>
                  </div>
                  <div className="mt-1 h-[0.33rem] overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
                    <span className="block h-full rounded-full bg-[hsl(var(--tone-accent-600))]" style={{ width: `${Math.max(4, Math.min(100, row.sharePct))}%` }} />
                  </div>
                </button>
              )
            })}
            {!visibleVenueRows.length ? <p className="text-xs text-[hsl(var(--tone-neutral-500))]">No venue data</p> : null}
          </div>
        </div>

        <div className={workspaceSectionClass}>
          <div className="flex flex-wrap items-center gap-2">
            <p className={workspaceHeadingClass}>Paper list</p>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, venue, role"
              className="h-7 min-w-[12rem] rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 text-[0.66rem] text-[hsl(var(--tone-neutral-700))] outline-none focus:border-[hsl(var(--tone-accent-500))]"
            />
            <button
              type="button"
              className="rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.62rem] font-medium text-[hsl(var(--tone-neutral-700))]"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
          <div className="mt-2 overflow-x-auto rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background">
            <table className="w-full min-w-[47.5rem] border-collapse text-[0.64rem]">
              <thead className="bg-[hsl(var(--tone-neutral-50)/0.4)] text-[hsl(var(--tone-neutral-700))]">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    <button type="button" onClick={() => handleSort('year')}>{`Year${sortIndicator('year')}`}</button>
                  </th>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    <button type="button" onClick={() => handleSort('title')}>{`Title${sortIndicator('title')}`}</button>
                  </th>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    <button type="button" onClick={() => handleSort('role')}>{`Role${sortIndicator('role')}`}</button>
                  </th>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    <button type="button" onClick={() => handleSort('type')}>{`Type${sortIndicator('type')}`}</button>
                  </th>
                  <th className="px-2 py-1.5 text-left font-semibold">
                    <button type="button" onClick={() => handleSort('venue')}>{`Venue${sortIndicator('venue')}`}</button>
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    <button type="button" onClick={() => handleSort('citations')}>{`Citations${sortIndicator('citations')}`}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPublications.slice(0, 120).map((record) => (
                  <tr key={`paper-row-${record.workId}`} className={cn(HOUSE_CHART_GRID_LINE_CLASS, 'text-[hsl(var(--tone-neutral-700))]')}>
                    <td className="px-2 py-1.5">{record.year || 'n/a'}</td>
                    <td className="px-2 py-1.5">
                      <span className="line-clamp-1">{record.title}</span>
                    </td>
                    <td className="px-2 py-1.5">{record.role}</td>
                    <td className="px-2 py-1.5">{record.type}</td>
                    <td className="px-2 py-1.5">
                      <span className="line-clamp-1">{record.venue}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatInt(record.citations)}</td>
                  </tr>
                ))}
                {!sortedPublications.length ? (
                  <tr>
                    <td className="px-2 py-4 text-center text-[hsl(var(--tone-neutral-500))]" colSpan={6}>
                      No papers match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    const trajectoryMaxWindow = Math.max(6, fullYears.length)
    const trajectoryOptions = [
      { key: 'raw' as const, label: 'Raw' },
      { key: 'moving_avg' as const, label: 'Moving avg' },
      { key: 'cumulative' as const, label: 'Cumulative' },
    ]
    const activeTrajectoryIndex = Math.max(0, trajectoryOptions.findIndex((option) => option.key === trajectoryMode))
    return (
      <div className="space-y-3">
        <div className={workspaceSectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={workspaceHeadingClass}>Publication trajectory</p>
            <div className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid-cols-3')}>
              <span
                className={HOUSE_TOGGLE_THUMB_CLASS}
                style={{
                  width: 'calc(33.333333% - 0.16rem)',
                  left: `calc(${(100 / 3) * activeTrajectoryIndex}% + 2px)`,
                }}
                aria-hidden="true"
              />
              {trajectoryOptions.map((option) => (
                <button
                  key={`trajectory-mode-${option.key}`}
                  type="button"
                  className={cn(
                    HOUSE_TOGGLE_BUTTON_CLASS,
                    trajectoryMode === option.key
                      ? 'text-white'
                      : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                  )}
                  onClick={() => setTrajectoryMode(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_10.5rem]">
            <div className={workspacePanelCompactClass}>
              <svg viewBox="0 0 320 138" className="h-40 w-full">
                {[25, 50, 75].map((pct) => (
                  <line
                    key={`trajectory-grid-${pct}`}
                    x1={8}
                    x2={312}
                    y1={8 + ((122 * pct) / 100)}
                    y2={8 + ((122 * pct) / 100)}
                    stroke="hsl(var(--tone-neutral-200))"
                    strokeWidth={1}
                  />
                ))}
                {trajectoryMode === 'raw' && volatilityAreaPath ? (
                  <path d={volatilityAreaPath} fill="hsl(var(--tone-accent-200)/0.45)" />
                ) : null}
                {trajectoryMode === 'raw' && movingPath ? (
                  <path d={movingPath} fill="none" stroke="hsl(var(--tone-neutral-500))" strokeWidth={1.8} strokeDasharray="3 3" />
                ) : null}
                {trajectoryPath ? (
                  <path d={trajectoryPath} fill="none" stroke="hsl(var(--tone-accent-700))" strokeWidth={2.8} strokeLinecap="round" />
                ) : null}
              </svg>
              <div className="mt-1 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">
                <span>{visibleYears[0] || 'n/a'}</span>
                <span>{visibleYears[visibleYears.length - 1] || 'n/a'}</span>
              </div>
              <div className="mt-2">
                <input
                  type="range"
                  min={Math.min(6, trajectoryMaxWindow)}
                  max={trajectoryMaxWindow}
                  value={Math.min(trajectoryWindow, trajectoryMaxWindow)}
                  onChange={(event) => setTrajectoryWindow(Math.max(6, Number(event.target.value) || 6))}
                  className="w-full accent-[hsl(var(--tone-accent-700))]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background px-2 py-1.5">
                <p className="text-[0.56rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">Volatility index</p>
                <p className="mt-0.5 text-[0.78rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{volatilityIndex.toFixed(2)}</p>
              </div>
              <div className="rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background px-2 py-1.5">
                <p className="text-[0.56rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">Growth slope</p>
                <p className="mt-0.5 text-[0.78rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{growthSlope >= 0 ? '+' : ''}{growthSlope.toFixed(2)}/year</p>
              </div>
              <div className="rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background px-2 py-1.5">
                <p className="text-[0.56rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">Phase marker</p>
                <p className="mt-0.5 text-[0.78rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{trajectoryPhase}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="space-y-3">
        <div className={workspaceSectionClass}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[0.63rem] font-semibold', badgeTone)}>
              {contextClassLabel}
            </span>
            <span className="text-[0.64rem] text-[hsl(var(--tone-neutral-600))]">{trajectoryPhase} phase detected</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background p-2.5">
              <p className="text-[0.58rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">Portfolio structure</p>
              <p className="mt-1 text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Active years ${formatInt(activeYears)}`}</p>
              <p className="text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Median/year ${medianPerActiveYear.toFixed(1)}`}</p>
              <p className="text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Unknown year records ${formatInt(unknownYearCount)}`}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200)/0.72)] bg-background p-2.5">
              <p className="text-[0.58rem] uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">Distribution profile</p>
              <p className="mt-1 text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Peak year ${peakYearData.year} (${formatInt(peakYearData.count)})`}</p>
              <p className="text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Volatility ${volatilityIndex.toFixed(2)}`}</p>
              <p className="text-[0.67rem] text-[hsl(var(--tone-neutral-700))]">{`Slope ${growthSlope >= 0 ? '+' : ''}${growthSlope.toFixed(2)} / year`}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
            <button type="button" className="rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.62rem] font-medium text-[hsl(var(--tone-neutral-700))] text-left">
              View authorship distribution
            </button>
            <button type="button" className="rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.62rem] font-medium text-[hsl(var(--tone-neutral-700))] text-left">
              View collaboration structure
            </button>
            <button type="button" className="rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.62rem] font-medium text-[hsl(var(--tone-neutral-700))] text-left">
              View impact concentration
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab === 'methods') {
    return (
      <div className="space-y-3">
        <details className={cn(workspaceSectionClass, 'p-0')}>
          <summary className={cn(workspaceHeadingClass, 'cursor-pointer list-none px-3 py-2')}>
            Method details
          </summary>
          <div className="space-y-1.5 border-t border-[hsl(var(--tone-neutral-200)/0.72)] px-3 py-2.5 text-[0.64rem] text-[hsl(var(--tone-neutral-700))]">
            <p><span className="font-semibold">Formula:</span> {String(tile.drilldown?.formula || 'Not available')}</p>
            <p><span className="font-semibold">Filters:</span> Publication year when available; author-linked publication records.</p>
            <p><span className="font-semibold">Sources:</span> {(tile.data_source || []).join(', ') || 'Not available'}</p>
            <p><span className="font-semibold">Updated:</span> {String(tile.tooltip_details?.update_frequency || 'Not available')}</p>
            <p><span className="font-semibold">Confidence:</span> {(Number(tile.confidence_score || 0)).toFixed(2)}</p>
            <p className="text-[hsl(var(--tone-neutral-500))]">{String(tile.drilldown?.confidence_note || '')}</p>
          </div>
        </details>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300)/0.8)] bg-[hsl(var(--tone-neutral-50)/0.34)] px-3 py-4 text-xs text-[hsl(var(--tone-neutral-500))]">
      Select a tab to inspect this metric.
    </div>
  )
}

function HIndexNeedsChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
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
      key: 'need-2',
      label: '+2',
      needed: 2,
      count: candidateGaps.filter((gap) => gap === 2).length,
    },
    {
      key: 'need-3',
      label: '+3',
      needed: 3,
      count: candidateGaps.filter((gap) => gap === 3).length,
    },
    {
      key: 'need-4',
      label: '+4',
      needed: 4,
      count: candidateGaps.filter((gap) => gap === 4).length,
    },
    {
      key: 'need-5-plus',
      label: '+5+',
      needed: 5,
      count: candidateGaps.filter((gap) => gap >= 5).length,
    },
  ]), [candidateGaps])
  const animationKey = useMemo(
    () => bars.map((bar) => `${bar.key}-${bar.count}`).join('|'),
    [bars],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  const maxCount = Math.max(1, ...bars.map((bar) => bar.count))
  const scaledMax = maxCount * 1.18

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-8',
          chartVisible ? HOUSE_CHART_ENTERED_CLASS : HOUSE_CHART_EXITED_CLASS,
        )}
      >
        <div className="absolute inset-x-2 bottom-8 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`h-needed-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const heightPct = bar.count <= 0 ? 3 : Math.max(6, (Math.max(0, bar.count) / scaledMax) * 100)
              const isActive = hoveredIndex === index
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
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.count)} {bar.count === 1 ? 'paper' : 'papers'}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 grid grid-flow-col auto-cols-fr items-start gap-1">
          {bars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{bar.label}</p>
              <p
                className="mt-px text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
                aria-hidden="true"
              >
                ytd
              </p>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-0.5 text-center">
          <p className="text-[0.6rem] font-semibold leading-none text-[hsl(var(--tone-neutral-600))]">
            Citations needed
          </p>
        </div>
      </div>
    </div>
  )
}

function HIndexTrajectoryPanel({
  tile,
  mode,
  direction,
}: {
  tile: PublicationMetricTilePayload
  mode: HIndexViewMode
  direction: 1 | -1
}) {
  const [renderMode, setRenderMode] = useState<HIndexViewMode>(mode)
  const [panelVisible, setPanelVisible] = useState(true)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setRenderMode(mode)
      setPanelVisible(true)
      return
    }
    if (mode === renderMode) {
      setPanelVisible(true)
      return
    }
    setPanelVisible(false)
    let raf = 0
    const timeoutId = window.setTimeout(() => {
      setRenderMode(mode)
      raf = window.requestAnimationFrame(() => {
        setPanelVisible(true)
      })
    }, 140)
    return () => {
      window.clearTimeout(timeoutId)
      window.cancelAnimationFrame(raf)
    }
  }, [mode, renderMode])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'h-full w-full transition-[opacity,transform,filter] duration-320 ease-out',
          panelVisible ? 'opacity-100 translate-x-0 scale-100 blur-0' : directionalExitClass(direction),
        )}
      >
        {renderMode === 'needed' ? <HIndexNeedsChart tile={tile} /> : <HIndexYearChart tile={tile} showCaption={false} />}
      </div>
    </div>
  )
}

function HIndexProgressInline({ tile }: { tile: PublicationMetricTilePayload }) {
  const progressMeta = buildHIndexProgressMeta(tile)
  return (
    <div className="w-full max-w-[11.7rem] space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-out', HOUSE_CHART_BAR_POSITIVE_CLASS)}
            style={{ width: `${progressMeta.progressPct}%` }}
            aria-hidden="true"
          />
        </div>
        <span className="text-[0.56rem] font-medium leading-none text-[hsl(var(--tone-neutral-600))]">
          {Math.round(progressMeta.progressPct)}%
        </span>
      </div>
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
  return (
    <div className="flex items-center">
      <div
        className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={{
            width: 'calc(50% - 0.125rem)',
            left: mode === 'needed' ? 'calc(50% + 1px)' : '2px',
            willChange: 'left,width',
          }}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            mode === 'trajectory' ? 'text-white' : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
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
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
            mode === 'needed' ? 'text-white' : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
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
          Needed
        </button>
      </div>
    </div>
  )
}

function InfluentialTrendPanel({ tile }: { tile: PublicationMetricTilePayload }) {
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
  if (!values.length) {
    return <div className={dashboardTileStyles.emptyChart}>No influential citation trend</div>
  }
  const width = 220
  const height = 92
  const points = buildLinePoints(values, width, height, labels, 8)
  const baselineY = height - 8
  const areaOffsetY = 0.7
  const areaPoints = points.map((point) => ({
    x: point.x,
    y: Math.min(baselineY, point.y + areaOffsetY),
  }))
  const path = monotonePathFromPoints(points)
  const areaCurve = monotonePathFromPoints(areaPoints)
  const areaPath = areaPoints.length
    ? `${areaCurve} L ${areaPoints[areaPoints.length - 1].x} ${baselineY} L ${areaPoints[0].x} ${baselineY} Z`
    : ''

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-2 pt-2.5">
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <path d={areaPath} className="fill-[hsl(var(--tone-accent-100))]" fillOpacity={0.68} />
            <path
              d={path}
              fill="none"
              className="stroke-[hsl(var(--tone-accent-700))]"
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
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
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
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
            className={cn('w-full rounded-sm bg-[hsl(var(--tone-accent-400))]', highlighted && HOUSE_CHART_BAR_POSITIVE_CLASS)}
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
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const max = Math.max(1, ...safe)
  return (
    <div className="flex h-8 items-end gap-2">
      {safe.map((value, index) => (
        <div key={`${index}-${value}`} className="flex w-full flex-col items-center gap-1">
          <div
            className={cn('w-full rounded-sm', index === 0 ? 'bg-[hsl(var(--tone-accent-700))]' : 'bg-[hsl(var(--tone-accent-400))]')}
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
      <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--tone-accent-200))" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="hsl(var(--tone-accent-700))"
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
    return <div className="h-8 w-8 rounded-full border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const pct = safe[0] / total
  const angle = pct * 360
  const gradient = `conic-gradient(hsl(var(--tone-accent-700)) 0deg ${angle}deg, hsl(var(--tone-positive-400)) ${angle}deg 360deg)`
  return (
    <div className="h-8 w-8 rounded-full" style={{ background: gradient }}>
      <div className="relative left-sz-7 top-sz-7 h-sz-18 w-sz-18 rounded-full bg-card" />
    </div>
  )
}

function MiniLine({
  values,
  overlay = [],
  colorCode = 'hsl(var(--tone-accent-700))',
}: {
  values: number[]
  overlay?: number[]
  colorCode?: string
}) {
  if (!values.length) {
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
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
          stroke="hsl(var(--tone-accent-400))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={overlayPoints}
        />
      ) : null}
      <polyline
        fill="none"
        stroke={colorCode}
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
    return (
      <MiniLine
        values={trendValues}
        colorCode={tile.delta_color_code || 'hsl(var(--tone-accent-700))'}
      />
    )
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
      colorCode={tile.delta_color_code || 'hsl(var(--tone-accent-700))'}
    />
  )
}

export function PublicationsTopStrip({
  metrics,
  loading = false,
  token = null,
  fetchMetricDetail = fetchPublicationMetricDetail,
}: PublicationsTopStripProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTileKey, setActiveTileKey] = useState<string>('')
  const [activeTileDetail, setActiveTileDetail] = useState<PublicationMetricTilePayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [activeDrilldownTab, setActiveDrilldownTab] = useState<DrilldownTab>('summary')
  const [momentumWindowMode, setMomentumWindowMode] = useState<MomentumWindowMode>('12m')
  const [momentumTransitionDirection, setMomentumTransitionDirection] = useState<1 | -1>(1)
  const [hIndexViewMode, setHIndexViewMode] = useState<HIndexViewMode>('trajectory')
  const [hIndexTransitionDirection, setHIndexTransitionDirection] = useState<1 | -1>(1)
  const [fieldPercentileThreshold, setFieldPercentileThreshold] = useState<FieldPercentileThreshold>(75)
  const [fieldPercentileTransitionDirection, setFieldPercentileTransitionDirection] = useState<1 | -1>(1)
  const [insightsVisible, setInsightsVisible] = useState(
    () => readAccountSettings().publicationInsightsDefaultVisibility !== 'hidden',
  )

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

  useEffect(() => {
    setActiveDrilldownTab('summary')
  }, [activeTileKey])

  const onSelectTile = async (tile: PublicationMetricTilePayload) => {
    setActiveTileKey(tile.key)
    setActiveTileDetail(tile)
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

  return (
    <>
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              {metrics?.is_updating ? <span className="text-amber-700">Updating...</span> : null}
              {metrics?.status === 'FAILED' ? <span className="text-amber-700">Last update failed</span> : null}
            </div>
            <button
              type="button"
              data-stop-tile-open="true"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.68rem] font-semibold leading-none transition-colors',
                insightsVisible
                  ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
                  : 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-700))]',
              )}
              onClick={() => setInsightsVisible((current) => !current)}
              aria-pressed={insightsVisible}
              aria-label={insightsVisible ? 'Set publication insights not visible' : 'Set publication insights visible'}
            >
              {insightsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>{insightsVisible ? 'Visible' : 'Not visible'}</span>
            </button>
          </div>
          <div className={cn(HOUSE_SURFACE_TOP_PANEL_CLASS, 'px-2.5 py-1.5')}>
            <p className={HOUSE_HEADING_H1_CLASS}>
              Publication insights
            </p>
          </div>

          {!insightsVisible ? (
            <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-xs text-[hsl(var(--tone-neutral-600))]">
              Publication insights are hidden.
            </div>
          ) : loading && tiles.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
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
                const pinBadgeBottom = true
                let secondaryText: ReactNode = subtitle || '\u2014'
                let detailText: ReactNode | undefined = effectiveDeltaDisplay || undefined
                let contentGridClassName: string | undefined
                let visual: ReactNode = (
                  <div className="flex h-full min-h-0 items-center rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] p-1.5">
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
                  detailText = 'Last 5 years shown'
                  visual = <PublicationsPerYearChart tile={tile} showCaption={false} />
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
                        className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
                        data-stop-tile-open="true"
                      >
                        <span
                          className={HOUSE_TOGGLE_THUMB_CLASS}
                          style={{
                            width: 'calc(50% - 0.125rem)',
                            left: momentumWindowMode === '5y' ? 'calc(50% + 1px)' : '2px',
                            willChange: 'left,width',
                          }}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            HOUSE_TOGGLE_BUTTON_CLASS,
                            momentumWindowMode === '12m'
                              ? 'text-white'
                              : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (momentumWindowMode === '12m') {
                              return
                            }
                            setMomentumTransitionDirection(-1)
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
                              : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (momentumWindowMode === '5y') {
                              return
                            }
                            setMomentumTransitionDirection(1)
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
                  detailText = momentumWindowMode === '5y'
                    ? 'Last 5 years (1 year vs prior 4 years)'
                    : 'Last 12 months (3 months vs prior 9 months)'
                  visual = (
                    <MomentumTilePanel
                      tile={tile}
                      mode={momentumWindowMode}
                      direction={momentumTransitionDirection}
                      yearBreakdown={momentumYearBreakdown}
                    />
                  )
                } else if (tile.key === 'h_index_projection') {
                  const hIndexMeta = buildHIndexProgressMeta(tile)
                  primaryValue = Number.isFinite(hIndexMeta.currentH) ? `h ${formatInt(hIndexMeta.currentH)}` : mainValueDisplay
                  secondaryText = `Progress to h ${formatInt(hIndexMeta.targetH)}`
                  detailText = <HIndexProgressInline tile={tile} />
                  badgeNode = (
                    <HIndexViewToggle
                      mode={hIndexViewMode}
                      onModeChange={(nextMode) => {
                        if (nextMode === hIndexViewMode) {
                          return
                        }
                        const currentIndex = hIndexViewMode === 'trajectory' ? 0 : 1
                        const targetIndex = nextMode === 'trajectory' ? 0 : 1
                        setHIndexTransitionDirection(targetIndex > currentIndex ? 1 : -1)
                        setHIndexViewMode(nextMode)
                      }}
                    />
                  )
                  visual = (
                    <HIndexTrajectoryPanel
                      tile={tile}
                      mode={hIndexViewMode}
                      direction={hIndexTransitionDirection}
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
                  secondaryText = `Top 3 cited papers account for ${impactTop3PctRounded}% of total citations`
                  detailText = undefined
                  if (impactBadgeLabel) {
                    badgeNode = (
                      <span className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2.5 py-[0.2rem] text-[0.66rem] font-medium leading-none text-[hsl(var(--tone-neutral-700))]">
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
                  const activeThresholdIndex = Math.max(0, availableThresholds.indexOf(activeThreshold))
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
                  secondaryText = `Papers at or above ${activeThreshold}th percentile`
                  detailText = undefined
                  contentGridClassName = 'grid-cols-[minmax(0,0.85fr)_minmax(0,0.99fr)]'
                  badgeNode = (
                    <div className="flex w-full flex-col items-center gap-0.5">
                      <p className="text-center text-[0.56rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">
                        Percentile
                      </p>
                      <div
                        className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'mx-auto grid w-full')}
                        style={{ gridTemplateColumns: `repeat(${availableThresholds.length}, minmax(0, 1fr))` }}
                        data-stop-tile-open="true"
                      >
                        <span
                          className={HOUSE_TOGGLE_THUMB_CLASS}
                          style={{
                            width: `calc(${100 / availableThresholds.length}% - 0.125rem)`,
                            left: `calc(${(100 / availableThresholds.length) * activeThresholdIndex}% + 2px)`,
                            willChange: 'left,width',
                          }}
                          aria-hidden="true"
                        />
                        {availableThresholds.map((threshold) => (
                          <button
                            key={`field-threshold-${threshold}`}
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(
                              HOUSE_TOGGLE_BUTTON_CLASS,
                              activeThreshold === threshold
                                ? 'text-white'
                                : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (activeThreshold === threshold) {
                                return
                              }
                              const targetIndex = Math.max(0, availableThresholds.indexOf(threshold))
                              const currentIndex = Math.max(0, availableThresholds.indexOf(activeThreshold))
                              setFieldPercentileTransitionDirection(targetIndex > currentIndex ? 1 : -1)
                              setFieldPercentileThreshold(threshold)
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={activeThreshold === threshold}
                          >
                            {threshold}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                  visual = (
                    <FieldPercentilePanel
                      tile={tile}
                      threshold={activeThreshold}
                      direction={fieldPercentileTransitionDirection}
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
                    <span className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2.5 py-[0.2rem] text-[0.66rem] font-medium leading-none text-[hsl(var(--tone-neutral-700))]">
                      Median author position {medianAuthorPositionDisplay}
                    </span>
                  )
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
                  primaryValue = mainValueDisplay
                  secondaryText = 'Influential citations over lifetime publications'
                  detailText = influentialRatioWhole === null ? undefined : `${influentialRatioWhole}% of total citations`
                  visual = <InfluentialTrendPanel tile={tile} />
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
                    pinBadgeBottom={pinBadgeBottom}
                    subtitle={secondaryText}
                    detail={detailText}
                    contentGridClassName={contentGridClassName}
                    visual={visual}
                  />
                )
              })}
            </div>
          )}
          <div className={cn(HOUSE_SURFACE_TOP_PANEL_CLASS, 'px-2 py-2')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className={cn(HOUSE_HEADING_H1_SOFT_CLASS, 'pt-1')}>
                Tools
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Generate publication insights report"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Generate publication insights report</span>
                </button>
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300)/0.8)] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Share"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-sz-560">
          {activeTile ? (
            <div className="space-y-4 pr-8">
              <div className={HOUSE_SURFACE_LEFT_BORDER_CLASS}>
                <h3 className={HOUSE_HEADING_TITLE_CLASS}>{activeTile.drilldown.title}</h3>
                <p className={cn(HOUSE_TEXT_CLASS, 'mt-1')}>{activeTile.drilldown.definition}</p>
                {detailLoading ? <p className={cn('mt-2', HOUSE_TEXT_SOFT_CLASS)}>Loading metric detail...</p> : null}
                {detailError ? <p className="mt-2 text-xs text-amber-700">{detailError}</p> : null}
              </div>
              <Tabs
                value={activeDrilldownTab}
                onValueChange={(value) => setActiveDrilldownTab(value as DrilldownTab)}
                className="w-full"
              >
                <TabsList className={cn(HOUSE_SURFACE_TOP_PANEL_CLASS, 'grid h-auto w-full grid-cols-5 gap-1 rounded-md p-1')}>
                  {DRILLDOWN_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="!text-[0.69rem] font-medium leading-none text-[hsl(var(--tone-neutral-700))] data-[state=active]:bg-background data-[state=active]:text-[hsl(var(--tone-neutral-900))] data-[state=active]:shadow-[0_1px_2px_hsl(var(--tone-neutral-900)/0.1)]"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="mt-3">
                  {activeTile.key === 'this_year_vs_last' ? (
                    <TotalPublicationsDrilldownWorkspace tile={activeTile} activeTab={activeDrilldownTab} />
                  ) : (
                    <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-4 text-xs text-[hsl(var(--tone-neutral-500))]">
                      Tab scaffold ready.
                    </div>
                  )}
                </div>
              </Tabs>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a metric tile to inspect its drilldown.</div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}










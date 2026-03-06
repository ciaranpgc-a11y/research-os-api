import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, Download, Eye, EyeOff, FileText, Hammer, Share2, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui'
import { Button } from '@/components/ui'
import { DrilldownSheet } from '@/components/ui'
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

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
  forceInsightsVisible?: boolean
}

type PublicationInsightsSectionKey = 'uncited_works' | 'citation_drivers' | 'citation_activation'
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

function formatCitationActivationTableTooltip(recordsCount: number): string {
  return `Your ${formatInt(recordsCount)} newly active publications are listed here with last-12-month and total citations. Select a title to open it in your library.`
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
type RecentConcentrationWindowMode = Exclude<PublicationsWindowMode, 'all'>
type PublicationTrendsVisualMode = 'bars' | 'line'
type PublicationCategoryValueMode = 'absolute' | 'percentage' | 'perPaper'
type PublicationCategoryDisplayMode = 'chart' | 'table'
type JournalBreakdownViewMode = 'top-ten' | 'all-journals'
type TopicBreakdownViewMode = 'top-ten' | 'all-topics'
type HIndexViewMode = 'trajectory' | 'needed'
type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99
type DrilldownTab = 'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'

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
  { value: 'all', label: 'Life' },
]
const RECENT_CONCENTRATION_WINDOW_OPTIONS: Array<{ value: RecentConcentrationWindowMode; label: string }> = [
  { value: '1y', label: '1y' },
  { value: '3y', label: '3y' },
  { value: '5y', label: '5y' },
]
const PUBLICATION_TRENDS_VISUAL_OPTIONS: Array<{ value: PublicationTrendsVisualMode; label: string }> = [
  { value: 'bars', label: 'Bar view' },
  { value: 'line', label: 'Line view' },
]
const PUBLICATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage', label: '%' },
]
const PUBLICATION_CITATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage', label: '%' },
  { value: 'perPaper', label: 'Per paper' },
]
const PUBLICATION_DISPLAY_MODE_OPTIONS: Array<{ value: PublicationCategoryDisplayMode; label: string }> = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
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
const HOUSE_SURFACE_BANNER_CLASS = publicationsHouseSurfaces.banner
const HOUSE_SURFACE_BANNER_INFO_CLASS = publicationsHouseSurfaces.bannerInfo
const HOUSE_SURFACE_BANNER_WARNING_CLASS = publicationsHouseSurfaces.bannerWarning
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
const HOUSE_DRILLDOWN_RANGE_CLASS = publicationsHouseDrilldown.range
const HOUSE_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_DRILLDOWN_STAT_VALUE_CLASS = publicationsHouseDrilldown.statValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS = publicationsHouseDrilldown.summaryStatValueEmphasis
const HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS = publicationsHouseDrilldown.summaryStatCard
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_DRILLDOWN_OVERLINE_CLASS = publicationsHouseDrilldown.overline
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = publicationsHouseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_NOTE_CLASS = publicationsHouseDrilldown.note
const HOUSE_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_DRILLDOWN_CHART_AREA_SVG_CLASS = publicationsHouseDrilldown.chartAreaSvg
const HOUSE_DRILLDOWN_CHART_MOVING_SVG_CLASS = publicationsHouseDrilldown.chartMovingSvg
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
  const activeVisualModeIndex = PUBLICATION_TRENDS_VISUAL_OPTIONS.findIndex((option) => option.value === value)

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
        data-ui="publications-trends-visual-toggle"
        data-house-role="chart-toggle"
        style={{ width: '5.25rem' }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeVisualModeIndex, PUBLICATION_TRENDS_VISUAL_OPTIONS.length, false)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'bars' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'bars'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('bars')
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
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'line' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'line'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('line')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
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
        </button>
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

function buildLineTicksFromRange(startMs: number, endMs: number, mode: PublicationsWindowMode): PublicationLineAxisTick[] {
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
    const targetTickCount = endYear - startYear <= 5
      ? 5
      : endYear - startYear <= 12
        ? 4
        : endYear - startYear <= 25
          ? 4
          : 3
    const step = Math.max(1, Math.ceil((endYear - startYear + 1) / Math.max(1, targetTickCount)))
    const tickYears = new Set<number>()
    for (let year = startYear; year <= endYear; year += step) {
      tickYears.add(year)
    }
    tickYears.add(endYear)

    const yearBoundaryTicks = Array.from(tickYears)
      .sort((left, right) => left - right)
      .map((year) => {
        const yearStartMs = new Date(Date.UTC(year, 0, 1)).getTime()
        const clampedMs = Math.max(startMs, Math.min(endMs, yearStartMs))
        const position = Math.max(0, Math.min(1, (clampedMs - startMs) / spanMs))
        return {
          key: `line-axis-${mode}-${year}`,
          label: String(year),
          subLabel: undefined,
          leftPct: position * 100,
        }
      })
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
  showCaption = false,
  animate = true,
  collapse = false,
}: {
  tile: PublicationMetricTilePayload
  showCaption?: boolean
  animate?: boolean
  collapse?: boolean
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
  const bars = useMemo<Array<{ year: number; value: number }>>(
    () => (hasValidSeries
      ? years.map((year, index) => ({
          year,
          value: values[index],
        }))
      : []),
    [hasValidSeries, values, years],
  )
  const animationKey = bars.map((bar) => `${bar.year}-${bar.value}`).join('|')
  const hasBars = bars.length > 0
  const barsExpanded = useUnifiedToggleBarAnimation(`${animationKey}|hindex-year`, hasBars)
  const isEntryCycle = useIsFirstChartEntry(`${animationKey}|hindex-year`, hasBars)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const rawTargetValues = useMemo(
    () => bars.map((bar) => Math.max(0, bar.value)),
    [bars],
  )
  const targetValues = useMemo(
    () => (collapse ? rawTargetValues.map(() => 0) : rawTargetValues),
    [collapse, rawTargetValues],
  )
  const animatedValues = useEasedSeries(
    targetValues,
    `${animationKey}|values|${collapse ? 'collapse' : 'expand'}`,
    animate && hasBars,
    axisDurationMs,
  )
  const targetMax = Math.max(1, ...rawTargetValues) * 1.18
  const animatedMax = useEasedValue(targetMax, `${animationKey}|max`, animate && hasBars, axisDurationMs)

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>No h-index timeline</div>
  }

  const scaledMax = Math.max(1, animatedMax)
  const axisLayout = buildChartAxisLayout({
    axisLabels: bars.map((bar) => String(bar.year).slice(-2)),
    axisSubLabels: bars.map(() => null),
    dense: bars.length >= 6,
  })

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col">
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
              key={`h-grid-${pct}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS)}
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const animatedValue = Math.max(0, animatedValues[index] ?? 0)
              const heightPct = animatedValue <= 0 ? 3 : Math.max(6, (animatedValue / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const toneClass = HOUSE_CHART_BAR_ACCENT_CLASS
              return (
                <div
                  key={`${bar.year}-${index}`}
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
                    h {formatInt(animatedValue)}
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
            <div key={`${bar.year}-${index}-axis`} className={cn('text-center leading-none', HOUSE_TOGGLE_CHART_LABEL_CLASS)}>
              <p className={cn(HOUSE_CHART_AXIS_TEXT_CLASS, 'break-words px-0.5 leading-tight')}>{String(bar.year).slice(-2)}</p>
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
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('5y')
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
    setWindowMode('5y')
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
                  onMouseEnter={effectiveVisualMode === 'line' ? undefined : () => setHoveredIndex(index)}
                  onMouseLeave={effectiveVisualMode === 'line' ? undefined : () => setHoveredIndex((current) => (current === index ? null : current))}
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

type PublicationDrilldownRecord = {
  workId: string
  year: number | null
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
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('5y')
  const [valueMode, setValueMode] = useState<PublicationCategoryValueMode>('absolute')
  const [displayMode, setDisplayMode] = useState<PublicationCategoryDisplayMode>('chart')
  const [renderDisplayMode, setRenderDisplayMode] = useState<PublicationCategoryDisplayMode>('chart')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  useEffect(() => {
    setWindowMode('5y')
    setValueMode('absolute')
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
    (Math.round(Math.max(0, value) * 10) / 10).toFixed(1)
  )
  const formatRenderedValue = (value: number): string => (
    showPercentageMode
      ? `${Math.round(value)}%`
      : showPerPaperMode
        ? formatPerPaperValue(value)
        : formatInt(value)
  )
  const formatTooltipMeta = (
    bar: { percentage: number; paperCount: number },
  ): string | null => {
    if (valueMetric !== 'citations') {
      return null
    }
    const paperCount = Math.max(0, Math.round(bar.paperCount))
    const papersLabel = `${formatInt(paperCount)} ${paperCount === 1 ? 'paper' : 'papers'}`
    if (showPercentageMode) {
      return papersLabel
    }
    const shareLabel = `${Math.round(bar.percentage)}%`
    return `${shareLabel} · ${papersLabel}`
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
  const windowModeThumbStyle: CSSProperties = windowMode === 'all'
    ? {
      width: '28%',
      left: '72%',
      willChange: 'left,width',
      transitionDuration: isEntryCycle ? '0ms' : undefined,
    }
    : windowMode === '5y'
      ? {
        width: '24%',
        left: '48%',
        willChange: 'left,width',
        transitionDuration: isEntryCycle ? '0ms' : undefined,
      }
      : windowMode === '3y'
        ? {
          width: '24%',
          left: '24%',
          willChange: 'left,width',
          transitionDuration: isEntryCycle ? '0ms' : undefined,
        }
        : {
          width: '24%',
          left: '0%',
          willChange: 'left,width',
          transitionDuration: isEntryCycle ? '0ms' : undefined,
        }
  const activeDisplayModeIndex = PUBLICATION_DISPLAY_MODE_OPTIONS.findIndex((option) => option.value === displayMode)
  const useSeparatedValueModeToggle = valueModeOptions.length === 3
  const activeValueModeIndex = valueModeOptions.findIndex((option) => option.value === valueMode)
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
          <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[24%_24%_24%_28%]')}
                data-stop-tile-open="true"
                data-ui={`${dimension}-window-toggle`}
                data-house-role="chart-toggle"
                style={{ width: '8.75rem', minWidth: '8.75rem', maxWidth: '8.75rem' }}
              >
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={windowModeThumbStyle}
                  aria-hidden="true"
                />
                {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
                  <button
                    key={`${dimension}-window-${option.value}`}
                    type="button"
                    data-stop-tile-open="true"
                    className={cn(
                      HOUSE_TOGGLE_BUTTON_CLASS,
                      windowMode === option.value
                        ? 'text-white'
                        : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (windowMode === option.value) {
                        return
                      }
                      setWindowMode(option.value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    aria-pressed={windowMode === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
          </div>
          {enableValueModeToggle ? (
            <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
              <div
                className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, useSeparatedValueModeToggle && 'overflow-hidden')}
                data-stop-tile-open="true"
                data-ui={`${dimension}-value-mode-toggle`}
                data-house-role="chart-toggle"
                style={{
                  width: valueModeOptions.length === 3 ? '11.5rem' : '7rem',
                  gridTemplateColumns: valueModeOptions.length === 3
                    ? '2.8fr 1.35fr 3.75fr'
                    : `repeat(${valueModeOptions.length}, minmax(0, 1fr))`,
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
                          'relative z-[1] min-w-0 px-1.5',
                          optionIndex === 0
                            ? '!rounded-l-full !rounded-r-none'
                            : optionIndex === valueModeOptions.length - 1
                              ? '!rounded-l-none !rounded-r-full'
                              : '!rounded-none',
                          option.value !== valueMode
                            ? HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS
                            : 'bg-foreground text-background shadow-sm',
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
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
              data-stop-tile-open="true"
              data-ui={`${dimension}-display-mode-toggle`}
              data-house-role="chart-toggle"
              style={{ width: '7rem' }}
            >
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={buildTileToggleThumbStyle(activeDisplayModeIndex, PUBLICATION_DISPLAY_MODE_OPTIONS.length, isEntryCycle)}
                  aria-hidden="true"
                />
                {PUBLICATION_DISPLAY_MODE_OPTIONS.map((option) => (
                  <button
                    key={`${dimension}-display-mode-${option.value}`}
                    type="button"
                    data-stop-tile-open="true"
                    className={cn(
                      HOUSE_TOGGLE_BUTTON_CLASS,
                      displayMode === option.value
                        ? 'text-white'
                        : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (displayMode === option.value) {
                        if (option.value === 'table') {
                          setDisplayMode('chart')
                        }
                        return
                      }
                      setDisplayMode(option.value)
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    aria-pressed={displayMode === option.value}
                  >
                    {option.label}
                  </button>
                ))}
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
                    {showPerPaperMode ? 'Cites/paper' : 'Count'}
                  </th>
                  <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                    {showPerPaperMode ? 'Papers' : 'Share'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${dimension}-table-row-${row.label}`} className="house-table-row">
                    <td className="house-table-cell-text px-2 py-2">
                      <span className="block max-w-full break-words leading-snug">{row.label}</span>
                    </td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatPerPaperValue(row.perPaper) : formatInt(row.count)}
                    </td>
                    <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                      {showPerPaperMode ? formatInt(row.paperCount) : `${row.percentage.toFixed(1)}%`}
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
                      {showPerPaperMode ? formatInt(tableTotalPapers) : '100.0%'}
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
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
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
                      <span className="block">{formatRenderedValue(animatedValue)}</span>
                      {formatTooltipMeta(bar) ? (
                        <span className="mt-0.5 block whitespace-nowrap text-[0.64rem] leading-tight opacity-80">
                          {formatTooltipMeta(bar)}
                        </span>
                      ) : null}
                    </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      HOUSE_CHART_BAR_ACCENT_CLASS,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
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
            {showPercentageMode ? 'Share (%)' : showPerPaperMode ? 'Citations per paper' : yAxisLabel}
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
  const activeIndex = value === 'bar' ? 0 : 1

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
        style={{ width: '7rem' }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeIndex, 2, false)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'bar' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'bar'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('bar')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Bar
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'table' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'table'}
          onClick={(event) => {
            event.stopPropagation()
            onChange(value === 'table' ? 'bar' : 'table')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          Table
        </button>
      </div>
    </div>
  )
}

function PublicationWindowToggle({
  value,
  onChange,
  options = PUBLICATIONS_WINDOW_OPTIONS,
}: {
  value: PublicationsWindowMode | RecentConcentrationWindowMode
  onChange: (mode: PublicationsWindowMode | RecentConcentrationWindowMode) => void
  options?: Array<{ value: PublicationsWindowMode | RecentConcentrationWindowMode; label: string }>
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const gridColsClass = options.length === 3 ? 'grid-cols-3' : 'grid-cols-[24%_24%_24%_28%]'
  const toggleWidth = options.length === 3 ? '6.75rem' : '8.75rem'

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, gridColsClass)}
        data-stop-tile-open="true"
        style={{ width: toggleWidth, minWidth: toggleWidth, maxWidth: toggleWidth }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeIndex, options.length, false)}
          aria-hidden="true"
        />
        {options.map((option) => (
          <button
            key={`recent-concentration-window-${option.value}`}
            type="button"
            data-stop-tile-open="true"
            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
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
  onOpenPublication: _onOpenPublication,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  animateCharts?: boolean
  onOpenPublication?: (workId: string) => void
}) {
  void _onOpenPublication
  const [publicationTrendsWindowMode, setPublicationTrendsWindowMode] = useState<PublicationsWindowMode>('5y')
  const [publicationTrendsVisualMode, setPublicationTrendsVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const [publicationTrendsExpanded, setPublicationTrendsExpanded] = useState(true)
  const [publicationTypeTrendsExpanded, setPublicationTypeTrendsExpanded] = useState(true)
  const [articleTypeTrendsExpanded, setArticleTypeTrendsExpanded] = useState(true)
  const [trajectoryMode, setTrajectoryMode] = useState<PublicationTrajectoryMode>('raw')
  const [trajectoryWindow, setTrajectoryWindow] = useState(12)
  const [venueBreakdownExpanded, setVenueBreakdownExpanded] = useState(true)
  const [journalBreakdownViewMode, setJournalBreakdownViewMode] = useState<JournalBreakdownViewMode>('top-ten')
  const [topicBreakdownViewMode, setTopicBreakdownViewMode] = useState<TopicBreakdownViewMode>('top-ten')
  const [topicBreakdownExpanded, setTopicBreakdownExpanded] = useState(true)
  const [oaStatusBreakdownExpanded, setOaStatusBreakdownExpanded] = useState(true)
  const publicationTrendsAnimationKey = `pub-trends|${publicationTrendsWindowMode}|${publicationTrendsVisualMode}`
  const publicationTrendsIsEntryCycle = useIsFirstChartEntry(publicationTrendsAnimationKey, true)
  const publicationTrendsWindowThumbStyle: CSSProperties = publicationTrendsWindowMode === 'all'
    ? {
      width: '28%',
      left: '72%',
      willChange: 'left,width',
      transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
    }
    : publicationTrendsWindowMode === '5y'
      ? {
        width: '24%',
        left: '48%',
        willChange: 'left,width',
        transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
      }
      : publicationTrendsWindowMode === '3y'
        ? {
          width: '24%',
          left: '24%',
          willChange: 'left,width',
          transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
        }
        : {
          width: '24%',
          left: '0%',
          willChange: 'left,width',
          transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
        }
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
    setPublicationTrendsWindowMode('5y')
    setPublicationTrendsVisualMode('bars')
    setPublicationTrendsExpanded(true)
    setPublicationTypeTrendsExpanded(true)
    setArticleTypeTrendsExpanded(true)
    setTrajectoryMode('raw')
    setTrajectoryWindow(12)
    setVenueBreakdownExpanded(true)
    setJournalBreakdownViewMode('top-ten')
    setTopicBreakdownViewMode('top-ten')
    setTopicBreakdownExpanded(true)
    setOaStatusBreakdownExpanded(true)
  }, [tile.key])

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

  const recordYearsWithData = useMemo(() => (
    publicationDrilldownRecords
      .map((record) => record.year)
      .filter((value): value is number => Number.isInteger(value))
  ), [publicationDrilldownRecords])

  const trajectoryMinYear = useMemo(() => {
    if (recordYearsWithData.length) {
      return Math.min(...recordYearsWithData)
    }
    if (trajectoryFallbackYears.length) {
      return Math.min(...trajectoryFallbackYears)
    }
    return new Date().getUTCFullYear()
  }, [recordYearsWithData, trajectoryFallbackYears])

  const trajectoryMaxYear = useMemo(() => {
    if (recordYearsWithData.length) {
      return Math.max(...recordYearsWithData)
    }
    if (trajectoryFallbackYears.length) {
      return Math.max(...trajectoryFallbackYears)
    }
    return trajectoryMinYear
  }, [recordYearsWithData, trajectoryFallbackYears, trajectoryMinYear])

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
    () => trajectoryYearSeriesRaw.map((_, index) => {
      const start = Math.max(0, index - 2)
      const window = trajectoryYearSeriesRaw.slice(start, index + 1)
      return window.length ? (window.reduce((sum, value) => sum + value, 0) / window.length) : 0
    }),
    [trajectoryYearSeriesRaw],
  )

  const trajectoryYearSeriesCumulative = useMemo(() => {
    let running = 0
    return trajectoryYearSeriesRaw.map((value) => {
      running += value
      return running
    })
  }, [trajectoryYearSeriesRaw])

  const trajectoryMaxWindow = Math.max(1, trajectoryFullYears.length)
  const trajectoryMinWindow = Math.min(6, trajectoryMaxWindow)

  useEffect(() => {
    const initialWindow = Math.max(trajectoryMinWindow, Math.min(12, trajectoryMaxWindow))
    setTrajectoryWindow(initialWindow)
  }, [trajectoryMaxWindow, trajectoryMinWindow])

  const trajectoryVisibleCount = Math.max(trajectoryMinWindow, Math.min(trajectoryWindow, trajectoryMaxWindow))
  const trajectoryVisibleYears = useMemo(
    () => trajectoryFullYears.slice(-trajectoryVisibleCount),
    [trajectoryFullYears, trajectoryVisibleCount],
  )
  const trajectoryVisibleRaw = useMemo(
    () => trajectoryYearSeriesRaw.slice(-trajectoryVisibleCount),
    [trajectoryYearSeriesRaw, trajectoryVisibleCount],
  )
  const trajectoryVisibleMoving = useMemo(
    () => trajectoryYearSeriesMovingAvg.slice(-trajectoryVisibleCount),
    [trajectoryYearSeriesMovingAvg, trajectoryVisibleCount],
  )
  const trajectoryVisibleCumulative = useMemo(
    () => trajectoryYearSeriesCumulative.slice(-trajectoryVisibleCount),
    [trajectoryYearSeriesCumulative, trajectoryVisibleCount],
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
  const trajectoryAxisMax = Math.max(1, trajectoryAxisScale.axisMax)
  const trajectoryTickRatios = useMemo(() => [0, 0.25, 0.5, 0.75, 1], [])
  const trajectoryHorizontalGridRatios = useMemo(
    () => trajectoryTickRatios.filter((ratio) => ratio > 0 && ratio < 1),
    [trajectoryTickRatios],
  )
  const trajectoryAxisTickValues = useMemo(
    () => trajectoryTickRatios.map((ratio) => ratio * trajectoryAxisMax),
    [trajectoryAxisMax, trajectoryTickRatios],
  )
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
          trajectoryAxisMax,
          0,
          0,
        )
        : []
    ),
    [
      trajectoryAxisMax,
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
          trajectoryAxisMax,
          0,
          0,
        )
        : []
    ),
    [
      trajectoryAxisMax,
      trajectoryLabels,
      trajectoryPlotHeight,
      trajectoryPlotWidth,
      trajectoryVisibleMoving,
    ],
  )
  const trajectoryRawPoints = useMemo(
    () => (
      trajectoryVisibleRaw.length
        ? buildLinePointsFromBounds(
          trajectoryVisibleRaw,
          trajectoryPlotWidth,
          trajectoryPlotHeight,
          trajectoryLabels,
          0,
          trajectoryAxisMax,
          0,
          0,
        )
        : []
    ),
    [
      trajectoryAxisMax,
      trajectoryLabels,
      trajectoryPlotHeight,
      trajectoryPlotWidth,
      trajectoryVisibleRaw,
    ],
  )
  const trajectoryPath = useMemo(
    () => monotonePathFromPoints(trajectoryPoints),
    [trajectoryPoints],
  )
  const trajectoryMovingPath = useMemo(
    () => monotonePathFromPoints(trajectoryMovingPoints),
    [trajectoryMovingPoints],
  )
  const trajectoryVolatilityAreaPath = useMemo(() => {
    if (!trajectoryRawPoints.length || !trajectoryMovingPoints.length) {
      return ''
    }
    return `M ${trajectoryRawPoints.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${[...trajectoryMovingPoints].reverse().map((point) => `${point.x} ${point.y}`).join(' L ')} Z`
  }, [trajectoryMovingPoints, trajectoryRawPoints])

  const trajectoryVolatilityIndex = useMemo(() => {
    if (!trajectoryYearSeriesRaw.length) {
      return 0
    }
    const mean = trajectoryYearSeriesRaw.reduce((sum, value) => sum + value, 0) / trajectoryYearSeriesRaw.length
    if (mean <= 1e-9) {
      return 0
    }
    const variance = trajectoryYearSeriesRaw.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / trajectoryYearSeriesRaw.length
    return Math.sqrt(variance) / mean
  }, [trajectoryYearSeriesRaw])

  const trajectoryGrowthSlope = useMemo(() => {
    if (trajectoryYearSeriesRaw.length <= 1) {
      return 0
    }
    const n = trajectoryYearSeriesRaw.length
    const xs = Array.from({ length: n }, (_, index) => index + 1)
    const sumX = xs.reduce((sum, value) => sum + value, 0)
    const sumY = trajectoryYearSeriesRaw.reduce((sum, value) => sum + value, 0)
    const sumXY = trajectoryYearSeriesRaw.reduce((sum, value, index) => sum + (value * xs[index]), 0)
    const sumXX = xs.reduce((sum, value) => sum + (value * value), 0)
    const numerator = (n * sumXY) - (sumX * sumY)
    const denominator = (n * sumXX) - (sumX * sumX)
    if (Math.abs(denominator) <= 1e-9) {
      return 0
    }
    return numerator / denominator
  }, [trajectoryYearSeriesRaw])

  const trajectoryPhase = trajectoryGrowthSlope > 0.2
    ? 'Expanding'
    : trajectoryGrowthSlope < -0.2
      ? 'Contracting'
      : 'Stable'
  const trajectoryStartYearLabel = trajectoryVisibleYears.length ? String(trajectoryVisibleYears[0]) : ''
  const trajectoryEndYearLabel = trajectoryVisibleYears.length ? String(trajectoryVisibleYears[trajectoryVisibleYears.length - 1]) : ''
  const trajectoryXAxisLayout = useMemo(
    () => buildChartAxisLayout({
      axisLabels: [trajectoryStartYearLabel, trajectoryEndYearLabel],
      showXAxisName: true,
      xAxisName: 'Publication year',
      dense: false,
      maxLabelLines: 1,
      maxSubLabelLines: 1,
      maxAxisNameLines: 1,
    }),
    [trajectoryEndYearLabel, trajectoryStartYearLabel],
  )
  const trajectoryYAxisPanelWidthRem = buildYAxisPanelWidthRem(trajectoryAxisTickValues, true, 0.5)
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

    const highestYieldValue = (() => {
      const nonZeroHistory = historyBars.filter((entry) => entry.value > 0)
      if (!nonZeroHistory.length) {
        return '\u2014'
      }
      const peak = nonZeroHistory.reduce((best, entry) => (entry.value > best.value ? entry : best), nonZeroHistory[0])
      return `${formatInt(peak.value)} (${peak.year})`
    })()

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
      { label: 'Highest yield', value: highestYieldValue },
      { label: 'Last 1 year (rolling)', value: formatInt(rolling1Year) },
      { label: 'Last 3 years (rolling)', value: formatInt(rolling3Year) },
      { label: 'Last 5 years (rolling)', value: formatInt(rolling5Year) },
      { label: 'Year-to-date', value: yearToDateValue },
    ]
  }, [tile])

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
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; avg_citations: number } => row !== null)
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
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; avg_citations: number } => row !== null)
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
        avg_citations: Number(row.avg_citations || 0),
      }
    }).filter((row): row is { key: string; label: string; value: number; share_pct: number; avg_citations: number } => row !== null)
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
  const subsectionTitleByTab: Partial<Record<DrilldownTab, string>> = {
    context: 'Top publication venues',
  }
  const subsectionTitle = subsectionTitleByTab[activeTab] || null

  return (
    <div className="house-drilldown-stack-3" data-metric-key={tile.key}>
      <div className={cn(HOUSE_SURFACE_SECTION_PANEL_CLASS, 'house-drilldown-panel-no-pad')}>
        {activeTab === 'summary' ? (
          <div className="house-drilldown-heading-block">
            <p className="house-drilldown-heading-block-title">Headline results</p>
          </div>
        ) : null}
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
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
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
              </div>
              {publicationTrendsExpanded ? (
                <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                  <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'house-publications-trends-controls-row justify-between')}>
                    <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
                      <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                        <div
                          className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[24%_24%_24%_28%]')}
                          data-stop-tile-open="true"
                          data-ui="publications-trends-window-toggle"
                          data-house-role="chart-toggle"
                          style={{ width: '8.75rem', minWidth: '8.75rem', maxWidth: '8.75rem' }}
                        >
                          <span
                            className={HOUSE_TOGGLE_THUMB_CLASS}
                            style={publicationTrendsWindowThumbStyle}
                            aria-hidden="true"
                          />
                          {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
                            <button
                              key={`pub-trends-window-${option.value}`}
                              type="button"
                              data-stop-tile-open="true"
                              className={cn(
                                HOUSE_TOGGLE_BUTTON_CLASS,
                                publicationTrendsWindowMode === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (publicationTrendsWindowMode === option.value) {
                                  return
                                }
                                setPublicationTrendsWindowMode(option.value)
                              }}
                              onMouseDown={(event) => event.stopPropagation()}
                              aria-pressed={publicationTrendsWindowMode === option.value}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <PublicationTrendsVisualToggle
                      value={publicationTrendsVisualMode}
                      onChange={setPublicationTrendsVisualMode}
                    />
                  </div>

                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                    <PublicationsPerYearChart
                      tile={tile}
                      animate={animateCharts}
                      showAxes
                      yAxisLabel="Publications"
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
                  </div>
                </div>
              ) : null}
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
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

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <div className="flex items-center justify-between gap-2">
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
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, journalBreakdownViewMode === 'top-ten' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
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
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, journalBreakdownViewMode === 'all-journals' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
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
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, topicBreakdownViewMode === 'top-ten' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
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
                            className={cn(HOUSE_TOGGLE_BUTTON_CLASS, topicBreakdownViewMode === 'all-topics' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
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
              <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'justify-start')}>
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
              </div>

              {trajectoryVisibleYears.length ? (
                <>
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
                        <svg viewBox={`0 0 ${trajectoryPlotWidth} ${trajectoryPlotHeight}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                          {trajectoryHorizontalGridRatios.map((ratio, index) => {
                            const clampedRatio = Math.max(0, Math.min(1, ratio))
                            const y = trajectoryPlotHeight - (trajectoryPlotHeight * clampedRatio)
                            return (
                              <line
                                key={`trajectory-grid-${index}`}
                                x1={0}
                                x2={trajectoryPlotWidth}
                                y1={y}
                                y2={y}
                                stroke="hsl(var(--stroke-soft) / 0.56)"
                                strokeWidth={1}
                                vectorEffect="non-scaling-stroke"
                              />
                            )
                          })}
                          <line
                            x1={0}
                            x2={trajectoryPlotWidth}
                            y1={0}
                            y2={0}
                            stroke="hsl(var(--stroke-soft) / 0.56)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                          <line
                            x1={0}
                            x2={0}
                            y1={0}
                            y2={trajectoryPlotHeight}
                            stroke="hsl(var(--stroke-soft) / 0.56)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                          <line
                            x1={trajectoryPlotWidth}
                            x2={trajectoryPlotWidth}
                            y1={0}
                            y2={trajectoryPlotHeight}
                            stroke="hsl(var(--stroke-soft) / 0.56)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                          <line
                            x1={0}
                            x2={trajectoryPlotWidth}
                            y1={trajectoryPlotHeight}
                            y2={trajectoryPlotHeight}
                            stroke="hsl(var(--stroke-soft) / 0.56)"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                          {trajectoryMode === 'raw' && trajectoryVolatilityAreaPath ? (
                            <path d={trajectoryVolatilityAreaPath} className={HOUSE_DRILLDOWN_CHART_AREA_SVG_CLASS} />
                          ) : null}
                          {trajectoryMode === 'raw' && trajectoryMovingPath ? (
                            <path d={trajectoryMovingPath} className={HOUSE_DRILLDOWN_CHART_MOVING_SVG_CLASS} />
                          ) : null}
                          {trajectoryPath ? (
                            <path d={trajectoryPath} className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS} />
                          ) : null}
                        </svg>
                      </div>

                      <div className="pointer-events-none absolute" style={trajectoryYAxisPanelStyle} aria-hidden="true">
                        {trajectoryAxisTickValues.map((tickValue, index) => {
                          const pct = Math.max(0, Math.min(100, (trajectoryTickRatios[index] || 0) * 100))
                          return (
                            <p
                              key={`trajectory-y-axis-${tickValue}-${index}`}
                              className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                              style={{ bottom: `calc(${pct}% - ${PUBLICATIONS_CHART_Y_AXIS_TICK_OFFSET_REM}rem)` }}
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
                          'pointer-events-none absolute flex items-start justify-between',
                          HOUSE_TOGGLE_CHART_LABEL_CLASS,
                        )}
                        style={trajectoryXAxisTicksStyle}
                      >
                        <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                          {trajectoryStartYearLabel}
                        </p>
                        <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                          {trajectoryEndYearLabel}
                        </p>
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

                  <div className="mt-2">
                    <input
                      type="range"
                      min={trajectoryMinWindow}
                      max={trajectoryMaxWindow}
                      value={Math.min(trajectoryWindow, trajectoryMaxWindow)}
                      onChange={(event) => setTrajectoryWindow(Math.max(trajectoryMinWindow, Number(event.target.value) || trajectoryMinWindow))}
                      className={HOUSE_DRILLDOWN_RANGE_CLASS}
                    />
                  </div>

                  <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                    <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Volatility index</p>
                      <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{trajectoryVolatilityIndex.toFixed(2)}</p>
                    </div>
                    <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Growth slope</p>
                      <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{trajectoryGrowthSlope >= 0 ? '+' : ''}{trajectoryGrowthSlope.toFixed(2)}/year</p>
                    </div>
                    <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Phase marker</p>
                      <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{trajectoryPhase}</p>
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

        {subsectionTitle && tile.key !== 'total_citations' ? (
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

function GenericMetricDrilldownWorkspace({
  tile,
  activeTab,
  animateCharts = true,
  token = null,
  onOpenPublication,
  onDrilldownTabChange,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  animateCharts?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  onDrilldownTabChange?: (tab: DrilldownTab) => void
}) {
  const [publicationTrendsWindowMode, setPublicationTrendsWindowMode] = useState<PublicationsWindowMode>('5y')
  const [publicationTrendsVisualMode, setPublicationTrendsVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const [publicationTrendsExpanded, setPublicationTrendsExpanded] = useState(true)
  const [articleTypeTrendsExpanded, setArticleTypeTrendsExpanded] = useState(true)
  const [publicationTypeTrendsExpanded, setPublicationTypeTrendsExpanded] = useState(true)
  const [uncitedBreakdownExpanded, setUncitedBreakdownExpanded] = useState(true)
  const [recentConcentrationExpanded, setRecentConcentrationExpanded] = useState(true)
  const [citationActivationExpanded, setCitationActivationExpanded] = useState(true)
  const [fieldPercentileDrilldownThreshold, setFieldPercentileDrilldownThreshold] = useState<FieldPercentileThreshold>(75)
  const [uncitedBreakdownViewMode, setUncitedBreakdownViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [recentConcentrationViewMode, setRecentConcentrationViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [citationActivationViewMode, setCitationActivationViewMode] = useState<SplitBreakdownViewMode>('bar')
  const [recentConcentrationWindowMode, setRecentConcentrationWindowMode] = useState<RecentConcentrationWindowMode>('1y')
  const [publicationInsightsByRequestKey, setPublicationInsightsByRequestKey] = useState<Record<string, PublicationInsightsAgentPayload>>({})
  const [publicationInsightsLoadingByRequestKey, setPublicationInsightsLoadingByRequestKey] = useState<Record<string, boolean>>({})
  const [publicationInsightsErrorByRequestKey, setPublicationInsightsErrorByRequestKey] = useState<Record<string, string>>({})
  const [uncitedInsightOpen, setUncitedInsightOpen] = useState(false)
  const [recentConcentrationInsightOpen, setRecentConcentrationInsightOpen] = useState(false)
  const [citationActivationInsightOpen, setCitationActivationInsightOpen] = useState(false)

  const subsectionTitleByTab: Partial<Record<DrilldownTab, string>> = {
    breakdown: 'Breakdown results',
    trajectory: 'Trajectory results',
    context: 'Context results',
    methods: 'Methods metadata',
  }
  const subsectionTitle = subsectionTitleByTab[activeTab] || null

  const publicationTrendsAnimationKey = `pub-trends|${publicationTrendsWindowMode}|${publicationTrendsVisualMode}`
  const publicationTrendsIsEntryCycle = useIsFirstChartEntry(publicationTrendsAnimationKey, true)
  const publicationTrendsWindowThumbStyle: CSSProperties = publicationTrendsWindowMode === 'all'
    ? {
      width: '28%',
      left: '72%',
      willChange: 'left,width',
      transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
    }
    : publicationTrendsWindowMode === '5y'
      ? {
        width: '24%',
        left: '48%',
        willChange: 'left,width',
        transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
      }
      : publicationTrendsWindowMode === '3y'
        ? {
          width: '24%',
          left: '24%',
          willChange: 'left,width',
          transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
        }
        : {
          width: '24%',
          left: '0%',
          willChange: 'left,width',
          transitionDuration: publicationTrendsIsEntryCycle ? '0ms' : undefined,
        }

  useEffect(() => {
    setPublicationTrendsWindowMode('5y')
    setPublicationTrendsVisualMode('bars')
    setPublicationTrendsExpanded(true)
    setArticleTypeTrendsExpanded(true)
    setPublicationTypeTrendsExpanded(true)
    setUncitedBreakdownExpanded(true)
    setRecentConcentrationExpanded(true)
    setCitationActivationExpanded(true)
    setUncitedBreakdownViewMode('bar')
    setRecentConcentrationViewMode('bar')
    setCitationActivationViewMode('bar')
    setRecentConcentrationWindowMode('1y')
    setPublicationInsightsByRequestKey({})
    setPublicationInsightsLoadingByRequestKey({})
    setPublicationInsightsErrorByRequestKey({})
    setUncitedInsightOpen(false)
    setRecentConcentrationInsightOpen(false)
    setCitationActivationInsightOpen(false)
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
      if (!token) {
        const message = 'Session token is required to generate publication insights.'
        setPublicationInsightsErrorByRequestKey((current) => ({ ...current, [requestKey]: message }))
        return null
      }
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
        setPublicationInsightsLoadingByRequestKey((current) => ({ ...current, [requestKey]: false }))
      }
    },
    [publicationInsightsByRequestKey, token],
  )

  const onToggleUncitedInsight = useCallback(() => {
    setUncitedInsightOpen((current) => {
      const next = !current
      if (next) {
        setRecentConcentrationInsightOpen(false)
        setCitationActivationInsightOpen(false)
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
        void requestPublicationInsights({
          windowId: '1y',
          sectionKey: 'citation_activation',
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
  const citationActivationPublicationRecords = useMemo(
    () => publicationDrilldownRecords
      .filter((record) => record.citations1yRolling > 0)
      .slice()
      .sort((left, right) => {
        if (right.citations1yRolling !== left.citations1yRolling) {
          return right.citations1yRolling - left.citations1yRolling
        }
        return left.title.localeCompare(right.title, 'en-GB')
      }),
    [publicationDrilldownRecords],
  )
  const newlyActivePublicationRecords = useMemo(
    () => citationActivationPublicationRecords
      .filter((record) => Math.max(0, record.citations3yRolling - record.citations1yRolling) <= 0),
    [citationActivationPublicationRecords],
  )
  const stillActivePublicationRecords = useMemo(
    () => citationActivationPublicationRecords
      .filter((record) => Math.max(0, record.citations3yRolling - record.citations1yRolling) > 0),
    [citationActivationPublicationRecords],
  )
  const inactivePublicationCount = useMemo(
    () => Math.max(0, publicationDrilldownRecords.length - citationActivationPublicationRecords.length),
    [citationActivationPublicationRecords.length, publicationDrilldownRecords.length],
  )
  const citationActivationCohortRows = useMemo(() => {
    const rowsByYear = new Map<number, {
      key: string
      label: string
      newlyActiveCount: number
      stillActiveCount: number
      inactiveCount: number
      totalCount: number
      year: number
    }>()
    publicationDrilldownRecords.forEach((record) => {
      if (!Number.isInteger(record.year)) {
        return
      }
      const year = Number(record.year)
      const current = rowsByYear.get(year) || {
        key: String(year),
        label: String(year),
        newlyActiveCount: 0,
        stillActiveCount: 0,
        inactiveCount: 0,
        totalCount: 0,
        year,
      }
      const priorWindowCitations = Math.max(0, (record.citations3yRolling || 0) - (record.citations1yRolling || 0))
      const recentWindowCitations = Math.max(0, record.citations1yRolling || 0)
      current.totalCount += 1
      if (recentWindowCitations > 0 && priorWindowCitations <= 0) {
        current.newlyActiveCount += 1
      } else if (recentWindowCitations > 0) {
        current.stillActiveCount += 1
      } else {
        current.inactiveCount += 1
      }
      rowsByYear.set(year, current)
    })
    const orderedRows = Array.from(rowsByYear.values()).sort((left, right) => left.year - right.year)
    if (orderedRows.length <= 8) {
      return orderedRows
    }
    const recentRows = orderedRows.slice(-7)
    const olderRows = orderedRows.slice(0, -7)
    const olderRow = olderRows.reduce((accumulator, row) => {
      accumulator.newlyActiveCount += row.newlyActiveCount
      accumulator.stillActiveCount += row.stillActiveCount
      accumulator.inactiveCount += row.inactiveCount
      accumulator.totalCount += row.totalCount
      return accumulator
    }, {
      key: 'older',
      label: 'Older',
      newlyActiveCount: 0,
      stillActiveCount: 0,
      inactiveCount: 0,
      totalCount: 0,
      year: (olderRows[0]?.year ?? 0) - 1,
    })
    return [olderRow, ...recentRows]
  }, [publicationDrilldownRecords])
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
  const citationActivationInsightsRequestKey = 'citation_activation:section:1y'
  const uncitedInsightsPayload = publicationInsightsByRequestKey[uncitedInsightsRequestKey] || null
  const recentConcentrationInsightsPayload = publicationInsightsByRequestKey[recentConcentrationInsightsRequestKey] || null
  const citationActivationInsightsPayload = publicationInsightsByRequestKey[citationActivationInsightsRequestKey] || null
  const uncitedInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[uncitedInsightsRequestKey])
  const recentConcentrationInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[recentConcentrationInsightsRequestKey])
  const citationActivationInsightsLoading = Boolean(publicationInsightsLoadingByRequestKey[citationActivationInsightsRequestKey])
  const uncitedInsightsError = publicationInsightsErrorByRequestKey[uncitedInsightsRequestKey] || ''
  const recentConcentrationInsightsError = publicationInsightsErrorByRequestKey[recentConcentrationInsightsRequestKey] || ''
  const citationActivationInsightsError = publicationInsightsErrorByRequestKey[citationActivationInsightsRequestKey] || ''
  const closeUncitedInsight = useCallback(() => setUncitedInsightOpen(false), [])
  const closeRecentConcentrationInsight = useCallback(() => setRecentConcentrationInsightOpen(false), [])
  const closeCitationActivationInsight = useCallback(() => setCitationActivationInsightOpen(false), [])
  const navigateToInsightTab = useCallback((tab: DrilldownTab) => {
    onDrilldownTabChange?.(tab)
    setUncitedInsightOpen(false)
    setRecentConcentrationInsightOpen(false)
    setCitationActivationInsightOpen(false)
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
        {activeTab === 'summary' ? (
          <div className="house-drilldown-heading-block">
            <p className="house-drilldown-heading-block-title">Headline results</p>
          </div>
        ) : null}
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
                      <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                        <div
                          className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[24%_24%_24%_28%]')}
                          data-stop-tile-open="true"
                          data-ui="publications-trends-window-toggle"
                          data-house-role="chart-toggle"
                          style={{ width: '8.75rem', minWidth: '8.75rem', maxWidth: '8.75rem' }}
                        >
                          <span
                            className={HOUSE_TOGGLE_THUMB_CLASS}
                            style={publicationTrendsWindowThumbStyle}
                            aria-hidden="true"
                          />
                          {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
                            <button
                              key={`pub-trends-window-${option.value}`}
                              type="button"
                              data-stop-tile-open="true"
                              className={cn(
                                HOUSE_TOGGLE_BUTTON_CLASS,
                                publicationTrendsWindowMode === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                              )}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (publicationTrendsWindowMode === option.value) {
                                  return
                                }
                                setPublicationTrendsWindowMode(option.value)
                              }}
                              onMouseDown={(event) => event.stopPropagation()}
                              aria-pressed={publicationTrendsWindowMode === option.value}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <PublicationTrendsVisualToggle
                      value={publicationTrendsVisualMode}
                      onChange={setPublicationTrendsVisualMode}
                    />
                  </div>

                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                    <PublicationsPerYearChart
                      tile={tile}
                      animate={animateCharts}
                      showAxes
                      yAxisLabel="Citations"
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
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">H-index trajectory</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <DrilldownNarrativeCard
                    eyebrow="Approved story"
                    title={`The portfolio currently supports h${formatInt(hIndexDrilldownStats.currentH)} and is ${Math.round(hIndexDrilldownStats.progressPct)}% of the way to h${formatInt(hIndexDrilldownStats.targetH)}.`}
                    body={`The current h-core contains ${formatInt(hIndexDrilldownStats.hCorePublicationCount)} papers and accounts for ${hIndexDrilldownStats.hCoreShareValue} of citations. The current projection points to h${formatInt(hIndexDrilldownStats.projectedH)} by ${hIndexDrilldownStats.projectedYear}, with ${formatInt(hIndexDrilldownStats.citationsNeededForNextH)} citations still needed across the nearest candidate papers.`}
                  />
                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                    <HIndexTrajectoryPanel tile={tile} mode="trajectory" />
                  </div>
                  <CanonicalTablePanel
                    title="Canonical readout"
                    subtitle="Headline h-index measures in approved summary format."
                    columns={[
                      { key: 'measure', label: 'Measure' },
                      { key: 'value', label: 'Value', align: 'center', width: '1%' },
                      { key: 'interpretation', label: 'Interpretation' },
                    ]}
                    rows={[
                      {
                        key: 'current-h',
                        cells: {
                          measure: 'Current h-index',
                          value: formatInt(hIndexDrilldownStats.currentH),
                          interpretation: `${formatInt(hIndexDrilldownStats.hCorePublicationCount)} papers already meet the current h threshold.`,
                        },
                      },
                      {
                        key: 'projected-h',
                        cells: {
                          measure: `Projected ${hIndexDrilldownStats.projectedYear}`,
                          value: formatInt(hIndexDrilldownStats.projectedH),
                          interpretation: 'Twelve-month outlook using near-threshold candidate papers.',
                        },
                      },
                      {
                        key: 'next-target',
                        cells: {
                          measure: `Progress to h${formatInt(hIndexDrilldownStats.targetH)}`,
                          value: `${Math.round(hIndexDrilldownStats.progressPct)}%`,
                          interpretation: `${formatInt(hIndexDrilldownStats.citationsNeededForNextH)} citations still needed to secure the next threshold.`,
                        },
                      },
                      {
                        key: 'career-pace',
                        cells: {
                          measure: 'Career pace',
                          value: hIndexDrilldownStats.mIndexValue,
                          interpretation: hIndexDrilldownStats.yearsSinceFirstCitedPaper === null
                            ? 'Career span not available.'
                            : `Normalised across ${formatInt(hIndexDrilldownStats.yearsSinceFirstCitedPaper)} citation-active years.`,
                        },
                      },
                    ]}
                  />
                </div>
              </div>
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
                  <div className="flex justify-center">
                    <SplitBreakdownViewToggle value={uncitedBreakdownViewMode} onChange={setUncitedBreakdownViewMode} />
                  </div>
                  {uncitedBreakdownViewMode === 'bar' ? (
                    <CitationSplitBarCard
                      bare
                      left={{
                        label: 'Uncited',
                        value: `${formatInt(totalCitationsHeadlineStats.uncitedPapersCount)} (${Math.round(totalCitationsHeadlineStats.uncitedPapersPct)}%)`,
                        ratioPct: totalCitationsHeadlineStats.uncitedPapersPct,
                        toneClass: HOUSE_CHART_BAR_WARNING_CLASS,
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
                  <div className="flex items-center justify-center gap-2">
                    <PublicationWindowToggle
                      value={recentConcentrationWindowMode}
                      onChange={(mode) => setRecentConcentrationWindowMode(mode as RecentConcentrationWindowMode)}
                      options={RECENT_CONCENTRATION_WINDOW_OPTIONS}
                    />
                    <SplitBreakdownViewToggle value={recentConcentrationViewMode} onChange={setRecentConcentrationViewMode} />
                  </div>
                  {recentConcentrationViewMode === 'bar' ? (
                    <CitationSplitBarCard
                      bare
                      left={{
                        label: 'Top 3 papers',
                        value: `${formatInt(recentConcentrationTopThreeCitations)} (${Math.round(recentConcentrationPct)}%)`,
                        ratioPct: recentConcentrationPct,
                        toneClass: HOUSE_CHART_BAR_ACCENT_CLASS,
                      }}
                      right={{
                        label: 'All other papers',
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
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'breakdown' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">h-core structure</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <DrilldownNarrativeCard
                    eyebrow="Approved story"
                    title={`The h-core currently covers ${Math.round(hIndexDrilldownStats.hCorePublicationSharePct)}% of papers and ${Math.round(hIndexDrilldownStats.hCoreSharePct)}% of citations.`}
                    body="This section separates the h-defining papers from the rest of the portfolio, then shows which authorship positions and publication formats appear most often inside that h-core."
                  />
                  <CitationSplitBarCard
                    title="h-core papers"
                    subtitle="Shows how much of the portfolio currently sits inside the h-core threshold."
                    left={{
                      label: 'h-core',
                      value: `${formatInt(hIndexDrilldownStats.hCorePublicationCount)} (${Math.round(hIndexDrilldownStats.hCorePublicationSharePct)}%)`,
                      ratioPct: hIndexDrilldownStats.hCorePublicationSharePct,
                      toneClass: HOUSE_CHART_BAR_ACCENT_CLASS,
                    }}
                    right={{
                      label: 'Outside h-core',
                      value: `${formatInt(hIndexDrilldownStats.nonHCorePublicationCount)} (${hIndexDrilldownStats.totalPublications > 0 ? Math.round((hIndexDrilldownStats.nonHCorePublicationCount / hIndexDrilldownStats.totalPublications) * 100) : 0}%)`,
                      ratioPct: hIndexDrilldownStats.totalPublications > 0
                        ? (hIndexDrilldownStats.nonHCorePublicationCount / hIndexDrilldownStats.totalPublications) * 100
                        : 0,
                      toneClass: HOUSE_CHART_BAR_NEUTRAL_CLASS,
                    }}
                  />
                  <CitationSplitBarCard
                    title="h-core citations"
                    subtitle="Shows how much of total citation volume is concentrated inside the h-core."
                    left={{
                      label: 'h-core',
                      value: `${formatInt(hIndexDrilldownStats.hCoreCitations)} (${Math.round(hIndexDrilldownStats.hCoreSharePct)}%)`,
                      ratioPct: hIndexDrilldownStats.hCoreSharePct,
                      toneClass: HOUSE_CHART_BAR_WARNING_CLASS,
                    }}
                    right={{
                      label: 'Outside h-core',
                      value: `${formatInt(hIndexDrilldownStats.nonHCoreCitations)} (${Math.max(0, 100 - Math.round(hIndexDrilldownStats.hCoreSharePct))}%)`,
                      ratioPct: Math.max(0, 100 - hIndexDrilldownStats.hCoreSharePct),
                      toneClass: HOUSE_CHART_BAR_POSITIVE_CLASS,
                    }}
                  />
                  <CanonicalTablePanel
                    title="Canonical structure table"
                    subtitle="Approved portfolio split between h-core and non-h-core papers."
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
                  <CitationEfficiencyComparisonPanel
                    title="h-core authorship mix"
                    subtitle="Highlights which contribution positions are most represented inside the h-core."
                    metrics={hIndexDrilldownStats.authorshipMix.map((metric) => ({
                      label: metric.label,
                      value: metric.value,
                      raw: metric.raw,
                    }))}
                  />
                  <CanonicalTablePanel
                    title="Authorship mix table"
                    subtitle="Canonical h-core authorship distribution."
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
                    emptyMessage="No h-core authorship mix available."
                  />
                  <CitationEfficiencyComparisonPanel
                    title="h-core publication type mix"
                    subtitle="Shows which publication formats contribute most often to the h-core."
                    metrics={hIndexDrilldownStats.publicationTypeMix.map((metric) => ({
                      label: metric.label,
                      value: metric.value,
                      raw: metric.raw,
                    }))}
                  />
                  <CanonicalTablePanel
                    title="Publication type mix table"
                    subtitle="Canonical h-core publication-format distribution."
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
                    emptyMessage="No h-core publication-type mix available."
                  />
                </div>
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
                      ? formatCitationActivationTableTooltip(newlyActivePublicationRecords.length)
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
                  <p className="house-drilldown-heading-block-title">How much of my portfolio is actively being cited?</p>
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
                    <div className="flex justify-center">
                      <SplitBreakdownViewToggle value={citationActivationViewMode} onChange={setCitationActivationViewMode} />
                    </div>
                    {citationActivationViewMode === 'bar' ? (
                      <div className="space-y-3">
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
                        <CitationActivationYearCohortChart rows={citationActivationCohortRows} />
                      </div>
                    ) : (
                      <PublicationLinkTable
                        nameColumnLabel="Newly active publication"
                        metricColumnLabel="Last 12m"
                        secondaryMetricColumnLabel="Total citations"
                        rows={newlyActivePublicationRecords.map((record) => ({
                          key: record.workId,
                          label: record.title || 'Untitled publication',
                          year: record.year,
                        metricValue: formatInt(record.citations1yRolling),
                        secondaryMetricValue: formatInt(record.citations),
                        workId: record.workId,
                        }))}
                        onOpenPublication={onOpenPublication}
                        emptyMessage="No newly active publications available."
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'trajectory' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">H-index trajectory</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <DrilldownNarrativeCard
                    eyebrow="Approved story"
                    title={`The h-index trend has reached h${formatInt(hIndexDrilldownStats.currentH)} and is tracking toward h${formatInt(hIndexDrilldownStats.projectedH)}.`}
                    body={`Trajectory focuses on two questions: when each h milestone was achieved, and how much runway remains to reach h${formatInt(hIndexDrilldownStats.targetH)}. Candidate-paper tables show the nearest papers to the next threshold rather than the entire portfolio.`}
                  />
                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                    <HIndexTrajectoryPanel tile={tile} mode="trajectory" />
                  </div>
                </div>
              </div>
            </div>

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Milestone progression</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <CanonicalTablePanel
                  title="Milestone table"
                  subtitle="Canonical record of when each h threshold was first reached."
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

            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Next h runway</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
                    <div className="space-y-1">
                      <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{`Progress to h${hIndexDrilldownStats.targetH}`}</p>
                      <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Shows the remaining runway to the next h-threshold and the current candidate-gap distribution.</p>
                    </div>
                    <HIndexProgressInline tile={tile} progressLabel={`Progress to h${hIndexDrilldownStats.targetH}`} />
                    <div className="mt-2 min-h-[10rem]">
                      <HIndexToggleBarsChart tile={tile} mode="needed" />
                    </div>
                  </div>
                  <CanonicalTablePanel
                    title="Runway table"
                    subtitle="Canonical runway readout for the next h milestone."
                    columns={[
                      { key: 'measure', label: 'Measure' },
                      { key: 'value', label: 'Value', align: 'center', width: '1%' },
                      { key: 'note', label: 'Interpretation' },
                    ]}
                    rows={[
                      {
                        key: 'progress',
                        cells: {
                          measure: `Progress to h${formatInt(hIndexDrilldownStats.targetH)}`,
                          value: `${Math.round(hIndexDrilldownStats.progressPct)}%`,
                          note: 'Share of the next threshold already covered by the current candidate set.',
                        },
                      },
                      {
                        key: 'needed',
                        cells: {
                          measure: 'Citations still needed',
                          value: formatInt(hIndexDrilldownStats.citationsNeededForNextH),
                          note: 'Remaining citation gap across the closest qualifying papers.',
                        },
                      },
                      {
                        key: 'candidates',
                        cells: {
                          measure: 'Candidate papers tracked',
                          value: formatInt(hIndexDrilldownStats.candidatePapers.length),
                          note: 'Near-threshold papers monitored for the next h-step.',
                        },
                      },
                    ]}
                  />
                  <HIndexCandidateTablePanel
                    title="Closest candidate papers"
                    subtitle="Nearest papers to the next h-threshold, with projected 12-month citation totals."
                    candidates={hIndexDrilldownStats.candidatePapers}
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'context' && totalCitationsHeadlineStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Citation context</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="grid gap-3 lg:grid-cols-2">
                  <CitationSplitBarCard
                    title="Citation half-life proxy"
                    subtitle="Splits lifetime citations between papers older than five years and the newer portfolio."
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
                  <CitationEfficiencyComparisonPanel
                    title="Portfolio efficiency"
                    subtitle="Compares average citation yield and central tendency across the publication set."
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
            </div>
          </>
        ) : null}

        {tile.key === 'h_index_projection' && activeTab === 'context' && hIndexDrilldownStats ? (
          <>
            <div className="house-publications-drilldown-bounded-section">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Scholarly context</p>
              </div>
              <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                <div className="space-y-3">
                  <DrilldownNarrativeCard
                    eyebrow="Approved story"
                    title="Companion indices explain pace, depth, and concentration around the h-index."
                    body={`m-index shows pace over ${hIndexDrilldownStats.yearsSinceFirstCitedPaper === null ? 'the observed career span' : `${formatInt(hIndexDrilldownStats.yearsSinceFirstCitedPaper)} citation-active years`}, g-index shows whether a few highly cited papers extend beyond the h-core, and i10-index gives a simpler count of consistently cited papers.`}
                  />
                  <CitationEfficiencyComparisonPanel
                    title="Complementary indices"
                    subtitle="Companion bibliometric measures that contextualise h-index breadth, pace, and depth."
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
                  <CanonicalTablePanel
                    title="Index reference table"
                    subtitle="Canonical interpretation of the companion bibliometric measures."
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
                  <CitationEfficiencyComparisonPanel
                    title="h-core performance"
                    subtitle="Puts h-core efficiency, concentration, and career span beside each other."
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
                  <CanonicalTablePanel
                    title="h-core context table"
                    subtitle="Canonical context for concentration, efficiency, and career span."
                    columns={[
                      { key: 'measure', label: 'Measure' },
                      { key: 'value', label: 'Value', align: 'center', width: '1%' },
                      { key: 'meaning', label: 'Interpretation' },
                    ]}
                    rows={[
                      {
                        key: 'density',
                        cells: {
                          measure: 'h-core citation density',
                          value: hIndexDrilldownStats.hCoreCitationDensityValue,
                          meaning: 'Average citation depth inside the current h-core.',
                        },
                      },
                      {
                        key: 'share',
                        cells: {
                          measure: 'h-core share of citations',
                          value: hIndexDrilldownStats.hCoreShareValue,
                          meaning: 'How concentrated total citation volume is inside the h-defining papers.',
                        },
                      },
                      {
                        key: 'career-span',
                        cells: {
                          measure: 'Years since first cited paper',
                          value: hIndexDrilldownStats.yearsSinceFirstCitedPaper === null
                            ? '\u2014'
                            : formatInt(hIndexDrilldownStats.yearsSinceFirstCitedPaper),
                          meaning: 'Observed citation-active span used to contextualise m-index and trajectory pace.',
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}

        {isEnhancedGenericMetricKey(tile.key) && activeTab !== 'methods'
          ? renderEnhancedGenericMetricDrilldownSection({
            tile,
            activeTab,
            momentumStats: momentumDrilldownStats,
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

void HIndexYearChart
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
}: {
  tile: PublicationMetricTilePayload
  progressLabel?: string
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
    <div className="mt-6 w-full max-w-[11.7rem] space-y-1.5">
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
          className={cn('h-full border-r border-white/75', left.toneClass)}
          style={{ width: `${leftWidth}%` }}
          aria-hidden="true"
        />
        <div
          className={cn('h-full', right.toneClass)}
          style={{ width: `${rightWidth}%` }}
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
            )}
            style={{ width: `${Math.max(0, Math.min(100, segment.ratioPct))}%` }}
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

function CitationActivationYearCohortChart({
  rows,
}: {
  rows: Array<{
    key: string
    label: string
    newlyActiveCount: number
    stillActiveCount: number
    inactiveCount: number
    totalCount: number
  }>
}) {
  const maxTotal = Math.max(1, ...rows.map((row) => row.totalCount))

  if (!rows.length) {
    return (
      <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
        <div className="space-y-1">
          <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Activation by publication year</p>
          <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">No publication-year cohort data available.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      <div className="space-y-1">
        <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Activation by publication year</p>
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">Shows which publication-year cohorts are newly active, still active, or inactive.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] leading-5 text-[hsl(var(--tone-neutral-600))]">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', HOUSE_CHART_BAR_POSITIVE_CLASS)} aria-hidden="true" />
          Newly active
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', HOUSE_CHART_BAR_ACCENT_CLASS)} aria-hidden="true" />
          Still active
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full', HOUSE_CHART_BAR_DANGER_CLASS)} aria-hidden="true" />
          Inactive
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] gap-2">
        {rows.map((row) => {
          const totalHeightPct = (row.totalCount / maxTotal) * 100
          const newlyHeightPct = row.totalCount > 0 ? (row.newlyActiveCount / row.totalCount) * 100 : 0
          const stillHeightPct = row.totalCount > 0 ? (row.stillActiveCount / row.totalCount) * 100 : 0
          const inactiveHeightPct = row.totalCount > 0 ? (row.inactiveCount / row.totalCount) * 100 : 0
          return (
            <div key={row.key} className="space-y-1.5">
              <p className="text-center text-[0.78rem] font-semibold leading-none text-[hsl(var(--tone-neutral-800))]">
                {formatInt(row.totalCount)}
              </p>
              <div className="flex h-36 items-end justify-center">
                <div
                  className="flex w-full max-w-[2.5rem] flex-col justify-end overflow-hidden rounded-[0.8rem] border border-[hsl(var(--stroke-soft)/0.78)] bg-[hsl(var(--tone-neutral-100))]"
                  style={{ height: `${Math.max(16, totalHeightPct)}%` }}
                >
                  {row.inactiveCount > 0 ? (
                    <div
                      className={cn('w-full', HOUSE_CHART_BAR_DANGER_CLASS)}
                      style={{ height: `${inactiveHeightPct}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {row.stillActiveCount > 0 ? (
                    <div
                      className={cn('w-full border-t border-white/70', HOUSE_CHART_BAR_ACCENT_CLASS)}
                      style={{ height: `${stillHeightPct}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {row.newlyActiveCount > 0 ? (
                    <div
                      className={cn('w-full border-t border-white/70', HOUSE_CHART_BAR_POSITIVE_CLASS)}
                      style={{ height: `${newlyHeightPct}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              </div>
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'text-center leading-tight')}>{row.label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CitationEfficiencyComparisonPanel({
  title,
  subtitle,
  metrics,
}: {
  title: string
  subtitle: string
  metrics: Array<{ label: string; value: string; raw: number | null }>
}) {
  const maxRaw = Math.max(
    1,
    ...metrics.map((metric) => Math.max(0, Number(metric.raw || 0))),
  )
  return (
    <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      <div className="space-y-1">
        <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p>
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p>
      </div>
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
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
}

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
  const usesPositiveTone = sectionKey === 'uncited_works' || sectionKey === 'citation_activation'
  const title = String(
    section?.headline
    || section?.title
    || (sectionKey === 'uncited_works'
      ? 'Uncited publications'
      : sectionKey === 'citation_activation'
        ? 'Citation activation'
        : 'Citation concentration'),
  ).trim()
  const considerationLabel = String(section?.consideration_label || '').trim() || 'Why this matters'
  const consideration = String(section?.consideration || '').trim()
  const generatedAt = String(((payload?.provenance as Record<string, unknown> | undefined) || {})['generated_at'] || '').trim()

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
        {loading ? (
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
                <td className="house-table-cell-text px-1.5 py-2 text-center font-semibold whitespace-nowrap tabular-nums">
                  {row.year === null ? '\u2014' : String(row.year)}
                </td>
                {metricColumnLabel ? (
                  <td className="house-table-cell-text px-1.5 py-2 text-center font-semibold whitespace-nowrap tabular-nums">
                    {row.metricValue ?? '\u2014'}
                  </td>
                ) : null}
                {secondaryMetricColumnLabel ? (
                  <td className="house-table-cell-text px-1.5 py-2 text-center font-semibold whitespace-nowrap tabular-nums">
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
  emptyMessage = 'No rows available.',
}: {
  title?: string
  subtitle?: string
  columns: CanonicalTableColumn[]
  rows: Array<{ key: string; cells: Record<string, ReactNode> }>
  bare?: boolean
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

  return (
    <div className={bare ? 'space-y-3' : HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      {!bare && (title || subtitle) ? (
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

function formatSignedNumber(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '\u2014'
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`
}

function renderMomentumDrilldownSection({
  tile,
  activeTab,
  stats,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  stats: MomentumDrilldownStats
}): ReactNode {
  if (activeTab === 'summary') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Momentum overview</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title={`Momentum is currently ${stats.state.toLowerCase()} at index ${formatInt(stats.momentumIndex)}.`}
              body={`This drilldown compares recent citation pace against the immediately preceding baseline window. The active signal is built from ${formatInt(stats.trackedPapers)} papers with matched citation histories, so it highlights recent acceleration rather than lifetime scale.`}
            />
            <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
              <div className="space-y-1">
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Recent vs baseline citation pace</p>
                <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">The chart keeps the current 12-month momentum comparison in view for the summary story.</p>
              </div>
              <div className="min-h-[11rem]">
                <MomentumTilePanel tile={tile} mode="12m" yearBreakdown={null} />
              </div>
            </div>
            <CanonicalTablePanel
              title="Momentum readout"
              subtitle="Canonical summary of the current momentum state and recent pacing inputs."
              columns={[
                { key: 'measure', label: 'Measure' },
                { key: 'value', label: 'Value', align: 'center', width: '1%' },
                { key: 'meaning', label: 'Interpretation' },
              ]}
              rows={[
                {
                  key: 'index',
                  cells: {
                    measure: 'Momentum index',
                    value: formatInt(stats.momentumIndex),
                    meaning: 'Headline recency-weighted pace signal.',
                  },
                },
                {
                  key: 'state',
                  cells: {
                    measure: 'State',
                    value: stats.state,
                    meaning: 'Narrative label assigned from the current index.',
                  },
                },
                {
                  key: 'recent',
                  cells: {
                    measure: 'Current score',
                    value: stats.recentScore12m === null ? '\u2014' : stats.recentScore12m.toFixed(1),
                    meaning: 'Latest 12-month momentum score.',
                  },
                },
                {
                  key: 'prior',
                  cells: {
                    measure: 'Previous score',
                    value: stats.previousScore12m === null ? '\u2014' : stats.previousScore12m.toFixed(1),
                    meaning: 'Comparison baseline from the previous window.',
                  },
                },
                {
                  key: 'delta',
                  cells: {
                    measure: 'Delta',
                    value: formatSignedNumber(stats.delta, 2),
                    meaning: 'Direction and magnitude versus the previous score.',
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
          <p className="house-drilldown-heading-block-title">Momentum contributors</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Recent momentum is being carried by a defined subset of papers."
              body="Contributor ranking surfaces the papers with the strongest recent citation pace and the highest contribution to the momentum score, so the bottom table should explain the headline state directly."
            />
            <CanonicalTablePanel
              title="Top contributing papers"
              subtitle="Papers ranked by momentum contribution and recent citation activity."
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
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Momentum trajectory</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Momentum trajectory is a recency comparison, not a lifetime curve."
              body="This metric is designed to move quickly. It compares the current recent window against the preceding baseline, so the trajectory discussion should stay focused on score change and monthly evidence rather than cumulative citations."
            />
            <CanonicalTablePanel
              title="Trajectory inputs"
              subtitle="Operational view of the monthly evidence feeding the current momentum state."
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
      </div>
    )
  }

  if (activeTab === 'context') {
    return (
      <div className="house-publications-drilldown-bounded-section">
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Momentum context</p>
        </div>
        <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
          <div className="space-y-3">
            <DrilldownNarrativeCard
              eyebrow="Approved story"
              title="Momentum should be read as an early signal, not a scale metric."
              body="A high momentum score means recent citation pace is strong relative to the immediately preceding baseline. It does not mean the total citation portfolio is larger; it means the recent direction of travel is stronger."
            />
            <CanonicalTablePanel
              title="Confidence context"
              subtitle="Coverage and confidence details used to interpret the current momentum headline."
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
      return momentumStats ? renderMomentumDrilldownSection({ tile, activeTab, stats: momentumStats }) : null
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

function HIndexCandidateTablePanel({
  title,
  subtitle,
  candidates,
}: {
  title: string
  subtitle: string
  candidates: HIndexDrilldownStats['candidatePapers']
}) {
  return (
    <div className={HOUSE_METRIC_PROGRESS_PANEL_CLASS}>
      <div className="space-y-1">
        <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>{title}</p>
        <p className="text-xs leading-5 text-[hsl(var(--tone-neutral-600))]">{subtitle}</p>
      </div>
      {candidates.length ? (
        <div className="overflow-hidden rounded-[1rem] border border-[hsl(var(--stroke-soft)/0.78)]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-surface-100)/0.9)]">
                <th className="house-table-head-text px-2 py-2 text-left font-semibold">Paper</th>
                <th className="house-table-head-text px-2 py-2 text-center font-semibold whitespace-nowrap">Current</th>
                <th className="house-table-head-text px-2 py-2 text-center font-semibold whitespace-nowrap">Gap</th>
                <th className="house-table-head-text px-2 py-2 text-center font-semibold whitespace-nowrap">Projected 12m</th>
                <th className="house-table-head-text px-2 py-2 text-center font-semibold whitespace-nowrap">Likelihood</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.workId} className="border-b border-[hsl(var(--stroke-soft)/0.55)] last:border-b-0">
                  <td className="house-table-cell-text px-2 py-2 align-top">
                    <span className="block max-w-full break-words leading-snug">{candidate.title}</span>
                  </td>
                  <td className="house-table-cell-text px-2 py-2 text-center whitespace-nowrap tabular-nums">
                    {formatInt(candidate.citations)}
                  </td>
                  <td className="house-table-cell-text px-2 py-2 text-center whitespace-nowrap tabular-nums">
                    {`+${formatInt(candidate.citationsToNextH)}`}
                  </td>
                  <td className="house-table-cell-text px-2 py-2 text-center whitespace-nowrap tabular-nums">
                    {formatInt(candidate.projectedCitations12m)}
                  </td>
                  <td className="house-table-cell-text px-2 py-2 text-center whitespace-nowrap tabular-nums">
                    {`${candidate.projectionProbabilityPct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={HOUSE_DRILLDOWN_HINT_CLASS}>No near-threshold papers identified.</p>
      )}
    </div>
  )
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
                  animateCharts={drawerOpen && activeDrilldownTab === 'summary'}
                  onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                />
              ) : (
                <GenericMetricDrilldownWorkspace
                  tile={activeTile}
                  activeTab={activeDrilldownTab}
                  animateCharts={drawerOpen && activeDrilldownTab === 'summary'}
                  token={token}
                  onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                  onDrilldownTabChange={setActiveDrilldownTab}
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











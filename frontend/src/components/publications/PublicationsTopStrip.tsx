import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Download, Eye, EyeOff, FileText, Hammer, Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui'
import { Button } from '@/components/ui'
import { Sheet, SheetContent } from '@/components/ui'
import { readAccountSettings } from '@/lib/account-preferences'
import { fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { dashboardTileStyles } from './dashboard-tile-styles'
import { HouseDrilldownHeaderShell } from './HouseDrilldownHeaderShell'
import { drilldownTabFlexGrow } from './house-drilldown-header-utils'
import {
  publicationsHouseActions,
  publicationsHouseDividers,
  publicationsHouseCharts,
  publicationsHouseDrilldown,
  publicationsHouseHeadings,
  publicationsHouseMotion,
  publicationsHouseSurfaces,
} from './publications-house-style'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  onOpenPublication?: (workId: string) => void
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
  forceInsightsVisible?: boolean
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
  const axisBottomRem = hasXAxisName ? xAxisNameBottomRem + xAxisNameHeightRem + 0.2 : 0.3
  const plotBottomRem = axisBottomRem + axisMinHeightRem + 0.28
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
type PublicationTrendsVisualMode = 'bars' | 'line'
type PublicationCategoryValueMode = 'absolute' | 'percentage'
type PublicationCategoryDisplayMode = 'chart' | 'table'
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
  { value: 'all', label: 'Life' },
]
const PUBLICATION_TRENDS_VISUAL_OPTIONS: Array<{ value: PublicationTrendsVisualMode; label: string }> = [
  { value: 'bars', label: 'Bar view' },
  { value: 'line', label: 'Line view' },
]
const PUBLICATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage', label: '%' },
]
const PUBLICATION_DISPLAY_MODE_OPTIONS: Array<{ value: PublicationCategoryDisplayMode; label: string }> = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
]
const PUBLICATION_INSIGHTS_TITLE = 'Publication insights'
const PUBLICATION_INSIGHTS_LABEL = 'publication insights'
const HOUSE_HEADING_SECTION_TITLE_CLASS = publicationsHouseHeadings.sectionTitle
const HOUSE_HEADING_H2_CLASS = publicationsHouseHeadings.h2
const HOUSE_METRIC_SUBTITLE_CLASS = publicationsHouseHeadings.metricSubtitle
const HOUSE_METRIC_DETAIL_CLASS = publicationsHouseHeadings.metricDetail
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
const HOUSE_SURFACE_SECTION_PANEL_CLASS = publicationsHouseSurfaces.sectionPanel
const HOUSE_SURFACE_STRONG_PANEL_CLASS = publicationsHouseSurfaces.strongPanel
const HOUSE_SURFACE_PANEL_BARE_CLASS = publicationsHouseSurfaces.panelBare
const HOUSE_SURFACE_BANNER_CLASS = publicationsHouseSurfaces.banner
const HOUSE_SURFACE_BANNER_INFO_CLASS = publicationsHouseSurfaces.bannerInfo
const HOUSE_SURFACE_BANNER_WARNING_CLASS = publicationsHouseSurfaces.bannerWarning
const HOUSE_SURFACE_METRIC_PILL_CLASS = publicationsHouseSurfaces.metricPill
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_CLASS = publicationsHouseSurfaces.metricPillPublications
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_REGULAR_CLASS = publicationsHouseSurfaces.metricPillPublicationsRegular
const HOUSE_SURFACE_LEFT_BORDER_CLASS = publicationsHouseSurfaces.leftBorder
const HOUSE_SURFACE_LEFT_BORDER_PUBLICATIONS_CLASS = publicationsHouseSurfaces.leftBorderPublications
const HOUSE_DIVIDER_BORDER_SOFT_CLASS = publicationsHouseDividers.borderSoft
const HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS = publicationsHouseActions.sectionToolButton
const HOUSE_DRILLDOWN_SHEET_CLASS = publicationsHouseDrilldown.sheet
const HOUSE_DRILLDOWN_PLACEHOLDER_CLASS = publicationsHouseDrilldown.placeholder
const HOUSE_DRILLDOWN_ALERT_CLASS = publicationsHouseDrilldown.alert
const HOUSE_DRILLDOWN_HINT_CLASS = publicationsHouseDrilldown.hint
const HOUSE_DRILLDOWN_ROW_CLASS = publicationsHouseDrilldown.row
const HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS = publicationsHouseDrilldown.progressTrack
const HOUSE_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS = publicationsHouseDrilldown.summaryStatValueEmphasis
const HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS = publicationsHouseDrilldown.summaryStatCard
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_DRILLDOWN_TITLE_CLASS = publicationsHouseDrilldown.title
const HOUSE_DRILLDOWN_TITLE_EXPANDER_CLASS = publicationsHouseDrilldown.titleExpander
const HOUSE_DRILLDOWN_OVERLINE_CLASS = publicationsHouseDrilldown.overline
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = publicationsHouseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_NOTE_CLASS = publicationsHouseDrilldown.note
const HOUSE_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS = publicationsHouseDrilldown.chartMainSvg
const HOUSE_DRILLDOWN_CHART_TOOLTIP_CLASS = publicationsHouseDrilldown.chartTooltip
const HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS = publicationsHouseDrilldown.skeletonBlock
const HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS = publicationsHouseDrilldown.tableEmpty
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = publicationsHouseDrilldown.toggleButtonMuted
const HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS = publicationsHouseDrilldown.summaryStatsGrid
const HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS = publicationsHouseDrilldown.chartControlsRow
const HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS = publicationsHouseDrilldown.chartControlsLeft
const HOUSE_DRILLDOWN_CHART_META_CLASS = publicationsHouseDrilldown.chartMeta
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = publicationsHouseDrilldown.sheetBody
const HOUSE_CHART_BAR_ACCENT_CLASS = publicationsHouseCharts.barAccent
const HOUSE_CHART_BAR_POSITIVE_CLASS = publicationsHouseCharts.barPositive
const HOUSE_CHART_BAR_WARNING_CLASS = publicationsHouseCharts.barWarning
const HOUSE_CHART_BAR_NEUTRAL_CLASS = publicationsHouseCharts.barNeutral
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
    'house-metric-tile-chart-surface flex flex-1 flex-col gap-2.5 px-2 py-2 transition-[opacity,transform,filter] duration-[var(--motion-duration-chart-toggle)] ease-out',
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
 * const ringDuration = ringChartDurationVar(isEntryCycle)     // '520ms' or '380ms'
 * 
 * // Axis updates
 * const axisDuration = getAxisAnimationDuration('toggle')     // 340ms
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
    duration: 360,      // --motion-chart-toggle-duration
    delay: 0,           // --motion-chart-toggle-delay
    stagger: 0,         // --motion-chart-toggle-stagger
  },
  morph: {
    duration: 440,      // --motion-chart-morph-duration
    stagger: 25,        // --motion-chart-morph-stagger
  },
  axis: {
    entry: 380,         // --motion-chart-axis-entry
    toggle: 340,        // --motion-chart-axis-toggle
    overlap: 100,       // --motion-chart-axis-overlap
  },
  refresh: {
    duration: 420,      // --motion-chart-refresh-duration
  },
  ring: {
    entry: 520,         // --motion-chart-ring-entry
    toggle: 380,        // --motion-chart-ring-toggle
  },
  line: {
    entry: 580,         // --motion-chart-line-entry
    toggle: 400,        // --motion-chart-line-toggle
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

function getChartInitialDelay(context: ChartAnimationContext): number {
  return context === 'entry' ? CHART_MOTION.entry.delay : CHART_MOTION.toggle.delay
}

function tileMotionEntryDelay(index = 0, animateIn = false): string {
  if (!animateIn) {
    return '0ms'
  }
  return getChartStaggerDelay(index, 'entry')
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
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-1" data-stop-tile-open="true">
      {PUBLICATION_TRENDS_VISUAL_OPTIONS.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={`pub-trends-visual-${option.value}`}
            type="button"
            data-stop-tile-open="true"
            aria-label={option.label}
            aria-pressed={isActive}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md border text-[hsl(var(--tone-neutral-700))] transition-colors',
              isActive
                ? 'border-border bg-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent/60',
            )}
            onClick={(event) => {
              event.stopPropagation()
              if (isActive) {
                return
              }
              onChange(option.value)
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {option.value === 'bars' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
                <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
                <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                <polyline points="2,11 6,8 9,9 14,4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="2" cy="11" r="1.1" fill="currentColor" />
                <circle cx="6" cy="8" r="1.1" fill="currentColor" />
                <circle cx="9" cy="9" r="1.1" fill="currentColor" />
                <circle cx="14" cy="4" r="1.1" fill="currentColor" />
              </svg>
            )}
          </button>
        )
      })}
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

function useUnifiedToggleBarAnimation(
  animationKey: string,
  enabled: boolean,
  mode: 'replay-on-change' | 'entry-only' = 'replay-on-change',
): boolean {
  const [barsExpanded, setBarsExpanded] = useState(false)
  const hasAnimatedEntryRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setBarsExpanded(false)
      hasAnimatedEntryRef.current = false
      return
    }
    if (prefersReducedMotion()) {
      setBarsExpanded(true)
      hasAnimatedEntryRef.current = true
      return
    }
    if (mode === 'entry-only' && hasAnimatedEntryRef.current) {
      setBarsExpanded(true)
      return
    }
    setBarsExpanded(false)
    let raf = 0
    raf = window.requestAnimationFrame(() => {
      setBarsExpanded(true)
      hasAnimatedEntryRef.current = true
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
      return
    }
    const entryCycle = !hasEnteredRef.current
    setIsEntryCycle(entryCycle)
    hasEnteredRef.current = true
  }, [animationKey, enabled])

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

function lineChartDurationVar(isEntryCycle: boolean): string {
  const context: ChartAnimationContext = isEntryCycle ? 'entry' : 'toggle'
  const duration = getChartAnimationDuration(context, 'line')
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

function useEasedValue(target: number, animationKey: string, enabled: boolean, durationMs = CHART_MOTION.axis.toggle): number {
  const [value, setValue] = useState<number>(() => (enabled ? 0 : target))
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0)
      valueRef.current = 0
      return
    }
    if (!enabled || prefersReducedMotion()) {
      setValue(target)
      valueRef.current = target
      return
    }
    const from = Number.isFinite(valueRef.current) ? valueRef.current : 0
    const to = target
    if (Math.abs(from - to) < 0.0001) {
      return
    }
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
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, durationMs, enabled, target])

  return value
}

function useEasedSeries(target: number[], animationKey: string, enabled: boolean, durationMs = CHART_MOTION.axis.toggle): number[] {
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
      return
    }
    const from = to.map((_, index) => {
      const current = valuesRef.current[index]
      return Number.isFinite(current) ? current : 0
    })
    const unchanged = from.length === to.length && from.every((value, index) => Math.abs(value - to[index]) < 0.0001)
    if (unchanged) {
      return
    }

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
    .map((monthDate) => monthDate.toLocaleString('en-GB', { month: 'short' }))
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

function parsePublicationDateToMs(value: unknown): number | null {
  const token = String(value || '').trim()
  if (!token) {
    return null
  }
  const normalized = token.replace(/\//g, '-')
  const dayMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dayMatch) {
    const year = Number(dayMatch[1])
    const month = Number(dayMatch[2])
    const day = Number(dayMatch[3])
    if (
      Number.isFinite(year)
      && Number.isFinite(month)
      && Number.isFinite(day)
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= 31
    ) {
      return Date.UTC(Math.round(year), Math.round(month) - 1, Math.round(day))
    }
  }
  const monthMatch = normalized.match(/^(\d{4})-(\d{2})$/)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return Date.UTC(Math.round(year), Math.round(month) - 1, 1)
    }
  }
  const yearMatch = normalized.match(/^(\d{4})$/)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    if (Number.isFinite(year)) {
      return Date.UTC(Math.round(year), 0, 1)
    }
  }
  const parsedIsoMonth = parseIsoMonthStart(normalized)
  return parsedIsoMonth ? parsedIsoMonth.getTime() : null
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
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
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
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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

  type PublicationLineAxisTick = {
    key: string
    label: string
    subLabel?: string
    leftPct: number
  }

  const parseYearRangeFromBarKey = useCallback((key: string): { startYear: number; endYear: number } | null => {
    const raw = String(key || '').trim()
    if (!raw) {
      return null
    }
    const segments = raw.split('-')
    const first = Number(segments[0])
    const last = Number(segments[segments.length - 1])
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
      return null
    }
    const startYear = Math.round(Math.min(first, last))
    const endYear = Math.round(Math.max(first, last))
    if (startYear < 1900 || endYear < 1900 || endYear < startYear) {
      return null
    }
    return { startYear, endYear }
  }, [])

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

  const resolveBarsForWindowMode = (mode: PublicationsWindowMode): PublicationYearWindowBars => {
    if (mode === '1y') {
      return {
        bars: groupedMonthBars.bars,
        bucketSize: groupedMonthBars.bucketSize,
        rangeLabel: groupedMonthBars.rangeLabel,
      }
    }
    if ((mode === '3y' || mode === '5y') && lifetimeMonthlyBars.bars.length) {
      const monthCount = mode === '3y' ? 36 : 60
      const sourceBars = lifetimeMonthlyBars.bars.slice(-monthCount)
      if (sourceBars.length > 0) {
        const grouped: PublicationChartBar[] = []
        for (let index = 0; index < sourceBars.length; index += 12) {
          const chunk = sourceBars.slice(index, index + 12)
          if (!chunk.length) {
            continue
          }
          const firstMs = chunk[0]?.monthStartMs
          const lastMs = chunk[chunk.length - 1]?.monthStartMs
          const firstDate = Number.isFinite(firstMs) ? new Date(firstMs as number) : null
          const lastDate = Number.isFinite(lastMs) ? new Date(lastMs as number) : null
          grouped.push({
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
          bars: grouped,
          bucketSize: 12,
          rangeLabel,
        }
      }
    }
    return groupedYearBarsByWindow[mode]
  }

  const resolveLineBarsForWindowMode = useCallback((mode: PublicationsWindowMode): PublicationYearWindowBars => {
    if (!lifetimeMonthlyBars.bars.length) {
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
      const windowYears = mode === '3y'
        ? 3
        : mode === '5y'
          ? 5
          : mode === '1y'
            ? 1
            : null
      const sourceBars = windowYears === null ? historyBars : historyBars.slice(-windowYears)
      const bars: PublicationChartBar[] = sourceBars.map((bar) => ({
        key: `${bar.year}-${bar.year}`,
        value: Math.max(0, bar.value),
        current: Boolean(bar.current),
        axisLabel: String(bar.year),
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
    }
    const monthCount = mode === '1y'
      ? 12
      : mode === '3y'
        ? 36
        : mode === '5y'
          ? 60
          : null
    const bars = monthCount === null
      ? lifetimeMonthlyBars.bars
      : lifetimeMonthlyBars.bars.slice(-monthCount)
    if (!bars.length) {
      return { bars: [], bucketSize: 1, rangeLabel: null }
    }
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
  }, [groupedMonthBars.bars, groupedMonthBars.bucketSize, groupedMonthBars.rangeLabel, historyBars, lifetimeMonthlyBars.bars])

  const activeLineWindowBars = isCompactTileMode
    ? { bars: compactTileBars, bucketSize: 1, rangeLabel: null as string | null }
    : resolveLineBarsForWindowMode(effectiveWindowMode)
  const lineUsesMonthlyTimeline = activeLineWindowBars.bars.length > 0
    && activeLineWindowBars.bars.every((bar) => Number.isFinite(bar.monthStartMs ?? Number.NaN))
  const publicationTimelineSource = String(chartData.publication_month_source || '').trim()
    || (lineUsesMonthlyTimeline ? 'lifetime_monthly' : 'yearly_fallback')
  const publicationTimelineExactCount = Number.isFinite(Number(chartData.publication_month_exact_count))
    ? Math.max(0, Math.round(Number(chartData.publication_month_exact_count)))
    : 0
  const publicationTimelineFallbackCount = Number.isFinite(Number(chartData.publication_month_fallback_count))
    ? Math.max(0, Math.round(Number(chartData.publication_month_fallback_count)))
    : 0
  const publicationTimelineDebugText = tile.key === 'this_year_vs_last'
    ? `Source: ${publicationTimelineSource} (exact ${formatInt(publicationTimelineExactCount)} / fallback ${formatInt(publicationTimelineFallbackCount)})`
    : null
  const usingMonthlyTimelineForMode = effectiveWindowMode === '1y' || (effectiveVisualMode === 'line' && lineUsesMonthlyTimeline)

  const activeWindowBars = isCompactTileMode
    ? { bars: compactTileBars, bucketSize: 1, rangeLabel: null as string | null }
    : effectiveVisualMode === 'line'
      ? activeLineWindowBars
      : resolveBarsForWindowMode(effectiveWindowMode)

  const activeBars = activeWindowBars.bars
  const activeBucketSize = activeWindowBars.bucketSize
  const meanValue = isCompactTileMode && Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)
  const meanValueDisplay = Number.isFinite(meanValue)
    ? (() => {
      const rounded = Math.round(meanValue * 10) / 10
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
  const hasBars = hasValidSeries && historyBars.length > 0 && activeBars.length > 0
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const entrySweepDurationMs = Math.max(160, CHART_MOTION.entry.duration - CHART_MOTION.entry.staggerMax)
  const barTransitionDuration = `${isEntryCycle ? entrySweepDurationMs : CHART_MOTION.toggle.duration}ms`
  const axisDurationMs = getAxisAnimationDuration(isEntryCycle ? 'entry' : 'toggle')
  const renderBars = activeBars
  const barsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars, 'entry-only')
  const renderedValuesTarget = useMemo(
    () => renderBars.map((bar) => Math.max(0, bar.value)),
    [renderBars],
  )
  const renderedCumulativeValuesTarget = useMemo(() => {
    let runningTotal = 0
    return renderedValuesTarget.map((value) => {
      runningTotal += Math.max(0, value)
      return runningTotal
    })
  }, [renderedValuesTarget])
  const renderedValuesAnimated = renderedValuesTarget
  const renderedCumulativeValuesAnimated = renderedCumulativeValuesTarget

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  const valuesForScale = effectiveVisualMode === 'line' ? renderedCumulativeValuesTarget : renderedValuesTarget
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
      resolveLineBarsForWindowMode(option.value).bars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0)
    )),
  )
  const maxWindowValue = effectiveVisualMode === 'line' ? maxWindowValueLine : maxWindowValueBars
  const maxAnimatedDisplayValue = Math.max(1, Math.max(maxWindowValue, maxValue) * 1.5)
  const stableAxisScale = enableWindowToggle && !autoScaleByWindow ? buildNiceAxis(maxWindowValue) : null
  const targetAxisScale = showAxes
    ? stableAxisScale || buildNiceAxis(maxValue)
    : null
  const targetAxisMax = targetAxisScale
    ? targetAxisScale.axisMax
    : Math.max(1, maxValue * (isCompactTileMode ? 1.06 : 1.1), Math.max(0, meanValue) * 1.1)
  const [hasAxisAnimationPrimed, setHasAxisAnimationPrimed] = useState(false)
  useEffect(() => {
    setHasAxisAnimationPrimed(true)
  }, [])
  const axisAnimationEnabled = hasBars && enableWindowToggle && autoScaleByWindow && showAxes && hasAxisAnimationPrimed
  const animatedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|axis-max|${autoScaleByWindow ? 'auto' : 'fixed'}`,
    axisAnimationEnabled,
    axisDurationMs,
  )
  const axisMax = axisAnimationEnabled ? Math.max(1, animatedAxisMax) : targetAxisMax
  const renderedMeanValue = Math.max(0, meanValue)
  const barHeightAxisMax = Math.max(1, axisMax)
  const yAxisTickRatios = targetAxisScale
    ? targetAxisScale.ticks.map((tickValue) => (targetAxisScale.axisMax <= 0 ? 0 : tickValue / targetAxisScale.axisMax))
    : [0, 0.25, 0.5, 0.75, 1]
  const yAxisTickValues = yAxisTickRatios.map((ratio) => ratio * axisMax)
  const hideYearTickTabs = false
  const showXAxisTickTabs = !hideYearTickTabs
  const buildLineModeTicksForWindow = useCallback((mode: PublicationsWindowMode): PublicationLineAxisTick[] => {
    const positions = [0, 0.5, 1]
    const lineWindowBars = resolveLineBarsForWindowMode(mode).bars
    const monthStartMsValues = lineWindowBars.map((bar) => Number(bar.monthStartMs))
    const hasLineMonthTimeline = monthStartMsValues.length > 0
      && monthStartMsValues.length === lineWindowBars.length
      && monthStartMsValues.every((value) => Number.isFinite(value))
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
  const lineModeXAxisTicks = useMemo(
    () => (effectiveVisualMode === 'line' ? buildLineModeTicksForWindow(effectiveWindowMode) : []),
    [buildLineModeTicksForWindow, effectiveVisualMode, effectiveWindowMode],
  )
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
  const stableToggleTickValues = enableWindowToggle ? buildNiceAxis(maxWindowValue).ticks : yAxisTickValues
  const gridTickRatios = effectiveVisualMode === 'line' ? yAxisTickRatios : yAxisTickRatios.slice(1)
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
    ? buildYAxisPanelWidthRem(stableToggleTickValues, Boolean(yAxisLabel))
    : 0
  const chartLeftInset = showAxes
    ? `${yAxisPanelWidthRem + PUBLICATIONS_CHART_Y_AXIS_TO_PLOT_GAP_REM}rem`
    : `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`

  const plotAreaStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
    bottom: `${xAxisLabelLayout.plotBottomRem}rem`,
  }
  const xAxisTicksStyle = {
    left: chartLeftInset,
    right: `${PUBLICATIONS_CHART_RIGHT_INSET_REM}rem`,
    bottom: `${xAxisLabelLayout.axisBottomRem}rem`,
    minHeight: `${xAxisLabelLayout.axisMinHeightRem}rem`,
  }
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
      slotWidthPct,
      slotStepPct,
    }
  }, [renderBars.length])
  const yAxisPanelStyle = {
    left: `${PUBLICATIONS_CHART_Y_AXIS_LEFT_INSET_REM}rem`,
    top: `${PUBLICATIONS_CHART_TOP_INSET_REM}rem`,
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
  const lineSeriesPoints = useMemo(() => {
    const clampPct = (value: number) => Math.max(0, Math.min(100, value))
    if (effectiveVisualMode !== 'line') {
      return renderBars.map((bar, index) => {
        const rawAnimatedValue = renderedCumulativeValuesAnimated[index]
        const fallbackValue = renderedCumulativeValuesTarget[index] ?? 0
        const finiteAnimatedValue = Number.isFinite(rawAnimatedValue) ? rawAnimatedValue : fallbackValue
        const animatedValue = Math.max(0, Math.min(maxAnimatedDisplayValue, finiteAnimatedValue))
        return {
          key: bar.key,
          xPct: (index * slotMetrics.slotStepPct) + (slotMetrics.slotWidthPct / 2),
          yPct: clampPct((animatedValue / Math.max(1, barHeightAxisMax)) * 100),
          value: animatedValue,
        }
      })
    }

    const now = new Date()
    const lastCompleteMonthEndExclusiveMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    const monthWindowSize = effectiveWindowMode === '1y'
      ? 12
      : effectiveWindowMode === '3y'
        ? 36
        : effectiveWindowMode === '5y'
          ? 60
          : null

    const chartEventTimes = toStringArray(chartData.publication_event_dates)
      .map((item) => parsePublicationDateToMs(item))
      .filter((value): value is number => Number.isFinite(value))

    const drilldown = (tile.drilldown || {}) as Record<string, unknown>
    const drilldownPublications = Array.isArray(drilldown.publications) ? drilldown.publications : []
    const drilldownEventTimes = drilldownPublications
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const row = item as Record<string, unknown>
        const publicationDateMs = parsePublicationDateToMs(row.publication_date)
          ?? parsePublicationDateToMs(row.publication_month_start)
        if (publicationDateMs !== null) {
          return publicationDateMs
        }
        const year = Number(row.year)
        if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
          return Date.UTC(Math.round(year), 0, 1)
        }
        return null
      })
      .filter((value): value is number => value !== null && Number.isFinite(value))

    const monthlyLifetimeValues = toNumberArray(chartData.monthly_values_lifetime)
      .map((value) => Math.max(0, Math.round(value)))
    const monthlyLifetimeLabels = toStringArray(chartData.month_labels_lifetime)
    const lifetimeMonthStartBase = parseIsoMonthStart(String(chartData.lifetime_month_start || ''))
    const monthlyExpandedEventTimes: number[] = []
    if (monthlyLifetimeValues.length > 0) {
      monthlyLifetimeValues.forEach((count, index) => {
        const parsedMonthStart = parseIsoMonthStart(monthlyLifetimeLabels[index] || '')
        const fallbackMonthStart = lifetimeMonthStartBase
          ? new Date(Date.UTC(lifetimeMonthStartBase.getUTCFullYear(), lifetimeMonthStartBase.getUTCMonth() + index, 1))
          : null
        const monthStart = parsedMonthStart || fallbackMonthStart
        if (!(monthStart instanceof Date) || Number.isNaN(monthStart.getTime())) {
          return
        }
        const monthStartMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1)
        const monthEndMs = Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
        const safeCount = Math.max(0, Math.round(count))
        if (safeCount <= 0) {
          return
        }
        const spanMs = Math.max(1, monthEndMs - monthStartMs)
        for (let itemIndex = 0; itemIndex < safeCount; itemIndex += 1) {
          const ratio = (itemIndex + 0.5) / safeCount
          monthlyExpandedEventTimes.push(Math.round(monthStartMs + (spanMs * ratio)))
        }
      })
    }

    const sourceEventTimes = (
      chartEventTimes.length
        ? chartEventTimes
        : monthlyExpandedEventTimes.length
          ? monthlyExpandedEventTimes
          : drilldownEventTimes
    )
      .slice()
      .sort((left, right) => left - right)
    const boundedEventTimes = sourceEventTimes.filter((timeMs) => timeMs < lastCompleteMonthEndExclusiveMs)
    const effectiveEventTimes = boundedEventTimes.length ? boundedEventTimes : sourceEventTimes

    if (effectiveEventTimes.length > 0) {
      const firstEventDate = new Date(effectiveEventTimes[0])
      const allStartMs = Date.UTC(firstEventDate.getUTCFullYear(), firstEventDate.getUTCMonth(), 1)
      const allEndMs = lastCompleteMonthEndExclusiveMs
      const windowStartMs = monthWindowSize === null
        ? allStartMs
        : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthWindowSize, 1)
      const windowEndMs = monthWindowSize === null
        ? allEndMs
        : lastCompleteMonthEndExclusiveMs
      const filteredEventTimes = effectiveEventTimes.filter((timeMs) => (
        timeMs >= windowStartMs && timeMs < windowEndMs
      ))
      const timelineTimes = filteredEventTimes.length ? filteredEventTimes : effectiveEventTimes
      const timelineStartMs = filteredEventTimes.length ? windowStartMs : allStartMs
      const timelineEndMs = filteredEventTimes.length ? windowEndMs : allEndMs
      const spanMs = Math.max(1, timelineEndMs - timelineStartMs)
      return timelineTimes.map((timeMs, index) => {
        const cumulativeValue = index + 1
        return {
          key: `line-event-${timeMs}-${index}`,
          xPct: clampPct(((timeMs - timelineStartMs) / spanMs) * 100),
          yPct: clampPct((cumulativeValue / Math.max(1, barHeightAxisMax)) * 100),
          value: cumulativeValue,
        }
      })
    }

    type TimelineEvent = { timeMs: number }
    const sourceBars = activeLineWindowBars.bars
    const events: TimelineEvent[] = []
    let timelineStartMs: number | null = null
    let timelineEndMs: number | null = null
    const currentYearEndBoundaryMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

    const addEventsAcrossSpan = (startMs: number, endMs: number, count: number) => {
      const safeCount = Math.max(0, Math.round(count))
      if (safeCount <= 0) {
        return
      }
      const spanMs = Math.max(1, endMs - startMs)
      for (let index = 0; index < safeCount; index += 1) {
        const ratio = (index + 0.5) / safeCount
        events.push({
          timeMs: Math.round(startMs + (spanMs * ratio)),
        })
      }
    }

    sourceBars.forEach((bar) => {
      let startMs: number | null = null
      let endMs: number | null = null

      const monthStartMs = Number(bar.monthStartMs)
      if (Number.isFinite(monthStartMs)) {
        const monthDate = new Date(monthStartMs)
        startMs = Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)
        endMs = Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)
      } else {
        const parsedRange = parseYearRangeFromBarKey(bar.key)
        if (parsedRange) {
          startMs = Date.UTC(parsedRange.startYear, 0, 1)
          endMs = Date.UTC(parsedRange.endYear + 1, 0, 1)
          if (parsedRange.endYear >= now.getUTCFullYear()) {
            endMs = Math.min(endMs, currentYearEndBoundaryMs)
          }
        }
      }

      if (startMs === null || endMs === null || endMs <= startMs) {
        return
      }

      timelineStartMs = timelineStartMs === null ? startMs : Math.min(timelineStartMs, startMs)
      timelineEndMs = timelineEndMs === null ? endMs : Math.max(timelineEndMs, endMs)
      addEventsAcrossSpan(startMs, endMs, bar.value)
    })

    if (!events.length) {
      const fallbackBars = sourceBars.length ? sourceBars : renderBars
      let runningTotal = 0
      return fallbackBars.map((bar, index) => {
        runningTotal += Math.max(0, Math.round(bar.value))
        const evenX = fallbackBars.length <= 1 ? 100 : (index / Math.max(1, fallbackBars.length - 1)) * 100
        return {
          key: `line-fallback-${index}`,
          xPct: clampPct(evenX),
          yPct: clampPct((runningTotal / Math.max(1, barHeightAxisMax)) * 100),
          value: runningTotal,
        }
      })
    }

    events.sort((left, right) => left.timeMs - right.timeMs)
    const timelineStart = timelineStartMs !== null
      ? Math.min(timelineStartMs, events[0].timeMs)
      : events[0].timeMs
    const fallbackEnd = events[events.length - 1].timeMs + (24 * 60 * 60 * 1000)
    const timelineEnd = timelineEndMs !== null
      ? Math.max(timelineEndMs, fallbackEnd)
      : fallbackEnd
    const spanMs = Math.max(1, timelineEnd - timelineStart)
    let cumulative = 0
    return events.map((event, index) => {
      cumulative += 1
      const xPct = clampPct(((event.timeMs - timelineStart) / spanMs) * 100)
      const yPct = clampPct((cumulative / Math.max(1, barHeightAxisMax)) * 100)
      return {
        key: `line-event-fallback-${index}`,
        xPct,
        yPct,
        value: cumulative,
      }
    })
  }, [
    activeLineWindowBars.bars,
    barHeightAxisMax,
    chartData.lifetime_month_start,
    chartData.month_labels_lifetime,
    chartData.monthly_values_lifetime,
    chartData.publication_event_dates,
    effectiveVisualMode,
    effectiveWindowMode,
    maxAnimatedDisplayValue,
    parseYearRangeFromBarKey,
    renderBars,
    renderedCumulativeValuesAnimated,
    renderedCumulativeValuesTarget,
    slotMetrics.slotStepPct,
    slotMetrics.slotWidthPct,
    tile.drilldown,
  ])
  const hoveredLinePoint = effectiveVisualMode === 'line' && hoveredIndex !== null
    ? lineSeriesPoints[hoveredIndex] || null
    : null
  const lineModeVerticalGridPercents = effectiveVisualMode === 'line'
    ? (effectiveWindowMode === '5y' ? [40, 80] : [50])
    : []

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
        {showAxes && publicationTimelineDebugText ? (
          <p
            className={cn(
              HOUSE_DRILLDOWN_CHART_META_CLASS,
              HOUSE_HEADING_LABEL_CLASS,
              'pointer-events-none absolute left-2 -top-0.5 z-[2] opacity-85',
            )}
            aria-hidden="true"
          >
            {publicationTimelineDebugText}
          </p>
        ) : null}
        {showMeanValueLabel && meanValueDisplay && effectiveVisualMode !== 'line' ? (
          <p
              className={cn(
                HOUSE_DRILLDOWN_CHART_META_CLASS,
                HOUSE_HEADING_LABEL_CLASS,
                'pointer-events-none absolute right-2 -top-0.5 z-[2]',
              )}
          >
            Mean: {meanValueDisplay}
          </p>
        ) : null}
        <div className="absolute overflow-hidden" style={plotAreaStyle}>
          {gridTickRatios.map((ratio, index) => (
            <div
              key={`pub-grid-${index}`}
              className={cn('pointer-events-none absolute inset-x-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{
                bottom: `${Math.max(0, Math.min(100, ratio * 100))}%`,
                borderTop: effectiveVisualMode === 'line'
                  ? `1px solid hsl(var(--stroke-soft) / ${ratio <= 0.0001 ? 0.95 : 0.76})`
                  : undefined,
              }}
              aria-hidden="true"
            />
          ))}
          {effectiveVisualMode === 'line' && lineModeVerticalGridPercents.length ? (
            <svg className="pointer-events-none absolute inset-0 z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {lineModeVerticalGridPercents.map((leftPct, index) => (
                <line
                  key={`pub-line-grid-${index}`}
                  x1={leftPct}
                  y1={0}
                  x2={leftPct}
                  y2={100}
                  stroke="hsl(var(--tone-neutral-500) / 0.62)"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          ) : null}
          {showMeanLine && effectiveVisualMode !== 'line' ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0',
                HOUSE_CHART_MEAN_LINE_CLASS,
                HOUSE_TOGGLE_CHART_MORPH_CLASS,
              )}
              style={{
                bottom: `${Math.max(0, Math.min(100, (renderedMeanValue / barHeightAxisMax) * 100))}%`,
                transitionDuration: barTransitionDuration,
                transitionDelay: '0ms',
              }}
              aria-hidden="true"
            />
          ) : null}
          {effectiveVisualMode === 'line' ? (
            <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden="true">
              {lineSeriesPoints.map((point, index) => (
                <span
                  key={`pub-cumulative-point-${index}`}
                  className="absolute h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[hsl(var(--tone-accent-500))] shadow-[var(--elevation-1)]"
                  style={{
                    left: `${Math.max(0, Math.min(100, point.xPct))}%`,
                    bottom: `calc(${Math.max(0, Math.min(100, point.yPct))}% - 0.15rem)`,
                  }}
                />
              ))}
            </div>
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
              const leftPct = index * slotMetrics.slotStepPct
              const isActive = hoveredIndex === index
              const toneClass = resolveBarToneClass(bar.value, bar.current)
              const baseScaleX = isActive ? 1.035 : 1
              const barScaleY = effectiveVisualMode === 'bars' && barsExpanded ? 1 : 0
              const entryDelayMs = isEntryCycle && barsExpanded
                ? CHART_MOTION.entry.delay + Math.min(CHART_MOTION.entry.staggerMax, Math.max(0, index) * CHART_MOTION.entry.stagger)
                : 0
              return (
                <div
                  key={`slot-${index}`}
                  className={cn('absolute inset-y-0 z-[1]', enableWindowToggle && HOUSE_TOGGLE_CHART_MORPH_CLASS)}
                  style={{
                    left: `${leftPct}%`,
                    width: `${slotMetrics.slotWidthPct}%`,
                    pointerEvents: effectiveVisualMode === 'line' ? 'none' : undefined,
                    transitionDuration: barTransitionDuration,
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
                      enableWindowToggle && HOUSE_TOGGLE_CHART_SWAP_CLASS,
                      effectiveVisualMode === 'line' && 'opacity-0',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${baseScaleX}) scaleY(${barScaleY})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${entryDelayMs}ms`,
                      transitionDuration: barTransitionDuration,
                    }}
                  />
                </div>
              )
            })}
          </div>
          {effectiveVisualMode === 'line' ? (
            <div className="absolute inset-0 z-[3]">
              {lineSeriesPoints.map((point, index) => (
                <span
                  key={`pub-cumulative-point-hit-${point.key}`}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full"
                  style={{
                    left: `${Math.max(0, Math.min(100, point.xPct))}%`,
                    bottom: `${Math.max(0, Math.min(100, point.yPct))}%`,
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : null}
          {effectiveVisualMode === 'line' && hoveredLinePoint ? (
            <>
              <span
                className={cn(
                  HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                  'pointer-events-none z-[4] opacity-100 translate-y-0',
                )}
                style={{
                  left: `${Math.max(0, Math.min(100, hoveredLinePoint.xPct))}%`,
                  transform: 'translateX(-50%)',
                  bottom: `calc(${Math.max(0, Math.min(100, hoveredLinePoint.yPct))}% + ${PUBLICATIONS_CHART_TOOLTIP_OFFSET_REM}rem)`,
                }}
                aria-hidden="true"
              >
                {formatInt(hoveredLinePoint.value)}
              </span>
              <span
                className="pointer-events-none absolute z-[4] h-2 w-2 -translate-x-1/2 rounded-full border border-white/85 bg-[hsl(var(--tone-accent-700))] shadow-[var(--elevation-1)]"
                style={{
                  left: `${Math.max(0, Math.min(100, hoveredLinePoint.xPct))}%`,
                  bottom: `calc(${Math.max(0, Math.min(100, hoveredLinePoint.yPct))}% - 0.22rem)`,
                }}
                aria-hidden="true"
              />
            </>
          ) : null}
        </div>

        {showAxes ? (
          <div className="pointer-events-none absolute" style={yAxisPanelStyle} aria-hidden="true">
            {yAxisTickValues.map((tickValue, index) => {
              const pct = Math.max(0, Math.min(100, (yAxisTickRatios[index] || 0) * 100))
                return (
                  <p
                    key={`pub-y-axis-${index}`}
                    className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                    style={{ bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)` }}
                  >
                    {formatInt(tickValue)}
                  </p>
                )
              })}
            <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}>
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
                const isFirst = index === 0
                const isLast = index === lastIndex
                const tickRoleLabel = isFirst ? 'Start' : isLast ? 'End' : 'Middle'
                return (
                  <div
                    key={tick.key}
                    className={cn(
                      'house-chart-axis-period-item absolute top-0 leading-none',
                      HOUSE_CHART_SCALE_TICK_CLASS,
                    )}
                    style={{
                      left: `${tick.leftPct}%`,
                      transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                      transitionDuration: `${axisDurationMs}ms`,
                      transitionProperty: 'left, opacity',
                    }}
                    aria-label={`${tickRoleLabel}: ${tick.label}${tick.subLabel ? ` ${tick.subLabel}` : ''}`}
                  >
                    <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                      {tick.label}
                    </p>
                    {tick.subLabel ? (
                      <p className={cn(HOUSE_CHART_AXIS_SUBTEXT_CLASS, HOUSE_CHART_AXIS_PERIOD_TAG_CLASS, 'break-words px-0.5')}>
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
                  style={{ transitionDuration: barTransitionDuration }}
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
              bottom: `${xAxisLabelLayout.xAxisNameBottomRem}rem`,
              minHeight: `${xAxisLabelLayout.xAxisNameMinHeightRem}rem`,
            }}
          >
            <p className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'break-words text-center leading-tight')}>
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
                  }}
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
  const entryBarsExpanded = useUnifiedToggleBarAnimation(`${animationKey}|entry`, hasComparisonBars && isEntryCycle)
  const barsExpanded = isEntryCycle ? entryBarsExpanded : true
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
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
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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
  const progressTransitionDuration = tileChartDurationVar(isEntryCycle)

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
                  transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                  '--chart-transition-duration': progressTransitionDuration,
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
  bars: Array<{ key: string; label: string; count: number; percentage: number }>
  rangeLabel: string | null
  totalCount: number
}

function categoryLabelFromPublication(
  record: PublicationDrilldownRecord,
  dimension: PublicationCategoryDimension,
): string {
  if (dimension === 'article') {
    return formatPublicationCategoryLabel(record.articleType || record.type || '')
  }
  const label = formatPublicationCategoryLabel(record.publicationType || record.type || '')
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
  emptyLabel,
  enableValueModeToggle = false,
}: {
  publications: PublicationDrilldownRecord[]
  dimension: PublicationCategoryDimension
  xAxisLabel: string
  emptyLabel: string
  enableValueModeToggle?: boolean
}) {
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
      totals.set(label, (totals.get(label) || 0) + 1)
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
  }, [dimension, publications])

  const barsByWindowMode = useMemo(() => {
    const primaryLabelSet = new Set(categoryConfig.primaryLabels)
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
      for (const record of publications) {
        if (record.year === null || !yearSet.has(record.year)) {
          continue
        }
        const label = categoryLabelFromPublication(record, dimension)
        if (primaryLabelSet.has(label)) {
          counts.set(label, (counts.get(label) || 0) + 1)
          continue
        }
        if (categoryConfig.hasOtherBucket) {
          otherCount += 1
        }
      }
      const bars = categoryConfig.primaryLabels.map((label) => ({
        key: `${mode}-${label}`,
        label,
        count: Math.max(0, counts.get(label) || 0),
        percentage: 0,
      }))
      if (categoryConfig.hasOtherBucket) {
        bars.push({
          key: `${mode}-other`,
          label: 'Other',
          count: Math.max(0, otherCount),
          percentage: 0,
        })
      }
      const totalCount = Math.max(
        0,
        bars.reduce((sum, bar) => sum + Math.max(0, bar.count), 0),
      )
      const normalizedBars = bars.map((bar) => ({
        ...bar,
        percentage: totalCount > 0 ? (bar.count / totalCount) * 100 : 0,
      }))
      const rangeLabel = windowYears.length
        ? windowYears[0] === windowYears[windowYears.length - 1]
          ? String(windowYears[0])
          : `${windowYears[0]}-${windowYears[windowYears.length - 1]}`
        : null
      return { bars: normalizedBars, rangeLabel, totalCount }
    }
    return {
      '1y': build('1y'),
      '3y': build('3y'),
      '5y': build('5y'),
      all: build('all'),
    } as const
  }, [categoryConfig.hasOtherBucket, categoryConfig.primaryLabels, dimension, fullYears, publications])
  const tableRows = useMemo(() => {
    const yearSet = new Set(windowYears)
    const counts = new Map<string, number>()
    for (const record of publications) {
      if (record.year === null || !yearSet.has(record.year)) {
        continue
      }
      const label = categoryLabelFromPublication(record, dimension)
      counts.set(label, (counts.get(label) || 0) + 1)
    }
    const totalCount = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)
    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1]
        }
        return left[0].localeCompare(right[0])
      })
      .map(([label, count]) => ({
        label,
        count,
        percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
      }))
  }, [dimension, publications, windowYears])

  const activeWindowBars = barsByWindowMode[windowMode]
  const activeBars = activeWindowBars.bars
  const hasBars = activeBars.length > 0
  const showPercentageMode = enableValueModeToggle && valueMode === 'percentage'
  const renderValueForBar = (bar: { count: number; percentage: number }): number => (
    showPercentageMode ? Math.max(0, bar.percentage) : Math.max(0, bar.count)
  )
  const formatRenderedValue = (value: number): string => (
    showPercentageMode ? `${Math.round(value)}%` : formatInt(value)
  )
  const animationKey = useMemo(
    () => `${dimension}|${windowMode}|${valueMode}|${activeBars.map((bar) => `${bar.label}-${bar.count}`).join('|')}`,
    [activeBars, dimension, valueMode, windowMode],
  )
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const swapTransition = useHouseBarSetTransition({
    bars: activeBars,
    animationKey,
    enabled: hasBars,
  })
  const renderBars = swapTransition.renderBars
  const barsExpanded = swapTransition.barsExpanded
  const renderedValuesTarget = useMemo(
    () => renderBars.map((bar) => (showPercentageMode ? Math.max(0, bar.percentage) : Math.max(0, bar.count))),
    [renderBars, showPercentageMode],
  )
  const renderedValuesAnimated = useEasedSeries(
    renderedValuesTarget,
    `${animationKey}|category|${renderBars.map((bar) => bar.key).join('|')}`,
    hasBars && barsExpanded,
    axisDurationMs,
  )

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
    : Math.max(
      1,
      ...[...activeBars, ...renderBars].map((bar) => Math.max(0, bar.count)),
    )
  const targetAxisScale = showPercentageMode
    ? { axisMax: 100, ticks: [0, 25, 50, 75, 100] }
    : buildNiceAxis(maxWindowValue)
  const targetAxisMax = targetAxisScale.axisMax
  const [hasAxisAnimationPrimed, setHasAxisAnimationPrimed] = useState(false)
  useEffect(() => {
    setHasAxisAnimationPrimed(true)
  }, [])
  const axisAnimationEnabled = hasBars && hasAxisAnimationPrimed
  const animatedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|axis-max|${showPercentageMode ? 'percentage' : 'absolute'}`,
    axisAnimationEnabled,
    axisDurationMs,
  )
  const axisMax = axisAnimationEnabled ? Math.max(1, animatedAxisMax) : targetAxisMax
  const yAxisTickRatios = targetAxisScale.ticks.map((tickValue) => (
    targetAxisScale.axisMax <= 0 ? 0 : tickValue / targetAxisScale.axisMax
  ))
  const yAxisTickValues = yAxisTickRatios.map((ratio) => ratio * axisMax)
  const gridTickRatios = yAxisTickRatios.slice(1)

  if (!hasBars) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }
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
    ? Array.from(new Set<number>([...absoluteAxisScale.ticks, 0, 25, 50, 75, 100])).sort((left, right) => left - right)
    : yAxisTickValues
  const yAxisPanelWidthRem = buildYAxisPanelWidthRem(
    fixedToggleYAxisTicks,
    true,
    enableValueModeToggle ? 1 : 0,
  )
  const yAxisTitleLeft = enableValueModeToggle ? '44%' : '50%'
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
  const activeWindowIndex = PUBLICATIONS_WINDOW_OPTIONS.findIndex((option) => option.value === windowMode)
  const activeValueModeIndex = PUBLICATION_VALUE_MODE_OPTIONS.findIndex((option) => option.value === valueMode)
  const activeDisplayModeIndex = PUBLICATION_DISPLAY_MODE_OPTIONS.findIndex((option) => option.value === displayMode)
  const tableHeadingLabel = dimension === 'article' ? 'Article type' : 'Publication type'
  const tableTotalCount = tableRows.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS}>
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
          {enableValueModeToggle ? (
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
              data-stop-tile-open="true"
              data-ui={`${dimension}-value-mode-toggle`}
              data-house-role="chart-toggle"
            >
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={buildTileToggleThumbStyle(activeValueModeIndex, PUBLICATION_VALUE_MODE_OPTIONS.length, isEntryCycle)}
                  aria-hidden="true"
                />
              {PUBLICATION_VALUE_MODE_OPTIONS.map((option) => (
                <button
                  key={`${dimension}-value-mode-${option.value}`}
                  type="button"
                  data-stop-tile-open="true"
                  className={cn(
                    HOUSE_TOGGLE_BUTTON_CLASS,
                    valueMode === option.value
                      ? 'text-white'
                      : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                  )}
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
          ) : null}
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
            data-stop-tile-open="true"
            data-ui={`${dimension}-display-mode-toggle`}
            data-house-role="chart-toggle"
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
      {renderDisplayMode === 'table' ? (
        <div
          className={cn(
            HOUSE_CHART_TRANSITION_CLASS,
            HOUSE_CHART_ENTERED_CLASS,
            'min-h-0 overflow-auto',
          )}
          data-ui={`${dimension}-distribution-table-frame`}
          data-house-role="chart-frame"
        >
          <div className="house-table-shell h-full min-h-0 overflow-auto rounded-md bg-background">
            <table className="w-full min-w-sz-500 border-collapse">
              <thead className="house-table-head">
                <tr>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    {tableHeadingLabel}
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-right align-middle font-semibold">
                    Count
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-right align-middle font-semibold">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${dimension}-table-row-${row.label}`} className="house-table-row">
                    <td className="house-table-cell-text px-3 py-2">
                      <span className="block max-w-full break-words leading-snug">{row.label}</span>
                    </td>
                    <td className="house-table-cell-text px-3 py-2 text-right tabular-nums">{formatInt(row.count)}</td>
                    <td className="house-table-cell-text px-3 py-2 text-right tabular-nums">{`${row.percentage.toFixed(1)}%`}</td>
                  </tr>
                ))}
                {tableRows.length ? (
                  <tr className="house-table-row">
                    <td className="house-table-cell-text px-3 py-2 font-semibold">Total</td>
                    <td className="house-table-cell-text px-3 py-2 text-right font-semibold tabular-nums">{formatInt(tableTotalCount)}</td>
                    <td className="house-table-cell-text px-3 py-2 text-right font-semibold tabular-nums">100.0%</td>
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
      ) : (
        <div
          className={cn(
            HOUSE_CHART_TRANSITION_CLASS,
            HOUSE_CHART_ENTERED_CLASS,
          )}
          style={chartFrameStyle}
          data-ui={`${dimension}-distribution-chart-frame`}
          data-house-role="chart-frame"
        >
        <div className="absolute" style={plotAreaStyle}>
          {gridTickRatios.map((ratio, index) => (
            <div
              key={`${dimension}-grid-${index}`}
              className={cn('pointer-events-none absolute inset-x-0', HOUSE_CHART_GRID_LINE_CLASS, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ bottom: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {renderBars.map((bar, index) => {
              const animatedValue = Math.max(0, renderedValuesAnimated[index] ?? renderValueForBar(bar))
              const heightPct = animatedValue <= 0 ? 3 : Math.min(100, Math.max(6, (animatedValue / axisMax) * 100))
              const isActive = hoveredIndex === index
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
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatRenderedValue(animatedValue)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      HOUSE_TOGGLE_CHART_SWAP_CLASS,
                      HOUSE_CHART_BAR_ACCENT_CLASS,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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
            return (
              <p
                key={`${dimension}-y-axis-${index}`}
                className={cn('absolute right-0 whitespace-nowrap tabular-nums leading-none', HOUSE_CHART_AXIS_TEXT_TREND_CLASS, HOUSE_CHART_SCALE_TICK_CLASS)}
                style={{ bottom: `calc(${pct}% - ${yAxisTickOffsetRem}rem)` }}
              >
                {showPercentageMode ? `${Math.round(tickValue)}%` : formatInt(tickValue)}
              </p>
            )
          })}
          <p
            className={cn(HOUSE_CHART_AXIS_TITLE_CLASS, HOUSE_CHART_SCALE_AXIS_TITLE_CLASS, 'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap')}
            style={{ left: yAxisTitleLeft }}
          >
            {showPercentageMode ? 'Share (%)' : 'Publications'}
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
      )}
    </div>
  )
}

function TotalPublicationsDrilldownWorkspace({
  tile,
  activeTab,
  onOpenPublication: _onOpenPublication,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  onOpenPublication?: (workId: string) => void
}) {
  void _onOpenPublication
  const [publicationTrendsWindowMode, setPublicationTrendsWindowMode] = useState<PublicationsWindowMode>('5y')
  const [publicationTrendsVisualMode, setPublicationTrendsVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const publicationTrendsWindowIndex = Math.max(
    0,
    PUBLICATIONS_WINDOW_OPTIONS.findIndex((option) => option.value === publicationTrendsWindowMode),
  )
  const publicationTrendsAnimationKey = `pub-trends|${publicationTrendsWindowMode}|${publicationTrendsVisualMode}`
  const publicationTrendsIsEntryCycle = useIsFirstChartEntry(publicationTrendsAnimationKey, true)

  useEffect(() => {
    setPublicationTrendsWindowMode('5y')
    setPublicationTrendsVisualMode('bars')
  }, [tile.key])

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
    const rolling3Year = Math.round(rollingWindowSum(3))
    const rolling5Year = Math.round(rollingWindowSum(5))

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
    const meanDenominator = Math.max(1, Math.min(5, historyBars.length))
    const meanYearlyPublications = historyBars.length > 0
      ? rolling5Year / meanDenominator
      : Number(chartData.mean_value)
    const meanYearlyValue = Number.isFinite(meanYearlyPublications)
      ? formatDrilldownValue(Math.round(meanYearlyPublications * 10) / 10)
      : '\u2014'
    const yearToDateValue = formatInt(Math.round(resolvedCurrentYearYtd))

    return [
      { label: 'Total publications', value: totalPublicationsValue },
      { label: 'Active years', value: activeYearsValue },
      { label: 'Mean yearly publications', value: meanYearlyValue },
      { label: 'Highest yield', value: highestYieldValue },
      { label: 'Last 1 year', value: formatInt(rolling1Year) },
      { label: 'Last 3 years', value: formatInt(rolling3Year) },
      { label: 'Last 5 years', value: formatInt(rolling5Year) },
      { label: 'Year-to-date', value: yearToDateValue },
    ]
  }, [tile])
  const subsectionTitleByTab: Partial<Record<DrilldownTab, string>> = {
    breakdown: 'Publication count by year',
    trajectory: 'Year-over-year trajectory',
    context: 'Top publication venues',
    methods: 'Method details',
  }
  const subsectionTitle = subsectionTitleByTab[activeTab] || null

  return (
    <div className="house-publications-drilldown-stack-3" data-metric-key={tile.key}>
      <div className={cn(HOUSE_SURFACE_SECTION_PANEL_CLASS, 'house-publications-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Headline results</p>
        </div>
        <div className="house-drilldown-content-block house-publications-headline-content w-full">
          {activeTab === 'summary' ? (
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
          ) : null}
        </div>

        {activeTab === 'summary' ? (
          <>
            <div className="house-drilldown-heading-block">
              <p className="house-drilldown-heading-block-title">Publication trends</p>
            </div>
            <div className="house-drilldown-content-block w-full">
              <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'justify-between')}>
                <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
                  <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                    <div
                      className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-4')}
                      data-stop-tile-open="true"
                      data-ui="publications-trends-window-toggle"
                      data-house-role="chart-toggle"
                    >
                      <span
                        className={HOUSE_TOGGLE_THUMB_CLASS}
                        style={buildTileToggleThumbStyle(publicationTrendsWindowIndex, PUBLICATIONS_WINDOW_OPTIONS.length, publicationTrendsIsEntryCycle)}
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
                  showAxes
                  enableWindowToggle
                  showPeriodHint
                  showCurrentPeriodSemantic
                  useCompletedMonthWindowLabels
                  autoScaleByWindow
                  showMeanLine
                  showMeanValueLabel
                  subtleGrid
                  activeWindowMode={publicationTrendsWindowMode}
                  onWindowModeChange={setPublicationTrendsWindowMode}
                  visualMode={publicationTrendsVisualMode}
                  onVisualModeChange={setPublicationTrendsVisualMode}
                  showWindowToggle={false}
                />
              </div>
            </div>
          </>
        ) : null}

        {subsectionTitle ? (
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
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
}) {
  const subsectionTitleByTab: Partial<Record<DrilldownTab, string>> = {
    breakdown: 'Breakdown results',
    trajectory: 'Trajectory results',
    context: 'Context results',
    methods: 'Methods metadata',
  }
  const subsectionTitle = subsectionTitleByTab[activeTab] || null

  return (
    <div className="house-publications-drilldown-stack-3" data-metric-key={tile.key}>
      <div className={cn(HOUSE_SURFACE_SECTION_PANEL_CLASS, 'house-publications-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Headline results</p>
        </div>
        <div className="house-drilldown-content-block w-full" />

        {subsectionTitle ? (
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
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
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
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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
  const entryBarsExpanded = useUnifiedToggleBarAnimation(`${animationKey}|entry`, hasBars && isEntryCycle)
  const barsExpanded = isEntryCycle ? entryBarsExpanded : true
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
    axisDurationMs,
  )
  const targetAxisMax = useMemo(
    () => Math.max(1, ...targetValues) * 1.18,
    [targetValues],
  )
  const animatedAxisMax = useEasedValue(
    targetAxisMax,
    `${animationKey}|axis-max`,
    hasBars,
    axisDurationMs,
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
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                      transitionDuration: barTransitionDuration,
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
  }, [mode])

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
  
  // Entry cycle tracking for tile toggles (top-level hooks)
  const momentumAnimationKey = `momentum|${momentumWindowMode}`
  const isEntryCycle = useIsFirstChartEntry(momentumAnimationKey, true)
  const fieldPercentileAnimationKey = `field_percentile|${fieldPercentileThreshold}`
  const isFieldPercentileEntryCycle = useIsFirstChartEntry(fieldPercentileAnimationKey, true)
  
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
      return 'A Summary of your publication metrics'
    }
    return sanitizedActiveTileDefinition
  }, [activeDrilldownTab, activeTile?.key, sanitizedActiveTileDefinition])

  return (
    <>
      <Card className={HOUSE_SURFACE_PANEL_BARE_CLASS} style={tileMotionStyle}>
        <CardContent className="p-0">
          <div className="house-main-heading-block">
            <p className={HOUSE_HEADING_SECTION_TITLE_CLASS}>{PUBLICATION_INSIGHTS_TITLE}</p>
            {metrics?.status === 'FAILED' ? (
              <p className={cn('self-center', HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_WARNING_CLASS)}>Last update failed</p>
            ) : null}
            <div className="ml-auto flex h-8 w-[25rem] shrink-0 items-center justify-end gap-1 overflow-visible self-center">
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
                  <div className="group relative inline-flex">
                    <Button
                      type="button"
                      data-stop-tile-open="true"
                      variant="house"
                      size="icon"
                      className="h-8 w-8 house-publications-toolbox-item"
                      aria-label={`Generate ${PUBLICATION_INSIGHTS_LABEL} report`}
                    >
                      <FileText className="h-4 w-4" strokeWidth={2.1} />
                    </Button>
                    <span
                      className={cn(
                        HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                        'top-auto bottom-full mb-[0.35rem] z-[999]',
                        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                      )}
                      aria-hidden="true"
                    >
                      Generate report
                    </span>
                  </div>
                  <div className="house-publications-toolbox-divider" aria-hidden="true" />
                  <div className="group relative inline-flex">
                    <Button
                      type="button"
                      data-stop-tile-open="true"
                      variant="house"
                      size="icon"
                      className="h-8 w-8 house-publications-toolbox-item"
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" strokeWidth={2.1} />
                    </Button>
                    <span
                      className={cn(
                        HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                        'top-auto bottom-full mb-[0.35rem] z-[999]',
                        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                      )}
                      aria-hidden="true"
                    >
                      Download
                    </span>
                  </div>
                  <div className="house-publications-toolbox-divider" aria-hidden="true" />
                  <div className="group relative inline-flex">
                    <Button
                      type="button"
                      data-stop-tile-open="true"
                      variant="house"
                      size="icon"
                      className="h-8 w-8 house-publications-toolbox-item"
                      aria-label="Share"
                    >
                      <Share2 className="h-4 w-4" strokeWidth={2.1} />
                    </Button>
                    <span
                      className={cn(
                        HOUSE_DRILLDOWN_TOOLTIP_CLASS,
                        'top-auto bottom-full mb-[0.35rem] z-[999]',
                        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                      )}
                      aria-hidden="true"
                    >
                      Share
                    </span>
                  </div>
                </div>
              </div>
              {insightsVisible ? (
                <div className="flex items-center gap-1">
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
                </div>
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
            </div>
          </div>

          {insightsVisible && loading && tiles.length === 0 ? (
            <div className="house-main-content-block publications-insights-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="w-full min-h-36 px-3 py-2.5">
                  <div className={cn('h-full rounded-sm', HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS)} />
                </div>
              ))}
            </div>
          ) : insightsVisible && tiles.length === 0 ? (
            <div className="house-main-content-block pb-3">
              <div className={cn('rounded-sm px-3 py-2.5 text-sm', HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_WARNING_CLASS)}>
                <p>No publication insight tiles are available yet.</p>
                {metrics?.status === 'RUNNING' ? <p className="mt-1">Metrics are currently computing. This panel updates automatically.</p> : null}
                {metrics?.status === 'FAILED' ? <p className="mt-1">Metrics refresh failed. Use Sync Publications to retry.</p> : null}
              </div>
            </div>
          ) : insightsVisible ? (
            <div className="house-main-content-block publications-insights-grid">
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
                          style={buildTileToggleThumbStyle(momentumWindowMode === '5y' ? 1 : 0, 2, isEntryCycle)}
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
                        style={buildTileToggleThumbStyle(activeThresholdIndex, availableThresholds.length, isFieldPercentileEntryCycle)}
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
            </div>
          ) : (
            <div className="house-main-content-block pb-3">
              <section className="house-notification-section" aria-live="polite">
                <div className={cn(HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_INFO_CLASS)}>
                  <p>Publication insights hidden by user.</p>
                </div>
              </section>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
          {activeTile ? (
            <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
              <div className="house-drilldown-flow-shell">
                <HouseDrilldownHeaderShell
                  title={<p className={HOUSE_DRILLDOWN_TITLE_CLASS}>{activeDrilldownTitle}</p>}
                  subtitle={showActiveTileDefinition ? <p className={HOUSE_DRILLDOWN_TITLE_EXPANDER_CLASS}>{activeDrilldownExpanderText}</p> : undefined}
                  alert={detailError ? <p className={cn('mt-2', HOUSE_DRILLDOWN_ALERT_CLASS)}>{detailError}</p> : undefined}
                  titleBlockClassName={cn(HOUSE_SURFACE_LEFT_BORDER_CLASS, HOUSE_SURFACE_LEFT_BORDER_PUBLICATIONS_CLASS)}
                  navAriaLabel="Metric drilldown sections"
                  tabs={DRILLDOWN_TABS.map((tab) => ({ id: tab.value, label: tab.label }))}
                  activeTab={activeDrilldownTab}
                  onTabChange={(tabId) => setActiveDrilldownTab(tabId as DrilldownTab)}
                  panelIdPrefix="drilldown-panel-"
                  tabIdPrefix="drilldown-tab-"
                  tabFlexGrow={drilldownTabFlexGrow}
                />
                <div
                  className="house-drilldown-content-block house-drilldown-tab-panel"
                  id={`drilldown-panel-${activeDrilldownTab}`}
                  role="tabpanel"
                  aria-labelledby={`drilldown-tab-${activeDrilldownTab}`}
                >
                  {activeTile.key === 'this_year_vs_last' ? (
                    <TotalPublicationsDrilldownWorkspace
                      tile={activeTile}
                      activeTab={activeDrilldownTab}
                      onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                    />
                  ) : (
                    <GenericMetricDrilldownWorkspace
                      tile={activeTile}
                      activeTab={activeDrilldownTab}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a metric tile to inspect its drilldown.</div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}











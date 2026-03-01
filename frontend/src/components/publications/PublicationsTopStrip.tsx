import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Download, Eye, EyeOff, FileText, Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  const axisMinHeightRem = (labelLineCount * axisLineHeightRem) + (subLabelLineCount * subAxisLineHeightRem) + 0.58
  const xAxisNameHeightRem = hasXAxisName
    ? (axisNameLineCount * subAxisLineHeightRem) + 0.24
    : 0
  const xAxisNameBottomRem = hasXAxisName ? 0.24 : 0
  const axisBottomRem = hasXAxisName ? xAxisNameBottomRem + xAxisNameHeightRem + 0.2 : 0.5
  const plotBottomRem = axisBottomRem + axisMinHeightRem + 0.5
  const framePaddingBottomRem = plotBottomRem + 0.72
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
  { value: 'all', label: 'All' },
]
const PUBLICATION_VALUE_MODE_OPTIONS: Array<{ value: PublicationCategoryValueMode; label: string }> = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage', label: '%' },
]
const PUBLICATION_DISPLAY_MODE_OPTIONS: Array<{ value: PublicationCategoryDisplayMode; label: string }> = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
]
const HOUSE_HEADING_TITLE_CLASS = publicationsHouseHeadings.title
const HOUSE_HEADING_SECTION_TITLE_CLASS = publicationsHouseHeadings.sectionTitle
const HOUSE_HEADING_H2_CLASS = publicationsHouseHeadings.h2
const HOUSE_TEXT_CLASS = publicationsHouseHeadings.text
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
const HOUSE_CHART_SCALE_MEAN_LINE_CLASS = publicationsHouseMotion.chartScaleMeanLine
const HOUSE_CHART_SCALE_MEAN_LINE_DELAYED_CLASS = publicationsHouseMotion.chartScaleMeanLineDelayed
const HOUSE_TOGGLE_TRACK_CLASS = publicationsHouseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = publicationsHouseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = publicationsHouseMotion.toggleButton
const HOUSE_TOGGLE_CHART_BAR_CLASS = publicationsHouseMotion.toggleChartBar
const HOUSE_TOGGLE_CHART_MORPH_CLASS = publicationsHouseMotion.toggleChartMorph
const HOUSE_TOGGLE_CHART_SWAP_CLASS = publicationsHouseMotion.toggleChartSwap
const HOUSE_TOGGLE_CHART_LABEL_CLASS = publicationsHouseMotion.toggleChartLabel
const HOUSE_SURFACE_SECTION_PANEL_CLASS = publicationsHouseSurfaces.sectionPanel
const HOUSE_SURFACE_SOFT_PANEL_CLASS = publicationsHouseSurfaces.softPanel
const HOUSE_SURFACE_STRONG_PANEL_CLASS = publicationsHouseSurfaces.strongPanel
const HOUSE_SURFACE_PANEL_BARE_CLASS = publicationsHouseSurfaces.panelBare
const HOUSE_SURFACE_BANNER_CLASS = publicationsHouseSurfaces.banner
const HOUSE_SURFACE_BANNER_WARNING_CLASS = publicationsHouseSurfaces.bannerWarning
const HOUSE_SURFACE_METRIC_PILL_CLASS = publicationsHouseSurfaces.metricPill
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_CLASS = publicationsHouseSurfaces.metricPillPublications
const HOUSE_SURFACE_METRIC_PILL_PUBLICATIONS_REGULAR_CLASS = publicationsHouseSurfaces.metricPillPublicationsRegular
const HOUSE_SURFACE_LEFT_BORDER_CLASS = publicationsHouseSurfaces.leftBorder
const HOUSE_DIVIDER_BORDER_SOFT_CLASS = publicationsHouseDividers.borderSoft
const HOUSE_ACTIONS_SECTION_TOOLS_CLASS = publicationsHouseActions.sectionTools
const HOUSE_ACTIONS_SECTION_TOOLS_PUBLICATIONS_CLASS = publicationsHouseActions.sectionToolsPublications
const HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS = publicationsHouseActions.sectionToolButton
const HOUSE_ACTIONS_PILL_CLASS = publicationsHouseActions.actionPill
const HOUSE_ACTIONS_PILL_PRIMARY_CLASS = publicationsHouseActions.actionPillPrimary
const HOUSE_ACTIONS_PILL_ICON_GROUP_CLASS = publicationsHouseActions.actionPillIconGroup
const HOUSE_ACTIONS_PILL_ICON_CLASS = publicationsHouseActions.actionPillIcon
const HOUSE_DRILLDOWN_SHEET_CLASS = publicationsHouseDrilldown.sheet
const HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS = publicationsHouseDrilldown.tabTrigger
const HOUSE_DRILLDOWN_TAB_LIST_CLASS = publicationsHouseDrilldown.tabList
const HOUSE_DRILLDOWN_PLACEHOLDER_CLASS = publicationsHouseDrilldown.placeholder
const HOUSE_DRILLDOWN_ALERT_CLASS = publicationsHouseDrilldown.alert
const HOUSE_DRILLDOWN_HINT_CLASS = publicationsHouseDrilldown.hint
const HOUSE_DRILLDOWN_CAPTION_CLASS = publicationsHouseDrilldown.caption
const HOUSE_DRILLDOWN_CHIP_CLASS = publicationsHouseDrilldown.chip
const HOUSE_DRILLDOWN_CHIP_ACTIVE_CLASS = publicationsHouseDrilldown.chipActive
const HOUSE_DRILLDOWN_ACTION_CLASS = publicationsHouseDrilldown.action
const HOUSE_DRILLDOWN_ROW_CLASS = publicationsHouseDrilldown.row
const HOUSE_DRILLDOWN_ROW_ACTIVE_CLASS = publicationsHouseDrilldown.rowActive
const HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS = publicationsHouseDrilldown.progressTrack
const HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS = publicationsHouseDrilldown.progressFill
const HOUSE_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_DRILLDOWN_STAT_VALUE_CLASS = publicationsHouseDrilldown.statValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS = publicationsHouseDrilldown.summaryStatValueEmphasis
const HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS = publicationsHouseDrilldown.summaryStatCard
const HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_ACTIVE_CLASS = publicationsHouseDrilldown.summaryStatCardActive
const HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = publicationsHouseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_AXIS_CLASS = publicationsHouseDrilldown.axis
const HOUSE_DRILLDOWN_RANGE_CLASS = publicationsHouseDrilldown.range
const HOUSE_DRILLDOWN_BADGE_CLASS = publicationsHouseDrilldown.badge
const HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS = publicationsHouseDrilldown.badgePositive
const HOUSE_DRILLDOWN_BADGE_WARNING_CLASS = publicationsHouseDrilldown.badgeWarning
const HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS = publicationsHouseDrilldown.badgeNeutral
const HOUSE_DRILLDOWN_NOTE_CLASS = publicationsHouseDrilldown.note
const HOUSE_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_DRILLDOWN_DIVIDER_TOP_CLASS = publicationsHouseDrilldown.dividerTop
const HOUSE_DRILLDOWN_CHART_GRID_SVG_CLASS = publicationsHouseDrilldown.chartGridSvg
const HOUSE_DRILLDOWN_CHART_AREA_SVG_CLASS = publicationsHouseDrilldown.chartAreaSvg
const HOUSE_DRILLDOWN_CHART_MOVING_SVG_CLASS = publicationsHouseDrilldown.chartMovingSvg
const HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS = publicationsHouseDrilldown.chartMainSvg
const HOUSE_DRILLDOWN_CHART_TOOLTIP_CLASS = publicationsHouseDrilldown.chartTooltip
const HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS = publicationsHouseDrilldown.skeletonBlock
const HOUSE_DRILLDOWN_BAR_SELECTED_CLASS = publicationsHouseDrilldown.barSelected
const HOUSE_DRILLDOWN_BAR_SELECTED_OUTLINE_CLASS = publicationsHouseDrilldown.barSelectedOutline
const HOUSE_DRILLDOWN_TABLE_ROW_CLASS = publicationsHouseDrilldown.tableRow
const HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS = publicationsHouseDrilldown.tableEmpty
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = publicationsHouseDrilldown.toggleButtonMuted
const HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS = publicationsHouseDrilldown.summaryStatsGrid
const HOUSE_DRILLDOWN_SUMMARY_STATS_COMPACT_GRID_CLASS = publicationsHouseDrilldown.summaryStatsGridCompact
const HOUSE_DRILLDOWN_SUMMARY_TREND_CHART_CLASS = publicationsHouseDrilldown.summaryTrendChart
const HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS = publicationsHouseDrilldown.chartControlsRow
const HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS = publicationsHouseDrilldown.chartControlsLeft
const HOUSE_DRILLDOWN_CHART_META_CLASS = publicationsHouseDrilldown.chartMeta
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = publicationsHouseDrilldown.sheetBody
const HOUSE_DRILLDOWN_SECTION_SEPARATOR_CLASS = publicationsHouseDrilldown.sectionSeparator
const HOUSE_DRILLDOWN_SECTION_TITLE_SPACER_CLASS = publicationsHouseDrilldown.sectionTitleSpacer
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
const HOUSE_CHART_LINE_SOFT_SVG_CLASS = publicationsHouseCharts.lineSoftSvg
const HOUSE_CHART_RING_TRACK_SVG_CLASS = publicationsHouseCharts.ringTrackSvg
const HOUSE_CHART_RING_MAIN_SVG_CLASS = publicationsHouseCharts.ringMainSvg
const HOUSE_CHART_RING_REMAINDER_SVG_CLASS = publicationsHouseCharts.ringRemainderSvg
const HOUSE_CHART_RING_THRESHOLD_50_SVG_CLASS = publicationsHouseCharts.ringThreshold50Svg
const HOUSE_CHART_RING_THRESHOLD_75_SVG_CLASS = publicationsHouseCharts.ringThreshold75Svg
const HOUSE_CHART_RING_THRESHOLD_90_SVG_CLASS = publicationsHouseCharts.ringThreshold90Svg
const HOUSE_CHART_RING_THRESHOLD_95_SVG_CLASS = publicationsHouseCharts.ringThreshold95Svg
const HOUSE_CHART_RING_THRESHOLD_99_SVG_CLASS = publicationsHouseCharts.ringThreshold99Svg
const HOUSE_CHART_RING_TOGGLE_LAYOUT_CLASS = publicationsHouseCharts.ringToggleLayout
const HOUSE_CHART_RING_TOGGLE_CONTROL_CLASS = publicationsHouseCharts.ringToggleControl
const HOUSE_CHART_RING_TOGGLE_VISUAL_CLASS = publicationsHouseCharts.ringToggleVisual
const HOUSE_CHART_RING_CENTER_LABEL_CLASS = publicationsHouseCharts.ringCenterLabel
const HOUSE_CHART_RING_PANEL_CLASS = publicationsHouseCharts.ringPanel
const HOUSE_CHART_RING_SIZE_CLASS = publicationsHouseCharts.ringSize
const HOUSE_CHART_MINI_DONUT_CLASS = publicationsHouseCharts.miniDonut
const HOUSE_METRIC_PROGRESS_PANEL_CLASS =
  cn(
    HOUSE_SURFACE_STRONG_PANEL_CLASS,
    'house-metric-tile-chart-surface flex flex-1 flex-col gap-2.5 px-2 py-2 transition-[opacity,transform,filter] duration-[var(--motion-duration-chart-toggle)] ease-out',
  )
const HOUSE_LINE_CHART_SURFACE_CLASS =
  cn(HOUSE_SURFACE_STRONG_PANEL_CLASS, 'relative flex-1 px-1.5 pb-1.5 pt-2')
const HOUSE_FIELD_PERCENTILE_TOGGLE_WIDTH_CLASS = 'w-10'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_TRACK_CLASS = cn(
  HOUSE_TOGGLE_TRACK_CLASS,
  'house-field-percentile-toggle-track',
  HOUSE_FIELD_PERCENTILE_TOGGLE_WIDTH_CLASS,
  'relative grid items-stretch',
)
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_SLOT_CLASS = 'pointer-events-none flex h-full items-stretch justify-center'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_CLASS = 'grid w-full min-h-0 items-stretch'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_COLUMNS_CLASS = 'grid-cols-[2.5rem_minmax(0,1fr)]'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_GRID_GAP_CLASS = 'gap-2'
const HOUSE_FIELD_PERCENTILE_LEFT_CHART_PANEL_CLASS = 'h-full min-h-0 min-w-0 w-full'
const HOUSE_FIELD_PERCENTILE_TOGGLE_BUTTON_CLASS = 'house-field-percentile-toggle-button'
const HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH = 14
const TILE_MOTION_ENTRY_DURATION_MS = 1000
const TILE_MOTION_TOGGLE_DURATION_MS = 460
const TILE_MOTION_AXIS_DURATION_MS = 420
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
const FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD: Record<FieldPercentileThreshold, string> = {
  50: 'house-toggle-button-threshold-50',
  75: 'house-toggle-button-threshold-75',
  90: 'house-toggle-button-threshold-90',
  95: 'house-toggle-button-threshold-95',
  99: 'house-toggle-button-threshold-99',
}
const HOUSE_DRILLDOWN_TOOLTIP_CLASS =
  cn(
    HOUSE_DRILLDOWN_CHART_TOOLTIP_CLASS,
    'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out',
  )
const MAX_PUBLICATION_CHART_BARS = 12
const HOUSE_METRIC_TOGGLE_TRACK_CLASS = HOUSE_TOGGLE_TRACK_CLASS

function tileMotionEntryDelay(_index: number, _animateIn: boolean): string {
  return '0ms'
}

function buildTileToggleThumbStyle(activeIndex: number, optionCount: number): CSSProperties {
  const safeCount = Math.max(1, optionCount)
  const safeIndex = Math.max(0, Math.min(activeIndex, safeCount - 1))
  const widthPercent = 100 / safeCount
  const leftPercent = safeIndex * widthPercent
  const finalWidth = `${safeIndex === safeCount - 1 ? 100 - leftPercent : widthPercent}%`
  return {
    width: finalWidth,
    left: `${leftPercent}%`,
    willChange: 'left,width',
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function useUnifiedToggleBarAnimation(animationKey: string, enabled: boolean): boolean {
  const [barsExpanded, setBarsExpanded] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setBarsExpanded(false)
      return
    }
    if (prefersReducedMotion()) {
      setBarsExpanded(true)
      return
    }
    setBarsExpanded(false)
    let raf = 0
    raf = window.requestAnimationFrame(() => {
      setBarsExpanded(true)
    })
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [animationKey, enabled])

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
  return isEntryCycle ? 'var(--motion-duration-chart-refresh)' : 'var(--motion-duration-chart-toggle)'
}

function tileAxisDurationMs(isEntryCycle: boolean): number {
  return isEntryCycle ? TILE_MOTION_ENTRY_DURATION_MS : TILE_MOTION_AXIS_DURATION_MS
}

function useHouseBarSetTransition<T extends { key: string }>({
  bars,
  animationKey,
  enabled,
  collapseMs = 0,
  structureSwap = 'collapse',
  crossfadeMs = TILE_MOTION_TOGGLE_DURATION_MS,
}: {
  bars: T[]
  animationKey: string
  enabled: boolean
  collapseMs?: number
  structureSwap?: 'collapse' | 'crossfade'
  crossfadeMs?: number
}): {
  renderBars: T[]
  outgoingBars: T[]
  isCrossfading: boolean
  pendingBars: T[]
  isSwappingStructure: boolean
  barsExpanded: boolean
} {
  void collapseMs
  void structureSwap
  void crossfadeMs
  const barsExpanded = useUnifiedToggleBarAnimation(
    `${animationKey}|${bars.map((bar) => bar.key).join('|')}`,
    enabled,
  )
  return {
    renderBars: bars,
    outgoingBars: [],
    isCrossfading: false,
    pendingBars: [],
    isSwappingStructure: false,
    barsExpanded,
  }
}

function useEasedValue(target: number, animationKey: string, enabled: boolean, durationMs = TILE_MOTION_AXIS_DURATION_MS): number {
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

function useEasedSeries(target: number[], animationKey: string, enabled: boolean, durationMs = TILE_MOTION_AXIS_DURATION_MS): number[] {
  const [values, setValues] = useState<number[]>(() => (enabled ? target.map(() => 0) : target))
  const valuesRef = useRef(values)

  useEffect(() => {
    valuesRef.current = values
  }, [values])

  useEffect(() => {
    if (!target.length) {
      setValues([])
      valuesRef.current = []
      return
    }
    const to = target.map((value) => (Number.isFinite(value) ? value : 0))
    if (!enabled || prefersReducedMotion()) {
      setValues(to)
      valuesRef.current = to
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
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {chartTitle ? (
        <p className={cn(chartTitleClassName || HOUSE_CHART_AXIS_TITLE_CLASS, 'mb-1')}>
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
                HOUSE_CHART_SCALE_MEAN_LINE_CLASS,
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
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 px-3 py-2.5',
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
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 px-3 py-2.5',
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
  const bars: Array<{ year: number; value: number }> = hasValidSeries
    ? years.map((year, index) => ({
        year,
        value: values[index],
      }))
    : []
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

function PublicationsPerYearChart({
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
  chartTitle,
  chartTitleClassName,
  activeWindowMode,
  onWindowModeChange,
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
  chartTitle?: string
  chartTitleClassName?: string
  activeWindowMode?: PublicationsWindowMode
  onWindowModeChange?: (mode: PublicationsWindowMode) => void
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [windowMode, setWindowMode] = useState<PublicationsWindowMode>('5y')
  const effectiveWindowMode: PublicationsWindowMode = enableWindowToggle
    ? (activeWindowMode ?? windowMode)
    : 'all'
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

  type PublicationChartBar = {
    key: string
    value: number
    current: boolean
    axisLabel: string
    axisSubLabel?: string
  }

  type PublicationYearWindowBars = {
    bars: PublicationChartBar[]
    bucketSize: number
    rangeLabel: string | null
  }

  const compactTileBars = useMemo(() => (
    historyBars
      .slice(-6)
      .map((bar) => ({
        key: `compact-${bar.year}`,
        value: Math.max(0, bar.value),
        current: bar.current,
        axisLabel: String(bar.year).slice(-2),
        axisSubLabel: undefined,
      }))
  ), [historyBars, showCurrentPeriodSemantic])

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
    const annualFallback = Math.max(0, historyBars[historyBars.length - 1]?.value || 0)
    const sourceValuesWindow = sourceValues.length >= 13 && sourceLikelyIncludesCurrentMonth
      ? sourceValues.slice(-13, -1)
      : sourceValues.length >= 12
        ? sourceValues.slice(-12)
        : sourceValues
    const values12 = sourceValuesWindow.length >= 12
      ? sourceValuesWindow.slice(-12)
      : sourceValues.length > 0
        ? [...Array.from({ length: 12 - sourceValuesWindow.length }, () => 0), ...sourceValuesWindow]
        : Array.from({ length: 12 }, () => annualFallback / 12)
    const monthLabels12 = fallbackMonthLabels(12, true)
    const yearShortLabels12 = fallbackMonthYearShortLabels(12, true)
    const bars: PublicationChartBar[] = values12.map((value, index) => ({
      key: `month-${yearShortLabels12[index] || '00'}-${monthLabels12[index] || `M${index + 1}`}-${index}`,
      value: Math.max(0, value),
      current: false,
      axisLabel: monthLabels12[index] || `M${index + 1}`,
      axisSubLabel: yearShortLabels12[index] || undefined,
    }))
    return {
      bars,
      bucketSize: 1,
      rangeLabel: `${monthLabels12[0] || 'Start'} ${yearShortLabels12[0] || ''}-${monthLabels12[monthLabels12.length - 1] || 'End'} ${yearShortLabels12[yearShortLabels12.length - 1] || ''}`.trim(),
    }
  }, [chartData.month_labels_12m, chartData.monthly_values_12m, historyBars])

  const resolveBarsForWindowMode = (mode: PublicationsWindowMode): PublicationYearWindowBars => {
    if (mode === '1y') {
      return {
        bars: groupedMonthBars.bars,
        bucketSize: groupedMonthBars.bucketSize,
        rangeLabel: groupedMonthBars.rangeLabel,
      }
    }
    return groupedYearBarsByWindow[mode]
  }

  const activeWindowBars = isCompactTileMode
    ? { bars: compactTileBars, bucketSize: 1, rangeLabel: null as string | null }
    : resolveBarsForWindowMode(effectiveWindowMode)

  const activeBars = activeWindowBars.bars
  const activeBucketSize = activeWindowBars.bucketSize
  const meanValue = isCompactTileMode && Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : activeBars.reduce((sum, bar) => sum + Math.max(0, bar.value), 0) / Math.max(1, activeBars.length)

  const animationKey = useMemo(
    () => `${effectiveWindowMode}|${activeBucketSize}|${activeBars.map((bar) => `${bar.key}-${bar.value}-${bar.current ? 1 : 0}`).join('|')}`,
    [activeBars, activeBucketSize, effectiveWindowMode],
  )
  const hasBars = hasValidSeries && historyBars.length > 0 && activeBars.length > 0
  const isEntryCycle = useIsFirstChartEntry(animationKey, hasBars)
  const barTransitionDuration = tileChartDurationVar(isEntryCycle)
  const axisDurationMs = tileAxisDurationMs(isEntryCycle)
  const legacyBarsExpanded = useUnifiedToggleBarAnimation(animationKey, hasBars)
  const swapTransition = useHouseBarSetTransition({
    bars: activeBars,
    animationKey,
    enabled: hasBars,
  })
  const renderBars = enableWindowToggle ? swapTransition.renderBars : activeBars
  const pendingBars = enableWindowToggle ? swapTransition.pendingBars : []
  const isStructureSwapActive = enableWindowToggle && swapTransition.isSwappingStructure
  const barsExpanded = enableWindowToggle ? swapTransition.barsExpanded : legacyBarsExpanded
  const renderedValuesTarget = useMemo(
    () => renderBars.map((bar) => Math.max(0, bar.value)),
    [renderBars],
  )
  const allowInitialValueEasing = true
  const renderedValuesAnimated = useEasedSeries(
    renderedValuesTarget,
    `${animationKey}|rendered|${renderBars.map((bar) => bar.key).join('|')}`,
    hasBars && barsExpanded && allowInitialValueEasing,
    axisDurationMs,
  )

  useEffect(() => {
    setHoveredIndex(null)
  }, [animationKey])

  const maxValue = Math.max(
    1,
    ...renderedValuesTarget,
    ...pendingBars.map((bar) => Math.max(0, bar.value)),
  )
  const maxYearlyValue = Math.max(1, ...historyBars.map((bar) => Math.max(0, bar.value)))
  const maxMonthlyValue = Math.max(0, ...groupedMonthBars.bars.map((bar) => Math.max(0, bar.value)))
  const maxWindowValue = Math.max(maxYearlyValue, maxMonthlyValue)
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
  const yAxisTickRatios = targetAxisScale
    ? targetAxisScale.ticks.map((tickValue) => (targetAxisScale.axisMax <= 0 ? 0 : tickValue / targetAxisScale.axisMax))
    : [0, 0.25, 0.5, 0.75, 1]
  const yAxisTickValues = yAxisTickRatios.map((ratio) => ratio * axisMax)
  const stableToggleTickValues = enableWindowToggle ? buildNiceAxis(maxWindowValue).ticks : yAxisTickValues
  const gridTickRatios = yAxisTickRatios.slice(1)
  const resolvedXAxisLabel = usingMonthlyBars ? 'Publication month' : xAxisLabel
  const xAxisLabelLayout = enableWindowToggle
    ? mergeChartAxisLayouts(
      PUBLICATIONS_WINDOW_OPTIONS.map((option) => {
        const optionWindowBars = resolveBarsForWindowMode(option.value)
        const optionBars = optionWindowBars.bars
        const optionUsesMonthlyBars = option.value === '1y'
        return buildChartAxisLayout({
          axisLabels: optionBars.map((bar) => bar.axisLabel),
          axisSubLabels: optionBars.map((bar) => bar.axisSubLabel || null),
          showXAxisName: showAxes,
          xAxisName: showAxes ? (optionUsesMonthlyBars ? 'Publication month' : xAxisLabel) : null,
          dense: optionBars.length >= 7 || optionUsesMonthlyBars,
          maxLabelLines: 2,
          maxSubLabelLines: 2,
          maxAxisNameLines: 2,
        })
      }),
    )
    : buildChartAxisLayout({
      axisLabels: renderBars.map((bar) => bar.axisLabel),
      axisSubLabels: renderBars.map((bar) => bar.axisSubLabel || null),
      showXAxisName: showAxes,
      xAxisName: showAxes ? resolvedXAxisLabel : null,
      dense: renderBars.length >= 7 || usingMonthlyBars,
      maxLabelLines: 2,
      maxSubLabelLines: 2,
      maxAxisNameLines: 2,
    })
  const yAxisPanelWidthRem = showAxes
    ? buildYAxisPanelWidthRem(stableToggleTickValues, Boolean(yAxisLabel))
    : 0
  const chartLeftInset = showAxes ? `${yAxisPanelWidthRem + 0.55}rem` : '0.5rem'

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
  const gridLineToneClass = subtleGrid ? HOUSE_CHART_GRID_LINE_SUBTLE_CLASS : HOUSE_CHART_GRID_LINE_CLASS
  const computeBarHeightPct = (value: number): number => (
    value <= 0 ? 3 : Math.min(100, Math.max(6, (value / axisMax) * 100))
  )
  const resolveBarToneClass = (barValue: number, isCurrentPeriod: boolean): string => {
    const relative = barValue >= meanValue * 1.1 ? 'above' : barValue <= meanValue * 0.9 ? 'below' : 'near'
    if (isCurrentPeriod && showCurrentPeriodSemantic) {
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
  const monthRangeLabel = usingMonthlyBars ? groupedMonthBars.rangeLabel : null
  const yearRangeLabel = usingMonthlyBars ? null : activeWindowBars.rangeLabel
  const periodHintText = monthRangeLabel || yearRangeLabel || '\u00A0'
  const periodHintVisible = Boolean(monthRangeLabel || yearRangeLabel)
  const rightMetaVisible = showPeriodHint
  const rightMetaText = periodHintText
  const rightMetaOpaque = periodHintVisible

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
        <p className={cn(chartTitleClassName || HOUSE_CHART_AXIS_TITLE_CLASS, 'mb-1')}>
          {chartTitle}
        </p>
      ) : null}
      {enableWindowToggle ? (
        <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, rightMetaVisible ? 'justify-between' : 'justify-start')}>
          <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
            <div
              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-4')}
              data-stop-tile-open="true"
              data-ui="publications-window-toggle"
              data-house-role="chart-toggle"
            >
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={buildTileToggleThumbStyle(activeWindowIndex, PUBLICATIONS_WINDOW_OPTIONS.length)}
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
        </div>
      ) : null}
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          HOUSE_CHART_ENTERED_CLASS,
        )}
        style={chartFrameStyle}
        data-ui="publications-chart-frame"
        data-house-role="chart-frame"
      >
        <div className="absolute" style={plotAreaStyle}>
          {gridTickRatios.map((ratio, index) => (
            <div
              key={`pub-grid-${index}`}
              className={cn('pointer-events-none absolute inset-x-0', gridLineToneClass, HOUSE_CHART_SCALE_LAYER_CLASS)}
              style={{ bottom: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
              aria-hidden="true"
            />
          ))}
          {showMeanLine ? (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0',
                HOUSE_CHART_MEAN_LINE_CLASS,
                HOUSE_CHART_SCALE_MEAN_LINE_CLASS,
                isStructureSwapActive && HOUSE_CHART_SCALE_MEAN_LINE_DELAYED_CLASS,
              )}
              style={{ bottom: `${Math.max(0, Math.min(100, (Math.max(0, meanValue) / axisMax) * 100))}%` }}
              aria-hidden="true"
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-1" data-ui="chart-bars" data-house-role="chart-bars">
            {renderBars.map((bar, index) => {
              const animatedValue = Math.max(0, renderedValuesAnimated[index] ?? bar.value)
              const heightPct = computeBarHeightPct(animatedValue)
              const isActive = hoveredIndex === index
              const toneClass = resolveBarToneClass(bar.value, bar.current)
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
                    {formatInt(animatedValue)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded',
                      HOUSE_TOGGLE_CHART_BAR_CLASS,
                      enableWindowToggle && HOUSE_TOGGLE_CHART_SWAP_CLASS,
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: tileMotionEntryDelay(index, barsExpanded && !isStructureSwapActive),
                      transitionDuration: barTransitionDuration,
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

        <div className={cn('pointer-events-none absolute grid grid-flow-col auto-cols-fr items-start gap-1', HOUSE_TOGGLE_CHART_LABEL_CLASS)} style={xAxisTicksStyle}>
          {renderBars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className="text-center leading-none">
              <p className={cn(HOUSE_CHART_AXIS_TEXT_TREND_CLASS, 'break-words px-0.5 leading-[1.05]')}>
                {bar.axisLabel}
              </p>
              {bar.axisSubLabel ? (
                <p className={cn(HOUSE_CHART_AXIS_SUBTEXT_CLASS, 'break-words px-0.5')}>
                  {bar.axisSubLabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {showAxes ? (
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
  const ringVisible = useUnifiedToggleBarAnimation(ringAnimationKey, total > 0)
  const ringVisibleDash = ringVisible ? top3AnimatedDash : 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          HOUSE_CHART_TRANSITION_CLASS,
          'pb-2 pt-2.5',
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
                className={HOUSE_CHART_RING_MAIN_SVG_CLASS}
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{
                  strokeDasharray: `${ringVisibleDash} ${ringCircumference}`,
                  strokeDashoffset: 0,
                  transitionProperty: 'stroke-dasharray,stroke-dashoffset',
                  transitionDuration: 'var(--motion-duration-chart-refresh)',
                  transitionTimingFunction: 'var(--motion-ease-chart-series)',
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
        subLabel: monthlyBreakdown.baselineWindowLabel,
        value: baseline ?? 0,
        recent: false,
      },
      {
        key: 'recent',
        label: 'Recent 3 month average',
        subLabel: monthlyBreakdown.recentWindowLabel,
        value: recent ?? 0,
        recent: true,
      },
    ]
  }, [
    monthlyBreakdown.rate3m,
    monthlyBreakdown.rate9m,
    monthlyBreakdown.baselineWindowLabel,
    monthlyBreakdown.recentWindowLabel,
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
    yearBreakdown?.priorYearsLabel,
    yearBreakdown?.recentYearLabel,
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
          className="absolute inset-x-2 top-4"
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
  const ringTransitionDuration = tileChartDurationVar(isRingEntryCycle)
  const ringTargetOffset = ringCircumference - ringAnimatedDash
  const ringVisibleOffset = ringVisible ? ringTargetOffset : ringCircumference
  const ringShareToneClass = FIELD_PERCENTILE_RING_CLASS_BY_THRESHOLD[threshold] || HOUSE_CHART_RING_MAIN_SVG_CLASS

  if (!hasPercentileData) {
    return <div className={dashboardTileStyles.emptyChart}>No field percentile data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="h-full">
        <div className={HOUSE_CHART_RING_TOGGLE_LAYOUT_CLASS}>
          <div
            className={cn(
              HOUSE_CHART_RING_PANEL_CLASS,
              HOUSE_CHART_RING_TOGGLE_VISUAL_CLASS,
              HOUSE_CHART_TRANSITION_CLASS,
              HOUSE_CHART_RING_ENTERED_CLASS,
            )}
          >
            <div
              className="grid h-full w-full items-stretch"
              style={{
                gridTemplateColumns: 'calc((100% - 2.5rem - 8.47rem) / 3) 2.5rem calc((100% - 2.5rem - 8.47rem) / 3) 8.47rem calc((100% - 2.5rem - 8.47rem) / 3)',
              }}
            >
              <div className="col-start-2 flex h-full items-center justify-center">
                <div className={cn(HOUSE_CHART_RING_TOGGLE_CONTROL_CLASS, '-translate-y-[0.5rem]')}>
                  {toggleControl}
                </div>
              </div>
              <div className="col-start-4 flex h-full min-w-0 items-center justify-center">
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
                    className={ringShareToneClass}
                    strokeWidth={HOUSE_FIELD_PERCENTILE_RING_STROKE_WIDTH}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                    style={{
                      strokeDasharray: ringCircumference,
                      strokeDashoffset: ringVisibleOffset,
                      transitionProperty: 'stroke-dashoffset,stroke',
                      transitionDuration: ringTransitionDuration,
                      transitionTimingFunction: 'var(--motion-ease-chart-series)',
                    }}
                  />
                  <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className={HOUSE_CHART_RING_CENTER_LABEL_CLASS}>
                    {papersAtThresholdLabel}
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>
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
                  'h-full rounded-full transition-[width] duration-[var(--motion-duration-chart-toggle)] ease-out',
                  row.tone,
                )}
                style={{
                  width: `${barsExpanded ? row.value : 0}%`,
                  transitionDelay: tileMotionEntryDelay(index, barsExpanded),
                  transitionDuration: progressTransitionDuration,
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

type PublicationDrilldownSortKey = 'year' | 'title' | 'role' | 'type' | 'venue' | 'citations'
type PublicationTrajectoryMode = 'raw' | 'moving_avg' | 'cumulative'

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

function PublicationCategoryDistributionChart({
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
                  style={buildTileToggleThumbStyle(activeWindowIndex, PUBLICATIONS_WINDOW_OPTIONS.length)}
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
                  style={buildTileToggleThumbStyle(activeValueModeIndex, PUBLICATION_VALUE_MODE_OPTIONS.length)}
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
                  style={buildTileToggleThumbStyle(activeDisplayModeIndex, PUBLICATION_DISPLAY_MODE_OPTIONS.length)}
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
  onOpenPublication,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  onOpenPublication?: (workId: string) => void
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
      const publicationTypeFromData = String(row.work_type || row.publication_type || '').trim()
      const articleTypeFromData = String(row.article_type || row.publication_type || '').trim()
      const typeFromData = publicationTypeFromData || articleTypeFromData
      const publicationType = formatPublicationCategoryLabel(publicationTypeFromData)
      const articleType = formatPublicationCategoryLabel(articleTypeFromData)
      const type = formatPublicationCategoryLabel(typeFromData)
      return {
        workId: String(row.work_id || `row-${index}`),
        year,
        title: String(row.title || 'Untitled').trim() || 'Untitled',
        role: normalizeRoleLabel(String(row.user_author_role || 'Unknown')),
        type,
        publicationType,
        articleType,
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
  const [publicationTrendWindowMode, setPublicationTrendWindowMode] = useState<PublicationsWindowMode>('5y')
  const [hasPublicationTrendToggleInteracted, setHasPublicationTrendToggleInteracted] = useState(false)

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
    setPublicationTrendWindowMode('5y')
    setHasPublicationTrendToggleInteracted(false)
  }, [tile.key])

  const handlePublicationTrendWindowChange = (mode: PublicationsWindowMode) => {
    setHasPublicationTrendToggleInteracted(true)
    setPublicationTrendWindowMode(mode)
  }

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
  const activeYearValues = yearSeriesRaw.filter((count) => count > 0)
  const meanPerActiveYear = activeYearValues.length
    ? Math.round(activeYearValues.reduce((sum, count) => sum + count, 0) / activeYearValues.length)
    : 0
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
  const workspacePanelCompactClass = cn(HOUSE_SURFACE_SOFT_PANEL_CLASS, 'p-2')
  const workspaceHeadingClass = HOUSE_HEADING_H2_CLASS
  const workspaceSubheadingClass = HOUSE_DRILLDOWN_SECTION_LABEL_CLASS

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

  const badgeToneClass = trajectoryPhase === 'Expanding'
    ? HOUSE_DRILLDOWN_BADGE_POSITIVE_CLASS
    : trajectoryPhase === 'Contracting'
      ? HOUSE_DRILLDOWN_BADGE_WARNING_CLASS
      : HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS

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
    const computeRollingMean = (windowSize: number): number => {
      if (!yearSeriesRaw.length) {
        return 0
      }
      const windowEnd = Math.max(0, yearSeriesRaw.length - Math.max(1, windowSize))
      const windowValues = yearSeriesRaw.slice(windowEnd)
      return windowValues.length ? (windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length) : 0
    }
    const formatRollingMean = (value: number): string => formatInt(Math.round(value))
    const rollingMean1y = computeRollingMean(1)
    const rollingMean3y = computeRollingMean(3)
    const rollingMean5y = computeRollingMean(5)
    const rollingMean1yDisplay = formatRollingMean(rollingMean1y)
    const rollingMean3yDisplay = formatRollingMean(rollingMean3y)
    const rollingMean5yDisplay = formatRollingMean(rollingMean5y)
    const summaryStatCardClass = HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_CLASS
    const summaryStatTitleClass = cn(
      HOUSE_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS,
      HOUSE_DRILLDOWN_STAT_TITLE_CLASS,
    )
    const summaryStatValueWrapClass = HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS
    const summaryStatValueClass = cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'tabular-nums whitespace-nowrap leading-none')
    const summaryStatValueEmphasisClass = cn(HOUSE_DRILLDOWN_SUMMARY_STAT_VALUE_EMPHASIS_CLASS, 'tabular-nums whitespace-nowrap leading-none')
    const isRollingMean1Active = hasPublicationTrendToggleInteracted && publicationTrendWindowMode === '1y'
    const isRollingMean3Active = hasPublicationTrendToggleInteracted && publicationTrendWindowMode === '3y'
    const isRollingMean5Active = hasPublicationTrendToggleInteracted && publicationTrendWindowMode === '5y'
    const isOverallMeanActive = hasPublicationTrendToggleInteracted && publicationTrendWindowMode === 'all'
    return (
      <div className="space-y-3">
        <div className={workspaceSectionClass}>
            <p className={cn(workspaceSubheadingClass, HOUSE_DRILLDOWN_SECTION_TITLE_SPACER_CLASS)}>Headline results</p>
          <div className={HOUSE_DRILLDOWN_SUMMARY_STATS_GRID_CLASS}>
            <div className={summaryStatCardClass}>
              <p className={summaryStatTitleClass}>Total publications</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueEmphasisClass}>{headlineValue}</p>
              </div>
            </div>
            <div className={summaryStatCardClass}>
              <p className={summaryStatTitleClass}>Active years</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{formatInt(activeYears)}</p>
              </div>
            </div>
            <div
              className={cn(
                summaryStatCardClass,
                isOverallMeanActive && HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_ACTIVE_CLASS,
              )}
            >
              <p className={summaryStatTitleClass}>Mean per year</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{formatInt(meanPerActiveYear)}</p>
              </div>
            </div>
            <div className={summaryStatCardClass}>
              <p className={summaryStatTitleClass}>Current year to date</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{formatInt(ytdCount)}</p>
              </div>
            </div>
          </div>

          <div className={HOUSE_DRILLDOWN_SUMMARY_STATS_COMPACT_GRID_CLASS}>
            <div
              className={cn(
                summaryStatCardClass,
                'min-h-[4.9rem]',
                isRollingMean1Active && HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_ACTIVE_CLASS,
              )}
            >
              <p className={summaryStatTitleClass}>1-year rolling mean</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{rollingMean1yDisplay}</p>
              </div>
            </div>
            <div
              className={cn(
                summaryStatCardClass,
                'min-h-[4.9rem]',
                isRollingMean3Active && HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_ACTIVE_CLASS,
              )}
            >
              <p className={summaryStatTitleClass}>3-year rolling mean</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{rollingMean3yDisplay}</p>
              </div>
            </div>
            <div
              className={cn(
                summaryStatCardClass,
                'min-h-[4.9rem]',
                isRollingMean5Active && HOUSE_DRILLDOWN_SUMMARY_STAT_CARD_ACTIVE_CLASS,
              )}
            >
              <p className={summaryStatTitleClass}>5-year rolling mean</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{rollingMean5yDisplay}</p>
              </div>
            </div>
            <div
              className={cn(
                summaryStatCardClass,
                'min-h-[4.9rem]',
              )}
            >
              <p className={summaryStatTitleClass}>Career peak</p>
              <div className={summaryStatValueWrapClass}>
                <p className={summaryStatValueClass}>{`${formatInt(peakYearData.count)} (${peakYearData.year})`}</p>
              </div>
            </div>
          </div>

          <div className={HOUSE_DRILLDOWN_SECTION_SEPARATOR_CLASS}>
            <div className={HOUSE_DRILLDOWN_SUMMARY_TREND_CHART_CLASS}>
              <PublicationsPerYearChart
                tile={tile}
                showCaption={false}
                showAxes
                chartTitle="Publications trends over time"
                fullYearLabels
                xAxisLabel="Publication year"
                yAxisLabel="Publications"
                enableWindowToggle
                subtleGrid
                showPeriodHint={false}
                showCurrentPeriodSemantic={false}
                useCompletedMonthWindowLabels
                autoScaleByWindow
                showMeanLine
                activeWindowMode={publicationTrendWindowMode}
                onWindowModeChange={handlePublicationTrendWindowChange}
              />
            </div>
          </div>

          <div className={HOUSE_DRILLDOWN_SECTION_SEPARATOR_CLASS}>
            <p className={cn(workspaceSubheadingClass, HOUSE_DRILLDOWN_SECTION_TITLE_SPACER_CLASS)}>Publication type</p>
            <div className={HOUSE_DRILLDOWN_SUMMARY_TREND_CHART_CLASS}>
              <PublicationCategoryDistributionChart
                publications={publications}
                dimension="publication"
                xAxisLabel="Publication type"
                emptyLabel="No publication type data"
                enableValueModeToggle
              />
            </div>
          </div>

          <div className={HOUSE_DRILLDOWN_SECTION_SEPARATOR_CLASS}>
            <p className={cn(workspaceSubheadingClass, HOUSE_DRILLDOWN_SECTION_TITLE_SPACER_CLASS)}>Article type</p>
            <div className={HOUSE_DRILLDOWN_SUMMARY_TREND_CHART_CLASS}>
              <PublicationCategoryDistributionChart
                publications={publications}
                dimension="article"
                xAxisLabel="Article type"
                emptyLabel="No article type data"
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
                  {[50].map((pct) => (
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
                          'relative flex min-w-[1.95rem] flex-1 items-end rounded border border-transparent transition-all duration-[var(--motion-duration-chart-toggle)]',
                          isSelected && HOUSE_DRILLDOWN_BAR_SELECTED_OUTLINE_CLASS,
                        )}
                        onMouseEnter={() => setHoveredBreakdownYear(year)}
                        onMouseLeave={() => setHoveredBreakdownYear((current) => (current === year ? null : current))}
                        onClick={() => setSelectedYear((current) => (current === year ? null : year))}
                        title={`${year}: ${count} publications`}
                      >
                        <span
                          className={cn(
                            'block w-full rounded transition-[height,filter] duration-[var(--motion-duration-chart-toggle)] ease-out',
                            isSelected ? HOUSE_DRILLDOWN_BAR_SELECTED_CLASS : HOUSE_CHART_BAR_ACCENT_CLASS,
                          )}
                          style={{ height: `${heightPct}%` }}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className={cn('mt-1 flex items-center gap-1', HOUSE_DRILLDOWN_CAPTION_CLASS)}>
                  {breakdownYears.map((year) => (
                    <span key={`breakdown-label-${year}`} className="min-w-[1.95rem] flex-1 text-center font-semibold">{String(year).slice(-2)}</span>
                  ))}
                </div>
              </div>
            </div>
            {hoveredYear !== null ? (
              <div className={cn('mt-2 px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS, HOUSE_DRILLDOWN_NOTE_CLASS)}>
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
                    HOUSE_DRILLDOWN_CHIP_CLASS,
                    isActive
                      ? HOUSE_DRILLDOWN_CHIP_ACTIVE_CLASS
                      : null,
                  )}
                  onClick={() => toggleType(type)}
                >
                  {type}
                </button>
              )
            })}
            {!availableTypes.length ? (
              <span className={HOUSE_DRILLDOWN_HINT_CLASS}>No type data available</span>
            ) : null}
          </div>
        </div>

        <div className={workspaceSectionClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={workspaceHeadingClass}>Venue concentration</p>
            <button
              type="button"
              className={HOUSE_DRILLDOWN_ACTION_CLASS}
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
                    HOUSE_DRILLDOWN_ROW_CLASS,
                    isSelected
                      ? HOUSE_DRILLDOWN_ROW_ACTIVE_CLASS
                      : null,
                  )}
                  onClick={() => setSelectedVenue((current) => (current === row.venue ? null : row.venue))}
                  title={`Median citations ${row.medianCitations.toFixed(1)} | First ${row.roleMix.First} | Senior ${row.roleMix.Senior}`}
                >
                  <div className={cn('flex items-center justify-between gap-2', HOUSE_DRILLDOWN_NOTE_CLASS)}>
                    <span className="block max-w-full break-words pr-2 font-medium leading-snug">{row.venue}</span>
                    <span>{`${formatInt(row.count)} (${row.sharePct.toFixed(0)}%)`}</span>
                  </div>
                  <div className={cn('mt-1', HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS)}>
                    <span className={HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS} style={{ width: `${Math.max(4, Math.min(100, row.sharePct))}%` }} />
                  </div>
                </button>
              )
            })}
            {!visibleVenueRows.length ? <p className={HOUSE_DRILLDOWN_HINT_CLASS}>No venue data</p> : null}
          </div>
        </div>

        <div className={workspaceSectionClass}>
          <div className="flex flex-wrap items-center gap-2">
            <p className={workspaceHeadingClass}>Paper list</p>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, venue, role"
              className={cn('house-input h-9 min-w-[12rem] rounded-md px-3 text-sm outline-none', HOUSE_TEXT_CLASS)}
            />
            <button
              type="button"
              className={cn('inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors', HOUSE_DRILLDOWN_ACTION_CLASS)}
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
          <div className="house-table-shell mt-2 overflow-x-auto rounded-md bg-background">
            <table className="w-full min-w-sz-760 border-collapse">
              <thead className="house-table-head">
                <tr>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('year')}>{`Year ${sortIndicator('year')}`}</button>
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('title')}>{`Title ${sortIndicator('title')}`}</button>
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('role')}>{`Role ${sortIndicator('role')}`}</button>
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('type')}>{`Type ${sortIndicator('type')}`}</button>
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-left align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('venue')}>{`Venue ${sortIndicator('venue')}`}</button>
                  </th>
                  <th className="house-table-head-text h-10 px-3 text-right align-middle font-semibold">
                    <button type="button" onClick={() => handleSort('citations')}>{`Citations ${sortIndicator('citations')}`}</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPublications.slice(0, 120).map((record) => {
                  const canOpenPublication = Boolean(onOpenPublication) && !record.workId.startsWith('row-')
                  return (
                    <tr
                      key={`paper-row-${record.workId}`}
                      className={cn('house-table-row', HOUSE_DRILLDOWN_TABLE_ROW_CLASS, canOpenPublication && 'cursor-pointer')}
                      role={canOpenPublication ? 'button' : undefined}
                      tabIndex={canOpenPublication ? 0 : undefined}
                      onClick={canOpenPublication ? () => onOpenPublication?.(record.workId) : undefined}
                      onKeyDown={canOpenPublication ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenPublication?.(record.workId)
                        }
                      } : undefined}
                      title={canOpenPublication ? 'Open publication in right panel' : undefined}
                    >
                      <td className="house-table-cell-text px-3 py-2">{record.year || 'n/a'}</td>
                      <td className="house-table-cell-text px-3 py-2">
                        <span className={cn('block max-w-[28rem] break-words leading-snug', canOpenPublication && 'underline-offset-2 hover:underline')}>
                          {record.title}
                        </span>
                      </td>
                      <td className="house-table-cell-text px-3 py-2">{record.role}</td>
                      <td className="house-table-cell-text px-3 py-2">{record.type}</td>
                      <td className="house-table-cell-text px-3 py-2">
                        <span className="block max-w-[18rem] break-words leading-snug">{record.venue}</span>
                      </td>
                      <td className="house-table-cell-text px-3 py-2 text-right">{formatInt(record.citations)}</td>
                    </tr>
                  )
                })}
                {!sortedPublications.length ? (
                  <tr>
                    <td className={cn('house-table-cell-text px-3 py-4 text-center', HOUSE_DRILLDOWN_TABLE_EMPTY_CLASS)} colSpan={6}>
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
            <div className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-3')}>
                <span
                  className={HOUSE_TOGGLE_THUMB_CLASS}
                  style={buildTileToggleThumbStyle(activeTrajectoryIndex, trajectoryOptions.length)}
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
                      : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
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
                {[50].map((pct) => (
                  <line
                    key={`trajectory-grid-${pct}`}
                    x1={8}
                    x2={312}
                    y1={8 + ((122 * pct) / 100)}
                    y2={8 + ((122 * pct) / 100)}
                    className={HOUSE_DRILLDOWN_CHART_GRID_SVG_CLASS}
                  />
                ))}
                {trajectoryMode === 'raw' && volatilityAreaPath ? (
                  <path d={volatilityAreaPath} className={HOUSE_DRILLDOWN_CHART_AREA_SVG_CLASS} />
                ) : null}
                {trajectoryMode === 'raw' && movingPath ? (
                  <path d={movingPath} className={HOUSE_DRILLDOWN_CHART_MOVING_SVG_CLASS} />
                ) : null}
                {trajectoryPath ? (
                  <path d={trajectoryPath} className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS} />
                ) : null}
              </svg>
              <div className={cn('mt-1 flex items-center justify-between', HOUSE_DRILLDOWN_AXIS_CLASS)}>
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
                  className={HOUSE_DRILLDOWN_RANGE_CLASS}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Volatility index</p>
                <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{volatilityIndex.toFixed(2)}</p>
              </div>
              <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Growth slope</p>
                <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{growthSlope >= 0 ? '+' : ''}{growthSlope.toFixed(2)}/year</p>
              </div>
              <div className={cn('px-2 py-1.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
                <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Phase marker</p>
                <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{trajectoryPhase}</p>
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
            <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, badgeToneClass)}>
              {contextClassLabel}
            </span>
            <span className={HOUSE_DRILLDOWN_CAPTION_CLASS}>{trajectoryPhase} phase detected</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className={cn('p-2.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
              <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Portfolio structure</p>
              <p className={cn('mt-1', HOUSE_DRILLDOWN_NOTE_CLASS)}>{`Active years ${formatInt(activeYears)}`}</p>
              <p className={HOUSE_DRILLDOWN_NOTE_CLASS}>{`Mean/year ${meanPerActiveYear.toFixed(0)}`}</p>
              <p className={HOUSE_DRILLDOWN_NOTE_CLASS}>{`Unknown year records ${formatInt(unknownYearCount)}`}</p>
            </div>
            <div className={cn('p-2.5', HOUSE_DRILLDOWN_STAT_CARD_CLASS)}>
              <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Distribution profile</p>
              <p className={cn('mt-1', HOUSE_DRILLDOWN_NOTE_CLASS)}>{`Peak year ${peakYearData.year} (${formatInt(peakYearData.count)})`}</p>
              <p className={HOUSE_DRILLDOWN_NOTE_CLASS}>{`Volatility ${volatilityIndex.toFixed(2)}`}</p>
              <p className={HOUSE_DRILLDOWN_NOTE_CLASS}>{`Slope ${growthSlope >= 0 ? '+' : ''}${growthSlope.toFixed(2)} / year`}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
            <button type="button" className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'text-left')}>
              View authorship distribution
            </button>
            <button type="button" className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'text-left')}>
              View collaboration structure
            </button>
            <button type="button" className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'text-left')}>
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
          <div className={cn('space-y-1.5 px-3 py-2.5', HOUSE_DRILLDOWN_DIVIDER_TOP_CLASS, HOUSE_DRILLDOWN_NOTE_CLASS)}>
            <p><span className="font-semibold">Formula:</span> {String(tile.drilldown?.formula || 'Not available')}</p>
            <p><span className="font-semibold">Filters:</span> Publication year when available; author-linked publication records.</p>
            <p><span className="font-semibold">Sources:</span> {(tile.data_source || []).join(', ') || 'Not available'}</p>
            <p><span className="font-semibold">Updated:</span> {String(tile.tooltip_details?.update_frequency || 'Not available')}</p>
            <p><span className="font-semibold">Confidence:</span> {(Number(tile.confidence_score || 0)).toFixed(2)}</p>
            <p className={HOUSE_DRILLDOWN_NOTE_SOFT_CLASS}>{String(tile.drilldown?.confidence_note || '')}</p>
          </div>
        </details>
      </div>
    )
  }

  return (
    <div className={HOUSE_DRILLDOWN_PLACEHOLDER_CLASS}>
      Select a tab to inspect this metric.
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
            className={cn('h-full rounded-full transition-[width] duration-[var(--motion-duration-chart-toggle)] ease-out', HOUSE_CHART_BAR_POSITIVE_CLASS)}
            style={{
              width: `${progressExpanded ? progressMeta.progressPct : 0}%`,
              transitionDuration: progressTransitionDuration,
            }}
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
  return (
    <div className="flex items-center">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(mode === 'needed' ? 1 : 0, 2)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
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
          type="button"
          data-stop-tile-open="true"
          className={cn(
            HOUSE_TOGGLE_BUTTON_CLASS,
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
}: {
  tile: PublicationMetricTilePayload
  chartTitle?: string
  chartTitleClassName?: string
}) {
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
  const path = monotonePathFromPoints(points)
  const pathRef = useRef<SVGPathElement | null>(null)
  const [svgPathLength, setSvgPathLength] = useState(0)
  const lineAnimationKey = useMemo(
    () => values.map((value) => value.toFixed(3)).join('|'),
    [values],
  )
  const isEntryCycle = useIsFirstChartEntry(lineAnimationKey, values.length > 0)
  useEffect(() => {
    const pathElement = pathRef.current
    if (!pathElement) {
      setSvgPathLength(0)
      return
    }
    const measuredLength = pathElement.getTotalLength()
    if (!Number.isFinite(measuredLength) || measuredLength <= 0) {
      setSvgPathLength(1)
      return
    }
    setSvgPathLength(measuredLength)
  }, [path])
  const entryLineVisible = useUnifiedToggleBarAnimation(
    `${lineAnimationKey}|entry|${Math.round(svgPathLength)}`,
    values.length > 0 && isEntryCycle && svgPathLength > 0,
  )
  const lineVisible = isEntryCycle ? entryLineVisible : true
  const lineTransitionDuration = tileChartDurationVar(isEntryCycle)
  const visiblePathLength = svgPathLength > 0 ? svgPathLength : 1

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
              className={HOUSE_DRILLDOWN_CHART_MAIN_SVG_CLASS}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
              style={{
                strokeDasharray: visiblePathLength,
                strokeDashoffset: lineVisible ? 0 : visiblePathLength,
                transitionProperty: 'stroke-dashoffset',
                transitionDuration: lineTransitionDuration,
                transitionTimingFunction: 'var(--motion-ease-chart-series)',
              }}
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
    () => readAccountSettings().publicationInsightsDefaultVisibility !== 'hidden',
  )
  const tileMotionStyle = useMemo(() => ({
    '--motion-duration-chart-refresh': `${TILE_MOTION_ENTRY_DURATION_MS}ms`,
    '--motion-duration-chart-toggle': `${TILE_MOTION_TOGGLE_DURATION_MS}ms`,
  }) as CSSProperties, [])

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
    if (activeTile?.key !== 'this_year_vs_last') {
      return activeTileDefinition
    }
    return activeTileDefinition
      .replace(/counts?\s+authored\s+publications?\s+and\s+groups?[^.]*\.?/i, '')
      .trim()
  }, [activeTileDefinition, activeTile?.key])
  const showActiveTileDefinition = useMemo(
    () => Boolean(sanitizedActiveTileDefinition) && !/fixture\s+drilldown/i.test(sanitizedActiveTileDefinition),
    [sanitizedActiveTileDefinition],
  )

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

  return (
    <>
      <Card className={HOUSE_SURFACE_PANEL_BARE_CLASS} style={tileMotionStyle}>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
            <div className="min-w-0 flex items-center gap-2">
              <p className={HOUSE_HEADING_SECTION_TITLE_CLASS}>Publication insights</p>
              <Button
                type="button"
                data-stop-tile-open="true"
                variant="house"
                size="icon"
                className={cn(
                  'h-8 w-8 house-publications-action-icon house-publications-action-eye',
                  HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS,
                  insightsVisible
                    ? 'house-publications-action-eye-on'
                    : 'house-publications-action-eye-off',
                )}
                onClick={() => setInsightsVisible((current) => !current)}
                aria-pressed={insightsVisible}
                aria-label={insightsVisible ? 'Set publication insights not visible' : 'Set publication insights visible'}
              >
                {insightsVisible ? (
                  <Eye className="house-publications-eye-glyph h-[1.09rem] w-[1.09rem]" strokeWidth={2.3} />
                ) : (
                  <EyeOff className="house-publications-eye-glyph h-[1.09rem] w-[1.09rem]" strokeWidth={2.3} />
                )}
              </Button>
              {metrics?.status === 'FAILED' ? (
                <p className={cn('mt-1', HOUSE_SURFACE_BANNER_CLASS, HOUSE_SURFACE_BANNER_WARNING_CLASS)}>Last update failed</p>
              ) : null}
            </div>
            <div className="ml-auto min-h-8 min-w-[16.5rem]">
              <div
                className={cn(
                  'flex flex-wrap items-center',
                  HOUSE_ACTIONS_PILL_CLASS,
                  HOUSE_ACTIONS_SECTION_TOOLS_CLASS,
                  HOUSE_ACTIONS_SECTION_TOOLS_PUBLICATIONS_CLASS,
                  !insightsVisible && 'invisible pointer-events-none',
                )}
                data-stop-tile-open="true"
                aria-hidden={!insightsVisible}
              >
                <Button
                  type="button"
                  data-stop-tile-open="true"
                  variant="house"
                  size="sm"
                  className={cn('h-8 gap-1.5 px-3', HOUSE_ACTIONS_PILL_PRIMARY_CLASS, HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS)}
                  aria-label="Generate publication insights report"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Generate report</span>
                </Button>
                <div className={HOUSE_ACTIONS_PILL_ICON_GROUP_CLASS}>
                  <Button
                    type="button"
                    data-stop-tile-open="true"
                    variant="house"
                    size="icon"
                    className={cn('h-8 w-8', HOUSE_ACTIONS_PILL_ICON_CLASS, HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS)}
                    aria-label="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    data-stop-tile-open="true"
                    variant="house"
                    size="icon"
                    className={cn('h-8 w-8', HOUSE_ACTIONS_PILL_ICON_CLASS, HOUSE_ACTIONS_SECTION_TOOL_BUTTON_CLASS)}
                    aria-label="Share"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {insightsVisible && loading && tiles.length === 0 ? (
            <div className="publications-insights-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="min-h-36 px-3 py-2.5">
                  <div className={cn('h-full rounded-sm', HOUSE_DRILLDOWN_SKELETON_BLOCK_CLASS)} />
                </div>
              ))}
            </div>
          ) : insightsVisible ? (
            <div className="publications-insights-grid">
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
                          style={buildTileToggleThumbStyle(momentumWindowMode === '5y' ? 1 : 0, 2)}
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
                  const percentileToggleNode = (
                    <div
                      className={HOUSE_FIELD_PERCENTILE_LEFT_CHART_TRACK_CLASS}
                      style={{
                        gridTemplateRows: `repeat(${availableThresholds.length}, minmax(0, 1fr))`,
                        minHeight: `${availableThresholds.length * 1.785}rem`,
                        padding: 0,
                      }}
                      data-stop-tile-open="true"
                    >
                      {availableThresholds.map((threshold) => (
                        <button
                          key={`field-threshold-${threshold}`}
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            HOUSE_TOGGLE_BUTTON_CLASS,
                            HOUSE_FIELD_PERCENTILE_TOGGLE_BUTTON_CLASS,
                            'inline-flex h-full w-full min-h-0 flex-1 items-center justify-center px-0 py-0',
                            activeThreshold === threshold
                              ? FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD[threshold]
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
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
          {activeTile ? (
            <div className={HOUSE_DRILLDOWN_SHEET_BODY_CLASS}>
              <div className={HOUSE_SURFACE_LEFT_BORDER_CLASS}>
                <h3 className={HOUSE_HEADING_TITLE_CLASS}>{activeTile.drilldown.title}</h3>
                {showActiveTileDefinition ? (
                  <p className={cn(HOUSE_TEXT_CLASS, 'mt-1')}>{sanitizedActiveTileDefinition}</p>
                ) : null}
                {detailError ? <p className={cn('mt-2', HOUSE_DRILLDOWN_ALERT_CLASS)}>{detailError}</p> : null}
              </div>
              <Tabs
                value={activeDrilldownTab}
                onValueChange={(value) => setActiveDrilldownTab(value as DrilldownTab)}
                className="w-full"
              >
                <TabsList
                  className={cn(
                    HOUSE_ACTIONS_SECTION_TOOLS_CLASS,
                    HOUSE_ACTIONS_SECTION_TOOLS_PUBLICATIONS_CLASS,
                    HOUSE_DRILLDOWN_TAB_LIST_CLASS,
                  )}
                >
                  {DRILLDOWN_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className={cn('mt-2', HOUSE_DRILLDOWN_DIVIDER_TOP_CLASS)} />
                <div className="mt-2.5">
                  {activeTile.key === 'this_year_vs_last' ? (
                    <TotalPublicationsDrilldownWorkspace
                      tile={activeTile}
                      activeTab={activeDrilldownTab}
                      onOpenPublication={onOpenPublication ? onOpenPublicationFromDrilldown : undefined}
                    />
                  ) : (
                    <div className={HOUSE_DRILLDOWN_PLACEHOLDER_CLASS}>
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











import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Download, Eye, EyeOff, FileText, Filter, Hammer, KeyRound, Mail, Menu, Search, Settings, Share2, ShieldCheck, User } from 'lucide-react'

import { AuthPage } from '@/pages/auth-page'
import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import type { ProfilePublicationsPageFixture } from '@/pages/profile-publications-page'
import { PublicationsPerYearChart } from '@/components/publications/PublicationsTopStrip'
import type { PublicationMetricTilePayload } from '@/types/impact'
import { TopBar } from '@/components/layout/top-bar'
import { AccountNavigator } from '@/components/layout/account-navigator'
import { WorkspaceNavigator } from '@/components/layout/workspace-navigator'
import { ACCOUNT_SETTINGS_STORAGE_KEY } from '@/lib/account-preferences'
import { StandaloneRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'
import { pagesReviewProfilePublicationsDefaultFixture } from '@/stories/pages-review/_helpers/profile-publications-fixture'
import { Badge } from '@/components/ui'

type HeaderScope = 'account' | 'workspace'
type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99
type IconOption = {
  id: string
  label: string
  description: string
  icon: JSX.Element
}

type PublicationAnimationSpecRow = {
  primitive: string
  target: string
  transitionProperties: string
  durationToken: string
  easingToken: string
  usedBy: string
}

type PublicationTileAnimationMappingRow = {
  tileKey: string
  tileLabel: string
  component: string
  entryClasses: string
  toggleClasses: string
  seriesClasses: string
}

function buildTileToggleThumbStyle(activeIndex: number, optionCount: number) {
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

function drilldownTabFlexGrow(label: string) {
  return Math.max(1, Math.round(Math.sqrt(label.length) * 2))
}

const FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD: Record<FieldPercentileThreshold, string> = {
  50: 'house-toggle-button-threshold-50',
  75: 'house-toggle-button-threshold-75',
  90: 'house-toggle-button-threshold-90',
  95: 'house-toggle-button-threshold-95',
  99: 'house-toggle-button-threshold-99',
}

type AnimationLabScale = 'compact' | 'expanded'
type AnimationLabBarDatum = { key: string; label: string; value: number }
type AnimationLabBarDataset = {
  id: string
  label: string
  axisMax: number
  mean: number | null
  bars: AnimationLabBarDatum[]
}

const ANIMATION_LAB_CHART_WIDTH = 300
const ANIMATION_LAB_CHART_HEIGHT = 120
const ANIMATION_LAB_CHART_X_PADDING = 8
const ANIMATION_LAB_CHART_BAR_GAP = 8

const ANIMATION_LAB_ENTRY_BAR_SERIES_BY_SCALE: Record<AnimationLabScale, number[]> = {
  compact: [12, 18, 14, 21, 25, 17],
  expanded: [120, 210, 165, 260, 310, 225],
}

const ANIMATION_LAB_ENTRY_LINE_SERIES_BY_SCALE: Record<AnimationLabScale, number[]> = {
  compact: [18, 22, 28, 26, 31, 37, 34, 42],
  expanded: [160, 240, 380, 345, 410, 520, 485, 630],
}

const ANIMATION_LAB_ENTRY_LINE_LABELS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']
const ANIMATION_LAB_Y_AXIS_TICK_RATIOS = [0, 0.5, 1]
const ANIMATION_LAB_ENTRY_DURATION_MS = 1000
const ANIMATION_LAB_ENTRY_BAR_STAGGER_MS = 70
const ANIMATION_LAB_ENTRY_STAGGER_MAX_MS = 420
const ANIMATION_LAB_ENTRY_SWEEP_DURATION_MS = Math.max(160, ANIMATION_LAB_ENTRY_DURATION_MS - ANIMATION_LAB_ENTRY_STAGGER_MAX_MS)
const ANIMATION_LAB_ENTRY_START_DELAY_MS = 120
const ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS = 460

const ANIMATION_LAB_ENTRY_RING_VALUE_BY_SCALE: Record<AnimationLabScale, number> = {
  compact: 62,
  expanded: 88,
}

const ANIMATION_LAB_RING_CLASS_BY_THRESHOLD: Record<FieldPercentileThreshold, string> = {
  50: 'house-chart-ring-threshold-50-svg',
  75: 'house-chart-ring-threshold-75-svg',
  90: 'house-chart-ring-threshold-90-svg',
  95: 'house-chart-ring-threshold-95-svg',
  99: 'house-chart-ring-threshold-99-svg',
}

const ANIMATION_LAB_FIELD_SHARE_BY_THRESHOLD: Record<FieldPercentileThreshold, { share: number; papers: number }> = {
  50: { share: 76, papers: 51 },
  75: { share: 41, papers: 28 },
  90: { share: 19, papers: 12 },
  95: { share: 13, papers: 8 },
  99: { share: 8, papers: 5 },
}

const ANIMATION_LAB_SAME_COUNT_DATASETS: AnimationLabBarDataset[] = [
  {
    id: 'rolling',
    label: 'Prior 4yr rolling average',
    axisMax: 150,
    mean: 74,
    bars: [
      { key: 's-1', label: 'Y-5', value: 32 },
      { key: 's-2', label: 'Y-4', value: 114 },
      { key: 's-3', label: 'Y-3', value: 46 },
      { key: 's-4', label: 'Y-2', value: 126 },
      { key: 's-5', label: 'Y-1', value: 52 },
    ],
  },
  {
    id: 'latest',
    label: 'Latest 12m citation pace',
    axisMax: 1000,
    mean: 608,
    bars: [
      { key: 's-1', label: 'Y-5', value: 920 },
      { key: 's-2', label: 'Y-4', value: 142 },
      { key: 's-3', label: 'Y-3', value: 868 },
      { key: 's-4', label: 'Y-2', value: 176 },
      { key: 's-5', label: 'Y-1', value: 936 },
    ],
  },
]

const ANIMATION_LAB_DIFFERENT_COUNT_DATASETS: AnimationLabBarDataset[] = [
  {
    id: 'annual-5',
    label: 'Annual view (5 bars)',
    axisMax: 1200,
    mean: 560,
    bars: [
      { key: 'a-1', label: '19', value: 140 },
      { key: 'a-2', label: '20', value: 290 },
      { key: 'a-3', label: '21', value: 520 },
      { key: 'a-4', label: '22', value: 770 },
      { key: 'a-5', label: '23', value: 1080 },
    ],
  },
  {
    id: 'quarterly-8',
    label: 'Quarterly view (8 bars)',
    axisMax: 240,
    mean: 136,
    bars: [
      { key: 'q-1', label: 'Q1', value: 220 },
      { key: 'q-2', label: 'Q2', value: 38 },
      { key: 'q-3', label: 'Q3', value: 208 },
      { key: 'q-4', label: 'Q4', value: 56 },
      { key: 'q-5', label: 'Q5', value: 198 },
      { key: 'q-6', label: 'Q6', value: 82 },
      { key: 'q-7', label: 'Q7', value: 184 },
      { key: 'q-8', label: 'Q8', value: 102 },
    ],
  },
]

const PUBLICATION_ANIMATION_SPEC_ROWS: PublicationAnimationSpecRow[] = [
  {
    primitive: '.house-chart-frame + .house-motion-enter',
    target: 'Chart frame container (bar + line tiles)',
    transitionProperties: 'opacity, transform, filter',
    durationToken: '--motion-duration-slow',
    easingToken: 'ease-out',
    usedBy: 'this_year_vs_last, total_citations, momentum, h_index_projection, influential_citations',
  },
  {
    primitive: '.house-motion-static-enter',
    target: 'Ring frame container',
    transitionProperties: 'none (static enter state)',
    durationToken: 'n/a',
    easingToken: 'n/a',
    usedBy: 'impact_concentration, field_percentile_share',
  },
  {
    primitive: '.house-toggle-chart-bar',
    target: 'Bar glyphs',
    transitionProperties: 'transform, filter, box-shadow',
    durationToken: '--motion-duration-slower',
    easingToken: 'cubic-bezier(0.2,0.68,0.16,1)',
    usedBy: 'this_year_vs_last, total_citations, momentum, h_index_projection',
  },
  {
    primitive: '.house-toggle-chart-swap',
    target: 'Bar-set swap (same-count/different-count windows)',
    transitionProperties: 'opacity (slot mode adds filter)',
    durationToken: '--motion-duration-base / --motion-duration-fast',
    easingToken: 'cubic-bezier(0.2,0.68,0.16,1)',
    usedBy: 'momentum, this_year_vs_last(toggle), h_index_projection(toggle bars)',
  },
  {
    primitive: '.house-toggle-chart-morph',
    target: 'Bar slot reflow (left/width/height morph)',
    transitionProperties: 'left, width, height, opacity, transform, filter, box-shadow',
    durationToken: '--motion-duration-chart-toggle',
    easingToken: '--motion-ease-chart-series',
    usedBy: 'h_index_projection(toggle bars)',
  },
  {
    primitive: '.house-toggle-chart-line',
    target: 'Line path reveal',
    transitionProperties: 'transform, filter, stroke-dashoffset',
    durationToken: '--motion-duration-chart-toggle',
    easingToken: '--motion-ease-chart-series',
    usedBy: 'influential_citations',
  },
  {
    primitive: '.house-chart-ring-dasharray-motion',
    target: 'Ring main arc (dasharray + dashoffset)',
    transitionProperties: 'stroke-dasharray, stroke-dashoffset',
    durationToken: '--motion-duration-chart-refresh',
    easingToken: '--motion-ease-chart-series',
    usedBy: 'impact_concentration',
  },
  {
    primitive: '.house-chart-ring-dashoffset-motion',
    target: 'Ring share arc (dashoffset + stroke)',
    transitionProperties: 'stroke-dashoffset, stroke',
    durationToken: '--chart-transition-duration (fallback --motion-duration-chart-toggle)',
    easingToken: '--motion-ease-chart-series',
    usedBy: 'field_percentile_share',
  },
  {
    primitive: '.house-progress-fill-motion',
    target: 'Progress fill tracks',
    transitionProperties: 'width',
    durationToken: '--chart-transition-duration (fallback --motion-duration-chart-toggle)',
    easingToken: 'ease-out',
    usedBy: 'authorship_composition, h_index_projection(progress inline)',
  },
]

const PUBLICATION_TILE_ANIMATION_MAPPING_ROWS: PublicationTileAnimationMappingRow[] = [
  {
    tileKey: 'this_year_vs_last',
    tileLabel: 'Total publications',
    component: 'PublicationsPerYearChart',
    entryClasses: 'house-chart-frame house-motion-enter',
    toggleClasses: 'none (tile mode)',
    seriesClasses: 'house-toggle-chart-bar',
  },
  {
    tileKey: 'total_citations',
    tileLabel: 'Citations',
    component: 'TotalCitationsModeChart',
    entryClasses: 'house-chart-frame house-motion-enter',
    toggleClasses: 'none',
    seriesClasses: 'house-toggle-chart-bar',
  },
  {
    tileKey: 'momentum',
    tileLabel: 'Momentum',
    component: 'MomentumTilePanel',
    entryClasses: 'house-chart-frame house-motion-enter',
    toggleClasses: 'house-toggle-track house-toggle-thumb house-toggle-button',
    seriesClasses: 'house-toggle-chart-bar house-toggle-chart-swap',
  },
  {
    tileKey: 'h_index_projection',
    tileLabel: 'H-index',
    component: 'HIndexToggleBarsChart (+ HIndexProgressInline)',
    entryClasses: 'house-chart-frame house-chart-series-by-slot house-motion-enter',
    toggleClasses: 'house-toggle-track house-toggle-thumb house-toggle-button',
    seriesClasses: 'house-toggle-chart-bar house-toggle-chart-morph house-toggle-chart-swap (+ house-progress-fill-motion)',
  },
  {
    tileKey: 'impact_concentration',
    tileLabel: 'Impact concentration',
    component: 'ImpactConcentrationPanel',
    entryClasses: 'house-chart-frame house-motion-static-enter',
    toggleClasses: 'none',
    seriesClasses: 'house-chart-ring-dasharray-motion',
  },
  {
    tileKey: 'field_percentile_share',
    tileLabel: 'Field percentile share',
    component: 'FieldPercentilePanel',
    entryClasses: 'house-chart-frame house-motion-static-enter',
    toggleClasses: 'house-toggle-button (vertical threshold rail)',
    seriesClasses: 'house-chart-ring-dashoffset-motion',
  },
  {
    tileKey: 'authorship_composition',
    tileLabel: 'Authorship composition',
    component: 'AuthorshipStructurePanel',
    entryClasses: 'house-metric-progress-panel house-motion-enter',
    toggleClasses: 'none',
    seriesClasses: 'house-progress-fill-motion',
  },
  {
    tileKey: 'collaboration_structure',
    tileLabel: 'Collaboration structure',
    component: 'CollaborationStructurePanel',
    entryClasses: 'house-metric-progress-panel house-motion-enter',
    toggleClasses: 'none',
    seriesClasses: 'eased width update (repeat-rate fill)',
  },
  {
    tileKey: 'influential_citations',
    tileLabel: 'Influential citations',
    component: 'InfluentialTrendPanel',
    entryClasses: 'house-chart-frame house-motion-enter',
    toggleClasses: 'none',
    seriesClasses: 'house-toggle-chart-line',
  },
]

function animationLabSelectDataset(datasets: AnimationLabBarDataset[], datasetId: string): AnimationLabBarDataset {
  return datasets.find((dataset) => dataset.id === datasetId) || datasets[0]
}

function animationLabToBarSlots(args: {
  bars: AnimationLabBarDatum[]
  axisMax: number
  slotCount: number
}): Array<{
  key: string
  label: string
  value: number
  left: number
  width: number
  height: number
}> {
  const slotCount = Math.max(1, args.slotCount)
  const max = Math.max(1, args.axisMax)
  const totalGap = ANIMATION_LAB_CHART_BAR_GAP * Math.max(0, slotCount - 1)
  const available = Math.max(1, ANIMATION_LAB_CHART_WIDTH - (ANIMATION_LAB_CHART_X_PADDING * 2) - totalGap)
  const barWidth = Math.max(10, available / slotCount)
  return Array.from({ length: slotCount }, (_, index) => {
    const bar = args.bars[index]
    const value = Math.max(0, Number(bar?.value || 0))
    const ratio = Math.max(0, Math.min(1, value / max))
    return {
      key: bar?.key || `slot-${index}`,
      label: bar?.label || '',
      value,
      left: ANIMATION_LAB_CHART_X_PADDING + (index * (barWidth + ANIMATION_LAB_CHART_BAR_GAP)),
      width: barWidth,
      height: value <= 0 ? 0 : Math.max(6, ratio * ANIMATION_LAB_CHART_HEIGHT),
    }
  })
}

function animationLabBuildLinePoints(values: number[]): string {
  const points = values.map((value, index) => {
    const safeMax = Math.max(1, ...values)
    const x = ANIMATION_LAB_CHART_X_PADDING
      + ((ANIMATION_LAB_CHART_WIDTH - (ANIMATION_LAB_CHART_X_PADDING * 2)) * (values.length <= 1 ? 0 : index / (values.length - 1)))
    const y = ANIMATION_LAB_CHART_HEIGHT - ((Math.max(0, value) / safeMax) * ANIMATION_LAB_CHART_HEIGHT)
    return `${x},${y}`
  })
  return points.join(' ')
}

function animationLabMeanBottomPercent(mean: number | null, axisMax: number): number | null {
  if (mean === null || !Number.isFinite(mean) || mean <= 0) {
    return null
  }
  const safeAxis = Math.max(1, axisMax)
  return Math.max(0, Math.min(100, (mean / safeAxis) * 100))
}

function animationLabEntryDelay(index: number, isEntering: boolean): string {
  if (!isEntering) {
    return '0ms'
  }
  return `${Math.min(ANIMATION_LAB_ENTRY_STAGGER_MAX_MS, index * ANIMATION_LAB_ENTRY_BAR_STAGGER_MS)}ms`
}

function useAnimationLabEasedValue(target: number, animationKey: string, durationMs = 360): number {
  const [value, setValue] = useState<number>(target)
  const valueRef = useRef<number>(target)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0)
      valueRef.current = 0
      return
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      valueRef.current = target
      return
    }
    const from = Number.isFinite(valueRef.current) ? valueRef.current : target
    const to = target
    if (Math.abs(from - to) < 0.0001) {
      setValue(to)
      valueRef.current = to
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
    return () => window.cancelAnimationFrame(raf)
  }, [animationKey, durationMs, target])

  return value
}

function useAnimationLabEntryVisible(animationKey: string, enabled: boolean): boolean {
  const [visible, setVisible] = useState<boolean>(() => !enabled)

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      return
    }
    setVisible(false)
    if (ANIMATION_LAB_ENTRY_START_DELAY_MS > 0) {
      const timer = window.setTimeout(() => setVisible(true), ANIMATION_LAB_ENTRY_START_DELAY_MS)
      return () => window.clearTimeout(timer)
    }
    let frame = 0
    frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [animationKey, enabled])

  return visible
}

function useAnimationLabEntryPhase(
  animationKey: string,
  enabled: boolean,
  activeMs = ANIMATION_LAB_ENTRY_DURATION_MS,
): boolean {
  const [isEntering, setIsEntering] = useState<boolean>(enabled)

  useEffect(() => {
    if (!enabled) {
      setIsEntering(false)
      return
    }
    setIsEntering(true)
    const timer = window.setTimeout(() => setIsEntering(false), ANIMATION_LAB_ENTRY_START_DELAY_MS + activeMs)
    return () => window.clearTimeout(timer)
  }, [activeMs, animationKey, enabled])

  return isEntering
}

function ApprovedHorizontalToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const twoOptionMode = options.length === 2
  return (
    <div className="house-approved-toggle-context inline-flex items-center">
      <div
        className={twoOptionMode ? 'house-toggle-track grid-cols-2' : 'house-toggle-track'}
        style={twoOptionMode ? undefined : { gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))` }}
      >
        <span
          className="house-toggle-thumb"
          style={buildTileToggleThumbStyle(activeIndex, options.length)}
          aria-hidden="true"
        />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AnimationLabEntryToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="inline-flex items-center">
      <ApprovedHorizontalToggle
        value={enabled ? 'entry' : 'static'}
        options={[
          { value: 'entry', label: 'Entry' },
          { value: 'static', label: 'Static' },
        ]}
        onChange={(next) => onChange(next === 'entry')}
      />
    </div>
  )
}

function useHouseClassTooltips(scopeRef: { current: HTMLElement | null }, dependencies: unknown[] = []) {
  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) {
      return
    }

    const tooltipTargets = Array.from(scope.querySelectorAll<HTMLElement>('[class*="house-"]'))
    tooltipTargets.forEach((element) => {
      const classTokens = Array.from(element.classList).filter((token) => token.startsWith('house-'))
      if (!classTokens.length) {
        return
      }
      const dividerToken = classTokens.includes('house-drilldown-divider-top')
      const blockTooltip = dividerToken
        ? `Separator class: ${classTokens.join(' + ')}`
        : `CSS blocks: ${classTokens.join(' + ')}`
      const existing = element.getAttribute('title')
      element.title = existing ? `${existing} · ${blockTooltip}` : blockTooltip
    })
  }, [scopeRef, ...dependencies])
}

function ApprovedDrilldownMarkerStyles() {
  return (
    <style>{`
      .approved-drilldown-marker-map .house-drilldown-title-block,
      .approved-drilldown-marker-map .house-drilldown-heading-block,
      .approved-drilldown-marker-map .house-drilldown-subheading-block,
      .approved-drilldown-marker-map .house-drilldown-content-block,
      .approved-drilldown-marker-map .house-drilldown-summary-stat-card,
      .approved-drilldown-marker-map .house-drilldown-stat-card,
      .approved-drilldown-marker-map .house-drilldown-navigation-block {
        position: relative;
      }

      .approved-drilldown-marker-map .house-drilldown-title-block::before,
      .approved-drilldown-marker-map .house-drilldown-title-block::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #0ea5e9;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-title-block::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-title-block::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-heading-block::before,
      .approved-drilldown-marker-map .house-drilldown-heading-block::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #8b5cf6;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-heading-block::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-heading-block::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-subheading-block::before,
      .approved-drilldown-marker-map .house-drilldown-subheading-block::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #06b6d4;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-subheading-block::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-subheading-block::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-content-block::before,
      .approved-drilldown-marker-map .house-drilldown-content-block::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #6b7280;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-content-block::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-content-block::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-summary-stat-card::before,
      .approved-drilldown-marker-map .house-drilldown-summary-stat-card::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #f59e0b;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-summary-stat-card::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-summary-stat-card::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-stat-card::before,
      .approved-drilldown-marker-map .house-drilldown-stat-card::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #ec4899;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-stat-card::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-stat-card::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-navigation-block::before,
      .approved-drilldown-marker-map .house-drilldown-navigation-block::after {
        content: '';
        position: absolute;
        width: 7px;
        height: 7px;
        border-radius: 9999px;
        background: #22c55e;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-navigation-block::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-navigation-block::after {
        right: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-divider-top {
        position: relative;
        border-top: 1px dashed #f97316;
        margin-top: 0.22rem;
        margin-bottom: 0.22rem;
      }

      .approved-drilldown-marker-map .house-drilldown-divider-top::before,
      .approved-drilldown-marker-map .house-drilldown-divider-top::after {
        content: '';
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: #ef4444;
        top: -4px;
        pointer-events: none;
      }

      .approved-drilldown-marker-map .house-drilldown-divider-top::before {
        left: -4px;
      }

      .approved-drilldown-marker-map .house-drilldown-divider-top::after {
        right: -4px;
      }
    `}</style>
  )
}

const meta: Meta = {
  title: 'Design System/APPROVED/Approved',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
    docs: {
      description: {
        component:
          'Approved production patterns used across auth and global nav. This page shows the canonical header, auth page, and approved icon set.',
      },
    },
  },
}

export default meta

type Story = StoryObj

function ApprovedHeaderBar() {
  const activeScope: HeaderScope = 'workspace'
  const initialPath = '/workspaces'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Header Bar (canonical)</p>
          <p className="text-xs text-neutral-600">Workspace scope with approved nav interaction and click-through behavior.</p>
        </div>

        <div className="approved-header-no-motion bg-card">
          <MemoryRouter initialEntries={[initialPath]}>
            <TopBar key={initialPath} scope={activeScope} onOpenLeftNav={() => undefined} showLeftNavButton />
          </MemoryRouter>
        </div>
      </div>

      <style>{`
        .approved-header-no-motion .house-top-nav-item,
        .approved-header-no-motion .house-top-nav-item::before,
        .approved-header-no-motion .house-top-nav-item-active,
        .approved-header-no-motion .house-top-nav-item-active::before,
        .approved-header-no-motion .house-top-utility-button {
          transition: none !important;
        }

        .approved-header-no-motion .house-top-nav-item:hover {
          transform: none !important;
        }
      `}</style>
    </section>
  )
}

function AuthPagePanel() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Auth Page</p>
          <p className="text-xs text-neutral-600">Canonical auth page composition (token-first implementation).</p>
        </div>
        <MemoryRouter initialEntries={["/auth"]}>
          <AuthPage />
        </MemoryRouter>
      </div>
    </section>
  )
}

const APPROVED_DRILLDOWN_TILE_KEY = 'this_year_vs_last'
const APPROVED_PUBLICATION_TRENDS_TEMPLATE_TILE: PublicationMetricTilePayload = {
  id: 'approved-this-year-vs-last-template',
  key: 'this_year_vs_last',
  label: 'Total publications',
  main_value: 120,
  value: 120,
  main_value_display: '120',
  value_display: '120',
  delta_value: 18.4,
  delta_display: '+18.4% YoY',
  delta_direction: 'up',
  delta_tone: 'positive',
  delta_color_code: 'hsl(var(--tone-positive-700))',
  unit: null,
  subtext: 'Publication count trend',
  badge: {},
  chart_type: 'bars',
  chart_data: {
    years: [2021, 2022, 2023, 2024, 2025, 2026],
    values: [10, 41, 7, 32, 8, 22],
    projected_year: 2026,
    current_year_ytd: 22,
    mean_value: 20,
    monthly_values_12m: [1, 2, 1, 2, 2, 1, 3, 2, 2, 2, 3, 1],
    month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
  },
  sparkline: [10, 41, 7, 32, 8, 22],
  sparkline_overlay: [],
  tooltip: 'Approved publication trend chart template.',
  tooltip_details: {
    surface: 'approved_drilldown_chart_template',
  },
  data_source: ['Approved fixture'],
  confidence_score: 1,
  stability: 'stable',
  drilldown: {
    title: 'Total publication insights',
    definition: 'Count of publication records by publication year.',
    formula: 'sum(publications by year)',
    confidence_note: 'Approved story template fixture for chart contract.',
    tile_id: 't1_total_publications',
    as_of_date: '2026-02-24',
    publications: [],
    metadata: {},
  },
}

function ApprovedPublicationTrendsChartTemplate() {
  const [windowMode, setWindowMode] = useState<'1y' | '3y' | '5y' | 'all'>('all')
  return (
    <div className="w-[535px] max-w-full">
      <div className="house-drilldown-heading-block">
        <p className="house-drilldown-heading-block-title">Publication trends</p>
      </div>
      <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
        <PublicationsPerYearChart
          tile={APPROVED_PUBLICATION_TRENDS_TEMPLATE_TILE}
          showAxes
          enableWindowToggle
          showPeriodHint={false}
          showCurrentPeriodSemantic
          autoScaleByWindow
          showMeanLine
          showMeanValueLabel
          showVisualModeToggle
          activeWindowMode={windowMode}
          onWindowModeChange={setWindowMode}
          chartTitle={undefined}
        />
      </div>
    </div>
  )
}

function ensurePublicationInsightsVisibleDefault() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SETTINGS_STORAGE_KEY)
    let parsed: Record<string, unknown> = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        parsed = {}
      }
    }
    if (parsed.publicationInsightsDefaultVisibility !== 'visible') {
      window.localStorage.setItem(
        ACCOUNT_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          publicationInsightsDefaultVisibility: 'visible',
        }),
      )
    }
  } catch {
    // Ignore storage errors in restricted iframe/browser contexts.
  }
}

function openApprovedDrilldownTile(tileKey: string) {
  if (typeof document === 'undefined') {
    return false
  }
  const selector = `.publications-insights-grid [data-metric-key="${tileKey}"]`
  const target = document.querySelector(selector)
  if (target instanceof HTMLElement) {
    target.click()
    return true
  }
  return false
}

function ApprovedDrilldownApprovedChartSection() {
  ensurePublicationInsightsVisibleDefault()

  const fixture = useMemo<ProfilePublicationsPageFixture>(() => {
    const next = JSON.parse(JSON.stringify(pagesReviewProfilePublicationsDefaultFixture)) as ProfilePublicationsPageFixture
    next.token = ''
    return next
  }, [])

  useEffect(() => {
    let retryTimer: number | null = null
    const firstFrame = window.requestAnimationFrame(() => {
      if (openApprovedDrilldownTile(APPROVED_DRILLDOWN_TILE_KEY)) {
        return
      }
      retryTimer = window.setTimeout(() => {
        openApprovedDrilldownTile(APPROVED_DRILLDOWN_TILE_KEY)
      }, 160)
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [])

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Drilldown Charts</p>
          <p className="text-xs text-neutral-600">Gold-standard publication drilldown chart template and live shell behavior.</p>
        </div>
        <div className="bg-card p-4">
          <div className="mb-3 rounded-md border border-border bg-background p-3">
            <p className="text-xs font-semibold text-neutral-900">Source-of-truth template: Publication trends</p>
            <p className="mt-1 text-xs text-neutral-600">Use this chart block as the canonical approved reference for drilldown trends.</p>
            <p className="mt-1 text-xs text-neutral-600">Definitions: <strong>Active years</strong> = years since first publication; <strong>Last 1/3/5 years</strong> are rolling windows from the current as-of year.</p>
            <p className="mt-1 text-xs text-neutral-600">Controls: right-side chart-view icons switch between <strong>bar</strong> and <strong>line</strong> presentations.</p>
            <div className="mt-2">
              <ApprovedPublicationTrendsChartTemplate />
            </div>
          </div>
          <div className="mb-3 flex items-center justify-end">
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
              onClick={() => {
                openApprovedDrilldownTile(APPROVED_DRILLDOWN_TILE_KEY)
              }}
            >
              Open drilldown
            </button>
          </div>
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <StandaloneRouteShell
              initialEntry="/profile/publications"
              path="/profile/publications"
              element={<ProfilePublicationsPage fixture={fixture} />}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function ApprovedLeftPanel() {
  const workspaceId = 'workspace-1'
  const workspacePath = `/w/${workspaceId}/overview`
  const inboxPath = `/w/${workspaceId}/inbox`
  const profilePath = '/profile'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Left Panels (mirrored canonical)</p>
          <p className="text-xs text-neutral-600">Workspace home and Profile left panels aligned for shared sizing and state behavior.</p>
        </div>
        <div className="bg-card p-4 overflow-x-auto">
          <div className="grid gap-4 pb-2" style={{ gridTemplateColumns: 'repeat(3, minmax(300px, max-content))' }}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Workspace home</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-visible rounded-md border border-border" style={{ position: 'relative' }}>
                <MemoryRouter initialEntries={[workspacePath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Inbox</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-visible rounded-md border border-border" style={{ position: 'relative' }}>
                <MemoryRouter initialEntries={[inboxPath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Profile</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-visible rounded-md border border-border" style={{ position: 'relative' }}>

                <MemoryRouter initialEntries={[profilePath]}>
                  <AccountNavigator />
                </MemoryRouter>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .approved-left-panel-canvas {
          height: 36rem;
          background-color: hsl(var(--card));
          position: relative;
        }

        .approved-left-panel-canvas .house-nav-section-label {
          position: relative;
        }

        .approved-left-panel-canvas .house-nav-section-label::after {
          content: '.house-nav-section-label';
          position: absolute;
          left: 100%;
          top: 0;
          margin-left: 8px;
          font-size: 0.65rem;
          color: hsl(var(--tone-neutral-500));
          white-space: nowrap;
          font-weight: normal;
          font-family: monospace;
          pointer-events: none;
        }

        .approved-left-panel-canvas .house-nav-item-label {
          position: relative;
        }

        .approved-left-panel-canvas .house-nav-item-label::after {
          content: '.house-nav-item-label';
          position: absolute;
          left: 100%;
          top: 0;
          margin-left: 8px;
          font-size: 0.65rem;
          color: hsl(var(--tone-neutral-500));
          white-space: nowrap;
          font-weight: normal;
          font-family: monospace;
          pointer-events: none;
        }
      `}</style>
    </section>
  )
}

function ApprovedPublicationsDrilldownSection() {
  type PublicationTileTab = 'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'
  const drilldownScopeRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<PublicationTileTab>('summary')
  const [windowMode, setWindowMode] = useState<'1y' | '3y' | '5y' | 'all'>('all')
  useHouseClassTooltips(drilldownScopeRef, [activeTab])

  const headlineResultTiles: Array<{ id: string; label: string; value: string }> = [
    { id: 'total-publications', label: 'Total publications', value: '120' },
    { id: 'active-years', label: 'Active years', value: '6' },
    { id: 'mean-per-year', label: 'Mean yearly publications', value: '22' },
    { id: 'highest-yield', label: 'Highest yield', value: '41 (2022)' },
  ]

  const drilldownTabs: Array<{ id: PublicationTileTab; label: string }> = [
    { id: 'summary', label: 'Summary' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'trajectory', label: 'Trajectory' },
    { id: 'context', label: 'Context' },
    { id: 'methods', label: 'Methods' },
  ]

  const subsectionTitleByTab: Partial<Record<PublicationTileTab, string>> = {
    breakdown: 'Publication count by year',
    trajectory: 'Year-over-year trajectory',
    context: 'Top publication venues',
    methods: 'Method details',
  }

  return (
    <section>
      <ApprovedDrilldownMarkerStyles />
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Publications Tile Drilldown</p>
          <p className="text-xs text-neutral-600">Canonical publications metric drilldown panel showing summary stats and typography with horizontal tab navigation.</p>
        </div>
        <div className="bg-card p-4">
          <div
            ref={drilldownScopeRef}
            className="mx-auto w-full rounded-md border border-border bg-background overflow-hidden approved-drilldown-marker-map house-drilldown-sheet"
          >
            <div className="house-drilldown-sheet-body house-drilldown-panel-no-pad">
              <div className="house-drilldown-title-block house-left-border house-left-border-publications">
                <p className="house-drilldown-title">Total publication insights</p>
                <p className="house-drilldown-title-expander">Your publication records</p>
              </div>
              <div className="house-drilldown-divider-top" />

              <div className="house-drilldown-navigation-block house-drilldown-tabs rounded-sm bg-card" role="tablist" aria-label="Publication tile drilldown sections">
                {drilldownTabs.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`publication-drilldown-panel-${tab.id}`}
                    id={`publication-drilldown-tab-${tab.id}`}
                    style={{
                      flexGrow: drilldownTabFlexGrow(tab.label),
                      flexBasis: 0,
                    }}
                    className={`house-nav-item approved-drilldown-nav-item house-drilldown-tab-item ${activeTab === tab.id ? 'approved-drilldown-nav-item-active' : ''}`}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="house-nav-item-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div
                className="house-drilldown-content-block house-drilldown-tab-panel"
                id={`publication-drilldown-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`publication-drilldown-tab-${activeTab}`}
              >
                {activeTab === 'summary' ? (
                  <div className="house-drilldown-stack-3" data-metric-key={APPROVED_DRILLDOWN_TILE_KEY}>
                    <div className="house-section-panel house-drilldown-panel-no-pad">
                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Headline results</p>
                      </div>
                      <div className="house-drilldown-content-block house-publications-headline-content w-full">
                        <div
                          className="house-drilldown-summary-stats-grid house-publications-headline-metric-grid mt-0"
                          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
                        >
                          {headlineResultTiles.map((tile) => (
                            <div key={tile.id} className="house-drilldown-summary-stat-card">
                              <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">{tile.label}</p>
                              <div className="house-drilldown-summary-stat-value-wrap">
                                <p className="house-drilldown-summary-stat-value tabular-nums">{tile.value}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Publication trends</p>
                      </div>
                      <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                        <PublicationsPerYearChart
                          tile={APPROVED_PUBLICATION_TRENDS_TEMPLATE_TILE}
                          showAxes
                          enableWindowToggle
                          showPeriodHint={false}
                          showCurrentPeriodSemantic
                          useCompletedMonthWindowLabels
                          autoScaleByWindow
                          showMeanLine
                          showMeanValueLabel
                          showVisualModeToggle
                          activeWindowMode={windowMode}
                          onWindowModeChange={setWindowMode}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeTab !== 'summary' ? (
                  <div className="house-drilldown-stack-3" data-metric-key={APPROVED_DRILLDOWN_TILE_KEY}>
                    <div className="house-section-panel house-drilldown-panel-no-pad">
                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Headline results</p>
                      </div>
                      <div className="house-drilldown-content-block w-full" />
                      <div className="house-drilldown-heading-block-secondary">
                        <p className="house-drilldown-overline">{subsectionTitleByTab[activeTab]}</p>
                      </div>
                      <div className="house-drilldown-content-block w-full" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
function ApprovedPublicationLibraryDrilldownSection() {
  type PublicationLibraryTab = 'overview' | 'content' | 'impact' | 'files' | 'ai'
  const libraryDrilldownScopeRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<PublicationLibraryTab>('overview')
  useHouseClassTooltips(libraryDrilldownScopeRef, [activeTab])

  const libraryTabs: Array<{ id: PublicationLibraryTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Content' },
    { id: 'impact', label: 'Impact' },
    { id: 'files', label: 'Files' },
    { id: 'ai', label: 'AI insights' },
  ]

  return (
    <section>
      <ApprovedDrilldownMarkerStyles />
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Publication Library Drilldown</p>
          <p className="text-xs text-neutral-600">Canonical publication library drilldown layout with all tab blocks rendered for end-to-end visual parity.</p>
        </div>
        <div className="bg-card p-4">
          <div
            ref={libraryDrilldownScopeRef}
            className="mx-auto w-full rounded-md border border-border bg-background overflow-hidden approved-drilldown-marker-map house-drilldown-sheet"
          >
            <div className="house-drilldown-sheet-body house-drilldown-panel-no-pad">
              <div className="house-drilldown-title-block house-left-border house-left-border-profile">
                <p className="house-drilldown-title">Advances in cardiovascular biomarker discovery from longitudinal cohort imaging</p>
                <p className="house-drilldown-title-expander">Nature Medicine | 2026</p>
              </div>
              <div className="house-drilldown-divider-top" />
              <div className="house-drilldown-navigation-block house-drilldown-tabs rounded-sm bg-card" role="tablist" aria-label="Publication drilldown sections">
                {libraryTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`publication-library-drilldown-panel-${tab.id}`}
                    id={`publication-library-drilldown-tab-${tab.id}`}
                    style={{
                      flexGrow: drilldownTabFlexGrow(tab.label),
                      flexBasis: 0,
                    }}
                    className={`house-nav-item approved-drilldown-nav-item house-drilldown-tab-item ${activeTab === tab.id ? 'approved-drilldown-nav-item-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="house-nav-item-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div
                className="house-drilldown-content-block house-drilldown-tab-panel"
                id={`publication-library-drilldown-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`publication-library-drilldown-tab-${activeTab}`}
              >
                {activeTab === 'overview' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Publication overview</p>
                    </div>
                    <div className="house-drilldown-content-block house-drilldown-summary-stats-grid">
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">Year</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <p className="house-drilldown-summary-stat-value">2026</p>
                        </div>
                      </div>
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">Journal</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <p className="house-drilldown-summary-stat-value">Nature Medicine</p>
                        </div>
                      </div>
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">Type</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <p className="house-drilldown-summary-stat-value">Research Article</p>
                        </div>
                      </div>
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">Citations</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <p className="house-drilldown-summary-stat-value">182</p>
                        </div>
                      </div>
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">PMID</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <a className="house-drilldown-link house-drilldown-summary-stat-value" href="https://pubmed.ncbi.nlm.nih.gov/3421001/" target="_blank" rel="noreferrer">
                            3421001
                          </a>
                        </div>
                      </div>
                      <div className="house-drilldown-summary-stat-card">
                        <p className="house-drilldown-summary-stat-title">DOI</p>
                        <div className="house-drilldown-summary-stat-value-wrap">
                          <a className="house-drilldown-link house-drilldown-summary-stat-value break-all" href="https://doi.org/10.1038/sXXXX-026-0001-2" target="_blank" rel="noreferrer">
                            10.1038/sXXXX-026-0001-2
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Authors</p>
                      </div>
                      <div className="house-drilldown-content-block">
                        <p className="leading-relaxed house-drilldown-note">
                          A. Smith, B. Jones, C. Patel, D. Chen, <span className="house-drilldown-owner">Your name (you)</span>
                        </p>
                      </div>
                      <div className="house-drilldown-divider-top" />
                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Actions</p>
                      </div>
                      <div className="house-drilldown-content-block">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="house-drilldown-action">Open DOI</button>
                          <button type="button" className="house-drilldown-action">Open PubMed</button>
                          <button type="button" className="house-drilldown-action">Copy citation</button>
                          <button type="button" className="house-drilldown-action">Add to manuscript</button>
                        </div>
                      </div>
                      <div className="house-drilldown-divider-top" />
                      <div className="house-drilldown-heading-block">
                        <p className="house-drilldown-heading-block-title">Record timeline</p>
                      </div>
                      <div className="house-drilldown-content-block">
                        <div className="house-drilldown-stat-card">
                          <p className="house-drilldown-note">Added: 12 Mar 2026</p>
                          <p className="house-drilldown-note">Updated: 14 Mar 2026</p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeTab === 'content' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Content</p>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Display mode</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="flex items-center gap-2">
                        <button type="button" className="house-drilldown-action">Plain</button>
                        <button type="button" className="house-drilldown-action">Highlighted</button>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Abstract</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card">
                        <p className="house-drilldown-note-soft">Abstract preview content appears here. Example: this publication explores novel methods in cardiovascular biomarker discovery across large cohorts using advanced imaging and longitudinal follow-up.</p>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Keywords</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="flex flex-wrap gap-1">
                        {['Imaging', 'Cardiology', 'Biomarker', 'Cohort'].map((keyword) => (
                          <span key={keyword} className="house-drilldown-chip">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {activeTab === 'impact' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Impact</p>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Citation snapshot</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-summary-stats-grid">
                        <div className="house-drilldown-stat-card">
                          <p className="house-drilldown-overline">Total citations</p>
                          <p className="house-drilldown-stat-value">182</p>
                        </div>
                        <div className="house-drilldown-stat-card">
                          <p className="house-drilldown-overline">Citations (12m)</p>
                          <p className="house-drilldown-stat-value">48</p>
                        </div>
                        <div className="house-drilldown-stat-card">
                          <p className="house-drilldown-overline">YoY %</p>
                          <p className="house-drilldown-stat-value">+18%</p>
                        </div>
                        <div className="house-drilldown-stat-card">
                          <p className="house-drilldown-overline">Acceleration</p>
                          <p className="house-drilldown-stat-value">+2 / month</p>
                        </div>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Key citing papers</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card">
                        <p className="house-drilldown-note-soft">2025 | Follow-up trial demonstrates translation into multicenter practice.</p>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeTab === 'files' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Files</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="space-y-3">
                        <div className="house-drilldown-stat-card space-y-2">
                          <p className="house-drilldown-stat-title">OA Manuscript Download</p>
                          <p className="house-drilldown-note break-all">biomarker-cohort-imaging-manuscript.pdf</p>
                          <p className="house-drilldown-caption">PDF | OA link | 14 Mar 2026</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-standard">Open</button>
                            <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-negative ml-auto">Delete</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Add files</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-file-drop">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="house-drilldown-stat-title">Add files</p>
                            <p className="house-drilldown-note-soft">Drag and drop files here, or use upload.</p>
                          </div>
                          <div className="flex items-start">
                            <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-major">Upload file</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeTab === 'ai' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">AI insights</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <p className="house-banner house-banner-info text-micro">AI-generated draft insights. Verify against full text.</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <p className="house-drilldown-note-soft">Generating impact insights...</p>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Performance summary</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card">
                        <p className="house-drilldown-note">Topical relevance increased in the last 12 months.</p>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Trajectory</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card">
                        <p className="house-drilldown-stat-value">Growth sustaining</p>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Reuse suggestions</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card space-y-1">
                        <p className="house-drilldown-note">- Add to translational methods section.</p>
                        <p className="house-drilldown-note">- Reference in biomarker validation summary.</p>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Caution flags</p>
                    </div>
                    <div className="house-drilldown-content-block">
                      <div className="house-drilldown-stat-card space-y-1">
                        <p className="house-drilldown-note-soft">No caution flags.</p>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ApprovedButtonsSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Buttons</p>
          <p className="text-xs text-neutral-600">Canonical publication button variants: Standard, Negative, and Major.</p>
        </div>
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-600">Standard button</p>
              <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-standard">Open</button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-600">Negative button</p>
              <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-negative">Delete</button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-600">Major button</p>
              <button type="button" className="house-drilldown-action approved-profile-hover-action approved-button-major">Upload file</button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .approved-profile-hover-action {
          border-color: hsl(0 0% 0%);
        }

        .approved-profile-hover-action:hover,
        .approved-profile-hover-action:focus-visible {
          border-color: hsl(0 0% 0%);
        }

        .approved-button-standard {
          background-color: transparent;
          color: hsl(var(--tone-neutral-700));
        }

        .approved-button-standard:hover,
        .approved-button-standard:focus-visible {
          background-color: var(--top-nav-hover-bg-profile);
          color: hsl(var(--tone-neutral-700));
        }

        .approved-button-negative {
          background-color: transparent;
          color: hsl(var(--tone-danger-700));
        }

        .approved-button-negative:hover,
        .approved-button-negative:focus-visible {
          background-color: hsl(var(--tone-danger-100));
          color: hsl(var(--tone-danger-700));
        }

        .approved-button-major {
          background-color: hsl(var(--section-style-profile-accent) / 0.92);
          color: hsl(var(--tone-neutral-50));
        }

        .approved-button-major:hover,
        .approved-button-major:focus-visible {
          background-color: hsl(var(--section-style-profile-accent));
          color: hsl(var(--tone-neutral-50));
        }
      `}</style>
    </section>
  )
}

function ApprovedUserBadgesSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved User Badges</p>
          <p className="text-xs text-neutral-600">Canonical Administrator, Member, and Guest variants for account surfaces.</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="userAdmin" className="gap-1 leading-none">
              <ShieldCheck className="h-3.5 w-3.5" />
              Administrator
            </Badge>
            <Badge variant="userMember" className="leading-none">Member</Badge>
            <Badge variant="userGuest" className="leading-none">Guest</Badge>
          </div>
          <p className="text-xs text-neutral-600">Use beside profile headings and inline account context.</p>
        </div>
      </div>
    </section>
  )
}

function ApprovedMarkersSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Markers</p>
          <p className="text-xs text-neutral-600">Canonical marker widths and styles for header, left nav, and drilldown components.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-5">
          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Header Marker</p>
            <div className="mt-3">
              <button type="button" className="house-top-nav-item house-top-nav-item-workspace house-top-nav-item-active">
                Workspaces
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-header)</code></p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left Nav Marker</p>
            <div className="mt-3">
              <button type="button" className="house-nav-item house-nav-item-workspace house-nav-item-active w-full">
                <span className="house-nav-item-label">Overview</span>
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-left-nav)</code></p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown Title Marker</p>
            <div className="mt-3">
              <div className="house-left-border house-left-border-publications pb-3 mb-3">
                <p className="text-sm font-semibold text-neutral-900">Publication drilldown title</p>
                <p className="text-xs text-neutral-600 mt-1">Marker under title divider.</p>
              </div>
              <div className="border-t border-[hsl(var(--publications-accent-500)/0.3)]" />
            </div>
            <p className="mt-3 text-xs text-neutral-600">Style: <code>border-t border-[publications-accent/0.3]</code></p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown Nav Marker</p>
            <div className="mt-3">
              <div className="flex gap-1 mb-2 bg-card p-2 rounded-sm">
                <button type="button" className="house-nav-item approved-drilldown-nav-item approved-drilldown-nav-item-active flex-1">
                  <span className="house-nav-item-label text-xs">Summary</span>
                </button>
                <button type="button" className="house-nav-item approved-drilldown-nav-item flex-1">
                  <span className="house-nav-item-label text-xs">Details</span>
                </button>
              </div>
              <div className="border-t border-[hsl(var(--section-style-profile-accent)/var(--marker-opacity))]" />
            </div>
            <p className="mt-3 text-xs text-neutral-600">Classes: <code>approved-drilldown-nav-item</code> + <code>approved-drilldown-nav-item-active</code> with profile marker divider</p>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedDividersSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Dividers</p>
          <p className="text-xs text-neutral-600">Canonical divider and separator contracts for main, left nav, metric tiles, toolbox, and drilldowns.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Line dividers</p>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-divider-border-soft</code></p>
              <div className="rounded-md border house-divider-border-soft p-2 text-xs text-neutral-700">Soft border divider on container edge</div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-divider-fill-soft</code></p>
              <div className="house-divider-fill-soft h-px w-full" />
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-divider-strong</code></p>
              <div className="house-divider-strong" />
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-drilldown-divider-top</code></p>
              <div className="house-drilldown-divider-top" />
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Structural separators</p>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-nav-section-separator</code></p>
              <div className="rounded-md border border-neutral-200 p-2">
                <div className="text-xs text-neutral-600">Section A</div>
                <div className="house-nav-section-separator" />
                <div className="text-xs text-neutral-600">Section B</div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-publications-toolbox-divider</code></p>
              <div className="flex items-center gap-2 rounded-md border border-neutral-200 p-2 text-xs text-neutral-700">
                <span>Generate</span>
                <span className="house-publications-toolbox-divider" aria-hidden="true" />
                <span>Download</span>
                <span className="house-publications-toolbox-divider" aria-hidden="true" />
                <span>Share</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600"><code>.house-metric-tile-separator</code></p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-md border border-neutral-200 p-2">
                <span className="text-xs text-neutral-700">Tile copy</span>
                <span className="house-metric-tile-separator h-6 mx-3" />
                <span className="text-xs text-neutral-700">Tile chart</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Spacing separators</p>
              <div className="rounded-md border border-neutral-200 p-2 text-xs text-neutral-700">
                <div className="house-separator-left-panel-subheading-to-content">Subheading to content spacer (<code>.house-separator-left-panel-subheading-to-content</code>)</div>
                <div className="house-separator-left-panel-content-to-subheading">Content to subheading spacer (<code>.house-separator-left-panel-content-to-subheading</code>)</div>
              </div>
            </div>
          </article>

          <article className="lg:col-span-2 rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class and token map</p>
            <div className="mt-3 overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Class</th>
                    <th className="px-2 py-1.5 font-semibold">Type</th>
                    <th className="px-2 py-1.5 font-semibold">Token/source</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-divider-border-soft</code></td><td className="px-2 py-1.5">border color utility</td><td className="px-2 py-1.5"><code>hsl(var(--stroke-soft) / 0.92)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-divider-fill-soft</code></td><td className="px-2 py-1.5">line fill utility</td><td className="px-2 py-1.5"><code>hsl(var(--stroke-soft) / 0.92)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-divider-strong</code></td><td className="px-2 py-1.5">strong 1px horizontal divider</td><td className="px-2 py-1.5"><code>hsl(var(--stroke-strong) / 0.98)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-section-separator</code></td><td className="px-2 py-1.5">left-nav section divider</td><td className="px-2 py-1.5"><code>--left-nav-divider-height/color/margin</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-publications-toolbox-divider</code></td><td className="px-2 py-1.5">toolbar vertical divider</td><td className="px-2 py-1.5"><code>1px @ hsl(var(--stroke-strong) / 0.74)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-metric-tile-separator</code></td><td className="px-2 py-1.5">metric tile vertical separator</td><td className="px-2 py-1.5"><code>--metric-tile-separator-color/width</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-divider-top</code></td><td className="px-2 py-1.5">drilldown section divider</td><td className="px-2 py-1.5"><code>border-top: 1px solid hsl(var(--stroke-soft) / 0.92)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-separator-left-panel-subheading-to-content</code></td><td className="px-2 py-1.5">spacing separator utility</td><td className="px-2 py-1.5"><code>margin-bottom: var(--separator-left-panel-subheading-to-content)</code></td></tr>
                  <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-separator-left-panel-content-to-subheading</code></td><td className="px-2 py-1.5">spacing separator utility</td><td className="px-2 py-1.5"><code>margin-top: var(--separator-left-panel-content-to-subheading)</code></td></tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedLayoutTitlePositioning() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Layout</p>
          <p className="text-xs text-neutral-600">Title positioning (CSS source-of-truth tokens)</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-anchor-offset</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop +md top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-anchor-offset-md</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-fluid-anchor-offset</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid +md top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-fluid-anchor-offset-md</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Title marker inset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--page-title-marker-inset-block</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Title expander style</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>.house-title-expander</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left nav width</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--layout-left-nav-width</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left nav width (mobile)</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--layout-left-nav-width-mobile</code>
              </p>
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-card p-4">
            <p className="text-xs text-neutral-600 mb-3">
              Preview: title anchor spacing to top header and left panel uses the same layout token family.
            </p>
            <div className="grid grid-cols-[var(--layout-left-nav-width)_1fr] gap-4">
              <aside className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left panel</p>
              </aside>
              <main className="rounded-md border border-border bg-background p-3">
                <div data-house-role="page-header" className="house-page-header house-left-border house-left-border-workspace">
                  <h1 data-house-role="page-title" className="house-title text-[1.35rem] leading-[1.5rem]">Publications</h1>
                  <p data-house-role="page-title-expander" className="house-title-expander">Canonical content title placement</p>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ApprovedTypographySection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Typography</p>
          <p className="text-xs text-neutral-600">Organized reference by component area with grouped typography, layout blocks, and spacing rules.</p>
        </div>

        <div className="space-y-4 p-4">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Main</p>
            <div className="house-main-title-block rounded-sm border border-neutral-200 p-2">
              <p className="house-title">Publications</p>
              <p className="house-title-expander">Track your research metrics and manage your publication library.</p>
            </div>
            <div className="house-main-heading-block rounded-sm border border-neutral-200 p-2">
              <p className="house-section-title">Publication insights</p>
            </div>

            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-700">Block contract</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-700">
                <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1">Title</span>
                <span className="text-neutral-400">→</span>
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1">Heading</span>
                <span className="text-neutral-400">→</span>
                <span className="rounded border border-teal-200 bg-teal-50 px-2 py-1">Subheading</span>
                <span className="text-neutral-400">→</span>
                <span className="rounded border border-neutral-300 bg-white px-2 py-1">Content</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-neutral-200 bg-white p-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Heading → Content</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">0.3rem</p>
              </div>
              <div className="rounded-md border border-neutral-200 bg-white p-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Content → Heading</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">1.69rem</p>
              </div>
              <div className="rounded-md border border-neutral-200 bg-white p-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Content → Subheading</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">1.69rem</p>
              </div>
            </div>

            <div className="rounded-md border border-neutral-200 p-2">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Block map</p>
              <div className="space-y-1.5">
                <div className="house-main-title-block rounded-sm border border-sky-200 bg-sky-50 p-2">
                  <p className="house-field-helper">Title block</p>
                  <p className="house-title">Page title</p>
                  <p className="house-title-expander">Title expander</p>
                </div>
                <div className="house-main-heading-block rounded-sm border border-amber-200 bg-amber-50 p-2">
                  <p className="house-field-helper">Heading block</p>
                  <p className="house-section-title">Section heading</p>
                </div>
                <div className="house-main-subheading-block rounded-sm border border-teal-200 bg-teal-50 p-2">
                  <p className="house-field-helper">Subheading block</p>
                  <p className="house-text">Subheading row</p>
                </div>
                <div className="house-main-content-block rounded-sm border border-neutral-300 bg-white p-2">
                  <p className="house-field-helper">Content block</p>
                  <p className="house-text">Main content area</p>
                </div>
              </div>
            </div>

            <details className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
              <summary className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-700">Show detailed reference tables</summary>
              <p className="mt-1 text-xs text-neutral-600">Typography, block properties, and full selector matrix are listed below.</p>
            </details>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Typography</th>
                      <th className="px-2 py-1.5 font-semibold">Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-title</code></td><td className="px-2 py-1.5">2.05rem / 2.3rem · 500 · -0.02em</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-title-expander</code></td><td className="px-2 py-1.5">0.875rem / 1.25rem · 400</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-section-title</code></td><td className="px-2 py-1.5">1.125rem / 1.4rem · 500 · 0.01em</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-text</code></td><td className="px-2 py-1.5">0.875rem / 1.5rem · 400</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-field-helper</code></td><td className="px-2 py-1.5">0.8125rem / 1.2rem · 500</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Layout blocks</th>
                      <th className="px-2 py-1.5 font-semibold">Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block</code></td><td className="px-2 py-1.5">display:flex · flex-direction:column · align-items:flex-start · gap:0.2rem · min-width:0</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-heading-block</code></td><td className="px-2 py-1.5">display:flex · flex-wrap:wrap · align-items:center · justify-content:space-between · gap:0.5rem · padding-block:0.375rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-subheading-block</code></td><td className="px-2 py-1.5">display:flex · flex-wrap:wrap · align-items:baseline · justify-content:space-between · gap:0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block</code></td><td className="px-2 py-1.5">display:flex · flex-direction:column · min-width:0</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-page-header</code></td><td className="px-2 py-1.5">flex column · gap 0.2rem</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Spacing relationships</th>
                      <th className="px-2 py-1.5 font-semibold">Token / Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block + .house-main-heading-block</code></td><td className="px-2 py-1.5"><code>--separator-main-title-expander-to-first-heading</code> = 0.72rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block + .house-section-anchor .house-main-heading-block:first-child</code></td><td className="px-2 py-1.5"><code>--separator-main-title-expander-to-first-heading</code> = 0.72rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-heading-block + .house-main-content-block</code></td><td className="px-2 py-1.5"><code>--separator-main-heading-block-to-content</code> = 0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-subheading-block + .house-main-content-block</code></td><td className="px-2 py-1.5"><code>--separator-main-heading-block-to-content</code> = 0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block + .house-main-heading-block</code></td><td className="px-2 py-1.5"><code>--separator-main-content-to-heading</code> = 1.69rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block + .house-main-content-block</code></td><td className="px-2 py-1.5"><code>--separator-main-content-to-content</code> = 1.69rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block + .house-main-subheading-block</code></td><td className="px-2 py-1.5"><code>--separator-main-content-to-subheading</code> = 1.69rem</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left</p>
            <button type="button" className="house-nav-item house-nav-item-workspace house-nav-item-active w-full">
              <span className="house-nav-item-label">Overview</span>
              <span className="house-nav-item-count">12</span>
            </button>

            <div className="rounded-md border border-neutral-200 p-2">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Block map</p>
              <div className="space-y-1.5">
                <div className="rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Left section label block</p>
                  <p className="house-nav-section-label">Workspace</p>
                </div>
                <div className="rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Left content block (nav list)</p>
                  <div className="house-nav-list">
                    <button type="button" className="house-nav-item house-nav-item-workspace">
                      <span className="house-nav-item-label">Overview</span>
                    </button>
                    <button type="button" className="house-nav-item house-nav-item-workspace">
                      <span className="house-nav-item-label">Data library</span>
                      <span className="house-nav-item-meta">New</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Typography</th><th className="px-2 py-1.5 font-semibold">Properties</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-section-label</code></td><td className="px-2 py-1.5">0.8125rem / 1.2rem · 600 · 0.08em · uppercase</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-item-label</code></td><td className="px-2 py-1.5">0.875rem / 1.25rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-item-meta</code></td><td className="px-2 py-1.5">0.75rem / 1.1rem · 500</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Layout blocks</th><th className="px-2 py-1.5 font-semibold">Properties</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-list</code></td><td className="px-2 py-1.5">flex column · gap var(--separator-left-panel-subheading-to-content)</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-nav-item</code></td><td className="px-2 py-1.5">gap 0.5rem · padding 0.5rem 0.75rem</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Spacing relationships</th><th className="px-2 py-1.5 font-semibold">Value</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>--separator-left-panel-subheading-to-content</code></td><td className="px-2 py-1.5">0.25rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>--separator-left-panel-content-to-subheading</code></td><td className="px-2 py-1.5">0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-separator-left-panel-subheading-to-content</code></td><td className="px-2 py-1.5">margin-bottom: 0.25rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-separator-left-panel-content-to-subheading</code></td><td className="px-2 py-1.5">margin-top: 0.5rem</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown</p>
            <div className="house-drilldown-title-block rounded-sm border border-neutral-200 p-2">
              <p className="house-drilldown-title">Total publication insights</p>
              <p className="house-drilldown-title-expander">Lifetime citations across all publications with annual growth context.</p>
            </div>

            <div className="rounded-md border border-neutral-200 p-2">
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-700">Block contract</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-700">
                  <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1">Title</span>
                  <span className="text-neutral-400">→</span>
                  <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1">Navigation</span>
                  <span className="text-neutral-400">→</span>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1">Heading</span>
                  <span className="text-neutral-400">→</span>
                  <span className="rounded border border-teal-200 bg-teal-50 px-2 py-1">Subheading</span>
                  <span className="text-neutral-400">→</span>
                  <span className="rounded border border-neutral-300 bg-white px-2 py-1">Content</span>
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-neutral-200 bg-white p-2">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Title → Nav</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">0.08rem</p>
                </div>
                <div className="rounded-md border border-neutral-200 bg-white p-2">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Nav → Heading</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">2.5rem</p>
                </div>
                <div className="rounded-md border border-neutral-200 bg-white p-2">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Heading → Content</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">0rem</p>
                </div>
                <div className="rounded-md border border-neutral-200 bg-white p-2">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Content → Heading</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">2.5rem</p>
                </div>
              </div>

              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Block map</p>
              <div className="space-y-1.5">
                <div className="house-drilldown-title-block rounded-sm border border-sky-200 bg-sky-50 p-2">
                  <p className="house-field-helper">Title block</p>
                  <p className="house-drilldown-title">Drilldown title</p>
                  <p className="house-drilldown-title-expander">Drilldown expander</p>
                </div>
                <div className="house-drilldown-navigation-block rounded-sm border border-cyan-200 bg-cyan-50 p-2">
                  <p className="house-field-helper">Navigation block</p>
                  <p className="house-drilldown-section-label">Tab row / drilldown navigation</p>
                </div>
                <div className="house-drilldown-heading-block rounded-sm border border-amber-200 bg-amber-50 p-2">
                  <p className="house-field-helper">Heading block</p>
                  <p className="house-drilldown-section-label">Section heading / key controls</p>
                </div>
                <div className="house-drilldown-subheading-block rounded-sm border border-teal-200 bg-teal-50 p-2">
                  <p className="house-field-helper">Subheading block</p>
                  <p className="house-drilldown-overline">Section overline</p>
                </div>
                <div className="house-drilldown-content-block rounded-sm border border-neutral-300 bg-white p-2">
                  <p className="house-field-helper">Content block</p>
                  <p className="house-drilldown-note-soft">Drilldown content area</p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <div className="rounded-md border border-green-200 bg-green-50 p-2">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-green-800">Correct (sibling flow)</p>
                  <p className="mt-1 text-xs text-green-900">Title block</p>
                  <p className="text-xs text-green-900">Navigation block</p>
                  <p className="text-xs text-green-900">Heading/Subheading block</p>
                  <p className="text-xs text-green-900">Content block</p>
                </div>
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-rose-800">Avoid (nested flow)</p>
                  <p className="mt-1 text-xs text-rose-900">Heading block</p>
                  <p className="text-xs text-rose-900">└ Content block nested inside heading</p>
                  <p className="text-xs text-rose-900">Separator contract won’t apply predictably</p>
                </div>
              </div>
            </div>

            <details className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
              <summary className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-neutral-700">Show detailed reference tables</summary>
              <p className="mt-1 text-xs text-neutral-600">Typography, block properties, and full selector matrix are listed below.</p>
            </details>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Typography</th><th className="px-2 py-1.5 font-semibold">Properties</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title</code></td><td className="px-2 py-1.5">1.5rem / 1.86rem · 500 · 0.01em</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-expander</code></td><td className="px-2 py-1.5">0.875rem / 1.25rem · 400</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-overline</code></td><td className="px-2 py-1.5">0.8125rem / 1.2rem · 600 · 0.08em · uppercase</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-title</code></td><td className="px-2 py-1.5">0.6875rem / 0.95rem · 600 · 0.07em · uppercase</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value</code></td><td className="px-2 py-1.5">1.5rem / 1.62rem · 500 · tabular-nums</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-chart-axis-period-tag</code></td><td className="px-2 py-1.5">Year/period chip on axis line 2 · text matches label tone · fill uses nav hover accent token</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Layout blocks</th><th className="px-2 py-1.5 font-semibold">Properties</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-block</code></td><td className="px-2 py-1.5">display:flex · flex-direction:column · align-items:flex-start · gap:0.25rem · min-width:0</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-navigation-block</code></td><td className="px-2 py-1.5">display:flex · flex-wrap:wrap · align-items:center · justify-content:space-between · gap:0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-heading-block</code></td><td className="px-2 py-1.5">display:flex · flex-wrap:wrap · align-items:center · justify-content:space-between · gap:0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block</code></td><td className="px-2 py-1.5">display:flex · flex-wrap:wrap · align-items:baseline · justify-content:space-between · gap:0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-content-block</code></td><td className="px-2 py-1.5">display:flex · flex-direction:column · min-width:0</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Spacing relationships</th><th className="px-2 py-1.5 font-semibold">Token / Value</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-block + .house-drilldown-heading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-title-expander-to-first-heading</code> = 0.08rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-block + .house-drilldown-navigation-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-title-expander-to-navigation-block</code> = 0.08rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-navigation-block + .house-drilldown-heading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-navigation-block-to-heading</code> = 2.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-navigation-block + .house-drilldown-subheading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-navigation-block-to-heading</code> = 2.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-heading-block + .house-drilldown-content-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-heading-to-content</code> = 0rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block + .house-drilldown-content-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-heading-to-content</code> = 0rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-content-block + .house-drilldown-heading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-content-to-heading</code> = 2.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-content-block + .house-drilldown-subheading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-content-to-subheading</code> = 2.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-summary-stats-grid</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-summary-grid-to-content-top</code> = 0.5rem (0rem in publications headline content)</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block &gt; .house-drilldown-overline</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-heading-block-to-content</code> = 0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-heading-block + .house-drilldown-subheading-block</code></td><td className="px-2 py-1.5"><code>--separator-drilldown-content-to-heading-block</code> = 2.5rem</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedMetricTilesSection() {
  const [hIndexMode, setHIndexMode] = useState<'trend' | 'needed'>('trend')

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Metric Tiles</p>
          <p className="text-xs text-neutral-600">Canonical publication tile surface, separator, and state behavior.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3">
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Total publications</p>
                <p className="house-metric-tile-value">150</p>
                <p className="house-metric-subtitle">Lifetime publications</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <p className="house-metric-right-chart-title">Publications per year (last 5 years)</p>
                <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell house-metric-tile-shell-selected min-h-36 rounded-md border p-3">
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Citations</p>
                <p className="house-metric-tile-value">26,382</p>
                <p className="house-metric-subtitle">Lifetime citations</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <p className="house-metric-right-chart-title">Citations per year (last 5 years)</p>
                <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3 lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">
              Alternative Right Header Slot (Toggle Instead Of Title)
            </p>
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">H-index</p>
                <p className="house-metric-tile-value">h 23</p>
                <p className="house-metric-subtitle">Progress to h 24</p>
                <p className="house-metric-detail">Toggle moved to right chart header slot.</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <div className="house-metric-right-chart-panel house-metric-right-chart-panel-toggle">
                  <div className="house-metric-right-chart-header">
                    <div className="house-toggle-track grid-cols-2">
                      <span
                        className="house-toggle-thumb"
                        style={buildTileToggleThumbStyle(hIndexMode === 'needed' ? 1 : 0, 2)}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className={hIndexMode === 'trend' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                        onClick={() => setHIndexMode('trend')}
                        aria-pressed={hIndexMode === 'trend'}
                      >
                        Trend
                      </button>
                      <button
                        type="button"
                        className={hIndexMode === 'needed' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                        onClick={() => setHIndexMode('needed')}
                        aria-pressed={hIndexMode === 'needed'}
                      >
                        Citations needed
                      </button>
                    </div>
                  </div>
                  <div className="house-metric-right-chart-body">
                    <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3 lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">
              Collaboration Structure (Neutral Facts List Preview)
            </p>
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Collaboration structure</p>
                <p className="house-metric-tile-value">448</p>
                <p className="house-metric-subtitle">Unique collaborators</p>
                <div className="pt-1.5">
                  <p className="house-chart-axis-text mb-1 font-semibold">Repeat collaborator rate</p>
                  <div className="house-drilldown-progress-track h-[var(--metric-progress-track-height)]">
                    <div className="house-chart-bar-positive h-full rounded-full" style={{ width: '62%' }} />
                  </div>
                  <p className="house-chart-axis-text mt-1 text-right font-semibold">62%</p>
                </div>
              </div>
              <div className="house-metric-tile-separator relative min-h-0 border-l pl-3">
                <div className="house-metric-tile-pill-container-bottom-center">
                  <span className="house-metric-pill house-metric-pill-publications house-metric-pill-publications-regular house-metric-tile-pill">
                    Median author position 2
                  </span>
                </div>
                <div className="house-metric-tile-chart-surface flex h-full min-h-0 flex-col rounded-sm px-2 py-1.5">
                  <div>
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Institutions</span>
                      <span className="house-chart-axis-text leading-tight text-center">136</span>
                    </div>
                    <div className="my-1 h-px bg-[hsl(var(--stroke-soft)/0.72)]" />
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Countries</span>
                      <span className="house-chart-axis-text leading-tight text-center">16</span>
                    </div>
                    <div className="my-1 h-px bg-[hsl(var(--stroke-soft)/0.72)]" />
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Continents</span>
                      <span className="house-chart-axis-text leading-tight text-center">5</span>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="house-chart-axis-text mb-1 leading-tight">Repeat collaborator rate</p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <div className="house-drilldown-progress-track h-[var(--metric-progress-track-height)]">
                        <div className="house-chart-bar-positive h-full rounded-full" style={{ width: '62%' }} />
                      </div>
                      <p className="house-chart-axis-text leading-tight">62%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div className="px-4 pb-4 text-xs text-neutral-600">
          Tokens: <code>--metric-tile-grid-gap</code>, <code>--metric-tile-grid-padding</code>, <code>--metric-tile-grid-row-min-height</code>, <code>--metric-tile-border-color</code>, <code>--metric-tile-border-width</code>, <code>--metric-tile-bg-rest</code>, <code>--metric-tile-bg-hover</code>, <code>--metric-tile-bg-selected</code>, <code>--metric-tile-chart-bg-rest</code>, <code>--metric-tile-chart-bg-hover</code>, <code>--metric-tile-separator-color</code>, <code>--metric-tile-separator-width</code>.
        </div>
      </div>
    </section>
  )
}

function ApprovedInsightsControlSection() {
    const toolboxTooltipClass =
      'house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

    return (
      <section>
        <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">Approved Publications Insights Controls (Eye + Tools)</p>
            <p className="text-xs text-neutral-600">Canonical right-rail control cluster for publications insights. Keep shell/behavior, swap tray actions as needed for Publication Library tools.</p>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Visual preview</p>

              <div className="house-main-heading-block w-full rounded-sm border border-neutral-200 p-2">
                <p className="house-section-title">Publication insights</p>
                <div className="ml-auto flex h-8 w-[25rem] shrink-0 items-center justify-end gap-1 overflow-visible">
                  <div className="relative order-3 z-[70] overflow-visible transition-[max-width,opacity,transform] duration-200 ease-out max-w-[20rem] translate-x-0 opacity-100">
                    <div className="flex min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
                      <div className="group relative inline-flex">
                        <button
                          type="button"
                          className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                          aria-label="Generate publication insights report"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <span className={toolboxTooltipClass} aria-hidden="true">Generate report</span>
                      </div>
                      <div className="house-publications-toolbox-divider" aria-hidden="true" />
                      <div className="group relative inline-flex">
                        <button
                          type="button"
                          className="house-section-tool-button house-publications-toolbox-item house-publications-tools-toggle-open h-8 w-8 inline-flex items-center justify-center"
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-40 w-[20.5rem]">
                          <div className="house-publications-filter-header">
                            <p className="house-publications-filter-title">Download library</p>
                            <button type="button" className="house-publications-filter-clear">Reset</button>
                          </div>
                          <details className="house-publications-filter-group" open>
                            <summary className="house-publications-filter-summary">
                              <span>Format</span>
                              <span className="house-publications-filter-count">XLSX</span>
                            </summary>
                            <div className="house-publications-filter-options">
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Excel (.xlsx)</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">CSV (.csv)</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">RIS (EndNote / Zotero / Mendeley)</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">BibTeX (.bib)</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">PubMed NBIB (.nbib)</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-format" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">EndNote XML (.xml)</span></label>
                            </div>
                          </details>
                          <details className="house-publications-filter-group" open>
                            <summary className="house-publications-filter-summary">
                              <span>Scope</span>
                              <span className="house-publications-filter-count">Filtered</span>
                            </summary>
                            <div className="house-publications-filter-options">
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-scope" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">Whole library</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-scope" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Current filtered results</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-scope" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">Current page</span></label>
                              <label className="house-publications-filter-option"><input type="radio" name="approved-download-scope" className="house-publications-filter-checkbox" /><span className="house-publications-filter-option-label">Selected rows</span></label>
                            </div>
                          </details>
                          <details className="house-publications-filter-group" open>
                            <summary className="house-publications-filter-summary">
                              <span>Include fields</span>
                              <span className="house-publications-filter-count">9/12</span>
                            </summary>
                            <div className="house-publications-filter-options">
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Title</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Authors</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Year</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Journal</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">DOI</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">PMID</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Publication type</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Article type</span></label>
                              <label className="house-publications-filter-option"><input type="checkbox" className="house-publications-filter-checkbox" defaultChecked /><span className="house-publications-filter-option-label">Citations</span></label>
                            </div>
                          </details>
                          <div className="mt-2 flex items-center justify-end">
                            <button type="button" className="house-section-tool-button inline-flex h-8 items-center justify-center px-2.5 text-[0.69rem] font-semibold uppercase tracking-[0.07em]">Download</button>
                          </div>
                        </div>
                        <span className={toolboxTooltipClass} aria-hidden="true">Download</span>
                      </div>
                      <div className="house-publications-toolbox-divider" aria-hidden="true" />
                      <div className="group relative inline-flex">
                        <button
                          type="button"
                          className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                          aria-label="Share"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                        <span className={toolboxTooltipClass} aria-hidden="true">Share</span>
                      </div>
                    </div>
                  </div>

                  <div className="relative order-1 shrink-0">
                    <button
                      type="button"
                      className="h-8 w-8 house-publications-action-icon house-publications-top-control house-section-tool-button house-publications-tools-toggle-open inline-flex items-center justify-center"
                      aria-label="Show publication library search"
                      aria-pressed="true"
                      aria-expanded="true"
                    >
                      <Search className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                    </button>
                    <div className="house-publications-search-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[22.5rem]">
                      <label className="house-publications-search-label" htmlFor="approved-publication-library-search">
                        Search library
                      </label>
                      <input
                        id="approved-publication-library-search"
                        type="text"
                        className="house-publications-search-input"
                        placeholder="Search by publication name, author, PMID, DOI, journal..."
                        defaultValue=""
                      />
                    </div>
                  </div>
                  <div className="relative order-2 shrink-0">
                    <button
                      type="button"
                      className="h-8 w-8 house-publications-action-icon house-publications-top-control house-section-tool-button house-publications-tools-toggle-open inline-flex items-center justify-center"
                      aria-label="Hide publication library filters"
                      aria-pressed="true"
                      aria-expanded="true"
                    >
                      <Filter className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                    </button>
                    <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[17.5rem]">
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Filter library</p>
                        <button type="button" className="house-publications-filter-clear">Clear</button>
                      </div>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Publication type</span>
                          <span className="house-publications-filter-count">2</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Journal article</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Review article</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">Conference paper</span>
                          </label>
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Article type</span>
                          <span className="house-publications-filter-count">1</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Original research</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">Case report</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">Systematic review</span>
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="order-4 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button house-publications-tools-toggle-open inline-flex items-center justify-center"
                    aria-label="Hide toolbox actions"
                    aria-pressed="true"
                  >
                    <Hammer className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                  </button>
                  <div className="relative order-5 shrink-0">
                    <button
                      type="button"
                      className="h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button house-publications-tools-toggle-open inline-flex items-center justify-center"
                      aria-label="Show publication library settings"
                      aria-pressed="true"
                      aria-expanded="true"
                    >
                      <Settings className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                    </button>
                    <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[18.75rem]">
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Table settings</p>
                        <div className="inline-flex items-center gap-2">
                          <button type="button" className="house-publications-filter-clear">Auto width</button>
                          <button type="button" className="house-publications-filter-clear">Reset</button>
                        </div>
                      </div>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Columns</span>
                          <span className="house-publications-filter-count">6/6</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Title</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Year</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Journal</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Publication type</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Article type</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Citations</span>
                          </label>
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Visuals</span>
                          <span className="house-publications-filter-count">3/3</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Alternate row shading</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Metric highlights (citations)</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="checkbox" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Attachment status icon</span>
                          </label>
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Density</span>
                          <span className="house-publications-filter-count">Default</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-density" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">Compact</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-density" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">Default</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-density" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">Comfortable</span>
                          </label>
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Rows per page</span>
                          <span className="house-publications-filter-count">50</span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-page-size" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">25 publications</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-page-size" className="house-publications-filter-checkbox" defaultChecked />
                            <span className="house-publications-filter-option-label">50 publications</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-page-size" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">100 publications</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input type="radio" name="approved-publications-page-size" className="house-publications-filter-checkbox" />
                            <span className="house-publications-filter-option-label">All publications</span>
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="order-6 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle house-section-tool-button inline-flex items-center justify-center"
                    aria-label="Set publication insights not visible"
                    aria-pressed="true"
                  >
                    <Eye className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                  </button>
                </div>
              </div>

              <div className="house-main-heading-block w-full rounded-sm border border-neutral-200 p-2">
                <p className="house-section-title">Publication insights (hidden)</p>
                <div className="ml-auto flex h-8 w-[25rem] shrink-0 items-center justify-end gap-1 overflow-visible">
                  <button
                    type="button"
                    className="h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle house-section-tool-button inline-flex items-center justify-center"
                    data-state="closed"
                    aria-label="Set publication insights visible"
                    aria-pressed="false"
                  >
                    <EyeOff className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                  </button>
                </div>
              </div>
            </article>

            <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class + token mapping</p>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Element</th>
                      <th className="px-2 py-1.5 font-semibold">Role</th>
                      <th className="px-2 py-1.5 font-semibold">Token touchpoints</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-toolbox-item</code></td>
                      <td className="px-2 py-1.5">Tray action slot</td>
                      <td className="px-2 py-1.5">action shell for Generate/Download/Share; replace with Publication Library actions as needed</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-toolbox-divider</code></td>
                      <td className="px-2 py-1.5">Tray separator</td>
                      <td className="px-2 py-1.5">single-stroke divider between action slots</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-top-control</code></td>
                      <td className="px-2 py-1.5">Right-rail control shell</td>
                      <td className="px-2 py-1.5">shared square control geometry and border contract for tools/eye buttons</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-tools-toggle-open</code> + <code>.house-publications-tools-toggle-icon</code></td>
                      <td className="px-2 py-1.5">Tools open-state styling</td>
                      <td className="px-2 py-1.5">active state fill + icon treatment for toolbox toggle</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-eye-toggle</code> + <code>.house-publications-eye-toggle-icon</code></td>
                      <td className="px-2 py-1.5">Visibility state styling</td>
                      <td className="px-2 py-1.5">open/closed eye control visual contract for insights visibility</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-filter-popover</code></td>
                      <td className="px-2 py-1.5">Filter surface</td>
                      <td className="px-2 py-1.5">left-opening anchored panel sharing house border, neutral gradient, and elevation contract</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-filter-group</code> + <code>.house-publications-filter-option</code></td>
                      <td className="px-2 py-1.5">Tick-list filter groups</td>
                      <td className="px-2 py-1.5">dropdown section shell, count badge, checkbox rows, and hover state for publication/article filters</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-publications-search-popover</code> + <code>.house-publications-search-input</code></td>
                      <td className="px-2 py-1.5">Search quick panel</td>
                      <td className="px-2 py-1.5">left-opening search surface and input contract for publication name, author, PMID, DOI, and journal lookups</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>Download popover</code></td>
                      <td className="px-2 py-1.5">Export controls</td>
                      <td className="px-2 py-1.5">format options (XLSX/CSV/RIS/BibTeX/NBIB/EndNote XML), scope options, and include-field toggles</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-table-resize-handle</code></td>
                      <td className="px-2 py-1.5">Header width controls</td>
                      <td className="px-2 py-1.5">hover a header separator and drag left/right to resize columns directly in-table</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-table-reorder-handle</code></td>
                      <td className="px-2 py-1.5">Hover reorder affordance</td>
                      <td className="px-2 py-1.5">subtle drag handle appears on header hover; drag onto another header to reorder columns</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>Settings popover (Table settings)</code></td>
                      <td className="px-2 py-1.5">Column + visual + page-size controls</td>
                      <td className="px-2 py-1.5">column visibility toggles, alternate row shading toggle, citation highlight toggle, attachment icon visibility, density, rows-per-page options (25/50/100/All), and an Auto width action for current visible columns</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>Publication table pagination footer</code></td>
                      <td className="px-2 py-1.5">Page navigation contract</td>
                      <td className="px-2 py-1.5">showing range text with Prev/Next controls and page index; hidden when rows-per-page is set to All</td>
                    </tr>
                    <tr className="border-t border-neutral-200">
                      <td className="px-2 py-1.5"><code>.house-drilldown-chart-tooltip</code></td>
                      <td className="px-2 py-1.5">Tooltip surface</td>
                      <td className="px-2 py-1.5">same chart-tooltip style used for toolbox icon hovers</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </div>
      </section>
    )
}

function ApprovedDefaultPublicationTableSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Default Table (Publication Library)</p>
          <p className="text-xs text-neutral-600">Canonical base table shell for publication library usage, including black outer border contract.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Visual preview</p>
            <div className="house-main-content-block rounded-sm border border-neutral-200 p-2">
              <div className="house-table-shell house-table-context-profile">
                <table className="min-w-full table-fixed">
                  <thead className="house-table-head">
                    <tr className="house-table-row">
                      <th className="house-table-head-text px-2 py-1.5 text-left">Title</th>
                      <th className="house-table-head-text px-2 py-1.5 text-left">Year</th>
                      <th className="house-table-head-text px-2 py-1.5 text-left">Journal</th>
                      <th className="house-table-head-text px-2 py-1.5 text-left">Citations</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="house-table-row">
                      <td className="house-table-cell-text px-2 py-1.5 align-top">Cardio-Oncology Evidence Series 12</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">2024</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">European Heart Journal</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">84</td>
                    </tr>
                    <tr className="house-table-row">
                      <td className="house-table-cell-text px-2 py-1.5 align-top">AI-Augmented Echo Workflow Validation</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">2023</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">JACC Imaging</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">67</td>
                    </tr>
                    <tr className="house-table-row">
                      <td className="house-table-cell-text px-2 py-1.5 align-top">Registry Outcomes in Anthracycline Exposure</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">2022</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">Circulation</td>
                      <td className="house-table-cell-text px-2 py-1.5 align-top">41</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-650))]">Showing 1-50 of 120</p>
                <div className="inline-flex items-center gap-1">
                  <button type="button" className="house-section-tool-button inline-flex h-7 items-center justify-center px-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] opacity-50" aria-label="Go to previous page">Prev</button>
                  <span className="min-w-[4.2rem] text-center text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-700))]">1/3</span>
                  <button type="button" className="house-section-tool-button inline-flex h-7 items-center justify-center px-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em]" aria-label="Go to next page">Next</button>
                </div>
              </div>
            </div>
          </article>
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class + token mapping</p>
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Element</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">Token touchpoints</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-table-shell</code></td>
                    <td className="px-2 py-1.5">Default table container</td>
                    <td className="px-2 py-1.5">black 1px outer border, rounded shell, scroll containment</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-table-head</code> + <code>.house-table-head-text</code></td>
                    <td className="px-2 py-1.5">Header row styling</td>
                    <td className="px-2 py-1.5">neutral header surface and typography hierarchy for column labels</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-table-row</code> + <code>.house-table-cell-text</code></td>
                    <td className="px-2 py-1.5">Body rows and cells</td>
                    <td className="px-2 py-1.5">row separators, hover state, and base table text contract</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedMetricsToolbarSection() {
  const toolboxTooltipClass =
    'house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Metrics Toolbar (Publications)</p>
          <p className="text-xs text-neutral-600">Live publications toolbar pattern for defining house tokens around report/download/share actions.</p>
          <p className="text-xs text-neutral-600">Only approved tooltip class for this surface: <code>.house-approved-tooltip</code> (same visual contract as chart tooltips).</p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Visual preview</p>
            <div className="house-main-heading-block w-full rounded-sm border border-neutral-200 p-2">
              <p className="house-section-title">Publication insights</p>
              <div className="ml-auto flex min-h-8 min-w-[16.5rem] justify-end">
                <div className="flex min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
                  <div className="group relative inline-flex">
                    <button
                      type="button"
                      className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                      aria-label="Generate publication insights report"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    <span className={toolboxTooltipClass} aria-hidden="true">Generate report</span>
                  </div>
                  <div className="house-publications-toolbox-divider" aria-hidden="true" />
                  <div className="group relative inline-flex">
                    <button
                      type="button"
                      className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                      aria-label="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <span className={toolboxTooltipClass} aria-hidden="true">Download</span>
                  </div>
                  <div className="house-publications-toolbox-divider" aria-hidden="true" />
                  <div className="group relative inline-flex">
                    <button
                      type="button"
                      className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                      aria-label="Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <span className={toolboxTooltipClass} aria-hidden="true">Share</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="house-main-content-block rounded-sm border border-neutral-200 p-2">
              <section className="house-notification-section">
                <div className="house-banner house-banner-info">
                  <p>Publication insights hidden by user.</p>
                </div>
              </section>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class + token mapping</p>
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Element</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">Token touchpoints</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-approved-tooltip</code></td>
                    <td className="px-2 py-1.5">Single approved tooltip surface</td>
                    <td className="px-2 py-1.5">shared with chart overlays via the drilldown chart tooltip contract</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-publications-toolbox-item</code></td>
                    <td className="px-2 py-1.5">Toolbox action item</td>
                    <td className="px-2 py-1.5">shared base + hover bg without text/icon color shift</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-publications-toolbox-divider</code></td>
                    <td className="px-2 py-1.5">Toolbox separator</td>
                    <td className="px-2 py-1.5">single-stroke divider between Generate/Download/Share</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-publications-tools-toggle-open</code></td>
                    <td className="px-2 py-1.5">Tools open state</td>
                    <td className="px-2 py-1.5">persistent active green fill, no border ring</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-publications-tools-toggle-icon</code></td>
                    <td className="px-2 py-1.5">Tools icon motion</td>
                    <td className="px-2 py-1.5">open-state motion transform driven by <code>data-state</code></td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-notification-section</code></td>
                    <td className="px-2 py-1.5">Formal notification wrapper</td>
                    <td className="px-2 py-1.5">reusable section container for system/user state messaging</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-banner</code> + <code>.house-banner-info</code></td>
                    <td className="px-2 py-1.5">Insights hidden box</td>
                    <td className="px-2 py-1.5">notification message surface within the formal wrapper</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-section-tools-publications</code></td>
                    <td className="px-2 py-1.5">Publications scope override</td>
                    <td className="px-2 py-1.5">section-scoped palette and stroke tuning</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-section-tool-button</code></td>
                    <td className="px-2 py-1.5">Shared interactive primitive</td>
                    <td className="px-2 py-1.5">focus ring, interaction motion, shared control metrics</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedNotificationBannersSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Notifications (House Banners)</p>
          <p className="text-xs text-neutral-600">Reusable formal notification format for system and user-state messaging across pages.</p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Visual preview</p>
            <div className="space-y-2">
              <section className="house-notification-section">
                <div className="house-banner house-banner-info">
                  <p>Publication insights hidden by user.</p>
                </div>
              </section>
              <section className="house-notification-section">
                <div className="house-banner house-banner-success">
                  <p>Metrics refreshed successfully.</p>
                </div>
              </section>
              <section className="house-notification-section">
                <div className="house-banner house-banner-warning">
                  <p>Metrics are currently computing. This panel updates automatically.</p>
                </div>
              </section>
              <section className="house-notification-section">
                <div className="house-banner house-banner-danger">
                  <p>Metrics refresh failed. Use Sync Publications to retry.</p>
                </div>
              </section>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class + token mapping</p>
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Element</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">Token touchpoints</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-notification-section</code></td>
                    <td className="px-2 py-1.5">Formal notification wrapper</td>
                    <td className="px-2 py-1.5">reusable section shell with neutral surface, stroke, spacing</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-banner</code></td>
                    <td className="px-2 py-1.5">Notification message container</td>
                    <td className="px-2 py-1.5">bold outline width, radius, spacing, text metrics</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-banner-info</code>, <code>.house-banner-success</code>, <code>.house-banner-warning</code>, <code>.house-banner-danger</code></td>
                    <td className="px-2 py-1.5">Semantic states</td>
                    <td className="px-2 py-1.5">state-specific background, border, and foreground tone tokens</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedTooltipSection() {
  const toolboxTooltipClass =
    'house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Tooltip (Publications)</p>
          <p className="text-xs text-neutral-600">Single approved tooltip pattern for publications actions and chart overlays.</p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Visual preview</p>
            <div className="flex items-center gap-2">
              <div className="group relative inline-flex">
                <button
                  type="button"
                  className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                  aria-label="Generate publication insights report"
                >
                  <FileText className="h-4 w-4" />
                </button>
                <span className={toolboxTooltipClass} aria-hidden="true">Generate report</span>
              </div>
              <div className="group relative inline-flex">
                <button
                  type="button"
                  className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <span className={toolboxTooltipClass} aria-hidden="true">Download</span>
              </div>
              <div className="group relative inline-flex">
                <button
                  type="button"
                  className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                  aria-label="Share"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <span className={toolboxTooltipClass} aria-hidden="true">Share</span>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Class + token mapping</p>
            <div className="overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Element</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">Token touchpoints</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-chart-tooltip</code></td>
                    <td className="px-2 py-1.5">Canonical tooltip surface</td>
                    <td className="px-2 py-1.5">exact same surface token contract used by publication chart hover tooltips</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>toolboxTooltipClass</code></td>
                    <td className="px-2 py-1.5">Placement + motion parity</td>
                    <td className="px-2 py-1.5">left-anchored absolute tooltip, px-2/py-0.5, text-caption, leading-none, same 150ms ease-out hover motion</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedDrilldownMetricTileSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Drilldown Metric Tile</p>
          <p className="text-xs text-neutral-600">Canonical drilldown headline metric tile, documented separately from standard metric tiles.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown metric tile preview</p>
            <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
              <div className="house-drilldown-summary-stat-card">
                <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Total publications</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value-emphasis tabular-nums">150</p>
                </div>
              </div>
              <div className="house-drilldown-summary-stat-card">
                <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Active years</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value tabular-nums">12</p>
                </div>
              </div>
            </div>
          </article>
          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown metric tile (small)</p>
            <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
              <div className="house-drilldown-summary-stat-card-small">
                <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Total publications</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value-emphasis tabular-nums">150</p>
                </div>
              </div>
              <div className="house-drilldown-summary-stat-card-small">
                <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Active years</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value tabular-nums">12</p>
                </div>
              </div>
            </div>
          </article>
          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown metric tile (small) type 2</p>
            <div className="mt-3">
              <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                <p className="leading-relaxed">
                  Novak E<sup className="ml-0.5 text-[0.62rem] leading-none align-super text-muted-foreground">1</sup>, Kim D<sup className="ml-0.5 text-[0.62rem] leading-none align-super text-muted-foreground">2</sup>,{' '}
                  <span className="font-semibold text-[hsl(var(--section-style-profile-accent))]">User LT</span>
                  <sup className="ml-0.5 text-[0.62rem] leading-none align-super text-muted-foreground">1,3</sup>, Fischer L<sup className="ml-0.5 text-[0.62rem] leading-none align-super text-muted-foreground">3</sup>
                </p>
                <div className="mt-2 space-y-1">
                  <p className="house-drilldown-note-soft house-publication-affiliation-line"><sup className="mr-1 text-[0.62rem] leading-none align-super">1</sup>Division of Cardiology, Journal 12 Institute</p>
                  <p className="house-drilldown-note-soft house-publication-affiliation-line"><sup className="mr-1 text-[0.62rem] leading-none align-super">2</sup>Center for Translational Medicine, Northbridge University</p>
                  <p className="house-drilldown-note-soft house-publication-affiliation-line"><sup className="mr-1 text-[0.62rem] leading-none align-super">3</sup>Department of Biostatistics, Midlands Research Hospital</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="house-publication-contribution-leading font-semibold">Leading</span>
                <span className="house-publication-contribution-co-leading font-semibold">Co-leading</span>
                <span className="house-publication-contribution-contributor font-semibold">Contributor</span>
                <span className="house-publication-contribution-senior font-semibold">Senior</span>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown metric tile (abstract content)</p>
            <div className="mt-3 space-y-2">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Aims</p>
              </div>
              <div className="house-drilldown-content-block">
                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                  <p className="leading-relaxed">
                    Four-dimensional flow cardiovascular MRI (4D flow CMR) has emerged as a promising technique for assessing aortic stenosis severity and predicting intervention.
                  </p>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Typography spec</p>
            <div className="mt-3 overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Typography label</th>
                    <th className="px-2 py-1.5 font-semibold">Property</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-title + .house-drilldown-stat-title</code></td>
                    <td className="px-2 py-1.5">0.75rem / 1rem, 600, 0.05em, uppercase (summary class adds centering and min-height layout)</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value</code></td>
                    <td className="px-2 py-1.5">1.2rem / 1.5rem, 600, neutral-800, centered</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value-emphasis</code></td>
                    <td className="px-2 py-1.5">2.275rem / 1.05, 700, neutral-900, centered</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Typography spec (small)</p>
            <div className="mt-3 overflow-hidden rounded-md border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Typography label</th>
                    <th className="px-2 py-1.5 font-semibold">Property</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-card-small</code></td>
                    <td className="px-2 py-1.5">display:flex, flex-direction:column, justify-content:center, align-items:center, min-height:5rem, text-align:center, border:1px solid neutral-900, border-radius:0.375rem, background:surface-drilldown-elevated, box-shadow:inset outline, padding:0.55rem 0.75rem, gap:0.28rem</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-card.house-drilldown-abstract-metric-card</code></td>
                    <td className="px-2 py-1.5">uses metric-tile border/surface tokens, but left-aligns content, removes centered min-height behavior, and applies text-card padding for abstract sections</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-title + .house-drilldown-stat-title</code></td>
                    <td className="px-2 py-1.5">0.75rem / 1rem, 600, 0.05em, uppercase (summary class adds centering and min-height layout)</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value</code></td>
                    <td className="px-2 py-1.5">1.2rem / 1.5rem, 600, neutral-800, centered</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value-emphasis</code></td>
                    <td className="px-2 py-1.5">2.275rem / 1.05, 700, neutral-900, centered</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedTileTogglesSection() {
  const [hMode, setHMode] = useState<'trend' | 'needed'>('trend')
  const thresholds: FieldPercentileThreshold[] = [50, 75, 90, 95, 99]
  const [vMode, setVMode] = useState<FieldPercentileThreshold>(75)

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Tile Toggles</p>
          <p className="text-xs text-neutral-600">Canonical toggle controls for metric tiles (horizontal and vertical).</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="house-metric-tile-shell rounded-md border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Horizontal Toggle (Trend / Citations needed)</p>
            <div className="mt-3 inline-flex items-center">
              <ApprovedHorizontalToggle
                value={hMode}
                options={[
                  { value: 'trend', label: 'Trend' },
                  { value: 'needed', label: 'Citations needed' },
                ]}
                onChange={setHMode}
              />
            </div>
          </article>

          <article className="house-metric-tile-shell rounded-md border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Vertical Toggle (Field Percentile)</p>
            <div className="mt-3">
              <div
                className="house-toggle-track house-field-percentile-toggle-track relative grid w-10 items-stretch"
                style={{
                  gridTemplateRows: `repeat(${thresholds.length}, minmax(0, 1fr))`,
                  minHeight: `${thresholds.length * 1.785}rem`,
                  padding: 0,
                }}
              >
                {thresholds.map((threshold) => (
                  <button
                    key={`approved-v-toggle-${threshold}`}
                    type="button"
                    className={
                      vMode === threshold
                        ? `house-toggle-button house-field-percentile-toggle-button ${FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD[threshold]}`
                        : 'house-toggle-button house-field-percentile-toggle-button house-drilldown-toggle-button-muted'
                    }
                    onClick={() => setVMode(threshold)}
                    aria-pressed={vMode === threshold}
                  >
                    {threshold}
                  </button>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedPublicationTileAnimationsSection() {
  const thresholds: FieldPercentileThreshold[] = [50, 75, 90, 95, 99]
  const [entryScale, setEntryScale] = useState<AnimationLabScale>('compact')
  const [barEntryReplay, setBarEntryReplay] = useState(0)
  const [lineEntryReplay, setLineEntryReplay] = useState(0)
  const [ringEntryReplay, setRingEntryReplay] = useState(0)
  const [fieldShareEntryReplay, setFieldShareEntryReplay] = useState(0)
  const [sameCountEntryReplay, setSameCountEntryReplay] = useState(0)
  const [differentCountEntryReplay, setDifferentCountEntryReplay] = useState(0)
  const [barEntryEnabled, setBarEntryEnabled] = useState(true)
  const [lineEntryEnabled, setLineEntryEnabled] = useState(true)
  const [ringEntryEnabled, setRingEntryEnabled] = useState(true)
  const [fieldShareEntryEnabled, setFieldShareEntryEnabled] = useState(true)
  const [sameCountEntryEnabled, setSameCountEntryEnabled] = useState(true)
  const [differentCountEntryEnabled, setDifferentCountEntryEnabled] = useState(true)
  const [fieldShareMode, setFieldShareMode] = useState<FieldPercentileThreshold>(90)
  const [sameCountDatasetId, setSameCountDatasetId] = useState<string>(ANIMATION_LAB_SAME_COUNT_DATASETS[0].id)
  const [differentCountDatasetId, setDifferentCountDatasetId] = useState<string>(ANIMATION_LAB_DIFFERENT_COUNT_DATASETS[0].id)
  const lineEntryPolylineRef = useRef<SVGPolylineElement>(null)
  const lineEntryDuplicatePolylineRef = useRef<SVGPolylineElement>(null)
  const [lineEntryPathLength, setLineEntryPathLength] = useState(0)
  const [lineEntryDuplicatePathLength, setLineEntryDuplicatePathLength] = useState(0)

  useEffect(() => {
    const replay = () => {
      setBarEntryReplay((previous) => previous + 1)
      setLineEntryReplay((previous) => previous + 1)
      setRingEntryReplay((previous) => previous + 1)
      setFieldShareEntryReplay((previous) => previous + 1)
      setSameCountEntryReplay((previous) => previous + 1)
      setDifferentCountEntryReplay((previous) => previous + 1)
    }

    const frame = window.requestAnimationFrame(replay)
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      replay()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [])

  const entryBars = ANIMATION_LAB_ENTRY_BAR_SERIES_BY_SCALE[entryScale]
  const entryLine = ANIMATION_LAB_ENTRY_LINE_SERIES_BY_SCALE[entryScale]
  const entryRing = ANIMATION_LAB_ENTRY_RING_VALUE_BY_SCALE[entryScale]
  const entryBarAxisMax = Math.max(1, ...entryBars) * 1.16
  const entryBarAxisAnimated = useAnimationLabEasedValue(entryBarAxisMax, `entry-bar-axis-${entryScale}`, 380)
  const entryBarTickValues = ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio) => ratio * entryBarAxisAnimated)
  const entryBarSlots = useMemo(
    () => animationLabToBarSlots({
      bars: entryBars.map((value, index) => ({ key: `entry-${index}`, label: `B${index + 1}`, value })),
      axisMax: entryBarAxisMax,
      slotCount: entryBars.length,
    }),
    [entryBars, entryBarAxisMax],
  )
  const linePoints = useMemo(() => animationLabBuildLinePoints(entryLine), [entryLine])
  const lineMax = Math.max(1, ...entryLine)
  const lineAxisAnimated = useAnimationLabEasedValue(lineMax, `entry-line-axis-${entryScale}`, 380)
  const lineTickValues = ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio) => ratio * lineAxisAnimated)
  const lineCoords = useMemo(
    () => entryLine.map((value, index) => ({
      x: ANIMATION_LAB_CHART_X_PADDING
        + ((ANIMATION_LAB_CHART_WIDTH - (ANIMATION_LAB_CHART_X_PADDING * 2)) * (entryLine.length <= 1 ? 0 : index / (entryLine.length - 1))),
      y: ANIMATION_LAB_CHART_HEIGHT - ((Math.max(0, value) / lineMax) * ANIMATION_LAB_CHART_HEIGHT),
    })),
    [entryLine, lineMax],
  )

  useEffect(() => {
    if (lineEntryPolylineRef.current) {
      try {
        const length = lineEntryPolylineRef.current.getTotalLength()
        setLineEntryPathLength(length)
      } catch {
        setLineEntryPathLength(0)
      }
    }
  }, [linePoints])

  useEffect(() => {
    if (lineEntryDuplicatePolylineRef.current) {
      try {
        const length = lineEntryDuplicatePolylineRef.current.getTotalLength()
        setLineEntryDuplicatePathLength(length)
      } catch {
        setLineEntryDuplicatePathLength(0)
      }
    }
  }, [linePoints])

  const sameCountDataset = useMemo(
    () => animationLabSelectDataset(ANIMATION_LAB_SAME_COUNT_DATASETS, sameCountDatasetId),
    [sameCountDatasetId],
  )
  const sameCountSlots = useMemo(
    () => animationLabToBarSlots({
      bars: sameCountDataset.bars,
      axisMax: sameCountDataset.axisMax,
      slotCount: sameCountDataset.bars.length,
    }),
    [sameCountDataset],
  )
  const sameCountMeanBottom = animationLabMeanBottomPercent(sameCountDataset.mean, sameCountDataset.axisMax)
  const sameCountAxisAnimated = useAnimationLabEasedValue(sameCountDataset.axisMax, `same-count-axis-${sameCountDataset.id}`, 420)
  const sameCountTickValues = ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio) => ratio * sameCountAxisAnimated)

  const differentCountDataset = useMemo(
    () => animationLabSelectDataset(ANIMATION_LAB_DIFFERENT_COUNT_DATASETS, differentCountDatasetId),
    [differentCountDatasetId],
  )
  const differentCountSlots = useMemo(
    () => animationLabToBarSlots({
      bars: differentCountDataset.bars,
      axisMax: differentCountDataset.axisMax,
      slotCount: differentCountDataset.bars.length,
    }),
    [differentCountDataset],
  )
  const differentCountMeanBottom = animationLabMeanBottomPercent(differentCountDataset.mean, differentCountDataset.axisMax)
  const differentCountAxisAnimated = useAnimationLabEasedValue(differentCountDataset.axisMax, `different-count-axis-${differentCountDataset.id}`, 420)
  const differentCountTickValues = ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio) => ratio * differentCountAxisAnimated)

  const ringRadius = 44
  const ringCircumference = 2 * Math.PI * ringRadius
  const entryRingOffset = ringCircumference * (1 - (entryRing / 100))

  const fieldShare = ANIMATION_LAB_FIELD_SHARE_BY_THRESHOLD[fieldShareMode]
  const fieldShareOffset = ringCircumference * (1 - (fieldShare.share / 100))
  const fieldShareRingClass = ANIMATION_LAB_RING_CLASS_BY_THRESHOLD[fieldShareMode]
  const barEntryKey = `bar-${barEntryReplay}`
  const lineEntryKey = `line-${lineEntryReplay}`
  const ringEntryKey = `ring-${ringEntryReplay}`
  const fieldShareEntryKey = `field-share-${fieldShareEntryReplay}`
  const sameCountEntryKey = `same-count-${sameCountEntryReplay}`
  const differentCountEntryKey = `different-count-${differentCountEntryReplay}`
  const barEntryVisible = useAnimationLabEntryVisible(barEntryKey, barEntryEnabled)
  const lineEntryVisible = useAnimationLabEntryVisible(lineEntryKey, lineEntryEnabled)
  const ringEntryVisible = useAnimationLabEntryVisible(ringEntryKey, ringEntryEnabled)
  const fieldShareEntryVisible = useAnimationLabEntryVisible(fieldShareEntryKey, fieldShareEntryEnabled)
  const sameCountEntryVisible = useAnimationLabEntryVisible(sameCountEntryKey, sameCountEntryEnabled)
  const differentCountEntryVisible = useAnimationLabEntryVisible(differentCountEntryKey, differentCountEntryEnabled)
  const barEntryIsEntering = useAnimationLabEntryPhase(barEntryKey, barEntryEnabled)
  const lineEntryIsEntering = useAnimationLabEntryPhase(lineEntryKey, lineEntryEnabled)
  const ringEntryIsEntering = useAnimationLabEntryPhase(ringEntryKey, ringEntryEnabled)
  const fieldShareEntryIsEntering = useAnimationLabEntryPhase(fieldShareEntryKey, fieldShareEntryEnabled)
  const sameCountEntryIsEntering = useAnimationLabEntryPhase(sameCountEntryKey, sameCountEntryEnabled)
  const differentCountEntryIsEntering = useAnimationLabEntryPhase(differentCountEntryKey, differentCountEntryEnabled)
  const barTransitionDurationMs = barEntryVisible
    ? (barEntryIsEntering ? ANIMATION_LAB_ENTRY_SWEEP_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0
  const lineTransitionDurationMs = lineEntryVisible
    ? (lineEntryIsEntering ? ANIMATION_LAB_ENTRY_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0
  const ringTransitionDurationMs = ringEntryVisible
    ? (ringEntryIsEntering ? ANIMATION_LAB_ENTRY_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0
  const fieldShareTransitionDurationMs = fieldShareEntryVisible
    ? (fieldShareEntryIsEntering ? ANIMATION_LAB_ENTRY_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0
  const sameCountTransitionDurationMs = sameCountEntryVisible
    ? (sameCountEntryIsEntering ? ANIMATION_LAB_ENTRY_SWEEP_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0
  const differentCountTransitionDurationMs = differentCountEntryVisible
    ? (differentCountEntryIsEntering ? ANIMATION_LAB_ENTRY_SWEEP_DURATION_MS : ANIMATION_LAB_TOGGLE_MORPH_DURATION_MS)
    : 0

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Publication Tile Animation Lab (Approved Review)</p>
          <p className="text-xs text-neutral-600">Six canonical motion prototypes with populated data, mean-line support, and scale transitions.</p>
        </div>

        <div className="px-4 pt-4">
          <div className="inline-flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Data scale</p>
            <ApprovedHorizontalToggle
              value={entryScale}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'expanded', label: 'Expanded' },
              ]}
              onChange={setEntryScale}
            />
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">1) Entry animation bar chart</p>
              <AnimationLabEntryToggle enabled={barEntryEnabled} onChange={setBarEntryEnabled} />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: zero-baseline bar grow, left-to-right sweep stagger, eased axis roll.</p>
            <div className="mt-1 overflow-x-auto">
              <div className="inline-flex gap-2">
                <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                  {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                    <p
                      key={`entry-bar-y-axis-${ratio}`}
                      className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                      style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                    >
                      {Math.round(entryBarTickValues[index] || 0).toLocaleString('en-GB')}
                    </p>
                  ))}
                </div>
                <div>
                  <div
                    className="relative overflow-hidden rounded-md border"
                    style={{
                      width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                      height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                      borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                      backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                    }}
                  >
                    <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                    <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                    {entryBarSlots.map((bar, index) => (
                      <div
                        key={bar.key}
                        className="house-toggle-chart-bar house-chart-bar-accent absolute bottom-0 rounded-sm"
                        style={{
                          left: `${bar.left}px`,
                          width: `${bar.width}px`,
                          height: `${bar.height}px`,
                          transformOrigin: 'bottom center',
                          transform: `scaleY(${barEntryVisible ? 1 : 0})`,
                          opacity: barEntryVisible ? 1 : 0,
                          transitionProperty: 'transform,opacity,height',
                          transitionDuration: `${barTransitionDurationMs}ms`,
                          transitionTimingFunction: 'var(--motion-ease-chart-series)',
                          transitionDelay: animationLabEntryDelay(index, barEntryVisible && barEntryIsEntering),
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="mt-1 grid gap-1"
                    style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${entryBarSlots.length}, minmax(0,1fr))` }}
                  >
                    {entryBarSlots.map((bar) => (
                      <p key={`${bar.key}-axis`} className="house-chart-axis-text text-center">{bar.label}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: identical duplicate pass for parity checks.</p>
              <div className="mt-1 overflow-x-auto">
                <div className="inline-flex gap-2">
                  <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                    {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                      <p
                        key={`entry-bar-y-axis-duplicate-${ratio}`}
                        className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                        style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                      >
                        {Math.round(entryBarTickValues[index] || 0).toLocaleString('en-GB')}
                      </p>
                    ))}
                  </div>
                  <div>
                    <div
                      className="relative overflow-hidden rounded-md border"
                      style={{
                        width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                        height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                        borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                        backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                      <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                      {entryBarSlots.map((bar, index) => (
                        <div
                          key={`${bar.key}-duplicate`}
                          className="house-toggle-chart-bar house-chart-bar-accent absolute bottom-0 rounded-sm"
                          style={{
                            left: `${bar.left}px`,
                            width: `${bar.width}px`,
                            height: `${bar.height}px`,
                            transformOrigin: 'bottom center',
                            transform: `scaleY(${barEntryVisible ? 1 : 0})`,
                            opacity: barEntryVisible ? 1 : 0,
                            transitionProperty: 'transform,opacity,height',
                            transitionDuration: `${barTransitionDurationMs}ms`,
                            transitionTimingFunction: 'var(--motion-ease-chart-series)',
                            transitionDelay: animationLabEntryDelay(index, barEntryVisible && barEntryIsEntering),
                          }}
                        />
                      ))}
                    </div>
                    <div
                      className="mt-1 grid gap-1"
                      style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${entryBarSlots.length}, minmax(0,1fr))` }}
                    >
                      {entryBarSlots.map((bar) => (
                        <p key={`${bar.key}-axis-duplicate`} className="house-chart-axis-text text-center">{bar.label}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-neutral-600">Axis max {Math.round(entryBarAxisMax).toLocaleString('en-GB')}</p>
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setBarEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">2) Entry animation line chart</p>
              <AnimationLabEntryToggle enabled={lineEntryEnabled} onChange={setLineEntryEnabled} />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: zero-baseline line grow, point co-growth, eased axis roll.</p>
            <div className="mt-1 overflow-x-auto">
              <div className="inline-flex gap-2">
                <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                  {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                    <p
                      key={`entry-line-y-axis-${ratio}`}
                      className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                      style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                    >
                      {Math.round(lineTickValues[index] || 0).toLocaleString('en-GB')}
                    </p>
                  ))}
                </div>
                <div>
                  <svg
                    viewBox={`0 0 ${ANIMATION_LAB_CHART_WIDTH} ${ANIMATION_LAB_CHART_HEIGHT}`}
                    className="rounded-md border"
                    style={{
                      width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                      height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                      borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                      backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                    }}
                  >
                    <line x1={0} y1={0} x2={ANIMATION_LAB_CHART_WIDTH} y2={0} stroke="hsl(var(--stroke-soft) / 0.55)" strokeWidth={1} />
                    <line x1={0} y1={ANIMATION_LAB_CHART_HEIGHT / 2} x2={ANIMATION_LAB_CHART_WIDTH} y2={ANIMATION_LAB_CHART_HEIGHT / 2} stroke="hsl(var(--stroke-soft) / 0.55)" strokeWidth={1} strokeDasharray="4 3" />
                    <line x1={0} y1={ANIMATION_LAB_CHART_HEIGHT} x2={ANIMATION_LAB_CHART_WIDTH} y2={ANIMATION_LAB_CHART_HEIGHT} stroke="hsl(var(--stroke-soft) / 0.72)" strokeWidth={1} />
                    <line x1={0} y1={0} x2={0} y2={ANIMATION_LAB_CHART_HEIGHT} stroke="hsl(var(--stroke-soft) / 0.78)" strokeWidth={1} />
                    <polyline
                      ref={lineEntryPolylineRef}
                      points={linePoints}
                      fill="none"
                      stroke="hsl(var(--tone-accent-400))"
                      strokeWidth="3.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="house-toggle-chart-line"
                      data-expanded={lineEntryVisible ? 'true' : 'false'}
                      style={{
                        '--chart-path-length': lineEntryPathLength || 1,
                        transitionDuration: `${lineTransitionDurationMs}ms`,
                      } as React.CSSProperties}
                    />
                    {lineCoords.map((point, index) => (
                      <circle
                        key={`line-point-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={2.8}
                        fill="hsl(var(--tone-accent-700))"
                        style={{
                          opacity: lineEntryVisible ? 1 : 0,
                          transition: `opacity ${lineTransitionDurationMs}ms var(--motion-ease-chart-series)`,
                        }}
                      />
                    ))}
                  </svg>
                  <div
                    className="mt-1 grid gap-1"
                    style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${ANIMATION_LAB_ENTRY_LINE_LABELS.length}, minmax(0,1fr))` }}
                  >
                    {ANIMATION_LAB_ENTRY_LINE_LABELS.map((label) => (
                      <p key={`line-axis-${label}`} className="house-chart-axis-text text-center">{label}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: identical duplicate pass for parity checks.</p>
              <div className="mt-1 overflow-x-auto">
                <div className="inline-flex gap-2">
                  <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                    {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                      <p
                        key={`entry-line-y-axis-duplicate-${ratio}`}
                        className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                        style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                      >
                        {Math.round(lineTickValues[index] || 0).toLocaleString('en-GB')}
                      </p>
                    ))}
                  </div>
                  <div>
                    <svg
                      viewBox={`0 0 ${ANIMATION_LAB_CHART_WIDTH} ${ANIMATION_LAB_CHART_HEIGHT}`}
                      className="rounded-md border"
                      style={{
                        width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                        height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                        borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                        backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                      }}
                    >
                      <line x1={0} y1={0} x2={ANIMATION_LAB_CHART_WIDTH} y2={0} stroke="hsl(var(--stroke-soft) / 0.55)" strokeWidth={1} />
                      <line x1={0} y1={ANIMATION_LAB_CHART_HEIGHT / 2} x2={ANIMATION_LAB_CHART_WIDTH} y2={ANIMATION_LAB_CHART_HEIGHT / 2} stroke="hsl(var(--stroke-soft) / 0.55)" strokeWidth={1} strokeDasharray="4 3" />
                      <line x1={0} y1={ANIMATION_LAB_CHART_HEIGHT} x2={ANIMATION_LAB_CHART_WIDTH} y2={ANIMATION_LAB_CHART_HEIGHT} stroke="hsl(var(--stroke-soft) / 0.72)" strokeWidth={1} />
                      <line x1={0} y1={0} x2={0} y2={ANIMATION_LAB_CHART_HEIGHT} stroke="hsl(var(--stroke-soft) / 0.78)" strokeWidth={1} />
                      <polyline
                        ref={lineEntryDuplicatePolylineRef}
                        points={linePoints}
                        fill="none"
                        stroke="hsl(var(--tone-accent-400))"
                        strokeWidth="3.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="house-toggle-chart-line"
                        data-expanded={lineEntryVisible ? 'true' : 'false'}
                        style={{
                          '--chart-path-length': lineEntryDuplicatePathLength || 1,
                          transitionDuration: `${lineTransitionDurationMs}ms`,
                        } as React.CSSProperties}
                      />
                      {lineCoords.map((point, index) => (
                        <circle
                          key={`line-point-duplicate-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r={2.8}
                          fill="hsl(var(--tone-accent-700))"
                          style={{
                            opacity: lineEntryVisible ? 1 : 0,
                            transition: `opacity ${lineTransitionDurationMs}ms var(--motion-ease-chart-series)`,
                          }}
                        />
                      ))}
                    </svg>
                    <div
                      className="mt-1 grid gap-1"
                      style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${ANIMATION_LAB_ENTRY_LINE_LABELS.length}, minmax(0,1fr))` }}
                    >
                      {ANIMATION_LAB_ENTRY_LINE_LABELS.map((label) => (
                        <p key={`line-axis-duplicate-${label}`} className="house-chart-axis-text text-center">{label}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-neutral-600">Series peak {Math.max(...entryLine).toLocaleString('en-GB')}</p>
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setLineEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">3) Entry animation ring charge</p>
              <AnimationLabEntryToggle enabled={ringEntryEnabled} onChange={setRingEntryEnabled} />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: radial sweep from zero with fixed -90deg origin.</p>
            <div className="mt-1 flex items-center gap-4">
              <svg viewBox="0 0 120 120" className="h-28 w-28">
                <circle cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="12" className="house-chart-ring-track-svg" />
                <circle
                  cx="60"
                  cy="60"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  className="house-chart-ring-main-svg"
                  style={{
                    strokeDasharray: ringCircumference,
                    strokeDashoffset: ringEntryVisible ? entryRingOffset : ringCircumference,
                    transformOrigin: '60px 60px',
                    transform: 'rotate(-90deg)',
                    transition: ringEntryVisible
                      ? `stroke-dashoffset ${ringTransitionDurationMs}ms var(--motion-ease-chart-series)`
                      : 'none',
                  }}
                />
                <text x="60" y="65" textAnchor="middle" className="house-chart-ring-center-label">{`${entryRing}%`}</text>
              </svg>
              <div>
                <p className="house-chart-axis-title">Ring charge target</p>
                <p className="text-sm font-semibold text-neutral-900">{entryScale === 'compact' ? 'Compact benchmark' : 'Expanded benchmark'}</p>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: identical duplicate pass for parity checks.</p>
              <div className="mt-1 flex items-center gap-4">
                <svg viewBox="0 0 120 120" className="h-28 w-28">
                  <circle cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="12" className="house-chart-ring-track-svg" />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    strokeWidth="12"
                    strokeLinecap="round"
                    className="house-chart-ring-main-svg"
                    style={{
                      strokeDasharray: ringCircumference,
                      strokeDashoffset: ringEntryVisible ? entryRingOffset : ringCircumference,
                      transformOrigin: '60px 60px',
                      transform: 'rotate(-90deg)',
                      transition: ringEntryVisible
                        ? `stroke-dashoffset ${ringTransitionDurationMs}ms var(--motion-ease-chart-series)`
                        : 'none',
                    }}
                  />
                  <text x="60" y="65" textAnchor="middle" className="house-chart-ring-center-label">{`${entryRing}%`}</text>
                </svg>
                <div>
                  <p className="house-chart-axis-title">Ring charge target</p>
                  <p className="text-sm font-semibold text-neutral-900">{entryScale === 'compact' ? 'Compact benchmark' : 'Expanded benchmark'}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setRingEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">4) Ring chart on a toggle</p>
              <AnimationLabEntryToggle enabled={fieldShareEntryEnabled} onChange={setFieldShareEntryEnabled} />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: percentile ring charge with threshold color mapping.</p>
            <div className="mt-1 grid grid-cols-[2.5rem_1fr] items-center gap-3">
              <div
                className="house-toggle-track house-field-percentile-toggle-track relative grid w-10 items-stretch"
                style={{
                  gridTemplateRows: `repeat(${thresholds.length}, minmax(0, 1fr))`,
                  minHeight: `${thresholds.length * 1.78}rem`,
                  padding: 0,
                }}
              >
                {thresholds.map((threshold) => (
                  <button
                    key={`animation-lab-ring-toggle-${threshold}`}
                    type="button"
                    className={
                      fieldShareMode === threshold
                        ? `house-toggle-button house-field-percentile-toggle-button ${FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD[threshold]}`
                        : 'house-toggle-button house-field-percentile-toggle-button house-drilldown-toggle-button-muted'
                    }
                    onClick={() => setFieldShareMode(threshold)}
                    aria-pressed={fieldShareMode === threshold}
                  >
                    {threshold}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 120 120" className="h-24 w-24">
                  <circle cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="11" className="house-chart-ring-track-svg" />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    strokeWidth="11"
                    strokeLinecap="round"
                    className={fieldShareRingClass}
                    style={{
                      strokeDasharray: ringCircumference,
                      strokeDashoffset: fieldShareEntryVisible ? fieldShareOffset : ringCircumference,
                      transformOrigin: '60px 60px',
                      transform: 'rotate(-90deg)',
                      transition: fieldShareEntryVisible
                        ? `stroke-dashoffset ${fieldShareTransitionDurationMs}ms var(--motion-ease-chart-series), stroke ${fieldShareTransitionDurationMs}ms var(--motion-ease-chart-series)`
                        : 'none',
                    }}
                  />
                  <text x="60" y="65" textAnchor="middle" className="house-chart-ring-center-label">{`${fieldShare.papers} papers`}</text>
                </svg>
                <p className="text-sm font-semibold text-neutral-900">{`${fieldShare.share}% at or above ${fieldShareMode}%`}</p>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 460ms toggle morph. Key features: direct ring sweep and stroke-color transition, no stagger.</p>
              <div className="mt-1 grid grid-cols-[2.5rem_1fr] items-center gap-3">
                <div
                  className="house-toggle-track house-field-percentile-toggle-track relative grid w-10 items-stretch"
                  style={{
                    gridTemplateRows: `repeat(${thresholds.length}, minmax(0, 1fr))`,
                    minHeight: `${thresholds.length * 1.78}rem`,
                    padding: 0,
                  }}
                >
                  {thresholds.map((threshold) => (
                    <button
                      key={`animation-lab-ring-toggle-duplicate-${threshold}`}
                      type="button"
                      className={
                        fieldShareMode === threshold
                          ? `house-toggle-button house-field-percentile-toggle-button ${FIELD_PERCENTILE_TOGGLE_ACTIVE_BUTTON_CLASS_BY_THRESHOLD[threshold]}`
                          : 'house-toggle-button house-field-percentile-toggle-button house-drilldown-toggle-button-muted'
                      }
                      onClick={() => setFieldShareMode(threshold)}
                      aria-pressed={fieldShareMode === threshold}
                    >
                      {threshold}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 120 120" className="h-24 w-24">
                    <circle cx="60" cy="60" r={ringRadius} fill="none" strokeWidth="11" className="house-chart-ring-track-svg" />
                    <circle
                      cx="60"
                      cy="60"
                      r={ringRadius}
                      fill="none"
                      strokeWidth="11"
                      strokeLinecap="round"
                      className={fieldShareRingClass}
                      style={{
                        strokeDasharray: ringCircumference,
                        strokeDashoffset: fieldShareEntryVisible ? fieldShareOffset : ringCircumference,
                        transformOrigin: '60px 60px',
                        transform: 'rotate(-90deg)',
                        transition: fieldShareEntryVisible
                          ? `stroke-dashoffset ${fieldShareTransitionDurationMs}ms var(--motion-ease-chart-series), stroke ${fieldShareTransitionDurationMs}ms var(--motion-ease-chart-series)`
                          : 'none',
                      }}
                    />
                    <text x="60" y="65" textAnchor="middle" className="house-chart-ring-center-label">{`${fieldShare.papers} papers`}</text>
                  </svg>
                  <p className="text-sm font-semibold text-neutral-900">{`${fieldShare.share}% at or above ${fieldShareMode}%`}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-neutral-600">Toggle fill and ring stroke both use threshold color tokens.</p>
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setFieldShareEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">5) Bar chart on a toggle (same number of bars)</p>
              <AnimationLabEntryToggle enabled={sameCountEntryEnabled} onChange={setSameCountEntryEnabled} />
            </div>
            <div className="mt-3 inline-flex items-center">
              <ApprovedHorizontalToggle
                value={sameCountDataset.id}
                options={ANIMATION_LAB_SAME_COUNT_DATASETS.map((dataset) => ({
                  value: dataset.id,
                  label: dataset.id === 'rolling' ? 'Prior 4yr' : 'Latest 12m',
                }))}
                onChange={setSameCountDatasetId}
              />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: bar grow from zero, left-to-right sweep, eased axis roll.</p>
            <div className="mt-1 overflow-x-auto">
              <div className="inline-flex gap-2">
                <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                  {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                    <p
                      key={`same-count-y-axis-${ratio}`}
                      className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                      style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                    >
                      {Math.round(sameCountTickValues[index] || 0).toLocaleString('en-GB')}
                    </p>
                  ))}
                </div>
                <div>
                  <div
                    className="relative overflow-hidden rounded-md border"
                    style={{
                      width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                      height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                      borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                      backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                    }}
                  >
                    <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                    <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                    {sameCountMeanBottom !== null ? (
                      <div
                        className="house-chart-mean-line house-toggle-chart-morph absolute left-0 right-0"
                        style={{ bottom: `${sameCountMeanBottom}%`, transitionDuration: `${sameCountTransitionDurationMs}ms` }}
                      />
                    ) : null}
                    {sameCountSlots.map((bar, index) => (
                      <div
                        key={bar.key}
                        className={`house-toggle-chart-bar house-toggle-chart-morph absolute bottom-0 rounded-sm ${index % 2 === 0 ? 'house-chart-bar-accent' : 'house-chart-bar-positive'}`}
                        style={{
                          left: `${bar.left}px`,
                          width: `${bar.width}px`,
                          height: `${bar.height}px`,
                          opacity: sameCountEntryVisible ? 1 : 0,
                          transform: `scaleY(${sameCountEntryVisible ? 1 : 0})`,
                          transformOrigin: 'bottom',
                          transitionProperty: 'left,width,height,opacity,transform',
                          transitionDuration: `${sameCountTransitionDurationMs}ms`,
                          transitionTimingFunction: 'var(--motion-ease-chart-series)',
                          transitionDelay: animationLabEntryDelay(index, sameCountEntryVisible && sameCountEntryIsEntering),
                        }}
                        title={`${bar.label}: ${Math.round(bar.value).toLocaleString('en-GB')}`}
                      />
                    ))}
                  </div>
                  <div
                    className="mt-1 grid gap-1"
                    style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${sameCountSlots.length}, minmax(0,1fr))` }}
                  >
                    {sameCountSlots.map((bar) => (
                      <p key={`${bar.key}-label`} className="house-chart-axis-text text-center">{bar.label}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 460ms chart morph plus 420ms axis roll. Key features: single-pass bar remap with no micro-stagger.</p>
              <div className="mt-1 overflow-x-auto">
                <div className="inline-flex gap-2">
                  <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                    {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                      <p
                        key={`same-count-y-axis-duplicate-${ratio}`}
                        className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                        style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                      >
                        {Math.round(sameCountTickValues[index] || 0).toLocaleString('en-GB')}
                      </p>
                    ))}
                  </div>
                  <div>
                    <div
                      className="relative overflow-hidden rounded-md border"
                      style={{
                        width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                        height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                        borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                        backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                      <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                      {sameCountMeanBottom !== null ? (
                        <div
                          className="house-chart-mean-line house-toggle-chart-morph absolute left-0 right-0"
                          style={{ bottom: `${sameCountMeanBottom}%`, transitionDuration: `${sameCountTransitionDurationMs}ms` }}
                        />
                      ) : null}
                      {sameCountSlots.map((bar, index) => (
                        <div
                          key={`${bar.key}-duplicate`}
                          className={`house-toggle-chart-bar house-toggle-chart-morph absolute bottom-0 rounded-sm ${index % 2 === 0 ? 'house-chart-bar-accent' : 'house-chart-bar-positive'}`}
                          style={{
                            left: `${bar.left}px`,
                            width: `${bar.width}px`,
                            height: `${bar.height}px`,
                            opacity: sameCountEntryVisible ? 1 : 0,
                            transform: `scaleY(${sameCountEntryVisible ? 1 : 0})`,
                            transformOrigin: 'bottom',
                            transitionProperty: 'left,width,height,opacity,transform',
                            transitionDuration: `${sameCountTransitionDurationMs}ms`,
                            transitionTimingFunction: 'var(--motion-ease-chart-series)',
                            transitionDelay: animationLabEntryDelay(index, sameCountEntryVisible && sameCountEntryIsEntering),
                          }}
                          title={`${bar.label}: ${Math.round(bar.value).toLocaleString('en-GB')}`}
                        />
                      ))}
                    </div>
                    <div
                      className="mt-1 grid gap-1"
                      style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${sameCountSlots.length}, minmax(0,1fr))` }}
                    >
                      {sameCountSlots.map((bar) => (
                        <p key={`${bar.key}-label-duplicate`} className="house-chart-axis-text text-center">{bar.label}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-600">
              {`${sameCountDataset.label}; axis ${sameCountDataset.axisMax.toLocaleString('en-GB')}, mean ${Math.round(sameCountDataset.mean || 0).toLocaleString('en-GB')}.`}
            </p>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setSameCountEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">6) Bar chart on a toggle (different number of bars)</p>
              <AnimationLabEntryToggle enabled={differentCountEntryEnabled} onChange={setDifferentCountEntryEnabled} />
            </div>
            <div className="mt-3 inline-flex items-center">
              <ApprovedHorizontalToggle
                value={differentCountDataset.id}
                options={ANIMATION_LAB_DIFFERENT_COUNT_DATASETS.map((dataset) => ({
                  value: dataset.id,
                  label: dataset.id === 'annual-5' ? 'Annual' : 'Quarterly',
                }))}
                onChange={setDifferentCountDatasetId}
              />
            </div>
            <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Entry</p>
            <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 1,000ms motion. Key features: bar grow from zero, left-to-right sweep, eased axis roll.</p>
            <div className="mt-1 overflow-x-auto">
              <div className="inline-flex gap-2">
                <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                  {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                    <p
                      key={`different-count-y-axis-${ratio}`}
                      className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                      style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                    >
                      {Math.round(differentCountTickValues[index] || 0).toLocaleString('en-GB')}
                    </p>
                  ))}
                </div>
                <div>
                  <div
                    className="relative overflow-hidden rounded-md border"
                    style={{
                      width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                      height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                      borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                      backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                    }}
                  >
                    <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                    <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                    <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                    {differentCountMeanBottom !== null ? (
                      <div
                        className="house-chart-mean-line house-toggle-chart-morph absolute left-0 right-0"
                        style={{ bottom: `${differentCountMeanBottom}%`, transitionDuration: `${differentCountTransitionDurationMs}ms` }}
                      />
                    ) : null}
                    {differentCountSlots.map((bar, index) => (
                      <div
                        key={`different-${index}`}
                        className={`house-toggle-chart-bar house-toggle-chart-morph absolute bottom-0 rounded-sm ${index % 2 === 0 ? 'house-chart-bar-warning' : 'house-chart-bar-accent'}`}
                        style={{
                          left: `${bar.left}px`,
                          width: `${bar.width}px`,
                          height: `${bar.height}px`,
                          opacity: differentCountEntryVisible ? 1 : 0,
                          transform: `scaleY(${differentCountEntryVisible ? 1 : 0})`,
                          transformOrigin: 'bottom',
                          transitionProperty: 'left,width,height,opacity,transform',
                          transitionDuration: `${differentCountTransitionDurationMs}ms`,
                          transitionTimingFunction: 'var(--motion-ease-chart-series)',
                          transitionDelay: animationLabEntryDelay(index, differentCountEntryVisible && differentCountEntryIsEntering),
                        }}
                        title={`${bar.label}: ${Math.round(bar.value).toLocaleString('en-GB')}`}
                      />
                    ))}
                  </div>
                  <div
                    className="mt-1 grid gap-1"
                    style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${differentCountSlots.length}, minmax(0,1fr))` }}
                  >
                    {differentCountSlots.map((bar, index) => (
                      <p key={`different-axis-${index}`} className="house-chart-axis-text text-center">{bar.label}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-200 pt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-neutral-500">Duplicate</p>
              <p className="mt-1 text-[0.68rem] text-neutral-600">Total duration: 460ms chart morph plus 420ms axis roll. Key features: direct bar-count reflow with no reserved empty slots.</p>
              <div className="mt-1 overflow-x-auto">
                <div className="inline-flex gap-2">
                  <div className="relative h-[120px] min-w-[2.45rem]" aria-hidden="true">
                    {ANIMATION_LAB_Y_AXIS_TICK_RATIOS.map((ratio, index) => (
                      <p
                        key={`different-count-y-axis-duplicate-${ratio}`}
                        className="house-chart-axis-text house-chart-scale-tick absolute right-0 whitespace-nowrap leading-none"
                        style={{ bottom: `calc(${Math.max(0, Math.min(100, ratio * 100))}% - 0.4rem)` }}
                      >
                        {Math.round(differentCountTickValues[index] || 0).toLocaleString('en-GB')}
                      </p>
                    ))}
                  </div>
                  <div>
                    <div
                      className="relative overflow-hidden rounded-md border"
                      style={{
                        width: `${ANIMATION_LAB_CHART_WIDTH}px`,
                        height: `${ANIMATION_LAB_CHART_HEIGHT}px`,
                        borderColor: 'hsl(var(--stroke-soft) / 0.88)',
                        backgroundColor: 'hsl(var(--tone-neutral-50) / 0.92)',
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 border-l border-[hsl(var(--stroke-soft)/0.78)]" />
                      <div className="absolute inset-x-0 top-0 border-t border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-1/2 border-t border-dashed border-[hsl(var(--stroke-soft)/0.55)]" />
                      <div className="absolute inset-x-0 bottom-0 border-t border-[hsl(var(--stroke-soft)/0.72)]" />
                      {differentCountMeanBottom !== null ? (
                        <div
                          className="house-chart-mean-line house-toggle-chart-morph absolute left-0 right-0"
                          style={{ bottom: `${differentCountMeanBottom}%`, transitionDuration: `${differentCountTransitionDurationMs}ms` }}
                        />
                      ) : null}
                      {differentCountSlots.map((bar, index) => (
                        <div
                          key={`different-duplicate-${index}`}
                          className={`house-toggle-chart-bar house-toggle-chart-morph absolute bottom-0 rounded-sm ${index % 2 === 0 ? 'house-chart-bar-warning' : 'house-chart-bar-accent'}`}
                          style={{
                            left: `${bar.left}px`,
                            width: `${bar.width}px`,
                            height: `${bar.height}px`,
                            opacity: differentCountEntryVisible ? 1 : 0,
                            transform: `scaleY(${differentCountEntryVisible ? 1 : 0})`,
                            transformOrigin: 'bottom',
                            transitionProperty: 'left,width,height,opacity,transform',
                            transitionDuration: `${differentCountTransitionDurationMs}ms`,
                            transitionTimingFunction: 'var(--motion-ease-chart-series)',
                            transitionDelay: animationLabEntryDelay(index, differentCountEntryVisible && differentCountEntryIsEntering),
                          }}
                          title={`${bar.label}: ${Math.round(bar.value).toLocaleString('en-GB')}`}
                        />
                      ))}
                    </div>
                    <div
                      className="mt-1 grid gap-1"
                      style={{ width: `${ANIMATION_LAB_CHART_WIDTH}px`, gridTemplateColumns: `repeat(${differentCountSlots.length}, minmax(0,1fr))` }}
                    >
                      {differentCountSlots.map((bar, index) => (
                        <p key={`different-axis-duplicate-${index}`} className="house-chart-axis-text text-center">{bar.label}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-600">
              {`${differentCountDataset.label}; axis ${differentCountDataset.axisMax.toLocaleString('en-GB')}, mean ${Math.round(differentCountDataset.mean || 0).toLocaleString('en-GB')}. Slots stay chart-area anchored while count and scale change.`}
            </p>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700"
                onClick={() => setDifferentCountEntryReplay((previous) => previous + 1)}
              >
                Replay
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ProviderIcon({ provider }: { provider: 'orcid' | 'google' | 'microsoft' }) {
  if (provider === 'orcid') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#A6CE39" />
          <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="10.6"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            letterSpacing="-0.25"
            fill="#FFFFFF"
          >
            iD
          </text>
        </svg>
      </span>
    )
  }

  if (provider === 'google') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.46a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.64z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3a7.16 7.16 0 0 1-10.66-3.76H1.43v3.09A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.42 14.33a7.2 7.2 0 0 1 0-4.66V6.58H1.43a12 12 0 0 0 0 10.84l3.99-3.09z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.43 6.58l3.99 3.09A7.16 7.16 0 0 1 12 4.77z" />
        </svg>
      </span>
    )
  }

  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </svg>
    </span>
  )
}

function ApprovedPublicationAnimationSpecSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Publication Tile Animation Spec</p>
          <p className="text-xs text-neutral-600">Source of truth for publication tile animation primitives and per-tile class mapping.</p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-700">
                <th className="px-2 py-2 font-semibold">Primitive class</th>
                <th className="px-2 py-2 font-semibold">Target element</th>
                <th className="px-2 py-2 font-semibold">Transition properties</th>
                <th className="px-2 py-2 font-semibold">Duration token</th>
                <th className="px-2 py-2 font-semibold">Easing token</th>
                <th className="px-2 py-2 font-semibold">Used by tiles</th>
              </tr>
            </thead>
            <tbody>
              {PUBLICATION_ANIMATION_SPEC_ROWS.map((row) => (
                <tr key={row.primitive} className="border-b border-neutral-100 align-top text-neutral-700">
                  <td className="px-2 py-2 font-mono">{row.primitive}</td>
                  <td className="px-2 py-2">{row.target}</td>
                  <td className="px-2 py-2 font-mono">{row.transitionProperties}</td>
                  <td className="px-2 py-2 font-mono">{row.durationToken}</td>
                  <td className="px-2 py-2 font-mono">{row.easingToken}</td>
                  <td className="px-2 py-2">{row.usedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-neutral-200 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Per-tile mapping (production)</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-700">
                  <th className="px-2 py-2 font-semibold">Tile key</th>
                  <th className="px-2 py-2 font-semibold">Tile label</th>
                  <th className="px-2 py-2 font-semibold">Component</th>
                  <th className="px-2 py-2 font-semibold">Entry classes</th>
                  <th className="px-2 py-2 font-semibold">Toggle classes</th>
                  <th className="px-2 py-2 font-semibold">Series classes</th>
                </tr>
              </thead>
              <tbody>
                {PUBLICATION_TILE_ANIMATION_MAPPING_ROWS.map((row) => (
                  <tr key={row.tileKey} className="border-b border-neutral-100 align-top text-neutral-700">
                    <td className="px-2 py-2 font-mono">{row.tileKey}</td>
                    <td className="px-2 py-2">{row.tileLabel}</td>
                    <td className="px-2 py-2 font-mono">{row.component}</td>
                    <td className="px-2 py-2 font-mono">{row.entryClasses}</td>
                    <td className="px-2 py-2 font-mono">{row.toggleClasses}</td>
                    <td className="px-2 py-2 font-mono">{row.seriesClasses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

const approvedIcons: IconOption[] = [
  {
    id: 'icon-mail',
    label: 'Mail',
    description: 'Input and communication icon',
    icon: <Mail className="h-5 w-5" />,
  },
  {
    id: 'icon-key',
    label: 'Key',
    description: 'Security / credentials context',
    icon: <KeyRound className="h-5 w-5" />,
  },
  {
    id: 'icon-search',
    label: 'Search',
    description: 'Search field affordance',
    icon: <Search className="h-5 w-5" />,
  },
  {
    id: 'icon-eye',
    label: 'Show',
    description: 'Password reveal control',
    icon: <Eye className="h-5 w-5" />,
  },
  {
    id: 'icon-eye-off',
    label: 'Hide',
    description: 'Password conceal control',
    icon: <EyeOff className="h-5 w-5" />,
  },
  {
    id: 'icon-user',
    label: 'User',
    description: 'Profile context',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'icon-settings',
    label: 'Settings',
    description: 'Admin utility',
    icon: <Settings className="h-5 w-5" />,
  },
  {
    id: 'icon-menu',
    label: 'Menu',
    description: 'Navigation toggle',
    icon: <Menu className="h-5 w-5" />,
  },
]

type ApprovedSectionDescriptor = {
  id: string
  shortLabel: string
  title: string
  summary: string
  chipClassName: string
}

const APPROVED_SECTION_DESCRIPTORS: ApprovedSectionDescriptor[] = [
  {
    id: 'foundations',
    shortLabel: '1. Foundations',
    title: 'Foundations',
    summary: 'Layout anchor, markers, typography, auth shell, and global structure contracts.',
    chipClassName: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  {
    id: 'interactions',
    shortLabel: '2. Interactions',
    title: 'Interaction patterns',
    summary: 'Toolbars, controls, tables, banners, and tooltip behavior standards.',
    chipClassName: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  {
    id: 'drilldown-system',
    shortLabel: '3. Drilldown',
    title: 'Drilldown system',
    summary: 'Right-sheet architecture, tab shell, and publication drilldown contracts.',
    chipClassName: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  {
    id: 'tiles-toggles',
    shortLabel: '4. Tiles',
    title: 'Metric tiles and toggles',
    summary: 'Tile shell variants, toggle controls, and supporting chart composition.',
    chipClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    id: 'animation-specs',
    shortLabel: '5. Animation',
    title: 'Animation specifications',
    summary: 'Animation labs and formal class/token mappings for production parity.',
    chipClassName: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  {
    id: 'nav-shells',
    shortLabel: '6. Nav shells',
    title: 'Navigation shells',
    summary: 'Canonical left panel shells across workspace, inbox, and profile surfaces.',
    chipClassName: 'border-slate-200 bg-slate-50 text-slate-800',
  },
  {
    id: 'buttons-icons',
    shortLabel: '7. Buttons and icons',
    title: 'Buttons and icons',
    summary: 'Approved interaction icons and button composition patterns.',
    chipClassName: 'border-violet-200 bg-violet-50 text-violet-800',
  },
]

function ApprovedSourceOfTruthBanner() {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-emerald-800">
          Visual source of truth
        </span>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-700">
          Approved-only surface
        </span>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        This story is the canonical visual contract for implementation. New explorations belong in non-approved stories; this page should only reflect settled decisions.
      </p>
      <ul className="mt-3 grid gap-1 text-xs text-neutral-600 sm:grid-cols-3">
        <li>Design role: define and approve visual behavior here.</li>
        <li>Engineering role: match production to this approved reference.</li>
        <li>Review role: verify parity and update this story when contracts change.</li>
      </ul>
    </section>
  )
}

function ApprovedSectionIndex() {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-neutral-600">Section map</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {APPROVED_SECTION_DESCRIPTORS.map((section) => (
          <a
            key={`index-${section.id}`}
            href={`#${section.id}`}
            className="rounded-md border border-neutral-200 bg-neutral-50 p-3 transition-colors hover:bg-white"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">{section.shortLabel}</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{section.title}</p>
            <p className="mt-1 text-xs text-neutral-600">{section.summary}</p>
          </a>
        ))}
      </div>
    </section>
  )
}

function ProviderIconSection() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold text-neutral-900">OAuth identity providers</p>
          <p className="text-xs text-neutral-600 mt-1">Starting approved logo set for auth buttons.</p>
          <div className="mt-3 flex gap-2">
            <ProviderIcon provider="orcid" />
            <ProviderIcon provider="google" />
            <ProviderIcon provider="microsoft" />
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold text-neutral-900">Interface icons</p>
          <p className="text-xs text-neutral-600 mt-1">General-purpose icons used in approved interfaces.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {approvedIcons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                className="approved-icon-chip"
                title={`${icon.label}: ${icon.description}`}
                aria-label={icon.label}
              >
                {icon.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold text-neutral-900">State behavior preview</p>
        <p className="text-xs text-neutral-600 mt-1">Default, hover, focus, active, and toggled-on icon states.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="approved-icon-chip" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-hover" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-focus" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-active" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <button
            type="button"
            className="approved-icon-chip"
            data-state={isPasswordVisible ? 'on' : 'off'}
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((previous) => !previous)}
            title="Eye icon toggle"
          >
            <span className="approved-icon-swap" aria-hidden>
              <Eye className="approved-icon-on h-5 w-5" />
              <EyeOff className="approved-icon-off h-5 w-5" />
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold text-neutral-900">Icon naming and usage</p>
        <p className="text-sm text-neutral-700 mt-2">
          Use token-driven sizing and semantic labels for accessibility. Current approved size baseline for inline controls: 20px (h-5/w-5).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {approvedIcons.map((icon) => (
            <article key={`${icon.id}-item`} className="rounded-md border border-neutral-100 p-3">
              <p className="text-xs font-medium text-neutral-900">{icon.label}</p>
              <p className="text-xs text-neutral-600">{icon.description}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function ApprovedIconsSection() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="px-4 py-2 border-b border-neutral-200">
        <p className="text-sm font-semibold text-neutral-900">Approved Icons</p>
        <p className="text-xs text-neutral-600">Canonical icon definitions for reuse in future approved stories.</p>
      </div>
      <div className="p-4">
        <ProviderIconSection />
      </div>
    </div>
  )
}

function ApprovedPage() {
  return (
    <div id="top" className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl space-y-10 p-4">
        <section className="rounded-xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">Design system reference</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">Approved Library</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Canonical production patterns, tokens, and interaction contracts. Sections are grouped by foundations, interactions, drilldown architecture, tile systems, and animation specifications.</p>
        </section>

        <ApprovedSourceOfTruthBanner />
        <ApprovedSectionIndex />

        <section className="sticky top-2 z-20 rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-neutral-600">Quick navigation</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {APPROVED_SECTION_DESCRIPTORS.map((section) => (
              <a
                key={`quick-nav-${section.id}`}
                href={`#${section.id}`}
                className={`rounded border px-2 py-1 font-semibold ${section.chipClassName}`}
              >
                {section.shortLabel}
              </a>
            ))}
            <a href="#top" className="ml-auto rounded border border-neutral-300 bg-neutral-50 px-2 py-1 font-semibold text-neutral-700">Back to top</a>
          </div>
        </section>

        <section id="foundations" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-sky-200 border-l-4 border-l-sky-500 bg-sky-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">1. Foundations</h2>
            <p className="mt-1 text-sm text-neutral-600">Global shell, marker standards, layout positioning, typography, and auth surface references.</p>
          </div>
          <ApprovedHeaderBar />
          <ApprovedMarkersSection />
          <ApprovedDividersSection />
          <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-3" open>
            <summary className="cursor-pointer text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-neutral-700">Reference tables: layout + typography</summary>
            <div className="mt-3 grid gap-4 grid-cols-2">
              <ApprovedLayoutTitlePositioning />
              <ApprovedTypographySection />
            </div>
          </details>
          <AuthPagePanel />
        </section>

        <section id="interactions" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">2. Interaction patterns</h2>
            <p className="mt-1 text-sm text-neutral-600">Toolbars, insight controls, tooltips, and notification surfaces for consistent behavior.</p>
          </div>
          <ApprovedMetricsToolbarSection />
          <ApprovedInsightsControlSection />
          <ApprovedDefaultPublicationTableSection />
          <ApprovedTooltipSection />
          <ApprovedNotificationBannersSection />
        </section>

          <section id="drilldown-system" className="scroll-mt-24 space-y-4">
            <div className="rounded-lg border border-teal-200 border-l-4 border-l-teal-500 bg-teal-50 p-4">
              <h2 className="text-2xl font-bold tracking-tight text-neutral-900">3. Publications drilldown system</h2>
              <p className="mt-1 text-sm text-neutral-600">Drilldown block contracts, navigation flow, headline tiles, and approved source-of-truth chart behavior.</p>
            </div>
          <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-3" open>
            <summary className="cursor-pointer text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-neutral-700">Reference-heavy drilldown architecture</summary>
            <div className="mt-3 overflow-x-auto">
              <div className="grid min-w-[1180px] grid-cols-2 gap-4 items-start">
                <ApprovedPublicationsDrilldownSection />
                <ApprovedPublicationLibraryDrilldownSection />
              </div>
            </div>
          </details>
          <ApprovedDrilldownMetricTileSection />
          <ApprovedDrilldownApprovedChartSection />
        </section>

        <section id="tiles-toggles" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">4. Metric tiles and toggles</h2>
            <p className="mt-1 text-sm text-neutral-600">Base tile patterns and toggle controls used by publication metric surfaces.</p>
          </div>
          <ApprovedMetricTilesSection />
          <ApprovedTileTogglesSection />
        </section>

        <section id="animation-specs" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-rose-200 border-l-4 border-l-rose-500 bg-rose-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">5. Animation specifications</h2>
            <p className="mt-1 text-sm text-neutral-600">Visual animation labs and formal production class mappings for publication tiles.</p>
          </div>
          <ApprovedPublicationTileAnimationsSection />
          <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <summary className="cursor-pointer text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-neutral-700">Animation specification tables</summary>
            <div className="mt-3">
              <ApprovedPublicationAnimationSpecSection />
            </div>
          </details>
        </section>

        <section id="nav-shells" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-slate-200 border-l-4 border-l-slate-500 bg-slate-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">6. Navigation shells</h2>
            <p className="mt-1 text-sm text-neutral-600">Left-panel canonical shells across workspace, inbox, and profile.</p>
          </div>
          <ApprovedLeftPanel />
        </section>

        <section id="buttons-icons" className="scroll-mt-24 space-y-4">
          <div className="rounded-lg border border-violet-200 border-l-4 border-l-violet-500 bg-violet-50 p-4">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">7. Buttons and icons</h2>
            <p className="mt-1 text-sm text-neutral-600">Canonical button and icon references used by approved interaction surfaces.</p>
          </div>
          <ApprovedButtonsSection />
          <ApprovedUserBadgesSection />
          <ApprovedIconsSection />
        </section>
      </div>
    </div>
  )
}

export const Approved: Story = {
  render: () => <ApprovedPage />,
}




import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Download, Eye, EyeOff, FileText, KeyRound, Mail, Menu, Search, Settings, Share2, User } from 'lucide-react'

import { AuthPage } from '@/pages/auth-page'
import { TopBar } from '@/components/layout/top-bar'
import { AccountNavigator } from '@/components/layout/account-navigator'
import { WorkspaceNavigator } from '@/components/layout/workspace-navigator'

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

function AnimationLabEntryToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="house-toggle-track grid-cols-2">
      <span
        className="house-toggle-thumb"
        style={buildTileToggleThumbStyle(enabled ? 0 : 1, 2)}
        aria-hidden="true"
      />
      <button
        type="button"
        className={enabled ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
        onClick={() => onChange(true)}
        aria-pressed={enabled}
      >
        Entry
      </button>
      <button
        type="button"
        className={!enabled ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
        onClick={() => onChange(false)}
        aria-pressed={!enabled}
      >
        Static
      </button>
    </div>
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
  const [activeDrilldownTab, setActiveDrilldownTab] = useState<'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'>('summary')

  const headlineResultTiles = [
    { id: 'total-publications', label: 'Total publications', value: '150', emphasize: true },
    { id: 'active-years', label: 'Active years', value: '12', emphasize: false },
    { id: 'mean-per-year', label: 'Mean per year', value: '13', emphasize: false },
    { id: 'latest-year-count', label: 'Latest year count', value: '11', emphasize: false },
  ] as const

  const drilldownTabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'trajectory', label: 'Trajectory' },
    { id: 'context', label: 'Context' },
    { id: 'methods', label: 'Methods' },
  ] as const

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Publications Tile Drilldown</p>
          <p className="text-xs text-neutral-600">Canonical publications metric drilldown panel showing summary stats and typography with horizontal tab navigation.</p>
        </div>
        <div className="bg-card p-4">
          <div className="max-w-4xl rounded-md border border-border bg-background overflow-hidden">
            {/* Tab Content */}
            <div className="p-4">
              <div className="house-drilldown-title-block house-left-border house-left-border-publications">
                <p className="house-drilldown-title">Total publication insights</p>
                <p className="house-drilldown-title-expander">Your publication records</p>
              </div>

              <div className="house-drilldown-heading-block gap-1 mb-2 bg-card p-2 rounded-sm">
                {drilldownTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDrilldownTab(tab.id as typeof activeDrilldownTab)}
                    className={`house-nav-item approved-drilldown-nav-item flex-1 ${activeDrilldownTab === tab.id ? 'approved-drilldown-nav-item-active' : ''}`}
                    type="button"
                  >
                    <span className="house-nav-item-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="house-drilldown-content-block house-publications-drilldown-stack-3">
                {activeDrilldownTab === 'summary' ? (
                  <>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-publications-drilldown-headline-results">Headline results</p>
                      <div className="house-drilldown-summary-stats-grid">
                        {headlineResultTiles.map((tile) => (
                          <div key={tile.id} className="house-drilldown-summary-stat-card">
                            <p className="house-drilldown-summary-stat-title">{tile.label}</p>
                            <div className="house-drilldown-summary-stat-value-wrap">
                              <p className={`${tile.emphasize ? 'house-drilldown-summary-stat-value-emphasis' : 'house-drilldown-summary-stat-value'} tabular-nums`}>
                                {tile.value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="house-drilldown-subheading-block">
                      <p className="house-drilldown-overline">Publication trends over time</p>
                      <div className="house-publications-drilldown-stack-2">
                        <div className="house-drilldown-row"><span>2024</span><span className="house-drilldown-note">11 publications</span></div>
                        <div className="house-drilldown-row"><span>2023</span><span className="house-drilldown-note">14 publications</span></div>
                        <div className="house-drilldown-row"><span>2022</span><span className="house-drilldown-note">12 publications</span></div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeDrilldownTab === 'breakdown' ? (
                  <>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-publications-drilldown-headline-results">Headline results</p>
                      <p className="house-drilldown-note">150 publications across 12 active years</p>
                    </div>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-drilldown-overline">Publication count by year</p>
                      <div className="house-publications-drilldown-stack-2">
                        <div className="house-drilldown-row"><span>2024</span><span className="house-drilldown-note">11</span></div>
                        <div className="house-drilldown-row"><span>2023</span><span className="house-drilldown-note">14</span></div>
                        <div className="house-drilldown-row"><span>2022</span><span className="house-drilldown-note">12</span></div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeDrilldownTab === 'trajectory' ? (
                  <>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-publications-drilldown-headline-results">Headline results</p>
                      <p className="house-drilldown-note">YoY delta -3 publications</p>
                    </div>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-drilldown-overline">Year-over-year trajectory</p>
                      <div className="house-publications-drilldown-stack-2">
                        <div className="house-drilldown-row"><span>2024 vs 2023</span><span className="house-drilldown-note">-3</span></div>
                        <div className="house-drilldown-row"><span>2023 vs 2022</span><span className="house-drilldown-note">+2</span></div>
                        <div className="house-drilldown-row"><span>2022 vs 2021</span><span className="house-drilldown-note">+1</span></div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeDrilldownTab === 'context' ? (
                  <>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-publications-drilldown-headline-results">Headline results</p>
                      <p className="house-drilldown-note">150 publication records with 12 known publication years</p>
                    </div>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-drilldown-overline">Top publication venues</p>
                      <div className="house-publications-drilldown-stack-2">
                        <div className="house-drilldown-row"><span>Nature</span><span className="house-drilldown-note">18</span></div>
                        <div className="house-drilldown-row"><span>Science</span><span className="house-drilldown-note">12</span></div>
                        <div className="house-drilldown-row"><span>Cell</span><span className="house-drilldown-note">10</span></div>
                      </div>
                    </div>
                  </>
                ) : null}

                {activeDrilldownTab === 'methods' ? (
                  <>
                    <div className="house-drilldown-subheading-block">
                      <p className="house-publications-drilldown-headline-results">Headline results</p>
                      <p className="house-drilldown-note">Method metadata for total publication insights.</p>
                    </div>
                    <div className="house-drilldown-subheading-block house-drilldown-note">
                      <p><strong>Formula:</strong> Count of indexed publications linked to the profile.</p>
                      <p><strong>Definition:</strong> Total number of scholarly works across the publication history.</p>
                      <p><strong>Data sources:</strong> OpenAlex, profile-linked records</p>
                      <p><strong>Update frequency:</strong> Daily</p>
                      <p><strong>Confidence:</strong> 0.92</p>
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

            <div className="rounded-md border border-neutral-200 p-2">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Block map</p>
              <div className="space-y-1.5">
                <div className="house-main-title-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Title block</p>
                  <p className="house-title">Page title</p>
                  <p className="house-title-expander">Title expander</p>
                </div>
                <div className="house-main-heading-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Heading block</p>
                  <p className="house-section-title">Section heading</p>
                </div>
                <div className="house-main-subheading-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Subheading block</p>
                  <p className="house-text">Subheading row</p>
                </div>
                <div className="house-main-content-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Content block</p>
                  <p className="house-text">Main content area</p>
                </div>
              </div>
            </div>

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
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block</code></td><td className="px-2 py-1.5">flex column · align-start · gap 0.2rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-heading-block</code></td><td className="px-2 py-1.5">flex wrap · align-center · justify-between · gap 0.5rem · py 0.375rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-subheading-block</code></td><td className="px-2 py-1.5">flex wrap · align-baseline · justify-between · gap 0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block</code></td><td className="px-2 py-1.5">flex column · min-width 0</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-page-header</code></td><td className="px-2 py-1.5">flex column · gap 0.2rem</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Spacing relationships</th>
                      <th className="px-2 py-1.5 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block + .house-main-heading-block</code></td><td className="px-2 py-1.5">0.72rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-title-block + .house-section-anchor .house-main-heading-block:first-child</code></td><td className="px-2 py-1.5">0.72rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-heading-block + .house-main-content-block</code></td><td className="px-2 py-1.5">0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-subheading-block + .house-main-content-block</code></td><td className="px-2 py-1.5">0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block + .house-main-content-block</code></td><td className="px-2 py-1.5">2rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-main-content-block + .house-main-subheading-block</code></td><td className="px-2 py-1.5">2rem</td></tr>
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
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-neutral-600">Block map</p>
              <div className="space-y-1.5">
                <div className="house-drilldown-title-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Title block</p>
                  <p className="house-drilldown-title">Drilldown title</p>
                  <p className="house-drilldown-title-expander">Drilldown expander</p>
                </div>
                <div className="house-drilldown-heading-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Heading block</p>
                  <p className="house-drilldown-section-label">Tab row / key controls</p>
                </div>
                <div className="house-drilldown-subheading-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Subheading block</p>
                  <p className="house-drilldown-overline">Section overline</p>
                </div>
                <div className="house-drilldown-content-block rounded-sm border border-neutral-200 bg-muted/30 p-2">
                  <p className="house-field-helper">Content block</p>
                  <p className="house-drilldown-note-soft">Drilldown content area</p>
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
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title</code></td><td className="px-2 py-1.5">1.5rem / 1.86rem · 500 · 0.01em</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-expander</code></td><td className="px-2 py-1.5">0.875rem / 1.25rem · 400</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-overline</code></td><td className="px-2 py-1.5">0.8125rem / 1.2rem · 600 · 0.08em · uppercase</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-title</code></td><td className="px-2 py-1.5">0.6875rem / 0.95rem · 600 · 0.07em · uppercase</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value</code></td><td className="px-2 py-1.5">1.5rem / 1.62rem · 500 · tabular-nums</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Layout blocks</th><th className="px-2 py-1.5 font-semibold">Properties</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-block</code></td><td className="px-2 py-1.5">flex column · align-start · gap 0.25rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-heading-block</code></td><td className="px-2 py-1.5">flex wrap · align-center · justify-between · gap 0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block</code></td><td className="px-2 py-1.5">flex wrap · align-baseline · justify-between · gap 0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-content-block</code></td><td className="px-2 py-1.5">flex column · min-width 0</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-700">
                    <tr><th className="px-2 py-1.5 font-semibold">Spacing relationships</th><th className="px-2 py-1.5 font-semibold">Value</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-title-block + .house-drilldown-heading-block</code></td><td className="px-2 py-1.5">0.5rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block &gt; .house-drilldown-overline</code></td><td className="px-2 py-1.5">0.3rem</td></tr>
                    <tr className="border-t border-neutral-200"><td className="px-2 py-1.5"><code>.house-drilldown-subheading-block + .house-drilldown-subheading-block</code></td><td className="px-2 py-1.5">2rem</td></tr>
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

function ApprovedMetricsToolbarSection() {
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
                    <span
                      className="house-approved-tooltip house-approved-tooltip-float"
                      role="tooltip"
                      aria-hidden="true"
                    >
                      Generate report
                    </span>
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
                    <span
                      className="house-approved-tooltip house-approved-tooltip-float"
                      role="tooltip"
                      aria-hidden="true"
                    >
                      Download
                    </span>
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
                    <span
                      className="house-approved-tooltip house-approved-tooltip-float"
                      role="tooltip"
                      aria-hidden="true"
                    >
                      Share
                    </span>
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
                  title="Generate report"
                >
                  <FileText className="h-4 w-4" />
                </button>
                <span className="house-approved-tooltip house-approved-tooltip-float" role="tooltip" aria-hidden="true">
                  Generate report
                </span>
              </div>
              <div className="group relative inline-flex">
                <button
                  type="button"
                  className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                  aria-label="Download"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <span className="house-approved-tooltip house-approved-tooltip-float" role="tooltip" aria-hidden="true">
                  Download
                </span>
              </div>
              <div className="group relative inline-flex">
                <button
                  type="button"
                  className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                  aria-label="Share"
                  title="Share"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <span className="house-approved-tooltip house-approved-tooltip-float" role="tooltip" aria-hidden="true">
                  Share
                </span>
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
                    <td className="px-2 py-1.5"><code>.house-approved-tooltip</code></td>
                    <td className="px-2 py-1.5">Canonical tooltip surface</td>
                    <td className="px-2 py-1.5">neutral surface, stroke, radius, and foreground (shared with chart tooltip)</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-approved-tooltip-float</code></td>
                    <td className="px-2 py-1.5">Tooltip positioning + reveal behavior</td>
                    <td className="px-2 py-1.5">absolute top placement, 12px caption text, 18px total height, hover/focus visibility transition</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-chart-tooltip</code></td>
                    <td className="px-2 py-1.5">Chart overlay alias</td>
                    <td className="px-2 py-1.5">must match the same approved tooltip surface contract</td>
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
                <p className="house-drilldown-summary-stat-title">Total publications</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value-emphasis tabular-nums">150</p>
                </div>
              </div>
              <div className="house-drilldown-summary-stat-card">
                <p className="house-drilldown-summary-stat-title">Active years</p>
                <div className="house-drilldown-summary-stat-value-wrap">
                  <p className="house-drilldown-summary-stat-value tabular-nums">12</p>
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
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-title</code></td>
                    <td className="px-2 py-1.5">0.6875rem / 0.95rem · 600 · 0.07em · uppercase</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value</code></td>
                    <td className="px-2 py-1.5">1.2rem / 1.5rem · 600 · neutral-800 · centered</td>
                  </tr>
                  <tr className="border-t border-neutral-200">
                    <td className="px-2 py-1.5"><code>.house-drilldown-summary-stat-value-emphasis</code></td>
                    <td className="px-2 py-1.5">2.275rem / 1.05 · 700 · neutral-900 · centered</td>
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
              <div className="house-toggle-track grid-cols-2">
                <span
                  className="house-toggle-thumb"
                  style={buildTileToggleThumbStyle(hMode === 'needed' ? 1 : 0, 2)}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={hMode === 'trend' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                  onClick={() => setHMode('trend')}
                  aria-pressed={hMode === 'trend'}
                >
                  Trend
                </button>
                <button
                  type="button"
                  className={hMode === 'needed' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                  onClick={() => setHMode('needed')}
                  aria-pressed={hMode === 'needed'}
                >
                  Citations needed
                </button>
              </div>
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
            <div className="house-toggle-track grid-cols-2">
              <span
                className="house-toggle-thumb"
                style={buildTileToggleThumbStyle(entryScale === 'expanded' ? 1 : 0, 2)}
                aria-hidden="true"
              />
              <button
                type="button"
                className={entryScale === 'compact' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                onClick={() => setEntryScale('compact')}
              >
                Compact
              </button>
              <button
                type="button"
                className={entryScale === 'expanded' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                onClick={() => setEntryScale('expanded')}
              >
                Expanded
              </button>
            </div>
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
              <div className="house-toggle-track grid-cols-2">
                <span
                  className="house-toggle-thumb"
                  style={buildTileToggleThumbStyle(sameCountDataset.id === ANIMATION_LAB_SAME_COUNT_DATASETS[1].id ? 1 : 0, 2)}
                  aria-hidden="true"
                />
                {ANIMATION_LAB_SAME_COUNT_DATASETS.map((dataset) => (
                  <button
                    key={`same-count-toggle-${dataset.id}`}
                    type="button"
                    className={sameCountDataset.id === dataset.id ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                    onClick={() => setSameCountDatasetId(dataset.id)}
                    aria-pressed={sameCountDataset.id === dataset.id}
                  >
                    {dataset.id === 'rolling' ? 'Prior 4yr' : 'Latest 12m'}
                  </button>
                ))}
              </div>
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
                        className="house-chart-mean-line house-chart-scale-mean-line absolute left-0 right-0"
                        style={{ bottom: `${sameCountMeanBottom}%` }}
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
                          className="house-chart-mean-line house-chart-scale-mean-line absolute left-0 right-0"
                          style={{ bottom: `${sameCountMeanBottom}%` }}
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
              <div className="house-toggle-track grid-cols-2">
                <span
                  className="house-toggle-thumb"
                  style={buildTileToggleThumbStyle(differentCountDataset.id === ANIMATION_LAB_DIFFERENT_COUNT_DATASETS[1].id ? 1 : 0, 2)}
                  aria-hidden="true"
                />
                {ANIMATION_LAB_DIFFERENT_COUNT_DATASETS.map((dataset) => (
                  <button
                    key={`different-count-toggle-${dataset.id}`}
                    type="button"
                    className={differentCountDataset.id === dataset.id ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                    onClick={() => setDifferentCountDatasetId(dataset.id)}
                    aria-pressed={differentCountDataset.id === dataset.id}
                  >
                    {dataset.id === 'annual-5' ? 'Annual' : 'Quarterly'}
                  </button>
                ))}
              </div>
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
                        className="house-chart-mean-line house-chart-scale-mean-line absolute left-0 right-0"
                        style={{ bottom: `${differentCountMeanBottom}%` }}
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
                          className="house-chart-mean-line house-chart-scale-mean-line absolute left-0 right-0"
                          style={{ bottom: `${differentCountMeanBottom}%` }}
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

function ApprovedPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl space-y-10 p-4">
        <h1 className="text-2xl font-bold text-neutral-900">Approved Library</h1>
        <ApprovedHeaderBar />
        <ApprovedMarkersSection />
        <ApprovedLayoutTitlePositioning />
        <ApprovedTypographySection />
        <ApprovedMetricsToolbarSection />
        <ApprovedTooltipSection />
        <ApprovedNotificationBannersSection />
        <ApprovedPublicationsDrilldownSection />
        <ApprovedDrilldownMetricTileSection />
        <ApprovedMetricTilesSection />
        <ApprovedTileTogglesSection />
        <ApprovedPublicationTileAnimationsSection />
        <ApprovedPublicationAnimationSpecSection />
        <ApprovedLeftPanel />
        <AuthPagePanel />
        <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="px-4 py-2 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">Approved Icons</p>
            <p className="text-xs text-neutral-600">Canonical icon definitions for reuse in future approved stories.</p>
          </div>
          <div className="p-4">
            <ProviderIconSection />
          </div>
        </div>
      </div>
    </div>
  )
}

export const Approved: Story = {
  render: () => <ApprovedPage />,
}

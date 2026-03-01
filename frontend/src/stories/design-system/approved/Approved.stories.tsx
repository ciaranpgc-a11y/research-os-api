import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Mail, Menu, Search, Settings, User } from 'lucide-react'

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
        <div className="bg-card p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Workspace home</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[workspacePath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Inbox</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[inboxPath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Profile</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
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
        }
      `}</style>
    </section>
  )
}

function ApprovedMarkersSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Markers</p>
          <p className="text-xs text-neutral-600">Canonical marker widths for header, left nav, and panel/drilldown accents.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-4">
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
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Panel / Drilldown Marker</p>
            <div className="mt-3">
              <div className="house-left-border house-left-border-publications rounded-md border border-border bg-card p-3">
                <p className="text-sm font-semibold text-neutral-900">Publication drilldown</p>
                <p className="text-xs text-neutral-600">Marker follows shared panel token.</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-panel)</code></p>
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
          <p className="text-xs text-neutral-600">Canonical typography sets for main content, left panel, and drilldown.</p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Main content</p>
            <h2 className="house-title text-[1.8rem] leading-[2rem]">Publications</h2>
            <p className="house-title-expander">Track your research metrics and manage your publication library.</p>
            <p className="house-section-title mt-1">Publication insights</p>
            <p className="house-text">This paragraph uses the main body text tier for core reading content.</p>
            <p className="house-label">Metric label</p>
            <p className="house-field-label">Field label</p>
            <p className="house-field-helper">Helper copy and validation guidance live here.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left panel</p>
            <p className="house-nav-section-label">Workspace</p>
            <button type="button" className="house-nav-item house-nav-item-workspace house-nav-item-active w-full">
              <span className="house-nav-item-label">Overview</span>
              <span className="house-nav-item-count">12</span>
            </button>
            <button type="button" className="house-nav-item house-nav-item-workspace w-full">
              <span className="house-nav-item-label">Data library</span>
              <span className="house-nav-item-meta">New</span>
            </button>
            <p className="house-nav-item-meta">Meta tier for supplementary nav context.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown</p>
            <p className="house-drilldown-overline">Publication drilldown</p>
            <p className="house-drilldown-section-label">Citation momentum</p>
            <p className="house-drilldown-summary-stat-title">Current citation pace</p>
            <p className="house-drilldown-summary-stat-value">+87%</p>
            <p className="house-drilldown-caption">Compared with prior 12-month period.</p>
            <p className="house-drilldown-note-soft">Context tier for non-primary explanatory text.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Metric tiles</p>
            <p className="house-metric-tile-title">Total publications</p>
            <p className="house-metric-tile-value">150</p>
            <p className="house-metric-subtitle">Lifetime publications</p>
            <p className="house-metric-narrative">Last 5 years shown</p>
            <p className="house-text-soft">Title/value gap token: <code>--metric-tile-title-value-gap</code></p>
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
          <p className="text-xs text-neutral-600">Canonical animation primitives with timing/easing tokens used by the 9 publication tiles.</p>
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

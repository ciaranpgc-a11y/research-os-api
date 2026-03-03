import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../../../design-system/_helpers/StoryFrame'

const DURATIONS = [
  { name: 'Fast', token: '--motion-duration-fast' },
  { name: 'UI', token: '--motion-duration-ui' },
  { name: 'Base', token: '--motion-duration-base' },
  { name: 'Slow', token: '--motion-duration-slow' },
  { name: 'Slower', token: '--motion-duration-slower' },
  { name: 'Emphasis', token: '--motion-duration-emphasis' },
]

const CHART_ENTRY_DURATION_MS = 560
const CHART_ENTRY_STAGGER_MS = 65
const CHART_ENTRY_STAGGER_MAX_MS = 390

const MOTION_SETTINGS_ROWS = [
  {
    context: 'Entry',
    element: 'Bars / columns',
    duration: '560ms',
    delay: 'staggered (65ms, cap 390ms)',
    timing: 'cubic-bezier(0.2, 0.68, 0.16, 1)',
    note: 'Per-index duration compensation keeps all bars ending together.',
  },
  {
    context: 'Entry',
    element: 'Ring / donut',
    duration: '560ms',
    delay: 'none',
    timing: 'var(--motion-ease-chart-series)',
    note: 'Ring completion aligned with bar and line completion.',
  },
  {
    context: 'Entry',
    element: 'Line path',
    duration: '560ms',
    delay: 'none',
    timing: 'var(--motion-ease-chart-series)',
    note: 'Path draw ends in the same window as bars and ring.',
  },
  {
    context: 'Entry',
    element: 'Horizontal progress',
    duration: '560ms (compensated)',
    delay: 'staggered (65ms, cap 390ms)',
    timing: 'ease-out',
    note: 'Rows stagger in, but finish in sync.',
  },
  {
    context: 'Toggle',
    element: 'All chart types',
    duration: '340–400ms',
    delay: '0ms',
    timing: 'context-specific',
    note: 'Reserved for interaction updates, not initial entry.',
  },
] as const

function entryDelayMs(index: number): number {
  return Math.min(CHART_ENTRY_STAGGER_MAX_MS, Math.max(0, index) * CHART_ENTRY_STAGGER_MS)
}

function entryDurationMs(index: number): number {
  const delay = entryDelayMs(index)
  return Math.max(160, CHART_ENTRY_DURATION_MS - delay)
}

function DurationExamples() {
  const [replay, setReplay] = useState(0)

  return (
    <section data-ui="motion-duration-section" className="rounded-md border border-border bg-card p-4">
      <div data-ui="motion-duration-header" className="mb-3 flex items-center justify-between">
        <p data-ui="duration-title" className="text-label font-semibold">Duration samples</p>
        <button
          data-ui="motion-duration-replay"
          type="button"
          onClick={() => setReplay((n) => n + 1)}
          className="rounded-sm border border-border px-2 py-1 text-caption transition-colors duration-200 ease-out hover:bg-muted"
        >
          Replay
        </button>
      </div>
      <div data-ui="motion-duration-list" className="space-y-2">
        {DURATIONS.map((item) => (
          <div data-ui="motion-duration-row" key={`${item.name}-${replay}`} className="grid items-center gap-2 sm:grid-cols-[160px_1fr]">
            <p data-ui="duration-token" className="text-caption text-muted-foreground">{item.token}</p>
            <div data-ui="motion-duration-track" className="rounded-sm border border-border p-1">
              <div
                data-ui="motion-duration-bar"
                className="h-3 w-full origin-left rounded-sm bg-[hsl(var(--tone-accent-500))]"
                style={{
                  animationName: 'wizard-line-fill',
                  animationDuration: `var(${item.token})`,
                  animationTimingFunction: 'var(--motion-ease-default)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StaggerExamples() {
  const [replay, setReplay] = useState(0)

  return (
    <section data-ui="motion-stagger-section" className="rounded-md border border-border bg-card p-4">
      <div data-ui="motion-stagger-header" className="mb-3 flex items-center justify-between">
        <p data-ui="stagger-title" className="text-label font-semibold">Stagger patterns</p>
        <button
          data-ui="motion-stagger-replay"
          type="button"
          onClick={() => setReplay((n) => n + 1)}
          className="rounded-sm border border-border px-2 py-1 text-caption transition-colors duration-200 ease-out hover:bg-muted"
        >
          Replay
        </button>
      </div>
      <div data-ui="motion-stagger-grid" className="grid gap-4 lg:grid-cols-2">
        <div data-ui="motion-stagger-tight-panel">
          <p data-ui="stagger-tight-label" className="mb-2 text-caption text-muted-foreground">Tile grid, tight stagger (18ms)</p>
          <div data-ui="motion-stagger-tight-grid" className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                data-ui="motion-stagger-tight-item"
                key={`tight-${replay}-${i}`}
                className="h-8 rounded-sm border border-border bg-[hsl(var(--tone-neutral-100))]"
                style={{
                  animationName: 'wizard-fade-slide',
                  animationDuration: 'var(--motion-choreo-tile-load)',
                  animationTimingFunction: 'var(--motion-ease-default)',
                  animationDelay: `calc(${i} * var(--motion-stagger-tight))`,
                  animationFillMode: 'both',
                }}
              />
            ))}
          </div>
        </div>
        <div data-ui="motion-stagger-loose-panel">
          <p data-ui="stagger-loose-label" className="mb-2 text-caption text-muted-foreground">Chart series, loose stagger (45ms)</p>
          <div data-ui="motion-stagger-loose-list" className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                data-ui="motion-stagger-loose-item"
                key={`loose-${replay}-${i}`}
                className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-positive-500))]"
                style={{
                  width: `${55 + i * 7}%`,
                  animationName: 'wizard-fade-slide',
                  animationDuration: 'var(--motion-choreo-chart-load)',
                  animationTimingFunction: 'var(--motion-ease-chart-series)',
                  animationDelay: `calc(${i} * var(--motion-stagger-loose))`,
                  animationFillMode: 'both',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ChartAnimationShowcase() {
  const [replay, setReplay] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
    const frame = window.requestAnimationFrame(() => {
      setExpanded(true)
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [replay])

  const ringRadius = 24
  const circumference = 2 * Math.PI * ringRadius
  const ringPct = 72
  const ringOffset = circumference - ((ringPct / 100) * circumference)

  return (
    <section data-ui="motion-chart-showcase" className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-label font-semibold">Chart animation preview</p>
        <button
          type="button"
          onClick={() => setReplay((n) => n + 1)}
          className="rounded-sm border border-border px-2 py-1 text-caption transition-colors duration-200 ease-out hover:bg-muted"
        >
          Replay
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-sm border border-border p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Vertical bars (stagger, synchronized finish)</p>
          <div className="flex h-20 items-end gap-2">
            {[38, 52, 68, 74, 58, 44].map((height, index) => (
              <span
                key={`preview-bar-${replay}-${index}`}
                className="block flex-1 rounded-sm bg-[hsl(var(--tone-accent-500))]"
                style={{
                  height: `${height}%`,
                  transform: `scaleY(${expanded ? 1 : 0})`,
                  transformOrigin: 'bottom',
                  transitionProperty: 'transform',
                  transitionDelay: `${entryDelayMs(index)}ms`,
                  transitionDuration: `${entryDurationMs(index)}ms`,
                  transitionTimingFunction: 'cubic-bezier(0.2, 0.68, 0.16, 1)',
                }}
              />
            ))}
          </div>
        </article>
        <article className="rounded-sm border border-border p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Ring + line path (same completion window)</p>
          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <svg viewBox="0 0 64 64" className="h-20 w-20">
              <circle cx="32" cy="32" r={ringRadius} fill="none" stroke="hsl(var(--tone-neutral-300))" strokeWidth="8" />
              <circle
                cx="32"
                cy="32"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-positive-500))"
                strokeWidth="8"
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
                strokeDasharray={circumference}
                strokeDashoffset={expanded ? ringOffset : circumference}
                style={{
                  transitionProperty: 'stroke-dashoffset',
                  transitionDuration: `${CHART_ENTRY_DURATION_MS}ms`,
                  transitionTimingFunction: 'var(--motion-ease-chart-series)',
                }}
              />
            </svg>
            <svg viewBox="0 0 120 52" className="h-20 w-full">
              <path d="M4 44 L24 36 L44 29 L64 24 L84 18 L104 10" fill="none" stroke="hsl(var(--tone-accent-500))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path
                key={`preview-line-${replay}`}
                d="M4 44 L24 36 L44 29 L64 24 L84 18 L104 10"
                fill="none"
                stroke="hsl(var(--tone-accent-600))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={expanded ? 0 : 100}
                style={{
                  transitionProperty: 'stroke-dashoffset',
                  transitionDuration: `${CHART_ENTRY_DURATION_MS}ms`,
                  transitionTimingFunction: 'var(--motion-ease-chart-series)',
                }}
              />
            </svg>
          </div>
        </article>
        <article className="rounded-sm border border-border p-3 lg:col-span-2">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Horizontal bars (stagger + synchronized finish)</p>
          <div className="space-y-2">
            {[92, 76, 58, 40].map((width, index) => (
              <div key={`preview-progress-${replay}-${index}`} className="h-3 w-full rounded-sm bg-[hsl(var(--tone-neutral-200))]">
                <div
                  className="h-full rounded-sm bg-[hsl(var(--tone-positive-500))]"
                  style={{
                    width: `${expanded ? width : 0}%`,
                    transitionProperty: 'width',
                    transitionDelay: `${entryDelayMs(index)}ms`,
                    transitionDuration: `${entryDurationMs(index)}ms`,
                    transitionTimingFunction: 'ease-out',
                  }}
                />
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

function MotionSettingsTable() {
  return (
    <section data-ui="motion-settings-table" className="rounded-md border border-border bg-card p-4">
      <p className="mb-3 text-label font-semibold">Motion settings</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-caption">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-2 font-semibold">Context</th>
              <th className="px-2 py-2 font-semibold">Element</th>
              <th className="px-2 py-2 font-semibold">Duration</th>
              <th className="px-2 py-2 font-semibold">Delay</th>
              <th className="px-2 py-2 font-semibold">Timing</th>
              <th className="px-2 py-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {MOTION_SETTINGS_ROWS.map((row) => (
              <tr key={`${row.context}-${row.element}`} className="border-b border-border/60 align-top">
                <td className="px-2 py-2">{row.context}</td>
                <td className="px-2 py-2">{row.element}</td>
                <td className="px-2 py-2">{row.duration}</td>
                <td className="px-2 py-2">{row.delay}</td>
                <td className="px-2 py-2">{row.timing}</td>
                <td className="px-2 py-2 text-muted-foreground">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const meta = {
  title: 'Design System/Foundations/Motion Choreography',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Choreography: Story = {
  render: () => (
    <StoryFrame title="Motion choreography" subtitle="Duration scale, chart animation preview, and settings table">
      <div data-ui="motion-story-content" className="space-y-4">
        <DurationExamples />
        <StaggerExamples />
        <ChartAnimationShowcase />
        <MotionSettingsTable />
      </div>
    </StoryFrame>
  ),
}

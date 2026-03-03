import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../_helpers/StoryFrame'

const DURATIONS = [
  { name: 'Fast', token: '--motion-duration-fast' },
  { name: 'UI', token: '--motion-duration-ui' },
  { name: 'Base', token: '--motion-duration-base' },
  { name: 'Slow', token: '--motion-duration-slow' },
  { name: 'Slower', token: '--motion-duration-slower' },
  { name: 'Emphasis', token: '--motion-duration-emphasis' },
]

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

function BeforeAfterComparison() {
  return (
    <section data-ui="motion-comparison-section" className="rounded-md border border-border bg-card p-4">
      <p data-ui="comparison-title" className="mb-3 text-label font-semibold">Before vs After choreography</p>
      <div data-ui="motion-comparison-grid" className="grid gap-4 lg:grid-cols-2">
        <article data-ui="motion-before-panel" className="rounded-sm border border-border p-3">
          <p data-ui="before-title" className="text-caption font-semibold text-muted-foreground">Before (inconsistent)</p>
          <div data-ui="motion-before-list" className="mt-2 space-y-2">
            <div data-ui="motion-before-item" className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-danger-500))]" style={{ animation: 'wizard-fade-slide 140ms ease-out both' }} />
            <div data-ui="motion-before-item" className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-warning-500))]" style={{ animation: 'wizard-fade-slide 300ms ease-in both' }} />
            <div data-ui="motion-before-item" className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-accent-500))]" style={{ animation: 'wizard-fade-slide 700ms linear both' }} />
          </div>
        </article>
        <article data-ui="motion-after-panel" className="rounded-sm border border-border p-3">
          <p data-ui="after-title" className="text-caption font-semibold text-muted-foreground">After (harmonized tokens)</p>
          <div data-ui="motion-after-list" className="mt-2 space-y-2">
            <div
              data-ui="motion-after-item"
              className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-danger-500))]"
              style={{
                animationName: 'wizard-fade-slide',
                animationDuration: 'var(--motion-choreo-toggle-same)',
                animationTimingFunction: 'var(--motion-ease-default)',
                animationFillMode: 'both',
              }}
            />
            <div
              data-ui="motion-after-item"
              className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-warning-500))]"
              style={{
                animationName: 'wizard-fade-slide',
                animationDuration: 'var(--motion-choreo-toggle-different)',
                animationTimingFunction: 'var(--motion-ease-default)',
                animationFillMode: 'both',
              }}
            />
            <div
              data-ui="motion-after-item"
              className="h-3 origin-left rounded-sm bg-[hsl(var(--tone-accent-500))]"
              style={{
                animationName: 'wizard-fade-slide',
                animationDuration: 'var(--motion-choreo-chart-load)',
                animationTimingFunction: 'var(--motion-ease-chart-series)',
                animationFillMode: 'both',
              }}
            />
          </div>
        </article>
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
    <StoryFrame title="Motion choreography" subtitle="Duration scale, stagger behavior, and harmonization comparison">
      <div data-ui="motion-story-content" className="space-y-4">
        <DurationExamples />
        <StaggerExamples />
        <BeforeAfterComparison />
      </div>
    </StoryFrame>
  ),
}

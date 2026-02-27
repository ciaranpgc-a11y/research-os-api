import { useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Select } from '@/components/ui/select'
import { StoryFrame } from '../_helpers/StoryFrame'

type Token = {
  label: string
  cssVar: string
}

const TEXT_TOKENS: Token[] = [
  { label: 'Foreground', cssVar: '--foreground' },
  { label: 'Muted Foreground', cssVar: '--muted-foreground' },
  { label: 'Neutral 700', cssVar: '--tone-neutral-700' },
  { label: 'Neutral 900', cssVar: '--tone-neutral-900' },
  { label: 'Accent 700', cssVar: '--tone-accent-700' },
]

const BG_TOKENS: Token[] = [
  { label: 'Background', cssVar: '--background' },
  { label: 'Card', cssVar: '--card' },
  { label: 'Muted', cssVar: '--muted' },
  { label: 'Neutral 100', cssVar: '--tone-neutral-100' },
  { label: 'Accent 50', cssVar: '--tone-accent-50' },
]

type RGB = { r: number; g: number; b: number }

function hslStringToRgb(hsl: string): RGB | null {
  const normalized = hsl.trim().replace(/\s+/g, ' ')
  const match = normalized.match(/^([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%$/)
  if (!match) return null
  const h = Number(match[1]) / 360
  const s = Number(match[2]) / 100
  const l = Number(match[3]) / 100

  if (s === 0) {
    const gray = Math.round(l * 255)
    return { r: gray, g: gray, b: gray }
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

function relativeLuminance({ r, g, b }: RGB): number {
  const toLinear = (channel: number) => {
    const v = channel / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function contrastRatio(textRgb: RGB, bgRgb: RGB): number {
  const l1 = relativeLuminance(textRgb)
  const l2 = relativeLuminance(bgRgb)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function wcagRating(ratio: number, largeText: boolean): 'AAA' | 'AA' | 'Fail' {
  const aaa = largeText ? 4.5 : 7
  const aa = largeText ? 3 : 4.5
  if (ratio >= aaa) return 'AAA'
  if (ratio >= aa) return 'AA'
  return 'Fail'
}

function ContrastCell({ textVar, bgVar }: { textVar: string; bgVar: string }) {
  const [ratio, rating] = useMemo(() => {
    if (typeof window === 'undefined') return [NaN, 'unclear'] as const
    const styles = getComputedStyle(document.documentElement)
    const textRaw = styles.getPropertyValue(textVar)
    const bgRaw = styles.getPropertyValue(bgVar)
    const textRgb = hslStringToRgb(textRaw)
    const bgRgb = hslStringToRgb(bgRaw)
    if (!textRgb || !bgRgb) return [NaN, 'unclear'] as const
    const value = contrastRatio(textRgb, bgRgb)
    return [value, wcagRating(value, false)] as const
  }, [textVar, bgVar])

  return (
    <div
      data-ui="contrast-cell"
      className="rounded-sm border border-border px-2 py-1 text-caption"
      style={{ color: `hsl(var(${textVar}))`, backgroundColor: `hsl(var(${bgVar}))` }}
    >
      <span data-ui="contrast-ratio">{Number.isFinite(ratio) ? `${ratio.toFixed(2)}:1` : 'unclear'}</span>
      <span data-ui="contrast-rating" className="ml-2 text-caption uppercase tracking-[0.08em]">{String(rating)}</span>
    </div>
  )
}

function ContrastChecker() {
  const [textVar, setTextVar] = useState(TEXT_TOKENS[0].cssVar)
  const [bgVar, setBgVar] = useState(BG_TOKENS[0].cssVar)
  const [largeText, setLargeText] = useState(false)

  const result = useMemo(() => {
    if (typeof window === 'undefined') return { ratio: NaN, rating: 'unclear' }
    const styles = getComputedStyle(document.documentElement)
    const textRgb = hslStringToRgb(styles.getPropertyValue(textVar))
    const bgRgb = hslStringToRgb(styles.getPropertyValue(bgVar))
    if (!textRgb || !bgRgb) return { ratio: NaN, rating: 'unclear' }
    const ratio = contrastRatio(textRgb, bgRgb)
    return { ratio, rating: wcagRating(ratio, largeText) }
  }, [textVar, bgVar, largeText])

  return (
    <section data-ui="contrast-checker-section" className="rounded-md border border-border bg-card p-4">
      <p data-ui="checker-title" className="text-label font-semibold">Interactive contrast checker</p>
      <div data-ui="contrast-checker-controls" className="mt-3 grid gap-3 md:grid-cols-3">
        <label data-ui="contrast-checker-text-token" className="text-caption text-muted-foreground">
          Text token
          <Select
            data-ui="contrast-checker-text-select"
            className="mt-1"
            value={textVar}
            onChange={(e) => setTextVar(e.target.value)}
          >
            {TEXT_TOKENS.map((token) => (
              <option data-ui="contrast-checker-text-option" key={token.cssVar} value={token.cssVar}>{token.label} ({token.cssVar})</option>
            ))}
          </Select>
        </label>
        <label data-ui="contrast-checker-bg-token" className="text-caption text-muted-foreground">
          Background token
          <Select
            data-ui="contrast-checker-bg-select"
            className="mt-1"
            value={bgVar}
            onChange={(e) => setBgVar(e.target.value)}
          >
            {BG_TOKENS.map((token) => (
              <option data-ui="contrast-checker-bg-option" key={token.cssVar} value={token.cssVar}>{token.label} ({token.cssVar})</option>
            ))}
          </Select>
        </label>
        <div data-ui="contrast-checker-large-text" className="flex items-end">
          <button
            data-ui="contrast-checker-large-text-toggle"
            type="button"
            onClick={() => setLargeText((v) => !v)}
            className="rounded-sm border border-border px-3 py-2 text-caption transition-colors duration-200 ease-out hover:bg-muted"
          >
            Large text threshold: {largeText ? 'On' : 'Off'}
          </button>
        </div>
      </div>
      <div
        data-ui="contrast-checker-sample-wrap"
        className="mt-3 rounded-sm border border-border p-3"
        style={{ color: `hsl(var(${textVar}))`, backgroundColor: `hsl(var(${bgVar}))` }}
      >
        <p data-ui="checker-sample">Sample copy for contrast testing against selected background.</p>
      </div>
      <p data-ui="checker-result" className="mt-2 text-caption text-muted-foreground">
        Result: {Number.isFinite(result.ratio) ? `${result.ratio.toFixed(2)}:1` : 'unclear'} ({String(result.rating)})
      </p>
    </section>
  )
}

function ContrastMatrix() {
  return (
    <section data-ui="contrast-matrix-section" className="rounded-md border border-border bg-card p-4">
      <p data-ui="matrix-title" className="mb-3 text-label font-semibold">Color contrast matrix</p>
      <div data-ui="contrast-matrix-grid" className="space-y-2">
        {TEXT_TOKENS.map((textToken) => (
          <div data-ui="contrast-matrix-row" key={textToken.cssVar} className="grid gap-2 md:grid-cols-5">
            {BG_TOKENS.map((bgToken) => (
              <ContrastCell key={`${textToken.cssVar}-${bgToken.cssVar}`} textVar={textToken.cssVar} bgVar={bgToken.cssVar} />
            ))}
          </div>
        ))}
      </div>
      <p data-ui="matrix-note" className="mt-3 text-caption text-muted-foreground">
        WCAG ratings: AAA, AA, or Fail computed from current theme token values.
      </p>
    </section>
  )
}

const meta = {
  title: 'Design System/Foundations/Color Contrast',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Matrix: Story = {
  render: () => (
    <StoryFrame title="Color contrast matrix" subtitle="Token pair coverage with WCAG ratings">
      <div data-ui="contrast-story-content" className="space-y-4">
        <ContrastChecker />
        <ContrastMatrix />
      </div>
    </StoryFrame>
  ),
}

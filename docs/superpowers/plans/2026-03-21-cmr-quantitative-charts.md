# CMR Quantitative Inline Range Charts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add togglable inline range charts to the CMR quantitative table, showing measured values against normal ranges with auto-adjust scaling controls.

**Architecture:** A new chart column is added to the existing `<table>` element (no separate panel), toggled via a pill in the top control bar. Chart scaling logic lives as pure functions in a dedicated module. The chart column renders inline SVGs per row.

**Tech Stack:** React, TypeScript, inline SVG, Tailwind CSS. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-21-cmr-quantitative-charts-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/cmr-chart-scaling.ts` | Create | Pure functions: scaling constants, `computeMeasuredRel`, `computeMeasuredPos`, `isAbnormal`, global auto-adjust, per-measurement auto-adjust, slider factor, percentile math |
| `frontend/src/pages/cmr-new-report-page.tsx` | Modify | Add `chartMode` state + toggle, chart column to table, `RangeChart` component, chart control strip in thead, conditional colgroup/direction column |

---

### Task 1: Chart scaling pure functions

**Files:**
- Create: `frontend/src/lib/cmr-chart-scaling.ts`

This module contains all scaling math, ported from the Excel VBA `mod_OUTPUT_tracker_cust`. No React, no DOM — pure functions only.

- [ ] **Step 1: Create the scaling module with constants and core functions**

```typescript
// frontend/src/lib/cmr-chart-scaling.ts

// ---------------------------------------------------------------------------
// Constants (from Excel mod_OUTPUT_tracker_cust)
// ---------------------------------------------------------------------------
export const FACTORY_RANGE_START = 0.3
export const FACTORY_RANGE_WIDTH = 0.4
export const X_MIN = 0.05
export const X_MAX = 0.95
export const ROUND_STEP = 0.01
export const REL_EXTREME_THRESHOLD = 0.5
export const GLOBAL_Q_LOW = 0.05
export const GLOBAL_Q_HIGH = 0.95
export const SLIDER_MIN = -50
export const SLIDER_MAX = 50

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

function roundToStep(x: number, step: number): number {
  return step <= 0 ? x : Math.round(x / step) * step
}

/** Can we render a chart for this parameter? Needs both LL and UL, and UL > LL. */
export function hasValidRange(ll: number | null, ul: number | null): boolean {
  return ll !== null && ul !== null && ul > ll
}

// ---------------------------------------------------------------------------
// Core scaling
// ---------------------------------------------------------------------------

/** Relative position of measured value within LL→UL range. 0 = LL, 1 = UL. Unbounded. */
export function computeMeasuredRel(measured: number, ll: number, ul: number): number {
  return (measured - ll) / (ul - ll)
}

/** Visual position on the 0→1 axis, clamped to [X_MIN, X_MAX]. */
export function computeMeasuredPos(
  measuredRel: number,
  rangeStart: number,
  rangeWidth: number,
): number {
  return clamp(rangeStart + rangeWidth * measuredRel, X_MIN, X_MAX)
}

/** Determine if a value is abnormal based on direction rules. */
export function isAbnormal(
  measured: number,
  ll: number | null,
  ul: number | null,
  direction: string,
): boolean {
  if (direction === 'high' && ul !== null) return measured > ul
  if (direction === 'low' && ll !== null) return measured < ll
  if (direction === 'both') {
    return (ul !== null && measured > ul) || (ll !== null && measured < ll)
  }
  return false
}

// ---------------------------------------------------------------------------
// Range param type
// ---------------------------------------------------------------------------

export type RangeParam = { rangeStart: number; rangeWidth: number }

export function factoryBaseline(): RangeParam {
  return { rangeStart: FACTORY_RANGE_START, rangeWidth: FACTORY_RANGE_WIDTH }
}

// ---------------------------------------------------------------------------
// Manual slider
// ---------------------------------------------------------------------------

/** Convert slider position (integer -50..+50) to a uniform RangeParam. */
export function sliderToRangeParam(sliderValue: number): RangeParam {
  const k = Math.pow(2, sliderValue / 50)
  const factoryMid = FACTORY_RANGE_START + FACTORY_RANGE_WIDTH / 2 // 0.5
  let rw = clamp(FACTORY_RANGE_WIDTH * k, 0.000001, 0.999999)
  rw = roundToStep(rw, ROUND_STEP)
  let rs = factoryMid - rw / 2
  rs = clamp(rs, 0.000001, 1 - rw)
  rs = roundToStep(rs, ROUND_STEP)
  rs = clamp(rs, 0.000001, 1 - rw)
  return { rangeStart: rs, rangeWidth: rw }
}

// ---------------------------------------------------------------------------
// Percentile helper (linear interpolation, matching Excel VBA)
// ---------------------------------------------------------------------------

function percentileSorted(arr: number[], q: number): number {
  const n = arr.length
  if (n === 0) return 0
  q = clamp(q, 0, 1)
  const pos = (n - 1) * q
  const k = Math.floor(pos)
  const d = pos - k
  if (k >= n - 1) return arr[n - 1]
  return arr[k] + d * (arr[k + 1] - arr[k])
}

// ---------------------------------------------------------------------------
// Global auto-adjust
// ---------------------------------------------------------------------------

/**
 * Compute a single RangeParam that scales all charts so the 5th–95th percentile
 * of measured_rel values map to [X_MIN, X_MAX].
 * Returns null if insufficient data (< 5 values or degenerate).
 */
export function globalAutoAdjust(measuredRels: number[]): RangeParam | null {
  if (measuredRels.length < 5) return null
  const sorted = [...measuredRels].sort((a, b) => a - b)
  const relLo = percentileSorted(sorted, GLOBAL_Q_LOW)
  const relHi = percentileSorted(sorted, GLOBAL_Q_HIGH)
  if (relHi <= relLo) return null
  let rw = (X_MAX - X_MIN) / (relHi - relLo)
  rw = clamp(rw, 0.000001, 0.999999)
  rw = roundToStep(rw, ROUND_STEP)
  let rs = X_MIN - rw * relLo
  rs = clamp(rs, 0.000001, 1 - rw)
  rs = roundToStep(rs, ROUND_STEP)
  rs = clamp(rs, 0.000001, 1 - rw)
  return { rangeStart: rs, rangeWidth: rw }
}

// ---------------------------------------------------------------------------
// Per-measurement auto-adjust
// ---------------------------------------------------------------------------

const PER_MEAS_TARGET_LO = 0.1
const PER_MEAS_TARGET_HI = 0.9
const PER_MEAS_MIN_WIDTH = 0.05

/**
 * For a single row: if measured_rel is extreme (beyond ±0.5 of the [0,1] range),
 * compute a custom RangeParam that places the dot near the edge.
 * Otherwise returns factory baseline.
 */
export function perMeasurementAutoAdjust(measuredRel: number): RangeParam {
  // Not extreme → factory baseline
  if (measuredRel > -REL_EXTREME_THRESHOLD && measuredRel < 1 + REL_EXTREME_THRESHOLD) {
    return factoryBaseline()
  }

  let rw: number
  let rs: number

  if (measuredRel >= 1 + REL_EXTREME_THRESHOLD) {
    // Extreme high — place dot at PER_MEAS_TARGET_HI
    const rwMax = PER_MEAS_TARGET_HI / measuredRel
    rw = Math.min(FACTORY_RANGE_WIDTH, rwMax)
    rw = clamp(rw, PER_MEAS_MIN_WIDTH, FACTORY_RANGE_WIDTH)
    rw = roundToStep(rw, ROUND_STEP)
    rs = PER_MEAS_TARGET_HI - rw * measuredRel
    rs = clamp(rs, 0.000001, 1 - rw)
    rs = roundToStep(rs, ROUND_STEP)
    rs = clamp(rs, 0.000001, 1 - rw)
  } else {
    // Extreme low — place dot at PER_MEAS_TARGET_LO
    const d = Math.abs(measuredRel)
    const rwMax = (1 - PER_MEAS_TARGET_LO) / (1 + d)
    rw = Math.min(FACTORY_RANGE_WIDTH, rwMax)
    rw = clamp(rw, PER_MEAS_MIN_WIDTH, FACTORY_RANGE_WIDTH)
    rw = roundToStep(rw, ROUND_STEP)
    rs = PER_MEAS_TARGET_LO - rw * measuredRel
    rs = clamp(rs, 0.000001, 1 - rw)
    rs = roundToStep(rs, ROUND_STEP)
    rs = clamp(rs, 0.000001, 1 - rw)
  }

  return { rangeStart: rs, rangeWidth: rw }
}
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | grep cmr-chart-scaling || echo 'No errors'`
Expected: `No errors`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/cmr-chart-scaling.ts
git commit -m "feat(cmr): add chart scaling pure functions module"
```

---

### Task 2: Chart mode toggle + colgroup changes

**Files:**
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:233-240` (state declarations)
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:379-408` (toggle bar — add Charts toggle after Indexed Only)
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:447-456` (colgroup — conditional widths)
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:457-467` (thead — conditional Direction/Chart columns)
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:474-476` (sub-section divider colSpan)

- [ ] **Step 1: Add chartMode state and rangeParams state**

At line 240 (after `indexFilter` state), add:

```typescript
const [chartMode, setChartMode] = useState<'off' | 'on'>('off')
const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(new Map())
const [sliderValue, setSliderValue] = useState(0)
```

Add import at the top of the file:

```typescript
import {
  type RangeParam,
  factoryBaseline,
  hasValidRange,
  computeMeasuredRel,
  computeMeasuredPos,
  isAbnormal as isAbnormalValue,
  globalAutoAdjust,
  perMeasurementAutoAdjust,
  sliderToRangeParam,
} from '@/lib/cmr-chart-scaling'
```

- [ ] **Step 2: Add Charts pill toggle in the top control bar**

After the "Indexed Only" toggle group (after line 408), add a new divider + toggle:

```tsx
<div className="h-7 w-px bg-[hsl(var(--stroke-soft)/0.5)]" />

<div className="flex items-center gap-2">
  <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
    <button
      type="button"
      onClick={() => setChartMode('off')}
      className={cn(
        'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
        chartMode === 'off'
          ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
          : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
      )}
    >
      Table Only
    </button>
    <button
      type="button"
      onClick={() => setChartMode('on')}
      className={cn(
        'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
        chartMode === 'on'
          ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
          : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
      )}
    >
      Charts
    </button>
  </div>
</div>
```

- [ ] **Step 3: Make colgroup conditional on chartMode**

Replace the existing `<colgroup>` (lines 447–456) with:

```tsx
<colgroup>
  <col style={{ width: chartMode === 'on' ? '22%' : '30%' }} />
  <col style={{ width: chartMode === 'on' ? '7%' : '10%' }} />
  <col style={{ width: chartMode === 'on' ? '9%' : '12%' }} />
  <col style={{ width: chartMode === 'on' ? '7%' : '10%' }} />
  <col style={{ width: chartMode === 'on' ? '7%' : '10%' }} />
  <col style={{ width: chartMode === 'on' ? '7%' : '10%' }} />
  <col style={{ width: chartMode === 'on' ? '6%' : '9%' }} />
  {chartMode === 'off' && <col style={{ width: '9%' }} />}
  {chartMode === 'on' && <col style={{ width: '35%' }} />}
</colgroup>
```

- [ ] **Step 4: Make thead conditional — hide Direction, add Chart header**

Replace the `<thead>` (lines 457–467) with:

```tsx
<thead>
  <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
    <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
    <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
    <th className="house-table-head-text px-3 py-2 text-center font-bold text-[hsl(var(--section-style-report-accent))]">Measured</th>
    <th className="house-table-head-text px-3 py-2 text-center">LL</th>
    <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
    <th className="house-table-head-text px-3 py-2 text-center">UL</th>
    <th className="house-table-head-text px-3 py-2 text-center">SD</th>
    {chartMode === 'off' && (
      <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
    )}
    {chartMode === 'on' && (
      <th className="house-table-head-text px-1 py-2 text-center">
        <ChartControlStrip
          onGlobalAuto={() => {
            const rels: number[] = []
            for (const g of groups) {
              for (const p of g.params) {
                const m = measuredValues.get(p.parameter_key)
                if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                  rels.push(computeMeasuredRel(m, p.ll!, p.ul!))
                }
              }
            }
            const result = globalAutoAdjust(rels)
            if (result) {
              setRangeParams(new Map()) // clear per-param overrides
              setSliderValue(0)
              // Store as a single "global" value by clearing the map
              // and we'll use a fallback in the render
              setRangeParams(new Map([['__global__', result]]))
            }
          }}
          onPerMeasAuto={() => {
            const newMap = new Map<string, RangeParam>()
            for (const g of groups) {
              for (const p of g.params) {
                const m = measuredValues.get(p.parameter_key)
                if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                  const rel = computeMeasuredRel(m, p.ll!, p.ul!)
                  newMap.set(p.parameter_key, perMeasurementAutoAdjust(rel))
                }
              }
            }
            setSliderValue(0)
            setRangeParams(newMap)
          }}
          onReset={() => {
            setRangeParams(new Map())
            setSliderValue(0)
          }}
          sliderValue={sliderValue}
          onSliderChange={(v) => {
            setSliderValue(v)
            const rp = sliderToRangeParam(v)
            setRangeParams(new Map([['__global__', rp]]))
          }}
        />
      </th>
    )}
  </tr>
</thead>
```

- [ ] **Step 5: Update sub-section divider colSpan**

Change the `colSpan={8}` on the sub-section `<td>` (line 476) to be dynamic:

```tsx
colSpan={chartMode === 'on' ? 8 : 8}
```

Actually both are 8 columns (we replaced Direction with Chart, same count). No change needed here — just verify it's still `8`.

- [ ] **Step 6: Verify the page compiles (ignore ChartControlStrip and RangeChart not defined yet)**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

This will show errors for `ChartControlStrip` — that's expected, we'll define it in Task 3.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/cmr-new-report-page.tsx
git commit -m "feat(cmr): add chart mode toggle and conditional table layout"
```

---

### Task 3: RangeChart inline SVG component + ChartControlStrip

**Files:**
- Modify: `frontend/src/pages/cmr-new-report-page.tsx` (add two new components before the main page component)

- [ ] **Step 1: Add the ChartControlStrip component**

Add this component after the `ChevronIcon` component (around line 97) and before the `ParameterDrilldown` component:

```tsx
function ChartControlStrip({
  onGlobalAuto,
  onPerMeasAuto,
  onReset,
  sliderValue,
  onSliderChange,
}: {
  onGlobalAuto: () => void
  onPerMeasAuto: () => void
  onReset: () => void
  sliderValue: number
  onSliderChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onGlobalAuto}
        title="Global auto-adjust"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--tone-neutral-600))] ring-1 ring-[hsl(var(--stroke-soft)/0.5)] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
      >
        Global
      </button>
      <button
        type="button"
        onClick={onPerMeasAuto}
        title="Per-measurement auto-adjust"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--tone-neutral-600))] ring-1 ring-[hsl(var(--stroke-soft)/0.5)] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
      >
        Per-meas
      </button>
      <input
        type="range"
        min={-50}
        max={50}
        value={sliderValue}
        onChange={(e) => onSliderChange(Number(e.target.value))}
        className="h-3 w-16 cursor-pointer accent-[hsl(var(--section-style-report-accent))]"
        title={`Tight/loose: ${sliderValue}`}
      />
      <button
        type="button"
        onClick={onReset}
        title="Reset to defaults"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--tone-neutral-600))] ring-1 ring-[hsl(var(--stroke-soft)/0.5)] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
      >
        Reset
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add the RangeChart inline SVG component**

Add this component right after `ChartControlStrip`:

```tsx
function RangeChart({
  measured,
  ll,
  ul,
  direction,
  rangeStart,
  rangeWidth,
}: {
  measured: number
  ll: number
  ul: number
  direction: string
  rangeStart: number
  rangeWidth: number
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeStart, rangeWidth)
  const abnormal = isAbnormalValue(measured, ll, ul, direction)

  // Green band position (as percentage of SVG width)
  const bandLeft = rangeStart * 100
  const bandWidth = rangeWidth * 100

  return (
    <svg viewBox="0 0 100 16" className="h-4 w-full" preserveAspectRatio="none">
      {/* Background track */}
      <rect x="0" y="6" width="100" height="4" rx="2" fill="hsl(var(--tone-neutral-200))" />
      {/* Normal range band (green) */}
      <rect
        x={bandLeft}
        y="4"
        width={bandWidth}
        height="8"
        rx="2"
        fill="hsl(var(--tone-positive-300))"
        fillOpacity="0.5"
      />
      {/* Measured value dot */}
      <circle
        cx={measuredPos * 100}
        cy="8"
        r="3.5"
        fill={abnormal ? 'hsl(var(--tone-danger-500))' : 'hsl(var(--tone-positive-500))'}
        stroke={abnormal ? 'hsl(var(--tone-danger-700))' : 'hsl(var(--tone-positive-700))'}
        strokeWidth="0.5"
      />
    </svg>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/cmr-new-report-page.tsx
git commit -m "feat(cmr): add RangeChart SVG and ChartControlStrip components"
```

---

### Task 4: Wire chart column into data rows

**Files:**
- Modify: `frontend/src/pages/cmr-new-report-page.tsx:540-542` (data row — replace Direction td / add Chart td)

- [ ] **Step 1: Replace the Direction `<td>` with conditional Direction/Chart**

Replace the last `<td>` in each data row (the Direction cell, lines 540–542) with:

```tsx
{chartMode === 'off' && (
  <td className="house-table-cell-text px-1 py-2 text-center">
    <DirectionIndicator dir={p.abnormal_direction} />
  </td>
)}
{chartMode === 'on' && (
  <td className="px-2 py-1">
    {hasMeasuredVal && hasValidRange(p.ll, p.ul) ? (
      <RangeChart
        measured={measured!}
        ll={p.ll!}
        ul={p.ul!}
        direction={p.abnormal_direction}
        rangeStart={
          (rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeStart
        }
        rangeWidth={
          (rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeWidth
        }
      />
    ) : null}
  </td>
)}
```

- [ ] **Step 2: Verify the page compiles with no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Verify the page renders correctly**

1. Open http://localhost:5173/cmr-new-report
2. Confirm "Table Only" mode looks identical to before
3. Click "Charts" toggle
4. Confirm Direction column disappears, chart column appears on the right
5. Without measured data, chart cells should be empty — this is correct

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/cmr-new-report-page.tsx
git commit -m "feat(cmr): wire range charts into table data rows"
```

---

### Task 5: Verify everything works end-to-end

- [ ] **Step 1: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: Clean (no errors in cmr files)

- [ ] **Step 2: Visual verification**

1. Open http://localhost:5173/cmr-new-report
2. Toggle "Table Only" → "Charts" — table should compress, chart column appears
3. Toggle back → table restores to full width with Direction column
4. Test all filter combinations work with charts on:
   - All Metrics + Charts
   - Recorded Only + Charts
   - Indexed Only + Charts
5. Test chart controls (will only show visual effect once measured data is loaded via Upload Report):
   - Global auto-adjust button
   - Per-measurement auto-adjust button
   - Slider drag
   - Reset button

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(cmr): complete inline range charts with auto-adjust controls"
```

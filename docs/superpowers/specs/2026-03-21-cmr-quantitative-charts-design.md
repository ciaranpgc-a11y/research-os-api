# CMR Quantitative Page — Inline Range Charts

## Overview

Add an inline range chart panel to the right side of the quantitative parameter table. Each row with a measured value gets a horizontal mini-chart showing the normal range (LL→UL) as a green band and the measured value as a colored dot. The chart panel is toggled on/off via a pill toggle in the top control bar.

## Layout

- **New pill toggle** in the existing top control bar: "Table Only" (default) / "Charts"
- **When Charts is off**: table renders exactly as it does today (full width, Direction column visible)
- **When Charts is on**:
  - Table compresses to ~70% width
  - Direction column is hidden
  - Chart column is added as the last column of the existing `<table>` element (no separate panel — this gives scroll sync for free)
  - Chart column width: ~30% of the table

## Chart Rendering

Each table row that has a measured value renders a small horizontal chart in the chart column. Rows without a measured value show an empty cell.

### Edge cases for missing reference data
- If both LL and UL are null: no chart rendered (empty cell), even if measured value exists
- If only one of LL/UL is null: no chart rendered (need both bounds to define a range)
- If UL === LL: no chart rendered (degenerate range)

### Visual elements
- **Green band**: shaded region from LL to UL (the normal range), positioned on a normalized visual axis (0→1) according to `range_start` and `range_width`
- **Colored dot**: the measured value, positioned at `measured_pos` on the same normalized axis
  - Green dot: value is within normal range (per `abnormal_direction` rules)
  - Red dot: value is abnormal (per `abnormal_direction` rules)
  - Note: for `abnormal_direction === 'high'`, a value below LL is technically outside the green band visually but is NOT abnormal — the dot is green. This is intentional: clinical abnormality follows direction rules, not just band position.
- Dot position clamped to `[0.05, 0.95]` so extreme values remain visible at the edges

### Scaling model (ported from Excel `mod_OUTPUT_tracker_cust`)

Two coordinate systems:
1. **`measured_rel`** (domain space): the measured value's relative position within the LL→UL range. Unbounded — can be negative or >1 for values outside the normal range.
   - `measured_rel = (measured - LL) / (UL - LL)`
2. **`measured_pos`** (visual space): where the dot appears on the normalized 0→1 visual axis.
   - `measured_pos = clamp(range_start + range_width * measured_rel, 0.05, 0.95)`

Factory baseline: `range_start = 0.3`, `range_width = 0.4` — the green band occupies positions 0.3→0.7 on the visual axis (the middle 40%).

## Chart Panel Controls

A small control strip at the top of the chart column (in the `<thead>` area):

### 1. Global auto-adjust
Scales all charts uniformly so that the spread of measured values fits the visual range.

**Algorithm:**
1. Collect all `measured_rel` values from eligible rows (rows with measured value + valid LL/UL)
2. If fewer than 5 values, do nothing (insufficient data)
3. Sort values, compute `rel_lo = P5` and `rel_hi = P95` using linear interpolation: `percentile(arr, q) = arr[floor(pos)] + frac(pos) * (arr[ceil(pos)] - arr[floor(pos)])` where `pos = (n-1) * q`
4. If `rel_hi <= rel_lo`, do nothing (degenerate)
5. Compute: `range_width = (X_MAX - X_MIN) / (rel_hi - rel_lo)`, `range_start = X_MIN - range_width * rel_lo`
6. Clamp and round both to `[0.000001, 1)` with step `0.01`
7. Apply the same `range_start` + `range_width` to all eligible rows

### 2. Per-measurement auto-adjust
For rows with extreme outliers, individually rescales so the dot lands near the edge.

**Algorithm per row:**
1. If the row has no measured value or no valid LL/UL: reset to factory baseline
2. Compute `measured_rel`
3. If `measured_rel <= -0.5` (extreme low) or `measured_rel >= 1.5` (extreme high): rescale so the dot lands at `0.1` (low) or `0.9` (high) on the visual axis, shrinking `range_width` as needed but never below `0.05`
4. If not extreme: reset to factory baseline

### 3. Manual slider
Scales `range_width` around the factory midpoint.

**Formula:**
- Slider position `s` is an integer in `[-50, +50]`, default `0`
- Factor `k = 2^(s / 50)` — at `s=0` → `k=1` (no change); `s=50` → `k=2` (double width); `s=-50` → `k=0.5` (half width)
- New `range_width = clamp(FACTORY_RANGE_WIDTH * k, 0.000001, 0.999999)`, rounded to step `0.01`
- New `range_start = factory_midpoint - range_width / 2`, where `factory_midpoint = FACTORY_RANGE_START + FACTORY_RANGE_WIDTH / 2 = 0.5`
- Clamp `range_start` to `[0.000001, 1 - range_width]`
- Applied uniformly to all eligible rows

### 4. Reset button
Restores all rows to factory baseline (`range_start = 0.3`, `range_width = 0.4`) and resets slider to `0`.

### Control interaction priority
- Each control action (global auto-adjust, per-measurement, slider, reset) fully replaces the current `rangeParams` state — they do not stack
- Moving the slider after an auto-adjust overrides it
- Reset clears everything back to factory

### Constants (from Excel)
```
FACTORY_RANGE_START = 0.3
FACTORY_RANGE_WIDTH = 0.4
X_MIN = 0.05
X_MAX = 0.95
ROUND_STEP = 0.01
REL_EXTREME_THRESHOLD = 0.5
GLOBAL_Q_LOW = 0.05
GLOBAL_Q_HIGH = 0.95
SLIDER_MIN = -50
SLIDER_MAX = 50
```

## State Management

All chart scaling state is local React state (no persistence needed):
- `chartMode: 'off' | 'on'` — toggle for showing/hiding charts
- `rangeParams: Map<string, { rangeStart: number; rangeWidth: number }>` — per-parameter scaling overrides (defaults to factory baseline)
- `sliderValue: number` — manual slider position (integer, -50 to +50)

## Interaction with Existing Filters

- The chart panel respects all existing filters (Pap mode, All Metrics / Recorded Only, All / Indexed Only)
- Charts only render for rows that are visible after filtering AND have a measured value AND have valid LL + UL

## Implementation Scope

All changes are within `cmr-new-report-page.tsx`:
- Add `chartMode` state and pill toggle
- Add chart scaling logic (pure functions, ported from VBA)
- Add chart column to existing `<table>` with inline SVG rendering per row
- Add chart control strip in the `<thead>` of the chart column
- Conditionally hide Direction column and add chart column when charts are on
- Adjust `<colgroup>` widths when chart mode is active

No new files, no API changes, no new dependencies.

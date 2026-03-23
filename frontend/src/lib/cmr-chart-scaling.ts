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

/** Visual position on the 0→1 axis. Clamped to [0, 1] so dots pin at the container edge. */
export function computeMeasuredPos(
  measuredRel: number,
  rangeStart: number,
  rangeWidth: number,
): number {
  return clamp(rangeStart + rangeWidth * measuredRel, 0, 1)
}

/**
 * Constrain a RangeParam so that ALL provided measuredRel values produce
 * dot positions within [0, 1]. Prevents zooming past the point where any
 * dot would leave the visible area.
 *
 * For centered scaling (slider): caps rangeWidth so the most extreme dot
 * stays at the container edge, then re-centers.
 *
 * For arbitrary rangeStart (global auto): caps rangeWidth, then adjusts
 * rangeStart so both the min and max dots stay in bounds.
 */
export function constrainRange(rp: RangeParam, measuredRels: number[]): RangeParam {
  if (measuredRels.length === 0) return rp
  let { rangeStart: rs, rangeWidth: rw } = rp

  const minRel = Math.min(...measuredRels)
  const maxRel = Math.max(...measuredRels)

  // Cap rangeWidth so the span from minRel→maxRel fits within [0, 1]:
  //   rs + rw * minRel >= 0  AND  rs + rw * maxRel <= 1
  //   ⟹  rw * (maxRel - minRel) <= 1
  if (maxRel > minRel) {
    const maxRw = 1 / (maxRel - minRel)
    if (rw > maxRw) rw = maxRw
  }

  // Adjust rangeStart so no dot goes outside [0, 1]
  const leftBound = -rw * minRel          // rs must be >= this
  const rightBound = 1 - rw * maxRel      // rs must be <= this
  rs = clamp(rs, leftBound, rightBound)

  return { rangeStart: roundToStep(rs, ROUND_STEP), rangeWidth: roundToStep(rw, ROUND_STEP) }
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
  const rw = roundToStep(FACTORY_RANGE_WIDTH * k, ROUND_STEP)
  const rs = roundToStep(factoryMid - rw / 2, ROUND_STEP)
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
  const rw = roundToStep((X_MAX - X_MIN) / (relHi - relLo), ROUND_STEP)
  const rs = roundToStep(X_MIN - rw * relLo, ROUND_STEP)
  return { rangeStart: rs, rangeWidth: rw }
}

// ---------------------------------------------------------------------------
// Per-measurement auto-adjust
// ---------------------------------------------------------------------------

const PER_MEAS_TARGET_LO = 0.1
const PER_MEAS_TARGET_HI = 0.9
const PER_MEAS_MIN_WIDTH = 0.05

/**
 * Per-measurement auto-adjust: compute a custom RangeParam for each row
 * that optimally positions the dot relative to the reference band.
 *
 * - Normal values (rel ~0.5): dot centered, band spans middle of bar
 * - Mildly abnormal (rel ~1.2): band shifts left, dot sits right of band
 * - Severely abnormal (rel ~3.0): band compressed left, dot near right edge
 * - Below range (rel ~-0.5): band shifts right, dot sits left of band
 *
 * The goal: each row is independently scaled to best visualise WHERE
 * the measured value sits relative to its own reference range.
 */
export function perMeasurementAutoAdjust(measuredRel: number): RangeParam {
  // Target: place the dot at a position that gives good visual context
  // For normal values (rel 0–1), dot should be within the band
  // For abnormal values, dot should be outside but visible with context

  // Strategy: place the dot at a target position, then derive band scaling.
  // The further from normal, the more the band compresses and the dot pushes to the edge.

  let rw: number
  let rs: number

  if (measuredRel >= -0.3 && measuredRel <= 1.3) {
    // Within or near range: factory baseline — band reflects the true LL-to-UL proportionally
    rw = FACTORY_RANGE_WIDTH
    rs = FACTORY_RANGE_START
  } else if (measuredRel > 1.3) {
    // Above range: keep the band shape but stretch the chart so the dot
    // doesn't clip. Place the dot at ~85% of the bar.
    // dot = rs + rw * measuredRel = 0.85
    // Keep rs = 0.05 so LL is visible at the left edge
    rs = 0.05
    rw = 0.80 / measuredRel
  } else {
    // Below range: mirror — dot at ~15%, UL visible at right
    // dot = rs + rw * measuredRel = 0.15
    // UL = rs + rw * 1 = 0.95
    rw = 0.80 / (1 - measuredRel)
    rs = 0.95 - rw
  }

  rs = roundToStep(clamp(rs, 0.02, 0.6), ROUND_STEP)
  rw = roundToStep(clamp(rw, PER_MEAS_MIN_WIDTH, 0.7), ROUND_STEP)

  return { rangeStart: rs, rangeWidth: rw }
}

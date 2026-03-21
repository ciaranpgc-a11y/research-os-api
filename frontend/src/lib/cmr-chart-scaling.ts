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
    rw = clamp(Math.min(FACTORY_RANGE_WIDTH, rwMax), PER_MEAS_MIN_WIDTH, FACTORY_RANGE_WIDTH)
    rw = roundToStep(rw, ROUND_STEP)
    rs = roundToStep(PER_MEAS_TARGET_HI - rw * measuredRel, ROUND_STEP)
  } else {
    // Extreme low — place dot at PER_MEAS_TARGET_LO
    const d = Math.abs(measuredRel)
    const rwMax = (1 - PER_MEAS_TARGET_LO) / (1 + d)
    rw = clamp(Math.min(FACTORY_RANGE_WIDTH, rwMax), PER_MEAS_MIN_WIDTH, FACTORY_RANGE_WIDTH)
    rw = roundToStep(rw, ROUND_STEP)
    rs = roundToStep(PER_MEAS_TARGET_LO - rw * measuredRel, ROUND_STEP)
  }

  return { rangeStart: rs, rangeWidth: rw }
}

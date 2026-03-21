import { describe, it, expect } from 'vitest'
import { computeSeverity } from '../src/lib/cmr-severity'

describe('computeSeverity', () => {
  // Gate check: normal values never get severity grading
  it('returns normal when value is within LL-UL range', () => {
    const result = computeSeverity(60, 53, 79, 5, 'low', 'impaired', null, null)
    expect(result).toEqual({ grade: 'normal', label: 'Normal' })
  })

  // LVEF with absolute thresholds, direction: low
  it('grades LVEF mild impairment with absolute thresholds', () => {
    const result = computeSeverity(45, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly impaired' })
  })

  it('grades LVEF moderate impairment with absolute thresholds', () => {
    const result = computeSeverity(35, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderately impaired' })
  })

  it('grades LVEF severe impairment with absolute thresholds', () => {
    const result = computeSeverity(25, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severely impaired' })
  })

  // SD-based fallback, direction: high (e.g., dilated volume)
  it('grades mild with SD fallback (0-1 SD beyond UL)', () => {
    const result = computeSeverity(112, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('grades moderate with SD fallback (1-2 SD beyond UL)', () => {
    const result = computeSeverity(125, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderately dilated' })
  })

  it('grades severe with SD fallback (>2 SD beyond UL)', () => {
    const result = computeSeverity(135, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severely dilated' })
  })

  // SD null or zero or negative → default to mild
  it('defaults to mild when SD is null', () => {
    const result = computeSeverity(112, 48, 108, null, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('defaults to mild when SD is zero', () => {
    const result = computeSeverity(112, 48, 108, 0, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('defaults to mild when SD is negative', () => {
    const result = computeSeverity(112, 48, 108, -5, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  // Direction "both" — breached high
  it('handles both direction, breached high', () => {
    const result = computeSeverity(115, 48, 108, 10, 'both', 'abnormal', null, null)
    expect(result.grade).toBe('mild')
  })

  // Direction "both" — breached low
  it('handles both direction, breached low', () => {
    const result = computeSeverity(40, 48, 108, 10, 'both', 'abnormal', null, null)
    expect(result.grade).toBe('mild')
  })

  // Direction-dependent label resolution for "both" direction
  it('produces "Mildly elevated" for direction-dependent parameter breaching high', () => {
    const result = computeSeverity(115, 48, 108, 10, 'both', 'elevated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly elevated' })
  })

  it('produces "Mildly reduced" for direction-dependent parameter breaching low', () => {
    const result = computeSeverity(40, 48, 108, 10, 'both', 'elevated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly reduced' })
  })

  // Noun-form labels (stenosis, regurgitation) use adjective form
  it('uses noun-form label for stenosis', () => {
    // 1.3 is 1.5 SDs above UL of 1.0 (sd=0.2): (1.3-1.0)/0.2 = 1.5 → moderate
    const result = computeSeverity(1.3, null, 1.0, 0.2, 'high', 'stenosis', null, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderate stenosis' })
  })

  it('uses noun-form label for regurgitation', () => {
    const result = computeSeverity(55, null, 40, 5, 'high', 'regurgitation', null, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severe regurgitation' })
  })

  // Label override
  it('uses severity_label_override when provided', () => {
    const result = computeSeverity(45, 53, 79, 5, 'low', 'impaired',
      { mild: 41, moderate: 30, severe: null },
      { mild: 'Mildly reduced EF', moderate: null, severe: null })
    expect(result).toEqual({ grade: 'mild', label: 'Mildly reduced EF' })
  })

  // Partially-set thresholds: mild set, moderate null → fall back to SD for deeper grades
  it('falls back to SD for moderate when only mild threshold is set', () => {
    const result = computeSeverity(35, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: null, severe: null }, null)
    expect(result.grade).toBe('severe')
  })

  // Boundary: value exactly at threshold → milder grade
  it('value exactly at mild threshold gets mild grade (low direction)', () => {
    const result = computeSeverity(41, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result.grade).toBe('mild')
  })
})

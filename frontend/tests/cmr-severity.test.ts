import { describe, it, expect } from 'vitest'
import { computeSeverity, inferSeverityLabel } from '../src/lib/cmr-severity'

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

describe('inferSeverityLabel', () => {
  it('infers "impaired" for LV EF', () => {
    expect(inferSeverityLabel('LV EF', 'LEFT VENTRICLE', 'LV function')).toBe('impaired')
  })

  it('infers "impaired" for RV EF', () => {
    expect(inferSeverityLabel('RV EF', 'RIGHT VENTRICLE', 'RV function')).toBe('impaired')
  })

  it('infers "dilated" for LV EDV', () => {
    expect(inferSeverityLabel('LV EDV', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('dilated')
  })

  it('infers "dilated" for LV EDV (i)', () => {
    expect(inferSeverityLabel('LV EDV (i)', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('dilated')
  })

  it('infers "enlarged" for LA max volume', () => {
    expect(inferSeverityLabel('LA max volume', 'LEFT ATRIUM', 'LA volume')).toBe('enlarged')
  })

  it('infers "enlarged" for RA max area (4ch)', () => {
    expect(inferSeverityLabel('RA max area (4ch)', 'RIGHT ATRIUM', 'RA area')).toBe('enlarged')
  })

  it('infers "hypertrophied" for LV mass', () => {
    expect(inferSeverityLabel('LV mass', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('hypertrophied')
  })

  it('infers "hypertrophied" for LV mass (i)', () => {
    expect(inferSeverityLabel('LV mass (i)', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('hypertrophied')
  })

  it('infers "thickened" for LV peak wall thickness', () => {
    expect(inferSeverityLabel('LV peak wall thickness', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('thickened')
  })

  it('infers "regurgitation" for AV regurgitant fraction', () => {
    expect(inferSeverityLabel('AV regurgitant fraction', 'AORTIC VALVE', '')).toBe('regurgitation')
  })

  it('infers "regurgitation" for MR regurgitant fraction', () => {
    expect(inferSeverityLabel('MR regurgitant fraction', 'MITRAL VALVE', '')).toBe('regurgitation')
  })

  it('infers "dilated" for aortic sinus diameter', () => {
    expect(inferSeverityLabel('Aortic sinus diameter', 'AORTA', '')).toBe('dilated')
  })

  it('infers "dilated" for MPA diameter', () => {
    expect(inferSeverityLabel('MPA systolic diameter', 'PULMONARY ARTERY', '')).toBe('dilated')
  })

  it('infers "impaired" for MAPSE', () => {
    expect(inferSeverityLabel('MAPSE', 'LEFT VENTRICLE', 'LV function')).toBe('impaired')
  })

  it('infers "impaired" for TAPSE', () => {
    expect(inferSeverityLabel('TAPSE', 'RIGHT VENTRICLE', 'RV function')).toBe('impaired')
  })

  it('infers "elevated" for PCWP', () => {
    expect(inferSeverityLabel('PCWP', 'FLOW', '')).toBe('elevated')
  })

  it('infers "elevated" for LV CO (direction-dependent)', () => {
    expect(inferSeverityLabel('LV CO', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for LV CI (direction-dependent)', () => {
    expect(inferSeverityLabel('LV CI', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for LV SV (direction-dependent)', () => {
    expect(inferSeverityLabel('LV SV', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for RV SV (i) (direction-dependent)', () => {
    expect(inferSeverityLabel('RV SV (i)', 'RIGHT VENTRICLE', 'RV function')).toBe('elevated')
  })

  it('infers "dilated" for ascending aorta (without "diameter" in name)', () => {
    expect(inferSeverityLabel('Ascending aorta', 'AORTA', '')).toBe('dilated')
  })

  it('infers "abnormal" for unknown parameters', () => {
    expect(inferSeverityLabel('Something unknown', 'OTHER', '')).toBe('abnormal')
  })
})

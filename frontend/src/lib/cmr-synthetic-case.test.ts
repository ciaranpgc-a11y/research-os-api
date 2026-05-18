import { describe, expect, it } from 'vitest'

import {
  buildRandomSyntheticCmrCase,
  buildSyntheticCmrCase,
  CMR_SYNTHETIC_CASE_LIBRARY,
} from '@/lib/cmr-synthetic-case'

describe('CMR synthetic case library', () => {
  it('contains 100 unique common cases', () => {
    expect(CMR_SYNTHETIC_CASE_LIBRARY).toHaveLength(100)

    const ids = CMR_SYNTHETIC_CASE_LIBRARY.map((item) => item.id)
    expect(new Set(ids).size).toBe(100)
  })

  it('seeds a stress case across perfusion, lge and rwma', () => {
    const syntheticCase = buildSyntheticCmrCase('stress-rca-scar-1')

    expect(syntheticCase.payload.reportInput.reportType).toBe('stress')
    expect(syntheticCase.payload.reportInput.reportText.length).toBeGreaterThan(0)
    expect(syntheticCase.payload.extractionResult?.measurements.length ?? 0).toBeGreaterThan(0)
    expect(syntheticCase.payload.perfusion.llmProse).toBeTruthy()
    expect(syntheticCase.payload.lge.llmProse).toBeTruthy()
    expect(syntheticCase.payload.rwma.llmProse).toBeTruthy()
  })

  it('seeds valve, ph and thrombus modules when present', () => {
    const valveCase = buildSyntheticCmrCase('valve-degenerative-mr-1')
    const phCase = buildSyntheticCmrCase('ph-advanced-1')
    const thrombusCase = buildSyntheticCmrCase('thrombus-lv-apical-1')

    expect(valveCase.payload.valves.summaries.mitral.llmProse).toBeTruthy()
    expect(phCase.payload.ph.llmProse).toBeTruthy()
    expect(thrombusCase.payload.thrombus.llmProse).toBeTruthy()
    expect(thrombusCase.payload.thrombus.entries).toHaveLength(1)
    expect(thrombusCase.payload.thrombus.entries[0]?.primary).toBe('LV')
  })

  it('can generate a random full synthetic case', () => {
    const syntheticCase = buildRandomSyntheticCmrCase()

    expect(syntheticCase.definition.id).toBeTruthy()
    expect(syntheticCase.payload.reportInput.reportText.length).toBeGreaterThan(0)
    expect(syntheticCase.payload.extractionResult?.measurements.length ?? 0).toBeGreaterThan(0)
  })
})

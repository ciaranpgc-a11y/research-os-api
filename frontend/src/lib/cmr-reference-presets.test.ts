import { describe, expect, it } from 'vitest'

import type { CmrCanonicalParam } from '@/lib/cmr-api'
import { applyCmrReferencePreset, isCmrReferencePresetAppliedToParameter } from '@/lib/cmr-reference-presets'

function param(parameter_key: string, values: Partial<CmrCanonicalParam> = {}): CmrCanonicalParam {
  return {
    parameter_key,
    unit: 'mL',
    indexing: 'None',
    abnormal_direction: 'high',
    major_section: 'LEFT VENTRICLE',
    sub_section: '',
    sort_order: 0,
    ll: 1,
    mean: 2,
    ul: 3,
    sd: 0.5,
    age_band: 'Adult',
    pap_differs: false,
    sources: [],
    ...values,
  }
}

describe('applyCmrReferencePreset', () => {
  it('leaves ranges unchanged for the standard preset', () => {
    const parameters = [
      param('LV EDV'),
      param('TAPSE', { ll: 16, mean: 22, ul: 28 }),
    ]

    expect(applyCmrReferencePreset(parameters, 'Female', 'standard')).toEqual(parameters)
  })

  it('applies female NNUH ranges to listed quantitative parameters only', () => {
    const parameters = [
      param('LV EDV'),
      param('LV EF', { unit: '%' }),
      param('TAPSE', { ll: 16, mean: 22, ul: 28 }),
    ]

    const result = applyCmrReferencePreset(parameters, 'Female', 'nnuh')

    expect(result[0]).toMatchObject({
      parameter_key: 'LV EDV',
      ll: 78,
      mean: 123,
      ul: 167,
      sd: 22.25,
      age_band: 'NNUH Preset',
    })
    expect(result[1]).toMatchObject({
      parameter_key: 'LV EF',
      ll: 52,
      mean: 66,
      ul: 79,
      sd: 6.75,
      age_band: 'NNUH Preset',
    })
    expect(result[2]).toMatchObject({
      parameter_key: 'TAPSE',
      ll: 16,
      mean: 22,
      ul: 28,
      age_band: 'Adult',
    })
  })

  it('applies male NNUH ranges to RV and LA listed parameters', () => {
    const parameters = [
      param('RV EDV (i)'),
      param('LA max volume'),
    ]

    const result = applyCmrReferencePreset(parameters, 'Male', 'nnuh')

    expect(result[0]).toMatchObject({
      parameter_key: 'RV EDV (i)',
      ll: 58,
      mean: 83,
      ul: 109,
      sd: 12.75,
      age_band: 'NNUH Preset',
    })
    expect(result[1]).toMatchObject({
      parameter_key: 'LA max volume',
      ll: 31,
      mean: 72,
      ul: 112,
      sd: 20.25,
      age_band: 'NNUH Preset',
    })
  })

  it('applies sex-neutral NNUH tissue mapping ranges', () => {
    const parameters = [
      param('ECV', { unit: '%' }),
      param('Native T2', { unit: 'ms' }),
    ]

    const result = applyCmrReferencePreset(parameters, 'Female', 'nnuh')

    expect(result[0]).toMatchObject({
      parameter_key: 'ECV',
      ll: 22,
      mean: 24,
      ul: 26,
      sd: 1,
      age_band: 'NNUH Preset',
    })
    expect(result[1]).toMatchObject({
      parameter_key: 'Native T2',
      ll: 25,
      mean: 45,
      ul: 65,
      sd: 10,
      age_band: 'NNUH Preset',
    })
  })

  it('identifies only rows affected by the active NNUH preset', () => {
    expect(isCmrReferencePresetAppliedToParameter('LV EDV', 'Male', 'nnuh')).toBe(true)
    expect(isCmrReferencePresetAppliedToParameter('RV SV (i)', 'Female', 'nnuh')).toBe(true)
    expect(isCmrReferencePresetAppliedToParameter('ECV', 'Female', 'nnuh')).toBe(true)
    expect(isCmrReferencePresetAppliedToParameter('LV EDV', 'Male', 'standard')).toBe(false)
    expect(isCmrReferencePresetAppliedToParameter('TAPSE', 'Male', 'nnuh')).toBe(false)
  })
})

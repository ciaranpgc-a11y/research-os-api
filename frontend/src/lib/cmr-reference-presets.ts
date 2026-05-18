import type { CmrCanonicalParam, CmrSourceCitation } from '@/lib/cmr-api'

export type CmrReferencePreset = 'standard' | 'nnuh'

export const CMR_REFERENCE_PRESET_LABELS: Record<CmrReferencePreset, string> = {
  standard: 'Standard',
  nnuh: 'NNUH Preset',
}

type BinarySex = 'Female' | 'Male'

type ReferenceRange = {
  ll: number
  mean: number
  ul: number
}

const NNUH_REFERENCE_SOURCE: CmrSourceCitation = {
  short_ref: 'NNUH Preset',
  title: 'NNUH local CMR reference ranges',
  authors: 'Norfolk and Norwich University Hospitals',
  journal: 'Local reference preset',
  doi: 'nnuh-preset',
  url: 'https://www.nnuh.nhs.uk/',
}

const NNUH_REFERENCE_RANGES: Record<BinarySex, Record<string, ReferenceRange>> = {
  Female: {
    'LV EDV': { mean: 123, ll: 78, ul: 167 },
    'LV ESV': { mean: 43, ll: 21, ul: 64 },
    'LV SV': { mean: 83, ll: 52, ul: 114 },
    'LV mass': { mean: 83, ll: 41, ul: 125 },
    'LV EF': { mean: 66, ll: 52, ul: 79 },
    'LV EDV (i)': { mean: 73, ll: 50, ul: 96 },
    'LV ESV (i)': { mean: 25, ll: 10, ul: 40 },
    'LV SV (i)': { mean: 49, ll: 33, ul: 64 },
    'LV mass (i)': { mean: 49, ll: 30, ul: 68 },
    ECV: { mean: 24, ll: 22, ul: 26 },
    'Native T2': { mean: 45, ll: 25, ul: 65 },
    'LA max volume': { mean: 64, ll: 28, ul: 100 },
    'RV EDV': { mean: 127, ll: 79, ul: 175 },
    'RV ESV': { mean: 44, ll: 13, ul: 75 },
    'RV SV': { mean: 83, ll: 56, ul: 110 },
    'RV EF': { mean: 62, ll: 48, ul: 80 },
    'RV EDV (i)': { mean: 74, ll: 51, ul: 97 },
    'RV ESV (i)': { mean: 26, ll: 9, ul: 42 },
    'RV SV (i)': { mean: 48, ll: 35, ul: 61 },
  },
  Male: {
    'LV EDV': { mean: 155, ll: 95, ul: 215 },
    'LV ESV': { mean: 55, ll: 25, ul: 85 },
    'LV SV': { mean: 103, ll: 61, ul: 145 },
    'LV mass': { mean: 121, ll: 66, ul: 176 },
    'LV EF': { mean: 64, ll: 49, ul: 79 },
    'LV EDV (i)': { mean: 79, ll: 50, ul: 108 },
    'LV ESV (i)': { mean: 29, ll: 11, ul: 47 },
    'LV SV (i)': { mean: 52, ll: 33, ul: 72 },
    'LV mass (i)': { mean: 62, ll: 39, ul: 85 },
    ECV: { mean: 24, ll: 22, ul: 26 },
    'Native T2': { mean: 45, ll: 25, ul: 65 },
    'LA max volume': { mean: 72, ll: 31, ul: 112 },
    'RV EDV': { mean: 163, ll: 109, ul: 217 },
    'RV ESV': { mean: 57, ll: 23, ul: 91 },
    'RV SV': { mean: 106, ll: 71, ul: 141 },
    'RV EF': { mean: 60, ll: 45, ul: 80 },
    'RV EDV (i)': { mean: 83, ll: 58, ul: 109 },
    'RV ESV (i)': { mean: 29, ll: 12, ul: 46 },
    'RV SV (i)': { mean: 54, ll: 38, ul: 71 },
  },
}

export function normalizeCmrReferencePreset(value: unknown): CmrReferencePreset {
  return value === 'nnuh' ? 'nnuh' : 'standard'
}

function normalizeSex(sex: string): BinarySex {
  return sex.trim().toLowerCase().startsWith('f') ? 'Female' : 'Male'
}

function deriveSd(range: ReferenceRange): number {
  return (range.ul - range.ll) / 4
}

export function applyCmrReferencePreset(
  parameters: readonly CmrCanonicalParam[],
  sex: string,
  preset: CmrReferencePreset,
): CmrCanonicalParam[] {
  if (preset !== 'nnuh') return [...parameters]

  const ranges = NNUH_REFERENCE_RANGES[normalizeSex(sex)]
  return parameters.map((parameter) => {
    const range = ranges[parameter.parameter_key]
    if (!range) return parameter

    return {
      ...parameter,
      ll: range.ll,
      mean: range.mean,
      ul: range.ul,
      sd: deriveSd(range),
      age_band: CMR_REFERENCE_PRESET_LABELS.nnuh,
      sources: [NNUH_REFERENCE_SOURCE],
    }
  })
}

export function isCmrReferencePresetAppliedToParameter(
  parameterKey: string,
  sex: string,
  preset: CmrReferencePreset,
): boolean {
  if (preset !== 'nnuh') return false
  const ranges = NNUH_REFERENCE_RANGES[normalizeSex(sex)]
  return ranges[parameterKey] !== undefined
}

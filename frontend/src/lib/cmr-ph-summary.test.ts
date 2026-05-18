import { describe, expect, it } from 'vitest'

import type { CmrCanonicalParam } from '@/lib/cmr-api'
import {
  buildPhSummaryData,
  buildPhSummarySignature,
  normalizePhRegurgitationChoice,
  type PhSummaryChoices,
} from '@/lib/cmr-ph-summary'

function createCanonicalParam(
  parameterKey: string,
  majorSection: string,
  subSection: string,
  abnormalDirection: string,
  ll: number | null,
  ul: number | null,
  sd: number | null,
): CmrCanonicalParam {
  return {
    parameter_key: parameterKey,
    unit: '',
    indexing: parameterKey.includes('(i)') ? 'BSA' : '',
    abnormal_direction: abnormalDirection,
    major_section: majorSection,
    sub_section: subSection,
    sort_order: 0,
    ll,
    mean: null,
    ul,
    sd,
    age_band: null,
    pap_differs: false,
    sources: [],
  }
}

function createCanonicalLookup(): Map<string, CmrCanonicalParam> {
  return new Map<string, CmrCanonicalParam>([
    ['RV EDV (i)', createCanonicalParam('RV EDV (i)', 'Right ventricle', 'Volumes', 'high', null, 110, 12)],
    ['RV ESV (i)', createCanonicalParam('RV ESV (i)', 'Right ventricle', 'Volumes', 'high', null, 42, 6)],
    ['RV EF', createCanonicalParam('RV EF', 'Right ventricle', 'Function', 'low', 50, null, 5)],
    ['TAPSE', createCanonicalParam('TAPSE', 'Right ventricle', 'Function', 'low', 16, null, 2)],
    ['RV mass (i)', createCanonicalParam('RV mass (i)', 'Right ventricle', 'Mass', 'high', null, 20, 3)],
    ['RV SV (i)', createCanonicalParam('RV SV (i)', 'Right ventricle', 'Volumes', 'low', 30, null, 5)],
    ['RV CI', createCanonicalParam('RV CI', 'Right ventricle', 'Output', 'low', 2.4, null, 0.3)],
    ['RA max volume (i)', createCanonicalParam('RA max volume (i)', 'Right atrium', 'Volume', 'high', null, 57, 6)],
    ['LA max volume (i)', createCanonicalParam('LA max volume (i)', 'Left atrium', 'Volume', 'high', null, 55, 10)],
    ['LV EF', createCanonicalParam('LV EF', 'Left ventricle', 'Function', 'low', 55, null, 5)],
    ['MPA systolic diameter', createCanonicalParam('MPA systolic diameter', 'Pulmonary artery', 'Calibre', 'high', null, 28, 3)],
    ['MPA distension', createCanonicalParam('MPA distension', 'Pulmonary artery', 'Flow', 'low', 20, null, 5)],
    ['PCWP', createCanonicalParam('PCWP', 'Haemodynamics', 'Filling pressure', 'high', null, 12, 3)],
    ['mRAP', createCanonicalParam('mRAP', 'Haemodynamics', 'Filling pressure', 'high', null, 8, 2)],
    ['TR regurgitant fraction', createCanonicalParam('TR regurgitant fraction', 'Tricuspid valve', 'Regurgitation', 'high', null, 10, 5)],
    ['MR regurgitant fraction', createCanonicalParam('MR regurgitant fraction', 'Mitral valve', 'Regurgitation', 'high', null, 10, 5)],
  ])
}

function createChoices(overrides: Partial<PhSummaryChoices> = {}): PhSummaryChoices {
  return {
    septalFlattening: 'none',
    septalMotion: 'normal',
    interatrialSeptalBowing: 'none',
    pericardialEffusion: 'none',
    venaCava: 'normal',
    trSeverity: 'none',
    mrSeverity: 'none',
    vortexFormation: 'absent',
    vortexSeverity: null,
    vortexLocation: 'not-specified',
    helicity: 'absent',
    helicitySeverity: null,
    helicityLocation: 'not-specified',
    ...overrides,
  }
}

describe('buildPhSummaryData', () => {
  it('builds a high-probability RV pressure-overload phenotype from combined chamber, septal, and PA findings', () => {
    const data = buildPhSummaryData(
      {
        rvEdvi: 132,
        rvEsvi: 58,
        rvEf: 38,
        tapse: 12,
        rvMassIndex: 27,
        rvSvi: 22,
        raMaxVolumeIndex: 66,
        mainPaDiameter: 34,
        paDistensibility: 8,
        trRegurgitantFraction: 28,
        vortexDurationPercent: 22,
        rpaPercent: 70,
        lpaPercent: 30,
      },
      createCanonicalLookup(),
      {
        ...createChoices({
          septalFlattening: 'both',
          septalMotion: 'paradoxical',
          interatrialSeptalBowing: 'toward-la',
          pericardialEffusion: 'small',
          venaCava: 'dilated',
          vortexFormation: 'present',
          vortexSeverity: 'marked',
          vortexLocation: 'main-pa',
          helicity: 'present',
          helicitySeverity: 'moderate',
          helicityLocation: 'rvot-mpa',
        }),
      },
    )

    expect(data.probability).toBe('high')
    expect(data.adaptation).toBe('severe-uncoupling')
    expect(data.severity).toBe('severe')
    expect(data.phenotype).toBe('rv-pa-uncoupling')
    expect(data.keyFindings).toContain('moderately dilated right ventricle (RV EDVi 132 mL/m2)')
    expect(data.rvEndSystolicVolumeIndex).toContain('RV ESVi 58 mL/m2')
    expect(data.keyFindings).toContain('severely impaired RV systolic function (RVEF 38 %)')
    expect(data.keyFindings).toContain('systolic and diastolic septal flattening with paradoxical septal motion')
    expect(data.contextualFindings).toContain('branch pulmonary flow split of RPA 70% and LPA 30%')
    expect(data.deterministicText).toContain('High probability of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling.')
    expect(data.deterministicText).toContain('Supported by')
    expect(data.deterministicText).toContain('vortical flow in the main pulmonary artery occupying 22% of the cardiac cycle and moderate helical secondary flow across the RVOT-main pulmonary artery axis, representing disorganised flow')
  })

  it('keeps left-heart dominant physiology as possible rather than moderate when right-heart support is limited', () => {
    const data = buildPhSummaryData(
      {
        laMaxVolumeIndex: 78,
        pcwp: 17,
        mrRegurgitantFraction: 24,
        rvEdvi: 118,
        mainPaDiameter: 31,
      },
      createCanonicalLookup(),
      createChoices({
        septalFlattening: 'systolic',
      }),
    )

    expect(data.probability).toBe('intermediate')
    expect(data.adaptation).toBeNull()
    expect(data.severity).toBeNull()
    expect(data.phenotype).toBe('post-capillary-or-mixed')
    expect(data.leftHeartFindings).toContain('severe left atrial enlargement')
    expect(data.leftHeartFindings).toContain('elevated estimated left-sided filling pressure')
    expect(data.leftHeartFindings).toContain('moderate mitral regurgitation')
    expect(data.deterministicText).toContain(
      'Intermediate probability of post-capillary pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure, moderate mitral regurgitation, and severe left atrial enlargement.',
    )
    expect(data.deterministicText).toContain('Systolic septal flattening indicates right-sided pressure loading.')
  })

  it('does not overcall upper-limit-normal PCWP as elevated left-sided filling pressure', () => {
    const data = buildPhSummaryData(
      {
        pcwp: 12,
        rvEdvi: 132,
        mainPaDiameter: 34,
      },
      createCanonicalLookup(),
      createChoices(),
    )

    expect(data.leftHeartFindings).not.toContain('elevated estimated left-sided filling pressure')
    expect(data.phenotype).toBe('pressure-overload-pulmonary-vascular')
    expect(data.deterministicText).not.toContain('elevated estimated left-sided filling pressure')
  })

  it('prioritises the strongest post-capillary markers and keeps corroborating right-heart findings tight', () => {
    const data = buildPhSummaryData(
      {
        laMaxVolumeIndex: 58,
        pcwp: 22,
        lvEf: 23,
        mrRegurgitantFraction: 21,
        paDistensibility: 14,
      },
      createCanonicalLookup(),
      createChoices({
        septalFlattening: 'systolic',
        septalMotion: 'dyskinetic',
        interatrialSeptalBowing: 'toward-la',
        vortexFormation: 'present',
        vortexSeverity: 'moderate',
        vortexLocation: 'main-pa',
      }),
    )

    expect(data.phenotype).toBe('post-capillary-or-mixed')
    expect(data.probability).toBe('high')
    expect(data.adaptation).toBe('stressed')
    expect(data.deterministicText).toContain('High probability of post-capillary / mixed pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure, severe LV systolic dysfunction, and moderate mitral regurgitation.')
    expect(data.deterministicText).not.toContain('mildly enlarged left atrium')
    expect(data.deterministicText).toContain('Systolic septal flattening with dyskinetic septal motion indicates right-sided pressure loading, with moderate vortical flow in the main pulmonary artery also present, representing disorganised flow.')
    expect(data.deterministicText).not.toContain('reduced pulmonary artery distensibility')
  })

  it('uses clinical LV systolic impairment bands rather than SD overcalling', () => {
    const data = buildPhSummaryData(
      {
        pcwp: 19,
        lvEf: 38,
        mrRegurgitantFraction: 21,
      },
      createCanonicalLookup(),
      createChoices(),
    )

    expect(data.deterministicText).toContain('Intermediate probability of post-capillary pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure, moderate LV systolic dysfunction, and moderate mitral regurgitation.')
    expect(data.deterministicText).not.toContain('severe LV systolic dysfunction')
  })

  it('does not overcall isolated RV remodelling as high-support uncoupling physiology', () => {
    const data = buildPhSummaryData(
      {
        rvEdvi: 132,
        rvEf: 42,
      },
      createCanonicalLookup(),
      createChoices(),
    )

    expect(data.probability).toBe('intermediate')
    expect(data.phenotype).toBe('early-pressure-overload')
    expect(data.adaptation).toBe('stressed')
    expect(data.deterministicText).toContain('Intermediate probability of pulmonary hypertension physiology with early right-sided pressure loading.')
  })

  it('does not let reduced TAPSE and weak left-heart context overcall uncoupling when objective RV function is preserved', () => {
    const data = buildPhSummaryData(
      {
        rvEdvi: 132,
        rvEf: 55,
        tapse: 11,
        mainPaDiameter: 34,
        pcwp: 19,
      },
      createCanonicalLookup(),
      createChoices({
        pericardialEffusion: 'small',
        trSeverity: 'severe',
      }),
    )

    expect(data.probability).toBe('high')
    expect(data.phenotype).toBe('pressure-overload-pulmonary-vascular')
    expect(data.adaptation).toBe('stressed')
    expect(data.deterministicText).not.toContain('uncoupling')
    expect(data.deterministicText).not.toContain('elevated estimated left-sided filling pressure')
  })

  it('does not let isolated 4D-flow features create convincing PH support on their own', () => {
    const data = buildPhSummaryData(
      {},
      createCanonicalLookup(),
      createChoices({
        vortexFormation: 'present',
        vortexSeverity: 'marked',
        vortexLocation: 'main-pa',
        helicity: 'present',
        helicitySeverity: 'moderate',
        helicityLocation: 'central-mpa',
      }),
    )

    expect(data.probability).toBe('low')
    expect(data.phenotype).toBe('no-definite-ph')
    expect(data.deterministicText).toContain('Marked vortical flow in the main pulmonary artery and moderate helical secondary flow within the main pulmonary artery are present, representing disorganised flow')
    expect(data.deterministicText).toContain('isolated flow markers')
  })

  it('does not invent a generic pulmonary artery location when 4D-flow location is unspecified', () => {
    const data = buildPhSummaryData(
      {},
      createCanonicalLookup(),
      createChoices({
        vortexFormation: 'present',
        vortexSeverity: 'marked',
        helicity: 'present',
        helicitySeverity: 'moderate',
      }),
    )

    expect(data.deterministicText).toContain('Marked vortical flow and moderate helical secondary flow are present, representing disorganised flow')
    expect(data.deterministicText).not.toContain('pulmonary arteries')
  })

  it('returns a low-probability summary when no convincing PH phenotype is present', () => {
    const data = buildPhSummaryData(
      {},
      createCanonicalLookup(),
      createChoices(),
    )

    expect(data.probability).toBe('low')
    expect(data.phenotype).toBe('no-definite-ph')
    expect(data.deterministicText).toContain('Low probability of pulmonary hypertension physiology.')
  })
  it('uses manual TR and MR severity choices when quantitative regurgitant fraction is unavailable', () => {
    const data = buildPhSummaryData(
      {
        pcwp: 17,
      },
      createCanonicalLookup(),
      createChoices({
        trSeverity: 'severe',
        mrSeverity: 'moderate',
      }),
    )

    expect(data.rvMaladaptationFindings).toContain('severe tricuspid regurgitation')
    expect(data.leftHeartFindings).toContain('elevated estimated left-sided filling pressure')
    expect(data.leftHeartFindings).toContain('moderate mitral regurgitation')
  })

  it('normalizes legacy trace valve choices', () => {
    expect(normalizePhRegurgitationChoice('trace')).toBe('trivial')
  })
})

describe('buildPhSummarySignature', () => {
  it('changes when the physiology classification changes', () => {
    const base = buildPhSummaryData(
      {
        rvEdvi: 120,
      },
      createCanonicalLookup(),
      createChoices(),
    )
    const updated = buildPhSummaryData(
      {
        rvEdvi: 132,
        rvEf: 38,
        tapse: 12,
        rvMassIndex: 25,
      },
      createCanonicalLookup(),
      createChoices({
        septalFlattening: 'both',
        septalMotion: 'paradoxical',
        interatrialSeptalBowing: 'toward-la',
        pericardialEffusion: 'small',
        venaCava: 'dilated',
        vortexFormation: 'present',
        vortexSeverity: 'marked',
      }),
    )

    expect(buildPhSummarySignature(updated)).not.toBe(buildPhSummarySignature(base))
  })
})

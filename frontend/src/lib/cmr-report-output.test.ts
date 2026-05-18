import { describe, expect, it } from 'vitest'

import type { CmrCanonicalParam } from '@/lib/cmr-api'
import {
  buildAtriaSentence,
  buildAorticValveReportText,
  buildReportConclusionSourceSignature,
  buildIntegratedIschaemiaConclusion,
  buildLvConclusionSentence,
  buildLvSentence,
  buildMitralValveReportText,
  buildReportConclusions,
  buildTricuspidValveReportText,
  buildLgeAdditionalConsiderations,
  buildLvFunctionSentence,
  buildLvSizeThicknessSentence,
  buildReportAdditionalConsiderations,
  buildRvConclusionSentence,
  buildRvSentence,
  buildValveSummarySentence,
  buildRwmaAdditionalConsiderations,
  normalizeLgeReportText,
  normalizePhReportText,
  normalizePerfusionReportText,
  normalizeReportConclusionLines,
  normalizeRwmaReportText,
  normalizeTricuspidValveReportText,
  shouldIncludeValveAssessment,
} from '@/lib/cmr-report-output'
import { buildLgeSummaryData } from '@/lib/cmr-lge-summary'
import { buildPerfusionSummaryData } from '@/lib/cmr-perfusion-summary'
import { buildRwmaSummaryData } from '@/lib/cmr-rwma-summary'

function createParam(
  parameter_key: string,
  unit: string,
  abnormal_direction: string,
  ll: number | null,
  ul: number | null,
  sd: number | null,
  sub_section: string = 'LV size and geometry',
): CmrCanonicalParam {
  return {
    parameter_key,
    unit,
    indexing: 'None',
    abnormal_direction,
    major_section: 'LEFT VENTRICLE',
    sub_section,
    sort_order: 0,
    ll,
    mean: null,
    ul,
    sd,
    age_band: null,
    pap_differs: false,
    sources: [],
    decimal_places: 0,
  }
}

describe('buildLvSizeThicknessSentence', () => {
  it('builds a normal LV size and wall thickness sentence', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
    ])

    expect(buildLvSizeThicknessSentence(measurementMap, paramMap)).toBe(
      'The LV is normal in size with normal wall thickness.',
    )
  })

  it('adds severe LVEDVi and wall thickness values in brackets when applicable', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 140],
      ['LV peak wall thickness', 18],
      ['LV mass (i)', 110],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
    ])

    expect(buildLvSizeThicknessSentence(measurementMap, paramMap)).toBe(
      'The LV is severely dilated (LV EDVi 140 mL/m2) with marked eccentric hypertrophy (maximal wall thickness 18 mm).',
    )
  })
})

describe('buildLvFunctionSentence', () => {
  it('describes preserved global and longitudinal function when both are normal', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 63],
      ['MAPSE', 14],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvFunctionSentence(measurementMap, paramMap)).toBe(
      'Global and longitudinal LV systolic function are preserved (LVEF 63%, MAPSE 14 mm).',
    )
  })

  it('combines impaired global function with reduced longitudinal function', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 42],
      ['MAPSE', 8],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvFunctionSentence(measurementMap, paramMap)).toBe(
      'Global LV systolic function is moderately impaired (LVEF 42%) with mildly reduced longitudinal function (MAPSE 8 mm).',
    )
  })

  it('falls back to the mean of septal and lateral MAPSE when global MAPSE is absent', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 58],
      ['MAPSE septal', 10],
      ['MAPSE lateral', 16],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvFunctionSentence(measurementMap, paramMap)).toBe(
      'Global and longitudinal LV systolic function are preserved (LVEF 58%, MAPSE 13 mm).',
    )
  })

  it('treats preserved LVEF with reduced MAPSE as discordant rather than contradictory', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 61],
      ['MAPSE', 7],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvFunctionSentence(measurementMap, paramMap)).toBe(
      'Global LV systolic function is preserved (LVEF 61%) with moderately reduced longitudinal function (MAPSE 7 mm).',
    )
  })

  it('keeps borderline reduced MAPSE in the mild band', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 60],
      ['MAPSE', 9],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvFunctionSentence(measurementMap, paramMap)).toBe(
      'Global LV systolic function is preserved (LVEF 60%) with mildly reduced longitudinal function (MAPSE 9 mm).',
    )
  })
})

describe('buildLvSentence', () => {
  it('combines severe morphology with severe global and longitudinal dysfunction into one LV sentence', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 140],
      ['LV peak wall thickness', 18],
      ['LV mass (i)', 110],
      ['LV EF', 24],
      ['MAPSE', 6],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildLvSentence(measurementMap, paramMap)).toBe(
      'The LV is severely dilated (LV EDVi 140 mL/m2) with marked eccentric hypertrophy (maximal wall thickness 18 mm) and severely impaired global and longitudinal systolic function (LVEF 24%, MAPSE 6 mm).',
    )
  })
})

describe('buildLvConclusionSentence', () => {
  it('builds an LV conclusion from size, thickness, and systolic function', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvConclusionSentence(measurementMap, paramMap)).toBe(
      'Preserved LV systolic function (LVEF 63%) with normal size and normal wall thickness.',
    )
  })

  it('includes severe LV remodelling details when present', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 140],
      ['LV peak wall thickness', 18],
      ['LV mass (i)', 110],
      ['LV EF', 42],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvConclusionSentence(measurementMap, paramMap)).toBe(
      'Moderate LV systolic impairment (LVEF 42%) with severe dilatation (LV EDVi 140 mL/m2) and marked eccentric hypertrophy (maximal wall thickness 18 mm).',
    )
  })

  it('lets marked concentric hypertrophy lead the morphology clause when size is normal', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 65],
      ['LV peak wall thickness', 24],
      ['LV mass (i)', 95],
      ['LV EF', 58],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 92, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 56, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvSizeThicknessSentence(measurementMap, paramMap)).toBe(
      'The LV is normal in size with marked concentric hypertrophy (maximal wall thickness 24 mm).',
    )

    expect(buildLvConclusionSentence(measurementMap, paramMap)).toBe(
      'Preserved LV systolic function (LVEF 58%) with marked concentric hypertrophy (maximal wall thickness 24 mm) and normal size.',
    )
  })

  it('describes isolated LV mass increase without the mechanical increased mass phrasing', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 84],
      ['LV peak wall thickness', 7],
      ['LV mass (i)', 62],
      ['LV EF', 56],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 92, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 56, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 54, null, 5, 'LV function')],
    ])

    expect(buildLvSizeThicknessSentence(measurementMap, paramMap)).toBe(
      'The LV is normal in size with mildly increased LV mass.',
    )

    expect(buildLvConclusionSentence(measurementMap, paramMap)).toBe(
      'Preserved LV systolic function (LVEF 56%) with normal size and mildly increased LV mass.',
    )
  })

  it('uses eccentric remodelling when LV mass is increased without increased wall thickness', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 101],
      ['LV peak wall thickness', 7],
      ['LV mass (i)', 81],
      ['LV EF', 38],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 89, 10)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 56, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvSizeThicknessSentence(measurementMap, paramMap)).toBe(
      'The LV is moderately dilated with eccentric remodelling.',
    )

    expect(buildLvConclusionSentence(measurementMap, paramMap)).toBe(
      'Moderate LV systolic impairment (LVEF 38%) with moderate dilatation and eccentric remodelling.',
    )
  })

  it('compresses RWMA into a concise regional dysfunction clause', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvConclusionSentence(measurementMap, paramMap, {
      rwmaData: buildRwmaSummaryData({ 4: 1, 10: 1 }),
    })).toBe(
      'Preserved LV systolic function (LVEF 63%) with normal size, normal wall thickness, and regional hypokinetic change in the RCA territory.',
    )
  })

  it('uses compact mixed-state wording when akinesis and dyskinesis coexist in one territory', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
    ])

    expect(buildLvConclusionSentence(measurementMap, paramMap, {
      rwmaData: buildRwmaSummaryData({ 4: 2, 10: 3 }),
    })).toBe(
      'Preserved LV systolic function (LVEF 63%) with normal size, normal wall thickness, and regional akinetic-dyskinetic change in the RCA territory.',
    )
  })
})

describe('buildRvSentence', () => {
  it('describes a non-dilated RV with preserved global and longitudinal function', () => {
    const measurementMap = new Map<string, number>([
      ['RV EDV (i)', 73],
      ['RV EF', 58],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildRvSentence(measurementMap, paramMap)).toBe(
      'The RV is not dilated, with preserved global and longitudinal systolic function (RVEF 58%, TAPSE 20 mm).',
    )
  })

  it('adds a severe RVEDVi value in brackets and uses the breathing comma style', () => {
    const measurementMap = new Map<string, number>([
      ['RV EDV (i)', 140],
      ['RV EF', 28],
      ['TAPSE', 12],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildRvSentence(measurementMap, paramMap)).toBe(
      'The RV is severely dilated (RV EDVi 140 mL/m2), with severely impaired global and longitudinal systolic function (RVEF 28%, TAPSE 12 mm).',
    )
  })

  it('treats preserved RVEF with reduced TAPSE as discordant longitudinal shortening', () => {
    const measurementMap = new Map<string, number>([
      ['RV EDV (i)', 73],
      ['RV EF', 56],
      ['TAPSE', 12],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildRvSentence(measurementMap, paramMap)).toBe(
      'The RV is not dilated, with preserved global systolic function (RVEF 56%) and markedly reduced longitudinal function (TAPSE 12 mm).',
    )
  })
})

describe('buildRvConclusionSentence', () => {
  it('builds an RV conclusion from size and systolic function', () => {
    const measurementMap = new Map<string, number>([
      ['RV EDV (i)', 73],
      ['RV EF', 58],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildRvConclusionSentence(measurementMap, paramMap)).toBe(
      'Preserved RV systolic function (RVEF 58%) with a non-dilated RV.',
    )
  })

  it('includes severe RV dilatation details when present', () => {
    const measurementMap = new Map<string, number>([
      ['RV EDV (i)', 140],
      ['RV EF', 28],
      ['TAPSE', 12],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildRvConclusionSentence(measurementMap, paramMap)).toBe(
      'Severely impaired RV systolic function (RVEF 28%) with a severely dilated RV (RV EDVi 140 mL/m2).',
    )
  })
})

describe('buildIntegratedIschaemiaConclusion', () => {
  it('builds a stress conclusion that integrates matched scar and viability', () => {
    const lgeData = buildLgeSummaryData(
      { 4: 4, 10: 3 },
      { 4: 4, 10: 1 },
    )
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: { 4: 2, 10: 1 },
      restPersistenceBeats: 0,
      stressPersistenceBeats: 8,
      adequateStress: true,
      lgeSegStates: { 4: 4, 10: 3 },
      lgePatternStates: { 4: 4, 10: 1 },
    })

    expect(buildIntegratedIschaemiaConclusion('stress', perfusionData, lgeData)).toBe(
      'No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
    )
  })

  it('builds a stress conclusion for inducible ischaemia in viable myocardium without scar', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: { 1: 1, 7: 1 },
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(buildIntegratedIschaemiaConclusion('stress', perfusionData, null)).toBe(
      'Inducible LAD territory ischaemia in viable myocardium, without infarct-pattern scar.',
    )
  })

  it('uses territory-specific viability wording for prior infarction with preserved viability', () => {
    const lgeData = buildLgeSummaryData(
      { 4: 2, 5: 1, 10: 2, 11: 1 },
      { 4: 1, 5: 1, 10: 1, 11: 1 },
    )
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: { 1: 1, 4: 1, 5: 1, 10: 1, 11: 1 },
      restPersistenceBeats: 0,
      stressPersistenceBeats: 7,
      adequateStress: true,
      lgeSegStates: { 4: 2, 5: 1, 10: 2, 11: 1 },
      lgePatternStates: { 4: 1, 5: 1, 10: 1, 11: 1 },
    })

    expect(buildIntegratedIschaemiaConclusion('stress', perfusionData, lgeData)).toBe(
      'Widespread subendocardial inducible ischaemia across the LAD, LCx, and RCA territories, consistent with multivessel disease. Prior RCA infarction with 26-50% transmural scar and preserved viability, and LCx infarction with 1-25% transmural scar and preserved viability.',
    )
  })

  it('compresses a normal stress and negative tissue study into one high-level conclusion', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: {},
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(
      buildIntegratedIschaemiaConclusion(
        'stress',
        perfusionData,
        null,
        'There is no late gadolinium enhancement to suggest myocardial scar or fibrosis.',
      ),
    ).toBe('No inducible ischaemia or myocardial scar/fibrosis.')
  })

  it('keeps the perfusion conclusion when stress is normal but non-ischaemic LGE is present', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: {},
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(
      buildIntegratedIschaemiaConclusion(
        'stress',
        perfusionData,
        null,
        'There is regional late gadolinium enhancement in a non-ischaemic pattern: mid-wall enhancement of the mid anteroseptal wall (26-50% transmurality). LGE score index 0.59 (5 of 17 segments enhanced).',
      ),
    ).toBe(
      'No inducible ischaemia. Regional non-ischaemic late gadolinium enhancement with mid-wall enhancement of the mid anteroseptal wall.',
    )
  })

  it('compresses isolated RV insertion point fibrosis into a concise conclusion line', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: {},
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(
      buildIntegratedIschaemiaConclusion(
        'stress',
        perfusionData,
        null,
        'Focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis. No other myocardial scar or fibrosis.',
      ),
    ).toBe('No inducible ischaemia. Focal RV insertion point late gadolinium enhancement. No other myocardial scar or fibrosis.')
  })

  it('keeps combined non-ischaemic LGE and RV insertion point fibrosis concise', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: {},
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(
      buildIntegratedIschaemiaConclusion(
        'stress',
        perfusionData,
        null,
        'There is focal mid-wall enhancement of the basal inferior wall (26-50% transmurality), in a non-ischaemic pattern. In addition, there is focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis.',
      ),
    ).toBe(
      'No inducible ischaemia. Focal non-ischaemic mid-wall enhancement of the basal inferior wall, with separate RV insertion point late gadolinium enhancement.',
    )
  })

  it('keeps alternate combined RV insertion point fibrosis wording concise', () => {
    const perfusionData = buildPerfusionSummaryData({
      restSegStates: {},
      stressSegStates: {},
      restPersistenceBeats: 0,
      stressPersistenceBeats: 6,
      adequateStress: true,
      lgeSegStates: {},
      lgePatternStates: {},
    })

    expect(
      buildIntegratedIschaemiaConclusion(
        'stress',
        perfusionData,
        null,
        'Focal non-ischaemic mid-wall enhancement in the basal inferior wall. Separate focal enhancement at the RV insertion points is typical of insertion point fibrosis.',
      ),
    ).toBe(
      'No inducible ischaemia. Focal non-ischaemic mid-wall enhancement in the basal inferior wall, with separate RV insertion point late gadolinium enhancement.',
    )
  })
})

describe('buildReportConclusions', () => {
  it('builds a variable-length conclusion list including optional domains', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
      ['RV EDV (i)', 73],
      ['RV EF', 58],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'stress',
      rwmaData: buildRwmaSummaryData({ 4: 1, 10: 1 }),
      perfusionData: buildPerfusionSummaryData({
        restSegStates: {},
        stressSegStates: { 4: 1, 10: 1 },
        restPersistenceBeats: 0,
        stressPersistenceBeats: 6,
        adequateStress: true,
        lgeSegStates: {},
        lgePatternStates: {},
      }),
      includeValveAssessment: true,
      valveText: 'Moderate tricuspid regurgitation.',
      includePhAssessment: true,
      phText: 'Intermediate probability of pulmonary hypertension physiology, driven by RV dilatation and reduced RV systolic function.',
      thrombusText: 'Probable left atrial appendage thrombus.',
      thrombusData: {
        deterministicText: 'Probable left atrial appendage thrombus.',
        hasThrombus: true,
        thrombusCount: 1,
        locations: ['left atrial appendage'],
        confidenceLabels: ['probable'],
        entries: [],
      },
    })

    expect(conclusions).toEqual([
      'Inducible RCA territory ischaemia in viable myocardium, without infarct-pattern scar.',
      'Preserved LV systolic function (LVEF 63%) with normal size, normal wall thickness, and regional hypokinetic change in the RCA territory.',
      'Preserved RV systolic function (RVEF 58%) with a non-dilated RV.',
      'Moderate tricuspid regurgitation.',
      'Intermediate probability of pulmonary hypertension physiology.',
      'Probable left atrial appendage thrombus.',
    ])
  })

  it('filters trivial and mild valve findings out of the conclusions list', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
      ['RV EDV (i)', 73],
      ['RV EF', 58],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 28%, MR volume 23 mL). Trivial aortic regurgitation. Mild tricuspid regurgitation.',
    })

    expect(conclusions).toEqual([
      'Preserved LV systolic function (LVEF 63%) with normal size and normal wall thickness.',
      'Preserved RV systolic function (RVEF 58%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 28%, MR volume 23 mL).',
    ])
  })

  it('combines paired significant regurgitant valve lesions into one conclusion line', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 116],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 54],
      ['LV EF', 24],
      ['RV EDV (i)', 62],
      ['RV EF', 44],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 101, 15)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 12, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 72, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 52, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 114, 12, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 41, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 35%, MR volume 34 mL). Moderate tricuspid regurgitation (RF 24%, TR volume 20 mL).',
    })

    expect(conclusions).toEqual([
      'Severe LV systolic impairment (LVEF 24%) with mild dilatation and normal wall thickness.',
      'Preserved RV systolic function (RVEF 44%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 35%, MR volume 34 mL) and tricuspid regurgitation (RF 24%, TR volume 20 mL).',
    ])
  })

  it('omits a redundant post-capillary PH conclusion when it only restates left-heart findings', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 101],
      ['LV peak wall thickness', 7],
      ['LV mass (i)', 81],
      ['LV EF', 38],
      ['MAPSE', 9],
      ['RV EDV (i)', 57],
      ['RV EF', 61],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 89, 10)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 56, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 97, 10, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 47, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'stress',
      rwmaData: buildRwmaSummaryData({ 5: 1, 11: 1, 16: 1 }),
      tissueStatement: 'Regional subendocardial enhancement involves the inferolateral and lateral walls in the LCx territory with 26-50% transmurality, consistent with viable myocardium.',
      perfusionData: buildPerfusionSummaryData({
        restSegStates: {},
        stressSegStates: { 5: 1, 6: 1, 11: 1, 12: 1, 16: 1 },
        restPersistenceBeats: 0,
        stressPersistenceBeats: 8,
        adequateStress: true,
        lgeSegStates: { 5: 1, 11: 1, 16: 1 },
        lgePatternStates: { 5: 1, 11: 1, 16: 1 },
      }),
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 28%, MR volume 23 mL). Trivial aortic regurgitation. Mild tricuspid regurgitation.',
      includePhAssessment: true,
      phText: 'Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary / mixed physiology. The pattern is driven by moderately elevated estimated PCWP (PCWP 19 mmHg), moderately impaired LV systolic function (LVEF 38%), and moderate mitral regurgitation.',
    })

    expect(conclusions).toEqual([
      'Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium.',
      'Moderate LV systolic impairment (LVEF 38%) with moderate dilatation, eccentric remodelling, and regional hypokinetic change in the LCx territory.',
      'Preserved RV systolic function (RVEF 61%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 28%, MR volume 23 mL).',
    ])
  })

  it('compacts additive PH conclusions into a single high-level evidence-led line', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 75],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 50],
      ['LV EF', 63],
      ['RV EDV (i)', 140],
      ['RV EF', 28],
      ['TAPSE', 12],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 12)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 10, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 81, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 99, 13, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includePhAssessment: true,
      phText: 'Intermediate probability of pulmonary hypertension physiology. Supporting right-heart features include RV dilatation, reduced RV systolic function, and reduced TAPSE.',
    })

    expect(conclusions).toEqual([
      'Preserved LV systolic function (LVEF 63%) with normal size and normal wall thickness.',
      'Severely impaired RV systolic function (RVEF 28%) with a severely dilated RV (RV EDVi 140 mL/m2).',
      'Intermediate probability of pulmonary hypertension physiology.',
    ])
  })

  it('removes valve repetition from additive PH evidence when the valve lesion is already concluded', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 116],
      ['LV peak wall thickness', 9],
      ['LV mass (i)', 54],
      ['LV EF', 24],
      ['RV EDV (i)', 62],
      ['RV EF', 44],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 101, 15)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 12, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 72, 10)],
      ['LV EF', createParam('LV EF', '%', 'low', 52, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 114, 12, 'RV size and geometry')],
      ['RV EF', createParam('RV EF', '%', 'low', 41, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 35%, MR volume 34 mL). Moderate tricuspid regurgitation (RF 24%, TR volume 20 mL).',
      includePhAssessment: true,
      phText: 'Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary / mixed physiology. Supporting right-heart features include moderate tricuspid regurgitation (RF 24%, TR volume 20 mL) and systolic septal flattening with dyskinetic septal motion.',
    })

    expect(conclusions).toEqual([
      'Severe LV systolic impairment (LVEF 24%) with mild dilatation and normal wall thickness.',
      'Preserved RV systolic function (RVEF 44%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 35%, MR volume 34 mL) and tricuspid regurgitation (RF 24%, TR volume 20 mL).',
      'Intermediate probability of pulmonary hypertension physiology, with possible post-capillary or mixed physiology.',
    ])
  })

  it('keeps PH conclusion compaction clean when left-heart context and valve de-duplication leave a support clause', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 109],
      ['LV peak wall thickness', 8],
      ['LV mass (i)', 55],
      ['LV EF', 24],
      ['RV EDV (i)', 97],
      ['RV EF', 44],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 15)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 12, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 72, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 51, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 116, 17)],
      ['RV EF', createParam('RV EF', '%', 'low', 48, null, 6, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 37%, MR volume 34 mL).',
      includePhAssessment: true,
      phText: 'Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary / mixed physiology. Left-heart context includes severely elevated estimated PCWP (PCWP 22 mmHg), severely impaired LV systolic function (LVEF 24%), and moderate mitral regurgitation. Supporting right-heart features include mildly impaired RV systolic function and systolic septal flattening with dyskinetic septal motion.',
    })

    expect(conclusions).toEqual([
      'Severe LV systolic impairment (LVEF 24%) with mild dilatation and normal wall thickness.',
      'Mildly impaired RV systolic function (RVEF 44%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 37%, MR volume 34 mL).',
      'Intermediate probability of pulmonary hypertension physiology, with possible post-capillary or mixed physiology.',
    ])
  })

  it('reduces a severity-led PH assessment headline to a lean conclusion line', () => {
    const measurementMap = new Map<string, number>([
      ['LV EDV (i)', 109],
      ['LV peak wall thickness', 8],
      ['LV mass (i)', 55],
      ['LV EF', 24],
      ['RV EDV (i)', 97],
      ['RV EF', 44],
      ['TAPSE', 20],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EDV (i)', createParam('LV EDV (i)', 'mL/m2', 'high', null, 98, 15)],
      ['LV peak wall thickness', createParam('LV peak wall thickness', 'mm', 'high', null, 12, 2)],
      ['LV mass (i)', createParam('LV mass (i)', 'g/m2', 'high', null, 72, 8)],
      ['LV EF', createParam('LV EF', '%', 'low', 51, null, 5, 'LV function')],
      ['RV EDV (i)', createParam('RV EDV (i)', 'mL/m2', 'high', null, 116, 17)],
      ['RV EF', createParam('RV EF', '%', 'low', 48, null, 6, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    const conclusions = buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: 'standard',
      includeValveAssessment: true,
      valveText: 'Moderate mitral regurgitation (RF 37%, MR volume 34 mL).',
      includePhAssessment: true,
      phText: 'Moderate post-capillary pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure, severe LV systolic dysfunction, and moderate mitral regurgitation. Systolic septal flattening with dyskinetic septal motion indicates right-sided pressure loading.',
    })

    expect(conclusions).toEqual([
      'Severe LV systolic impairment (LVEF 24%) with mild dilatation and normal wall thickness.',
      'Mildly impaired RV systolic function (RVEF 44%) with a non-dilated RV.',
      'Moderate mitral regurgitation (RF 37%, MR volume 34 mL).',
      'Moderate post-capillary pulmonary hypertension physiology.',
    ])
  })
})

describe('buildAtriaSentence', () => {
  it('describes normal left and right atrial size together', () => {
    const measurementMap = new Map<string, number>([
      ['LA max volume (i)', 35],
      ['RA max volume (i)', 36],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LA max volume (i)', createParam('LA max volume (i)', 'mL/m2', 'high', null, 55, 10, 'Atrial size')],
      ['RA max volume (i)', createParam('RA max volume (i)', 'mL/m2', 'high', null, 57, 10, 'Atrial size')],
    ])

    expect(buildAtriaSentence(measurementMap, paramMap)).toBe(
      'The left and right atria are normal in size.',
    )
  })

  it('describes severe biatrial enlargement with both indexed values', () => {
    const measurementMap = new Map<string, number>([
      ['LA max volume (i)', 78],
      ['RA max volume (i)', 82],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LA max volume (i)', createParam('LA max volume (i)', 'mL/m2', 'high', null, 55, 10, 'Atrial size')],
      ['RA max volume (i)', createParam('RA max volume (i)', 'mL/m2', 'high', null, 57, 10, 'Atrial size')],
    ])

    expect(buildAtriaSentence(measurementMap, paramMap)).toBe(
      'The left and right atria are severely enlarged (LAVi 78 mL/m2; RAVi 82 mL/m2).',
    )
  })
})

describe('buildValveSummarySentence', () => {
  it('reports only moderate-or-worse regurgitation and moderate-or-worse aortic gradients', () => {
    const measurementMap = new Map<string, number>([
      ['AV regurgitant fraction', 4],
      ['MR regurgitant fraction', 16],
      ['TR regurgitant fraction', 28],
      ['AV maximum pressure gradient', 44],
      ['AV mean pressure gradient', 24],
    ])

    expect(buildValveSummarySentence(measurementMap)).toBe(
      'Moderate TR. Aortic valve gradients: peak 44 mmHg and mean 24 mmHg, suggestive of moderate aortic stenosis.',
    )
  })

  it('does not report MR or TR when direct regurgitant fraction is absent', () => {
    const measurementMap = new Map<string, number>([
      ['LV SV', 100],
      ['AV effective forward flow (per heartbeat)', 82],
      ['RV SV', 90],
      ['PV effective forward flow (per heartbeat)', 72],
      ['AV mean pressure gradient', 7.5],
    ])

    expect(buildValveSummarySentence(measurementMap)).toBe(
      'No moderate or severe valvular abnormality.',
    )
  })

  it('can classify aortic stenosis severity from peak velocity while still reporting gradients', () => {
    const measurementMap = new Map<string, number>([
      ['AV maximum velocity', 4.2],
      ['AV maximum pressure gradient', 60],
      ['AV mean pressure gradient', 34],
    ])

    expect(buildValveSummarySentence(measurementMap)).toBe(
      'Aortic valve gradients: peak 60 mmHg and mean 34 mmHg, suggestive of severe aortic stenosis.',
    )
  })

  it('falls back to a no-significant-abnormality sentence when nothing reaches reporting threshold', () => {
    const measurementMap = new Map<string, number>([
      ['AV regurgitant fraction', 3],
      ['MR regurgitant fraction', 12],
      ['TR regurgitant fraction', 8],
      ['AV maximum pressure gradient', 18],
      ['AV mean pressure gradient', 9],
    ])

    expect(buildValveSummarySentence(measurementMap)).toBe(
      'No moderate or severe valvular abnormality.',
    )
  })

  it('includes the current mitral summary in the report valve line', () => {
    const measurementMap = new Map<string, number>([
      ['MR regurgitant fraction', 21],
      ['MR volume (per heartbeat)', 16],
      ['TR regurgitant fraction', 28],
    ])

    const mitralText = buildMitralValveReportText(
      measurementMap,
      {
        findings: {
          thickened: {
            leaflets: ['Anterior'],
            detailValues: { Extent: 'diffuse' },
            notes: '',
          },
          calcified: {
            leaflets: [],
            detailValues: { Extent: 'focal', Severity: 'mild' },
            notes: '',
          },
        },
      },
      {
        llmProse: 'Moderate mitral regurgitation with diffuse anterior leaflet thickening and mild focal leaflet calcification (RF 21%, MR volume 16 mL).',
        llmProseSourceSignature:
          '[invalid-signature-placeholder]',
      },
    )

    expect(mitralText).toBe(
      'Moderate mitral regurgitation with diffuse anterior leaflet thickening and mild focal leaflet calcification (RF 21%, MR volume 16 mL).',
    )

    expect(buildValveSummarySentence(measurementMap, { mitralSummaryText: mitralText })).toBe(
      'Moderate mitral regurgitation with diffuse anterior leaflet thickening and mild focal leaflet calcification (RF 21%, MR volume 16 mL). Moderate TR.',
    )
  })

  it('includes the current aortic summary in the report valve line without duplicating fallback AR/AS clauses', () => {
    const measurementMap = new Map<string, number>([
      ['AV regurgitant fraction', 26],
      ['AV backward flow (per heartbeat)', 24],
      ['AV maximum velocity', 3.4],
      ['AV mean pressure gradient', 24],
      ['AV maximum pressure gradient', 44],
      ['TR regurgitant fraction', 28],
    ])

    const aorticText = buildAorticValveReportText(
      measurementMap,
      {
        findings: {
          bicuspid: {
            leaflets: [],
            detailValues: { Fusion: 'R-L fusion', Raphe: 'high raphe' },
            notes: '',
          },
        },
      },
      {
        llmProse: 'Moderate aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (peak velocity 3.4 m/s; mean gradient 24 mmHg; RF 26%; regurgitant volume 24 mL).',
        llmProseSourceSignature: '[invalid-signature-placeholder]',
      },
    )

    expect(aorticText).toBe(
      'Moderate aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (peak velocity 3.4 m/s; mean gradient 24 mmHg; RF 26%; regurgitant volume 24 mL).',
    )

    expect(buildValveSummarySentence(measurementMap, { aorticSummaryText: aorticText })).toBe(
      'Moderate aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (peak velocity 3.4 m/s; mean gradient 24 mmHg; RF 26%; regurgitant volume 24 mL). Moderate TR.',
    )
  })

  it('includes the current tricuspid summary in the report valve line without duplicating fallback TR clauses', () => {
    const measurementMap = new Map<string, number>([
      ['TR regurgitant fraction', 28],
      ['TR volume (per heartbeat)', 34],
      ['AV mean pressure gradient', 24],
      ['AV maximum pressure gradient', 44],
    ])

    const tricuspidText = buildTricuspidValveReportText(
      measurementMap,
      {
        findings: {
          tethering: {
            leaflets: [],
            detailValues: { 'Tenting height': '11', 'Tenting area': '1.8' },
            notes: '',
          },
          annularDilatation: {
            leaflets: [],
            detailValues: { Diameter: '44' },
            notes: '',
          },
        },
      },
      {
        llmProse: 'Moderate tricuspid regurgitation with leaflet tethering (tenting height 11 mm; tenting area 1.8 cm^2) and annular dilatation (annular diameter 44 mm) (RF 28%, TR volume 34 mL).',
        llmProseSourceSignature: '[invalid-signature-placeholder]',
      },
    )

    expect(tricuspidText).toBe(
      'Moderate tricuspid regurgitation with leaflet tethering (tenting height 11 mm; tenting area 1.8 cm^2) and annular dilatation (annular diameter 44 mm) (RF 28%, TR volume 34 mL).',
    )

    expect(buildValveSummarySentence(measurementMap, { tricuspidSummaryText: tricuspidText })).toBe(
      'Moderate tricuspid regurgitation with leaflet tethering (tenting height 11 mm; tenting area 1.8 cm^2) and annular dilatation (annular diameter 44 mm) (RF 28%, TR volume 34 mL). Aortic valve gradients: peak 44 mmHg and mean 24 mmHg, suggestive of moderate aortic stenosis.',
    )
  })

  it('suppresses saved no-significant mitral and aortic summary text in the report valve line', () => {
    const measurementMap = new Map<string, number>([
      ['TR regurgitant fraction', 28],
    ])

    expect(
      buildValveSummarySentence(measurementMap, {
        mitralSummaryText: 'No significant mitral valve abnormality.',
        aorticSummaryText: 'No significant aortic valve abnormality.',
      }),
    ).toBe('Moderate TR.')
  })

  it('combines minor residual regurgitation clauses into one smoother sentence', () => {
    expect(
      buildValveSummarySentence(
        new Map<string, number>(),
        {
          mitralSummaryText: 'Severe mitral regurgitation (RF 46%, MR volume 32 mL).',
          aorticSummaryText: 'Mild aortic regurgitation.',
          tricuspidSummaryText: 'Trivial tricuspid regurgitation.',
        },
      ),
    ).toBe(
      'Severe mitral regurgitation (RF 46%, MR volume 32 mL). Mild aortic regurgitation and trivial tricuspid regurgitation.',
    )
  })

  it('respects selected valves when building the combined valve sentence', () => {
    const measurementMap = new Map<string, number>([
      ['TR regurgitant fraction', 28],
      ['AV mean pressure gradient', 24],
      ['AV maximum pressure gradient', 44],
    ])

    expect(
      buildValveSummarySentence(measurementMap, {
        includeMitral: false,
        includeAortic: false,
        includeTricuspid: true,
        includePulmonary: false,
      }),
    ).toBe('Moderate TR.')
  })

  it('can include pulmonary regurgitation in the combined valve sentence', () => {
    const measurementMap = new Map<string, number>([
      ['PV regurgitant fraction', 42],
      ['PV backward flow (per heartbeat)', 31],
    ])

    expect(
      buildValveSummarySentence(measurementMap, {
        includeMitral: false,
        includeAortic: false,
        includeTricuspid: false,
        includePulmonary: true,
      }),
    ).toBe('Severe PR.')
  })

  it('returns null when no valves are selected for inclusion', () => {
    expect(
      buildValveSummarySentence(new Map<string, number>(), {
        includeMitral: false,
        includeAortic: false,
        includeTricuspid: false,
        includePulmonary: false,
      }),
    ).toBeNull()
  })
})

describe('shouldIncludeValveAssessment', () => {
  it('returns false for the no-significant-abnormality placeholder', () => {
    expect(shouldIncludeValveAssessment('No moderate or severe valvular abnormality.')).toBe(false)
  })

  it('returns true for clinically relevant valve text', () => {
    expect(shouldIncludeValveAssessment('Moderate TR.')).toBe(true)
  })
})

describe('normalizePhReportText', () => {
  it('strips a PH section label from stored prose', () => {
    expect(normalizePhReportText('Pulmonary hypertension assessment: Intermediate probability of pulmonary hypertension physiology.')).toBe(
      'Intermediate probability of pulmonary hypertension physiology.',
    )
  })

  it('normalizes spaced slash alternatives into clinically natural prose', () => {
    expect(
      normalizePhReportText('PH summary: Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary / mixed physiology.'),
    ).toBe(
      'Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary or mixed physiology.',
    )
  })
})

describe('buildReportAdditionalConsiderations', () => {
  it('flags preserved LVEF with reduced MAPSE and marked MAPSE disparity', () => {
    const measurementMap = new Map<string, number>([
      ['LV EF', 61],
      ['MAPSE', 9],
      ['MAPSE septal', 8],
      ['MAPSE lateral', 16],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['LV EF', createParam('LV EF', '%', 'low', 55, null, 5, 'LV function')],
      ['MAPSE', createParam('MAPSE', 'mm', 'low', 11, null, 2, 'LV function')],
    ])

    expect(buildReportAdditionalConsiderations(measurementMap, paramMap)).toEqual([
      {
        section: 'Left ventricle',
        consideration: 'Preserved LVEF with reduced MAPSE',
        comment: 'Preserved LVEF with reduced longitudinal shortening suggests early or regional dysfunction, dyssynchrony, or tethering; correlate with RWMA, LGE, and ECG if clinically relevant.',
      },
      {
        section: 'Left ventricle',
        consideration: 'Marked septal-lateral MAPSE disparity',
        comment: 'Marked septal-lateral longitudinal disparity is present (septal 8 mm; lateral 16 mm). Correlate with dyssynchrony, regional scar, or tethering if genuine.',
      },
    ])
  })

  it('adds RV discordance considerations when RVEF and TAPSE disagree', () => {
    const measurementMap = new Map<string, number>([
      ['RV EF', 56],
      ['TAPSE', 13],
    ])

    const paramMap = new Map<string, CmrCanonicalParam>([
      ['RV EF', createParam('RV EF', '%', 'low', 51, null, 4, 'RV function')],
      ['TAPSE', createParam('TAPSE', 'mm', 'low', 17, null, 2, 'RV function')],
    ])

    expect(buildReportAdditionalConsiderations(measurementMap, paramMap)).toEqual([
      {
        section: 'Right ventricle',
        consideration: 'Preserved RVEF with reduced TAPSE',
        comment: 'Preserved RVEF with reduced longitudinal shortening suggests discordant radial and longitudinal RV mechanics, loading effects, or contouring discordance; correlate with RV size, septal motion, and clinical context if relevant.',
      },
    ])
  })
})

describe('normalizeRwmaReportText', () => {
  it('normalizes the normal wall motion case', () => {
    expect(normalizeRwmaReportText('Normal wall motion. No regional wall motion abnormalities identified.')).toBe(
      'No regional wall motion abnormality.',
    )
  })

  it('removes WMSI from abnormal wall motion prose', () => {
    expect(
      normalizeRwmaReportText('Regional wall motion abnormality: hypokinesis of the basal inferior wall. Wall motion score index 1.12 (mild).'),
    ).toBe(
      'Regional wall motion abnormality involving hypokinesis of the basal inferior wall.',
    )
  })

  it('uses plural wording for separated mixed wall motion patterns', () => {
    expect(
      normalizeRwmaReportText('Regional wall motion abnormality: hypokinesis of the basal inferior wall; akinesis of the apical septal wall. Wall motion score index 1.24 (mild).'),
    ).toBe(
      'Regional wall motion abnormalities involving hypokinesis of the basal inferior wall; akinesis of the apical septal wall.',
    )
  })

  it('removes duplicated involving prefixes from saved RWMA prose', () => {
    expect(
      normalizeRwmaReportText('Regional wall motion abnormality involving regional wall motion abnormality involving the basal and mid inferior and inferolateral walls with hypokinesis in the RCA and LCx territories.'),
    ).toBe(
      'Regional wall motion abnormality involving the basal and mid inferior and inferolateral walls with hypokinesis in the RCA and LCx territories.',
    )
  })
})

describe('normalizeLgeReportText', () => {
  it('removes the LGE score index from tissue prose', () => {
    expect(
      normalizeLgeReportText('Late gadolinium enhancement is absent. LGE score index 0.00 (0/17 segments).'),
    ).toBe(
      'Late gadolinium enhancement is absent.',
    )
  })

  it('removes the LGE score index when the segment count is phrased as "of 17 segments enhanced"', () => {
    expect(
      normalizeLgeReportText('There is non-ischaemic late gadolinium enhancement. LGE score index 0.59 (5 of 17 segments enhanced).'),
    ).toBe(
      'There is non-ischaemic late gadolinium enhancement.',
    )
  })

  it('removes tautological transmural wording when the explicit scar band is already stated', () => {
    expect(
      normalizeLgeReportText('There is regional transmural enhancement of the lateral wall with 76-100% transmurality, indicating non-viable myocardium.'),
    ).toBe(
      'There is regional enhancement of the lateral wall with 76-100% transmurality, indicating non-viable myocardium.',
    )
  })
})

describe('normalizePerfusionReportText', () => {
  it('removes the duplicated stress perfusion lead-in for report output', () => {
    expect(
      normalizePerfusionReportText('Stress perfusion: Adequate vasodilator stress. No inducible perfusion defect.'),
    ).toBe(
      'Adequate vasodilator stress. No inducible perfusion defect.',
    )
  })
})

describe('report conclusion helpers', () => {
  it('normalizes stored generated conclusion lines by stripping numbering', () => {
    expect(
      normalizeReportConclusionLines([
        '1. Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
        '2. Prior infarction in the RCA territory, predominantly non-viable.',
      ]),
    ).toEqual([
      'Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
      'Prior infarction in the RCA territory, predominantly non-viable.',
    ])
  })

  it('builds a stable conclusion source signature from normalized lines', () => {
    expect(
      buildReportConclusionSourceSignature([
        '1. Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
        'Prior infarction in the RCA territory, predominantly non-viable.',
      ]),
    ).toBe(
      JSON.stringify([
        'Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
        'Prior infarction in the RCA territory, predominantly non-viable.',
      ]),
    )
  })
})

describe('normalizeTricuspidValveReportText', () => {
  it('removes the duplicated tricuspid valve lead-in for report output', () => {
    expect(
      normalizeTricuspidValveReportText('Tricuspid valve: Moderate tricuspid regurgitation with leaflet tethering (RF 28%, TR volume 34 mL).'),
    ).toBe(
      'Moderate tricuspid regurgitation with leaflet tethering (RF 28%, TR volume 34 mL).',
    )
  })
})

describe('buildRwmaAdditionalConsiderations', () => {
  it('adds WMSI to additional considerations when wall motion is abnormal', () => {
    expect(
      buildRwmaAdditionalConsiderations({
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 0,
        6: 0,
        7: 0,
        8: 0,
        9: 0,
        10: 0,
        11: 0,
        12: 0,
        13: 0,
        14: 0,
        15: 0,
        16: 0,
        17: 0,
      }),
    ).toEqual([
      {
        section: 'Left ventricle',
        consideration: 'Wall motion score index',
        comment: 'WMSI 1.06 (mild).',
      },
    ])
  })
})

describe('buildLgeAdditionalConsiderations', () => {
  it('adds LGE score index when enhancement is present', () => {
    expect(
      buildLgeAdditionalConsiderations(
        {
          1: 1,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
          6: 0,
          7: 0,
          8: 0,
          9: 0,
          10: 0,
          11: 0,
          12: 0,
          13: 0,
          14: 0,
          15: 0,
          16: 0,
          17: 0,
        },
        {
          1: 1,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
          6: 0,
          7: 0,
          8: 0,
          9: 0,
          10: 0,
          11: 0,
          12: 0,
          13: 0,
          14: 0,
          15: 0,
          16: 0,
          17: 0,
        },
      ),
    ).toEqual([
      {
        section: 'Tissue characterisation',
        consideration: 'LGE score index',
        comment: '0.06 (1/17 segments).',
      },
    ])
  })
})

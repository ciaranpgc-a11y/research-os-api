import { describe, expect, it } from 'vitest'

import { buildCmrCaseLessonsData, buildCmrCaseLessonsSignature, normalizeCmrCaseLessonsProse } from '@/lib/cmr-case-lessons'

describe('buildCmrCaseLessonsData', () => {
  it('builds a stress perfusion and viability teaching pack', () => {
    const data = buildCmrCaseLessonsData({
      reportType: 'stress',
      nonContrast: false,
      fourDFlow: false,
      tissueParametersPresent: ['Native T1', 'ECV'],
      adequateStress: true,
      sectionSummaries: {
        lv: 'Moderate LV systolic impairment with regional dysfunction in the LCx territory.',
        rv: 'Preserved RV systolic function with a non-dilated RV.',
        tissue: 'Regional subendocardial enhancement in the LCx territory with 26-50% transmurality, consistent with viable myocardium.',
        perfusion: 'Adequate vasodilator stress. Stress perfusion defect exceeds infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.',
        valves: null,
        ph: null,
        thrombus: null,
      },
      conclusionLines: [
        'Moderate LV systolic impairment (LVEF 38%) with regional dysfunction in the LCx territory.',
        'Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. Prior LCx infarction with 26-50% transmural scar and preserved viability.',
      ],
      notableMeasurements: ['LVEF 38 %', 'Native T1 1062 ms', 'ECV 31 %'],
    }, 'case-discussion')

    expect(data.teachingThemes).toContain('stress perfusion and viability')
    expect(data.protocolHighlights[0]).toContain('vasodilator perfusion')
    expect(data.confidenceHighlights.join(' ')).toContain('Stress adequacy was established')
    expect(data.reportingPearls[0]).toContain('extends beyond infarct-pattern scar')
    expect(data.deterministicText).toContain('Case discussion:')
    expect(data.deterministicText).toContain('Acquisition and confidence:')
    expect(data.deterministicText).toContain('CMR learning point:')
    expect(data.deterministicText).toContain('Reporting pearl:')
  })

  it('builds a distinct advanced teaching-point pack', () => {
    const data = buildCmrCaseLessonsData({
      reportType: 'stress',
      nonContrast: false,
      fourDFlow: false,
      tissueParametersPresent: ['Native T1', 'ECV'],
      adequateStress: true,
      sectionSummaries: {
        lv: 'Moderate LV systolic impairment with regional dysfunction in the LCx territory.',
        rv: 'Preserved RV systolic function with a non-dilated RV.',
        tissue: 'Regional subendocardial enhancement in the LCx territory with 26-50% transmurality, consistent with viable myocardium.',
        perfusion: 'Adequate vasodilator stress. Stress perfusion defect exceeds infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.',
        valves: null,
        ph: null,
        thrombus: null,
      },
      conclusionLines: [
        'Moderate LV systolic impairment (LVEF 38%) with regional dysfunction in the LCx territory.',
        'Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. Prior LCx infarction with 26-50% transmural scar and preserved viability.',
      ],
      notableMeasurements: ['LVEF 38 %', 'Native T1 1062 ms', 'ECV 31 %'],
    }, 'advanced-teaching-point')

    expect(data.mode).toBe('advanced-teaching-point')
    expect(data.deterministicText).toContain('Advanced teaching point:')
    expect(data.deterministicText).toContain('Why it matters in CMR:')
    expect(data.deterministicText).not.toContain('Case discussion:')
  })

  it('switches to thrombus-led teaching when thrombus is the main theme', () => {
    const data = buildCmrCaseLessonsData({
      reportType: 'standard',
      nonContrast: false,
      fourDFlow: false,
      tissueParametersPresent: [],
      adequateStress: null,
      sectionSummaries: {
        lv: 'Severe LV systolic impairment with apical dysfunction.',
        rv: 'Preserved RV systolic function.',
        tissue: 'Extensive LAD-territory infarction.',
        perfusion: null,
        valves: null,
        ph: null,
        thrombus: 'Definite left ventricular apical thrombus (12 mm), mural, without internal enhancement on post-contrast imaging.',
      },
      conclusionLines: [
        'Severe LV systolic impairment with apical dysfunction and associated LV thrombus.',
      ],
      notableMeasurements: ['LVEF 24 %'],
    }, 'case-discussion')

    expect(data.teachingThemes).toContain('thrombus characterisation')
    expect(data.interpretiveHighlights[0]).toContain('evidence-led thrombus case')
    expect(data.advancedLearningHighlights[0]).toContain('post-contrast imaging')
  })

  it('detects scar-without-ischaemia teaching from conclusion-line viability detail and sharpens the learning point', () => {
    const data = buildCmrCaseLessonsData({
      reportType: 'stress',
      nonContrast: false,
      fourDFlow: false,
      tissueParametersPresent: ['Native T1'],
      adequateStress: true,
      sectionSummaries: {
        lv: 'Severe LV systolic impairment with regional dysfunction in the LCx territory.',
        rv: 'Preserved RV systolic function with a non-dilated RV.',
        tissue: 'Regional enhancement in the lateral wall, indicating non-viable myocardium.',
        perfusion: 'Adequate vasodilator stress. Perfusion abnormality is confined to regions of infarct-pattern LGE, without clear extension beyond scar.',
        valves: null,
        ph: null,
        thrombus: null,
      },
      conclusionLines: [
        'Severe LV systolic impairment (LVEF 24%) with mild dilatation, eccentric remodelling, and regional akinetic-dyskinetic change in the LCx territory.',
        'No inducible ischaemia beyond scar. Prior LCx infarction with 76-100% transmural scar and no meaningful viability.',
      ],
      notableMeasurements: ['LVEF 24 %', 'Native T1 1163 ms'],
    }, 'case-discussion')

    expect(data.teachingThemes).toContain('stress perfusion and prior infarction')
    expect(data.interpretiveHighlights[0]).toContain('matched scar rather than overcalled as residual inducible ischaemia')
    expect(data.advancedLearningHighlights.join(' ')).toContain('76-100% transmural scar carries no meaningful viability')
    expect(data.reportingPearls[0]).toContain('confined to infarct-pattern LGE')
  })
})

describe('buildCmrCaseLessonsSignature', () => {
  it('changes when the learning data changes', () => {
    const first = buildCmrCaseLessonsData({
      reportType: 'standard',
      nonContrast: false,
      fourDFlow: false,
      tissueParametersPresent: [],
      adequateStress: null,
      sectionSummaries: {
        lv: 'Normal LV function.',
        rv: 'Normal RV function.',
        tissue: null,
        perfusion: null,
        valves: null,
        ph: null,
        thrombus: null,
      },
      conclusionLines: ['Normal biventricular function.'],
      notableMeasurements: [],
    }, 'case-discussion')

    const second = buildCmrCaseLessonsData({
      reportType: 'standard',
      nonContrast: false,
      fourDFlow: true,
      tissueParametersPresent: [],
      adequateStress: null,
      sectionSummaries: {
        lv: 'Normal LV function.',
        rv: 'Normal RV function.',
        tissue: null,
        perfusion: null,
        valves: null,
        ph: 'Intermediate probability of pulmonary hypertension physiology.',
        thrombus: null,
      },
      conclusionLines: ['Normal biventricular function.'],
      notableMeasurements: [],
    }, 'advanced-teaching-point')

    expect(buildCmrCaseLessonsSignature(first)).not.toBe(buildCmrCaseLessonsSignature(second))
  })
})

describe('normalizeCmrCaseLessonsProse', () => {
  it('preserves paragraph breaks while trimming excess whitespace', () => {
    expect(
      normalizeCmrCaseLessonsProse('Why this case is instructive:\r\n  Example. \r\n\r\n\r\nCMR learning point:\r\n Another.  '),
    ).toBe('Why this case is instructive:\n  Example.\n\nCMR learning point:\n Another.')
  })

  it('preserves lightweight markdown structure for bullets and links', () => {
    expect(
      normalizeCmrCaseLessonsProse('**Key reasoning**\r\n\r\n- First point\r\n- Second point\r\n\r\n**Further reading**\r\n- [Paper](https://example.com/paper)'),
    ).toBe('**Key reasoning**\n\n- First point\n- Second point\n\n**Further reading**\n- [Paper](https://example.com/paper)')
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildAorticValveSummaryData,
  buildAorticValveSummarySignature,
} from '@/lib/cmr-aortic-valve-summary'

function createMeasurementMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map<string, number>(entries)
}

describe('buildAorticValveSummaryData', () => {
  it('builds a calcific aortic stenosis summary with values', () => {
    const data = buildAorticValveSummaryData(
      createMeasurementMap([
        ['AV maximum velocity', 4.3],
        ['AV mean pressure gradient', 48],
        ['AV maximum pressure gradient', 74],
      ]),
      {
        findings: {
          calcified: {
            leaflets: [],
            detailValues: { Extent: 'diffuse', Severity: 'severe' },
            notes: '',
          },
        },
      },
    )

    expect(data.phenotype).toBe('stenosis')
    expect(data.primaryMechanism).toBe('calcific-degenerative')
    expect(data.deterministicText).toBe(
      'Severe aortic stenosis with severe diffuse cusp calcification (peak velocity 4.3 m/s; mean gradient 48 mmHg).',
    )
  })

  it('builds a bicuspid mixed aortic valve summary', () => {
    const data = buildAorticValveSummaryData(
      createMeasurementMap([
        ['AV regurgitant fraction', 26],
        ['AV backward flow (per heartbeat)', 24],
        ['AV maximum velocity', 3.4],
        ['AV mean pressure gradient', 24],
      ]),
      {
        findings: {
          bicuspid: {
            leaflets: [],
            detailValues: { Fusion: 'R-L', Raphe: 'high' },
            notes: '',
          },
        },
      },
    )

    expect(data.phenotype).toBe('mixed')
    expect(data.deterministicText).toBe(
      'Moderate aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (peak velocity 3.4 m/s; mean gradient 24 mmHg; RF 26%; regurgitant volume 24 mL).',
    )
  })

  it('groups multi-cusp morphology naturally in mixed bicuspid disease', () => {
    const data = buildAorticValveSummaryData(
      createMeasurementMap([
        ['AV regurgitant fraction', 24.7],
        ['AV backward flow (per heartbeat)', 20],
        ['AV maximum velocity', 4.1],
        ['AV mean pressure gradient', 39],
      ]),
      {
        findings: {
          bicuspid: {
            leaflets: [],
            detailValues: { Fusion: 'R-L', Raphe: 'High' },
            notes: '',
          },
          calcified: {
            leaflets: ['Right coronary cusp', 'Left coronary cusp'],
            detailValues: { Extent: 'Diffuse', Severity: 'Moderate' },
            notes: '',
          },
        },
      },
    )

    expect(data.deterministicText).toBe(
      'Severe aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe, with moderate diffuse calcification of the right and left coronary cusps (peak velocity 4.1 m/s; mean gradient 39 mmHg; RF 24.7%; regurgitant volume 20 mL).',
    )
  })

  it('falls back to morphology-only wording when there is no significant haemodynamic lesion', () => {
    const data = buildAorticValveSummaryData(
      createMeasurementMap([]),
      {
        findings: {
          bicuspid: {
            leaflets: [],
            detailValues: { Fusion: 'R-L', Raphe: 'low' },
            notes: '',
          },
        },
      },
    )

    expect(data.deterministicText).toBe('Bicuspid aortic valve with R-L fusion and low raphe.')
  })
})

describe('buildAorticValveSummarySignature', () => {
  it('changes when flow severity changes', () => {
    const base = buildAorticValveSummaryData(
      createMeasurementMap([['AV regurgitant fraction', 8]]),
      { findings: {} },
    )
    const updated = buildAorticValveSummaryData(
      createMeasurementMap([['AV regurgitant fraction', 28]]),
      { findings: {} },
    )

    expect(buildAorticValveSummarySignature(updated)).not.toBe(buildAorticValveSummarySignature(base))
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildMitralValveSummaryData,
  buildMitralValveSummarySignature,
} from '@/lib/cmr-mitral-valve-summary'

function createMeasurementMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map<string, number>(entries)
}

describe('buildMitralValveSummaryData', () => {
  it('builds a degenerative flail MR summary with quantification', () => {
    const data = buildMitralValveSummaryData(
      createMeasurementMap([
        ['MR regurgitant fraction', 52],
        ['MR volume (per heartbeat)', 71],
      ]),
      {
        findings: {
          prolapse: {
            leaflets: ['Posterior'],
            detailValues: { Type: 'flail' },
            notes: '',
          },
          chordalRupture: {
            leaflets: [],
            detailValues: {},
            notes: '',
          },
        },
      },
    )

    expect(data.severity).toBe('severe')
    expect(data.primaryMechanism).toBe('degenerative')
    expect(data.deterministicText).toBe(
      'Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL).',
    )
  })

  it('folds morphology detail qualifiers directly into leaflet descriptors', () => {
    const data = buildMitralValveSummaryData(
      createMeasurementMap([
        ['MR regurgitant fraction', 21],
        ['MR volume (per heartbeat)', 16],
      ]),
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
    )

    expect(data.deterministicText).toBe(
      'Moderate mitral regurgitation with diffuse anterior leaflet thickening and mild focal leaflet calcification (RF 21%, MR volume 16 mL).',
    )
  })

  it('builds a functional MR summary from tethering and annular dilatation', () => {
    const data = buildMitralValveSummaryData(
      createMeasurementMap([
        ['MR regurgitant fraction', 26],
        ['MR volume (per heartbeat)', 31],
      ]),
      {
        findings: {
          tethering: {
            leaflets: [],
            detailValues: { 'Tenting height': '9', 'Tenting area': '2.5', Carpentier: 'IIIb' },
            notes: '',
          },
          annularDilatation: {
            leaflets: [],
            detailValues: { Diameter: '39' },
            notes: '',
          },
        },
      },
    )

    expect(data.primaryMechanism).toBe('functional')
    expect(data.deterministicText).toBe(
      'Moderate mitral regurgitation with leaflet tethering (tenting height 9 mm; tenting area 2.5 cm^2) and annular dilatation (annular diameter 39 mm) (RF 26%, MR volume 31 mL).',
    )
  })

  it('falls back to a normal mitral sentence when there is no regurgitation or morphology', () => {
    const data = buildMitralValveSummaryData(
      createMeasurementMap([]),
      { findings: {} },
    )

    expect(data.deterministicText).toBe('No significant mitral valve abnormality.')
  })
})

describe('buildMitralValveSummarySignature', () => {
  it('changes when morphology changes', () => {
    const base = buildMitralValveSummaryData(
      createMeasurementMap([['MR regurgitant fraction', 18]]),
      { findings: {} },
    )
    const updated = buildMitralValveSummaryData(
      createMeasurementMap([['MR regurgitant fraction', 18]]),
      {
        findings: {
          prolapse: {
            leaflets: ['Posterior'],
            detailValues: { Type: 'prolapse' },
            notes: '',
          },
        },
      },
    )

    expect(buildMitralValveSummarySignature(updated)).not.toBe(buildMitralValveSummarySignature(base))
  })
})

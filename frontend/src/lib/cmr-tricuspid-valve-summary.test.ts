import { describe, expect, it } from 'vitest'

import {
  buildTricuspidValveSummaryData,
  buildTricuspidValveSummarySignature,
} from '@/lib/cmr-tricuspid-valve-summary'

function createMeasurementMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map<string, number>(entries)
}

describe('buildTricuspidValveSummaryData', () => {
  it('builds a functional tricuspid regurgitation summary with values', () => {
    const data = buildTricuspidValveSummaryData(
      createMeasurementMap([
        ['TR regurgitant fraction', 26],
        ['TR volume (per heartbeat)', 31],
      ]),
      {
        findings: {
          tethering: {
            leaflets: [],
            detailValues: { 'Tenting height': '9', 'Tenting area': '1.8', Carpentier: 'IIIb' },
            notes: '',
          },
          annularDilatation: {
            leaflets: [],
            detailValues: { Diameter: '44' },
            notes: '',
          },
        },
      },
    )

    expect(data.primaryMechanism).toBe('functional')
    expect(data.deterministicText).toBe(
      'Moderate tricuspid regurgitation with leaflet tethering (tenting height 9 mm; tenting area 1.8 cm^2) and annular dilatation (annular diameter 44 mm) (RF 26%, TR volume 31 mL).',
    )
  })

  it('builds a device-related tricuspid regurgitation summary', () => {
    const data = buildTricuspidValveSummaryData(
      createMeasurementMap([
        ['TR regurgitant fraction', 42],
        ['TR volume (per heartbeat)', 52],
      ]),
      {
        findings: {
          pacemakerLead: {
            leaflets: [],
            detailValues: { Mechanism: 'impingement' },
            notes: '',
          },
        },
      },
    )

    expect(data.primaryMechanism).toBe('device-related')
    expect(data.deterministicText).toBe(
      'Severe tricuspid regurgitation due to pacemaker lead impingement (RF 42%, TR volume 52 mL).',
    )
  })

  it('falls back to morphology-only wording for Ebstein anomaly without significant TR', () => {
    const data = buildTricuspidValveSummaryData(
      createMeasurementMap([]),
      {
        findings: {
          ebstein: {
            leaflets: [],
            detailValues: { Displacement: '16' },
            notes: '',
          },
        },
      },
    )

    expect(data.deterministicText).toBe('Ebstein anomaly (apical displacement 16 mm).')
  })
})

describe('buildTricuspidValveSummarySignature', () => {
  it('changes when regurgitation severity changes', () => {
    const base = buildTricuspidValveSummaryData(
      createMeasurementMap([['TR regurgitant fraction', 8]]),
      { findings: {} },
    )
    const updated = buildTricuspidValveSummaryData(
      createMeasurementMap([['TR regurgitant fraction', 28]]),
      { findings: {} },
    )

    expect(buildTricuspidValveSummarySignature(updated)).not.toBe(buildTricuspidValveSummarySignature(base))
  })
})

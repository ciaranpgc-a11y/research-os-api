import { describe, expect, it } from 'vitest'

import { buildThrombusSummaryData, buildThrombusSummarySignature } from '@/lib/cmr-thrombus-summary'

describe('buildThrombusSummaryData', () => {
  it('returns a concise empty summary when no thrombus is described', () => {
    const data = buildThrombusSummaryData([
      {
        id: '1',
        primary: null,
        sublocation: null,
        otherLocation: '',
        morphology: {
          maxDiameter: null,
          shape: null,
          mobility: null,
          attachment: null,
          surface: null,
        },
        confidence: null,
        postContrast: null,
      },
    ])

    expect(data.deterministicText).toBe('No thrombus.')
    expect(data.thrombusCount).toBe(0)
    expect(buildThrombusSummarySignature(data)).toContain('"thrombusCount":0')
  })

  it('builds a concise single-thrombus sentence with key morphology', () => {
    const data = buildThrombusSummaryData([
      {
        id: '1',
        primary: 'LV',
        sublocation: 'Apex',
        otherLocation: '',
        morphology: {
          maxDiameter: 12,
          shape: 'mural',
          mobility: 'fixed',
          attachment: null,
          surface: null,
        },
        confidence: 'definite',
        postContrast: null,
      },
    ])

    expect(data.deterministicText).toBe(
      'Definite left ventricular apex thrombus (12 mm), mural and fixed.',
    )
    expect(data.thrombusCount).toBe(1)
  })

  it('builds a compact multi-thrombus sentence', () => {
    const data = buildThrombusSummaryData([
      {
        id: '1',
        primary: 'LV',
        sublocation: 'Apex',
        otherLocation: '',
        morphology: {
          maxDiameter: 12,
          shape: 'mural',
          mobility: 'fixed',
          attachment: null,
          surface: null,
        },
        confidence: 'definite',
        postContrast: null,
      },
      {
        id: '2',
        primary: 'LAA',
        sublocation: 'Tip',
        otherLocation: '',
        morphology: {
          maxDiameter: null,
          shape: 'protruding',
          mobility: 'mildly-mobile',
          attachment: null,
          surface: null,
        },
        confidence: 'probable',
        postContrast: null,
      },
    ])

    expect(data.deterministicText).toBe(
      'Two thrombi are described: definite left ventricular apex thrombus (12 mm), mural and fixed; probable left atrial appendage tip thrombus, protruding and mildly mobile.',
    )
  })

  it('folds supportive post-contrast characterisation into the sentence', () => {
    const data = buildThrombusSummaryData([
      {
        id: '1',
        primary: 'LV',
        sublocation: 'Apex',
        otherLocation: '',
        morphology: {
          maxDiameter: 12,
          shape: 'mural',
          mobility: 'fixed',
          attachment: null,
          surface: null,
        },
        confidence: 'definite',
        postContrast: 'non-enhancing-supportive',
      },
    ])

    expect(data.deterministicText).toBe(
      'Definite left ventricular apex thrombus (12 mm), mural and fixed, without internal enhancement on post-contrast imaging.',
    )
  })
})

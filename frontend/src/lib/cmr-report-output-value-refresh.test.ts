import { describe, expect, it } from 'vitest'

import {
  getReportOutputSection,
  refreshReportOutputValues,
  replaceReportOutputSection,
} from '@/lib/cmr-report-output-value-refresh'

describe('refreshReportOutputValues', () => {
  it('updates quantitative, tissue, and flow value blocks without replacing edited prose', () => {
    const draft = [
      'Edited intro sentence that should stay.',
      '',
      'Left ventricle:',
      'Manually edited LV wording that should stay.',
      '',
      'CMR quantitative                         Value       Normal range',
      'LV EF (%)                                60          64 (49-79)',
      '',
      'Tissue characterisation:',
      'Edited LGE sentence that should stay.',
      'Native T2 (ms)                           40          45 (25-65)',
      '',
      'Flow (2D-PC)                  Aorta      Pulmonary',
      'Forward flow                  50 mL      45 mL',
      'Regurgitant fraction          0%         2%',
      '',
      'Conclusions:',
      '1. Manually edited conclusion.',
    ].join('\n')

    const refreshed = refreshReportOutputValues({
      reportText: draft,
      quantitativeHeaderLine: 'CMR quantitative                         Value       Normal range',
      quantitativeLines: [
        'LV EF (%)                                54          64 (49-79)',
      ],
      tissueLines: [
        'Tissue characterisation:',
        'No late gadolinium enhancement to suggest myocardial scar or fibrosis.',
        'Native T2 (ms)                           58          45 (25-65)',
        '',
      ],
      flowLines: [
        'Flow (2D-PC)                  Aorta      Pulmonary',
        'Forward flow                  40 mL      38 mL',
        'Regurgitant fraction          5%         7%',
        '',
      ],
    })

    expect(refreshed).toContain('Edited intro sentence that should stay.')
    expect(refreshed).toContain('Manually edited LV wording that should stay.')
    expect(refreshed).toContain('Edited LGE sentence that should stay.')
    expect(refreshed).not.toContain('No late gadolinium enhancement to suggest myocardial scar or fibrosis.')
    expect(refreshed).toContain('LV EF (%)                                54')
    expect(refreshed).not.toContain('LV EF (%)                                60')
    expect(refreshed).toContain('Native T2 (ms)                           58')
    expect(refreshed).not.toContain('Native T2 (ms)                           40')
    expect(refreshed).toContain('Forward flow                  40 mL      38 mL')
    expect(refreshed).toContain('1. Manually edited conclusion.')
  })
})

describe('replaceReportOutputSection', () => {
  it('replaces one major report section while preserving other edited sections', () => {
    const draft = [
      'Edited intro.',
      '',
      'Left ventricle:',
      'Manually edited LV section.',
      '',
      'Right ventricle:',
      'Manually edited RV section.',
      '',
      'Conclusions:',
      '1. Manually edited conclusion.',
    ].join('\n')
    const generated = [
      'Generated intro.',
      '',
      'Left ventricle:',
      'Generated LV section.',
      '',
      'Right ventricle:',
      'Generated RV section.',
      '',
      'Conclusions:',
      '1. Generated conclusion.',
    ].join('\n')

    const replacement = getReportOutputSection(generated, 'left-ventricle')
    expect(replacement).toContain('Generated LV section.')

    const refreshed = replaceReportOutputSection({
      reportText: draft,
      sectionKey: 'left-ventricle',
      replacementText: replacement ?? '',
    })

    expect(refreshed).toContain('Edited intro.')
    expect(refreshed).toContain('Generated LV section.')
    expect(refreshed).not.toContain('Manually edited LV section.')
    expect(refreshed).toContain('Manually edited RV section.')
    expect(refreshed).toContain('1. Manually edited conclusion.')
  })

  it('can replace the intro before the first major heading', () => {
    const refreshed = replaceReportOutputSection({
      reportText: [
        'Old intro.',
        '',
        'Left ventricle:',
        'LV stays.',
      ].join('\n'),
      sectionKey: 'intro',
      replacementText: [
        'New intro.',
        '',
      ].join('\n'),
    })

    expect(refreshed).toBe([
      'New intro.',
      '',
      'Left ventricle:',
      'LV stays.',
    ].join('\n'))
  })
})

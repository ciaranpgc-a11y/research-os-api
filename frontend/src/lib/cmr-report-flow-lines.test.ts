import { describe, expect, it } from 'vitest'

import { buildReportFlowLines } from '@/lib/cmr-report-flow-lines'

describe('buildReportFlowLines', () => {
  it('omits the pulmonary column and placeholders when no pulmonary values are present', () => {
    const lines = buildReportFlowLines({
      fourDFlow: true,
      aorticForward: 64,
      aorticBackward: 5,
      aorticRegurgitantFraction: 8,
    })

    expect(lines.join('\n')).toContain('Flow (2D-PC + 4D-flow)')
    expect(lines.join('\n')).toContain('Aorta')
    expect(lines.join('\n')).not.toContain('Pulmonary')
    expect(lines.join('\n')).not.toContain('--')
    expect(lines).toContain('Forward flow                     64 mL      ')
    expect(lines).toContain('Backward flow                    5 mL       ')
    expect(lines).toContain('Regurgitant fraction             8%         ')
  })

  it('keeps both flow columns when pulmonary values are present', () => {
    const lines = buildReportFlowLines({
      fourDFlow: false,
      aorticForward: 64,
      aorticBackward: 5,
      aorticRegurgitantFraction: 8,
      pulmonaryForward: 40,
      pulmonaryBackward: 2,
      pulmonaryRegurgitantFraction: 5,
    })

    const text = lines.join('\n')
    expect(text).toContain('Flow (2D-PC)')
    expect(text).toContain('Aorta')
    expect(text).toContain('Pulmonary')
    expect(text).toContain('40 mL')
    expect(text).toContain('5%')
  })
})

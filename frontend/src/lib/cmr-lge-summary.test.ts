import { describe, expect, it } from 'vitest'

import {
  buildLgeSummaryData,
  buildLgeSummarySignature,
  generateLgeSummary,
  type LgeCode,
  type PatternCode,
} from '@/lib/cmr-lge-summary'

function createLgeSegState(): Record<number, LgeCode> {
  const next: Record<number, LgeCode> = {}
  for (let index = 1; index <= 17; index += 1) {
    next[index] = 0
  }
  return next
}

function createLgePatternState(): Record<number, PatternCode> {
  const next: Record<number, PatternCode> = {}
  for (let index = 1; index <= 17; index += 1) {
    next[index] = 0
  }
  return next
}

describe('generateLgeSummary', () => {
  it('supports isolated RV insertion point fibrosis without segmental enhancement', () => {
    const segStates = createLgeSegState()
    const patternStates = createLgePatternState()

    const summary = generateLgeSummary(segStates, patternStates, true)
    const data = buildLgeSummaryData(segStates, patternStates, true)

    expect(summary.text).toBe(
      'Focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis. No other myocardial scar or fibrosis.',
    )
    expect(summary.enhancedCount).toBe(0)
    expect(summary.scoreIndex).toBe(0)
    expect(data.rvInsertionPointFibrosis).toBe(true)
    expect(data.deterministicText).toBe(summary.text)
    expect(buildLgeSummarySignature(segStates, patternStates, true)).toContain('rvip:v4')
  })

  it('appends RV insertion point fibrosis to segmental enhancement summaries', () => {
    const segStates = createLgeSegState()
    const patternStates = createLgePatternState()
    segStates[4] = 2
    patternStates[4] = 1

    const summary = generateLgeSummary(segStates, patternStates, true)

    expect(summary.text).toBe(
      'There is focal subendocardial enhancement of the basal inferior wall (26-50% transmurality), in the territory of the right coronary artery. In addition, there is focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis. LGE score index 0.12 (1 of 17 segments enhanced).',
    )
  })

  it('does not label sparse cross-territory subendocardial enhancement as multi-vessel disease', () => {
    const segStates = createLgeSegState()
    const patternStates = createLgePatternState()
    segStates[10] = 2
    segStates[11] = 2
    patternStates[10] = 1
    patternStates[11] = 1

    const summary = generateLgeSummary(segStates, patternStates)

    expect(summary.text).toBe(
      'There are separate focal foci of late gadolinium enhancement: subendocardial enhancement of the mid inferior wall (26-50% transmurality), in the territory of the right coronary artery; subendocardial enhancement of the mid inferolateral wall (26-50% transmurality), in the territory of the left circumflex. LGE score index 0.24 (2 of 17 segments enhanced).',
    )
  })
})

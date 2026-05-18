import { describe, expect, it } from 'vitest'

import type { LgeCode, PatternCode } from '@/lib/cmr-lge-summary'
import { generatePerfusionSummary, type PerfusionCode } from '@/lib/cmr-perfusion-summary'

function createSegState(): Record<number, PerfusionCode> {
  const next: Record<number, PerfusionCode> = {}
  for (let index = 1; index <= 17; index += 1) {
    next[index] = 0
  }
  return next
}

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

describe('generatePerfusionSummary', () => {
  it('classifies multi-territory stress-only defects as inducible ischaemia', () => {
    const restSegStates = createSegState()
    const stressSegStates = createSegState()
    const lgeSegStates = createLgeSegState()
    const lgePatternStates = createLgePatternState()

    stressSegStates[10] = 1
    stressSegStates[11] = 1
    stressSegStates[15] = 1

    const summary = generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats: 0,
      stressPersistenceBeats: 8,
      adequateStress: true,
      lgeSegStates,
      lgePatternStates,
    })

    expect(summary.stress.segmentDescription).toBe('mid-to-apical inferior wall and mid inferolateral wall')
    expect(summary.impression).toBe('inducible')
    expect(summary.text).toBe(
      'Stress perfusion: Adequate vasodilator stress. Inducible subendocardial perfusion defects involving 3 segments across LCx and RCA territories, without corresponding infarct-pattern LGE, consistent with ischaemia in viable myocardium.',
    )
  })

  it('classifies fully matched infarct-pattern LGE as scar and not inducible ischaemia', () => {
    const restSegStates = createSegState()
    const stressSegStates = createSegState()
    const lgeSegStates = createLgeSegState()
    const lgePatternStates = createLgePatternState()

    stressSegStates[4] = 1
    stressSegStates[10] = 1
    stressSegStates[15] = 1
    lgeSegStates[4] = 4
    lgeSegStates[10] = 4
    lgeSegStates[15] = 4
    lgePatternStates[4] = 4
    lgePatternStates[10] = 4
    lgePatternStates[15] = 4

    const summary = generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats: 0,
      stressPersistenceBeats: 8,
      adequateStress: true,
      lgeSegStates,
      lgePatternStates,
    })

    expect(summary.impression).toBe('matched-scar')
    expect(summary.text).toBe(
      'Stress perfusion: Adequate vasodilator stress. Perfusion abnormality involving 3 segments in the inferior wall (RCA) is confined to regions of infarct-pattern LGE, without clear extension beyond scar.',
    )
  })

  it('classifies transmural stress hypoperfusion as exceeding subendocardial scar within the same segment', () => {
    const restSegStates = createSegState()
    const stressSegStates = createSegState()
    const lgeSegStates = createLgeSegState()
    const lgePatternStates = createLgePatternState()

    stressSegStates[4] = 2
    lgeSegStates[4] = 2
    lgePatternStates[4] = 1

    const summary = generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats: 0,
      stressPersistenceBeats: 8,
      adequateStress: true,
      lgeSegStates,
      lgePatternStates,
    })

    expect(summary.impression).toBe('exceeds-lge')
    expect(summary.lge.exceedsByThicknessCount).toBe(1)
    expect(summary.text).toBe(
      'Stress perfusion: Adequate vasodilator stress. Stress perfusion defect involving 1 segment in the inferior wall (RCA) exceeds the extent of infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.',
    )
  })

  it('marks overlap with non-infarct LGE as indeterminate', () => {
    const restSegStates = createSegState()
    const stressSegStates = createSegState()
    const lgeSegStates = createLgeSegState()
    const lgePatternStates = createLgePatternState()

    stressSegStates[7] = 1
    lgeSegStates[7] = 2
    lgePatternStates[7] = 2

    const summary = generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats: 0,
      stressPersistenceBeats: 8,
      adequateStress: true,
      lgeSegStates,
      lgePatternStates,
    })

    expect(summary.impression).toBe('indeterminate')
    expect(summary.lge.indeterminateRelation).toBe(true)
    expect(summary.text).toBe(
      'Stress perfusion: Adequate vasodilator stress. Stress perfusion abnormality is present, but its relationship to LGE is indeterminate.',
    )
  })

  it('marks suboptimal vasodilator response as non-diagnostic', () => {
    const summary = generatePerfusionSummary({
      restSegStates: createSegState(),
      stressSegStates: createSegState(),
      restPersistenceBeats: 0,
      stressPersistenceBeats: 0,
      adequateStress: false,
      lgeSegStates: createLgeSegState(),
      lgePatternStates: createLgePatternState(),
    })

    expect(summary.impression).toBe('non-diagnostic')
    expect(summary.text).toBe(
      'Stress perfusion: Suboptimal vasodilator response; study non-diagnostic for inducible ischaemia.',
    )
  })
})

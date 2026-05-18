import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cmr-summary-api', () => ({
  generateCmrRwmaProse: vi.fn(async () => 'RWMA llm prose'),
  generateCmrLgeProse: vi.fn(async () => 'LGE llm prose'),
  generateCmrPerfusionProse: vi.fn(async () => 'Perfusion llm prose'),
  generateCmrMitralValveProse: vi.fn(async () => 'Mitral llm prose'),
  generateCmrAorticValveProse: vi.fn(async () => 'Aortic llm prose'),
  generateCmrTricuspidValveProse: vi.fn(async () => 'Tricuspid llm prose'),
  generateCmrThrombusProse: vi.fn(async () => 'Thrombus llm prose'),
  generateCmrPhProse: vi.fn(async () => 'PH llm prose'),
  generateCmrReportConclusions: vi.fn(async ({ deterministicLines }: { deterministicLines: string[] }) =>
    deterministicLines.map((line, index) => `LLM ${index + 1}: ${line}`),
  ),
}))

import {
  buildSyntheticCmrCase,
  enrichSyntheticCmrCaseWithLlm,
} from '@/lib/cmr-synthetic-case'

describe('enrichSyntheticCmrCaseWithLlm', () => {
  it('populates section summaries and report output from the LLM pipeline', async () => {
    const seededCase = buildSyntheticCmrCase('stress-rca-scar-1')
    const result = await enrichSyntheticCmrCaseWithLlm(seededCase)

    expect(result.warnings).toEqual([])
    expect(result.syntheticCase.payload.rwma.llmProse).toBe('RWMA llm prose')
    expect(result.syntheticCase.payload.lge.llmProse).toBe('LGE llm prose')
    expect(result.syntheticCase.payload.perfusion.llmProse).toBe('Perfusion llm prose')
    expect(result.syntheticCase.payload.valves.summaries.mitral.llmProse).toBe('Mitral llm prose')
    expect(result.syntheticCase.payload.valves.summaries.aortic.llmProse).toBe('Aortic llm prose')
    expect(result.syntheticCase.payload.valves.summaries.tricuspid.llmProse).toBe('Tricuspid llm prose')
    expect(result.syntheticCase.payload.thrombus.llmProse).toBe('Thrombus llm prose')
    expect(result.syntheticCase.payload.ph.llmProse).toBe('PH llm prose')
    expect(result.syntheticCase.payload.output.reportGenerated).toBe(true)
    expect(result.syntheticCase.payload.output.conclusionLines.length).toBeGreaterThan(0)
    expect(result.syntheticCase.payload.output.conclusionLines[0]).toMatch(/^LLM 1:/)
  })
})

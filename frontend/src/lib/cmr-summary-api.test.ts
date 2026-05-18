import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cmr-auth', () => ({
  buildCmrHeaders: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }),
  getCmrApiBase: () => 'http://127.0.0.1:8011',
  getCmrSessionToken: () => 'test-token',
}))

import {
  generateCmrCaseLessonsProse,
  generateCmrCaseQuestionAnswer,
  generateCmrExpertChatAnswer,
  generateCmrReportConclusions,
} from '@/lib/cmr-summary-api'

const sampleLessonsData = {
  mode: 'case-discussion' as const,
  deterministicText: 'Why this case is instructive:\nExample lesson.',
  reportType: 'standard' as const,
  protocolHighlights: ['Example protocol highlight.'],
  confidenceHighlights: ['Example confidence highlight.'],
  interpretiveHighlights: ['Example interpretive highlight.'],
  advancedLearningHighlights: ['Example advanced learning point.'],
  reportingPearls: ['Example reporting pearl.'],
  teachingThemes: ['example'],
  notableMeasurements: [],
  sectionSummaries: {
    lv: 'Example LV summary.',
    rv: null,
    tissue: null,
    perfusion: null,
    valves: null,
    ph: null,
    thrombus: null,
  },
  conclusionLines: ['Example conclusion.'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateCmrCaseLessonsProse', () => {
  it('surfaces an error when the backend route is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    }))

    await expect(generateCmrCaseLessonsProse(sampleLessonsData)).rejects.toThrow('Not Found')
  })
})

describe('generateCmrCaseQuestionAnswer', () => {
  it('returns a model answer for a case-specific follow-up question', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answer: 'The key point is that the stress defect extends beyond infarct-pattern scar, which is why the case still supports residual ischaemia in viable myocardium.',
      }),
    }))

    await expect(generateCmrCaseQuestionAnswer({
      reportType: 'stress',
      question: 'Why is this still viable myocardium?',
      conversation: [],
      reportOutputText: 'Example report output.',
      sectionSummaries: sampleLessonsData.sectionSummaries,
      conclusionLines: sampleLessonsData.conclusionLines,
      notableMeasurements: sampleLessonsData.notableMeasurements,
    })).resolves.toBe(
      'The key point is that the stress defect extends beyond infarct-pattern scar, which is why the case still supports residual ischaemia in viable myocardium.',
    )
  })
})

describe('generateCmrExpertChatAnswer', () => {
  it('returns an expert answer for the current case context and forwards image uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answer: 'This reads as matched scar rather than residual inducible ischaemia because the perfusion abnormality is confined to infarct-pattern LGE and does not extend beyond scar.',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateCmrExpertChatAnswer({
      scope: 'case',
      currentPage: 'Report output',
      question: 'Why is this not residual ischaemia?',
      conversation: [
        {
          role: 'user',
          content: '',
          images: [
            {
              id: 'turn-image-1',
              name: 'prior-scan.png',
              mimeType: 'image/png',
              dataUrl: 'data:image/png;base64,cHJpb3I=',
            },
          ],
        },
      ],
      images: [
        {
          id: 'image-1',
          name: 'scan.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,aGVsbG8=',
        },
      ],
      caseId: 'case-123',
      caseTitle: 'Example case',
      reportType: 'stress',
      sourceReportText: 'Example uploaded report.',
      reportOutputText: 'Conclusions:\n1. Example conclusion.',
      sectionSummaries: sampleLessonsData.sectionSummaries,
      conclusionLines: sampleLessonsData.conclusionLines,
      notableMeasurements: ['LVEF 24%'],
    })).resolves.toBe(
      'This reads as matched scar rather than residual inducible ischaemia because the perfusion abnormality is confined to infarct-pattern LGE and does not extend beyond scar.',
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, requestInit] = fetchMock.mock.calls[0]
    const requestBody = JSON.parse(String(requestInit?.body ?? '{}')) as {
      images?: Array<{ name?: string }>
      conversation?: Array<{ images?: Array<{ name?: string }> }>
    }
    expect(requestBody.images?.map((image) => image.name)).toEqual(['scan.png'])
    expect(requestBody.conversation?.[0]?.images?.map((image) => image.name)).toEqual(['prior-scan.png'])
  })
})

describe('generateCmrReportConclusions', () => {
  it('falls back to deterministic lines when the backend route is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    }))

    await expect(generateCmrReportConclusions({
      reportType: 'stress',
      deterministicLines: [
        '1. Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
        '2. No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
      ],
    })).resolves.toEqual([
      'Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
      'No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
    ])
  })

  it('normalizes numbered lines returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lines: [
          '1. Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
          '2. No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
        ],
      }),
    }))

    await expect(generateCmrReportConclusions({
      reportType: 'stress',
      deterministicLines: [
        'Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
        'No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
      ],
    })).resolves.toEqual([
      'Preserved LV systolic function (LVEF 63%) with a non-dilated LV.',
      'No inducible ischaemia beyond scar. Prior RCA infarction with >50% transmural scar and limited viability.',
    ])
  })

  it('strips LGE score index fragments from backend conclusion lines', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lines: [
          '1. No inducible ischaemia. Regional non-ischaemic late gadolinium enhancement involving the inferolateral wall. LGE score index 0.59 (5 of 17 segments enhanced).',
        ],
      }),
    }))

    await expect(generateCmrReportConclusions({
      reportType: 'stress',
      deterministicLines: [
        'No inducible ischaemia. Regional non-ischaemic late gadolinium enhancement involving the inferolateral wall.',
      ],
    })).resolves.toEqual([
      'No inducible ischaemia. Regional non-ischaemic late gadolinium enhancement involving the inferolateral wall.',
    ])
  })
})

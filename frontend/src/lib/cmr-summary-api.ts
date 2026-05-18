import { buildCmrHeaders, getCmrApiBase, getCmrSessionToken } from '@/lib/cmr-auth'
import type { AorticValveSummaryData } from '@/lib/cmr-aortic-valve-summary'
import type { CmrCaseLessonsData, CmrCaseLessonsSections } from '@/lib/cmr-case-lessons'
import type { LgeSummaryData } from '@/lib/cmr-lge-summary'
import type { MitralValveSummaryData } from '@/lib/cmr-mitral-valve-summary'
import type { PerfusionSummaryData } from '@/lib/cmr-perfusion-summary'
import type { PhSummaryData } from '@/lib/cmr-ph-summary'
import type { RwmaSummaryData } from '@/lib/cmr-rwma-summary'
import type { ThrombusSummaryData } from '@/lib/cmr-thrombus-summary'
import type { TricuspidValveSummaryData } from '@/lib/cmr-tricuspid-valve-summary'

export type CmrReportConclusionsRequest = {
  reportType: 'standard' | 'stress'
  deterministicLines: string[]
}

export type CmrCaseQuestionTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type CmrCaseQuestionRequest = {
  reportType: 'standard' | 'stress'
  question: string
  conversation: CmrCaseQuestionTurn[]
  reportOutputText: string | null
  sectionSummaries: CmrCaseLessonsSections
  conclusionLines: string[]
  notableMeasurements: string[]
}

export type CmrReportRefinementTurn = {
  role: 'user' | 'assistant'
  content: string
  replacementText?: string | null
}

export type CmrReportSelectionRefinementRequest = {
  reportType: 'standard' | 'stress'
  instruction: string
  selectedText: string
  selectionContextBefore: string
  selectionContextAfter: string
  conversation: CmrReportRefinementTurn[]
  reportOutputText: string | null
  sectionSummaries: CmrCaseLessonsSections
  conclusionLines: string[]
  notableMeasurements: string[]
}

export type CmrReportSelectionRefinementResponse = {
  answer: string
  replacementText: string
}

export type CmrExpertChatTurn = {
  role: 'user' | 'assistant'
  content: string
  images?: CmrExpertChatImage[]
}

export type CmrExpertChatImage = {
  id: string
  name: string
  mimeType: string
  dataUrl: string
}

export type CmrExpertChatRequest = {
  scope: 'general' | 'case'
  currentPage: string
  question: string
  conversation: CmrExpertChatTurn[]
  images?: CmrExpertChatImage[]
  caseId: string | null
  caseTitle: string | null
  reportType: 'standard' | 'stress' | null
  sourceReportText: string | null
  reportOutputText: string | null
  sectionSummaries: Partial<CmrCaseLessonsSections>
  conclusionLines: string[]
  notableMeasurements: string[]
}

const LGE_SCORE_INDEX_PATTERN = /\s*LGE score index\s+\d+(?:\.\d+)?\s*\((?:\d+\s*\/\s*17\s+segments(?:\s+enhanced)?|\d+\s+of\s+17\s+segments(?:\s+enhanced)?)\)\.?\s*/gi

function getRequiredToken(): string {
  const token = getCmrSessionToken()
  if (!token) {
    throw new Error('CMR session not found')
  }
  return token
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { detail?: string; error?: string }
    return String(data.detail ?? data.error ?? fallback)
  } catch {
    return fallback
  }
}

function normalizeConclusionLine(line: string | null | undefined): string {
  return String(line ?? '')
    .replace(LGE_SCORE_INDEX_PATTERN, ' ')
    .replace(/^\d+\.\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function generateCmrLgeProse(summaryData: LgeSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/lge/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrPerfusionProse(summaryData: PerfusionSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/perfusion/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrRwmaProse(summaryData: RwmaSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/rwma/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrPhProse(summaryData: PhSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/ph/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrMitralValveProse(summaryData: MitralValveSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/mitral-valve/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrAorticValveProse(summaryData: AorticValveSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/aortic-valve/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrTricuspidValveProse(summaryData: TricuspidValveSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/tricuspid-valve/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrThrombusProse(summaryData: ThrombusSummaryData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/thrombus/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate summary'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated summary was empty')
  }
  return prose
}

export async function generateCmrReportConclusions(
  summaryData: CmrReportConclusionsRequest,
): Promise<string[]> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/report-conclusions/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    if (response.status === 404) {
      return summaryData.deterministicLines.map((line) => normalizeConclusionLine(line)).filter(Boolean)
    }
    throw new Error(await readErrorMessage(response, 'Failed to generate conclusions'))
  }

  const data = await response.json() as { lines?: string[] }
  const lines = Array.isArray(data.lines)
    ? data.lines.map((line) => normalizeConclusionLine(line)).filter(Boolean)
    : []
  if (lines.length === 0) {
    throw new Error('Generated conclusions were empty')
  }
  return lines
}

export async function generateCmrCaseLessonsProse(summaryData: CmrCaseLessonsData): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/case-lessons/prose`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to generate case lessons'))
  }

  const data = await response.json() as { prose?: string }
  const prose = String(data.prose ?? '').trim()
  if (!prose) {
    throw new Error('Generated case lessons were empty')
  }
  return prose
}

export async function generateCmrCaseQuestionAnswer(summaryData: CmrCaseQuestionRequest): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/case-question/answer`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to answer case question'))
  }

  const data = await response.json() as { answer?: string }
  const answer = String(data.answer ?? '').trim()
  if (!answer) {
    throw new Error('Generated case answer was empty')
  }
  return answer
}

export async function generateCmrReportSelectionRefinement(
  summaryData: CmrReportSelectionRefinementRequest,
): Promise<CmrReportSelectionRefinementResponse> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/report-selection-refinement/answer`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to refine selected report text'))
  }

  const data = await response.json() as {
    answer?: string
    replacementText?: string
  }
  const answer = String(data.answer ?? '').trim()
  const replacementText = String(data.replacementText ?? '').trim()
  if (!answer || !replacementText) {
    throw new Error('Generated refinement was empty')
  }

  return {
    answer,
    replacementText,
  }
}

export async function generateCmrExpertChatAnswer(summaryData: CmrExpertChatRequest): Promise<string> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/summaries/expert-chat/answer`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(summaryData),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to answer expert chat question'))
  }

  const data = await response.json() as { answer?: string }
  const answer = String(data.answer ?? '').trim()
  if (!answer) {
    throw new Error('Generated expert chat answer was empty')
  }
  return answer
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ClipboardEvent } from 'react'
import { ImagePlus, MessageCircle, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Button, Textarea } from '@/components/ui'
import { normalizeCmrCaseLessonsProse, type CmrCaseLessonsSections } from '@/lib/cmr-case-lessons'
import type { CmrCasePayload } from '@/lib/cmr-case-defaults'
import {
  EXPERT_CHAT_FILE_ACCEPT,
  EXPERT_CHAT_VIDEO_FRAME_COUNT,
  MAX_EXPERT_CHAT_ATTACHMENTS,
  MAX_EXPERT_CHAT_IMAGE_BYTES,
  MAX_EXPERT_CHAT_VIDEO_BYTES,
  buildExpertChatVideoFrameName,
  buildExpertChatVideoFrameTimes,
  getExpertChatMediaKind,
  normalizeExpertChatImageMimeType,
} from '@/lib/cmr-expert-chat-media'
import { getCmrReportOutputDraft, subscribeCmrReportOutputDrafts } from '@/lib/cmr-report-output-draft-store'
import {
  generateCmrExpertChatAnswer,
  type CmrExpertChatImage,
  type CmrExpertChatTurn,
} from '@/lib/cmr-summary-api'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type ChatScope = 'general' | 'case'

type MeasurementSpec = {
  key: string
  label: string
  unit?: string
}

const NOTABLE_MEASUREMENT_SPECS: MeasurementSpec[] = [
  { key: 'LV EF', label: 'LVEF', unit: '%' },
  { key: 'RV EF', label: 'RVEF', unit: '%' },
  { key: 'MAPSE', label: 'MAPSE', unit: 'mm' },
  { key: 'TAPSE', label: 'TAPSE', unit: 'mm' },
  { key: 'PCWP', label: 'Estimated PCWP', unit: 'mmHg' },
  { key: 'mRAP', label: 'Estimated RAP', unit: 'mmHg' },
  { key: 'Native T1', label: 'Native T1', unit: 'ms' },
  { key: 'Native myocardial T1', label: 'Native T1', unit: 'ms' },
  { key: 'ECV', label: 'ECV', unit: '%' },
  { key: 'Native T2', label: 'Native T2', unit: 'ms' },
  { key: 'Native myocardial T2', label: 'Native T2', unit: 'ms' },
]

const DEFAULT_MEDIA_ONLY_PROMPT = 'Please review the uploaded CMR image(s) or cine frame(s).'

function normalizeText(value: string | null | undefined): string | null {
  const candidate = String(value ?? '').trim()
  return candidate.length > 0 ? candidate : null
}

function createExpertChatImageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `cmr-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        reject(new Error(`Failed to load ${file.name}`))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error(`Failed to load ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('Failed to read video frames'))
    }
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess)
      video.removeEventListener('error', handleError)
    }
    video.addEventListener(eventName, handleSuccess, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

async function extractVideoFrameImages(file: File, frameLimit: number): Promise<CmrExpertChatImage[]> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true
    const metadataReady = waitForVideoEvent(video, 'loadedmetadata')
    video.src = objectUrl
    await metadataReady

    const frameCount = Math.max(1, Math.min(frameLimit, EXPERT_CHAT_VIDEO_FRAME_COUNT))
    const frameTimes = buildExpertChatVideoFrameTimes(video.duration, frameCount)
    const naturalWidth = video.videoWidth || 640
    const naturalHeight = video.videoHeight || 480
    const maxDimension = 1280
    const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to prepare video frames')
    }

    const frames: CmrExpertChatImage[] = []
    for (const [frameIndex, frameTime] of frameTimes.entries()) {
      const seekTarget = Math.min(
        Math.max(frameTime, 0),
        Math.max((Number.isFinite(video.duration) ? video.duration : frameTime) - 0.05, 0),
      )
      if (Math.abs(video.currentTime - seekTarget) > 0.02) {
        const seeked = waitForVideoEvent(video, 'seeked')
        video.currentTime = seekTarget
        await seeked
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push({
        id: createExpertChatImageId(),
        name: buildExpertChatVideoFrameName(file.name, frameIndex),
        mimeType: 'image/jpeg',
        dataUrl: canvas.toDataURL('image/jpeg', 0.88),
      })
    }
    return frames
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function buildExpertConversationRequest(
  conversation: CmrExpertChatTurn[],
  currentImages: CmrExpertChatImage[],
): CmrExpertChatTurn[] {
  if (!conversation.length) {
    return []
  }

  if (currentImages.length > 0) {
    return conversation.map((turn) => (turn.images?.length ? { ...turn, images: [] } : turn))
  }

  let latestImageIndex = -1
  conversation.forEach((turn, index) => {
    if (turn.role === 'user' && turn.images?.length) {
      latestImageIndex = index
    }
  })

  if (latestImageIndex < 0) {
    return conversation
  }

  return conversation.map((turn, index) => (
    turn.images?.length && index !== latestImageIndex
      ? { ...turn, images: [] }
      : turn
  ))
}

function getCurrentPageLabel(pathname: string): string {
  if (pathname === '/cmr-reports') return 'Reports'
  if (pathname === '/cmr-reference-table') return 'Reference table'
  if (pathname === '/cmr-reference-database') return 'Reference database'
  if (pathname === '/cmr-admin') return 'Admin'

  const caseMatch = pathname.match(/^\/cmr\/cases\/[^/]+\/([^/]+)$/)
  const section = caseMatch?.[1] ?? null
  switch (section) {
    case 'upload':
      return 'Upload report'
    case 'report':
      return 'Report elements'
    case 'rwma':
      return 'Wall motion'
    case 'lge':
      return 'Tissue characterisation'
    case 'perfusion':
      return 'Stress perfusion'
    case 'valves':
      return 'Valves'
    case 'lv-thrombus':
      return 'LV thrombus'
    case 'ph':
      return 'Pulmonary hypertension'
    case 'output':
      return 'Report output'
    default:
      return 'CMR workspace'
  }
}

function formatMeasurementValue(value: number, unit?: string): string {
  const decimals = unit === 'ms' ? 0 : 0
  const formatted = value.toFixed(decimals)
  return `${formatted}${unit ? ` ${unit}` : ''}`
}

function buildValveSummaryText(
  summaries: Record<string, { llmProse: string | null }>,
): string | null {
  const combined = Object.values(summaries)
    .map((entry) => normalizeText(entry.llmProse))
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .trim()
  return combined || null
}

function buildSectionSummariesFromCase(payload?: CmrCasePayload | null): Partial<CmrCaseLessonsSections> {
  if (!payload) {
    return {}
  }

  return {
    lv: null,
    rv: null,
    tissue: normalizeText(payload.lge.llmProse),
    perfusion: payload.reportInput.reportType === 'stress'
      ? normalizeText(payload.perfusion.llmProse)
      : null,
    valves: buildValveSummaryText(payload.valves.summaries),
    ph: normalizeText(payload.ph.llmProse),
    thrombus: normalizeText(payload.thrombus.llmProse),
  }
}

function buildNotableMeasurements(
  measurements: Array<{ parameter: string; value: number }> | null | undefined,
): string[] {
  if (!measurements?.length) return []
  const measurementMap = new Map(measurements.map((measurement) => [measurement.parameter, measurement.value]))
  const seen = new Set<string>()

  return NOTABLE_MEASUREMENT_SPECS.reduce<string[]>((items, spec) => {
    if (items.length >= 8 || seen.has(spec.label) || !measurementMap.has(spec.key)) {
      return items
    }
    const value = measurementMap.get(spec.key)
    if (value == null || Number.isNaN(value)) {
      return items
    }
    seen.add(spec.label)
    items.push(`${spec.label} ${formatMeasurementValue(value, spec.unit)}`)
    return items
  }, [])
}

export function CmrExpertChat() {
  const { pathname } = useLocation()
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const [open, setOpen] = useState(false)
  const [selectedScope, setSelectedScope] = useState<ChatScope>('general')
  const [threadsByScope, setThreadsByScope] = useState<Record<string, CmrExpertChatTurn[]>>({})
  const [draftsByScope, setDraftsByScope] = useState<Record<string, string>>({})
  const [pendingImagesByScope, setPendingImagesByScope] = useState<Record<string, CmrExpertChatImage[]>>({})
  const [errorsByScope, setErrorsByScope] = useState<Record<string, string | null>>({})
  const [autoScrollByScope, setAutoScrollByScope] = useState<Record<string, boolean>>({})
  const [answeringScopeKey, setAnsweringScopeKey] = useState<string | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const caseRouteMatch = pathname.match(/^\/cmr\/cases\/([^/]+)\//)
  const caseIdFromPath = caseRouteMatch?.[1] ?? null
  const currentPage = getCurrentPageLabel(pathname)

  const casePayload = useMemo(() => {
    if (!caseIdFromPath || !activeCase || activeCase.id !== caseIdFromPath) {
      return null
    }
    return activeCase.payload
  }, [activeCase, caseIdFromPath])

  const caseScopeAvailable = Boolean(caseIdFromPath && casePayload)
  const scope: ChatScope = selectedScope === 'case' && caseScopeAvailable ? 'case' : 'general'
  const scopeKey = scope === 'case' ? `case:${caseIdFromPath}` : 'general'
  const conversation = threadsByScope[scopeKey] ?? []
  const draft = draftsByScope[scopeKey] ?? ''
  const liveReportOutputDraft = useSyncExternalStore(
    subscribeCmrReportOutputDrafts,
    () => getCmrReportOutputDraft(caseIdFromPath),
    () => null,
  )
  const pendingImages = pendingImagesByScope[scopeKey] ?? []
  const error = errorsByScope[scopeKey] ?? null
  const shouldAutoScroll = autoScrollByScope[scopeKey] ?? true
  const isAnswering = answeringScopeKey === scopeKey

  useEffect(() => {
    setSelectedScope('general')
  }, [caseIdFromPath])

  useEffect(() => {
    if (!caseScopeAvailable) {
      setSelectedScope('general')
    }
  }, [caseScopeAvailable])

  const sectionSummaries = useMemo(
    () => buildSectionSummariesFromCase(scope === 'case' ? casePayload : null),
    [casePayload, scope],
  )

  const notableMeasurements = useMemo(
    () => (scope === 'case' ? buildNotableMeasurements(casePayload?.extractionResult?.measurements) : []),
    [casePayload?.extractionResult?.measurements, scope],
  )

  const reportOutputText = useMemo(() => {
    if (scope !== 'case') {
      return null
    }
    const currentDraft = normalizeText(liveReportOutputDraft)
    if (currentDraft) {
      return currentDraft
    }
    const savedEditedReportText = normalizeText(casePayload?.output.editedReportText)
    if (savedEditedReportText) {
      return savedEditedReportText
    }
    const conclusionLines = casePayload?.output.conclusionLines ?? []
    if (!casePayload?.output.reportGenerated || conclusionLines.length === 0) {
      return null
    }
    const renderedConclusions = conclusionLines
      .map((line, index) => `${index + 1}. ${line}`)
      .join('\n')
    return `Conclusions:\n${renderedConclusions}`
  }, [casePayload?.output.conclusionLines, casePayload?.output.editedReportText, casePayload?.output.reportGenerated, liveReportOutputDraft, scope])

  useEffect(() => {
    if (!open || !shouldAutoScroll) return
    const container = messagesRef.current
    if (!container) return
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [conversation.length, isAnswering, open, scopeKey, shouldAutoScroll])

  const handleDraftChange = (value: string) => {
    setDraftsByScope((state) => ({
      ...state,
      [scopeKey]: value,
    }))
  }

  const handleScroll = () => {
    const container = messagesRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setAutoScrollByScope((state) => ({
      ...state,
      [scopeKey]: distanceFromBottom <= 48,
    }))
  }

  const handleClearThread = () => {
    setThreadsByScope((state) => ({
      ...state,
      [scopeKey]: [],
    }))
    setPendingImagesByScope((state) => ({
      ...state,
      [scopeKey]: [],
    }))
    setErrorsByScope((state) => ({
      ...state,
      [scopeKey]: null,
    }))
    setAutoScrollByScope((state) => ({
      ...state,
      [scopeKey]: true,
    }))
  }

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleRemovePendingImage = (imageId: string) => {
    setPendingImagesByScope((state) => ({
      ...state,
      [scopeKey]: (state[scopeKey] ?? []).filter((image) => image.id !== imageId),
    }))
  }

  const attachMediaFiles = async (fileList: File[]) => {
    if (!fileList.length) {
      return
    }

    let remainingSlots = MAX_EXPERT_CHAT_ATTACHMENTS - pendingImages.length
    if (remainingSlots <= 0) {
      setErrorsByScope((state) => ({
        ...state,
        [scopeKey]: `You can attach up to ${MAX_EXPERT_CHAT_ATTACHMENTS} images or video frames per question.`,
      }))
      return
    }

    for (const file of fileList) {
      const mediaKind = getExpertChatMediaKind(file.type, file.name)
      if (!mediaKind) {
        setErrorsByScope((state) => ({
          ...state,
          [scopeKey]: 'Only PNG, JPG, WebP, MP4, MOV, or WebM uploads are supported.',
        }))
        return
      }
      const maxBytes = mediaKind === 'video' ? MAX_EXPERT_CHAT_VIDEO_BYTES : MAX_EXPERT_CHAT_IMAGE_BYTES
      if (file.size > maxBytes) {
        setErrorsByScope((state) => ({
          ...state,
          [scopeKey]: mediaKind === 'video'
            ? `${file.name} is too large. Keep each video under 100 MB.`
            : `${file.name} is too large. Keep each image under 5 MB.`,
        }))
        return
      }
    }

    try {
      const nextImages: CmrExpertChatImage[] = []
      for (const file of fileList) {
        if (remainingSlots <= 0) {
          break
        }
        const mediaKind = getExpertChatMediaKind(file.type, file.name)
        if (mediaKind === 'video') {
          const extractedFrames = await extractVideoFrameImages(file, remainingSlots)
          nextImages.push(...extractedFrames)
          remainingSlots -= extractedFrames.length
          continue
        }

        const mimeType = normalizeExpertChatImageMimeType(file.type, file.name) ?? 'image/png'
        nextImages.push({
          id: createExpertChatImageId(),
          name: file.name.trim() || 'cmr-scan.png',
          mimeType,
          dataUrl: await readFileAsDataUrl(file),
        })
        remainingSlots -= 1
      }

      if (nextImages.length === 0) {
        setErrorsByScope((state) => ({
          ...state,
          [scopeKey]: 'No usable images or video frames were found.',
        }))
        return
      }

      setPendingImagesByScope((state) => ({
        ...state,
        [scopeKey]: [...(state[scopeKey] ?? []), ...nextImages],
      }))
      setErrorsByScope((state) => ({
        ...state,
        [scopeKey]: null,
      }))
    } catch (mediaError) {
      setErrorsByScope((state) => ({
        ...state,
        [scopeKey]: mediaError instanceof Error ? mediaError.message : 'Failed to attach media',
      }))
    }
  }

  const handleImageSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(event.target.files ?? [])
    event.target.value = ''
    await attachMediaFiles(fileList)
  }

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(event.clipboardData?.items ?? [])
    const imageFiles = clipboardItems
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((file): file is File => Boolean(file))

    if (!imageFiles.length) {
      return
    }

    void attachMediaFiles(imageFiles)
  }

  const handleAsk = async () => {
    const trimmedQuestion = draft.trim()
    if ((!trimmedQuestion && pendingImages.length === 0) || isAnswering) return

    const requestConversation = buildExpertConversationRequest(conversation, pendingImages)
    const effectiveQuestion = trimmedQuestion || DEFAULT_MEDIA_ONLY_PROMPT
    const userTurn: CmrExpertChatTurn = {
      role: 'user',
      content: trimmedQuestion,
      images: pendingImages,
    }

    setThreadsByScope((state) => ({
      ...state,
      [scopeKey]: [...conversation, userTurn],
    }))
    setDraftsByScope((state) => ({
      ...state,
      [scopeKey]: '',
    }))
    setPendingImagesByScope((state) => ({
      ...state,
      [scopeKey]: [],
    }))
    setErrorsByScope((state) => ({
      ...state,
      [scopeKey]: null,
    }))
    setAutoScrollByScope((state) => ({
      ...state,
      [scopeKey]: true,
    }))
    setAnsweringScopeKey(scopeKey)

    try {
      const answer = await generateCmrExpertChatAnswer({
        scope,
        currentPage,
        question: effectiveQuestion,
        conversation: requestConversation,
        images: pendingImages,
        caseId: scope === 'case' ? caseIdFromPath : null,
        caseTitle: scope === 'case' ? normalizeText(activeCase?.title) : null,
        reportType: scope === 'case' ? casePayload?.reportInput.reportType ?? null : null,
        sourceReportText: scope === 'case' ? normalizeText(casePayload?.reportInput.reportText) : null,
        reportOutputText,
        sectionSummaries,
        conclusionLines: scope === 'case' ? casePayload?.output.conclusionLines ?? [] : [],
        notableMeasurements,
      })

      setThreadsByScope((state) => ({
        ...state,
        [scopeKey]: [
          ...(state[scopeKey] ?? []),
          { role: 'assistant', content: normalizeCmrCaseLessonsProse(answer) },
        ],
      }))
    } catch (requestError) {
      setErrorsByScope((state) => ({
        ...state,
        [scopeKey]: requestError instanceof Error
          ? requestError.message
          : 'Failed to answer question',
      }))
    } finally {
      setAnsweringScopeKey((current) => (current === scopeKey ? null : current))
    }
  }

  const emptyStateText = scope === 'case'
    ? 'Ask about the current case, sequence integration, viability, valves, thrombus, pulmonary hypertension, or how to phrase the findings.'
    : 'Ask a practical CMR question on protocol, reporting language, viability, perfusion, valves, thrombus, or pulmonary hypertension.'

  const contextDescription = scope === 'case'
    ? `Using this case - ${currentPage}`
    : `General practical CMR - ${currentPage}`

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3">
      {open ? (
        <div className="pointer-events-auto flex h-[min(680px,calc(100vh-7rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_28px_80px_-38px_rgba(15,23,42,0.55)]">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--section-style-report-accent))]">
                Expert CMR chat
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {contextDescription}
              </p>
            </div>
            <Button
              type="button"
              variant="tertiary"
              className="h-10 w-10 rounded-full px-0"
              onClick={() => setOpen(false)}
              aria-label="Close expert chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {caseScopeAvailable ? (
            <div className="flex items-center gap-2 border-b border-border/50 bg-white px-5 py-3">
              <Button
                type="button"
                variant={scope === 'general' ? 'cta' : 'tertiary'}
                className="rounded-full px-4"
                onClick={() => setSelectedScope('general')}
              >
                General
              </Button>
              <Button
                type="button"
                variant={scope === 'case' ? 'cta' : 'tertiary'}
                className="rounded-full px-4"
                onClick={() => setSelectedScope('case')}
              >
                This case
              </Button>
            </div>
          ) : null}

          <div
            ref={messagesRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--tone-neutral-50))] px-5 py-5"
          >
            {conversation.length > 0 ? (
              <div className="space-y-3">
                {conversation.map((message, index) => (
                  <div
                    key={`${scopeKey}-${message.role}-${index}`}
                    className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={cn(
                        'max-w-[84%] rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm',
                        message.role === 'user'
                          ? 'bg-[hsl(var(--section-style-report-accent))] text-white'
                          : 'border border-border/60 bg-white text-[hsl(var(--foreground))]',
                      )}
                    >
                      {message.images?.length ? (
                        <div className={cn('grid gap-2', message.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1', message.content.trim() ? 'mb-3' : '')}>
                          {message.images.map((image) => (
                            <div
                              key={image.id}
                              className={cn(
                                'overflow-hidden rounded-[14px] border',
                                message.role === 'user'
                                  ? 'border-white/20 bg-white/10'
                                  : 'border-border/60 bg-[hsl(var(--tone-neutral-50))]',
                              )}
                            >
                              <img
                                src={image.dataUrl}
                                alt={image.name}
                                className="h-28 w-full object-cover"
                              />
                              <div
                                className={cn(
                                  'truncate px-3 py-2 text-[11px] font-medium',
                                  message.role === 'user' ? 'text-white/80' : 'text-[hsl(var(--muted-foreground))]',
                                )}
                              >
                                {image.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {message.content.trim() ? (
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {isAnswering ? (
                  <div className="flex justify-start">
                    <div className="rounded-[22px] border border-border/60 bg-white px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] shadow-sm">
                      Thinking...
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-white px-4 py-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {emptyStateText}
              </div>
            )}
          </div>

          <div className="border-t border-border/60 bg-white px-5 py-4">
            {error ? (
              <p className="mb-3 text-sm text-[hsl(var(--tone-danger-700))]">{error}</p>
            ) : null}
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={EXPERT_CHAT_FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => { void handleImageSelection(event) }}
              />
              {pendingImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {pendingImages.map((image) => (
                    <div
                      key={image.id}
                      className="relative overflow-hidden rounded-[16px] border border-border/70 bg-[hsl(var(--tone-neutral-50))]"
                    >
                      <img
                        src={image.dataUrl}
                        alt={image.name}
                        className="h-28 w-full object-cover"
                      />
                      <div className="truncate px-3 py-2 pr-10 text-[11px] font-medium text-[hsl(var(--foreground))]">
                        {image.name}
                      </div>
                      <button
                        type="button"
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[hsl(var(--foreground))] shadow-sm"
                        onClick={() => handleRemovePendingImage(image.id)}
                        aria-label={`Remove ${image.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <Textarea
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onPaste={(event) => handleTextareaPaste(event)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleAsk()
                  }
                }}
                rows={3}
                placeholder={scope === 'case' ? 'Ask about this case...' : 'Ask a practical CMR question...'}
                className="min-h-[92px] resize-none rounded-[22px] border-border/70 bg-[hsl(var(--tone-neutral-50))] px-4 py-3 text-sm leading-6"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Attach or paste up to 4 CMR screenshots or cine frames.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full px-4"
                    onClick={handleOpenFilePicker}
                    disabled={isAnswering || pendingImages.length >= MAX_EXPERT_CHAT_ATTACHMENTS}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ImagePlus className="h-4 w-4" />
                      Add media
                    </span>
                  </Button>
                  {conversation.length > 0 ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      className="rounded-full border-[hsl(var(--tone-danger-300))] px-4 text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))]"
                      onClick={handleClearThread}
                      disabled={isAnswering}
                    >
                      Clear thread
                    </Button>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="cta"
                  className="rounded-full px-5"
                  onClick={() => { void handleAsk() }}
                  disabled={(!draft.trim() && pendingImages.length === 0) || isAnswering}
                >
                  {isAnswering ? 'Thinking...' : 'Ask'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        variant="cta"
        className="pointer-events-auto h-14 rounded-full px-5 shadow-[0_18px_36px_-22px_rgba(15,23,42,0.55)]"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Open expert CMR chat"
      >
        <span className="inline-flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <span className="hidden sm:inline">Ask CMR expert</span>
        </span>
      </Button>
    </div>
  )
}

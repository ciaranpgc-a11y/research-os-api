export type ExpertChatMediaKind = 'image' | 'video'

export const MAX_EXPERT_CHAT_ATTACHMENTS = 4
export const MAX_EXPERT_CHAT_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_EXPERT_CHAT_VIDEO_BYTES = 100 * 1024 * 1024
export const EXPERT_CHAT_VIDEO_FRAME_COUNT = 4

export const EXPERT_CHAT_FILE_ACCEPT =
  'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm'

export const SUPPORTED_EXPERT_CHAT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const SUPPORTED_EXPERT_CHAT_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

export function normalizeExpertChatImageMimeType(mimeType: string, fileName: string): string | null {
  const loweredMimeType = mimeType.trim().toLowerCase()
  if (loweredMimeType === 'image/jpg') {
    return 'image/jpeg'
  }
  if (SUPPORTED_EXPERT_CHAT_IMAGE_TYPES.has(loweredMimeType)) {
    return loweredMimeType
  }

  const loweredFileName = fileName.trim().toLowerCase()
  if (loweredFileName.endsWith('.png')) {
    return 'image/png'
  }
  if (loweredFileName.endsWith('.jpg') || loweredFileName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (loweredFileName.endsWith('.webp')) {
    return 'image/webp'
  }
  return null
}

export function normalizeExpertChatVideoMimeType(mimeType: string, fileName: string): string | null {
  const loweredMimeType = mimeType.trim().toLowerCase()
  if (loweredMimeType === 'video/x-m4v') {
    return 'video/mp4'
  }
  if (SUPPORTED_EXPERT_CHAT_VIDEO_TYPES.has(loweredMimeType)) {
    return loweredMimeType
  }

  const loweredFileName = fileName.trim().toLowerCase()
  if (loweredFileName.endsWith('.mp4') || loweredFileName.endsWith('.m4v')) {
    return 'video/mp4'
  }
  if (loweredFileName.endsWith('.mov')) {
    return 'video/quicktime'
  }
  if (loweredFileName.endsWith('.webm')) {
    return 'video/webm'
  }
  return null
}

export function getExpertChatMediaKind(mimeType: string, fileName: string): ExpertChatMediaKind | null {
  if (normalizeExpertChatImageMimeType(mimeType, fileName)) {
    return 'image'
  }
  if (normalizeExpertChatVideoMimeType(mimeType, fileName)) {
    return 'video'
  }
  return null
}

export function buildExpertChatVideoFrameName(fileName: string, frameIndex: number): string {
  const normalizedFileName = fileName.trim() || 'cmr-video'
  return `${normalizedFileName} frame ${frameIndex + 1}`
}

export function buildExpertChatVideoFrameTimes(duration: number, frameCount: number): number[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1
  const safeFrameCount = Math.max(0, Math.floor(frameCount))
  if (safeFrameCount <= 0) {
    return []
  }
  if (safeFrameCount === 1) {
    return [safeDuration / 2]
  }
  return Array.from({ length: safeFrameCount }, (_, index) => (
    Number(((safeDuration * (index + 1)) / (safeFrameCount + 1)).toFixed(3))
  ))
}

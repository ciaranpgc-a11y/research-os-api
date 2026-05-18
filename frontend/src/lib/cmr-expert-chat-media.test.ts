import { describe, expect, it } from 'vitest'

import {
  MAX_EXPERT_CHAT_VIDEO_BYTES,
  buildExpertChatVideoFrameName,
  buildExpertChatVideoFrameTimes,
  getExpertChatMediaKind,
  normalizeExpertChatImageMimeType,
  normalizeExpertChatVideoMimeType,
} from '@/lib/cmr-expert-chat-media'

describe('CMR expert chat media helpers', () => {
  it('permits video uploads up to 100 MB', () => {
    expect(MAX_EXPERT_CHAT_VIDEO_BYTES).toBe(100 * 1024 * 1024)
  })

  it('normalizes supported image uploads by MIME type or extension', () => {
    expect(normalizeExpertChatImageMimeType('image/jpg', 'scan.jpg')).toBe('image/jpeg')
    expect(normalizeExpertChatImageMimeType('', 'scan.webp')).toBe('image/webp')
    expect(normalizeExpertChatImageMimeType('application/octet-stream', 'scan.png')).toBe('image/png')
  })

  it('normalizes supported video uploads by MIME type or extension', () => {
    expect(normalizeExpertChatVideoMimeType('video/mp4', 'cine.mp4')).toBe('video/mp4')
    expect(normalizeExpertChatVideoMimeType('', 'cine.mov')).toBe('video/quicktime')
    expect(normalizeExpertChatVideoMimeType('application/octet-stream', 'cine.webm')).toBe('video/webm')
    expect(normalizeExpertChatVideoMimeType('video/x-m4v', 'cine.m4v')).toBe('video/mp4')
  })

  it('classifies supported media while rejecting unrelated files', () => {
    expect(getExpertChatMediaKind('image/png', 'scan.png')).toBe('image')
    expect(getExpertChatMediaKind('video/quicktime', 'cine.mov')).toBe('video')
    expect(getExpertChatMediaKind('application/pdf', 'report.pdf')).toBeNull()
  })

  it('builds stable frame names and evenly spaced video frame times', () => {
    expect(buildExpertChatVideoFrameName('long-axis cine.mov', 2)).toBe('long-axis cine.mov frame 3')
    expect(buildExpertChatVideoFrameTimes(10, 4)).toEqual([2, 4, 6, 8])
    expect(buildExpertChatVideoFrameTimes(10, 1)).toEqual([5])
  })
})

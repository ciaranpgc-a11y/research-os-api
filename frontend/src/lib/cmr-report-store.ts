/**
 * Lightweight in-memory store for sharing extraction results between
 * the Upload Report page and the Quantitative visualiser page.
 */
import type { CmrExtractionResult } from '@/lib/cmr-api'

type Listener = () => void

let _result: CmrExtractionResult | null = null
const _listeners = new Set<Listener>()

export function getExtractionResult(): CmrExtractionResult | null {
  return _result
}

export function setExtractionResult(r: CmrExtractionResult | null): void {
  _result = r
  _listeners.forEach((fn) => fn())
}

export function subscribeExtractionResult(fn: Listener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * Lightweight in-memory store for sharing extraction results and scan options
 * between the Upload Report page and the Quantitative visualiser page.
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

// --- Non-contrast flag ---
let _nonContrast = false
const _ncListeners = new Set<Listener>()

export function getNonContrast(): boolean { return _nonContrast }
export function setNonContrast(v: boolean): void {
  _nonContrast = v
  _ncListeners.forEach((fn) => fn())
}
export function subscribeNonContrast(fn: Listener): () => void {
  _ncListeners.add(fn)
  return () => _ncListeners.delete(fn)
}

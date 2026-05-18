import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an ISO date string (YYYY-MM-DD) to dd/mm/yyyy */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Convert common stored date formats into a native date-input value (YYYY-MM-DD). */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return ''
  const raw = value.trim()
  if (!raw) return ''

  const isoPrefixMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/)
  if (isoPrefixMatch) return isoPrefixMatch[1]

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  const parsed = new Date(raw)
  if (isNaN(parsed.getTime())) return ''

  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

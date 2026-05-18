/**
 * EditablePill — a pill that shows a value and allows right-click to select from options.
 * Used for categorical fields (valve assessment, chamber size, case type, etc.)
 * Supports optional free-text input for fields like primary diagnosis.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type PillOption = {
  value: string
  label?: string
}

export function pillStyle(value: string): string {
  const v = value.toLowerCase().trim()
  if (v === 'normal' || v === 'none' || v === 'preserved' || v === 'no' || v === 'intact' || v === 'low' || v === 'absent' || v === 'completed' || v === 'reviewed')
    return 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]'
  if (v === 'trivial' || v === 'trace' || v === 'physiological')
    return 'bg-[hsl(160_15%_92%)] text-[hsl(160_20%_35%)] ring-[hsl(160_15%_82%)]'
  if (v.startsWith('mild') || v.startsWith('borderline') || v === 'low-intermediate' || v === 'pending')
    return 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]'
  if (v === 'intermediate')
    return 'bg-[hsl(30_58%_88%)] text-[hsl(24_62%_32%)] ring-[hsl(29_46%_76%)]'
  if (v.startsWith('moderate') || v === 'intermediate-high')
    return 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]'
  if (v.startsWith('severe') || v === 'high' || v === 'dilated' || v === 'present' || v === 'yes')
    return 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]'
  if (!v || v === 'n/a' || v === '\u2014' || v === 'archived')
    return 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))]'
  return 'bg-white text-[hsl(var(--foreground))] ring-[hsl(var(--tone-neutral-300))]'
}

export function EditablePill({
  label,
  value,
  options,
  onChange,
  allowFreeText = false,
}: {
  label: string
  value: string
  options: PillOption[]
  onChange: (value: string) => void
  allowFreeText?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [showFreeText, setShowFreeText] = useState(false)
  const [freeTextValue, setFreeTextValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
    setShowFreeText(false)
    setFreeTextValue('')
  }

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (showFreeText && inputRef.current) inputRef.current.focus()
  }, [showFreeText])

  const displayValue = value || 'N/A'

  return (
    <>
      <span
        onContextMenu={handleContextMenu}
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px] cursor-context-menu',
          label && 'rounded-full py-1 pl-2.5 pr-1 ring-1 ring-inset ring-[hsl(var(--tone-neutral-200))]',
        )}
      >
        {label && <span className="font-medium text-[hsl(var(--muted-foreground))]">{label}</span>}
        <span className={cn('rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset', pillStyle(displayValue))}>
          {displayValue}
        </span>
      </span>

      {menuOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] max-h-[300px] overflow-y-auto rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] py-1 shadow-lg"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {label}
          </div>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setMenuOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[hsl(var(--tone-neutral-50))]',
                value === opt.value && 'bg-[hsl(var(--tone-neutral-50))] font-semibold',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0 ring-1 ring-inset', pillStyle(opt.value))} />
              {opt.label ?? opt.value}
            </button>
          ))}
          <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] mt-1 pt-1">
            {allowFreeText && (
              showFreeText ? (
                <form
                  className="px-3 py-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (freeTextValue.trim()) {
                      onChange(freeTextValue.trim())
                      setMenuOpen(false)
                    }
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={freeTextValue}
                    onChange={(e) => setFreeTextValue(e.target.value)}
                    placeholder="Type custom value..."
                    className="house-input w-full rounded-lg text-xs py-1.5 px-2.5"
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setShowFreeText(false) } }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowFreeText(true)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
                >
                  Custom value...
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => { onChange(''); setMenuOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  )
}

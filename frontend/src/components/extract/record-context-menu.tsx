/**
 * Right-click context menu for record rows in the extraction tables.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type MenuItem = {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

export function useRecordContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  // Close on click outside or escape
  useEffect(() => {
    if (!menu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu, closeMenu])

  const MenuPortal = menu ? (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => { item.onClick(); closeMenu() }}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
            item.danger
              ? 'text-[hsl(var(--tone-danger-600))] hover:bg-[hsl(var(--tone-danger-50))]'
              : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  ) : null

  return { openMenu, closeMenu, MenuPortal }
}

export function DeleteMenuItem({ onDelete, label = 'Delete record' }: { onDelete: () => void; label?: string }) {
  return {
    label,
    icon: <Trash2 className="h-3.5 w-3.5" />,
    danger: true,
    onClick: onDelete,
  }
}

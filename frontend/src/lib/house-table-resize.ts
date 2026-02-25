const RESIZE_READY_ATTR = 'data-house-column-resize-ready'
const RESIZE_COUNT_ATTR = 'data-house-column-resize-count'
// Opt out by setting data-house-no-column-resize="true" on a table.
const RESIZE_DISABLED_ATTR = 'data-house-no-column-resize'
const RESIZE_COLGROUP_ATTR = 'data-house-resize-colgroup'
const RESIZE_HANDLE_CLASS = 'house-table-resize-handle'
const RESIZE_DRAGGING_ATTR = 'data-house-dragging'
const MIN_COLUMN_WIDTH_PX = 88
const FALLBACK_COLUMN_WIDTH_PX = 128

type TableCleanup = () => void

function parsePixelWidth(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized.endsWith('px')) {
    return null
  }
  const parsed = Number.parseFloat(normalized.replace('px', ''))
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function resolveHeaderCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const primaryHeaderRow =
    table.tHead?.rows[0] ??
    Array.from(table.rows).find((row) =>
      Array.from(row.cells).some((cell) => cell.tagName.toLowerCase() === 'th'),
    ) ??
    null
  if (!primaryHeaderRow) {
    return []
  }
  return Array.from(primaryHeaderRow.cells).filter((cell) => cell.tagName.toLowerCase() === 'th')
}

function hasComplexHeader(headerCells: HTMLTableCellElement[]): boolean {
  return headerCells.some((cell) => cell.colSpan !== 1)
}

function getOrCreateColgroup(table: HTMLTableElement, columnCount: number): HTMLTableColElement[] {
  let colgroup =
    Array.from(table.children).find(
      (child) => child.tagName.toLowerCase() === 'colgroup' && child.getAttribute(RESIZE_COLGROUP_ATTR) === 'true',
    ) ?? null
  if (!colgroup) {
    colgroup = document.createElement('colgroup')
    colgroup.setAttribute(RESIZE_COLGROUP_ATTR, 'true')
    table.insertBefore(colgroup, table.firstChild)
  }

  while (colgroup.children.length < columnCount) {
    colgroup.appendChild(document.createElement('col'))
  }
  while (colgroup.children.length > columnCount) {
    colgroup.removeChild(colgroup.lastElementChild as ChildNode)
  }

  return Array.from(colgroup.children) as HTMLTableColElement[]
}

function resolveInitialColumnWidths(
  table: HTMLTableElement,
  headerCells: HTMLTableCellElement[],
  columns: HTMLTableColElement[],
): number[] {
  const fallbackWidth = Math.max(
    MIN_COLUMN_WIDTH_PX,
    Math.round(table.getBoundingClientRect().width / Math.max(headerCells.length, 1)) || FALLBACK_COLUMN_WIDTH_PX,
  )
  return headerCells.map((cell, index) => {
    const explicitColWidth = parsePixelWidth(columns[index]?.style.width)
    if (explicitColWidth) {
      return Math.max(MIN_COLUMN_WIDTH_PX, explicitColWidth)
    }
    const measuredWidth = Math.round(cell.getBoundingClientRect().width)
    if (measuredWidth > 0) {
      return Math.max(MIN_COLUMN_WIDTH_PX, measuredWidth)
    }
    return fallbackWidth
  })
}

function syncTableWidth(table: HTMLTableElement, columnWidths: number[]) {
  const totalWidth = Math.max(0, Math.round(sum(columnWidths)))
  const containerWidth = Math.round(table.parentElement?.getBoundingClientRect().width || 0)
  const appliedWidth = Math.max(totalWidth, containerWidth)
  table.style.width = `${appliedWidth}px`
  table.style.minWidth = `${appliedWidth}px`
}

function applyColumnWidths(columns: HTMLTableColElement[], columnWidths: number[]) {
  columns.forEach((column, index) => {
    const width = Math.max(MIN_COLUMN_WIDTH_PX, Math.round(columnWidths[index] || MIN_COLUMN_WIDTH_PX))
    column.style.width = `${width}px`
    column.style.minWidth = `${width}px`
  })
}

function removeResizeHandles(table: HTMLTableElement) {
  table.querySelectorAll<HTMLButtonElement>(`.${RESIZE_HANDLE_CLASS}`).forEach((handle) => {
    handle.remove()
  })
}

function setupResizableTable(table: HTMLTableElement): TableCleanup | null {
  if (table.getAttribute(RESIZE_DISABLED_ATTR) === 'true') {
    return null
  }
  const headerCells = resolveHeaderCells(table)
  if (headerCells.length === 0 || hasComplexHeader(headerCells)) {
    return null
  }

  const columns = getOrCreateColgroup(table, headerCells.length)
  const columnWidths = resolveInitialColumnWidths(table, headerCells, columns)
  const initialInlineWidth = table.style.width
  const initialInlineMinWidth = table.style.minWidth
  applyColumnWidths(columns, columnWidths)
  table.classList.add('house-table-resizable')
  syncTableWidth(table, columnWidths)

  const pointerCleanupCallbacks: Array<() => void> = []
  const positionResetCallbacks: Array<() => void> = []

  headerCells.forEach((headerCell, columnIndex) => {
    if (window.getComputedStyle(headerCell).position === 'static') {
      const previousPosition = headerCell.style.position
      headerCell.style.position = 'relative'
      positionResetCallbacks.push(() => {
        headerCell.style.position = previousPosition
      })
    }

    const handle = document.createElement('button')
    handle.type = 'button'
    handle.className = RESIZE_HANDLE_CLASS
    handle.setAttribute('aria-label', `Resize column ${columnIndex + 1}`)
    handle.setAttribute('data-house-column-index', String(columnIndex))

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startWidth = columnWidths[columnIndex]
      const activeHandle = event.currentTarget as HTMLButtonElement

      activeHandle.setAttribute(RESIZE_DRAGGING_ATTR, 'true')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX
        const nextWidth = Math.max(MIN_COLUMN_WIDTH_PX, Math.round(startWidth + delta))
        columnWidths[columnIndex] = nextWidth
        applyColumnWidths(columns, columnWidths)
        syncTableWidth(table, columnWidths)
      }

      const stopResize = () => {
        activeHandle.removeAttribute(RESIZE_DRAGGING_ATTR)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', stopResize)
        window.removeEventListener('pointercancel', stopResize)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', stopResize)
      window.addEventListener('pointercancel', stopResize)
    }

    handle.addEventListener('pointerdown', onPointerDown)
    pointerCleanupCallbacks.push(() => {
      handle.removeEventListener('pointerdown', onPointerDown)
    })
    headerCell.appendChild(handle)
  })

  const onWindowResize = () => {
    syncTableWidth(table, columnWidths)
  }
  window.addEventListener('resize', onWindowResize)

  table.setAttribute(RESIZE_READY_ATTR, 'true')
  table.setAttribute(RESIZE_COUNT_ATTR, String(headerCells.length))

  return () => {
    pointerCleanupCallbacks.forEach((cleanup) => cleanup())
    positionResetCallbacks.forEach((cleanup) => cleanup())
    removeResizeHandles(table)
    window.removeEventListener('resize', onWindowResize)
    table.classList.remove('house-table-resizable')
    table.removeAttribute(RESIZE_READY_ATTR)
    table.removeAttribute(RESIZE_COUNT_ATTR)
    table.querySelectorAll(`colgroup[${RESIZE_COLGROUP_ATTR}="true"]`).forEach((colgroup) => {
      colgroup.remove()
    })
    table.style.minWidth = initialInlineMinWidth
    table.style.width = initialInlineWidth
  }
}

function needsRefresh(table: HTMLTableElement): boolean {
  if (table.getAttribute(RESIZE_DISABLED_ATTR) === 'true') {
    return true
  }
  const headerCells = resolveHeaderCells(table)
  if (headerCells.length === 0) {
    return table.hasAttribute(RESIZE_READY_ATTR)
  }
  const expectedCount = String(headerCells.length)
  if (!table.hasAttribute(RESIZE_READY_ATTR)) {
    return true
  }
  if (table.getAttribute(RESIZE_COUNT_ATTR) !== expectedCount) {
    return true
  }
  const existingHandles = table.querySelectorAll(`.${RESIZE_HANDLE_CLASS}`).length
  return existingHandles !== headerCells.length
}

export function installHouseTableResize(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined
  }

  const cleanupByTable = new WeakMap<HTMLTableElement, TableCleanup>()
  const enhancedTables = new Set<HTMLTableElement>()
  let disposed = false
  let scheduled = false

  const detachTable = (table: HTMLTableElement) => {
    const cleanup = cleanupByTable.get(table)
    if (!cleanup) {
      return
    }
    cleanup()
    cleanupByTable.delete(table)
    enhancedTables.delete(table)
  }

  const run = () => {
    scheduled = false
    if (disposed || !document.body) {
      return
    }

    enhancedTables.forEach((table) => {
      if (!table.isConnected || table.getAttribute(RESIZE_DISABLED_ATTR) === 'true') {
        detachTable(table)
      }
    })

    const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'))
    tables.forEach((table) => {
      if (table.getAttribute(RESIZE_DISABLED_ATTR) === 'true') {
        detachTable(table)
        return
      }
      if (!needsRefresh(table)) {
        return
      }
      detachTable(table)
      const cleanup = setupResizableTable(table)
      if (!cleanup) {
        return
      }
      cleanupByTable.set(table, cleanup)
      enhancedTables.add(table)
    })
  }

  const schedule = () => {
    if (disposed || scheduled) {
      return
    }
    scheduled = true
    window.requestAnimationFrame(run)
  }

  schedule()
  const observer = new MutationObserver(() => {
    schedule()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [RESIZE_DISABLED_ATTR],
  })

  return () => {
    disposed = true
    observer.disconnect()
    enhancedTables.forEach((table) => {
      detachTable(table)
    })
  }
}

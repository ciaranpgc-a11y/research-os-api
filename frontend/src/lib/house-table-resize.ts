const RESIZE_READY_ATTR = 'data-house-column-resize-ready'
const RESIZE_COUNT_ATTR = 'data-house-column-resize-count'
// Opt out by setting data-house-no-column-resize="true" on a table.
const RESIZE_DISABLED_ATTR = 'data-house-no-column-resize'
// Opt out by setting data-house-no-column-controls="true" on a table.
const CONTROLS_DISABLED_ATTR = 'data-house-no-column-controls'
const CONTROLS_READY_ATTR = 'data-house-column-controls-ready'
const RESIZE_COLGROUP_ATTR = 'data-house-resize-colgroup'
const RESIZE_HANDLE_CLASS = 'house-table-resize-handle'
const RESIZE_DRAGGING_ATTR = 'data-house-dragging'
const COLUMN_CONTROLS_CLASS = 'house-table-column-controls'
const COLUMN_CONTROLS_TRIGGER_CLASS = 'house-table-column-controls-trigger'
const COLUMN_CONTROLS_PANEL_CLASS = 'house-table-column-controls-panel'
const COLUMN_CONTROLS_ROW_CLASS = 'house-table-column-controls-row'
const COLUMN_CONTROLS_VISIBILITY_CLASS = 'house-table-column-controls-visibility'
const COLUMN_CONTROLS_ALIGN_CLASS = 'house-table-column-controls-align'
const TABLE_PREFS_STORAGE_PREFIX = 'house-table-columns:v1:'
const MIN_COLUMN_WIDTH_PX = 88
const FALLBACK_COLUMN_WIDTH_PX = 128

type TableCleanup = () => void
type ColumnAlignment = 'left' | 'center' | 'right'
type ColumnPreference = {
  align: ColumnAlignment
  hidden: boolean
}

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

function normalizeStorageSegment(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
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

function applyColumnPresentation(
  table: HTMLTableElement,
  columns: HTMLTableColElement[],
  columnWidths: number[],
  columnPreferences: ColumnPreference[],
) {
  const rows = Array.from(table.rows)
  const visibleWidths: number[] = []

  columnPreferences.forEach((preference, columnIndex) => {
    const column = columns[columnIndex]
    const nextWidth = Math.max(MIN_COLUMN_WIDTH_PX, Math.round(columnWidths[columnIndex] || MIN_COLUMN_WIDTH_PX))
    const isHidden = preference.hidden

    if (column) {
      if (isHidden) {
        column.style.display = 'none'
        column.style.width = '0px'
        column.style.minWidth = '0px'
      } else {
        column.style.display = ''
        column.style.width = `${nextWidth}px`
        column.style.minWidth = `${nextWidth}px`
        visibleWidths.push(nextWidth)
      }
    }

    rows.forEach((row) => {
      const cell = row.cells.item(columnIndex) as HTMLElement | null
      if (!cell) {
        return
      }
      cell.style.display = isHidden ? 'none' : ''
      cell.style.textAlign = preference.align
    })
  })

  syncTableWidth(table, visibleWidths.length > 0 ? visibleWidths : [MIN_COLUMN_WIDTH_PX])
}

function removeResizeHandles(table: HTMLTableElement) {
  table.querySelectorAll<HTMLButtonElement>(`.${RESIZE_HANDLE_CLASS}`).forEach((handle) => {
    handle.remove()
  })
}

function normalizeHeaderLabel(headerCell: HTMLTableCellElement, index: number): string {
  const text = headerCell.textContent?.replace(/\s+/g, ' ').trim() || ''
  return text || `Column ${index + 1}`
}

function resolveTablePreferenceKey(table: HTMLTableElement, headerCells: HTMLTableCellElement[]): string | null {
  const explicitId = table.getAttribute('data-house-table-id') || table.id
  if (explicitId) {
    return `${TABLE_PREFS_STORAGE_PREFIX}${normalizeStorageSegment(explicitId)}`
  }

  if (typeof window === 'undefined') {
    return null
  }

  const role = table.getAttribute('data-house-role') || table.getAttribute('data-ui') || 'table'
  const headerSignature = headerCells.map((headerCell, index) => normalizeHeaderLabel(headerCell, index)).join('|')
  const pathSignature = normalizeStorageSegment(window.location.pathname || 'page')
  const roleSignature = normalizeStorageSegment(role)
  const headerKey = normalizeStorageSegment(headerSignature || 'columns')
  return `${TABLE_PREFS_STORAGE_PREFIX}${pathSignature}:${roleSignature}:${headerKey}`
}

function createDefaultColumnPreferences(columnCount: number): ColumnPreference[] {
  return Array.from({ length: columnCount }, () => ({ align: 'left' as const, hidden: false }))
}

function ensureVisibleColumn(preferences: ColumnPreference[]) {
  if (preferences.length === 0) {
    return
  }
  if (preferences.some((preference) => !preference.hidden)) {
    return
  }
  preferences[0] = { ...preferences[0], hidden: false }
}

function loadColumnPreferences(storageKey: string | null, columnCount: number): ColumnPreference[] {
  const defaults = createDefaultColumnPreferences(columnCount)
  if (!storageKey || typeof window === 'undefined') {
    return defaults
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    if (!rawValue) {
      return defaults
    }
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) {
      return defaults
    }

    for (let index = 0; index < defaults.length; index += 1) {
      const entry = parsed[index]
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const alignCandidate = (entry as { align?: unknown }).align
      const hiddenCandidate = (entry as { hidden?: unknown }).hidden

      if (alignCandidate === 'left' || alignCandidate === 'center' || alignCandidate === 'right') {
        defaults[index] = { ...defaults[index], align: alignCandidate }
      }
      if (typeof hiddenCandidate === 'boolean') {
        defaults[index] = { ...defaults[index], hidden: hiddenCandidate }
      }
    }
  } catch {
    // Ignore malformed or inaccessible storage.
  }

  ensureVisibleColumn(defaults)
  return defaults
}

function saveColumnPreferences(storageKey: string | null, preferences: ColumnPreference[]) {
  if (!storageKey || typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // Ignore quota or storage access errors.
  }
}

function resolveControlsHost(table: HTMLTableElement): HTMLElement | null {
  return table.closest<HTMLElement>('[data-ui="table-shell"],[data-house-role="table-shell"]') ?? table.parentElement
}

function setupColumnControls(params: {
  table: HTMLTableElement
  headerCells: HTMLTableCellElement[]
  columnPreferences: ColumnPreference[]
  onPreferencesChange: () => void
}): TableCleanup {
  const { table, headerCells, columnPreferences, onPreferencesChange } = params

  if (table.getAttribute(CONTROLS_DISABLED_ATTR) === 'true') {
    table.removeAttribute(CONTROLS_READY_ATTR)
    return () => undefined
  }

  const host = resolveControlsHost(table)
  if (!host) {
    return () => undefined
  }

  const details = document.createElement('details')
  details.className = COLUMN_CONTROLS_CLASS

  const summary = document.createElement('summary')
  summary.className = COLUMN_CONTROLS_TRIGGER_CLASS
  summary.textContent = 'Columns'
  details.appendChild(summary)

  const panel = document.createElement('div')
  panel.className = COLUMN_CONTROLS_PANEL_CLASS
  details.appendChild(panel)

  const listenerCleanupCallbacks: Array<() => void> = []
  const rows: HTMLDivElement[] = []
  const visibilityToggles: HTMLInputElement[] = []
  const alignSelects: HTMLSelectElement[] = []

  const countVisibleColumns = () => columnPreferences.reduce((total, preference) => (preference.hidden ? total : total + 1), 0)

  const refreshControls = () => {
    columnPreferences.forEach((preference, index) => {
      const row = rows[index]
      const toggle = visibilityToggles[index]
      const alignSelect = alignSelects[index]
      if (!row || !toggle || !alignSelect) {
        return
      }
      row.setAttribute('data-column-hidden', preference.hidden ? 'true' : 'false')
      toggle.checked = !preference.hidden
      alignSelect.value = preference.align
      alignSelect.disabled = preference.hidden
    })
  }

  headerCells.forEach((headerCell, columnIndex) => {
    const row = document.createElement('div')
    row.className = COLUMN_CONTROLS_ROW_CLASS

    const visibilityLabel = document.createElement('label')
    visibilityLabel.className = COLUMN_CONTROLS_VISIBILITY_CLASS
    const visibilityInput = document.createElement('input')
    visibilityInput.type = 'checkbox'
    visibilityInput.checked = !columnPreferences[columnIndex].hidden
    const labelText = document.createElement('span')
    labelText.textContent = normalizeHeaderLabel(headerCell, columnIndex)
    visibilityLabel.appendChild(visibilityInput)
    visibilityLabel.appendChild(labelText)
    row.appendChild(visibilityLabel)

    const alignSelect = document.createElement('select')
    alignSelect.className = `house-dropdown ${COLUMN_CONTROLS_ALIGN_CLASS}`

    ;(['left', 'center', 'right'] as const).forEach((alignment) => {
      const option = document.createElement('option')
      option.value = alignment
      option.textContent = alignment.charAt(0).toUpperCase() + alignment.slice(1)
      alignSelect.appendChild(option)
    })
    alignSelect.value = columnPreferences[columnIndex].align
    row.appendChild(alignSelect)

    const onVisibilityChange = () => {
      const visibleCount = countVisibleColumns()
      if (!visibilityInput.checked && visibleCount <= 1) {
        visibilityInput.checked = true
        return
      }
      columnPreferences[columnIndex] = {
        ...columnPreferences[columnIndex],
        hidden: !visibilityInput.checked,
      }
      ensureVisibleColumn(columnPreferences)
      onPreferencesChange()
      refreshControls()
    }
    const onAlignChange = () => {
      const nextAlign = alignSelect.value
      if (nextAlign !== 'left' && nextAlign !== 'center' && nextAlign !== 'right') {
        return
      }
      columnPreferences[columnIndex] = {
        ...columnPreferences[columnIndex],
        align: nextAlign,
      }
      onPreferencesChange()
      refreshControls()
    }

    visibilityInput.addEventListener('change', onVisibilityChange)
    alignSelect.addEventListener('change', onAlignChange)
    listenerCleanupCallbacks.push(() => visibilityInput.removeEventListener('change', onVisibilityChange))
    listenerCleanupCallbacks.push(() => alignSelect.removeEventListener('change', onAlignChange))

    panel.appendChild(row)
    rows.push(row)
    visibilityToggles.push(visibilityInput)
    alignSelects.push(alignSelect)
  })

  let resetHostPosition: (() => void) | null = null
  if (window.getComputedStyle(host).position === 'static') {
    const previousPosition = host.style.position
    host.style.position = 'relative'
    resetHostPosition = () => {
      host.style.position = previousPosition
    }
  }

  host.appendChild(details)
  table.setAttribute(CONTROLS_READY_ATTR, 'true')
  refreshControls()

  return () => {
    listenerCleanupCallbacks.forEach((cleanup) => cleanup())
    details.remove()
    table.removeAttribute(CONTROLS_READY_ATTR)
    if (resetHostPosition) {
      resetHostPosition()
    }
  }
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
  const storageKey = resolveTablePreferenceKey(table, headerCells)
  const columnPreferences = loadColumnPreferences(storageKey, headerCells.length)

  table.classList.add('house-table-resizable')
  applyColumnPresentation(table, columns, columnWidths, columnPreferences)

  const pointerCleanupCallbacks: Array<() => void> = []
  const positionResetCallbacks: Array<() => void> = []
  const controlsCleanup = setupColumnControls({
    table,
    headerCells,
    columnPreferences,
    onPreferencesChange: () => {
      applyColumnPresentation(table, columns, columnWidths, columnPreferences)
      saveColumnPreferences(storageKey, columnPreferences)
    },
  })

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
      if (columnPreferences[columnIndex]?.hidden) {
        return
      }

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
        applyColumnPresentation(table, columns, columnWidths, columnPreferences)
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
    applyColumnPresentation(table, columns, columnWidths, columnPreferences)
  }
  window.addEventListener('resize', onWindowResize)

  table.setAttribute(RESIZE_READY_ATTR, 'true')
  table.setAttribute(RESIZE_COUNT_ATTR, String(headerCells.length))

  return () => {
    pointerCleanupCallbacks.forEach((cleanup) => cleanup())
    positionResetCallbacks.forEach((cleanup) => cleanup())
    controlsCleanup()
    removeResizeHandles(table)
    window.removeEventListener('resize', onWindowResize)
    table.classList.remove('house-table-resizable')
    table.removeAttribute(RESIZE_READY_ATTR)
    table.removeAttribute(RESIZE_COUNT_ATTR)
    table.querySelectorAll(`colgroup[${RESIZE_COLGROUP_ATTR}="true"]`).forEach((colgroup) => {
      colgroup.remove()
    })

    Array.from(table.rows).forEach((row) => {
      Array.from(row.cells).forEach((cell) => {
        const htmlCell = cell as HTMLElement
        htmlCell.style.display = ''
        htmlCell.style.textAlign = ''
      })
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
    return table.hasAttribute(RESIZE_READY_ATTR) || table.hasAttribute(CONTROLS_READY_ATTR)
  }

  const expectedCount = String(headerCells.length)
  if (!table.hasAttribute(RESIZE_READY_ATTR)) {
    return true
  }
  if (table.getAttribute(RESIZE_COUNT_ATTR) !== expectedCount) {
    return true
  }

  const controlsEnabled = table.getAttribute(CONTROLS_DISABLED_ATTR) !== 'true'
  const controlsReady = table.hasAttribute(CONTROLS_READY_ATTR)
  if (controlsEnabled !== controlsReady) {
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
    attributeFilter: [RESIZE_DISABLED_ATTR, CONTROLS_DISABLED_ATTR],
  })

  return () => {
    disposed = true
    observer.disconnect()
    enhancedTables.forEach((table) => {
      detachTable(table)
    })
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, X, Check, Pencil, Palette, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  COLLECTION_COLOUR_HEX,
  type CollectionColour,
  type CollectionPayload,
  type SubcollectionPayload,
} from '@/types/collections'
import { ALL_COLOURS } from './collections-utils'
import { fetchSubcollections } from '@/lib/collections-api'

// ---------------------------------------------------------------------------
// ColourPicker
// ---------------------------------------------------------------------------

function ColourPicker({
  x,
  y,
  value,
  onChange,
  onClose,
}: {
  x: number
  y: number
  value: CollectionColour
  onChange: (c: CollectionColour) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const width = 148
  const left = Math.min(x, window.innerWidth - width - 8)
  const top = Math.min(y, window.innerHeight - 80)

  return (
    <div
      ref={ref}
      className="fixed z-[200] rounded-md border border-border bg-card p-2 shadow-xl grid grid-cols-5 gap-1.5"
      style={{ width, left, top }}
    >
      {ALL_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn(
            'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
            c === value ? 'border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: COLLECTION_COLOUR_HEX[c] }}
          onClick={() => {
            onChange(c)
            onClose()
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContextMenu — fixed-position right-click menu
// ---------------------------------------------------------------------------

function ContextMenu({
  x,
  y,
  onRename,
  onDelete,
  onChangeColour,
  onAddSubcollection,
  onClose,
}: {
  x: number
  y: number
  onRename: () => void
  onDelete: () => void
  onChangeColour: () => void
  onAddSubcollection: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // Also close on any context menu elsewhere
    function ctxHandler() { onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('contextmenu', ctxHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('contextmenu', ctxHandler)
    }
  }, [onClose])

  // Clamp to viewport so menu doesn't go offscreen
  const menuWidth = 176
  const menuHeight = 148
  const left = Math.min(x, window.innerWidth - menuWidth - 8)
  const top = Math.min(y, window.innerHeight - menuHeight - 8)

  const item = 'flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]'

  return (
    <div
      ref={ref}
      className="fixed z-[200] w-44 rounded-lg border border-border bg-card p-1 shadow-xl"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className={item} onClick={() => { onRename(); onClose() }}>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> Rename
      </button>
      <button type="button" className={item} onClick={() => { onChangeColour(); onClose() }}>
        <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> Change colour
      </button>
      <div className="my-1 border-t border-border" />
      <button type="button" className={item} onClick={() => { onAddSubcollection(); onClose() }}>
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> Add subcollection
      </button>
      <div className="my-1 border-t border-border" />
      <button type="button" className={cn(item, 'text-destructive hover:bg-destructive/10 hover:text-destructive')} onClick={() => { onDelete(); onClose() }}>
        <Trash2 className="h-3.5 w-3.5 shrink-0" /> Delete
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

interface CollectionSidebarProps {
  collections: CollectionPayload[]
  mode: 'organise' | 'browse'
  // expand/collapse
  expandedIds: Set<string>
  onToggleExpand: (collectionId: string) => void
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
  // selection (browse mode)
  selectedCollectionId: string | null
  selectedSubcollectionId: string | null
  onSelectCollection: (id: string) => void
  onSelectSubcollection: (id: string | null) => void
  // drag and drop
  dropTargetId: string | null
  onDragOver: (e: React.DragEvent, targetId: string) => void
  onDragLeave: () => void
  onDrop: (targetId: string) => void
  // pulse animation
  pulsingId: string | null
  // collection CRUD
  creatingCollection: boolean
  onStartCreateCollection: () => void
  newCollectionName: string
  setNewCollectionName: (v: string) => void
  newCollectionColour: CollectionColour
  onCreateCollection: () => void
  onCancelCreateCollection: () => void
  newCollectionInputRef: React.RefObject<HTMLInputElement>
  // collection management
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
  onColourChange: (id: string, colour: CollectionColour) => void
  // subcollection CRUD
  onCreateSubcollection: (collectionId: string, name: string) => void
  onRenameSubcollection: (collectionId: string, subId: string, name: string) => void
  onDeleteSubcollection: (collectionId: string, subId: string) => void
}

export function CollectionSidebar(props: CollectionSidebarProps) {
  const {
    collections,
    mode,
    expandedIds,
    onToggleExpand,
    subcollectionsMap,
    onSubcollectionsFetched,
    selectedCollectionId,
    selectedSubcollectionId,
    onSelectCollection,
    onSelectSubcollection,
    dropTargetId,
    onDragOver,
    onDragLeave,
    onDrop,
    pulsingId,
    creatingCollection,
    onStartCreateCollection,
    newCollectionName,
    setNewCollectionName,
    newCollectionColour,
    onCreateCollection,
    onCancelCreateCollection,
    newCollectionInputRef,
    onRenameCollection,
    onDeleteCollection,
    onColourChange,
    onCreateSubcollection,
    onRenameSubcollection,
    onDeleteSubcollection,
  } = props

  // ---- internal state ----
  const [contextMenu, setContextMenu] = useState<{ collectionId: string; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colourPickerState, setColourPickerState] = useState<{ id: string; x: number; y: number } | null>(null)

  const [renamingSubId, setRenamingSubId] = useState<string | null>(null)
  const [subRenameValue, setSubRenameValue] = useState('')

  const [creatingSubForId, setCreatingSubForId] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')

  const renameInputRef = useRef<HTMLInputElement>(null)
  const subRenameInputRef = useRef<HTMLInputElement>(null)
  const newSubInputRef = useRef<HTMLInputElement>(null)

  // ---- focus inputs when editing starts ----
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])
  useEffect(() => {
    if (renamingSubId) subRenameInputRef.current?.focus()
  }, [renamingSubId])
  useEffect(() => {
    if (creatingSubForId) newSubInputRef.current?.focus()
  }, [creatingSubForId])

  // ---- lazy-load subcollections on expand ----
  const handleToggleExpand = useCallback(
    async (collectionId: string) => {
      onToggleExpand(collectionId)
      if (!subcollectionsMap.has(collectionId)) {
        const subs = await fetchSubcollections(collectionId).catch(
          () => [] as SubcollectionPayload[],
        )
        onSubcollectionsFetched(collectionId, subs)
      }
    },
    [onToggleExpand, subcollectionsMap, onSubcollectionsFetched],
  )

  // ---- rename helpers ----
  const startRename = useCallback(
    (coll: CollectionPayload) => {
      setRenamingId(coll.id)
      setRenameValue(coll.name)
      setContextMenu(null)
    },
    [],
  )

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameCollection(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, onRenameCollection])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  // ---- subcollection rename helpers ----
  const startSubRename = useCallback((sub: SubcollectionPayload) => {
    setRenamingSubId(sub.id)
    setSubRenameValue(sub.name)
  }, [])

  const commitSubRename = useCallback(
    (collectionId: string) => {
      if (renamingSubId && subRenameValue.trim()) {
        onRenameSubcollection(collectionId, renamingSubId, subRenameValue.trim())
      }
      setRenamingSubId(null)
      setSubRenameValue('')
    },
    [renamingSubId, subRenameValue, onRenameSubcollection],
  )

  const cancelSubRename = useCallback(() => {
    setRenamingSubId(null)
    setSubRenameValue('')
  }, [])

  // ---- subcollection create helpers ----
  const startCreateSub = useCallback((collectionId: string) => {
    setCreatingSubForId(collectionId)
    setNewSubName('')
    // Ensure the collection is expanded so the inline form is visible
    if (!expandedIds.has(collectionId)) onToggleExpand(collectionId)
  }, [expandedIds, onToggleExpand])

  const commitCreateSub = useCallback(() => {
    if (creatingSubForId && newSubName.trim()) {
      onCreateSubcollection(creatingSubForId, newSubName.trim())
    }
    setCreatingSubForId(null)
    setNewSubName('')
  }, [creatingSubForId, newSubName, onCreateSubcollection])

  const cancelCreateSub = useCallback(() => {
    setCreatingSubForId(null)
    setNewSubName('')
  }, [])

  // ---- render ----
  return (
    <div className="w-[380px] min-w-[380px] bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Collections</span>
        <button
          type="button"
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-[hsl(var(--tone-accent-100))] text-muted-foreground hover:text-foreground transition-colors"
          onClick={onStartCreateCollection}
          title="New collection"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Collection list */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Empty state */}
        {collections.length === 0 && !creatingCollection && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">No collections yet</p>
            <button
              type="button"
              className="text-sm text-[hsl(var(--tone-accent-700))] hover:text-[hsl(var(--tone-accent-900))] font-medium"
              onClick={onStartCreateCollection}
            >
              Create your first collection
            </button>
          </div>
        )}

        {/* Collections */}
        {collections.map((coll) => {
          const isExpanded = expandedIds.has(coll.id)
          const isSelected = selectedCollectionId === coll.id
          const isDropTarget = dropTargetId === coll.id
          const isPulsing = pulsingId === coll.id
          const subs = subcollectionsMap.get(coll.id) ?? []

          return (
            <div key={coll.id} className="px-3 py-0.5 border-b border-border/40 last:border-0">
              {/* Collection row */}
              {renamingId === coll.id ? (
                /* Inline rename */
                <div
                  className="flex items-center gap-2 pl-4 pr-3 py-2"
                  style={{ borderLeft: `3px solid ${COLLECTION_COLOUR_HEX[coll.colour]}` }}
                >
                  <input
                    ref={renameInputRef}
                    type="text"
                    className="house-input h-8 flex-1 rounded-md px-2 text-sm"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                  />
                  <button
                    type="button"
                    className="house-collaborator-action-icon-save h-6 w-6 flex items-center justify-center rounded"
                    onClick={commitRename}
                    title="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="house-collaborator-action-icon-discard h-6 w-6 flex items-center justify-center rounded"
                    onClick={cancelRename}
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                /* Normal row */
                <div
                  className={cn(
                    'group flex items-center gap-2 pl-4 pr-2 py-2.5 cursor-pointer text-sm transition-colors rounded-r-md select-none',
                    isSelected && 'bg-[hsl(var(--tone-accent-100))]',
                    isDropTarget &&
                      'outline-2 outline-dashed outline-[hsl(var(--tone-accent-500))] bg-[hsl(var(--tone-accent-50))]',
                    isPulsing && 'animate-drop-pulse',
                  )}
                  style={{ borderLeft: `3px solid ${COLLECTION_COLOUR_HEX[coll.colour]}` }}
                  onClick={() => {
                    handleToggleExpand(coll.id)
                    if (mode === 'browse') {
                      onSelectCollection(coll.id)
                      onSelectSubcollection(null)
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({ collectionId: coll.id, x: e.clientX, y: e.clientY })
                  }}
                  onDragOver={mode === 'organise' ? (e) => onDragOver(e, coll.id) : undefined}
                  onDragLeave={mode === 'organise' ? onDragLeave : undefined}
                  onDrop={mode === 'organise' ? () => onDrop(coll.id) : undefined}
                >
                  {/* Name + count */}
                  <span className="flex-1 truncate text-foreground">{coll.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {coll.publication_count}
                  </span>

                </div>
              )}

              {/* Expanded subcollections */}
              {isExpanded && (
                <div className="ml-4">
                  {/* "All papers" entry (browse mode only) */}
                  {mode === 'browse' && (
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors rounded-r-md',
                        isSelected && selectedSubcollectionId === null
                          ? 'bg-[hsl(var(--tone-accent-100))]'
                          : 'hover:bg-muted/50',
                      )}
                      style={{
                        borderLeft: `2px solid ${COLLECTION_COLOUR_HEX[coll.colour]}40`,
                      }}
                      onClick={() => {
                        onSelectCollection(coll.id)
                        onSelectSubcollection(null)
                      }}
                    >
                      <span className="flex-1 truncate text-muted-foreground text-sm">
                        All papers
                      </span>
                    </div>
                  )}

                  {/* Subcollection rows */}
                  {subs.map((sub) => {
                    const isSubSelected = selectedSubcollectionId === sub.id
                    const isSubDropTarget = dropTargetId === sub.id
                    const isSubPulsing = pulsingId === sub.id

                    return renamingSubId === sub.id ? (
                      /* Inline subcollection rename */
                      <div
                        key={sub.id}
                        className="flex items-center gap-2 px-3 py-1.5"
                        style={{
                          borderLeft: `2px solid ${COLLECTION_COLOUR_HEX[coll.colour]}40`,
                        }}
                      >
                        <input
                          ref={subRenameInputRef}
                          type="text"
                          className="house-input h-8 flex-1 rounded-md px-2 text-sm"
                          value={subRenameValue}
                          onChange={(e) => setSubRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitSubRename(coll.id)
                            if (e.key === 'Escape') cancelSubRename()
                          }}
                        />
                        <button
                          type="button"
                          className="house-collaborator-action-icon-save h-5 w-5 flex items-center justify-center rounded"
                          onClick={() => commitSubRename(coll.id)}
                          title="Save"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className="house-collaborator-action-icon-discard h-5 w-5 flex items-center justify-center rounded"
                          onClick={cancelSubRename}
                          title="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      /* Normal subcollection row */
                      <div
                        key={sub.id}
                        className={cn(
                          'group/sub flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors rounded-r-md',
                          isSubSelected && 'bg-[hsl(var(--tone-accent-100))]',
                          isSubDropTarget &&
                            'outline-2 outline-dashed outline-[hsl(var(--tone-accent-500))] bg-[hsl(var(--tone-accent-50))]',
                          isSubPulsing && 'animate-drop-pulse',
                        )}
                        style={{
                          borderLeft: `2px solid ${COLLECTION_COLOUR_HEX[coll.colour]}${isSubSelected ? '80' : '40'}`,
                        }}
                        onClick={() => {
                          if (mode === 'browse') {
                            onSelectCollection(coll.id)
                            onSelectSubcollection(sub.id)
                          }
                        }}
                        onDragOver={
                          mode === 'organise'
                            ? (e) => onDragOver(e, sub.id)
                            : undefined
                        }
                        onDragLeave={mode === 'organise' ? onDragLeave : undefined}
                        onDrop={
                          mode === 'organise'
                            ? () => onDrop(sub.id)
                            : undefined
                        }
                      >
                        <span className="flex-1 truncate text-foreground">{sub.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {sub.publication_count}
                        </span>

                        {/* Rename button (on hover) */}
                        <button
                          type="button"
                          className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover/sub:opacity-100 hover:bg-[hsl(var(--tone-accent-100))] text-muted-foreground transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            startSubRename(sub)
                          }}
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>

                        {/* Delete button (on hover) */}
                        <button
                          type="button"
                          className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover/sub:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSubcollection(coll.id, sub.id)
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}

                  {/* New subcollection inline input (triggered via right-click only) */}
                  {creatingSubForId === coll.id && (
                      <div
                        className="flex items-center gap-2 px-3 py-1.5"
                        style={{
                          borderLeft: `2px solid ${COLLECTION_COLOUR_HEX[coll.colour]}40`,
                        }}
                      >
                        <input
                          ref={newSubInputRef}
                          type="text"
                          className="house-input h-8 flex-1 rounded-md px-2 text-sm"
                          placeholder="Subcollection name"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCreateSub()
                            if (e.key === 'Escape') cancelCreateSub()
                          }}
                        />
                        <button
                          type="button"
                          className="house-collaborator-action-icon-save h-6 w-6 flex items-center justify-center rounded"
                          onClick={commitCreateSub}
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="house-collaborator-action-icon-discard h-6 w-6 flex items-center justify-center rounded"
                          onClick={cancelCreateSub}
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* New collection inline row */}
        {creatingCollection && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div
              className="w-[3px] self-stretch rounded-full shrink-0"
              style={{ backgroundColor: COLLECTION_COLOUR_HEX[newCollectionColour] }}
            />
            <input
              ref={newCollectionInputRef}
              type="text"
              className="house-input h-8 flex-1 rounded-md px-2 text-sm"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateCollection()
                if (e.key === 'Escape') onCancelCreateCollection()
              }}
            />
            <button
              type="button"
              className="house-collaborator-action-icon-save h-6 w-6 flex items-center justify-center rounded"
              onClick={onCreateCollection}
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="house-collaborator-action-icon-discard h-6 w-6 flex items-center justify-center rounded"
              onClick={onCancelCreateCollection}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Fixed-position colour picker */}
      {colourPickerState && (() => {
        const coll = collections.find((c) => c.id === colourPickerState.id)
        if (!coll) return null
        return (
          <ColourPicker
            x={colourPickerState.x}
            y={colourPickerState.y}
            value={coll.colour}
            onChange={(c) => onColourChange(coll.id, c)}
            onClose={() => setColourPickerState(null)}
          />
        )
      })()}

      {/* Right-click context menu */}
      {contextMenu && (() => {
        const coll = collections.find((c) => c.id === contextMenu.collectionId)
        if (!coll) return null
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onRename={() => startRename(coll)}
            onDelete={() => onDeleteCollection(coll.id)}
            onChangeColour={() => setColourPickerState({ id: coll.id, x: contextMenu.x, y: contextMenu.y })}
            onAddSubcollection={() => startCreateSub(coll.id)}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}

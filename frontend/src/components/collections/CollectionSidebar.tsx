import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  ChevronRight,
  Check,
  EllipsisVertical,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  COLLECTION_COLOUR_HEX,
  type CollectionColour,
  type CollectionPayload,
  type SubcollectionPayload,
} from '@/types/collections'
import { ALL_COLOURS } from './collections-utils'
import { fetchSubcollections } from '@/lib/collections-api'

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
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  const width = 156
  const left = typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - width - 8)
  const top = typeof window === 'undefined' ? y : Math.min(y, window.innerHeight - 80)

  return (
    <div
      ref={ref}
      className="fixed z-[200] grid grid-cols-5 gap-1.5 rounded-md border border-border bg-card p-2 shadow-xl"
      style={{ width, left, top }}
    >
      {ALL_COLOURS.map((colour) => (
        <button
          key={colour}
          type="button"
          className={cn(
            'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
            colour === value ? 'border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: COLLECTION_COLOUR_HEX[colour] }}
          aria-label={`Set collection colour to ${colour}`}
          onClick={() => {
            onChange(colour)
            onClose()
          }}
        />
      ))}
    </div>
  )
}

function Menu({
  x,
  y,
  onRename,
  onColour,
  onCreateSubcollection,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  onRename: () => void
  onColour: () => void
  onCreateSubcollection: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  const left = typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - 180 - 8)
  const top = typeof window === 'undefined' ? y : Math.min(y, window.innerHeight - 180 - 8)
  const item = 'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-foreground hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]'

  return (
    <div
      ref={ref}
      className="fixed z-[200] w-44 rounded-lg border border-border bg-card p-1 shadow-xl"
      style={{ left, top }}
    >
      <button type="button" className={item} onClick={() => { onRename(); onClose() }}>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        Rename
      </button>
      <button type="button" className={item} onClick={() => { onColour(); onClose() }}>
        <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        Change colour
      </button>
      <div className="my-1 border-t border-border" />
      <button type="button" className={item} onClick={() => { onCreateSubcollection(); onClose() }}>
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        Add subcollection
      </button>
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        className={cn(item, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
        onClick={() => { onDelete(); onClose() }}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        Delete
      </button>
    </div>
  )
}

interface CollectionSidebarProps {
  collections: CollectionPayload[]
  mode: 'organise' | 'browse'
  expandedIds: Set<string>
  onToggleExpand: (collectionId: string) => void
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
  selectedCollectionId: string | null
  selectedSubcollectionId: string | null
  onSelectCollection: (id: string) => void
  onSelectSubcollection: (collectionId: string, id: string | null) => void
  isDragging?: boolean
  dropTargetId?: string | null
  onDragOver?: (e: DragEvent, targetId: string) => void
  onDragLeave?: () => void
  onDrop?: (collectionId: string, subcollectionId?: string) => void
  pulsingId: string | null
  creatingCollection: boolean
  onStartCreateCollection: () => void
  newCollectionName: string
  setNewCollectionName: (v: string) => void
  newCollectionColour: CollectionColour
  onCreateCollection: () => void
  onCancelCreateCollection: () => void
  pageMode?: boolean
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
  onColourChange: (id: string, colour: CollectionColour) => void
  onCreateSubcollection: (collectionId: string, name: string) => void
  onRenameSubcollection: (collectionId: string, subId: string, name: string) => void
  onDeleteSubcollection: (collectionId: string, subId: string) => void
  allPublicationsCount?: number
  uncollectedCount?: number
  selectedViewKind?: 'all' | 'uncollected' | 'collection'
  onSelectAllPublications?: () => void
  onSelectUncollected?: () => void
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
    pulsingId,
    creatingCollection,
    onStartCreateCollection,
    newCollectionName,
    setNewCollectionName,
    newCollectionColour,
    onCreateCollection,
    onCancelCreateCollection,
    pageMode = false,
    onRenameCollection,
    onDeleteCollection,
    onColourChange,
    onCreateSubcollection,
    onRenameSubcollection,
    onDeleteSubcollection,
    allPublicationsCount,
    uncollectedCount,
    selectedViewKind,
    onSelectAllPublications,
    onSelectUncollected,
  } = props

  const [searchQuery, setSearchQuery] = useState('')
  const [collectionMenu, setCollectionMenu] = useState<{ collectionId: string; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingSubForId, setCreatingSubForId] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const [renamingSubId, setRenamingSubId] = useState<string | null>(null)
  const [subRenameValue, setSubRenameValue] = useState('')
  const [colourPickerState, setColourPickerState] = useState<{ id: string; x: number; y: number } | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const subRenameInputRef = useRef<HTMLInputElement>(null)
  const newSubInputRef = useRef<HTMLInputElement>(null)
  const createCollectionInputRef = useRef<HTMLInputElement | null>(null)

  const filteredCollections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return collections
    return collections.filter((collection) => {
      const subs = subcollectionsMap.get(collection.id) ?? []
      return (
        collection.name.toLowerCase().includes(q) ||
        subs.some((sub) => sub.name.toLowerCase().includes(q))
      )
    })
  }, [collections, searchQuery, subcollectionsMap])

  const aggregateAllCount = useMemo(
    () => collections.reduce((sum, collection) => sum + collection.publication_count, 0),
    [collections],
  )

  const allCount = allPublicationsCount ?? aggregateAllCount
  const uncollectedCountValue = uncollectedCount ?? 0

  const ensureSubcollections = useCallback(async (collectionId: string) => {
    if (subcollectionsMap.has(collectionId)) return
    const subs = await fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[])
    onSubcollectionsFetched(collectionId, subs)
  }, [onSubcollectionsFetched, subcollectionsMap])

  const toggleCollection = useCallback(async (collectionId: string) => {
    onToggleExpand(collectionId)
    await ensureSubcollections(collectionId)
  }, [ensureSubcollections, onToggleExpand])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  useEffect(() => {
    if (renamingSubId) subRenameInputRef.current?.focus()
  }, [renamingSubId])

  useEffect(() => {
    if (creatingSubForId) newSubInputRef.current?.focus()
  }, [creatingSubForId])
  useEffect(() => {
    if (creatingCollection) createCollectionInputRef.current?.focus()
  }, [creatingCollection])

  useEffect(() => {
    if (selectedCollectionId) void ensureSubcollections(selectedCollectionId)
  }, [ensureSubcollections, selectedCollectionId])

  const startRename = useCallback((collection: CollectionPayload) => {
    setRenamingId(collection.id)
    setRenameValue(collection.name)
    setCollectionMenu(null)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameCollection(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [onRenameCollection, renameValue, renamingId])

  const startSubRename = useCallback((sub: SubcollectionPayload) => {
    setRenamingSubId(sub.id)
    setSubRenameValue(sub.name)
  }, [])

  const commitSubRename = useCallback((collectionId: string) => {
    if (renamingSubId && subRenameValue.trim()) {
      onRenameSubcollection(collectionId, renamingSubId, subRenameValue.trim())
    }
    setRenamingSubId(null)
    setSubRenameValue('')
  }, [onRenameSubcollection, renamingSubId, subRenameValue])

  const startCreateSub = useCallback((collectionId: string) => {
    setCreatingSubForId(collectionId)
    setNewSubName('')
    if (!expandedIds.has(collectionId)) {
      onToggleExpand(collectionId)
    }
    void ensureSubcollections(collectionId)
  }, [ensureSubcollections, expandedIds, onToggleExpand])

  const commitCreateSub = useCallback(() => {
    if (creatingSubForId && newSubName.trim()) {
      onCreateSubcollection(creatingSubForId, newSubName.trim())
    }
    setCreatingSubForId(null)
    setNewSubName('')
  }, [creatingSubForId, newSubName, onCreateSubcollection])

  return (
    <aside
      className={cn(
        'flex min-w-[320px] max-w-[380px] flex-col border-r border-border bg-card',
        pageMode ? 'w-[340px]' : 'w-[360px]',
      )}
    >
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Collections</div>
            <div className="text-xs text-muted-foreground">Browse, filter, and manage your collection tree.</div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--tone-accent-100))]"
            onClick={onStartCreateCollection}
            aria-label="Create new collection"
          >
            <Plus className="h-4 w-4" />
            <span>New collection</span>
          </button>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm focus-within:border-foreground">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            aria-label="Search collections"
          />
        </label>
      </div>

      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Library views
        </div>
        <div className="space-y-2">
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selectedViewKind === 'all'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-[hsl(var(--tone-accent-100))]',
            )}
            onClick={onSelectAllPublications}
            disabled={!onSelectAllPublications}
          >
            <span>All publications</span>
            <span className="text-xs tabular-nums opacity-80">{allCount}</span>
          </button>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selectedViewKind === 'uncollected'
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-[hsl(var(--tone-accent-100))]',
            )}
            onClick={onSelectUncollected}
            disabled={!onSelectUncollected}
          >
            <span>Uncollected</span>
            <span className="text-xs tabular-nums opacity-80">{uncollectedCountValue}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Collections</div>
            <div className="text-xs text-muted-foreground tabular-nums">{filteredCollections.length}</div>
          </div>

          {filteredCollections.length === 0 && !creatingCollection ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No collections match your search.
            </div>
          ) : null}

          <div className="space-y-1">
            {filteredCollections.map((collection) => {
              const subs = subcollectionsMap.get(collection.id) ?? []
              const isExpanded = expandedIds.has(collection.id)
              const isSelectedCollection = selectedCollectionId === collection.id
              const isPulsingCollection = pulsingId === collection.id
              const visibleSubs = searchQuery.trim()
                ? subs.filter((sub) => sub.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) || collection.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                : subs

              return (
                <div
                  key={collection.id}
                  className={cn(
                    'rounded-xl border transition-colors',
                    isSelectedCollection ? 'border-foreground bg-[hsl(var(--tone-accent-50))]' : 'border-border bg-background',
                    isPulsingCollection && 'ring-1 ring-[hsl(var(--tone-accent-500))]/30',
                  )}
                  style={{ boxShadow: isSelectedCollection ? '0 0 0 1px hsl(var(--foreground) / 0.12)' : undefined }}
                >
                  {renamingId === collection.id ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLLECTION_COLOUR_HEX[collection.colour] }} />
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') {
                            setRenamingId(null)
                            setRenameValue('')
                          }
                        }}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none"
                        aria-label={`Rename ${collection.name}`}
                      />
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={commitRename} aria-label="Save collection rename">
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => { setRenamingId(null); setRenameValue('') }} aria-label="Cancel collection rename">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2',
                        mode === 'organise' && 'cursor-pointer',
                      )}
                      onClick={() => {
                        if (mode === 'browse') {
                          onSelectCollection(collection.id)
                          onSelectSubcollection(collection.id, null)
                        } else {
                          void toggleCollection(collection.id)
                        }
                      }}
                    >
                      <div className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLLECTION_COLOUR_HEX[collection.colour] }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{collection.name}</span>
                          {isSelectedCollection && (
                            <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-background">Active</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {collection.publication_count} publications
                        </div>
                      </div>
                      {visibleSubs.length > 0 ? (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleCollection(collection.id)
                          }}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${collection.name}`}
                        >
                          <ChevronRight className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-90')} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCollectionMenu({ collectionId: collection.id, x: e.clientX, y: e.clientY })
                        }}
                        aria-label={`Open actions for ${collection.name}`}
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {(isExpanded || isSelectedCollection || searchQuery.trim()) && visibleSubs.length > 0 && (
                    <div className="border-t border-border/60 px-3 py-2">
                      <div className="space-y-1 pl-4">
                        {visibleSubs.map((subcollection) => {
                          const isSelectedSubcollection = selectedSubcollectionId === subcollection.id
                          const isPulsingSubcollection = pulsingId === subcollection.id

                          return (
                            <div
                              key={subcollection.id}
                              className={cn(
                                'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                                isSelectedSubcollection ? 'bg-foreground text-background' : 'hover:bg-[hsl(var(--tone-accent-100))]',
                                isPulsingSubcollection && 'ring-1 ring-[hsl(var(--tone-accent-500))]/20',
                              )}
                              onClick={() => {
                                onSelectCollection(collection.id)
                                onSelectSubcollection(collection.id, subcollection.id)
                              }}
                            >
                              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLLECTION_COLOUR_HEX[collection.colour] }} />
                              {renamingSubId === subcollection.id ? (
                                <>
                                  <input
                                    ref={subRenameInputRef}
                                    type="text"
                                    value={subRenameValue}
                                    onChange={(e) => setSubRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitSubRename(collection.id)
                                      if (e.key === 'Escape') {
                                        setRenamingSubId(null)
                                        setSubRenameValue('')
                                      }
                                    }}
                                    className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none"
                                    aria-label={`Rename ${subcollection.name}`}
                                  />
                                  <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => commitSubRename(collection.id)} aria-label="Save subcollection rename">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => { setRenamingSubId(null); setSubRenameValue('') }} aria-label="Cancel subcollection rename">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="min-w-0 flex-1 truncate">{subcollection.name}</span>
                                  <span className={cn('text-xs tabular-nums', isSelectedSubcollection ? 'text-background/80' : 'text-muted-foreground')}>
                                    {subcollection.publication_count}
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      startSubRename(subcollection)
                                    }}
                                    aria-label={`Rename ${subcollection.name}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onDeleteSubcollection(collection.id, subcollection.id)
                                    }}
                                    aria-label={`Delete ${subcollection.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {creatingSubForId === collection.id && (
                    <div className="border-t border-border/60 px-3 py-2">
                      <div className="ml-4 flex items-center gap-2">
                        <input
                          ref={newSubInputRef}
                          type="text"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCreateSub()
                            if (e.key === 'Escape') {
                              setCreatingSubForId(null)
                              setNewSubName('')
                            }
                          }}
                          placeholder="New subcollection"
                          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none"
                          aria-label="Subcollection name"
                        />
                        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={commitCreateSub} aria-label="Save subcollection">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => { setCreatingSubForId(null); setNewSubName('') }} aria-label="Cancel subcollection">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {creatingCollection && (
            <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLLECTION_COLOUR_HEX[newCollectionColour] }} />
                <input
                  ref={createCollectionInputRef}
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateCollection()
                    if (e.key === 'Escape') onCancelCreateCollection()
                  }}
                  placeholder="Collection name"
                  className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none"
                  aria-label="Collection name"
                />
                <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={onCreateCollection} aria-label="Save collection">
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={onCancelCreateCollection} aria-label="Cancel collection">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {collectionMenu && (() => {
        const collection = collections.find((item) => item.id === collectionMenu.collectionId)
        if (!collection) return null
        return (
          <Menu
            x={collectionMenu.x}
            y={collectionMenu.y}
            onRename={() => startRename(collection)}
            onColour={() => setColourPickerState({ id: collection.id, x: collectionMenu.x, y: collectionMenu.y })}
            onCreateSubcollection={() => startCreateSub(collection.id)}
            onDelete={() => onDeleteCollection(collection.id)}
            onClose={() => setCollectionMenu(null)}
          />
        )
      })()}

      {colourPickerState && (() => {
        const collection = collections.find((item) => item.id === colourPickerState.id)
        if (!collection) return null
        return (
          <ColourPicker
            x={colourPickerState.x}
            y={colourPickerState.y}
            value={collection.colour}
            onChange={(colour) => onColourChange(collection.id, colour)}
            onClose={() => setColourPickerState(null)}
          />
        )
      })()}
    </aside>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, MoreHorizontal, Search, GripVertical, X, Check, Trash2, Pencil, Palette, FolderPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getAuthSessionToken } from '@/lib/auth-session'
import { fetchPersonaState } from '@/lib/impact-api'
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  fetchSubcollections,
  createSubcollection,
  updateSubcollection,
  deleteSubcollection,
  fetchCollectionPublications,
  addPublicationsToCollection,
  removePublicationFromCollection,
  reorderCollectionPublications,
  fetchPublicationCollections,
} from '@/lib/collections-api'
import {
  COLLECTION_COLOUR_HEX,
  type CollectionColour,
  type CollectionPayload,
  type SubcollectionPayload,
  type CollectionPublicationPayload,
  type PublicationCollectionSummary,
} from '@/types/collections'
import type { PersonaWork } from '@/types/impact'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_COLOURS: CollectionColour[] = [
  'indigo', 'amber', 'emerald', 'red', 'violet',
  'sky', 'pink', 'teal', 'orange', 'slate',
]

type PageMode = 'organise' | 'browse'
type PubFilter = 'all' | 'uncollected'

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-slide-up">
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Colour picker popover
// ---------------------------------------------------------------------------

function ColourPicker({
  value,
  onChange,
  onClose,
}: {
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

  return (
    <div ref={ref} className="absolute left-full top-0 ml-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5" style={{ width: 140 }}>
      {ALL_COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn('w-5 h-5 rounded-full border-2 transition-transform hover:scale-110', c === value ? 'border-slate-800' : 'border-transparent')}
          style={{ backgroundColor: COLLECTION_COLOUR_HEX[c] }}
          onClick={() => { onChange(c); onClose() }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Three-dot menu
// ---------------------------------------------------------------------------

function CollectionMenu({
  onRename,
  onDelete,
  onChangeColour,
  onClose,
}: {
  onRename: () => void
  onDelete: () => void
  onChangeColour: () => void
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

  const item = 'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 rounded'
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-40">
      <button type="button" className={item} onClick={() => { onRename(); onClose() }}>
        <Pencil className="w-3.5 h-3.5" /> Rename
      </button>
      <button type="button" className={item} onClick={() => { onChangeColour(); onClose() }}>
        <Palette className="w-3.5 h-3.5" /> Change colour
      </button>
      <button type="button" className={cn(item, 'text-red-600 hover:bg-red-50')} onClick={() => { onDelete(); onClose() }}>
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ProfileCollectionsPage() {
  const navigate = useNavigate()

  // ---- state ----
  const [mode, setMode] = useState<PageMode>('organise')
  const [collections, setCollections] = useState<CollectionPayload[]>([])
  const [works, setWorks] = useState<PersonaWork[]>([])
  const [metricsByWorkId, setMetricsByWorkId] = useState<Map<string, number>>(new Map())
  const [pubCollectionsMap, setPubCollectionsMap] = useState<Map<string, PublicationCollectionSummary[]>>(new Map())
  const [loading, setLoading] = useState(true)

  // organise mode
  const [pubFilter, setPubFilter] = useState<PubFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dragWorkId, setDragWorkId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // browse mode
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [subcollections, setSubcollections] = useState<SubcollectionPayload[]>([])
  const [selectedSubcollectionId, setSelectedSubcollectionId] = useState<string | null>(null)
  const [collectionPubs, setCollectionPubs] = useState<CollectionPublicationPayload[]>([])

  // collection management
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionColour, setNewCollectionColour] = useState<CollectionColour>('indigo')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colourPickerId, setColourPickerId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // subcollection management
  const [creatingSub, setCreatingSub] = useState(false)
  const [newSubName, setNewSubName] = useState('')

  // toast
  const [toast, setToast] = useState<string | null>(null)

  // refs
  const renameInputRef = useRef<HTMLInputElement>(null)
  const newCollectionInputRef = useRef<HTMLInputElement>(null)
  const newSubInputRef = useRef<HTMLInputElement>(null)

  // ---- bootstrap ----
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const token = getAuthSessionToken() || ''
        const [colls, state] = await Promise.all([
          fetchCollections().catch(() => [] as CollectionPayload[]),
          fetchPersonaState(token),
        ])
        if (cancelled) return
        setCollections(colls)
        setWorks(state.works)
        const mm = new Map<string, number>()
        for (const w of state.metrics.works) {
          mm.set(w.work_id, w.citations)
        }
        setMetricsByWorkId(mm)

        // load publication → collection memberships
        const entries = await Promise.all(
          state.works.map(async (w) => {
            const sums = await fetchPublicationCollections(w.id).catch(() => [] as PublicationCollectionSummary[])
            return [w.id, sums] as const
          }),
        )
        if (cancelled) return
        setPubCollectionsMap(new Map(entries))
      } catch {
        // ignore bootstrap errors
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // ---- load subcollections + pubs when collection selected (browse) ----
  useEffect(() => {
    if (mode !== 'browse' || !selectedCollectionId) {
      setSubcollections([])
      setCollectionPubs([])
      return
    }
    let cancelled = false
    async function load() {
      const [subs, pubs] = await Promise.all([
        fetchSubcollections(selectedCollectionId!).catch(() => [] as SubcollectionPayload[]),
        fetchCollectionPublications(selectedCollectionId!).catch(() => [] as CollectionPublicationPayload[]),
      ])
      if (cancelled) return
      setSubcollections(subs)
      setCollectionPubs(pubs)
      setSelectedSubcollectionId(null)
    }
    void load()
    return () => { cancelled = true }
  }, [mode, selectedCollectionId])

  // ---- helpers ----
  const refreshCollections = useCallback(async () => {
    const colls = await fetchCollections().catch(() => [] as CollectionPayload[])
    setCollections(colls)
  }, [])

  const refreshPubCollections = useCallback(async (workId: string) => {
    const sums = await fetchPublicationCollections(workId).catch(() => [] as PublicationCollectionSummary[])
    setPubCollectionsMap((prev) => {
      const next = new Map(prev)
      next.set(workId, sums)
      return next
    })
  }, [])

  const refreshCollectionPubs = useCallback(async () => {
    if (!selectedCollectionId) return
    const pubs = await fetchCollectionPublications(selectedCollectionId).catch(() => [] as CollectionPublicationPayload[])
    setCollectionPubs(pubs)
  }, [selectedCollectionId])

  // ---- filtered publications (organise mode) ----
  const filteredWorks = useMemo(() => {
    let list = works
    if (pubFilter === 'uncollected') {
      list = list.filter((w) => {
        const sums = pubCollectionsMap.get(w.id)
        return !sums || sums.length === 0
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((w) =>
        w.title.toLowerCase().includes(q) ||
        w.venue_name.toLowerCase().includes(q) ||
        (w.doi || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [works, pubFilter, searchQuery, pubCollectionsMap])

  // ---- drag and drop (organise: publication → collection sidebar) ----
  const handleDragStart = useCallback((workId: string) => {
    setDragWorkId(workId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, collectionId: string) => {
    e.preventDefault()
    setDropTargetId(collectionId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])

  const handleDrop = useCallback(async (collectionId: string) => {
    setDropTargetId(null)
    if (!dragWorkId) return
    try {
      await addPublicationsToCollection(collectionId, [dragWorkId])
      const coll = collections.find((c) => c.id === collectionId)
      setToast(`Added to ${coll?.name || 'collection'}`)
      await Promise.all([refreshCollections(), refreshPubCollections(dragWorkId)])
    } catch {
      setToast('Failed to add publication')
    }
    setDragWorkId(null)
  }, [dragWorkId, collections, refreshCollections, refreshPubCollections])

  // ---- collection CRUD ----
  const handleCreateCollection = useCallback(async () => {
    const name = newCollectionName.trim()
    if (!name) return
    try {
      await createCollection({ name, colour: newCollectionColour })
      setNewCollectionName('')
      setNewCollectionColour('indigo')
      setCreatingCollection(false)
      await refreshCollections()
    } catch {
      setToast('Failed to create collection')
    }
  }, [newCollectionName, newCollectionColour, refreshCollections])

  const handleRename = useCallback(async (id: string) => {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }
    try {
      await updateCollection(id, { name })
      setRenamingId(null)
      await refreshCollections()
    } catch {
      setToast('Failed to rename collection')
    }
  }, [renameValue, refreshCollections])

  const handleColourChange = useCallback(async (id: string, colour: CollectionColour) => {
    try {
      await updateCollection(id, { colour })
      await refreshCollections()
    } catch {
      setToast('Failed to change colour')
    }
  }, [refreshCollections])

  const handleDeleteCollection = useCallback(async (id: string) => {
    try {
      await deleteCollection(id)
      setDeletingId(null)
      if (selectedCollectionId === id) setSelectedCollectionId(null)
      await refreshCollections()
    } catch {
      setToast('Failed to delete collection')
    }
  }, [selectedCollectionId, refreshCollections])

  // ---- subcollection CRUD ----
  const handleCreateSub = useCallback(async () => {
    const name = newSubName.trim()
    if (!name || !selectedCollectionId) return
    try {
      await createSubcollection(selectedCollectionId, { name })
      setNewSubName('')
      setCreatingSub(false)
      const subs = await fetchSubcollections(selectedCollectionId).catch(() => [] as SubcollectionPayload[])
      setSubcollections(subs)
    } catch {
      setToast('Failed to create subcollection')
    }
  }, [newSubName, selectedCollectionId])

  const handleDeleteSub = useCallback(async (subId: string) => {
    if (!selectedCollectionId) return
    try {
      await deleteSubcollection(selectedCollectionId, subId)
      const subs = await fetchSubcollections(selectedCollectionId).catch(() => [] as SubcollectionPayload[])
      setSubcollections(subs)
      if (selectedSubcollectionId === subId) setSelectedSubcollectionId(null)
    } catch {
      setToast('Failed to delete subcollection')
    }
  }, [selectedCollectionId, selectedSubcollectionId])

  // ---- browse mode: remove pub from collection ----
  const handleRemovePub = useCallback(async (workId: string) => {
    if (!selectedCollectionId) return
    try {
      await removePublicationFromCollection(selectedCollectionId, workId)
      await Promise.all([refreshCollectionPubs(), refreshCollections()])
    } catch {
      setToast('Failed to remove publication')
    }
  }, [selectedCollectionId, refreshCollectionPubs, refreshCollections])

  // ---- browse mode: reorder pubs via drag ----
  const [browseDragIdx, setBrowseDragIdx] = useState<number | null>(null)

  const handleBrowseDragStart = useCallback((idx: number) => {
    setBrowseDragIdx(idx)
  }, [])

  const handleBrowseDrop = useCallback(async (targetIdx: number) => {
    if (browseDragIdx === null || browseDragIdx === targetIdx || !selectedCollectionId) {
      setBrowseDragIdx(null)
      return
    }
    const reordered = [...collectionPubs]
    const [moved] = reordered.splice(browseDragIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    setCollectionPubs(reordered)
    setBrowseDragIdx(null)
    try {
      await reorderCollectionPublications(selectedCollectionId, reordered.map((p) => p.work_id))
    } catch {
      setToast('Failed to reorder')
    }
  }, [browseDragIdx, collectionPubs, selectedCollectionId])

  // ---- focus effects ----
  useEffect(() => {
    if (creatingCollection) newCollectionInputRef.current?.focus()
  }, [creatingCollection])
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])
  useEffect(() => {
    if (creatingSub) newSubInputRef.current?.focus()
  }, [creatingSub])

  // ---- browse filtered pubs ----
  const browsePubs = useMemo(() => {
    if (!selectedSubcollectionId) return collectionPubs
    return collectionPubs.filter((p) => p.subcollection_id === selectedSubcollectionId)
  }, [collectionPubs, selectedSubcollectionId])

  // ---- render ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        Loading collections...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-900">Publication library</h1>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5">
            {([
              { value: 'publications', label: 'My publications', path: '/profile/publications' },
              { value: 'journals', label: 'My journals', path: '/profile/publications?view=journals' },
              { value: 'collections', label: 'My collections', path: '/profile/publications/collections' },
            ] as const).map((opt) => {
              const active = opt.value === 'collections'
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'px-3 py-1 text-sm rounded-full transition-colors',
                    active
                      ? 'bg-foreground text-background shadow-sm font-medium'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  onClick={() => navigate(opt.path)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {(['organise', 'browse'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                'px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors',
                mode === m
                  ? 'border-indigo-600 text-indigo-700 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {mode === 'organise' ? (
          <OrganiseView
            collections={collections}
            works={filteredWorks}
            metricsByWorkId={metricsByWorkId}
            pubCollectionsMap={pubCollectionsMap}
            pubFilter={pubFilter}
            setPubFilter={setPubFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            dragWorkId={dragWorkId}
            dropTargetId={dropTargetId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            creatingCollection={creatingCollection}
            setCreatingCollection={setCreatingCollection}
            newCollectionName={newCollectionName}
            setNewCollectionName={setNewCollectionName}
            newCollectionColour={newCollectionColour}
            setNewCollectionColour={setNewCollectionColour}
            onCreateCollection={handleCreateCollection}
            newCollectionInputRef={newCollectionInputRef}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRename={handleRename}
            renameInputRef={renameInputRef}
            colourPickerId={colourPickerId}
            setColourPickerId={setColourPickerId}
            onColourChange={handleColourChange}
            deletingId={deletingId}
            setDeletingId={setDeletingId}
            onDeleteCollection={handleDeleteCollection}
          />
        ) : (
          <BrowseView
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            setSelectedCollectionId={setSelectedCollectionId}
            subcollections={subcollections}
            selectedSubcollectionId={selectedSubcollectionId}
            setSelectedSubcollectionId={setSelectedSubcollectionId}
            browsePubs={browsePubs}
            creatingSub={creatingSub}
            setCreatingSub={setCreatingSub}
            newSubName={newSubName}
            setNewSubName={setNewSubName}
            onCreateSub={handleCreateSub}
            newSubInputRef={newSubInputRef}
            onDeleteSub={handleDeleteSub}
            onRemovePub={handleRemovePub}
            browseDragIdx={browseDragIdx}
            onBrowseDragStart={handleBrowseDragStart}
            onBrowseDrop={handleBrowseDrop}
            navigate={navigate}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onRename={handleRename}
            renameInputRef={renameInputRef}
            colourPickerId={colourPickerId}
            setColourPickerId={setColourPickerId}
            onColourChange={handleColourChange}
            deletingId={deletingId}
            setDeletingId={setDeletingId}
            onDeleteCollection={handleDeleteCollection}
          />
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Animation keyframe */}
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-up { animation: slide-up 0.2s ease-out; }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar collection list (shared between organise + browse)
// ---------------------------------------------------------------------------

function CollectionSidebar({
  collections,
  selectedId,
  onSelect,
  dropTargetId,
  onDragOver,
  onDragLeave,
  onDrop,
  creatingCollection,
  setCreatingCollection,
  newCollectionName,
  setNewCollectionName,
  newCollectionColour,
  setNewCollectionColour,
  onCreateCollection,
  newCollectionInputRef,
  menuOpenId,
  setMenuOpenId,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  onRename,
  renameInputRef,
  colourPickerId,
  setColourPickerId,
  onColourChange,
  deletingId,
  setDeletingId,
  onDeleteCollection,
}: {
  collections: CollectionPayload[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  dropTargetId?: string | null
  onDragOver?: (e: React.DragEvent, id: string) => void
  onDragLeave?: () => void
  onDrop?: (id: string) => void
  creatingCollection: boolean
  setCreatingCollection: (v: boolean) => void
  newCollectionName: string
  setNewCollectionName: (v: string) => void
  newCollectionColour: CollectionColour
  setNewCollectionColour: (v: CollectionColour) => void
  onCreateCollection: () => void
  newCollectionInputRef: React.RefObject<HTMLInputElement | null>
  menuOpenId: string | null
  setMenuOpenId: (v: string | null) => void
  renamingId: string | null
  setRenamingId: (v: string | null) => void
  renameValue: string
  setRenameValue: (v: string) => void
  onRename: (id: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  colourPickerId: string | null
  setColourPickerId: (v: string | null) => void
  onColourChange: (id: string, c: CollectionColour) => void
  deletingId: string | null
  setDeletingId: (v: string | null) => void
  onDeleteCollection: (id: string) => void
}) {
  return (
    <div className="w-[230px] min-w-[230px] bg-slate-50 border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Collections</span>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
          title="New collection"
          onClick={() => setCreatingCollection(true)}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1 px-1.5">
        {collections.map((coll) => {
          const isActive = selectedId === coll.id
          const isDrop = dropTargetId === coll.id
          const isRenaming = renamingId === coll.id
          const isDeleting = deletingId === coll.id

          if (isDeleting) {
            return (
              <div key={coll.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm bg-red-50 border border-red-200">
                <span className="text-red-700 flex-1 truncate">Delete "{coll.name}"?</span>
                <button type="button" className="text-red-600 hover:text-red-800 p-0.5" onClick={() => onDeleteCollection(coll.id)}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="text-slate-500 hover:text-slate-700 p-0.5" onClick={() => setDeletingId(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          }

          return (
            <div
              key={coll.id}
              className={cn(
                'group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer relative',
                isActive ? 'bg-indigo-100 text-indigo-800 font-medium' : 'text-slate-700 hover:bg-slate-100',
                isDrop && 'outline-2 outline-dashed outline-indigo-500 bg-blue-50',
              )}
              onClick={() => onSelect?.(coll.id)}
              onDragOver={(e) => onDragOver?.(e, coll.id)}
              onDragLeave={() => onDragLeave?.()}
              onDrop={(e) => { e.preventDefault(); onDrop?.(coll.id) }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLLECTION_COLOUR_HEX[coll.colour] }} />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="flex-1 min-w-0 bg-white border border-slate-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRename(coll.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => onRename(coll.id)}
                />
              ) : (
                <span className="flex-1 truncate">{coll.name}</span>
              )}
              <span className="text-xs text-slate-400 flex-shrink-0">{coll.publication_count}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpenId(menuOpenId === coll.id ? null : coll.id)
                }}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpenId === coll.id && (
                <CollectionMenu
                  onRename={() => { setRenamingId(coll.id); setRenameValue(coll.name) }}
                  onDelete={() => setDeletingId(coll.id)}
                  onChangeColour={() => setColourPickerId(coll.id)}
                  onClose={() => setMenuOpenId(null)}
                />
              )}
              {colourPickerId === coll.id && (
                <ColourPicker
                  value={coll.colour}
                  onChange={(c) => onColourChange(coll.id, c)}
                  onClose={() => setColourPickerId(null)}
                />
              )}
            </div>
          )
        })}

        {/* New collection inline form */}
        {creatingCollection && (
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <button
              type="button"
              className="w-4 h-4 rounded-full flex-shrink-0 border border-slate-300"
              style={{ backgroundColor: COLLECTION_COLOUR_HEX[newCollectionColour] }}
              onClick={() => {
                const idx = ALL_COLOURS.indexOf(newCollectionColour)
                setNewCollectionColour(ALL_COLOURS[(idx + 1) % ALL_COLOURS.length])
              }}
            />
            <input
              ref={newCollectionInputRef}
              className="flex-1 min-w-0 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateCollection()
                if (e.key === 'Escape') setCreatingCollection(false)
              }}
            />
            <button type="button" className="text-indigo-600 hover:text-indigo-800 p-0.5" onClick={onCreateCollection}>
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="text-slate-400 hover:text-slate-600 p-0.5" onClick={() => setCreatingCollection(false)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {collections.length === 0 && !creatingCollection && (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            No collections yet. Click + to create one.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Organise view
// ---------------------------------------------------------------------------

function OrganiseView({
  collections,
  works,
  metricsByWorkId,
  pubCollectionsMap,
  pubFilter,
  setPubFilter,
  searchQuery,
  setSearchQuery,
  dragWorkId,
  dropTargetId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  creatingCollection,
  setCreatingCollection,
  newCollectionName,
  setNewCollectionName,
  newCollectionColour,
  setNewCollectionColour,
  onCreateCollection,
  newCollectionInputRef,
  menuOpenId,
  setMenuOpenId,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  onRename,
  renameInputRef,
  colourPickerId,
  setColourPickerId,
  onColourChange,
  deletingId,
  setDeletingId,
  onDeleteCollection,
}: {
  collections: CollectionPayload[]
  works: PersonaWork[]
  metricsByWorkId: Map<string, number>
  pubCollectionsMap: Map<string, PublicationCollectionSummary[]>
  pubFilter: PubFilter
  setPubFilter: (v: PubFilter) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  dragWorkId: string | null
  dropTargetId: string | null
  onDragStart: (workId: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (id: string) => void
  creatingCollection: boolean
  setCreatingCollection: (v: boolean) => void
  newCollectionName: string
  setNewCollectionName: (v: string) => void
  newCollectionColour: CollectionColour
  setNewCollectionColour: (v: CollectionColour) => void
  onCreateCollection: () => void
  newCollectionInputRef: React.RefObject<HTMLInputElement | null>
  menuOpenId: string | null
  setMenuOpenId: (v: string | null) => void
  renamingId: string | null
  setRenamingId: (v: string | null) => void
  renameValue: string
  setRenameValue: (v: string) => void
  onRename: (id: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  colourPickerId: string | null
  setColourPickerId: (v: string | null) => void
  onColourChange: (id: string, c: CollectionColour) => void
  deletingId: string | null
  setDeletingId: (v: string | null) => void
  onDeleteCollection: (id: string) => void
}) {
  return (
    <>
      {/* Sidebar */}
      <CollectionSidebar
        collections={collections}
        dropTargetId={dropTargetId}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        creatingCollection={creatingCollection}
        setCreatingCollection={setCreatingCollection}
        newCollectionName={newCollectionName}
        setNewCollectionName={setNewCollectionName}
        newCollectionColour={newCollectionColour}
        setNewCollectionColour={setNewCollectionColour}
        onCreateCollection={onCreateCollection}
        newCollectionInputRef={newCollectionInputRef}
        menuOpenId={menuOpenId}
        setMenuOpenId={setMenuOpenId}
        renamingId={renamingId}
        setRenamingId={setRenamingId}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        onRename={onRename}
        renameInputRef={renameInputRef}
        colourPickerId={colourPickerId}
        setColourPickerId={setColourPickerId}
        onColourChange={onColourChange}
        deletingId={deletingId}
        setDeletingId={setDeletingId}
        onDeleteCollection={onDeleteCollection}
      />

      {/* Publications panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 text-xs">
            {([
              { value: 'all' as PubFilter, label: 'All publications' },
              { value: 'uncollected' as PubFilter, label: 'Uncollected' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded-full transition-colors',
                  pubFilter === opt.value
                    ? 'bg-white shadow-sm text-slate-800 font-medium'
                    : 'text-slate-500 hover:text-slate-700',
                )}
                onClick={() => setPubFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Search publications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setSearchQuery('')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-400">{works.length} publications</span>
        </div>

        {/* Publication cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {works.map((work) => {
            const citations = metricsByWorkId.get(work.id) ?? 0
            const colls = pubCollectionsMap.get(work.id) ?? []
            return (
              <div
                key={work.id}
                draggable
                onDragStart={() => onDragStart(work.id)}
                className={cn(
                  'flex items-center p-3 bg-slate-50 border border-slate-200 rounded-lg gap-2.5 cursor-grab active:cursor-grabbing',
                  dragWorkId === work.id && 'opacity-50',
                )}
              >
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{work.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 truncate">
                      {[work.venue_name, work.year].filter(Boolean).join(' · ')}
                    </span>
                    {colls.length > 0 && (
                      <span className="flex items-center gap-1 flex-shrink-0">
                        {colls.map((c) => (
                          <span
                            key={c.id}
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: COLLECTION_COLOUR_HEX[c.colour] }}
                            title={c.name}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">{citations} cited</span>
              </div>
            )
          })}
          {works.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-12">
              {searchQuery ? 'No publications match your search.' : 'No publications found.'}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Browse view
// ---------------------------------------------------------------------------

function BrowseView({
  collections,
  selectedCollectionId,
  setSelectedCollectionId,
  subcollections,
  selectedSubcollectionId,
  setSelectedSubcollectionId,
  browsePubs,
  creatingSub,
  setCreatingSub,
  newSubName,
  setNewSubName,
  onCreateSub,
  newSubInputRef,
  onDeleteSub,
  onRemovePub,
  browseDragIdx,
  onBrowseDragStart,
  onBrowseDrop,
  navigate,
  menuOpenId,
  setMenuOpenId,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  onRename,
  renameInputRef,
  colourPickerId,
  setColourPickerId,
  onColourChange,
  deletingId,
  setDeletingId,
  onDeleteCollection,
}: {
  collections: CollectionPayload[]
  selectedCollectionId: string | null
  setSelectedCollectionId: (id: string) => void
  subcollections: SubcollectionPayload[]
  selectedSubcollectionId: string | null
  setSelectedSubcollectionId: (id: string | null) => void
  browsePubs: CollectionPublicationPayload[]
  creatingSub: boolean
  setCreatingSub: (v: boolean) => void
  newSubName: string
  setNewSubName: (v: string) => void
  onCreateSub: () => void
  newSubInputRef: React.RefObject<HTMLInputElement | null>
  onDeleteSub: (id: string) => void
  onRemovePub: (workId: string) => void
  browseDragIdx: number | null
  onBrowseDragStart: (idx: number) => void
  onBrowseDrop: (idx: number) => void
  navigate: ReturnType<typeof useNavigate>
  menuOpenId: string | null
  setMenuOpenId: (v: string | null) => void
  renamingId: string | null
  setRenamingId: (v: string | null) => void
  renameValue: string
  setRenameValue: (v: string) => void
  onRename: (id: string) => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  colourPickerId: string | null
  setColourPickerId: (v: string | null) => void
  onColourChange: (id: string, c: CollectionColour) => void
  deletingId: string | null
  setDeletingId: (v: string | null) => void
  onDeleteCollection: (id: string) => void
}) {
  return (
    <>
      {/* Collection sidebar */}
      <CollectionSidebar
        collections={collections}
        selectedId={selectedCollectionId}
        onSelect={setSelectedCollectionId}
        creatingCollection={false}
        setCreatingCollection={() => {}}
        newCollectionName=""
        setNewCollectionName={() => {}}
        newCollectionColour="indigo"
        setNewCollectionColour={() => {}}
        onCreateCollection={() => {}}
        newCollectionInputRef={newSubInputRef}
        menuOpenId={menuOpenId}
        setMenuOpenId={setMenuOpenId}
        renamingId={renamingId}
        setRenamingId={setRenamingId}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        onRename={onRename}
        renameInputRef={renameInputRef}
        colourPickerId={colourPickerId}
        setColourPickerId={setColourPickerId}
        onColourChange={onColourChange}
        deletingId={deletingId}
        setDeletingId={setDeletingId}
        onDeleteCollection={onDeleteCollection}
      />

      {/* Subcollection panel */}
      {selectedCollectionId && (
        <div className="w-[185px] min-w-[185px] bg-white border-r border-slate-200 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subcollections</span>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
              title="Add subcollection"
              onClick={() => setCreatingSub(true)}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1 px-1.5">
            {/* All papers entry */}
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm text-left',
                selectedSubcollectionId === null
                  ? 'bg-indigo-100 text-indigo-800 font-medium'
                  : 'text-slate-700 hover:bg-slate-100',
              )}
              onClick={() => setSelectedSubcollectionId(null)}
            >
              All papers
            </button>
            {subcollections.map((sub) => (
              <div
                key={sub.id}
                className={cn(
                  'group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer',
                  selectedSubcollectionId === sub.id
                    ? 'bg-indigo-100 text-indigo-800 font-medium'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
                onClick={() => setSelectedSubcollectionId(sub.id)}
              >
                <span className="flex-1 truncate">{sub.name}</span>
                <span className="text-xs text-slate-400">{sub.publication_count}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-0.5"
                  onClick={(e) => { e.stopPropagation(); onDeleteSub(sub.id) }}
                  title="Delete subcollection"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {creatingSub && (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  ref={newSubInputRef}
                  className="flex-1 min-w-0 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Name"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateSub()
                    if (e.key === 'Escape') setCreatingSub(false)
                  }}
                />
                <button type="button" className="text-indigo-600 p-0.5" onClick={onCreateSub}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="text-slate-400 p-0.5" onClick={() => setCreatingSub(false)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publications panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedCollectionId ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            Select a collection to browse its publications.
          </div>
        ) : browsePubs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            No publications in this collection yet.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {browsePubs.map((pub, idx) => (
              <div
                key={pub.membership_id}
                draggable
                onDragStart={() => onBrowseDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onBrowseDrop(idx)}
                className={cn(
                  'flex items-center p-3 bg-slate-50 border border-slate-200 rounded-lg gap-2.5 cursor-grab active:cursor-grabbing',
                  browseDragIdx === idx && 'opacity-50',
                )}
              >
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/profile/publications?drilldown=${pub.work_id}`)}
                >
                  <div className="text-sm font-medium text-slate-800 truncate">{pub.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {[pub.journal, pub.year].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">{pub.citations} cited</span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-500 p-0.5 flex-shrink-0"
                  onClick={() => onRemovePub(pub.work_id)}
                  title="Remove from collection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  fetchSubcollections,
  createSubcollection,
  deleteSubcollection,
  fetchCollectionPublications,
  addPublicationsToCollection,
  removePublicationFromCollection,
  reorderCollectionPublications,
  fetchPublicationCollections,
  movePublicationSubcollection,
  updateSubcollection,
} from '@/lib/collections-api'
import {
  type CollectionColour,
  type CollectionPayload,
  type SubcollectionPayload,
  type CollectionPublicationPayload,
  type PublicationCollectionSummary,
} from '@/types/collections'
import type { PersonaWork } from '@/types/impact'
import { CollectionSidebar } from './CollectionSidebar'
import { PublicationCard } from './PublicationCard'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { autoAssignColour, type ViewportMode, type PubFilter } from './collections-utils'

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-slide-up">
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main viewport component
// ---------------------------------------------------------------------------

export function CollectionsViewport({
  works,
  onClose,
  onOpenPublication,
}: {
  works: PersonaWork[]
  onClose: () => void
  onOpenPublication: (workId: string) => void
}) {
  // ---- state ----
  const [mode, setMode] = useState<ViewportMode>('organise')
  const [collections, setCollections] = useState<CollectionPayload[]>([])
  const [pubCollectionsMap, setPubCollectionsMap] = useState<Map<string, PublicationCollectionSummary[]>>(new Map())
  const [loading, setLoading] = useState(true)

  // organise mode
  const [pubFilter, setPubFilter] = useState<PubFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dragWorkId, setDragWorkId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // browse mode
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [selectedSubcollectionId, setSelectedSubcollectionId] = useState<string | null>(null)
  const [collectionPubs, setCollectionPubs] = useState<CollectionPublicationPayload[]>([])

  // collection management
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionColour, setNewCollectionColour] = useState<CollectionColour>('indigo')

  // expand/collapse tree
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // subcollections cache (lazy loaded)
  const [subcollectionsMap, setSubcollectionsMap] = useState<Map<string, SubcollectionPayload[]>>(new Map())

  // drop pulse animation
  const [pulsingId, setPulsingId] = useState<string | null>(null)

  // delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'collection' | 'subcollection'
    id: string
    name: string
    count: number
    parentId?: string
  } | null>(null)

  // toast
  const [toast, setToast] = useState<string | null>(null)

  // refs
  const newCollectionInputRef = useRef<HTMLInputElement>(null)

  // browse drag reorder
  const [browseDragIdx, setBrowseDragIdx] = useState<number | null>(null)

  // ---- bootstrap ----
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const colls = await fetchCollections().catch(() => [] as CollectionPayload[])
        if (cancelled) return
        setCollections(colls)

        // load publication -> collection memberships
        const entries = await Promise.all(
          works.map(async (w) => {
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
  }, [works])

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

  // ---- subcollections cache ----
  const handleSubcollectionsFetched = useCallback((collectionId: string, subs: SubcollectionPayload[]) => {
    setSubcollectionsMap((prev) => {
      const next = new Map(prev)
      next.set(collectionId, subs)
      return next
    })
  }, [])

  const handleToggleExpand = useCallback((collectionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(collectionId)) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
  }, [])

  // ---- load subcollections + pubs when collection selected (browse) ----
  useEffect(() => {
    if (mode !== 'browse' || !selectedCollectionId) {
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
      handleSubcollectionsFetched(selectedCollectionId!, subs)
      setCollectionPubs(pubs)
      setSelectedSubcollectionId(null)
    }
    void load()
    return () => { cancelled = true }
  }, [mode, selectedCollectionId, handleSubcollectionsFetched])

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

  // ---- drag and drop (organise: publication -> collection sidebar) ----
  const handleDragStart = useCallback((workId: string) => {
    setDragWorkId(workId)
  }, [])

  // Reset drag state when drag is cancelled (dropped outside a target or Escape pressed)
  useEffect(() => {
    function onDragEnd() {
      setDragWorkId(null)
      setDropTargetId(null)
    }
    document.addEventListener('dragend', onDragEnd)
    return () => document.removeEventListener('dragend', onDragEnd)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, collectionId: string) => {
    e.preventDefault()
    setDropTargetId(collectionId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null)
  }, [])

  const handleDrop = useCallback(async (collectionId: string, subcollectionId?: string) => {
    setDropTargetId(null)
    if (!dragWorkId) return
    try {
      const memberships = await addPublicationsToCollection(collectionId, [dragWorkId])
      if (subcollectionId) {
        const membership = memberships.find((m) => m.work_id === dragWorkId)
        if (membership) {
          await movePublicationSubcollection(collectionId, membership.id, subcollectionId)
        }
      }
      const pulseTarget = subcollectionId ?? collectionId
      setPulsingId(pulseTarget)
      setTimeout(() => setPulsingId(null), 700)
      const coll = collections.find((c) => c.id === collectionId)
      setToast(`Added to ${coll?.name || 'collection'}`)
      const refreshTasks: Promise<unknown>[] = [refreshCollections(), refreshPubCollections(dragWorkId)]
      if (subcollectionId) {
        refreshTasks.push(
          fetchSubcollections(collectionId)
            .then((subs) => handleSubcollectionsFetched(collectionId, subs))
            .catch(() => {}),
        )
      }
      await Promise.all(refreshTasks)
    } catch {
      setToast('Failed to add publication')
    }
    setDragWorkId(null)
  }, [dragWorkId, collections, refreshCollections, refreshPubCollections])

  // ---- collection CRUD ----
  const handleStartCreateCollection = useCallback(() => {
    setNewCollectionColour(autoAssignColour(collections))
    setCreatingCollection(true)
  }, [collections])

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

  const handleRenameCollection = useCallback(async (id: string, newName: string) => {
    try {
      await updateCollection(id, { name: newName })
      await refreshCollections()
    } catch {
      setToast('Failed to rename collection')
    }
  }, [refreshCollections])

  const handleColourChange = useCallback(async (id: string, colour: CollectionColour) => {
    try {
      await updateCollection(id, { colour })
      await refreshCollections()
      // Update colour on any publication pills that reference this collection
      setPubCollectionsMap((prev) => {
        const next = new Map(prev)
        for (const [workId, summaries] of next) {
          if (summaries.some((s) => s.id === id)) {
            next.set(workId, summaries.map((s) => s.id === id ? { ...s, colour } : s))
          }
        }
        return next
      })
    } catch {
      setToast('Failed to change colour')
    }
  }, [refreshCollections])

  // ---- delete confirmation flow ----
  const handleRequestDeleteCollection = useCallback((id: string) => {
    const coll = collections.find((c) => c.id === id)
    if (!coll) return
    setDeleteConfirm({ type: 'collection', id, name: coll.name, count: coll.publication_count })
  }, [collections])

  const handleRequestDeleteSubcollection = useCallback((collectionId: string, subId: string) => {
    const subs = subcollectionsMap.get(collectionId) ?? []
    const sub = subs.find((s) => s.id === subId)
    if (!sub) return
    setDeleteConfirm({ type: 'subcollection', id: subId, name: sub.name, count: 0, parentId: collectionId })
  }, [subcollectionsMap])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'collection') {
        await deleteCollection(deleteConfirm.id)
        if (selectedCollectionId === deleteConfirm.id) setSelectedCollectionId(null)
        await refreshCollections()
        // Remove this collection from all publication pills immediately
        setPubCollectionsMap((prev) => {
          const next = new Map(prev)
          for (const [workId, summaries] of next) {
            const filtered = summaries.filter((s) => s.id !== deleteConfirm.id)
            if (filtered.length !== summaries.length) next.set(workId, filtered)
          }
          return next
        })
      } else {
        if (deleteConfirm.parentId) {
          await deleteSubcollection(deleteConfirm.parentId, deleteConfirm.id)
          const subs = await fetchSubcollections(deleteConfirm.parentId).catch(() => [] as SubcollectionPayload[])
          handleSubcollectionsFetched(deleteConfirm.parentId, subs)
        }
      }
    } catch {
      setToast(`Failed to delete ${deleteConfirm.type}`)
    }
    setDeleteConfirm(null)
  }, [deleteConfirm, selectedCollectionId, refreshCollections, handleSubcollectionsFetched])

  // ---- add to collection (from "+" button on card) ----
  const handleAddToCollection = useCallback(async (workId: string, collectionId: string, _subcollectionId: string | null) => {
    try {
      await addPublicationsToCollection(collectionId, [workId])
      const coll = collections.find((c) => c.id === collectionId)
      setToast(`Added to ${coll?.name || 'collection'}`)
      await Promise.all([refreshCollections(), refreshPubCollections(workId)])
    } catch {
      setToast('Failed to add publication')
    }
  }, [collections, refreshCollections, refreshPubCollections])

  // ---- subcollection CRUD ----
  const handleCreateSubcollection = useCallback(async (collectionId: string, name: string) => {
    try {
      await createSubcollection(collectionId, { name })
      const subs = await fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[])
      handleSubcollectionsFetched(collectionId, subs)
      await refreshCollections()
    } catch {
      setToast('Failed to create subcollection')
    }
  }, [handleSubcollectionsFetched, refreshCollections])

  const handleRenameSubcollection = useCallback(async (collectionId: string, subId: string, name: string) => {
    try {
      await updateSubcollection(collectionId, subId, { name })
      const subs = await fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[])
      handleSubcollectionsFetched(collectionId, subs)
    } catch {
      setToast('Failed to rename subcollection')
    }
  }, [handleSubcollectionsFetched])

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

  // ---- browse mode: move publication to subcollection ----
  const handleMoveToSubcollection = useCallback(async (membershipId: string, targetSubcollectionId: string | null) => {
    if (!selectedCollectionId) return
    try {
      await movePublicationSubcollection(selectedCollectionId, membershipId, targetSubcollectionId)
      setPulsingId(targetSubcollectionId || selectedCollectionId)
      setTimeout(() => setPulsingId(null), 700)
      await refreshCollectionPubs()
    } catch {
      setToast('Failed to move publication')
    }
  }, [selectedCollectionId, refreshCollectionPubs])

  // ---- browse mode: reorder pubs via drag ----
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

  // ---- browse filtered pubs ----
  const browsePubs = useMemo(() => {
    if (!selectedSubcollectionId) return collectionPubs
    return collectionPubs.filter((p) => p.subcollection_id === selectedSubcollectionId)
  }, [collectionPubs, selectedSubcollectionId])

  // ---- render ----
  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--surface-drilldown-elevated))]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-semibold text-foreground">Collections</h2>
          <div className="flex gap-1">
            {(['organise', 'browse'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  'px-3 py-1.5 text-sm capitalize rounded-md transition-colors',
                  mode === m
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close collections"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
          Loading collections...
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Shared sidebar for both modes */}
          <CollectionSidebar
            collections={collections}
            mode={mode}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            subcollectionsMap={subcollectionsMap}
            onSubcollectionsFetched={handleSubcollectionsFetched}
            selectedCollectionId={selectedCollectionId}
            selectedSubcollectionId={selectedSubcollectionId}
            onSelectCollection={setSelectedCollectionId}
            onSelectSubcollection={setSelectedSubcollectionId}
            dropTargetId={dropTargetId}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            pulsingId={pulsingId}
            creatingCollection={creatingCollection}
            onStartCreateCollection={handleStartCreateCollection}
            newCollectionName={newCollectionName}
            setNewCollectionName={setNewCollectionName}
            newCollectionColour={newCollectionColour}
            onCreateCollection={handleCreateCollection}
            onCancelCreateCollection={() => setCreatingCollection(false)}
            newCollectionInputRef={newCollectionInputRef}
            onRenameCollection={handleRenameCollection}
            onDeleteCollection={handleRequestDeleteCollection}
            onColourChange={handleColourChange}
            onCreateSubcollection={handleCreateSubcollection}
            onRenameSubcollection={handleRenameSubcollection}
            onDeleteSubcollection={handleRequestDeleteSubcollection}
          />

          {/* Main content panel */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {mode === 'organise' ? (
              <>
                {/* Organise toolbar */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
                  {/* Filter toggle */}
                  <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5 text-xs">
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
                            ? 'bg-card shadow-sm text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => setPubFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      className="house-input w-full pl-8 pr-3 py-1.5 text-sm rounded-md"
                      placeholder="Search publications..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearchQuery('')}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{filteredWorks.length} publications</span>
                </div>
                {/* Organise publication cards */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {filteredWorks.map((work) => {
                    const colls = pubCollectionsMap.get(work.id) ?? []
                    return (
                      <PublicationCard
                        key={work.id}
                        mode="organise"
                        workId={work.id}
                        title={work.title}
                        venue={work.venue_name}
                        year={work.year}
                        isDragging={dragWorkId === work.id}
                        collectionMemberships={colls}
                        collections={collections}
                        subcollectionsMap={subcollectionsMap}
                        onSubcollectionsFetched={handleSubcollectionsFetched}
                        onDragStart={() => handleDragStart(work.id)}
                        onDragEnd={() => { setDragWorkId(null); setDropTargetId(null) }}
                        onAddToCollection={(collId, subId) => handleAddToCollection(work.id, collId, subId)}
                      />
                    )
                  })}
                  {/* Organise empty states */}
                  {filteredWorks.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      {searchQuery
                        ? 'No publications match your search.'
                        : pubFilter === 'uncollected'
                          ? 'All publications are in at least one collection.'
                          : 'No publications found.'}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Browse mode content */}
                {!selectedCollectionId ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
                    <p>Select a collection from the sidebar to browse its publications.</p>
                  </div>
                ) : browsePubs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
                    <p>No publications in this collection yet.</p>
                    <button
                      type="button"
                      className="text-[hsl(var(--tone-accent-700))] hover:text-[hsl(var(--tone-accent-900))] font-medium"
                      onClick={() => setMode('organise')}
                    >
                      Switch to Organise to add papers
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {browsePubs.map((pub, idx) => (
                      <PublicationCard
                        key={pub.membership_id}
                        mode="browse"
                        workId={pub.work_id}
                        membershipId={pub.membership_id}
                        title={pub.title}
                        venue={pub.journal}
                        year={pub.year}
                        citations={pub.citations}
                        subcollectionId={pub.subcollection_id}
                        isDragging={browseDragIdx === idx}
                        collections={collections}
                        subcollectionsMap={subcollectionsMap}
                        onSubcollectionsFetched={handleSubcollectionsFetched}
                        currentCollectionId={selectedCollectionId}
                        onDragStart={() => handleBrowseDragStart(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleBrowseDrop(idx)}
                        onRemove={() => handleRemovePub(pub.work_id)}
                        onMoveToSubcollection={(subId) => handleMoveToSubcollection(pub.membership_id, subId)}
                        onClick={() => onOpenPublication(pub.work_id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {deleteConfirm && (
        <ConfirmDeleteDialog
          open={!!deleteConfirm}
          title={`Delete ${deleteConfirm.type === 'collection' ? 'collection' : 'subcollection'}`}
          description={
            deleteConfirm.type === 'collection'
              ? `Delete '${deleteConfirm.name}'? This will remove ${deleteConfirm.count} publication${deleteConfirm.count !== 1 ? 's' : ''} from this collection. This cannot be undone.`
              : `Delete '${deleteConfirm.name}'? Publications will remain in the parent collection.`
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

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

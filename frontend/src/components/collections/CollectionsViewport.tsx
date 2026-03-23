import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Layers3, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import {
  addPublicationsToCollection,
  createCollection,
  createSubcollection,
  deleteCollection,
  deleteSubcollection,
  fetchCollectionPublications,
  fetchCollections,
  fetchPublicationCollectionsBatch,
  fetchSubcollections,
  movePublicationSubcollection,
  removePublicationFromCollection,
  updateCollection,
  updateSubcollection,
} from '@/lib/collections-api'
import { cn } from '@/lib/utils'
import {
  type CollectionColour,
  type CollectionPayload,
  type CollectionPublicationPayload,
  type PublicationCollectionSummary,
  type SubcollectionPayload,
} from '@/types/collections'
import type { PersonaWork } from '@/types/impact'
import { CollectionSidebar } from './CollectionSidebar'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { PublicationCard } from './PublicationCard'
import { autoAssignColour } from './collections-utils'

type ViewKind = 'all' | 'uncollected' | 'collection'
type SortKey = 'recent' | 'oldest' | 'title' | 'citations'

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2400)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
      {message}
    </div>
  )
}

function parseView(value: string | null): ViewKind {
  return value === 'uncollected' || value === 'collection' ? value : 'all'
}

function parseSort(value: string | null, view: ViewKind): SortKey {
  const normalized = value === 'oldest' || value === 'title' || value === 'citations' ? value : 'recent'
  return view === 'collection' ? normalized : normalized === 'citations' ? 'recent' : normalized
}

function matchesLibraryWork(work: PersonaWork, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    work.title.toLowerCase().includes(q) ||
    work.venue_name.toLowerCase().includes(q) ||
    String(work.doi || '').toLowerCase().includes(q)
  )
}

function matchesCollectionPublication(publication: CollectionPublicationPayload, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    publication.title.toLowerCase().includes(q) ||
    String(publication.journal || '').toLowerCase().includes(q) ||
    String(publication.doi || '').toLowerCase().includes(q)
  )
}

function sortByYear<T extends { year: number | null }>(items: T[], sort: Exclude<SortKey, 'citations'>) {
  const next = [...items]
  if (sort === 'title') {
    next.sort((a, b) => String((a as { title?: string }).title || '').localeCompare(String((b as { title?: string }).title || '')))
    return next
  }
  next.sort((a, b) => {
    const left = a.year ?? 0
    const right = b.year ?? 0
    if (sort === 'oldest') return left - right
    return right - left
  })
  return next
}

export function CollectionsViewport({
  works,
  onOpenPublication,
  pageMode = false,
  onClose,
}: {
  works: PersonaWork[]
  onOpenPublication: (workId: string) => void
  pageMode?: boolean
  onClose?: () => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [collections, setCollections] = useState<CollectionPayload[]>([])
  const [subcollectionsMap, setSubcollectionsMap] = useState<Map<string, SubcollectionPayload[]>>(new Map())
  const [pubCollectionsMap, setPubCollectionsMap] = useState<Map<string, PublicationCollectionSummary[]>>(new Map())
  const [collectionPubs, setCollectionPubs] = useState<CollectionPublicationPayload[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingCollection, setLoadingCollection] = useState(false)
  const [creatingCollection, setCreatingCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionColour, setNewCollectionColour] = useState<CollectionColour>('indigo')
  const [bulkTargetCollectionId, setBulkTargetCollectionId] = useState('')
  const [bulkTargetSubcollectionId, setBulkTargetSubcollectionId] = useState('')
  const [bulkMoveTargetId, setBulkMoveTargetId] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'collection' | 'subcollection'
    id: string
    name: string
    count: number
    parentId?: string
  } | null>(null)

  const selectedViewKind = parseView(searchParams.get('view'))
  const selectedCollectionId = selectedViewKind === 'collection' ? String(searchParams.get('collection') || '').trim() || null : null
  const selectedSubcollectionId = selectedViewKind === 'collection' ? String(searchParams.get('subcollection') || '').trim() || null : null
  const query = String(searchParams.get('q') || '').trim()
  const sort = parseSort(searchParams.get('sort'), selectedViewKind)

  const setWorkspaceParams = useCallback((updates: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const refreshCollections = useCallback(async () => {
    const items = await fetchCollections().catch(() => [] as CollectionPayload[])
    setCollections(items)
    return items
  }, [])

  const refreshPublicationCollections = useCallback(async () => {
    const items = await fetchPublicationCollectionsBatch(works.map((work) => work.id)).catch(() => [] as Array<{ work_id: string; items: PublicationCollectionSummary[] }>)
    setPubCollectionsMap(new Map(items.map((entry) => [entry.work_id, entry.items])))
  }, [works])

  const refreshCollectionPublications = useCallback(async (collectionId: string | null) => {
    if (!collectionId) {
      setCollectionPubs([])
      return
    }
    const items = await fetchCollectionPublications(collectionId).catch(() => [] as CollectionPublicationPayload[])
    setCollectionPubs(items)
  }, [])

  const refreshSubcollections = useCallback(async (collectionId: string | null) => {
    if (!collectionId) return
    const items = await fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[])
    setSubcollectionsMap((current) => new Map(current).set(collectionId, items))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [nextCollections, batch] = await Promise.all([
        fetchCollections().catch(() => [] as CollectionPayload[]),
        fetchPublicationCollectionsBatch(works.map((work) => work.id)).catch(() => [] as Array<{ work_id: string; items: PublicationCollectionSummary[] }>),
      ])
      if (cancelled) return
      setCollections(nextCollections)
      setPubCollectionsMap(new Map(batch.map((entry) => [entry.work_id, entry.items])))
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [works])

  useEffect(() => {
    if (loading) return
    const hasSelectedCollection = selectedCollectionId && collections.some((collection) => collection.id === selectedCollectionId)
    if (selectedViewKind === 'collection' && hasSelectedCollection) return
    if (selectedViewKind === 'uncollected') return
    if (collections.length === 0) {
      if (selectedViewKind !== 'all') setWorkspaceParams({ view: 'all', collection: null, subcollection: null })
      return
    }
    setWorkspaceParams({ view: 'collection', collection: collections[0].id, subcollection: null })
  }, [collections, loading, selectedCollectionId, selectedViewKind, setWorkspaceParams])

  useEffect(() => {
    if (selectedViewKind !== 'collection' || !selectedCollectionId) {
      setCollectionPubs([])
      return
    }
    const collectionId: string = selectedCollectionId
    let cancelled = false
    async function loadCollection() {
      setLoadingCollection(true)
      const [subs, pubs] = await Promise.all([
        fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[]),
        fetchCollectionPublications(collectionId).catch(() => [] as CollectionPublicationPayload[]),
      ])
      if (cancelled) return
      setSubcollectionsMap((current) => new Map(current).set(collectionId, subs))
      setCollectionPubs(pubs)
      setExpandedIds((current) => new Set(current).add(collectionId))
      setLoadingCollection(false)
    }
    void loadCollection()
    return () => {
      cancelled = true
    }
  }, [selectedCollectionId, selectedViewKind])

  useEffect(() => {
    setSelectedWorkIds(new Set())
  }, [selectedCollectionId, selectedSubcollectionId, selectedViewKind, query, sort])

  useEffect(() => {
    if (bulkTargetCollectionId && !subcollectionsMap.has(bulkTargetCollectionId)) {
      void refreshSubcollections(bulkTargetCollectionId)
    }
  }, [bulkTargetCollectionId, refreshSubcollections, subcollectionsMap])

  const libraryItems = useMemo(
    () => works.map((work) => ({ ...work, collectionMemberships: pubCollectionsMap.get(work.id) ?? [] })),
    [pubCollectionsMap, works],
  )
  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId],
  )
  const selectedSubcollections = selectedCollectionId ? (subcollectionsMap.get(selectedCollectionId) ?? []) : []
  const selectedSubcollection = selectedSubcollections.find((sub) => sub.id === selectedSubcollectionId) ?? null
  const uncollectedCount = libraryItems.filter((item) => item.collectionMemberships.length === 0).length
  const visibleLibraryItems = useMemo(() => {
    const base = selectedViewKind === 'uncollected'
      ? libraryItems.filter((item) => item.collectionMemberships.length === 0)
      : libraryItems
    return sortByYear(base.filter((item) => matchesLibraryWork(item, query)), sort === 'citations' ? 'recent' : sort)
  }, [libraryItems, query, selectedViewKind, sort])
  const visibleCollectionItems = useMemo(() => {
    const filtered = collectionPubs.filter((item) => (!selectedSubcollectionId || item.subcollection_id === selectedSubcollectionId) && matchesCollectionPublication(item, query))
    if (sort === 'citations') return [...filtered].sort((a, b) => b.citations - a.citations)
    return sortByYear(filtered, sort)
  }, [collectionPubs, query, selectedSubcollectionId, sort])
  const visibleWorkIds = selectedViewKind === 'collection'
    ? visibleCollectionItems.map((item) => item.work_id)
    : visibleLibraryItems.map((item) => item.id)
  const selectedVisibleCount = visibleWorkIds.filter((workId) => selectedWorkIds.has(workId)).length
  const allVisibleSelected = visibleWorkIds.length > 0 && selectedVisibleCount === visibleWorkIds.length

  const toggleSelectedWork = useCallback((workId: string) => {
    setSelectedWorkIds((current) => {
      const next = new Set(current)
      if (next.has(workId)) next.delete(workId)
      else next.add(workId)
      return next
    })
  }, [])

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedWorkIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current)
        visibleWorkIds.forEach((workId) => next.delete(workId))
        return next
      }
      return new Set(visibleWorkIds)
    })
  }, [allVisibleSelected, visibleWorkIds])

  const handleToggleExpand = useCallback((collectionId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(collectionId)) next.delete(collectionId)
      else next.add(collectionId)
      return next
    })
  }, [])

  const handleStartCreateCollection = useCallback(() => {
    setNewCollectionColour(autoAssignColour(collections))
    setCreatingCollection(true)
  }, [collections])

  const handleCreateCollection = useCallback(async () => {
    const name = newCollectionName.trim()
    if (!name) return
    try {
      const created = await createCollection({ name, colour: newCollectionColour })
      setCreatingCollection(false)
      setNewCollectionName('')
      await refreshCollections()
      setWorkspaceParams({ view: 'collection', collection: created.id, subcollection: null })
      setToast(`Created ${created.name}`)
    } catch {
      setToast('Failed to create collection')
    }
  }, [newCollectionColour, newCollectionName, refreshCollections, setWorkspaceParams])

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    try {
      await updateCollection(id, { name })
      await refreshCollections()
      setToast('Collection renamed')
    } catch {
      setToast('Failed to rename collection')
    }
  }, [refreshCollections])

  const handleColourChange = useCallback(async (id: string, colour: CollectionColour) => {
    try {
      await updateCollection(id, { colour })
      await refreshCollections()
      setPubCollectionsMap((current) => {
        const next = new Map(current)
        for (const [workId, items] of next) {
          if (items.some((item) => item.id === id)) {
            next.set(workId, items.map((item) => item.id === id ? { ...item, colour } : item))
          }
        }
        return next
      })
    } catch {
      setToast('Failed to update colour')
    }
  }, [refreshCollections])

  const handleCreateSubcollection = useCallback(async (collectionId: string, name: string) => {
    try {
      await createSubcollection(collectionId, { name })
      await Promise.all([refreshSubcollections(collectionId), refreshCollections()])
      setExpandedIds((current) => new Set(current).add(collectionId))
      setToast('Subcollection created')
    } catch {
      setToast('Failed to create subcollection')
    }
  }, [refreshCollections, refreshSubcollections])

  const handleRenameSubcollection = useCallback(async (collectionId: string, subId: string, name: string) => {
    try {
      await updateSubcollection(collectionId, subId, { name })
      await refreshSubcollections(collectionId)
      setToast('Subcollection renamed')
    } catch {
      setToast('Failed to rename subcollection')
    }
  }, [refreshSubcollections])

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'collection') {
        await deleteCollection(deleteConfirm.id)
        await Promise.all([refreshCollections(), refreshPublicationCollections()])
        if (selectedCollectionId === deleteConfirm.id) {
          setWorkspaceParams({ view: 'all', collection: null, subcollection: null })
        }
        setCollectionPubs([])
      } else if (deleteConfirm.parentId) {
        await deleteSubcollection(deleteConfirm.parentId, deleteConfirm.id)
        await Promise.all([refreshSubcollections(deleteConfirm.parentId), refreshCollections(), refreshCollectionPublications(deleteConfirm.parentId)])
        if (selectedSubcollectionId === deleteConfirm.id) {
          setWorkspaceParams({ subcollection: null })
        }
      }
      setToast(`Deleted ${deleteConfirm.name}`)
    } catch {
      setToast(`Failed to delete ${deleteConfirm.type}`)
    } finally {
      setDeleteConfirm(null)
    }
  }, [
    deleteConfirm,
    refreshCollectionPublications,
    refreshCollections,
    refreshPublicationCollections,
    refreshSubcollections,
    selectedCollectionId,
    selectedSubcollectionId,
    setWorkspaceParams,
  ])

  const addWorkIdsToCollection = useCallback(async (workIds: string[], collectionId: string, subcollectionId: string | null) => {
    if (!collectionId || workIds.length === 0) return
    const uniqueWorkIds = Array.from(new Set(workIds))
    const toAdd = uniqueWorkIds.filter((workId) => !(pubCollectionsMap.get(workId) ?? []).some((membership) => membership.id === collectionId))
    if (toAdd.length === 0) {
      setToast('Selected publications are already in that collection')
      return
    }
    try {
      const memberships = await addPublicationsToCollection(collectionId, toAdd)
      if (subcollectionId) {
        await Promise.allSettled(memberships.map((membership) => movePublicationSubcollection(collectionId, membership.id, subcollectionId)))
      }
      await Promise.all([
        refreshCollections(),
        refreshPublicationCollections(),
        selectedCollectionId === collectionId ? refreshCollectionPublications(collectionId) : Promise.resolve(),
        refreshSubcollections(collectionId),
      ])
      const collectionName = collections.find((collection) => collection.id === collectionId)?.name || 'collection'
      setToast(`Added to ${collectionName}`)
    } catch {
      setToast('Failed to add publications')
    }
  }, [
    collections,
    pubCollectionsMap,
    refreshCollectionPublications,
    refreshCollections,
    refreshPublicationCollections,
    refreshSubcollections,
    selectedCollectionId,
  ])

  const moveMemberships = useCallback(async (memberships: Array<{ membership_id: string; work_id: string }>, targetSubcollectionId: string | null) => {
    if (!selectedCollectionId || memberships.length === 0) return
    try {
      await Promise.allSettled(memberships.map((membership) => movePublicationSubcollection(selectedCollectionId, membership.membership_id, targetSubcollectionId)))
      await Promise.all([refreshCollectionPublications(selectedCollectionId), refreshCollections(), refreshSubcollections(selectedCollectionId)])
      setToast('Moved publication selection')
    } catch {
      setToast('Failed to move publications')
    }
  }, [refreshCollectionPublications, refreshCollections, refreshSubcollections, selectedCollectionId])

  const removeWorkIdsFromCollection = useCallback(async (workIds: string[]) => {
    if (!selectedCollectionId || workIds.length === 0) return
    try {
      await Promise.allSettled(workIds.map((workId) => removePublicationFromCollection(selectedCollectionId, workId)))
      await Promise.all([refreshCollectionPublications(selectedCollectionId), refreshCollections(), refreshPublicationCollections(), refreshSubcollections(selectedCollectionId)])
      setSelectedWorkIds((current) => {
        const next = new Set(current)
        workIds.forEach((workId) => next.delete(workId))
        return next
      })
      setToast('Removed from collection')
    } catch {
      setToast('Failed to remove publications')
    }
  }, [refreshCollectionPublications, refreshCollections, refreshPublicationCollections, refreshSubcollections, selectedCollectionId])

  const selectedLibraryItems = visibleLibraryItems.filter((item) => selectedWorkIds.has(item.id))
  const selectedCollectionItems = visibleCollectionItems.filter((item) => selectedWorkIds.has(item.work_id))

  return (
    <div className={cn('flex flex-col bg-[hsl(var(--surface-drilldown-elevated))]', pageMode ? 'min-h-[calc(100vh-11rem)]' : 'h-full min-h-0')}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Collections workspace</h2>
          <p className="text-sm text-muted-foreground">
            Curate paper sets in batch, then open the publication detail view without losing context.
          </p>
        </div>
        {onClose && !pageMode ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close collections"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading collections...</div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <CollectionSidebar
            collections={collections}
            mode="browse"
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            subcollectionsMap={subcollectionsMap}
            onSubcollectionsFetched={(collectionId, subs) => setSubcollectionsMap((current) => new Map(current).set(collectionId, subs))}
            selectedCollectionId={selectedCollectionId}
            selectedSubcollectionId={selectedSubcollectionId}
            onSelectCollection={(collectionId) => setWorkspaceParams({ view: 'collection', collection: collectionId, subcollection: null })}
            onSelectSubcollection={(collectionId, subcollectionId) => setWorkspaceParams({ view: 'collection', collection: collectionId, subcollection: subcollectionId })}
            pulsingId={null}
            creatingCollection={creatingCollection}
            onStartCreateCollection={handleStartCreateCollection}
            newCollectionName={newCollectionName}
            setNewCollectionName={setNewCollectionName}
            newCollectionColour={newCollectionColour}
            onCreateCollection={() => { void handleCreateCollection() }}
            onCancelCreateCollection={() => {
              setCreatingCollection(false)
              setNewCollectionName('')
            }}
            pageMode={pageMode}
            onRenameCollection={(id, name) => { void handleRenameCollection(id, name) }}
            onDeleteCollection={(id) => {
              const collection = collections.find((item) => item.id === id)
              if (!collection) return
              setDeleteConfirm({ type: 'collection', id, name: collection.name, count: collection.publication_count })
            }}
            onColourChange={(id, colour) => { void handleColourChange(id, colour) }}
            onCreateSubcollection={(collectionId, name) => { void handleCreateSubcollection(collectionId, name) }}
            onRenameSubcollection={(collectionId, subId, name) => { void handleRenameSubcollection(collectionId, subId, name) }}
            onDeleteSubcollection={(collectionId, subId) => {
              const subcollection = (subcollectionsMap.get(collectionId) ?? []).find((item) => item.id === subId)
              if (!subcollection) return
              setDeleteConfirm({
                type: 'subcollection',
                id: subId,
                name: subcollection.name,
                count: subcollection.publication_count,
                parentId: collectionId,
              })
            }}
            allPublicationsCount={libraryItems.length}
            uncollectedCount={uncollectedCount}
            selectedViewKind={selectedViewKind}
            onSelectAllPublications={() => setWorkspaceParams({ view: 'all', collection: null, subcollection: null })}
            onSelectUncollected={() => setWorkspaceParams({ view: 'uncollected', collection: null, subcollection: null })}
          />

          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-foreground">
                      {selectedViewKind === 'collection'
                        ? selectedSubcollection
                          ? `${selectedCollection?.name || 'Collection'} / ${selectedSubcollection.name}`
                          : (selectedCollection?.name || 'Collection')
                        : selectedViewKind === 'uncollected'
                          ? 'Uncollected publications'
                          : 'All publications'}
                    </h3>
                    <span className="rounded-full bg-[hsl(var(--tone-neutral-100))] px-2.5 py-1 text-[0.72rem] font-semibold text-[hsl(var(--tone-neutral-600))]">
                      {selectedViewKind === 'collection' ? visibleCollectionItems.length : visibleLibraryItems.length}
                    </span>
                  </div>
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    {selectedViewKind === 'collection'
                      ? selectedSubcollection
                        ? 'Focused subgroup inside this collection.'
                        : 'Browse and maintain the publications in this collection.'
                      : 'Use bulk actions to organise publications without leaving the profile workspace.'}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-4 py-3 text-right">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Visible Items</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedViewKind === 'collection' ? visibleCollectionItems.length : visibleLibraryItems.length}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <label className="relative min-w-[18rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setWorkspaceParams({ q: event.target.value || null })}
                    className="house-input h-10 w-full rounded-xl border-border bg-background pl-10 pr-10 text-sm"
                    placeholder="Search this workspace"
                    aria-label="Search this workspace"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setWorkspaceParams({ q: null })}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <span>Sort</span>
                  <select
                    className="bg-transparent text-foreground outline-none"
                    value={sort}
                    onChange={(event) => setWorkspaceParams({ sort: event.target.value })}
                  >
                    <option value="recent">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title">Title A-Z</option>
                    {selectedViewKind === 'collection' ? <option value="citations">Most cited</option> : null}
                  </select>
                </label>
              </div>
            </div>

            <div className="border-b border-border px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-[hsl(var(--tone-accent-600))] focus:ring-[hsl(var(--tone-accent-500))]"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible publications"
                  />
                  <span>{selectedVisibleCount > 0 ? `${selectedVisibleCount} selected` : `${visibleWorkIds.length} visible`}</span>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedViewKind === 'collection' ? (
                    <>
                      <label className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                        <ArrowRightLeft className="h-4 w-4" />
                        <select
                          className="bg-transparent text-foreground outline-none"
                          value={bulkMoveTargetId}
                          onChange={(event) => setBulkMoveTargetId(event.target.value)}
                        >
                          <option value="">Move to...</option>
                          <option value="__top__">Top level</option>
                          {selectedSubcollections.map((subcollection) => (
                            <option key={subcollection.id} value={subcollection.id}>{subcollection.name}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--tone-accent-100))] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!bulkMoveTargetId || selectedVisibleCount === 0}
                        onClick={() => {
                          void moveMemberships(
                            selectedCollectionItems.map((item) => ({ membership_id: item.membership_id, work_id: item.work_id })),
                            bulkMoveTargetId === '__top__' ? null : bulkMoveTargetId,
                          )
                        }}
                      >
                        Move selection
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm font-medium text-[hsl(var(--tone-danger-700))] transition-colors hover:bg-[hsl(var(--tone-danger-100))] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={selectedVisibleCount === 0}
                        onClick={() => { void removeWorkIdsFromCollection(selectedCollectionItems.map((item) => item.work_id)) }}
                      >
                        Remove from collection
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                        <select
                          className="bg-transparent text-foreground outline-none"
                          value={bulkTargetCollectionId}
                          onChange={(event) => {
                            setBulkTargetCollectionId(event.target.value)
                            setBulkTargetSubcollectionId('')
                          }}
                        >
                          <option value="">Choose collection...</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>{collection.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                        <select
                          className="bg-transparent text-foreground outline-none"
                          value={bulkTargetSubcollectionId}
                          onChange={(event) => setBulkTargetSubcollectionId(event.target.value)}
                          disabled={!bulkTargetCollectionId}
                        >
                          <option value="">Top level</option>
                          {(subcollectionsMap.get(bulkTargetCollectionId) ?? []).map((subcollection) => (
                            <option key={subcollection.id} value={subcollection.id}>{subcollection.name}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--tone-accent-100))] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!bulkTargetCollectionId || selectedVisibleCount === 0}
                        onClick={() => { void addWorkIdsToCollection(selectedLibraryItems.map((item) => item.id), bulkTargetCollectionId, bulkTargetSubcollectionId || null) }}
                      >
                        Add selected
                      </button>
                    </>
                  )}
                  {selectedVisibleCount > 0 ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-border bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[hsl(var(--tone-neutral-100))] hover:text-foreground"
                      onClick={() => setSelectedWorkIds(new Set())}
                    >
                      Clear selection
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loadingCollection ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading collection...</div>
              ) : (selectedViewKind === 'collection' ? visibleCollectionItems.length : visibleLibraryItems.length) === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="rounded-full bg-[hsl(var(--tone-accent-100))] p-3 text-[hsl(var(--tone-accent-700))]">
                    <Layers3 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-medium text-foreground">
                      {selectedViewKind === 'collection'
                        ? selectedSubcollection ? 'This subcollection is empty.' : 'This collection is empty.'
                        : selectedViewKind === 'uncollected'
                          ? 'Everything is already assigned to a collection.'
                          : 'No publications match this search.'}
                    </p>
                    <p className="max-w-lg text-sm text-muted-foreground">
                      {selectedViewKind === 'collection'
                        ? 'Add papers from your library, then return here to curate them in context.'
                        : 'Try a broader query or switch to another library view.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedViewKind === 'collection'
                    ? visibleCollectionItems.map((item) => (
                        <PublicationCard
                          key={item.membership_id}
                          variant="collection"
                          workId={item.work_id}
                          membershipId={item.membership_id}
                          title={item.title}
                          venue={item.journal}
                          year={item.year}
                          doi={item.doi}
                          citations={item.citations}
                          checked={selectedWorkIds.has(item.work_id)}
                          onToggleChecked={() => toggleSelectedWork(item.work_id)}
                          onOpen={() => onOpenPublication(item.work_id)}
                          collections={collections}
                          subcollectionsMap={subcollectionsMap}
                          onSubcollectionsFetched={(collectionId, subs) => setSubcollectionsMap((current) => new Map(current).set(collectionId, subs))}
                          currentCollectionId={selectedCollectionId || ''}
                          subcollectionLabel={item.subcollection_id ? selectedSubcollections.find((subcollection) => subcollection.id === item.subcollection_id)?.name || null : null}
                          onMoveToSubcollection={(subcollectionId) => { void moveMemberships([{ membership_id: item.membership_id, work_id: item.work_id }], subcollectionId) }}
                          onRemoveFromCollection={() => { void removeWorkIdsFromCollection([item.work_id]) }}
                        />
                      ))
                    : visibleLibraryItems.map((item) => (
                        <PublicationCard
                          key={item.id}
                          variant="library"
                          workId={item.id}
                          title={item.title}
                          venue={item.venue_name}
                          year={item.year}
                          doi={item.doi}
                          checked={selectedWorkIds.has(item.id)}
                          onToggleChecked={() => toggleSelectedWork(item.id)}
                          onOpen={() => onOpenPublication(item.id)}
                          collections={collections}
                          subcollectionsMap={subcollectionsMap}
                          onSubcollectionsFetched={(collectionId, subs) => setSubcollectionsMap((current) => new Map(current).set(collectionId, subs))}
                          collectionMemberships={item.collectionMemberships}
                          onAddToCollection={(collectionId, subcollectionId) => { void addWorkIdsToCollection([item.id], collectionId, subcollectionId) }}
                        />
                      ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirm ? (
        <ConfirmDeleteDialog
          open={Boolean(deleteConfirm)}
          title={`Delete ${deleteConfirm.type}`}
          description={
            deleteConfirm.type === 'collection'
              ? `Delete '${deleteConfirm.name}'? This will remove ${deleteConfirm.count} publication${deleteConfirm.count === 1 ? '' : 's'} from this collection. This cannot be undone.`
              : `Delete '${deleteConfirm.name}'? Publications will remain in the parent collection.`
          }
          onConfirm={() => { void handleDeleteConfirmed() }}
          onCancel={() => setDeleteConfirm(null)}
        />
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  )
}

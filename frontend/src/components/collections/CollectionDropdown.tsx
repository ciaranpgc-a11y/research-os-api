import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLLECTION_COLOUR_HEX, type CollectionPayload, type SubcollectionPayload } from '@/types/collections'
import { fetchSubcollections } from '@/lib/collections-api'

interface CollectionDropdownProps {
  /** All collections to list */
  collections: CollectionPayload[]
  /** Cached subcollections map — will be populated lazily */
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  /** Callback to update the cache when subcollections are fetched */
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
  /** IDs of collections/subcollections this publication already belongs to */
  existingMembershipIds: Set<string>
  /** Called when user selects a target. subcollectionId is null for collection-level. */
  onSelect: (collectionId: string, subcollectionId: string | null) => void
  /** Called to close the dropdown */
  onClose: () => void
  /** Positioning style */
  style?: React.CSSProperties
  /** Positioning mode for the dropdown root */
  positioning?: 'absolute' | 'fixed'
  /** Optional: limit to subcollections of a specific collection (for "Move to" in Browse) */
  limitToCollectionId?: string
}

export function CollectionDropdown({
  collections,
  subcollectionsMap,
  onSubcollectionsFetched,
  existingMembershipIds,
  onSelect,
  onClose,
  style,
  positioning = 'absolute',
  limitToCollectionId,
}: CollectionDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleExpand = useCallback(async (collectionId: string) => {
    if (expandedId === collectionId) {
      setExpandedId(null)
      return
    }
    setExpandedId(collectionId)
    if (!subcollectionsMap.has(collectionId)) {
      const subs = await fetchSubcollections(collectionId).catch(() => [] as SubcollectionPayload[])
      onSubcollectionsFetched(collectionId, subs)
    }
  }, [expandedId, subcollectionsMap, onSubcollectionsFetched])

  const displayCollections = limitToCollectionId
    ? collections.filter((c) => c.id === limitToCollectionId)
    : collections

  const itemClass = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]'

  return (
    <div
      ref={ref}
      className={cn(
        positioning === 'fixed' ? 'fixed' : 'absolute',
        'z-50 w-[14rem] max-h-[18rem] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg',
      )}
      style={style}
    >
      {limitToCollectionId && (
        <button
          type="button"
          className={cn(itemClass, 'text-muted-foreground italic')}
          onClick={() => onSelect(limitToCollectionId, null)}
        >
          Top level (no subcollection)
        </button>
      )}
      {displayCollections.map((coll) => {
        const subs = subcollectionsMap.get(coll.id) ?? []
        const isExpanded = expandedId === coll.id
        const isMember = existingMembershipIds.has(coll.id)
        return (
          <div key={coll.id}>
            <div className="flex items-center">
              <button
                type="button"
                className={cn(itemClass, 'flex-1', isMember && 'text-muted-foreground')}
                onClick={() => {
                  if (limitToCollectionId) {
                    // In "Move to" mode, don't select the collection itself
                    return
                  }
                  onSelect(coll.id, null)
                }}
              >
                <span
                  className="w-0.5 self-stretch rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLLECTION_COLOUR_HEX[coll.colour] }}
                />
                <span className="flex-1 truncate">{coll.name}</span>
                {isMember && !limitToCollectionId && <Check className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
              </button>
              {!limitToCollectionId && (
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-foreground rounded"
                  onClick={(e) => { e.stopPropagation(); void handleExpand(coll.id) }}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${coll.name} subcollections`}
                >
                  <ChevronRight className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')} />
                </button>
              )}
            </div>
            {(isExpanded || limitToCollectionId) && subs.length > 0 && (
              <div className="ml-4 border-l border-border pl-1">
                {subs.map((sub) => {
                  const subMember = existingMembershipIds.has(sub.id)
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      className={cn(itemClass, subMember && 'text-muted-foreground')}
                      onClick={() => onSelect(coll.id, sub.id)}
                    >
                      <span className="flex-1 truncate">{sub.name}</span>
                      {subMember && <Check className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { GripVertical, Plus, ArrowRightLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLLECTION_COLOUR_HEX, type CollectionPayload, type SubcollectionPayload, type PublicationCollectionSummary } from '@/types/collections'
import { CollectionDropdown } from './CollectionDropdown'

interface PublicationCardOrganiseProps {
  mode: 'organise'
  workId: string
  title: string
  venue: string | null
  year: number | null
  isDragging: boolean
  collectionMemberships: PublicationCollectionSummary[]
  collections: CollectionPayload[]
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
  onDragStart: () => void
  onAddToCollection: (collectionId: string, subcollectionId: string | null) => void
}

interface PublicationCardBrowseProps {
  mode: 'browse'
  workId: string
  membershipId: string
  title: string
  venue: string | null
  year: number | null
  citations: number
  subcollectionId: string | null
  isDragging: boolean
  collections: CollectionPayload[]
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
  currentCollectionId: string
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onRemove: () => void
  onMoveToSubcollection: (subcollectionId: string | null) => void
  onClick: () => void
}

type PublicationCardProps = PublicationCardOrganiseProps | PublicationCardBrowseProps

export function PublicationCard(props: PublicationCardProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const metaLine = [props.venue, props.year].filter(Boolean).join(' · ')

  if (props.mode === 'organise') {
    const { title, isDragging, collectionMemberships, collections, subcollectionsMap, onSubcollectionsFetched, onDragStart, onAddToCollection } = props
    const existingIds = new Set(collectionMemberships.map((m) => m.id))
    return (
      <div
        draggable
        onDragStart={onDragStart}
        className={cn(
          'group relative flex items-center p-3 bg-muted/40 border border-border rounded-lg gap-2.5 cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50',
        )}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{title}</div>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <span className="text-xs text-muted-foreground truncate shrink-0">{metaLine}</span>
            {collectionMemberships.length > 0 && (
              <span className="flex items-center gap-1 flex-wrap min-w-0">
                {collectionMemberships.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium max-w-[120px] truncate"
                    style={{
                      backgroundColor: `${COLLECTION_COLOUR_HEX[c.colour]}20`,
                      color: COLLECTION_COLOUR_HEX[c.colour],
                    }}
                  >
                    {c.name}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="house-section-tool-button opacity-0 group-hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded flex-shrink-0"
          title="Add to collection"
          onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown) }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {showDropdown && (
          <CollectionDropdown
            collections={collections}
            subcollectionsMap={subcollectionsMap}
            onSubcollectionsFetched={onSubcollectionsFetched}
            existingMembershipIds={existingIds}
            onSelect={(collId, subId) => { onAddToCollection(collId, subId); setShowDropdown(false) }}
            onClose={() => setShowDropdown(false)}
            style={{ top: '100%', right: 0, marginTop: 4 }}
          />
        )}
      </div>
    )
  }

  // Browse mode
  const { title, isDragging, currentCollectionId, collections, subcollectionsMap, onSubcollectionsFetched, onDragStart, onDragOver, onDrop, onRemove, onMoveToSubcollection, onClick } = props
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group relative flex items-center p-3 bg-muted/40 border border-border rounded-lg gap-2.5 cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onClick}
      >
        <div className="text-sm font-medium text-foreground truncate">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{metaLine}</div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">{props.citations} cited</span>
      <button
        type="button"
        className="house-section-tool-button opacity-0 group-hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded flex-shrink-0"
        title="Move to subcollection"
        onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown) }}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0"
        onClick={onRemove}
        title="Remove from collection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {showDropdown && (
        <CollectionDropdown
          collections={collections}
          subcollectionsMap={subcollectionsMap}
          onSubcollectionsFetched={onSubcollectionsFetched}
          existingMembershipIds={new Set()}
          onSelect={(_collId, subId) => { onMoveToSubcollection(subId); setShowDropdown(false) }}
          onClose={() => setShowDropdown(false)}
          style={{ top: '100%', right: 0, marginTop: 4 }}
          limitToCollectionId={currentCollectionId}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, ExternalLink, Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  COLLECTION_COLOUR_HEX,
  type CollectionPayload,
  type PublicationCollectionSummary,
  type SubcollectionPayload,
} from '@/types/collections'
import { CollectionDropdown } from './CollectionDropdown'

type SharedPublicationCardProps = {
  workId: string
  title: string
  venue: string | null
  year: number | null
  doi: string | null
  checked: boolean
  onToggleChecked: () => void
  onOpen: () => void
  collections: CollectionPayload[]
  subcollectionsMap: Map<string, SubcollectionPayload[]>
  onSubcollectionsFetched: (collectionId: string, subs: SubcollectionPayload[]) => void
}

type LibraryPublicationCardProps = SharedPublicationCardProps & {
  variant: 'library'
  collectionMemberships: PublicationCollectionSummary[]
  onAddToCollection: (collectionId: string, subcollectionId: string | null) => void
}

type CollectionPublicationCardProps = SharedPublicationCardProps & {
  variant: 'collection'
  membershipId: string
  citations: number
  currentCollectionId: string
  subcollectionLabel: string | null
  onMoveToSubcollection: (subcollectionId: string | null) => void
  onRemoveFromCollection: () => void
}

type PublicationCardProps = LibraryPublicationCardProps | CollectionPublicationCardProps

function PublicationContextMenu({
  x,
  y,
  variant,
  onOpen,
  onManage,
  onRemoveFromCollection,
  onClose,
}: {
  x: number
  y: number
  variant: 'library' | 'collection'
  onOpen: () => void
  onManage: () => void
  onRemoveFromCollection?: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [onClose])

  const width = 196
  const left = typeof window === 'undefined' ? x : Math.min(x, window.innerWidth - width - 12)
  const top = typeof window === 'undefined' ? y : Math.min(y, window.innerHeight - 140)
  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[hsl(var(--tone-neutral-700))] transition-colors hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]'

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-48 rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-white p-2 shadow-[0_20px_44px_hsl(var(--tone-neutral-900)/0.14)]"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" className={itemClass} onClick={() => { onOpen(); onClose() }}>
        <ExternalLink className="h-4 w-4" />
        <span>Open publication</span>
      </button>
      <button type="button" className={itemClass} onClick={onManage}>
        {variant === 'library' ? <Plus className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
        <span>{variant === 'library' ? 'Add to collection' : 'Move in collection'}</span>
      </button>
      {variant === 'collection' && onRemoveFromCollection ? (
        <>
          <div className="my-1 border-t border-[hsl(var(--tone-neutral-200))]" />
          <button
            type="button"
            className={cn(
              itemClass,
              'text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))] hover:text-[hsl(var(--tone-danger-800))]',
            )}
            onClick={() => { onRemoveFromCollection(); onClose() }}
          >
            <X className="h-4 w-4" />
            <span>Remove from collection</span>
          </button>
        </>
      ) : null}
    </div>
  )
}

export function PublicationCard(props: PublicationCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showDropdown, setShowDropdown] = useState<{ x: number; y: number } | null>(null)

  const metaLine = useMemo(() => {
    const next: string[] = []
    const venue = String(props.venue || '').trim()
    const doi = String(props.doi || '').trim()
    if (venue) {
      next.push(venue)
    }
    if (props.year) {
      next.push(String(props.year))
    }
    if (doi) {
      next.push(`DOI ${doi}`)
    }
    return next.join(' · ')
  }, [props])

  return (
    <article
      className="group rounded-[1.15rem] border border-[hsl(var(--tone-neutral-200))] bg-white px-4 py-3 shadow-[0_14px_34px_hsl(var(--tone-neutral-900)/0.04)] transition-colors hover:border-[hsl(var(--tone-neutral-300))]"
      onContextMenu={(event) => {
        event.preventDefault()
        setShowDropdown(null)
        setContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="flex items-start gap-3">
        <label className="mt-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[hsl(var(--tone-neutral-300))] text-[hsl(var(--tone-accent-600))] focus:ring-[hsl(var(--tone-accent-500))]"
            checked={props.checked}
            onChange={props.onToggleChecked}
            aria-label={`Select ${props.title}`}
          />
        </label>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block text-left text-[0.98rem] font-semibold leading-tight text-[hsl(var(--tone-neutral-900))] transition-colors hover:text-[hsl(var(--tone-accent-700))]"
            onClick={props.onOpen}
          >
            {props.title}
          </button>

          {metaLine ? (
            <p className="mt-1.5 text-sm text-[hsl(var(--tone-neutral-500))]">
              {metaLine}
            </p>
          ) : null}

          {props.variant === 'library' && props.collectionMemberships.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {props.collectionMemberships.slice(0, 3).map((membership) => (
                <span
                  key={membership.id}
                  className="inline-flex max-w-[13rem] items-center gap-1.5 rounded-full border border-[hsl(var(--tone-neutral-200))] px-2 py-1 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-700))]"
                  style={{
                    backgroundColor: `${COLLECTION_COLOUR_HEX[membership.colour]}12`,
                  }}
                  title={membership.name}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: COLLECTION_COLOUR_HEX[membership.colour] }}
                  />
                  <span className="truncate">{membership.name}</span>
                </span>
              ))}
              {props.collectionMemberships.length > 3 ? (
                <span className="text-xs text-[hsl(var(--tone-neutral-500))]">
                  +{props.collectionMemberships.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}

          {props.variant === 'collection' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-1 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-600))]">
                {props.subcollectionLabel || 'Top level'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {contextMenu ? (
        <PublicationContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          variant={props.variant}
          onOpen={props.onOpen}
          onManage={() => {
            const offsetX = typeof window === 'undefined' ? contextMenu.x : Math.min(contextMenu.x + 164, window.innerWidth - 244)
            setShowDropdown({ x: offsetX, y: contextMenu.y })
            setContextMenu(null)
          }}
          onRemoveFromCollection={props.variant === 'collection' ? props.onRemoveFromCollection : undefined}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {showDropdown ? (
        <CollectionDropdown
          collections={props.collections}
          subcollectionsMap={props.subcollectionsMap}
          onSubcollectionsFetched={props.onSubcollectionsFetched}
          existingMembershipIds={
            props.variant === 'library'
              ? new Set(props.collectionMemberships.map((membership) => membership.id))
              : new Set<string>()
          }
          onSelect={(collectionId, subcollectionId) => {
            if (props.variant === 'library') {
              props.onAddToCollection(collectionId, subcollectionId)
            } else {
              props.onMoveToSubcollection(subcollectionId)
            }
            setShowDropdown(null)
          }}
          onClose={() => setShowDropdown(null)}
          positioning="fixed"
          style={{ left: showDropdown.x, top: showDropdown.y }}
          limitToCollectionId={props.variant === 'collection' ? props.currentCollectionId : undefined}
        />
      ) : null}
    </article>
  )
}

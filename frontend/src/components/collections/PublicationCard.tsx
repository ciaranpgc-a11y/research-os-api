import { useMemo, useState } from 'react'
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

function MetaPill({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-[hsl(var(--tone-neutral-100))] px-2.5 py-1 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-700))]">
      {children}
    </span>
  )
}

export function PublicationCard(props: PublicationCardProps) {
  const [showDropdown, setShowDropdown] = useState(false)

  const metaPills = useMemo(() => {
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
    if (props.variant === 'collection' && props.citations > 0) {
      next.push(`${props.citations} citations`)
    }
    return next
  }, [props])

  return (
    <article className="group rounded-[1.15rem] border border-[hsl(var(--tone-neutral-200))] bg-white px-4 py-3 shadow-[0_14px_34px_hsl(var(--tone-neutral-900)/0.04)] transition-colors hover:border-[hsl(var(--tone-neutral-300))]">
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

          {metaPills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {metaPills.map((item) => (
                <MetaPill key={item}>{item}</MetaPill>
              ))}
            </div>
          ) : null}

          {props.variant === 'library' && props.collectionMemberships.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {props.collectionMemberships.map((membership) => (
                <span
                  key={membership.id}
                  className="inline-flex max-w-[13rem] items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold"
                  style={{
                    backgroundColor: `${COLLECTION_COLOUR_HEX[membership.colour]}1f`,
                    color: COLLECTION_COLOUR_HEX[membership.colour],
                  }}
                  title={membership.name}
                >
                  <span className="truncate">{membership.name}</span>
                </span>
              ))}
            </div>
          ) : null}

          {props.variant === 'collection' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--tone-accent-100))] px-2.5 py-1 text-[0.72rem] font-semibold text-[hsl(var(--tone-accent-800))]">
                {props.subcollectionLabel || 'Top level'}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <div className="relative">
            {props.variant === 'library' ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white px-2.5 py-1.5 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-neutral-350))] hover:text-[hsl(var(--tone-neutral-900))]"
                onClick={() => setShowDropdown((current) => !current)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white px-2.5 py-1.5 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-neutral-350))] hover:text-[hsl(var(--tone-neutral-900))]"
                onClick={() => setShowDropdown((current) => !current)}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Move</span>
              </button>
            )}

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
                  setShowDropdown(false)
                }}
                onClose={() => setShowDropdown(false)}
                style={{ top: 'calc(100% + 0.45rem)', right: 0 }}
                limitToCollectionId={props.variant === 'collection' ? props.currentCollectionId : undefined}
              />
            ) : null}
          </div>

          {props.variant === 'collection' ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-2.5 py-1.5 text-[0.72rem] font-medium text-[hsl(var(--tone-danger-700))] transition-colors hover:bg-[hsl(var(--tone-danger-100))]"
              onClick={props.onRemoveFromCollection}
            >
              <X className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          ) : null}

          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-250))] bg-[hsl(var(--tone-neutral-50))] px-2.5 py-1.5 text-[0.72rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-neutral-350))] hover:text-[hsl(var(--tone-neutral-900))]',
              props.variant === 'collection' && 'bg-white',
            )}
            onClick={props.onOpen}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open</span>
          </button>
        </div>
      </div>
    </article>
  )
}

# Collections Viewport v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the collections viewport with a colour-bar tree sidebar, click-to-add, auto-colours, delete confirmations, empty states, subcollection rename, and move-between-subcollections — all matching the house design system.

**Architecture:** Component decomposition of the existing monolithic `CollectionsViewport.tsx` (~1200 lines) into focused sub-components, plus one new backend endpoint for moving publications between subcollections. Frontend-heavy — 9 of 10 items are purely frontend.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, `@radix-ui/react-dialog` (for confirmation modal), FastAPI, SQLAlchemy 2.0, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-03-22-collections-v2-improvements-design.md`

**IMPORTANT:** Always work in the main branch. Do NOT create worktrees or feature branches.

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `frontend/src/components/collections/CollectionSidebar.tsx` | Tree sidebar with colour bars, expand/collapse, subcollection nesting, drop targets, inline create/rename |
| `frontend/src/components/collections/PublicationCard.tsx` | Draggable publication card with "+" add button (Organise) and "Move to" button (Browse) |
| `frontend/src/components/collections/CollectionDropdown.tsx` | Shared dropdown listing collections/subcollections for "add to" and "move to" actions |
| `frontend/src/components/collections/ConfirmDeleteDialog.tsx` | Reusable confirmation dialog using `@radix-ui/react-dialog` |
| `frontend/src/components/collections/collections-utils.ts` | Shared helpers: `autoAssignColour()`, colour constants, shared types |

### Existing files to modify

| File | Changes |
|------|---------|
| `frontend/src/components/collections/CollectionsViewport.tsx` | Refactor to use extracted components, add `subcollectionsMap` state, `expandedIds` state, `pulsingId` state, wire up confirmation dialog |
| `frontend/src/lib/collections-api.ts` | Add `movePublicationSubcollection()` function |
| `frontend/src/types/collections.ts` | Add `CollectionMembershipMovePayload` type |
| `frontend/src/index.css` | Add `@keyframes drop-pulse` animation |
| `src/research_os/services/collection_service.py` | Add `move_publication_subcollection()` service function |
| `src/research_os/api/schemas.py` | Add `MovePublicationSubcollectionRequest` schema |
| `src/research_os/api/app.py` | Add `PATCH /v1/collections/{collection_id}/memberships/{membership_id}/move` endpoint |

---

## Task 1: Backend — Move Publication Subcollection Endpoint

**Files:**
- Modify: `src/research_os/services/collection_service.py`
- Modify: `src/research_os/api/schemas.py`
- Modify: `src/research_os/api/app.py`

This task adds the single new backend endpoint needed for item 8 (moving publications between subcollections).

- [ ] **Step 1: Add service function to `collection_service.py`**

Add at the end of the file:

```python
def move_publication_subcollection(
    user_id: str,
    collection_id: str,
    membership_id: str,
    target_subcollection_id: str | None,
) -> dict[str, Any]:
    """Move a publication membership to a different subcollection (or to top level if None)."""
    with session_scope() as session:
        collection = session.execute(
            select(Collection).where(
                Collection.id == collection_id,
                Collection.user_id == user_id,
            )
        ).scalar_one_or_none()
        if not collection:
            raise ValueError("Collection not found")

        membership = session.execute(
            select(CollectionMembership).where(
                CollectionMembership.id == membership_id,
                CollectionMembership.collection_id == collection_id,
            )
        ).scalar_one_or_none()
        if not membership:
            raise ValueError("Membership not found")

        if target_subcollection_id is not None:
            subcollection = session.execute(
                select(Subcollection).where(
                    Subcollection.id == target_subcollection_id,
                    Subcollection.collection_id == collection_id,
                )
            ).scalar_one_or_none()
            if not subcollection:
                raise ValueError("Subcollection not found in this collection")

        membership.subcollection_id = target_subcollection_id
        session.flush()
        return {
            "membership_id": membership.id,
            "work_id": membership.work_id,
            "collection_id": membership.collection_id,
            "subcollection_id": membership.subcollection_id,
            "sort_order": membership.sort_order,
        }
```

- [ ] **Step 2: Add Pydantic schema to `schemas.py`**

Add after the existing `CollectionPublicationReorderResponse` class:

```python
class MovePublicationSubcollectionRequest(BaseModel):
    subcollection_id: str | None = None


class MovePublicationSubcollectionResponse(BaseModel):
    membership_id: str
    work_id: str
    collection_id: str
    subcollection_id: str | None = None
    sort_order: int
```

- [ ] **Step 3: Add import to `app.py`**

Add `move_publication_subcollection` to the existing collection service imports near line 588:

```python
from research_os.services.collection_service import (
    ...
    move_publication_subcollection,
)
```

Also add the new schema imports:

```python
from research_os.api.schemas import (
    ...
    MovePublicationSubcollectionRequest,
    MovePublicationSubcollectionResponse,
)
```

- [ ] **Step 4: Add endpoint to `app.py`**

Add this endpoint after the existing collection publication endpoints (around line 6830), following the exact codebase pattern (synchronous `def`, `_resolve_request_user_required` returning a tuple, `_build_error_response`, `_build_not_found_response`):

```python
@app.patch(
    "/v1/collections/{collection_id}/memberships/{membership_id}/move",
    response_model=MovePublicationSubcollectionResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_move_publication_subcollection(
    collection_id: str,
    membership_id: str,
    body: MovePublicationSubcollectionRequest,
    request: Request,
) -> MovePublicationSubcollectionResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        result = move_publication_subcollection(
            user_id=user_id,
            collection_id=collection_id,
            membership_id=membership_id,
            target_subcollection_id=body.subcollection_id,
        )
        return MovePublicationSubcollectionResponse(**result)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)
```

- [ ] **Step 5: Add API client function to `collections-api.ts`**

Add at the end of the file:

```typescript
export async function movePublicationSubcollection(
  collectionId: string,
  membershipId: string,
  subcollectionId: string | null,
): Promise<{ membership_id: string; work_id: string; collection_id: string; subcollection_id: string | null; sort_order: number }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${collectionId}/memberships/${membershipId}/move`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ subcollection_id: subcollectionId }) },
    'Failed to move publication',
  )
}
```

- [ ] **Step 6: Add frontend type to `collections.ts`**

No new type needed — the response shape is simple enough to inline.

- [ ] **Step 7: Verify the frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No TypeScript errors from the new API function.

- [ ] **Step 8: Commit**

```bash
git add src/research_os/services/collection_service.py src/research_os/api/schemas.py src/research_os/api/app.py frontend/src/lib/collections-api.ts
git commit -m "feat(collections): add move-publication-subcollection endpoint and API client"
```

---

## Task 2: Extract Shared Utilities + Drop Pulse CSS

**Files:**
- Create: `frontend/src/components/collections/collections-utils.ts`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create `collections-utils.ts`**

Extract shared constants and helpers from `CollectionsViewport.tsx`:

```typescript
import type { CollectionColour, CollectionPayload } from '@/types/collections'

export const ALL_COLOURS: CollectionColour[] = [
  'indigo', 'amber', 'emerald', 'red', 'violet',
  'sky', 'pink', 'teal', 'orange', 'slate',
]

export type ViewportMode = 'organise' | 'browse'
export type PubFilter = 'all' | 'uncollected'

/**
 * Pick the next unused colour from the palette.
 * If all are used, cycle from the start.
 */
export function autoAssignColour(existingCollections: CollectionPayload[]): CollectionColour {
  const usedColours = new Set(existingCollections.map((c) => c.colour))
  const unused = ALL_COLOURS.find((c) => !usedColours.has(c))
  if (unused) return unused
  // All used — pick the least-used
  const counts = new Map<CollectionColour, number>()
  for (const c of ALL_COLOURS) counts.set(c, 0)
  for (const coll of existingCollections) {
    counts.set(coll.colour, (counts.get(coll.colour) ?? 0) + 1)
  }
  let min = Infinity
  let pick: CollectionColour = ALL_COLOURS[0]
  for (const [colour, count] of counts) {
    if (count < min) { min = count; pick = colour }
  }
  return pick
}
```

- [ ] **Step 2: Add drop-pulse animation to `index.css`**

Add at the end of the `@layer components` block (before the closing `}`):

```css
  @keyframes drop-pulse {
    0% { background-color: hsl(var(--tone-positive-100)); }
    100% { background-color: transparent; }
  }
  .animate-drop-pulse {
    animation: drop-pulse 600ms ease-out;
  }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/collections/collections-utils.ts frontend/src/index.css
git commit -m "feat(collections): add shared utils and drop-pulse animation"
```

---

## Task 3: ConfirmDeleteDialog Component

**Files:**
- Create: `frontend/src/components/collections/ConfirmDeleteDialog.tsx`

- [ ] **Step 1: Create the component**

Uses `@radix-ui/react-dialog` (already installed for Sheet). Builds a simple confirmation modal matching the house style:

```tsx
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface ConfirmDeleteDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-card p-6 shadow-xl',
            'focus:outline-none',
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="house-section-tool-button rounded-md border border-border px-4 py-2 text-sm font-medium"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/collections/ConfirmDeleteDialog.tsx
git commit -m "feat(collections): add confirmation delete dialog component"
```

---

## Task 4: CollectionDropdown Component

**Files:**
- Create: `frontend/src/components/collections/CollectionDropdown.tsx`

This is the shared dropdown used by "+" add-to-collection (Organise mode) and "Move to" subcollection (Browse mode).

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLLECTION_COLOUR_HEX, type CollectionColour, type CollectionPayload, type SubcollectionPayload } from '@/types/collections'
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
      className="absolute z-50 w-[14rem] max-h-[18rem] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/collections/CollectionDropdown.tsx
git commit -m "feat(collections): add shared collection dropdown component"
```

---

## Task 5: PublicationCard Component

**Files:**
- Create: `frontend/src/components/collections/PublicationCard.tsx`

Extracts the publication card from both OrganiseView and BrowseView into a shared component with mode-specific behaviour.

- [ ] **Step 1: Create the component**

```tsx
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
    const { workId, title, isDragging, collectionMemberships, collections, subcollectionsMap, onSubcollectionsFetched, onDragStart, onAddToCollection } = props
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
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">{metaLine}</span>
            {collectionMemberships.length > 0 && (
              <span className="flex items-center gap-1 flex-shrink-0">
                {collectionMemberships.map((c) => (
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
  const { workId, membershipId, title, citations, isDragging, currentCollectionId, collections, subcollectionsMap, onSubcollectionsFetched, onDragStart, onDragOver, onDrop, onRemove, onMoveToSubcollection, onClick } = props
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
      <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">{citations} cited</span>
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/collections/PublicationCard.tsx
git commit -m "feat(collections): add shared publication card component"
```

---

## Task 6: CollectionSidebar Component — Colour Bar Tree

**Files:**
- Create: `frontend/src/components/collections/CollectionSidebar.tsx`

This is the biggest new component. Replaces the old flat-list `CollectionSidebar` with a tree that uses colour bars, expand/collapse, and inline subcollections.

- [ ] **Step 1: Create the component**

The component needs these props:
- `collections` — list of all collections
- `expandedIds` / `setExpandedIds` — which collections are expanded
- `subcollectionsMap` — cached subcollections
- `onSubcollectionsFetched` — callback when subs are lazily loaded
- `selectedCollectionId` / `selectedSubcollectionId` — current selection (Browse mode)
- `onSelectCollection` / `onSelectSubcollection` — selection callbacks
- Drop target handling: `dropTargetId`, `onDragOver`, `onDragLeave`, `onDrop`
- Pulse animation: `pulsingId`
- Collection CRUD: create, rename, delete, colour change callbacks
- Subcollection CRUD: create, rename, delete callbacks
- `mode` — to control which interactions are available

Key rendering pattern for each collection row:

```tsx
<div
  className={cn(
    'relative overflow-hidden rounded-md',
    isActive && 'bg-[hsl(var(--tone-accent-100))]',
    isDrop && 'animate-drop-pulse',
    isPulsing && 'animate-drop-pulse',
  )}
  style={{ borderLeft: `3px solid ${COLLECTION_COLOUR_HEX[coll.colour]}` }}
>
  {/* Collection row */}
  <div className="group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm">
    <span className="flex-1 truncate">{coll.name}</span>
    <span className="text-xs text-muted-foreground">{coll.publication_count}</span>
    {/* Three-dot menu button */}
    {/* Chevron ▶/▼ */}
  </div>
  {/* Expanded subcollections */}
  {isExpanded && (
    <div className="pb-1 px-2 ml-2">
      {subs.map(sub => (
        <div
          style={{ borderLeft: `2px solid ${COLLECTION_COLOUR_HEX[coll.colour]}40` }}
          className="rounded px-2 py-1.5 text-sm"
        >
          {sub.name}
        </div>
      ))}
      {/* + Add subcollection link */}
    </div>
  )}
</div>
```

Write the full component following this structure. Include:
- Inline create form for new collections (with auto-assigned colour bar)
- Inline rename for collections (house-input + save/cancel buttons)
- Inline rename for subcollections (same pattern)
- Three-dot menu for collections (rename, change colour, delete)
- Colour picker popover (reuse existing `ColourPicker` — move it to this file or import)
- "All papers" entry when a collection is selected in Browse mode
- Empty state: "No collections yet" + "Create your first collection" button

- [ ] **Step 2: Move `ColourPicker` and `CollectionMenu` to the new sidebar file**

These small components are only used in the sidebar, so they should live alongside it. Move them from `CollectionsViewport.tsx` to the top of `CollectionSidebar.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/collections/CollectionSidebar.tsx
git commit -m "feat(collections): add tree sidebar with colour bars and expand/collapse"
```

---

## Task 7: Refactor CollectionsViewport to Use New Components

**Files:**
- Modify: `frontend/src/components/collections/CollectionsViewport.tsx`

This is the integration task. Replace the inline `CollectionSidebar`, `OrganiseView`, and `BrowseView` with the extracted components.

- [ ] **Step 1: Update imports**

Replace the inline component definitions with imports from the new files:

```typescript
import { CollectionSidebar } from './CollectionSidebar'
import { PublicationCard } from './PublicationCard'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { autoAssignColour, type ViewportMode, type PubFilter } from './collections-utils'
import { movePublicationSubcollection } from '@/lib/collections-api'
```

- [ ] **Step 2: Add new state variables**

Add to the main `CollectionsViewport` component:

```typescript
// expand/collapse tree
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

// subcollections cache (lazy loaded)
const [subcollectionsMap, setSubcollectionsMap] = useState<Map<string, SubcollectionPayload[]>>(new Map())

// drop pulse animation
const [pulsingId, setPulsingId] = useState<string | null>(null)

// delete confirmation
const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'collection' | 'subcollection'; id: string; name: string; count: number; parentId?: string } | null>(null)
```

- [ ] **Step 3: Add subcollection cache callback**

```typescript
const handleSubcollectionsFetched = useCallback((collectionId: string, subs: SubcollectionPayload[]) => {
  setSubcollectionsMap((prev) => {
    const next = new Map(prev)
    next.set(collectionId, subs)
    return next
  })
}, [])
```

- [ ] **Step 4: Update handleDrop to include pulse animation**

Modify the existing `handleDrop` to set `pulsingId` on success:

```typescript
const handleDrop = useCallback(async (collectionId: string, subcollectionId?: string | null) => {
  setDropTargetId(null)
  if (!dragWorkId) return
  try {
    if (subcollectionId) {
      await addPublicationsToCollection(collectionId, [dragWorkId])
      // TODO: also assign to subcollection if needed
    } else {
      await addPublicationsToCollection(collectionId, [dragWorkId])
    }
    const targetId = subcollectionId || collectionId
    setPulsingId(targetId)
    setTimeout(() => setPulsingId(null), 700)
    const coll = collections.find((c) => c.id === collectionId)
    setToast(`Added to ${coll?.name || 'collection'}`)
    await Promise.all([refreshCollections(), refreshPubCollections(dragWorkId)])
  } catch {
    setToast('Failed to add publication')
  }
  setDragWorkId(null)
}, [dragWorkId, collections, refreshCollections, refreshPubCollections])
```

- [ ] **Step 5: Update handleCreateCollection to use auto-assign colour**

```typescript
const handleStartCreateCollection = useCallback(() => {
  setNewCollectionColour(autoAssignColour(collections))
  setCreatingCollection(true)
}, [collections])
```

- [ ] **Step 6: Add handleMoveToSubcollection**

```typescript
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
```

- [ ] **Step 7: Update delete handlers to use confirmation dialog**

Replace direct delete calls with confirmation flow:

```typescript
const handleRequestDeleteCollection = useCallback((id: string) => {
  const coll = collections.find((c) => c.id === id)
  if (!coll) return
  setDeleteConfirm({
    type: 'collection',
    id,
    name: coll.name,
    count: coll.publication_count,
  })
}, [collections])

const handleConfirmDelete = useCallback(async () => {
  if (!deleteConfirm) return
  try {
    if (deleteConfirm.type === 'collection') {
      await deleteCollection(deleteConfirm.id)
      if (selectedCollectionId === deleteConfirm.id) setSelectedCollectionId(null)
      await refreshCollections()
    } else {
      if (deleteConfirm.parentId) {
        await deleteSubcollection(deleteConfirm.parentId, deleteConfirm.id)
        // refresh subcollections cache
        const subs = await fetchSubcollections(deleteConfirm.parentId).catch(() => [] as SubcollectionPayload[])
        handleSubcollectionsFetched(deleteConfirm.parentId, subs)
      }
    }
  } catch {
    setToast(`Failed to delete ${deleteConfirm.type}`)
  }
  setDeleteConfirm(null)
}, [deleteConfirm, selectedCollectionId, refreshCollections, handleSubcollectionsFetched])
```

- [ ] **Step 8: Remove old inline OrganiseView, BrowseView, CollectionSidebar, CollectionMenu, ColourPicker, Toast**

Delete the old inline component definitions. Keep `Toast` in the viewport file (it's small and viewport-specific). Replace the render body with:

```tsx
<div className="flex flex-1 min-h-0 overflow-hidden">
  <CollectionSidebar
    collections={collections}
    mode={mode}
    expandedIds={expandedIds}
    setExpandedIds={setExpandedIds}
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
    /* collection CRUD props */
    creatingCollection={creatingCollection}
    onStartCreateCollection={handleStartCreateCollection}
    /* ... remaining CRUD props ... */
    onRequestDeleteCollection={handleRequestDeleteCollection}
  />
  {/* Main content panel */}
  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
    {mode === 'organise' ? (
      /* Organise toolbar + PublicationCard list */
    ) : (
      /* Browse empty states or PublicationCard list */
    )}
  </div>
</div>

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
```

- [ ] **Step 9: Add actionable empty states**

In the main content panel, replace plain text empty states:

```tsx
{/* Browse: no collection selected */}
{!selectedCollectionId && (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
    <p>Select a collection from the sidebar to browse its publications.</p>
  </div>
)}

{/* Browse: collection selected but empty */}
{selectedCollectionId && browsePubs.length === 0 && (
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
)}

{/* Organise: all collected */}
{pubFilter === 'uncollected' && filteredWorks.length === 0 && !searchQuery && (
  <div className="text-center text-sm text-muted-foreground py-12">
    All publications are in at least one collection.
  </div>
)}
```

- [ ] **Step 10: Wire up Browse mode collection creation**

In the `CollectionSidebar` props, pass actual `creatingCollection` state in Browse mode instead of no-ops. The `handleStartCreateCollection` callback is already mode-independent.

- [ ] **Step 11: Remove the old separate subcollection panel**

The `BrowseView` previously rendered a `w-[185px]` subcollection panel. This is eliminated — subcollections now render inside the sidebar tree.

- [ ] **Step 12: Update subcollection loading**

Replace the old `useEffect` that loaded subcollections only in Browse mode with lazy loading via `handleSubcollectionsFetched`. Remove the old `subcollections` state variable — use `subcollectionsMap` instead.

- [ ] **Step 13: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 14: Verify the dev server renders**

Run: `cd frontend && npm run dev`
Open the collections viewport and verify:
- Sidebar shows colour bars instead of dots
- Collections expand/collapse with chevron
- Subcollections appear inline when expanded
- "+" button appears in both modes
- Publication cards have "+" button on hover (Organise)
- Browse cards have "Move to" button
- Delete shows confirmation dialog
- Empty states have CTAs
- Drop pulse animation works

- [ ] **Step 15: Commit**

```bash
git add frontend/src/components/collections/CollectionsViewport.tsx
git commit -m "feat(collections): refactor viewport to use extracted components with all v2 improvements"
```

---

## Task 8: Cleanup and Final Polish

**Files:**
- Modify: `frontend/src/components/collections/CollectionsViewport.tsx` (remove dead code)
- Delete: `frontend/src/pages/profile-collections-page.tsx` (deprecated in v1, never used)

- [ ] **Step 1: Remove deprecated page**

Delete `frontend/src/pages/profile-collections-page.tsx` if it exists. It was created during v1 then deprecated when collections moved to the Sheet viewport.

- [ ] **Step 2: Remove any dead imports or unused state variables**

Scan `CollectionsViewport.tsx` for unused imports (e.g., `FolderPlus` if moved to sidebar). Clean up.

- [ ] **Step 3: Verify TypeScript compiles clean**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Verify the dev server renders correctly**

Run: `cd frontend && npm run dev`
Full end-to-end check of all 10 improvements.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(collections): cleanup deprecated page and dead code"
```

# Collections Viewport v2 — Design Improvements

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Design and functionality improvements to the existing collections viewport in the publications library.

## Context

The collections system (v1) is functional but has design polish gaps and missing functionality. This spec covers 10 targeted improvements that bring it up to production quality.

## 1. Sidebar: Colour Bar + Expandable Tree

**Current:** Flat list with colour dots and a separate subcollection panel in Browse mode.

**New:** Each collection row has a **left colour bar** (3px, full height of the row) instead of a dot. Collections are expandable/collapsible:

- A **chevron on the right** (▶/▼) indicates expand state.
- Clicking the collection row or chevron toggles expansion.
- When expanded, **subcollections nest inline** below the parent, indented, with a **lighter tinted left bar** of the same colour family.
- The selected subcollection's tinted bar is more opaque than unselected siblings.
- When expanded, a small **"+ Add subcollection"** action link appears at the bottom of the subcollection list (replaces the old panel's FolderPlus button).

**Impact:** The separate subcollection panel (`w-[185px]` in Browse mode) is eliminated. Subcollections are always visible in the sidebar tree when a collection is expanded. This simplifies the layout to: sidebar + main content panel.

**Expand/collapse state:** Stored in component state only (a `Set<string>` of expanded collection IDs). Does not persist across page reloads or mode switches — resets to all-collapsed. This keeps it simple; persistence can be added later if users request it.

**Interaction:**
- In **Organise mode:** Expanding a collection shows its subcollections as drop targets — you can drag a paper onto a specific subcollection.
- In **Browse mode:** Clicking a collection shows all its papers. Clicking a subcollection filters to that subcollection's papers.

**Data fetching:** Subcollections are loaded lazily — fetched when a collection is first expanded. Once fetched, they are cached in component state for the session. This avoids loading subcollections for all collections upfront. A `subcollectionsMap: Map<string, SubcollectionPayload[]>` holds the cached data.

## 2. Click-to-Add via "+" Button

**Current:** Drag-and-drop is the only way to add a publication to a collection in Organise mode.

**New:** Each publication card in **Organise mode** shows a small **"+" button on hover** (right side of the card). Clicking it opens a **dropdown listing all collections**. Each collection entry can be expanded inline to show its subcollections (fetched on-demand, same lazy strategy as item 1).

- The dropdown shows collection names with their colour bars.
- Collections the paper already belongs to are indicated with a checkmark.
- Clicking a collection/subcollection adds the paper there and dismisses the dropdown.
- Dropdown dismisses on click-outside.

**Browse mode:** The "+" button does not appear on Browse mode cards. Browse mode cards have a "Move to" action instead (see item 8).

**Subcollection data for the dropdown:** Uses the same `subcollectionsMap` cache from item 1. If subcollections haven't been loaded for a collection yet, they are fetched when the user expands that collection in the dropdown.

## 3. Auto-Assign Colours on Creation

**Current:** A tiny colour dot that cycles on click during collection creation. Easy to miss.

**New:** When creating a new collection, the system **auto-assigns the next unused colour** from the palette. No colour picker is shown during creation. The left colour bar on the inline create input previews the assigned colour.

Users can change the colour later via the three-dot menu → "Change colour" → colour picker popover (existing functionality, unchanged).

**Colour assignment logic (client-side):** Before showing the create input, scan the existing `collections` array and find which colours from `ALL_COLOURS` are not yet in use. Pick the first unused colour. If all 10 are used, pick the least-used colour (or just cycle from the start). This runs client-side since the colour needs to be previewed on the inline input's colour bar before the create request is sent. The chosen colour is sent as the `colour` parameter in the `createCollection` API call (existing parameter, no backend change needed).

## 4. Delete Confirmation Dialog

**Current:** Deleting a collection fires immediately with no confirmation.

**New:** Destructive actions on **collections and subcollections** show a **confirmation dialog** before proceeding:

- **Delete collection:** "Delete 'Collection Name'? This will remove N publications from this collection. This cannot be undone."
- **Delete subcollection:** "Delete 'Subcollection Name'? Publications will remain in the parent collection."

**Removing a single publication** from a collection does **not** require confirmation — this is a low-stakes action and requiring a dialog would create friction during batch organising. The existing toast notification ("Removed from Collection Name") is sufficient feedback.

Dialog uses the existing Radix AlertDialog pattern with a cancel and confirm button. Confirm button is styled destructive (red).

## 5. Actionable Empty States

**Current:** Plain grey text ("No publications in this collection yet", "Select a collection to browse").

**New:** Text with a **call-to-action button/link**:

- **No collections yet (sidebar):** "No collections yet" + button: "Create your first collection" (triggers the inline create form)
- **No publications in collection (Browse):** "No publications in this collection yet" + button: "Switch to Organise to add papers" (switches mode to Organise)
- **Select a collection (Browse, nothing selected):** "Select a collection from the sidebar to browse its publications."
- **No search results (Organise):** "No publications match your search." (no CTA needed, just clear the search)
- **All collected (Organise, uncollected filter):** "All publications are in at least one collection." (positive message, no CTA)

No illustrations — just text and a single actionable element where appropriate.

## 6. Subcollection Rename

**Current:** Subcollections can only be created and deleted. No rename.

**New:** Subcollections support **inline rename** using the same pattern as collection rename:

- Three-dot menu or double-click on the subcollection name triggers rename mode.
- An inline input appears with the current name, plus save (✓) and cancel (✗) action buttons using `house-collaborator-action-icon-save` / `house-collaborator-action-icon-discard` classes.
- Enter to save, Escape to cancel.

No independent colour for subcollections (they inherit the parent's colour, tinted lighter). No reorder.

**Backend:** The `PATCH /v1/collections/{collection_id}/subcollections/{subcollection_id}` endpoint already supports renaming. The `updateSubcollection` API client function already exists. Only frontend changes needed.

## 7. "+" Button in Both Modes

**Current:** The "+" create collection button only appears in Organise mode's sidebar.

**New:** The "+" button appears in the sidebar header in **both Organise and Browse modes**. The sidebar component already accepts `creatingCollection` state — just wire it up in Browse mode instead of passing no-ops.

## 8. Move Publications Between Subcollections

**Current:** No way to move a paper between subcollections within Browse mode.

**New:** Two interaction methods (consistent with the dual pattern established in item 2):

- **Drag:** In Browse mode, drag a publication card onto a subcollection entry in the sidebar tree to move it there.
- **Button/menu:** Each publication card in Browse mode shows a small "Move to" icon button on hover. Clicking opens a dropdown of subcollections within the current collection. The dropdown includes a "No subcollection" / "Top level" option for moving a paper out of a subcollection back to the collection root.

**Publications with `subcollection_id = null`:** These are at the collection's top level. The "Move to" dropdown appears for them too, listing all subcollections. Selecting one assigns the paper to that subcollection.

**Backend — new endpoint:**

```
PATCH /v1/collections/{collection_id}/memberships/{membership_id}/move
Body: { "subcollection_id": "<id>" | null }
```

This updates the `subcollection_id` on the existing `CollectionMembership` row. Preserves the `membership_id` and `sort_order`. Returning the updated membership.

**Service function:** `move_publication_subcollection(session, user_id, collection_id, membership_id, target_subcollection_id)` — validates ownership, validates the target subcollection belongs to the same collection (or is null), updates the row.

**API client function:** `movePublicationSubcollection(collectionId, membershipId, subcollectionId)` added to `collections-api.ts`.

## 9. Drop Feedback — Pulse Animation

**Current:** No visual feedback when a paper is successfully dropped onto a collection (only a toast).

**New:** On successful drop, the **target row briefly pulses** with a green/positive highlight that fades out over ~600ms. This applies to both **collection rows and subcollection rows** in the sidebar tree. Combined with the existing toast notification.

Implementation: Add a CSS animation class (`animate-drop-pulse`) that applies a background-color transition from `hsl(var(--tone-positive-100))` to transparent. Apply the class via a `pulsingId` state variable, clear it after the animation ends (via `onAnimationEnd` or a timeout).

```css
@keyframes drop-pulse {
  0% { background-color: hsl(var(--tone-positive-100)); }
  100% { background-color: transparent; }
}
.animate-drop-pulse {
  animation: drop-pulse 600ms ease-out;
}
```

## 10. No Hover Preview on Publication Cards

Publication cards remain clean — title, journal, year, and colour dots for collection membership. No additional metadata on hover. Click to open the reader for full details.

## Technical Notes

### Files to modify

- `frontend/src/components/collections/CollectionsViewport.tsx` — Major restructuring: sidebar tree (item 1), publication card (item 2), confirmation dialog (item 4), empty states (item 5), subcollection rename (item 6), move between subcollections (item 8).
- `frontend/src/index.css` — New animation keyframe for drop pulse (item 9).
- `frontend/src/lib/collections-api.ts` — New `movePublicationSubcollection` function (item 8).
- `src/research_os/api/app.py` — New `PATCH /v1/collections/{collection_id}/memberships/{membership_id}/move` endpoint (item 8).
- `src/research_os/services/collection_service.py` — New `move_publication_subcollection` service function (item 8).
- `src/research_os/api/schemas.py` — New `MovePublicationRequest` and response schema (item 8).

### Component decomposition

The `CollectionsViewport.tsx` file is already ~1200 lines. With these additions, extract into:

- `CollectionSidebar.tsx` — Tree logic, expand/collapse, drop targets, subcollection inline create/rename
- `PublicationCard.tsx` — Drag handle, "+"/move buttons, dropdown
- `ConfirmDeleteDialog.tsx` — Reusable confirmation dialog
- `CollectionDropdown.tsx` — Shared dropdown between "+" add (Organise) and "Move to" (Browse)

### Design tokens

All new UI elements use the existing house style system:
- Inputs: `house-input` class
- Action buttons: `house-collaborator-action-icon` + modifier classes
- Tool buttons: `house-section-tool-button`
- Menu items: `hover:bg-[hsl(var(--tone-accent-100))]` pattern
- Positive feedback: `hsl(var(--tone-positive-*))` scale
- Destructive: `text-destructive`, `hover:text-destructive` tokens

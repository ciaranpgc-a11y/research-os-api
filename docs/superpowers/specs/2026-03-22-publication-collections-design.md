# Publication Collections System — Design Spec

## Overview

A collections system for the AxiomOS publication library that allows researchers to organise their publications into collections and subcollections. Collections provide a way to group publications by research theme, project, or purpose — similar to playlists for papers.

## Entry Point

A third toggle button **"My collections"** alongside the existing "My publications" and "My journals" toggles in the publication library page header. Clicking it opens a full-page collections viewport (not a drilldown sheet).

**Routing:** The collections viewport is rendered as a new route `/profile/publications/collections` rather than an additional mode within the existing page component (which is already 10,000+ lines). The "My collections" toggle navigates to this route.

## Two Modes

The collections viewport has two modes, toggled via tabs ("Organise" / "Browse") below the page header.

### Organise Mode

Purpose: add and remove publications from collections.

**Layout:**
- **Left panel (230px):** Collection list with colour dots, counts, and a "+" button to create new collections. Each collection row is a drop target.
- **Right panel (flex):** Full publication list with drag handles, searchable. Each card shows title, journal, year, citations, and small colour dot badges indicating which collections it belongs to.

**Interactions:**
- Drag a publication card from the right panel onto a collection in the left panel to add it
- Multi-select publications (shift-click for range, ctrl/cmd-click for individual) then drag the group onto a collection, or use a right-click "Add to collection..." context menu
- Filter toggle at top: "All publications" / "Uncollected" (papers with zero CollectionMembership rows)
- Search box to find specific papers
- Publications can belong to multiple collections (multi-membership)
- Adding a paper to a collection does not remove it from the "All publications" view — it adds a reference
- Click a colour dot badge on a publication card to remove it from that collection (with confirmation tooltip)
- Right-click a publication card → "Remove from [collection]" to remove specific membership
- For large libraries (500+ papers), the publication list uses virtual scrolling for performance

### Browse Mode

Purpose: view and navigate organised collections.

**Layout:**
- **Left panel (230px):** Collection list with colour dots (same as Organise mode). Drag to reorder collections in the sidebar.
- **Middle panel (185px):** Subcollection list for the selected collection, showing "All papers" plus any subcollections with counts. "All papers" shows every publication in the collection including those in subcollections (distinct count). Includes "+ Add subcollection" link.
- **Right panel (flex):** Publications in the selected collection/subcollection, with drag handles for reordering.

**Interactions:**
- Click a collection in the left panel to select it and show its subcollections
- Click a subcollection in the middle panel to filter the right panel
- Drag to reorder publications within a collection
- Drag publications between subcollections within the middle panel
- Click a publication to open the existing publication drilldown sheet (same as the library view)
- Right-click a publication → "Remove from collection" to remove it

## Collections Data Model

### Collection
- `id` — UUID primary key
- `user_id` — foreign key to User (owner)
- `name` — string, required
- `colour` — string, one of a fixed palette (~10-12 colours)
- `sort_order` — integer, position in the sidebar
- `created_at` / `updated_at` — timestamps

### Subcollection
- `id` — UUID primary key
- `collection_id` — foreign key to Collection (parent), `ondelete=CASCADE`
- `name` — string, required
- `sort_order` — integer, position within the parent
- `created_at` / `updated_at` — timestamps

### CollectionMembership
- `id` — UUID primary key
- `collection_id` — foreign key to Collection, **NOT NULL**, `ondelete=CASCADE`
- `subcollection_id` — foreign key to Subcollection (nullable — NULL means "in the collection but not in any specific subcollection"), `ondelete=CASCADE`
- `work_id` — foreign key to Work (the publication), `ondelete=CASCADE`
- `sort_order` — integer, custom order within the collection/subcollection
- `created_at` — timestamp

**Constraints:**
- `UNIQUE(collection_id, subcollection_id, work_id)` — prevents duplicate membership
- `collection_id` is always populated; querying "all papers in collection X" is a single `WHERE collection_id = X` (deduplicated by `work_id`)
- A publication can belong to multiple collections
- A publication can be at the collection level and/or in specific subcollections
- Two levels of nesting maximum: Collection → Subcollection
- Deleting a collection cascades to subcollections and memberships but does not delete the publications (Work records)
- Deleting a subcollection cascades to memberships that reference it
- Deleting a Work cascades to memberships

## Collection Management

### Create Collection
- Click "+" button in the sidebar header
- Inline text field appears at the bottom of the list
- Type name, select colour from a small palette popover, press Enter
- Default colour assigned if none selected

### Create Subcollection
- Click "+ Add subcollection" in the subcollection panel (Browse mode)
- Inline text field appears, type name, press Enter
- Subcollections do not have independent colours — they inherit from the parent

### Rename
- Right-click or three-dot menu (···) on a collection/subcollection → "Rename"
- Name becomes editable inline

### Delete
- Right-click or three-dot menu → "Delete"
- Confirmation prompt: "Delete collection? Papers will not be removed from your library."
- Removes collection, its subcollections, and all memberships

### Change Colour
- Right-click or three-dot menu → "Change colour"
- Small palette popover appears

### Reorder Collections
- Drag collections in the sidebar to reorder them (Browse mode)
- Uses the same `sort_order` field as publications

## Visual Indicators

### In the Organise View
- Each publication card shows small colour dot badges for each collection it belongs to
- Colour dots appear between the title area and citations count
- Drop target collections highlight with a dashed indigo border during drag-over

### In the Library Table (My Publications)
- No changes to the existing library table — collections are a separate organisational layer

## Colour Palette

Fixed palette of 10-12 colours, chosen to be distinguishable and work well at small sizes:

1. Indigo (`#6366f1`)
2. Amber (`#f59e0b`)
3. Emerald (`#10b981`)
4. Red (`#ef4444`)
5. Violet (`#8b5cf6`)
6. Sky (`#0ea5e9`)
7. Pink (`#ec4899`)
8. Teal (`#14b8a6`)
9. Orange (`#f97316`)
10. Slate (`#64748b`)

## API Endpoints

```
GET    /v1/collections                                              — list user's collections with distinct publication counts (including subcollections)
POST   /v1/collections                                              — create collection { name, colour }
PATCH  /v1/collections/{id}                                         — update name, colour, sort_order
DELETE /v1/collections/{id}                                         — delete collection (cascades)
PATCH  /v1/collections/reorder                                      — reorder collections { ordered_ids: [...] }

GET    /v1/collections/{id}/subcollections                          — list subcollections with counts
POST   /v1/collections/{id}/subcollections                          — create subcollection { name }
PATCH  /v1/collections/{id}/subcollections/{sid}                    — update subcollection name, sort_order
DELETE /v1/collections/{id}/subcollections/{sid}                    — delete subcollection (cascades)

GET    /v1/collections/{id}/publications                            — list publications in collection (all, deduplicated)
POST   /v1/collections/{id}/publications                            — add publication(s) { work_ids: [...] }
DELETE /v1/collections/{id}/publications/{wid}                      — remove publication from collection (and all its subcollections)
PATCH  /v1/collections/{id}/publications/reorder                    — reorder { ordered_work_ids: [...] }

GET    /v1/collections/{id}/subcollections/{sid}/publications       — list publications in subcollection
POST   /v1/collections/{id}/subcollections/{sid}/publications       — add publication(s) to subcollection { work_ids: [...] }
DELETE /v1/collections/{id}/subcollections/{sid}/publications/{wid} — remove publication from subcollection
PATCH  /v1/collections/{id}/subcollections/{sid}/publications/reorder — reorder within subcollection

GET    /v1/publications/{id}/collections                            — list collections a publication belongs to
```

### Reorder Request Body

All reorder endpoints accept: `{ "ordered_ids": ["id1", "id2", "id3", ...] }` — a complete ordered list that replaces the current sort_order values. This is the simplest model for drag-and-drop UIs with optimistic updates.

### Batch Add Request Body

All publication add endpoints accept: `{ "work_ids": ["id1", "id2", ...] }` — supports both single and multi-select add operations. Returns the list of created memberships. Silently skips duplicates (idempotent).

## Drag-and-Drop Behaviour

### Organise Mode — Adding to Collections
- Drag starts on the grip handle (⠿) of a publication card (or a multi-selected group)
- All collection items in the sidebar become drop targets
- On drag-over, the target collection highlights (dashed border, light blue background)
- On drop: publication(s) added to the collection, toast notification appears, colour dot badge(s) added to the card(s)
- If already in the collection, silently skip (no duplicate) — toast says "Added to [collection]" regardless
- On network failure: revert the optimistic UI update, show error toast

### Browse Mode — Reordering
- Drag starts on the grip handle of a publication card within a collection
- Cards can be reordered by dropping between other cards (insertion indicator line)
- Cards can be dragged onto subcollection names in the middle panel to move between subcollections
- On network failure: revert to previous order, show error toast

## Empty States

### No Collections Yet
- Centred message: "No collections yet"
- Hint: "Create your first collection to start organising your research"
- Prominent "Create collection" button

### Empty Collection
- Centred message: "No papers in this collection"
- Hint: "Switch to Organise mode to add publications"

### Uncollected Filter — All Organised
- Centred message: "All papers organised"
- Hint: "Every publication belongs to at least one collection"

## Prototype

A standalone HTML prototype with full working drag-and-drop, both Organise and Browse modes, filter toggle, and dummy publication data is located at:
`.superpowers/brainstorm/15684-1774184218/collections-full-mockup.html`

## Out of Scope (v1)

- Sharing collections with collaborators
- Exporting a collection as a bibliography
- Smart/auto collections based on filters
- Collection descriptions or notes
- Icons for collections (colour dots only)
- Keyboard drag-and-drop alternatives (accessibility)
- Drag from the library table view directly (use Organise mode instead)

# Story: Workspaces Hub v2 (Left Navigation + Faster Workspace Access)

## Status

Draft

## Problem

The current Workspaces page is a flat list with good baseline controls, but it does not scale into a workspace hub model. Upcoming needs like collections, archived workspaces, and import flow require durable navigation, not only list filters.

## Outcome

Ship a Workspaces Hub v2 that introduces a left navigation rail for persistent workspace buckets while keeping top controls focused on search/filter/sort/action within the selected bucket.

## User Story

As a researcher managing many workspaces, I want clear bucket-based navigation and faster list interactions so I can quickly find, open, and maintain active work without UI friction.

## Scope

In scope:

- Add a left navigation rail on desktop, collapsible.
- Add a mobile drawer version of the left navigation.
- Keep top controls for search, temporary filters, view mode, and actions.
- Improve table/card interaction and information hierarchy.
- Add import workspace action in header actions.
- Improve empty states and loading states.

Out of scope (this story):

- Backend implementation for shared workspaces.
- Backend implementation for collections CRUD.
- Full import pipeline implementation (UI entry point only if backend is not ready).

## UX Specification

### IA Split

- Left rail = persistent navigation (bucket selection).
- Top controls = temporary filtering and sorting within selected bucket.

### Left Rail (Desktop)

Sections:

- All
- Pinned
- Shared
- Collections (expandable list when data exists)
- Archived

Behavior:

- Show count badges per bucket.
- Show only data-backed collections.
- If no collections exist, show a simple "No collections yet" helper row.
- Collapsible rail with icon-only compact state.

### Left Rail (Mobile)

- Open as a sheet/drawer from a nav button.
- Same bucket structure as desktop.
- Active bucket is clearly indicated.
- Drawer closes on bucket selection.

### Header Actions

- Primary CTA: `Create workspace`
- Secondary CTA: `Import workspace`
- Move workspace naming into create flow (modal or inline after click), reducing header clutter.

### List and Interaction Improvements

- Workspace rows/cards are fully clickable for open action.
- Context menu (`...`) remains for secondary actions: rename, archive/restore, delete.
- Quick filter chips above list: `Pinned`, `Active`, `Needs review` (mapped to health/status logic).
- Default grouping in list view:
  - Pinned section first
  - All workspaces section second
- Visual hierarchy:
  - Workspace name as primary
  - Stage/updated metadata as secondary
  - Status and pills as tertiary

### States

- Loading: skeleton rows/cards.
- Empty bucket: tailored message and CTA (example: archived empty, no search matches, no workspaces yet).
- No matches: preserve current bucket context and show clear reset action.

## Acceptance Criteria

1. A persistent left rail is visible on desktop workspaces page with buckets: All, Pinned, Shared, Collections, Archived.
2. The left rail is collapsible and remains usable in collapsed mode.
3. On mobile, the same navigation appears in a drawer and supports bucket switching.
4. `Create workspace` remains the only primary action in the header; `Import workspace` is secondary.
5. Workspace create flow no longer requires persistent inline name input in the header.
6. Table rows and cards open workspace on click/tap, excluding explicit secondary action targets.
7. Workspace context menu still supports rename, archive/restore, and delete.
8. Quick chips for `Pinned`, `Active`, and `Needs review` apply in conjunction with active bucket.
9. List view can render `Pinned` and `All workspaces` grouped sections when relevant.
10. Empty and loading states are implemented for each major bucket/list mode.
11. Keyboard and screen-reader support exists for left rail, drawer, chips, and row actions.
12. Existing sorting and table/cards toggle continue to work within selected bucket.

## Engineering Notes

- Suggested component split:
  - `workspaces-left-rail.tsx`
  - `workspaces-mobile-drawer.tsx`
  - `workspace-list-toolbar.tsx`
  - `workspace-list-sections.tsx`
- Keep current store shape; add derived selectors for bucket counts and grouped sections.
- Gate unfinished buckets (Shared/Collections) behind data availability to avoid dead-end UI.
- Reuse existing tokens/components to stay compliant with `docs/design-governance.md`.

## QA Checklist

- Desktop: expanded/collapsed rail, all buckets, table/cards, sorting, menu actions.
- Mobile: drawer open/close, bucket selection, list actions.
- Accessibility: tab order, focus return on drawer close, ARIA labels on bucket buttons and menu actions.
- Regression: workspace open, rename, pin/unpin, archive/restore, delete, and create.

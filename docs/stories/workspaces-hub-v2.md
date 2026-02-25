# Story: Workspaces Home v2 (Keep Home Left Side Blank)

## Status

Draft

## Problem

The current Workspaces page is a flat list with good baseline controls, but it needs faster list interactions and clearer structure as features expand. The workspace home page and the in-workspace page have different navigation needs, so they should not share the same left bar pattern yet.

## Outcome

Ship a Workspaces Home v2 that improves list speed and clarity while keeping the home page left area blank for now. Preserve the existing left navigator behavior for individual workspace pages.

## User Story

As a researcher managing many workspaces, I want faster list interactions and clear workspace status cues so I can quickly find, open, and maintain active work.

## Scope

In scope:

- Keep workspace home left area intentionally blank for now.
- Keep top controls for search, temporary filters, view mode, and actions.
- Improve table/card interaction and information hierarchy.
- Add import workspace action in header actions.
- Improve empty states and loading states.

Out of scope (this story):

- New home-page left navigation model (Collections/Shared rail).
- Backend implementation for shared workspaces.
- Backend implementation for collections CRUD.
- Full import pipeline implementation (UI entry point only if backend is not ready).

## UX Specification

### Navigation Decision

- Workspace home: no left bar for now; keep the left side blank.
- Individual workspace pages: keep existing left navigator unchanged.
- Bucketing remains list-level via top controls/chips until a dedicated home-nav design is ready.

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

1. Workspace home page does not introduce the in-workspace left navigator pattern.
2. Existing individual-workspace left navigator behavior is unchanged.
3. `Create workspace` remains the only primary action in the header; `Import workspace` is secondary.
4. Workspace create flow no longer requires persistent inline name input in the header.
5. Table rows and cards open workspace on click/tap, excluding explicit secondary action targets.
6. Workspace context menu still supports rename, archive/restore, and delete.
7. Quick chips for `Pinned`, `Active`, and `Needs review` apply with existing filters.
8. List view can render `Pinned` and `All workspaces` grouped sections when relevant.
9. Empty and loading states are implemented for each major list mode.
10. Keyboard and screen-reader support exists for chips and row actions.
11. Existing sorting and table/cards toggle continue to work.

## Engineering Notes

- Suggested component split:
  - `workspace-list-toolbar.tsx`
  - `workspace-list-sections.tsx`
- Keep current store shape; add derived selectors for bucket counts and grouped sections.
- Keep room for future home-page navigation model, but do not reuse the in-workspace navigator now.
- Reuse existing tokens/components to stay compliant with `docs/design-governance.md`.

## QA Checklist

- Desktop: list controls, table/cards, sorting, menu actions.
- Mobile: list controls and list actions.
- Accessibility: tab order and ARIA labels on chips/menu actions.
- Regression: workspace open, rename, pin/unpin, archive/restore, delete, and create.

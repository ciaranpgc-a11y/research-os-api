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

## Implementation Updates

### 2026-02-25

- Added per-workspace inbox conversation text search in the header with result navigation.
- Added in-message highlight rendering for matched text and active-hit auto-scroll behavior.
- Preserved non-destructive message retention behavior while improving long-thread usability.
- Simplified Workspaces home by removing duplicate helper subtitle copy and removing left-sidebar action controls.
- Relocated `Open inbox for <workspace>` helper from the left panel to the main workspace summary row next to workspace count text.
- Standardized unread cells as always-clickable conversation links with consistent status coloring.
- Moved pin/unpin behavior into workspace menu actions and switched pinned indication to a compact green pin icon before workspace titles.
- Upgraded non-owner collaborator hover UX to styled tooltips with explicit owner/read-only guidance.
- Added a Storybook workspace navigation harness that opens populated `/w/:workspaceId/...` routes and supports in-story navigation across workspace sections.
- Added workspace-scoped backend run-context endpoint integration for Study Core (`/v1/workspaces/{workspace_id}/run-context`), removing dependency on legacy local-only run-context storage.
- Completed owner/collaborator project creation wiring from wizard bootstrap (`owner_user_id`, `collaborator_user_ids`, `workspace_id`) so a workspace run is attributed to the owner and visible to accepted collaborators.
- Updated Step 2 data-planner calls and manuscript routes to send authenticated context, aligning frontend behavior with owner/collaborator access checks.
- Extended Results page to sync uploaded assets into persisted backend Data Library while preserving local parsing and preview UX.
- Upgraded Results page content hierarchy with workspace-aware summary cards, readiness scoring, and adaptive priority actions.
- Added quality indicators for missing cells/duplicate rows and search filters for files and working tables.
- Added dedicated Storybook coverage for Results page with populated and empty data-workspace fixtures.
- Simplified the Data page to remove readiness/table-generation emphasis and focus on upload + personal library access.
- Reworked Data page layout into a right utility panel (`Data upload`, `Personal library`) and left operational pane (`Files`, `Preview`).
- Removed verbose narrative copy under the Data title and trimmed explanatory helper text to match a cleaner house-style section pattern.
- Added file-level data-library access controls with owner-managed collaborator ACLs.
- Added owner/access visibility in personal-library items and owner-only add/remove collaborator controls.
- Added per-file `Download` and `Pull to workspace` actions so persisted assets can be reused directly in workspace data preview.
- Added secured backend routes for library asset access updates and file downloads, and tightened library routes to require authenticated sessions.
- Enforced owner-only invitation creation and collaborator-management updates at API level (not only in frontend controls).
- Synced accepted author requests back into owner workspace collaborator state so collaborator banners stay accurate.
- Synced owner collaborator state updates into collaborator workspace records to keep membership/removal state coherent across accounts.
- Updated inbox message persistence to fan out encrypted message records to all workspace participants so messages survive sign-in/out for collaborators, not only senders.
- Added workspace access checks to inbox websocket and inbox data endpoints to block non-participants.
- Hardened generation-job-by-id endpoints so only project owner/collaborators can fetch/cancel/retry jobs for owned projects.
- Added a dedicated Workspaces-home `Data library` center view and left-nav item (query-routed via `view=data-library`).
- Implemented an owner/collaborator-focused library table in Workspaces home with file display, access visibility, owner-only grant/revoke controls, and download actions.
- Scoped left-nav `States` controls to Workspaces-only view so Invitations/Data library surfaces stay clean and purpose-specific.
- Added a populated Storybook `DataLibrary` permutation with mocked list/access/download library APIs to support deterministic UI validation without live backend.
- Upgraded Workspaces-home Data Library to true server-backed query/sort/pagination controls (`query`, ownership scope, sort field/direction, page, page size).
- Replaced local name-only permission add flow with directory-backed collaborator lookup and ID-resolved grant updates (`collaborator_user_ids`).
- Updated data-library API contract and frontend consumers to use metadata-rich list responses (`items`, `total`, `has_more`, paging metadata) for scale-ready navigation.
- Realigned the individual workspace `Data` page so Data actions are center-first: `Access from personal library` appears before `Upload`, with right-rail-only composition removed.

## QA Checklist

- Desktop: list controls, table/cards, sorting, menu actions.
- Mobile: list controls and list actions.
- Accessibility: tab order and ARIA labels on chips/menu actions.
- Regression: workspace open, rename, pin/unpin, archive/restore, delete, and create.

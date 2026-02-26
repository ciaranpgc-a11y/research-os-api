# Change Log

## 2026-02-26

### Admin Workspaces Module (Live Operations Control Plane v1)

- **Area:** Admin console workspace/project operations (backend API + frontend admin surface).
- **What changed:**
- Added new admin API endpoint: `GET /v1/admin/workspaces` with admin-only auth guard.
- Added workspace aggregation in `admin_service` using existing persisted entities (`projects`, `manuscripts`, `data_library_assets`, `generation_jobs`, `manuscript_snapshots`, `users`) to produce:
  - workspace ownership and member/role visibility,
  - project-level summaries and activity timestamps,
  - manuscript/data-source/storage/export counts,
  - queue/run health (active, failed, retry, status distribution, cost/token averages).
- Added new backend schema contracts for workspace member summaries, project summaries, job health, and list response payloads.
- Expanded admin endpoint tests to cover `/v1/admin/workspaces` for authentication, admin-role enforcement, and payload shape.
- Added frontend types/API integration for workspaces payloads and wired live fetch in admin data load flow.
- Upgraded admin UI `Workspaces / Projects` module from placeholder to a live surface with:
  - workspace-level metrics cards,
  - searchable workspaces index,
  - selectable workspace detail panel,
  - job/queue health card,
  - project table within selected workspace.
- Promoted Workspaces lane/status in admin module metadata to `live` + `now`.
- **Why it changed:**
- Deliver the next `Scale` module so operations can manage workspace workload, data footprint, and run reliability from the admin console without waiting for separate observability tooling.
- **Key files touched:**
- `src/research_os/services/admin_service.py`
- `src/research_os/api/schemas.py`
- `src/research_os/api/app.py`
- `tests/test_api.py`
- `frontend/src/types/impact.ts`
- `frontend/src/lib/impact-api.ts`
- `frontend/src/pages/admin-page.tsx`
- `docs/parallel-feature-delivery.md`
- `docs/stories/admin-console-operations-v1.md`
- **Verification performed:**
- `pytest tests/test_api.py -k "v1_admin_endpoints" -q`
- `npm --prefix frontend run --silent typecheck`
- `python scripts/verify_change_documentation.py`
- **Follow-up:**
- Add explicit persisted workspace runtime/event objects (queue backlog, DLQ, exports) to replace current derived/proxy metrics.
- Add owner/admin action endpoints for internal cancel/retry controls directly from admin module.

### Admin Organisations Module (Live Tenant Control Plane v1)

- **Area:** Admin console organisations/tenants module (backend API + frontend operations surface).
- **What changed:**
- Added a new admin API endpoint: `GET /v1/admin/organisations` with admin-only auth guard.
- Added organisations aggregation service in `admin_service` that derives tenant profiles from account domains and enriches each tenant with:
  - member/role activity,
  - workspace/project counts,
  - monthly tokens/tool-calls/cost trends,
  - storage footprint,
  - plan/billing/quotas/rate-limit/retention controls,
  - integration status (ORCID/OpenAlex/Zotero),
  - audited impersonation metadata.
- Added new backend schema contracts for organisations list payloads (including trend points and integration status objects).
- Expanded admin API tests to cover organisations endpoint authentication, admin-role enforcement, and payload contract shape.
- Wired frontend API/types to consume organisations payloads.
- Upgraded admin UI `Organisations (Tenants)` section from placeholder to a live module with:
  - tenant snapshot metrics,
  - searchable organisations index,
  - selectable organisation detail panel,
  - usage/cost controls, quotas, retention, and storage views,
  - feature flags and integration status cards,
  - audited impersonation control placeholder action.
- Promoted Organisations lane/status in admin module metadata to `live` + `now`.
- **Why it changed:**
- Deliver the first live scale-control tenant surface so admin operations can track margin, limits, integration posture, and org growth in one place while remaining compatible with current data model constraints.
- **Key files touched:**
- `src/research_os/services/admin_service.py`
- `src/research_os/api/schemas.py`
- `src/research_os/api/app.py`
- `tests/test_api.py`
- `frontend/src/types/impact.ts`
- `frontend/src/lib/impact-api.ts`
- `frontend/src/pages/admin-page.tsx`
- `docs/parallel-feature-delivery.md`
- `docs/stories/admin-console-operations-v1.md`
- **Verification performed:**
- `pytest tests/test_api.py -k "v1_admin_endpoints" -q`
- `npm --prefix frontend run --silent typecheck`
- `python scripts/verify_change_documentation.py`
- **Follow-up:**
- Add a persisted first-class tenant table (domain verification, billing objects, explicit feature-flag records) so organisations are no longer domain-derived.
- Add audited impersonation action/event persistence and UI event timeline.

### Admin Visibility Resilience (Link + Badge Persistence)

- **Area:** Admin visibility behavior in top bar, route guard, and profile badges.
- **What changed:**
- Added cached auth-role storage helpers in frontend session utilities.
- Updated auth API client flows (`register`, `login`, `2FA verify`, `fetchMe`, `updateMe`, `OAuth callback`, `email verification`) to persist role cache on success.
- Updated top bar to initialize admin visibility from cached role and fall back to cache when `fetchMe` fails transiently.
- Updated admin route guard to allow cached-admin fallback when session token exists but live profile lookup fails temporarily.
- Updated profile personal-details admin badge logic to use cached role fallback when user payload is temporarily unavailable.
- **Why it changed:**
- Prevent temporary API/session lookup failures from hiding admin-only UI affordances for confirmed admin sessions.
- **Key files touched:**
- `frontend/src/lib/auth-session.ts`
- `frontend/src/lib/impact-api.ts`
- `frontend/src/components/layout/top-bar.tsx`
- `frontend/src/AppRouter.tsx`
- `frontend/src/pages/profile-personal-details-page.tsx`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- **Follow-up:**
- Add a small integration test to verify admin link/badge remain visible when `fetchMe` fails after a previously confirmed admin session.

### Admin Console Navigation Infrastructure + Parallel Delivery Governance

- **Area:** Admin console UX architecture, routing, and documentation governance enforcement.
- **What changed:**
- Refactored admin console into a navigable module shell with grouped left navigation (`Command`, `Scale`, `Governance`) and deep-link section routing (`/admin/:sectionId`).
- Added explicit admin module metadata for all 12 domains (`status`: live/partial/planned and delivery `lane`: now/next/later).
- Added a parallel delivery board in the admin UI (module status/lane visibility) and section-specific infrastructure render flow.
- Updated top-bar admin shortcut to route directly to `/admin/overview`.
- Added parallel-delivery governance documentation at `docs/parallel-feature-delivery.md`.
- Added CI documentation gate script `scripts/verify_change_documentation.py` and wired it into `.github/workflows/ci.yml`.
- Updated change documentation rules to v1.2 with:
  - Rule 7 (parallel feature lane declaration),
  - Rule 8 (CI enforcement for major-change documentation).
- Added admin story record: `docs/stories/admin-console-operations-v1.md`.
- Updated `README.md` documentation rules references.
- **Why it changed:**
- Establish scalable admin operations infrastructure while core site features continue shipping in parallel.
- Prevent documentation drift by enforcing same-delivery docs updates for major code changes.
- **Key files touched:**
- `frontend/src/pages/admin-page.tsx`
- `frontend/src/AppRouter.tsx`
- `frontend/src/components/layout/top-bar.tsx`
- `.github/workflows/ci.yml`
- `scripts/verify_change_documentation.py`
- `docs/change-documentation-rules.md`
- `docs/parallel-feature-delivery.md`
- `docs/stories/admin-console-operations-v1.md`
- `README.md`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- `npm --prefix frontend run design:governance`
- `python scripts/verify_change_documentation.py`
- **Follow-up:**
- Add backend admin endpoints for non-overview/non-user domains as modules move from `planned`/`partial` to `live`.

### Data Library Storage Hardening (Build-Safe Persistence)

- **Area:** Backend data-library file persistence and recovery.
- **What changed:**
- Switched default data-library storage root from repo-relative (`./data_library_store`) to an OS user-data location outside build/repo directories via `get_data_library_root()`.
- Added legacy-file migration behavior that copies discoverable files from prior legacy roots into the stable storage root.
- Added on-read storage healing: when an asset resolves from legacy/non-primary location, it is copied into stable root and DB `storage_path` is updated.
- Added atomic writes for uploads (`.tmp` + `os.replace`) to reduce partial-write risk.
- Added coverage to verify legacy storage migration and canonical-path healing.
- **Why it changed:**
- Prevent data loss/disappearance across local builds, clean operations, and working-directory changes.
- Ensure file assets remain durable and recoverable even when prior relative storage locations are used.
- **Key files touched:**
- `src/research_os/config.py`
- `src/research_os/services/data_planner_service.py`
- `tests/test_open_access_service.py`
- **Verification performed:**
- `python -m py_compile src/research_os/config.py src/research_os/services/data_planner_service.py tests/test_open_access_service.py`
- `pytest tests/test_open_access_service.py -k "library_assets_skips_entries_with_missing_storage or migrates_legacy_storage_to_stable_root" -q`
- `pytest tests/test_api.py -k "library_asset" -q`

### Database Path Hardening (Build-Safe Persistence)

- **Area:** Core database storage path resolution.
- **What changed:**
- Replaced fallback DB URL default from relative `sqlite+pysqlite:///./research_os.db` to a stable absolute per-user app-data path (derived alongside stable data-library root).
- Added legacy DB migration copy from prior relative locations (current working directory and repo-root `research_os.db`) into stable path when stable DB is absent.
- Added sidecar copy support for SQLite `-wal` / `-shm` files during migration.
- Preserved explicit `DATABASE_URL` behavior (no override when user/env provides one).
- Added targeted regression tests for:
  - stable absolute default DB path
  - legacy relative DB copy into stable DB path
- **Why it changed:**
- Prevent apparent data disappearance across builds/restarts caused by process working-directory changes creating/reading different relative SQLite files.
- **Key files touched:**
- `src/research_os/db.py`
- `tests/test_db_storage_stability.py`
- **Verification performed:**
- `python -m py_compile src/research_os/db.py tests/test_db_storage_stability.py`
- `pytest tests/test_db_storage_stability.py -q`
- `pytest tests/test_api.py -k "library_asset" -q`

### Legacy DB Auto-Recovery When Stable DB Is Empty

- **Area:** SQLite default-path migration resilience.
- **What changed:**
- Added an additional recovery path:
  - if stable DB exists but is effectively empty,
  - and a legacy DB path contains recoverable data,
  - automatically promote legacy DB into stable path (with pre-recovery backup of stable DB).
- Added test coverage to validate this behavior.
- **Why it changed:**
- Prevent "files/data gone after build" scenarios where path migration already created an empty stable DB before legacy content could be copied.
- **Key files touched:**
- `src/research_os/db.py`
- `tests/test_db_storage_stability.py`
- **Verification performed:**
- `python -m py_compile src/research_os/db.py tests/test_db_storage_stability.py`
- `pytest tests/test_db_storage_stability.py -q`
- `pytest tests/test_api.py -k "library_asset" -q`

### Workspace Data Panel Simplification (Personal Library Only)

- **Area:** Individual workspace Data right panel.
- **What changed:**
- Removed the `Upload new dataset` card from the Data right rail.
- Simplified the access card to a single-line heading: `Access from personal library`.
- Removed the inline `Refresh` action from the access card and moved `Open personal library` onto its own row directly beneath the heading.
- Removed helper copy `Select datasets from your personal library and pull them into this workspace.` from the access card.
- Removed the personal-library sheet `Refresh` button to keep the flow focused on search and selection.
- **Why it changed:**
- Align the panel with the requested streamlined interaction model centered on library access only.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Workspace Data Sources Upload Restoration

- **Area:** Individual workspace Data right panel upload flow.
- **What changed:**
- Restored a dedicated `Upload to personal library` card in the Data sources right panel.
- Re-wired upload action to authenticated personal-library persistence (`uploadLibraryAssets`) with workspace-linked `projectId` when available.
- Kept `Access from personal library` simplified (single-line title + `Open personal library` on the next line).
- Added upload status/error messaging and retained local workspace parsing for uploaded CSV/XLSX files.
- **Why it changed:**
- Reinstate account-level upload capability after the upload block was removed during panel simplification.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Personal Library Pull UX: Remove Search + Workspace-Aware Status

- **Area:** Workspace Data right panel + Personal Library sheet interaction model.
- **What changed:**
- Removed `Search library` inputs from both the right-panel library card and the Personal Library sheet.
- Added workspace-awareness for library assets:
  - Assets already scoped to the current workspace project are shown as `In workspace`.
  - `Pull to workspace` / `Pull now` actions are disabled and relabeled to `In workspace` for those assets.
  - Selection checkboxes are disabled for already-in-workspace assets.
- Updated bulk select/pull behavior to operate only on pullable (not-yet-in-workspace) assets:
  - `Select all available (n)` reflects only pullable assets.
  - Footer selected count and `Pull selected (n)` now track only pullable selections.
- **Why it changed:**
- Align behavior with expected semantics: datasets uploaded within a workspace should be treated as already contained in that workspace, not presented as needing re-import.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Upload Data File CTA + Post-Upload Workspace Import Flow

- **Area:** Workspace Data right panel upload and import copy/interaction.
- **What changed:**
- Renamed upload card title from `Upload to personal library` to `Upload data file`.
- Updated upload behavior to validate and upload files into Personal Library first, without auto-pulling into the current workspace.
- Added post-upload rows beneath the upload CTA showing uploaded file names with per-file action:
  - `Bring into current workspace`
  - state switches to `In current workspace` once imported.
- Updated pull labels for consistency in both right-panel and sheet contexts:
  - `Pull to workspace` / `Pull now` -> `Bring into current workspace`.
- **Why it changed:**
- Match expected semantics that upload persists to library first, then explicit import controls workspace inclusion.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Personal Library Stale-Asset Recovery

- **Area:** Personal Library sheet pull/import resilience.
- **What changed:**
- Added automatic personal-library refresh whenever the sheet is opened.
- Improved stale asset handling for pull actions:
  - When an asset is no longer available, show a friendly message (no raw ID error exposure).
  - Refresh library data automatically and remove stale selections.
- Applied this behavior to both single-item import and bulk `Pull selected`.
- **Why it changed:**
- Avoid confusing `Data asset '<id>' was not found` failures when library data is stale or changed between list and action.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Data Import Filename Guard (`asset.bin` Fallback)

- **Area:** Workspace data import from Personal Library.
- **What changed:**
- Added filename normalization for downloads/imports so generic `asset.bin` (or non-data extensions) falls back to the known library asset filename.
- Applied to:
  - direct download action naming in workspace data panel
  - single-item `Bring into current workspace`
  - bulk `Pull selected`
- **Why it changed:**
- Prevent false parser failures (`asset.bin: only .csv and .xlsx are supported.`) when download headers do not include a usable data filename.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Workspace Data Main-Column Dataset Table

- **Area:** Individual workspace Data page center column.
- **What changed:**
- Added a top center section with house-token heading treatment:
  - Title: `Data`
  - Subtitle line: `Available datasets`
- Added a token-style table to list datasets currently in the workspace.
- Table columns:
  - `Dataset`
  - `Type`
  - `Sheets`
  - `Rows`
  - `Added`
- Added empty-state row when no workspace datasets are present.
- **Why it changed:**
- Provide a scalable, auditable central workspace dataset inventory while keeping right rail focused on library access/upload actions.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)

### Library Upload `project_id` Sentinel Normalization

- **Area:** Personal library upload/list API resilience for workspace Data page.
- **What changed:**
- Normalized optional `project_id` values in backend upload request parsing so `None`, `null`, and `undefined` are treated as unset.
- Added the same optional-ID normalization in data planner service methods for `upload_library_assets` and `list_library_assets`.
- Added API regression coverage to ensure sentinel `project_id` strings no longer trigger `Project '<value>' was not found.` and are handled as unscoped library operations.
- **Why it changed:**
- Prevent false project lookup errors when clients (or legacy payloads) send sentinel string values for optional project scope.
- **Key files touched:**
- `src/research_os/api/app.py`
- `src/research_os/services/data_planner_service.py`
- `tests/test_api.py`
- **Verification performed:**
- `python -m py_compile src/research_os/services/data_planner_service.py src/research_os/api/app.py tests/test_api.py`
- `pytest tests/test_api.py -k "library_asset_routes_ignore_sentinel_project_ids or v1_library_asset_routes_require_session_token" -q`
- `pytest tests/test_api.py -k "library_asset" -q`

## 2026-02-25

### Workspace Data Right-Rail + Insight Panel Removal

- **Area:** Individual workspace Data page information architecture.
- **What changed:**
- Restored the dedicated right-side Data panel layout using house-token structure (`main + right rail`).
- Renamed the page heading to `Data`.
- Kept Data action order in the right panel as `Access from personal library` first (for pulling files into the workbook), followed by `Upload`.
- Added explicit `Collapse` / `Expand` controls on the Data right panel so users can reclaim center-pane width while keeping panel access one click away.
- Switched Data right-panel desktop activation from `xl` to house `nav` breakpoint (`900px`) so the panel appears on standard laptop widths.
- Renamed right-rail framing to `Data sources` for clearer collapse/expand semantics.
- Added a house-token divider between `Access from personal library` and `Upload new dataset` sections in the right panel.
- Removed all center-console content (workspace summary badges, files list, preview table, and bottom status badges) so the Data page now uses a right-rail-first composition.
- Added `Open personal library` picker flow: users can open a dedicated library sheet, multi-select datasets, and pull selected files into the workspace in one action.
- Preserved house-token styling patterns and existing upload/personal-library behavior.
- Added reusable sample data fixtures for manual/live library upload testing:
  - `tmp/sample-datasets/4d_flow_rhc_primary.csv`
  - `tmp/sample-datasets/af_screening_cohort.csv`
  - `tmp/sample-datasets/data_quality_flags.csv`
- Added helper uploader script `scripts/upload_sample_datasets.ps1` to post sample datasets to `/v1/library/assets/upload` using a session bearer token.
- Removed `Insight & Integrity` right-rail injection from workspace and non-profile app shells.
- Added collapse/expand controls for the workspace inbox right navigation panel so users can widen the conversation area on demand.
- **Why it changed:**
- Keep Data actions in the expected right panel pattern and remove low-value Insight/Integrity UI noise from primary workflows.
- Improve reading space for long conversation threads without losing quick access to inbox navigation metadata.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- `frontend/src/components/layout/workspace-layout.tsx`
- `frontend/src/components/layout/app-shell.tsx`
- `frontend/src/pages/workspace-inbox-page.tsx`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- `npx eslint src/pages/results-page.tsx` (run from `frontend/`)
- `npx eslint src/components/layout/workspace-layout.tsx src/components/layout/app-shell.tsx` (run from `frontend/`)
- `npx eslint src/pages/workspace-inbox-page.tsx` (run from `frontend/`)
- **Follow-up:**
- Optionally replace removed right-rail space with contextual tools only when a page has high-value actions.

### Workspace Left Nav Cleanup + Manuscript Section Expansion

- **Area:** Individual workspace left navigation and manuscript section routing order.
- **What changed:**
- Removed `Create new workspace` from the individual workspace left panel selector area.
- Expanded and reordered Manuscript navigation in workspace left panel:
  - Added `Title` and `Abstract` before `Introduction`.
  - Added `References`, `Supplementary Materials`, and `Declarations` at the end.
- Extended manuscript section slug/type support and section-title mapping to include:
  - `references`
  - `supplementary-materials`
  - `declarations`
- Updated manuscript index redirects to open `Title` by default instead of `Introduction`.
- **Why it changed:**
- Keep workspace-level left navigation focused on in-project work (not project creation) and align manuscript flow with full submission structure.
- **Key files touched:**
- `frontend/src/components/layout/workspace-navigator.tsx`
- `frontend/src/types/selection.ts`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/AppRouter.tsx`
- **Verification performed:**
- `npx eslint src/components/layout/workspace-navigator.tsx src/types/selection.ts src/pages/manuscript-page.tsx src/AppRouter.tsx` (run from `frontend/`)
- `npm --prefix frontend run --silent typecheck`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Consider adding dedicated scaffold content for the three new terminal manuscript sections so first-time views are less empty.

### Workspace Ownership + Shared Inbox Hardening

- **Area:** Workspace ownership rules, collaborator propagation, inbox persistence, generation-job access control.
- **What changed:**
- Enforced owner identity on workspace creation (`owner_name` must match signed-in user).
- Enforced owner-only collaborator invitation creation on workspace invitation API.
- Enforced owner-only collaborator list edits on workspace patch API.
- Synced collaborator acceptance back to owner workspace state so accepted collaborators appear in owner collaborator banners.
- Added collaborator-state synchronization to propagate owner collaborator/removed state updates across collaborator workspace records.
- Updated workspace inbox message create flow to persist each message across all workspace participants (owner + active collaborators), so conversation history survives sign-in/out for all participants.
- Added workspace-access checks to inbox list/create/read endpoints and websocket connection handshake.
- Hardened generation-job ID endpoints (`GET /v1/generation-jobs/{job_id}`, `POST /cancel`, `POST /retry`) to enforce owner/collaborator visibility for owned projects and deny outsiders.
- **Why it changed:**
- Enforce the intended "one owner, many collaborators" model server-side and prevent collaborator privilege escalation.
- Ensure workspace inbox communication is truly shared/persisted for collaboration rather than isolated per-user cache.
- Close job-ID access gaps where unauthorized users could fetch or mutate generation jobs by ID.
- **Key files touched:**
- `src/research_os/services/workspace_service.py`
- `src/research_os/services/generation_job_service.py`
- `src/research_os/api/app.py`
- `tests/test_api.py`
- **Verification performed:**
- `python -m py_compile src/research_os/services/workspace_service.py src/research_os/services/generation_job_service.py src/research_os/api/app.py tests/test_api.py`
- `pytest tests/test_api.py -q`
- `pytest -q`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Add API coverage for collaborator removal effects on existing inbox/thread visibility.
- Consider server-side pagination/indexing for workspace inbox history at high message volume.

### Workspace Home + Inbox Refactor

- **Area:** Workspaces page, workspace inbox page, navigation, Storybook states.
- **What changed:**
- Added owner/collaborator-oriented workspace patterns and invitation-focused workspace flow updates.
- Added per-workspace inbox behavior with encryption-preserving message flow and non-destructive retention UX.
- Removed realtime connection visualization in inbox; retained clear participant online/offline indicators.
- Added dedicated `All conversations` inbox view with workspace-level searchable thread listing.
- Moved inbox subnavigation to right panel; left panel keeps a single `Inbox` item.
- Simplified right panel by removing security/status clutter and thread duplication.
- Restored main site structural heading pattern on inbox pages by adding the standard workspace top bar shell.
- **Why it changed:**
- Improve navigation clarity, reduce cognitive load, and make collaboration conversations auditable and scalable as workspace counts grow.
- **Key files touched:**
- `frontend/src/pages/workspace-inbox-page.tsx`
- `frontend/src/pages/workspace-inbox-page.stories.tsx`
- `frontend/src/pages/workspaces-page.tsx`
- `frontend/src/pages/workspaces-page.stories.tsx`
- `src/research_os/api/app.py`
- `tests/test_api.py`
- **Verification performed:**
- `npm run --silent typecheck`
- `npx eslint src/pages/workspace-inbox-page.tsx src/pages/workspace-inbox-page.stories.tsx`
- `npm run --silent build-storybook`
- backend websocket and invitation tests updated and executed during implementation cycle.
- **Follow-up:**
- Add search debouncing and server-backed pagination for very large conversation sets.
- Consider adding pinned/favorite conversations.

### Inbox Conversation Text Search

- **Area:** Per-workspace inbox conversation header and message list navigation.
- **What changed:**
- Added a right-aligned search field in the conversation header (`Conversation: <workspace name>`).
- Added in-thread text search across decrypted message bodies with highlighted matches.
- Added next/previous search navigation controls and keyboard navigation (`Enter` next, `Shift+Enter` previous).
- Added automatic scroll to the active search result while preserving newest-at-bottom behavior when search is inactive.
- **Why it changed:**
- Improve navigation ergonomics for long workspace discussions and speed up retrieval of decisions, tasks, and prior context.
- **Key files touched:**
- `frontend/src/pages/workspace-inbox-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/workspace-inbox-page.tsx`
- `npm run --silent typecheck`
- `npm run --silent build-storybook`
- **Follow-up:**
- Add optional sender/date filters in conversation search.
- Add persisted "last search per workspace" state for faster repeated reviews.

### Workspaces Home Header/Sidebar Simplification

- **Area:** Workspaces home copy and left sidebar navigation surface.
- **What changed:**
- Removed the header subtitle text `Manage, filter, and open your workspace list.`
- Removed the left sidebar `Actions` section entirely.
- Removed `Create workspace` and `Clear search` from the sidebar in both desktop and mobile left-nav variants.
- Moved `Open inbox for <workspace>` context from the left sidebar into the central workspace summary strip beside the workspace count.
- Removed the central `Open inbox for <workspace>` strip button after review.
- Updated `Unread` cells to always be clickable (including `0`) and open the workspace conversation.
- Standardized unread badges into uniform shaded boxes: yellow for `1+`, green for `0`.
- Added a green pin icon before pinned workspace names.
- Removed inline pin controls from row/card status areas and moved pin/unpin control into the `...` workspace menu.
- Replaced basic non-owner collaborator `title` hover text with styled house-tooltips and clearer read-only ownership guidance.
- Added a dedicated Storybook page that mounts real workspace routing and allows navigation across individual workspace sections with seeded data.
- **Why it changed:**
- Reduce visual noise and keep action emphasis in the main content header rather than duplicating controls in the sidebar.
- **Key files touched:**
- `frontend/src/pages/workspaces-page.tsx`
- **Verification performed:**
- `npx eslint src/pages/workspaces-page.tsx`
- `npm run --silent typecheck`
- **Follow-up:**
- Consider replacing removed sidebar actions with read-only metrics (e.g., total workspaces, archived count) for quick context.

### Documentation Governance Update

- **Area:** Documentation process rules.
- **What changed:**
- Updated `docs/change-documentation-rules.md` to `v1.1`.
- Added Rule 6 requiring an explicit, comprehensive documentation sweep when a chat/session approaches context compression.
- **Why it changed:**
- Improve audit continuity and reduce risk of losing implementation context during long, iterative delivery sessions.
- **Key files touched:**
- `docs/change-documentation-rules.md`
- `docs/change-log.md`
- **Verification performed:**
- Manual verification of rule text and changelog inclusion.
- **Follow-up:**
- Optionally enforce Rule 6 via a lightweight checklist in PR templates or release checklists.

### Workspace Ownership + Collaborator Access Wiring

- **Area:** Project/manuscript ownership model, workspace run-context API, data-planner access control.
- **What changed:**
- Completed API wiring so project/manuscript/data-planner routes resolve the signed-in requester and apply owner/collaborator access checks when present.
- Added workspace-scoped run-context endpoint: `GET /v1/workspaces/{workspace_id}/run-context`.
- Extended wizard bootstrap and project creation flows to persist `owner_user_id`, `collaborator_user_ids`, and `workspace_id`.
- Ensured planner endpoints propagate user context for library assets, profile generation, scaffold generation, and plan edits.
- Updated migration `20260225_0008` for SQLite-safe behavior by skipping `ALTER TABLE ... ADD CONSTRAINT` FK operations unsupported by SQLite.
- **Why it changed:**
- Enforce the intended ownership model (one owner, many collaborators) and enable workspace-first routing to reliably resolve the active project/manuscript context.
- **Key files touched:**
- `src/research_os/api/app.py`
- `src/research_os/services/project_service.py`
- `src/research_os/services/data_planner_service.py`
- `src/research_os/services/wizard_service.py`
- `src/research_os/api/schemas.py`
- `alembic/versions/20260225_0008_project_ownership_and_data_access.py`
- **Verification performed:**
- `pytest tests/test_api.py -q`
- `pytest tests/test_migrations.py -q`
- **Follow-up:**
- Add explicit API tests for unauthorized collaborator access on generation-job endpoints keyed by `job_id`.

### Study Core + Results Persistence Alignment

- **Area:** Study Core frontend API wiring and Results page data persistence.
- **What changed:**
- Updated Study Core API client calls to send auth headers for workspace/project-manuscript routes and data-planner routes.
- Removed legacy localStorage run-context dependency from Study Core page/Step 2 and switched to workspace-scoped run-context lookup from backend.
- Passed workspace collaborator names into wizard bootstrap to persist collaborator access during project creation.
- Updated Results page so local parsing/preview remains, while uploads are also synced to persisted backend Data Library records and surfaced in UI.
- Added persisted asset count/status indicators on Results page.
- **Why it changed:**
- Ensure workspace data survives sign-in/out and remains consistent with owner/collaborator authorization boundaries.
- **Key files touched:**
- `frontend/src/lib/study-core-api.ts`
- `frontend/src/pages/study-core-page.tsx`
- `frontend/src/components/study-core/StepContext.tsx`
- `frontend/src/components/study-core/StepPlan.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/components/study-core/StepDraftReview.tsx`
- `frontend/src/components/study-core/StepLinkQcExport.tsx`
- `frontend/src/pages/results-page.tsx`
- `frontend/src/types/study-core.ts`
- **Verification performed:**
- `npm --prefix frontend run build`
- **Follow-up:**
- Replace local-only sheet preview state with persisted server-backed preview metadata to support cross-device continuity.

### Workspace Data Section Content Upgrade

- **Area:** Workspace data page content design, quality guidance, and Storybook coverage.
- **What changed:**
- Expanded `ResultsPage` with workspace-aware data summary cards (local assets, persisted assets, working tables, readiness score).
- Added a `Data Readiness` section with explicit operational checks and progress indicator.
- Added `Priority Actions` guidance that adapts to current data quality and metadata completeness.
- Added search/filter controls for uploaded files and working tables.
- Added per-sheet/per-table quality signals for missing cells and duplicate rows.
- Added a dedicated `ResultsPage` Storybook with seeded populated and empty fixtures tied to workspace routing/state.
- **Why it changed:**
- Make the Data section more actionable for researchers by turning raw file/table screens into an analysis-readiness workflow with clear next steps.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- `frontend/src/pages/results-page.stories.tsx`
- `docs/change-log.md`
- `docs/stories/workspaces-hub-v2.md`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Move readiness checks to server-backed validations so results persist across devices and sessions.
- Add column-level completeness and type-consistency diagnostics in the working-table editor.

### Workspace Data Section Simplification (Upload + Personal Library)

- **Area:** Workspace Data page information architecture and house-style alignment.
- **What changed:**
- Removed Data Readiness and Priority Actions blocks from the Data page.
- Removed table-generation workflow UI from the Data page surface to keep this step focused on ingestion and library access.
- Reworked layout to a practical two-column structure:
  - Left: local files and sheet preview.
  - Right: `Data upload` utilities and `Personal library` access (search + refresh + scoped asset listing).
- Reduced narrative copy: removed subtitle/narrative text under the Data title and trimmed descriptive/placeholder wording across cards.
- Added optional `PageFrame` controls (`description` optional and `hideScaffoldHeader`) so pages can suppress generic scaffold copy where needed.
- **Why it changed:**
- Prioritize core user actions in this phase: upload, inspect, and access persisted personal assets with less visual noise.
- **Key files touched:**
- `frontend/src/pages/results-page.tsx`
- `frontend/src/pages/page-frame.tsx`
- `docs/change-log.md`
- `docs/stories/workspaces-hub-v2.md`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Add explicit personal-library attach/import action from persisted assets into local preview without re-upload.
- Add server-side pagination for personal-library lists at high asset counts.

### Workspace Data Library Ownership + Access Controls

- **Area:** Data library security model, collaborator access management, and workspace data import ergonomics.
- **What changed:**
- Added file-level collaborator ACL support for data library assets (`shared_with_user_ids`) with migration `20260225_0009`.
- Extended library asset payloads with owner/access metadata (`owner_name`, `shared_with`, `can_manage_access`).
- Added owner-only access management endpoint: `PATCH /v1/library/assets/{asset_id}/access`.
- Added secured file download endpoint: `GET /v1/library/assets/{asset_id}/download`.
- Tightened library routes to require authenticated sessions for upload/list/download/access operations.
- Updated access checks so owner access is implicit and collaborator access is controlled by file ACL (with legacy project-collaborator fallback only for pre-ACL rows).
- Updated workspace Data page personal library panel:
  - Show owner and current collaborator access per file.
  - Add/remove collaborator access (owner only).
  - Download file.
  - Pull file into workspace local file preview area.
- Preserved and validated upload flow where workspace uploads are synced into personal library.
- **Why it changed:**
- Meet workspace collaboration requirements with explicit, auditable file access control while keeping data reusable across workspace sessions and sign-ins.
- **Key files touched:**
- `src/research_os/db.py`
- `alembic/versions/20260225_0009_data_library_asset_access_controls.py`
- `src/research_os/services/data_planner_service.py`
- `src/research_os/api/schemas.py`
- `src/research_os/api/app.py`
- `tests/test_api.py`
- `frontend/src/types/study-core.ts`
- `frontend/src/lib/study-core-api.ts`
- `frontend/src/pages/results-page.tsx`
- `docs/change-log.md`
- `docs/stories/workspaces-hub-v2.md`
- **Verification performed:**
- `python -m py_compile src/research_os/services/data_planner_service.py src/research_os/api/app.py src/research_os/api/schemas.py src/research_os/db.py alembic/versions/20260225_0009_data_library_asset_access_controls.py`
- `pytest tests/test_api.py -q`
- `pytest tests/test_migrations.py -q`
- `npm --prefix frontend run --silent typecheck`
- `npx eslint src/pages/results-page.tsx src/lib/study-core-api.ts src/types/study-core.ts`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Add server-side pagination and sort options for large personal-library inventories.
- Add optional per-file "inherit all active workspace collaborators" shortcut in access management.

### Workspaces Home Data Library View + Left Nav Integration

- **Area:** Workspaces home information architecture, personal library visibility, and Storybook coverage.
- **What changed:**
- Added a dedicated `Data library` view in Workspaces home left navigation.
- Extended Workspaces center-view routing (`view=data-library`) so the data library is first-class alongside Workspaces and Invitations.
- Added a new Workspaces Data Library center panel that supports:
  - file listing (owner, access members, upload time, size),
  - owner-only permission management (grant/revoke collaborator access),
  - secure file download actions.
- Limited `States` left-nav section to the Workspaces view only, avoiding irrelevant filters in Invitations/Data library views.
- Added a populated Storybook `DataLibrary` story (`/workspaces?view=data-library`) with mocked library API endpoints for list/access/download so the page is testable without backend dependency.
- **Why it changed:**
- Expose personal data-library management directly from Workspaces home with clear left-nav discoverability, while keeping permission and access controls auditable and owner-scoped.
- **Key files touched:**
- `frontend/src/pages/workspaces-page.tsx`
- `frontend/src/pages/workspaces-data-library-view.tsx`
- `frontend/src/pages/workspaces-page.stories.tsx`
- `docs/change-log.md`
- `docs/stories/workspaces-hub-v2.md`
- **Verification performed:**
- `npm --prefix frontend run --silent typecheck`
- `npx eslint frontend/src/pages/workspaces-page.tsx frontend/src/pages/workspaces-data-library-view.tsx frontend/src/pages/workspaces-page.stories.tsx`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Replace name-based collaborator permission entry with directory-backed user search for very large user populations.
- Add server-backed pagination and sort controls to the Workspaces home data library table.

### Workspaces Data Library: Server Paging + Directory-ID Access Grants

- **Area:** Workspaces home data-library scalability, collaborator access ergonomics, and API contract evolution.
- **What changed:**
- Upgraded `GET /v1/library/assets` from plain-array output to a metadata response with server-side controls:
  - `query`, `ownership`, `sort_by`, `sort_direction`, `page`, `page_size`
  - response payload: `items`, `total`, `has_more`, paging and sort metadata.
- Added backend filtering/sorting/pagination support in data-planner service and wired schema/route updates.
- Updated frontend Study Core API client/type contracts to consume paged library payloads.
- Updated consumers (`ResultsPage`, `StepPlan`, and Workspaces home data-library view) to use `payload.items`.
- Reworked Workspaces home Data Library UI to use true server-backed search/sort/pagination controls.
- Replaced local-name access grant input with directory-backed collaborator search:
  - users are looked up via collaboration directory endpoint at add-time,
  - selected collaborator IDs are sent in access updates (`collaborator_user_ids`) for ID-resolved permissions.
- Updated Workspaces Storybook API mocks for:
  - paged/sorted library listing responses,
  - collaborator directory search endpoint,
  - access mutation and download flows.
- Added/updated backend tests for list pagination/sort/filter semantics and updated existing ACL tests for new list response shape.
- Fixed open-access PDF ingestion path to pass `user_id` to library uploads, restoring test-covered upload behavior under authenticated ownership constraints.
- **Why it changed:**
- Support large personal-library inventories with scalable server-driven retrieval and avoid fragile name-only permission assignment by resolving collaborators to account IDs.
- **Key files touched:**
- `src/research_os/services/data_planner_service.py`
- `src/research_os/api/schemas.py`
- `src/research_os/api/app.py`
- `src/research_os/services/open_access_service.py`
- `tests/test_api.py`
- `tests/test_open_access_service.py`
- `frontend/src/types/study-core.ts`
- `frontend/src/lib/study-core-api.ts`
- `frontend/src/pages/workspaces-data-library-view.tsx`
- `frontend/src/pages/workspaces-page.tsx`
- `frontend/src/pages/workspaces-page.stories.tsx`
- `frontend/src/pages/results-page.tsx`
- `frontend/src/components/study-core/StepPlan.tsx`
- `docs/change-log.md`
- `docs/stories/workspaces-hub-v2.md`
- **Verification performed:**
- `python -m py_compile src/research_os/services/data_planner_service.py src/research_os/api/app.py src/research_os/api/schemas.py`
- `pytest tests/test_api.py -q`
- `pytest tests/test_open_access_service.py -q`
- `npm --prefix frontend run --silent typecheck`
- `npx eslint frontend/src/pages/workspaces-data-library-view.tsx frontend/src/pages/workspaces-page.tsx frontend/src/pages/workspaces-page.stories.tsx frontend/src/pages/results-page.tsx frontend/src/components/study-core/StepPlan.tsx frontend/src/lib/study-core-api.ts frontend/src/types/study-core.ts`
- `npm --prefix frontend run build`
- `npm --prefix frontend run --silent build-storybook`
- **Follow-up:**
- Add backend index strategy and SQL-level access filtering optimizations for very large libraries.
- Optionally add cursor-based paging if offset paging becomes expensive at high page numbers.

### Data Library Durability Hardening (Metadata Sidecar + Auto-Reconciliation)

- **Area:** Data-library persistence resilience across restarts/build path churn and DB row loss recovery.
- **What changed:**
- Added per-asset metadata sidecars (`<asset_id>.meta.json`) written to stable library storage on upload.
- Added service-level reconciliation that restores missing `data_library_assets` rows from sidecars when files still exist.
- Added owner rebind logic: if stored owner user id is stale/missing, ownership is reattached by matching sidecar `owner_email` to current account.
- Added point-recovery for direct access operations (`download` and access updates) so single assets can be restored by id.
- Ensured storage resolution ignores metadata sidecars as file candidates (`*.meta.json` no longer treated as datasets).
- Kept sidecar metadata synchronized during list/download/profile flows after storage-path healing.
- **Why it changed:**
- Prevent uploaded datasets from appearing to disappear when DB rows are lost/reset while durable files remain in stable storage.
- Preserve safe recovery behavior across builds and account-id churn while maintaining access constraints.
- **Key files touched:**
- `src/research_os/services/data_planner_service.py`
- `tests/test_data_library_resilience.py`
- `docs/change-log.md`
- **Verification performed:**
- `python -m py_compile src/research_os/services/data_planner_service.py tests/test_data_library_resilience.py`
- `pytest tests/test_data_library_resilience.py -q`
- `pytest tests/test_open_access_service.py -q`
- `pytest tests/test_api.py -k "library_asset" -q`
- **Follow-up:**
- Add periodic integrity checks that emit explicit warnings when sidecar metadata exists without a recoverable file.
- Consider encrypting sidecar metadata-at-rest when deployment threat model requires it.

### Library Visibility After Re-Login (Database URL Stabilization)

- **Area:** Authentication session lifecycle and post-login data-library continuity.
- **What changed:**
- Hardened `get_database_url()` handling for explicit SQLite `DATABASE_URL` values that use relative paths.
- Relative explicit SQLite URLs are now stabilized into the same durable app-data location used by default DB storage, with one-time copy of legacy DB + sidecars when needed.
- Added regression coverage for the exact scenario: upload file -> logout -> login -> list library still includes the file.
- Added DB URL tests to verify:
  - explicit relative SQLite URLs are stabilized to absolute durable storage,
  - explicit absolute SQLite URLs remain unchanged.
- **Why it changed:**
- Prevent environment/path drift from making existing assets appear missing after sign-out/sign-in cycles.
- **Key files touched:**
- `src/research_os/db.py`
- `tests/test_api.py`
- `tests/test_db_storage_stability.py`
- `docs/change-log.md`
- **Verification performed:**
- `python -m py_compile src/research_os/db.py tests/test_db_storage_stability.py tests/test_api.py`
- `pytest tests/test_db_storage_stability.py -q`
- `pytest tests/test_api.py -k "library_asset or persist_across_logout" -q`
- **Follow-up:**
- Add startup diagnostics endpoint that reports active DB path and storage root to simplify support triage in production.

### Data Library Robustness + Scale Upgrade (Legacy Schema Auto-Heal)

- **Area:** Data-library reliability on long-lived installs and scaling behavior with large asset volumes.
- **What changed:**
- Added automatic SQLite compatibility upgrade during `create_all_tables()`:
  - `data_library_assets`: adds missing `owner_user_id` and `shared_with_user_ids`.
  - `projects`: adds missing `owner_user_id`, `collaborator_user_ids`, and `workspace_id`.
  - applies safe backfill for legacy single-user installs so pre-owner assets are attributed and visible.
  - `data_profiles`: adds missing `owner_user_id` and index compatibility for legacy installs.
- Added metadata-index support (`metadata.index.json`) to avoid full sidecar directory scans on every restore path.
- Added fallback owner binding for ownerless sidecar metadata when the deployment has exactly one user account.
- Added legacy owner-claim flow for ownerless personal assets:
  - first authenticated requester can claim ownerless/no-project/unshared legacy rows,
  - ownership is then persisted, preventing cross-user leakage on subsequent reads.
- Tightened list-path scalability by adding SQL prefilter hints for ownership/shared scopes before in-memory filtering.
- **Why it changed:**
- Fix real-world legacy DB shape drift (missing columns) that caused empty library views after sign-in.
- Improve recovery performance and keep behavior stable as stored datasets grow.
- **Key files touched:**
- `src/research_os/db.py`
- `src/research_os/services/data_planner_service.py`
- `tests/test_db_storage_stability.py`
- `tests/test_data_library_resilience.py`
- `docs/change-log.md`
- **Verification performed:**
- `python -m py_compile src/research_os/db.py src/research_os/services/data_planner_service.py tests/test_db_storage_stability.py tests/test_data_library_resilience.py`
- `pytest tests/test_db_storage_stability.py -q`
- `pytest tests/test_data_library_resilience.py -q`
- `pytest tests/test_open_access_service.py -q`
- `pytest tests/test_api.py -k "library_asset or persist_across_logout" -q`
- **Follow-up:**
- Add a startup/audit endpoint that surfaces schema version, auto-heal actions taken, and library recovery counts for support diagnostics.

### Personal Library Empty-After-Login Hardening (Owner Repair Before Filters)

- **Area:** Data-library list/access reliability after sign-in when legacy owner ids are stale/blank.
- **What changed:**
- Added explicit legacy owner-repair candidate detection for assets with:
  - missing owner,
  - blank owner,
  - stale owner id (owner id no longer present in `users`).
- Updated legacy claim flow so repair can proceed when current user already has owned assets, as long as all existing valid owners are the same user.
- Extended claim candidates to include stale-owner rows (not just null/blank owner rows).
- Added project-owner stale-id handling during claim:
  - if a project owner id is stale, it is cleared and recoverable ownership logic is applied.
- `list_library_assets` now performs repair before ownership filtering:
  - optional metadata-sidecar reconciliation when repair candidates exist or sidecar index count exceeds DB row count,
  - owner claim pass before `owned/shared/all` filtering.
- `update_library_asset_access` and `download_library_asset` now trigger owner claim recovery for legacy ownerless rows by id before enforcing access checks.
- Added regression coverage for `ownership="owned"` with mixed modern+legacy rows:
  - validates stale-owner personal rows are reclaimed and visible when the same user already has owned assets.
- **Why it changed:**
- Fix persistent “personal library empty after login” scenarios where recoverable legacy rows were excluded by filters before ownership repair ran.
- Prevent rows from disappearing between sessions when ownership metadata is stale but files still exist.
- **Key files touched:**
- `src/research_os/services/data_planner_service.py`
- `tests/test_data_library_resilience.py`
- `docs/change-log.md`
- **Verification performed:**
- `pytest tests/test_data_library_resilience.py -q`
- `pytest tests/test_api.py -k "library_assets_persist_across_logout_and_login or library_assets_support_server_pagination_sort_and_filters or library_asset_access_controls_and_download" -q`
- `python -m py_compile src/research_os/services/data_planner_service.py tests/test_data_library_resilience.py`
- **Follow-up:**
- Add lightweight telemetry counters for owner-repair events so production support can quickly distinguish “no files uploaded” from “rows repaired on access”.

### Hidden Account Key Linkage For Asset Ownership Recovery

- **Area:** Account identity durability for data ownership linkage.
- **What changed:**
- Added immutable hidden `users.account_key` (UUID) with auto-generation for new users.
- Added SQLite compatibility auto-heal for legacy installs:
  - adds `users.account_key` when missing,
  - backfills missing/blank values,
  - creates a unique index (`ix_users_account_key`).
- Data-library sidecar metadata now stores `owner_account_key` in addition to `owner_user_id` and `owner_email`.
- Ownership restore now resolves in this order:
  - `owner_account_key` (preferred),
  - `owner_user_id`,
  - `owner_email`.
- Added regression coverage for stale metadata ids/emails where ownership is still recovered correctly through `owner_account_key`.
- **Why it changed:**
- Decouple asset linkage from mutable profile fields and make identity matching more durable across legacy/user-id churn scenarios.
- **Key files touched:**
- `src/research_os/db.py`
- `src/research_os/services/data_planner_service.py`
- `tests/test_db_storage_stability.py`
- `tests/test_data_library_resilience.py`
- `docs/change-log.md`
- **Verification performed:**
- `python -m py_compile src/research_os/db.py src/research_os/services/data_planner_service.py tests/test_db_storage_stability.py tests/test_data_library_resilience.py`
- `pytest tests/test_db_storage_stability.py -q`
- `pytest tests/test_data_library_resilience.py -q`
- `pytest tests/test_api.py -k "library_assets_persist_across_logout_and_login or library_assets_support_server_pagination_sort_and_filters or library_asset_access_controls_and_download" -q`

### OAuth Sign-In Reliability + Diagnostics Hardening

- **Area:** Login reliability and support diagnostics for OAuth callback flows (ORCID/Google/Microsoft).
- **What changed:**
- Improved OAuth token exchange error reporting to include provider-safe error details:
  - `ORCID token exchange failed (invalid_grant).`
  - fallback: `... failed (status 400).`
- Added duplicate callback guard in `AuthCallbackPage`:
  - de-duplicates repeated `provider/state/code` processing in the same browser session,
  - prevents accidental second exchange attempt of one-time OAuth code (common in dev/strict render paths).
- **Why it changed:**
- Reduce false-positive OAuth failures caused by duplicate callback execution.
- Make production troubleshooting faster by exposing actionable upstream error codes.
- **Key files touched:**
- `src/research_os/services/social_auth_service.py`
- `frontend/src/pages/auth-callback-page.tsx`
- `docs/change-log.md`
- **Verification performed:**
- `python -m py_compile src/research_os/services/social_auth_service.py`
- `pytest tests/test_api.py -k "auth_oauth_connect_and_callback_endpoints or auth/login or login_challenge" -q`

### Auth Form Validation UX Fix (Prevent Disabled-Button Dead End)

- **Area:** Sign-in ergonomics and error clarity on auth screen.
- **What changed:**
- Updated sign-in button behavior to disable only during active request loading.
- Removed validation-based disable state so users can click and receive explicit validation feedback (e.g., missing password) instead of a silent disabled state.
- **Why it changed:**
- Prevent confusion where users interpreted a disabled sign-in button as an API outage while required fields were incomplete.
- **Key files touched:**
- `frontend/src/pages/auth-page.tsx`
- `docs/change-log.md`
- **Verification performed:**
- `npm --prefix frontend run typecheck`

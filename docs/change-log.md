# Change Log

## 2026-02-26

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

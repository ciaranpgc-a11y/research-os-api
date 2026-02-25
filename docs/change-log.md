# Change Log

## 2026-02-25

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

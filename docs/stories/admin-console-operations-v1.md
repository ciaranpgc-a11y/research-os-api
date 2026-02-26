# Story: Admin Console Operations v1

## Status

In Progress

## Problem

Admin capability was present but structurally flat. It needed a scalable navigation and module infrastructure so owner operations can expand safely while core website development continues in parallel.

## Outcome

Ship an admin console shell with:

- Dedicated admin-mode surface (separate from normal site shell).
- Section navigation and deep links (`/admin/:sectionId`).
- Module registry with explicit status and lane metadata.
- A delivery framework that keeps docs/governance synchronized with parallel feature work.

## Scope

In scope:

- Admin left navigation grouped by command/scale/governance.
- Section model for all 12 admin domains.
- Overview, Users, Organisations, and Workspaces/Projects as active operational modules.
- Usage, Costs, and Limits as a live margin-control module.
- Jobs and Queues as a live operations module with internal cancel/retry controls.
- Immutable admin audit events, including org impersonation action logging.
- Structured placeholders and planning metadata for remaining modules.
- CI documentation enforcement for major changes.

Out of scope (v1):

- Full backend data pipelines for every planned module.
- Full end-user session takeover from impersonation ticket (internal ticketing/audit only in v1).
- Billing provider integrations and queue observability backends.
- Support ticketing integration.

## Acceptance Criteria

1. Admin routes support deep-link section navigation (`/admin/overview`, `/admin/users`, etc.).
2. Admin UI shows grouped navigation and section-specific content.
3. Overview and Users remain live/interactive and admin-protected.
4. Organisations module is live/interactive with tenant profile, usage/cost, limits, integrations, and impersonation control visibility.
5. Workspaces module is live/interactive with workspace ownership, member visibility, project/data load, and queue/run health metrics.
6. Remaining modules display explicit status (`live`, `partial`, `planned`) and lane (`now`, `next`, `later`) metadata.
7. A return action to main site remains available.
8. Documentation and CI rules require same-delivery documentation for major changes.
9. Usage-Costs-Limits and Jobs-Queues modules are live and backed by admin APIs.
10. Admin cancel/retry/impersonation actions are audited and queryable from admin audit logs.

## Implementation Notes (2026-02-26)

- Added admin deep-link routing (`/admin/:sectionId`) with fallback redirect from `/admin`.
- Updated top-bar admin shortcut to open `/admin/overview`.
- Refactored admin page into:
  - left navigation rail grouped by capability area,
  - parallel delivery board (status and lane counts),
  - section-specific rendering model (overview/users live, others infrastructure blueprints),
  - explicit parallel feature control block.
- Added `docs/parallel-feature-delivery.md`.
- Added CI-gated documentation enforcement script: `scripts/verify_change_documentation.py`.
- Updated change documentation rules to v1.2 with parallel-lane and CI-enforcement clauses.
- Added admin-role cache resilience so admin link and personal-details admin badge remain visible when `fetchMe` temporarily fails after a confirmed admin session.
- Added live Organisations module infrastructure:
  - new admin API endpoint `/v1/admin/organisations`,
  - backend domain-derived tenant aggregation (profiles, activity, usage/cost trend, quotas/limits, integrations, impersonation metadata),
  - admin UI tenant index + detail control plane,
  - organisations lane/status promoted to `live` + `now`.
- Added live Workspaces module infrastructure:
  - new admin API endpoint `/v1/admin/workspaces`,
  - backend workspace aggregation (owner/members, project/manuscript/data-source counts, storage, exports, run health),
  - admin UI workspace index + detail control plane with queue and project-level visibility,
  - workspaces lane/status promoted to `live` + `now`.
- Added live Usage-Costs-Limits module infrastructure:
  - new admin API endpoint `/v1/admin/usage-costs`,
  - backend usage/cost aggregation by model/tool/org/user plus trend/limits summary,
  - admin UI section upgraded from placeholder to live telemetry cards and usage tables,
  - usage-costs lane/status promoted to `live` + `now`.
- Added live Jobs and Queues module infrastructure:
  - new admin API endpoint `/v1/admin/jobs`,
  - internal admin action endpoints `/v1/admin/jobs/{job_id}/cancel` and `/v1/admin/jobs/{job_id}/retry`,
  - admin UI section upgraded from placeholder to live queue health + searchable jobs table + action controls,
  - jobs lane/status promoted to `live` + `now`.
- Added audited admin actions and event visibility:
  - new admin API endpoint `/v1/admin/organisations/{org_id}/impersonate` (internal ticket + audit trail),
  - new admin API endpoint `/v1/admin/audit/events`,
  - backend immutable event persistence via `admin_audit_events`,
  - security section upgraded with live audit log visibility.
- Added admin user-library recovery diagnostics and actioning:
  - new admin API endpoint `/v1/admin/users/{user_id}/library/reconcile`,
  - new admin API endpoint `DELETE /v1/admin/users/{user_id}` with `confirm_phrase=DELETE`,
  - per-user `Reconcile library` control in Users table with status feedback,
  - per-user `Delete account` control in Users table for duplicate/invalid account cleanup,
  - Users table now surfaces `User ID` and `Account key` for identity-link diagnostics.
- Updated bootstrap seed behavior so startup bootstrap no longer overwrites an existing user name unless explicitly enabled via `AAWE_BOOTSTRAP_SYNC_NAME=1`.

## Verification

- `npm --prefix frontend run --silent typecheck`
- `pytest tests/test_api.py -k "v1_admin_endpoints" -q`
- `python scripts/verify_change_documentation.py` (base SHA fallback in local mode)

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
- Overview, Users, and Organisations as active operational modules.
- Structured placeholders and planning metadata for remaining modules.
- CI documentation enforcement for major changes.

Out of scope (v1):

- Full backend data pipelines for every planned module.
- Tenant impersonation tooling.
- Billing provider integrations and queue observability backends.
- Support ticketing integration.

## Acceptance Criteria

1. Admin routes support deep-link section navigation (`/admin/overview`, `/admin/users`, etc.).
2. Admin UI shows grouped navigation and section-specific content.
3. Overview and Users remain live/interactive and admin-protected.
4. Organisations module is live/interactive with tenant profile, usage/cost, limits, integrations, and impersonation control visibility.
5. Remaining modules display explicit status (`live`, `partial`, `planned`) and lane (`now`, `next`, `later`) metadata.
6. A return action to main site remains available.
7. Documentation and CI rules require same-delivery documentation for major changes.

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

## Verification

- `npm --prefix frontend run --silent typecheck`
- `npm --prefix frontend run design:governance`
- `pytest tests/test_api.py -k "v1_admin_endpoints" -q`
- `python scripts/verify_change_documentation.py` (base SHA fallback in local mode)

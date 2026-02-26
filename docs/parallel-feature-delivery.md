# Parallel Feature Delivery Framework

## Purpose

Define how major features are delivered in parallel without documentation drift, governance regressions, or hidden operational risk.

## Delivery Lanes

- `Now`: active delivery in current cycle.
- `Next`: implementation-ready and sequenced behind `Now`.
- `Later`: defined and documented but dependency-gated.

## Required Artifacts Per Major Change

1. Product/engineering implementation
- Frontend, backend, and/or migration changes as needed.

2. Documentation update in same delivery
- `docs/change-log.md` (mandatory for major changes).
- Story update under `docs/stories/` or governance update when constraints change.

3. Verification evidence
- Include run commands/results for relevant checks (typecheck, tests, lint, build, governance).

## CI Enforcement

`scripts/verify_change_documentation.py` enforces that major code changes include required documentation updates.

## Admin Console Lane Map (Current)

- `Now`: Overview, Organisations, Workspaces/Projects, Users, Security & Compliance, Usage-Costs-Limits, Jobs & Queues.
- `Next`: Billing & Plans, Integrations hardening, Feature flag rollout controls.
- `Later`: Support & Moderation, System Settings, advanced compliance controls (SSO/SCIM/SAML), deployment history automation.

## Operating Rules

- No major lane work ships without same-delivery documentation.
- No lane promotion (`Next` -> `Now`, `Later` -> `Next`) without updating story docs and change log.
- Keep module status explicit (`live`, `partial`, `planned`) to avoid hidden scope assumptions.

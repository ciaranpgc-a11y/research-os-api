# Change Documentation Rules v1.1

## Purpose

These rules ensure all major product and engineering changes are documented for auditability, regression control, and continuous improvement.

## Rule 1: Major Changes Must Be Documented In The Same Delivery

Any major change must include documentation updates in the same PR or change set.

Major changes include:

- New or changed user-facing flows, navigation, or page structure.
- New or changed API behavior, data shape, or persistence behavior.
- Auth/security/realtime behavior changes.
- Database migrations or state model changes.
- House-style or governance-impacting UI changes.

## Rule 2: Required Documentation Updates

For every major change, update all applicable artifacts:

1. `docs/change-log.md`
- Add a dated entry with scope, impact, and verification.

2. Relevant story document(s) in `docs/stories/`
- Update status, scope, acceptance criteria notes, or implementation notes.

3. Governance docs when constraints change
- If design system rules or operating constraints changed, update `docs/design-governance.md` and related enforcement scripts.

## Rule 3: Change Log Entry Format

Each entry in `docs/change-log.md` must contain:

- Date (`YYYY-MM-DD`)
- Area / feature
- What changed
- Why it changed
- Key files touched
- Verification performed (typecheck, lint, tests, builds)
- Follow-up items (if any)

## Rule 4: Audit Readiness

Documentation must be sufficient for another engineer to answer:

- What changed?
- Why did it change?
- What might regress?
- How was it validated?

## Rule 5: Review Gate

A major change is incomplete if documentation is missing or stale.

## Rule 6: Compression-Stage Documentation Sweep

When a working chat/session is approaching context compression, perform an explicit documentation sweep before handoff/compression:

- Ensure `docs/change-log.md` includes all major implemented changes from the session.
- Ensure relevant story docs in `docs/stories/` are updated with implementation notes and current behavior.
- Capture validation state (lint/typecheck/tests/build) and known risks or follow-up items.
- Prefer one consolidated, comprehensive documentation pass rather than sparse partial notes.

This rule is additive to Rules 1-5 and does not replace continuous documentation during delivery.

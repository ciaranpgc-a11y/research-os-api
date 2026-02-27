# Design Governance Rules

Generated: 2026-02-27  
Phase: 4 (2/3)

## Purpose

Prevent non-token styling drift from entering production by enforcing design system rules in CI.

## Enforcement Command

```bash
npm run design:governance --prefix frontend
```

This runs:

- `frontend/scripts/design-governance.js`

## Enforced Rules (Current)

### 1) Hardcoded Motion Durations

- **Disallowed**: `duration-200`, `duration-280`, other numeric duration utility classes
- **Allowed**: token-based motion durations (example: `duration-[var(--motion-ui)]`)
- **Rule ID**: `hardcoded-duration`

### 2) Hardcoded Shadows

- **Disallowed**: literal shadow values (example: `box-shadow: 0 2px 4px ...`, `shadow-[0_...]`)
- **Allowed**: elevation tokens (example: `var(--elevation-1)`, `var(--elevation-2)`, `var(--elevation-3)`)
- **Rule ID**: `hardcoded-shadow`

### 3) Hardcoded Radius Values

- **Disallowed**: literal radius values (example: `border-radius: 0.5rem`, `rounded-[0.5rem]`)
- **Allowed**: radius tokens (example: `var(--radius-sm)`, `var(--radius-md)`, `rounded-[var(--radius-sm)]`)
- **Rule ID**: `hardcoded-radius`

### 4) Undefined CSS Variables

- **Disallowed**: references to undefined tokens (example: `var(--token-that-does-not-exist)`)
- **Allowed**: only variables defined in `frontend/src/index.css`
- **Rule ID**: `undefined-vars`

### 5) `transition-all` Usage

- **Disallowed**: `transition-all`
- **Allowed**: explicit transition property lists (example: `transition-[background-color,color]`)
- **Rule ID**: `transition-all`

## Scope and Exclusions

Scanned path:

- `frontend/src/**/*.{ts,tsx,js,jsx,css}`

Skipped paths:

- `frontend/src/components/primitives/*`
- `frontend/src/stories/*`

Reason: primitives and stories are treated as the controlled system-definition layer during the rebuild.

## Baseline Policy

- Existing known legacy debt is frozen in `frontend/scripts/design-governance-baseline.json`.
- Governance fails only on **new** violations not present in baseline.
- Legacy reference count is tracked in:
  - `docs/design/MIGRATION_BACKLOG.md` (`Baseline Violations: 26`)

## CI/CD Integration

Workflow:

- `.github/workflows/design-governance.yml`

Behavior:

- Runs on pull requests that change:
  - `frontend/src/**`
  - `frontend/scripts/design-governance.js`
- Installs frontend dependencies
- Executes `npm run design:governance --prefix frontend`
- On failure, posts a PR comment with local remediation command

## How to Fix Violations

1. Run governance locally:
   ```bash
   npm run design:governance --prefix frontend
   ```
2. Open each reported file/line.
3. Replace non-token values with canonical tokens:
   - Motion: `--motion-*`
   - Elevation: `--elevation-*`
   - Radius: `--radius-*`
   - Colors: defined semantic variables in `src/index.css`
4. Replace `transition-all` with explicit property transitions.
5. Re-run governance until output reports:
   - `PASS: No new violations detected`

## Pass/Fail Contract

- **PASS**: No net-new violations relative to baseline.
- **FAIL**: Any new violation in the 5 enforced categories.

## Ownership

- Design system maintainers own rule updates.
- Feature teams own remediation in touched files.
- Baseline updates are allowed only with explicit approval and migration-log justification.

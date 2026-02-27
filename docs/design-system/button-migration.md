# Button Migration Report (Pass B)

Generated: 2026-02-27T16:54:33.679Z

Scope: `frontend/src` only.

Method: AST scan of JSX elements named `Button` imported from `ui/button`; counts include literal `variant="..."` and string literals inside `variant={...}` expressions.

## Before Migration

| Variant | Count |
| --- | ---: |
| `default` | 14 |
| `housePrimary` | 11 |
| `house` | 24 |
| `secondary` | 4 |
| `outline` | 156 |
| `ghost` | 9 |

### Before files using `default`
- `frontend/src/components/study-core/Step2Panel.tsx`
- `frontend/src/components/study-core/StepPlan.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`
- `frontend/src/pages/profile-publications-page.tsx`

### Before files using `housePrimary`
- `frontend/src/components/data-workspace/AddColumnModal.tsx`
- `frontend/src/pages/landing-page.tsx`
- `frontend/src/pages/profile-manage-account-page.tsx`
- `frontend/src/pages/profile-personal-details-page.tsx`
- `frontend/src/pages/profile-publications-page.tsx`
- `frontend/src/pages/workspace-inbox-page.tsx`
- `frontend/src/pages/workspaces-page.tsx`

### Before files using `house`
- `frontend/src/components/data-workspace/TableHeader.tsx`
- `frontend/src/components/publications/PublicationsTopStrip.tsx`
- `frontend/src/pages/landing-page.tsx`
- `frontend/src/pages/profile-personal-details-page.tsx`
- `frontend/src/pages/results-page.tsx`
- `frontend/src/pages/workspace-inbox-page.tsx`

### Before files using `secondary`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/stories/design-system/primitives/Button.stories.tsx`
- `frontend/src/stories/design-system/primitives/IconButton.stories.tsx`

### Before files using `outline`
- `frontend/src/components/data-workspace/AddColumnModal.tsx`
- `frontend/src/components/data-workspace/TableHeader.tsx`
- `frontend/src/components/data-workspace/TableTabs.tsx`
- `frontend/src/components/layout/app-error-boundary.tsx`
- `frontend/src/components/layout/next-best-action-panel.tsx`
- `frontend/src/components/layout/profile-panel.tsx`
- `frontend/src/components/layout/top-bar.tsx`
- `frontend/src/components/study-core/Step1Panel.tsx`
- `frontend/src/components/study-core/Step2Panel.tsx`
- `frontend/src/components/study-core/Step3Panel.tsx`
- `frontend/src/components/study-core/StepContext.tsx`
- `frontend/src/components/study-core/StepDraftReview.tsx`
- `frontend/src/components/study-core/StepLinkQcExport.tsx`
- `frontend/src/components/study-core/StepPlan.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/pages/admin-page.tsx`
- `frontend/src/pages/auth-page.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/manuscript-tables-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`
- `frontend/src/pages/profile-integrations-page.tsx`
- `frontend/src/pages/profile-publications-page.tsx`
- `frontend/src/pages/results-page.tsx`
- `frontend/src/pages/settings-page.tsx`
- `frontend/src/pages/workspace-exports-page.tsx`
- `frontend/src/stories/_archive/components/auth/LoginCard.stories.tsx`
- `frontend/src/stories/design-system/primitives/ModalSheetDrawer.stories.tsx`
- `frontend/src/stories/design-system/primitives/Tooltip.stories.tsx`

### Before files using `ghost`
- `frontend/src/components/data-workspace/TableTabs.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/components/study-core/StudyCoreStepper.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/manuscript-tables-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`

## data-ui-variant checks/usages (before)
- Count: 2
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/button.tsx`

## Ad hoc button-related classnames (before)
- `frontend/src/components/study-core/Step1Panel.tsx`: `house-button-action`, `house-button-action-primary`, `house-button-text`
- `frontend/src/components/study-core/StepPlan.tsx`: `house-button-action`, `house-button-action-primary`
- `frontend/src/lib/house-style.ts`: `house-button-action`, `house-button-action-danger`, `house-button-action-ghost`, `house-button-action-primary`, `house-button-action-success`, `house-button-text`
- `frontend/src/stories/design-system/pages/ReferenceScenes.stories.tsx`: `house-button-action-primary`

## Replacements Applied

- `housePrimary -> primary`: 11
- `default -> primary`: 14
- `house -> secondary`: 24
- `outline -> tertiary`: 156
- Files changed: 34

## After Migration

| Variant | Count |
| --- | ---: |
| `default` | 0 |
| `housePrimary` | 0 |
| `house` | 0 |
| `secondary` | 28 |
| `outline` | 0 |
| `ghost` | 9 |

### After files using `default`
- None

### After files using `housePrimary`
- None

### After files using `house`
- None

### After files using `secondary`
- `frontend/src/components/data-workspace/TableHeader.tsx`
- `frontend/src/components/publications/PublicationsTopStrip.tsx`
- `frontend/src/pages/landing-page.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/profile-personal-details-page.tsx`
- `frontend/src/pages/results-page.tsx`
- `frontend/src/pages/workspace-inbox-page.tsx`
- `frontend/src/stories/design-system/primitives/Button.stories.tsx`
- `frontend/src/stories/design-system/primitives/IconButton.stories.tsx`

### After files using `outline`
- None

### After files using `ghost`
- `frontend/src/components/data-workspace/TableTabs.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/components/study-core/StudyCoreStepper.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/manuscript-tables-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`

## data-ui-variant checks/usages (after)
- Count: 2
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/button.tsx`

## Remaining Legacy Variant Usage

- `ghost` remains intentionally untouched in this pass.
- Remaining `ghost` occurrences: 9
- `frontend/src/components/data-workspace/TableTabs.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/components/study-core/StudyCoreStepper.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/manuscript-tables-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`

## Pass C — Ghost Migration + Alias Removal

### Ghost counts
- Before: `9`
- After: `0`

### Files changed for ghost migration
- `frontend/src/components/data-workspace/TableTabs.tsx`
- `frontend/src/components/study-core/StepRun.tsx`
- `frontend/src/components/study-core/StudyCoreStepper.tsx`
- `frontend/src/pages/manuscript-page.tsx`
- `frontend/src/pages/manuscript-tables-page.tsx`
- `frontend/src/pages/profile-collaboration-page.tsx`

### Canonical API status after Pass C
- `Button` variants are now restricted to: `primary`, `secondary`, `tertiary`, `destructive`.
- Legacy Button variants removed from `button.tsx`: `default`, `housePrimary`, `house`, `outline`, `ghost`.

# Migration Wave 1: Low-Risk Pages

## Scope
- src/pages/auth-page.tsx
- src/pages/landing-page.tsx
- src/pages/auth-callback-page.tsx

## Components to Replace
| Old Component | New Primitive | Notes |
|---|---|---|
| ui/button | ButtonPrimitive | Direct replacement |
| ui/input | InputPrimitive | Direct replacement |
| ui/card | CardPrimitive | Direct replacement |

## Per-File Checklist

### auth-page.tsx
- [x] Import ButtonPrimitive from src/components/primitives
- [x] Replace all Button imports with ButtonPrimitive
- [x] Verify variant/size props match
- [x] Test: npm run build + manual browser test (login form)
- [x] Commit: "Migrate auth-page to primitives"
- [x] Run: npm run design:governance (should pass)

### landing-page.tsx
- [x] Same process as auth-page

### auth-callback-page.tsx
- [x] Same process

## Validation After Each File
```bash
npm run typecheck --prefix frontend  # Must pass
npm run build --prefix frontend      # Must pass
npm run design:governance --prefix frontend  # Must pass (no new violations)
# Manual: Open page in browser, test interactions
```

## Rollback Plan
If anything breaks after a commit:
```bash
git revert <commit-hash>  # Undo the change
npm run design:governance --prefix frontend  # Confirm clean
```

## Baseline Governance Check
**Before we start**: Capture current baseline
```bash
npm run design:governance --prefix frontend > wave-1-baseline.txt
# Expected: baseline 26 violations (all legacy code, not these 3 pages)
```

## Success Criteria
- [x] All 3 pages migrated
- [x] Zero new violations introduced
- [x] All pages render without console errors
- [x] Manual QA passed (test forms, buttons, links)
- [x] Commit: "Phase 5 Wave 1 complete: Migrate auth + landing pages to primitives"
- [x] Tag: phase-5-wave-1-complete

## Execution Record
- `f933c8f`: Phase 5 Wave 1 (1/3): Migrate auth-page to primitives
- `b24a457`: Phase 5 Wave 1 (2/3): Migrate landing-page to primitives
- `36ab2e8`: Phase 5 Wave 1 (3/3): Migrate auth-callback-page to primitives
- Validation (post-wave): `typecheck`, `build`, `design:governance`, and `test` all pass.

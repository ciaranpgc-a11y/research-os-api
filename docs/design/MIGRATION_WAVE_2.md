# Migration Wave 2: Medium-Risk Pages

## Scope
- src/pages/admin-page.tsx
- src/pages/profile-personal-details-page.tsx
- src/pages/profile-publications-page.tsx
- src/pages/workspaces-page.tsx
- src/pages/profile-collaboration-page.tsx

Reference:
- `docs/design/MIGRATION_BACKLOG.md` flags `src/pages/admin-page.tsx` as Phase 5 Wave 2 (medium).

## Components to Replace
| Old Component | New Primitive | Notes |
|---|---|---|
| ui/button | ButtonPrimitive | Direct replacement |
| ui/input | InputPrimitive | Direct replacement |
| ui/select | SelectPrimitive | Direct replacement |
| ui/card | CardPrimitive | Direct replacement |
| ui/table | TablePrimitive | Replace in this wave where feasible |
| ui/textarea | TextareaPrimitive | Replace in this wave where used |
| ui/badge | BadgePrimitive | Replace in this wave where used |
| ui/tooltip | TooltipPrimitive | Replace in this wave where used |
| ui/sheet | ModalPrimitive | Not always 1:1; convert only if behavior matches |
| ui/tabs | (No new tabs primitive yet) | Defer if no safe mapping in current primitive set |

## Legacy Usage Snapshot (Pre-Migration)
| File | Legacy ui imports found | Identifier footprint (approx) |
|---|---|---|
| src/pages/admin-page.tsx | button, card, input, select | Button 39, Input 7, Select 4, Card 65, Table 26 |
| src/pages/profile-personal-details-page.tsx | button, card, input, select | Button 62, Input 64, Select 6, Card 11, Badge 7 |
| src/pages/profile-publications-page.tsx | button, card, input, select, sheet, table, tabs | Button 47, Input 22, Select 7, Card 4, Table 8, Tabs 5, Sheet 5 |
| src/pages/workspaces-page.tsx | button, input, select, sheet, tooltip | Button 149, Input 21, Select 23, Table 11, Tooltip 4, Sheet 9 |
| src/pages/profile-collaboration-page.tsx | badge, button, card, input, select, table, textarea | Button 56, Input 15, Select 7, Card 14, Table 4, Textarea 3, Badge 8 |

## Per-File Checklist

### admin-page.tsx
- [ ] Replace `Button` imports/usages with `ButtonPrimitive`
- [ ] Replace `Input` imports/usages with `InputPrimitive`
- [ ] Replace `Select` imports/usages with `SelectPrimitive`
- [ ] Replace `Card` imports/usages with `CardPrimitive` subcomponents
- [ ] Evaluate `Table` usage for `TablePrimitive` migration (if behavior parity is safe)
- [ ] Verify medium-risk backlog issues are not worsened (`MIGRATION_BACKLOG.md` Wave 2 entries)
- [ ] Test: `npm run build --prefix frontend` + manual admin flows
- [ ] Commit (file-level): `"Phase 5 Wave 2 (1/5): Migrate admin-page to primitives"`
- [ ] Run governance: no new violations

### profile-personal-details-page.tsx
- [ ] Replace `Button` → `ButtonPrimitive`
- [ ] Replace `Input` → `InputPrimitive`
- [ ] Replace `Select` → `SelectPrimitive`
- [ ] Replace `Card` → `CardPrimitive`
- [ ] Replace badge usages with `BadgePrimitive` where local ui badge exists/appears
- [ ] Test: personal profile edit, save/cancel, validation states
- [ ] Commit (file-level): `"Phase 5 Wave 2 (2/5): Migrate profile-personal-details-page to primitives"`
- [ ] Run governance: no new violations

### profile-publications-page.tsx
- [ ] Replace `Button` → `ButtonPrimitive`
- [ ] Replace `Input` → `InputPrimitive`
- [ ] Replace `Select` → `SelectPrimitive`
- [ ] Replace `Card` → `CardPrimitive`
- [ ] Replace `Table` → `TablePrimitive` where feasible
- [ ] Assess `Sheet` migration path to `ModalPrimitive` (only if behavior parity is safe)
- [ ] `Tabs` migration status is unclear (defer if no canonical tabs primitive exists)
- [ ] Test: filters, table interactions, drilldown/side panel flows
- [ ] Commit (file-level): `"Phase 5 Wave 2 (3/5): Migrate profile-publications-page to primitives"`
- [ ] Run governance: no new violations

### workspaces-page.tsx
- [ ] Replace `Button` → `ButtonPrimitive`
- [ ] Replace `Input` → `InputPrimitive`
- [ ] Replace `Select` → `SelectPrimitive`
- [ ] Replace `Tooltip` → `TooltipPrimitive`
- [ ] Evaluate `Table` replacement with `TablePrimitive`
- [ ] Evaluate `Sheet` replacement with `ModalPrimitive` (behavior parity required)
- [ ] Test: workspace list, filtering, actions, side panel/modal flows
- [ ] Commit (file-level): `"Phase 5 Wave 2 (4/5): Migrate workspaces-page to primitives"`
- [ ] Run governance: no new violations

### profile-collaboration-page.tsx
- [ ] Replace `Button` → `ButtonPrimitive`
- [ ] Replace `Input` → `InputPrimitive`
- [ ] Replace `Select` → `SelectPrimitive`
- [ ] Replace `Card` → `CardPrimitive`
- [ ] Replace `Table` → `TablePrimitive`
- [ ] Replace `Textarea` → `TextareaPrimitive`
- [ ] Replace `Badge` → `BadgePrimitive`
- [ ] Test: collaboration invites, table actions, notes/messages
- [ ] Commit (file-level): `"Phase 5 Wave 2 (5/5): Migrate profile-collaboration-page to primitives"`
- [ ] Run governance: no new violations

## Validation After Each File
```bash
npm run typecheck --prefix frontend  # Must pass
npm run build --prefix frontend      # Must pass
npm run design:governance --prefix frontend  # Must pass (no new violations)
# Manual: Open migrated page in browser and verify main interactions
```

## Rollback Plan
If anything breaks after a file-level commit:
```bash
git revert <commit-hash>
npm run design:governance --prefix frontend
```

## Baseline Governance Check
Before starting Wave 2 execution:
```bash
npm run design:governance --prefix frontend > wave-2-baseline.txt
# Expected: Baseline violations: 26, PASS: No new violations detected
```

## Success Criteria
- [ ] All 5 medium-risk pages migrated (or explicitly deferred with reasons)
- [ ] Zero new governance violations introduced
- [ ] Typecheck/build pass after each file and at wave end
- [ ] Manual QA completed for each migrated page
- [ ] Commit: `"Phase 5 Wave 2 COMPLETE: Medium-risk pages migrated"`
- [ ] Tag: `phase-5-wave-2-complete`

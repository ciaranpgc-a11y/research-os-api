# Migration Wave 3: High-Risk Pages

## Scope
Reference from backlog:
- `src/components/publications/PublicationMetricDrilldownPanel.tsx` (explicitly assigned to **Phase 5 Wave 3** in `MIGRATION_BACKLOG.md`)

High-complexity pages selected for Wave 3 execution:
- `src/pages/profile-publications-page.tsx`
- `src/pages/manuscript-page.tsx`
- `src/pages/manuscript-tables-page.tsx`
- `src/pages/results-page.tsx`
- `src/pages/study-core-page.tsx`
- `src/pages/workspaces-data-library-view.tsx`

## Components to Replace

| Old Component | New Primitive | Complexity | Notes |
|---|---|---|---|
| `ui/button` | `ButtonPrimitive` | Low | Direct replacement (`outline/default/house*` to `secondary/primary`) |
| `ui/input` | `InputPrimitive` | Low | Direct replacement |
| `ui/textarea` | `TextareaPrimitive` | Low | Direct replacement |
| `ui/select` | `SelectPrimitive` + `SelectTrigger/SelectContent/SelectItem/SelectValue` | Medium | Native `<select>` usage must be converted to Radix structure |
| `ui/card` | `CardPrimitive` (+ `CardHeader/CardContent/CardTitle/CardDescription`) | Low | Direct replacement with className parity checks |
| `ui/table` | `TablePrimitive` (+ `TableHead/TableHeaderCell/TableBody/TableRow/TableCell`) | Medium | Maintain sorting/row-click semantics |
| `ui/badge` | `BadgePrimitive` | Low | Map legacy variants to canonical semantic variants |
| `ui/tooltip` | `TooltipPrimitive` (+ provider/trigger/content) | Medium | Preserve hover/focus affordances |
| publication-specific chart wrapper / metric tile / drilldown panel | Keep domain components, migrate only shared primitives + token hooks | High | Preserve custom chart logic, animation choreography, and drilldown behavior |

## Per-Page Checklist

### `src/pages/profile-publications-page.tsx`
- [ ] List all components to replace
- [ ] Verify `Button`, `Input`, `Select`, `Card`, `Table` are primitive-backed
- [ ] Keep `Sheet`/`Tabs` behavior intact (no feature redesign)
- [ ] Confirm drilldown tab interactions unchanged
- [ ] Validate publication filters, sort, row selection, file actions
- [ ] Run validation checklist

Custom styling/overrides:
- Publications drilldown classes (`publications-house-style`) and custom motion classes
- OA status visual states and table column width controls

Migration steps:
1. Replace remaining legacy `ui/*` imports with primitives where equivalent exists.
2. Map legacy button variants to primitive variants.
3. Keep publication domain components and custom motion logic unchanged.
4. Validate tabbed drilldown and files workflow.

### `src/components/publications/PublicationMetricDrilldownPanel.tsx`
- [ ] Replace legacy `Button` usage with `ButtonPrimitive`
- [ ] Keep metric tile and drilldown rendering contract unchanged
- [ ] Preserve chart/tile animation timing and transitions
- [ ] Add/retain house-role semantics where required by backlog
- [ ] Run validation checklist

Custom styling/overrides:
- Dense intrinsic JSX with publication-specific drilldown/tile classes
- Motion-heavy chart/drilldown interaction patterns

Migration steps:
1. Replace shared primitives only (`Button` first).
2. Preserve existing animation and class choreography.
3. Add missing governance-required semantics/roles per backlog entries.

### `src/pages/manuscript-page.tsx`
- [ ] Replace `Badge`, `Button`, `Card`, `Input` with primitives
- [ ] Leave `ScrollArea`, `Separator`, `Sheet` behavior intact
- [ ] Verify editor interactions and table/manuscript actions
- [ ] Run validation checklist

Custom styling/overrides:
- Mixed layout regions and manuscript-specific action bars
- Side-panel (`Sheet`) workflows

Migration steps:
1. Replace low-risk primitives first (`Button`, `Input`, `Card`).
2. Replace badge usages and verify semantic tones.
3. Validate manuscript action controls and sheet flows.

### `src/pages/manuscript-tables-page.tsx`
- [ ] Replace `Badge`, `Button`, `Card`, `Input` with primitives
- [ ] Keep `ScrollArea` and table composition behavior
- [ ] Verify add/edit/remove table row flows
- [ ] Run validation checklist

Custom styling/overrides:
- Dense table composition and inline controls

Migration steps:
1. Replace primitives in top controls and row actions.
2. Validate table rendering and interaction parity.

### `src/pages/results-page.tsx`
- [ ] Replace `Badge`, `Button`, `Card` with primitives
- [ ] Keep `ScrollArea` and `Sheet` drilldown intact
- [ ] Verify filter/search results interactions and transitions
- [ ] Run validation checklist

Custom styling/overrides:
- Result-state cards, badges, and drilldown side panels

Migration steps:
1. Migrate card/button/badge imports and variant mappings.
2. Validate result list actions and panel opening/closing.

### `src/pages/study-core-page.tsx`
- [ ] Replace `Input` with `InputPrimitive`
- [ ] Identify any local ad-hoc buttons/cards for primitive adoption
- [ ] Verify step navigation, validation, and form persistence
- [ ] Run validation checklist

Custom styling/overrides:
- Step panels and validation-driven form flow

Migration steps:
1. Replace input controls first.
2. Audit per-step controls for legacy variants/hardcoded styling.
3. Validate full step progression and saved draft behavior.

### `src/pages/workspaces-data-library-view.tsx`
- [ ] Replace `Button`, `Input`, `Select` with primitives
- [ ] Keep `ScrollArea` behavior unchanged
- [ ] Validate filtering, sorting, and selection interactions
- [ ] Run validation checklist

Custom styling/overrides:
- Data-library specific list/table controls

Migration steps:
1. Replace `Button` and `Input`.
2. Convert `Select` to `SelectPrimitive` structure.
3. Validate filtering/sorting and pagination/list interactions.

## Validation Checklist (Per Page)

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm run design:governance --prefix frontend
```

Manual checks per migrated page:
- [ ] Core interactions work
- [ ] No console errors
- [ ] No visual regression in key workflows

## Complexity Notes

### Publications Page
- Complexity: Very High
- Custom components: chart wrappers, metric tiles, drilldown panels
- Complexity source: custom motion timing, SVG/chart behaviors, multi-tab drilldown
- Migration risk: Medium (replace shared primitives, preserve chart logic)
- Estimated time: 2-3 hours

### Study-Core
- Complexity: High
- Custom components: step panels, form validation, custom layout sections
- Complexity source: step-state orchestration and validation dependencies
- Migration risk: Low-Medium (mostly standard form controls)
- Estimated time: ~2 hours

### Manuscript Page
- Complexity: High
- Custom components: editor actions, sheet-based auxiliary workflows
- Complexity source: dense controls + mixed layout and panel behavior
- Migration risk: Medium
- Estimated time: 2-3 hours

### Manuscript Tables Page
- Complexity: High
- Custom components: table editing controls and inline actions
- Complexity source: interactive table operations and state-heavy rows
- Migration risk: Medium
- Estimated time: ~2 hours

### Results Page
- Complexity: High
- Custom components: result cards, side panel drilldowns
- Complexity source: mixed card/list interactions and status-driven views
- Migration risk: Medium
- Estimated time: 1.5-2.5 hours

### Workspaces Data Library
- Complexity: High
- Custom components: filter/sort controls in data-heavy views
- Complexity source: selection + filtering workflows tied to workspace state
- Migration risk: Medium
- Estimated time: 1.5-2 hours

## Wave 3 Success Criteria

- [ ] All scoped pages/components migrated
- [ ] Zero new governance violations
- [ ] No new console errors
- [ ] Custom chart/visualization logic preserved
- [ ] All forms still functional
- [ ] Manual QA: spot-check at least 3 migrated pages in browser
- [ ] Final commit + tag: `phase-5-wave-3-complete`

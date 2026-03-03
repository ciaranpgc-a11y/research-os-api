# Design-System Alignment Audit

> **Generated:** 2025-01-XX (Updated: 2026-03-03)  
> **Scope:** Tables, Icons, Toolbars, Buttons, Drilldowns  
> **Status:** IMPLEMENTED — P0 items complete

---

## 1. Executive Summary

This audit examines alignment between the codebase and the canonical Approvals standard defined in `frontend/src/stories/design-system/approvals/ApprovalsContent.tsx`. The analysis reveals a **dual architecture** where:

1. **Canonical UI barrel** (`@/components/ui`) provides modern, variant-based components
2. **house-style.ts layer** provides CSS class mappings used extensively across pages

### Key Findings

| Category | Drift Level | Primary Issue |
|----------|-------------|---------------|
| **Buttons** | 🟡 Moderate | Alias variants (housePrimary, ghost) should consolidate; pages mix class constants with canonical Button |
| **Icons** | 🟢 Low | Consistent h-4 w-4 sizing; missing IconButton component (alias to Button) |
| **Tables** | 🟡 Moderate | Direct house-table-* classes in pages bypass canonical Table component |
| **Toolbars** | 🔴 High | No canonical Toolbar primitive; ad-hoc patterns in every page |
| **Drilldowns** | 🟡 Moderate | Well-structured house-drilldown-* classes but no primitive component wrapper |

### Compliance Score

- **Canonical imports from @/components/ui:** 19 page files ✓
- **Legacy re-exports in primitives barrel:** 7 components re-export from Legacy* ⚠️
- **Pages with house-* class usage:** 100+ matches (heavy in workspaces-page, profile-publications-page) ⚠️

---

## 2. The Approved Standard

### 2.1 Canonical Sources

| Source | Path | Purpose |
|--------|------|---------|
| **Approvals Content** | [ApprovalsContent.tsx](src/stories/design-system/approvals/ApprovalsContent.tsx) | Single approval surface with contracts and glossary |
| **Primitives Barrel** | [primitives/index.ts](src/components/primitives/index.ts) | Layout and control primitives |
| **UI Barrel** | [ui/index.ts](src/components/ui/index.ts) | Canonical UI components |
| **Patterns Barrel** | [patterns/index.ts](src/components/patterns/index.ts) | SectionMarker, PanelShell, ChartFrame |
| **Token CSS** | [index.css](src/index.css) | Design token definitions (5107 lines) |
| **House Style** | [house-style.ts](src/lib/house-style.ts) | CSS class mapping system (523 lines) |

### 2.2 Approval Contracts (from ApprovalsContent.tsx)

```
1. Single source of truth: this page is the only active approval surface in Storybook
2. Canonical imports only: primitives, ui, and patterns barrels
3. No ad-hoc tokens, no deep imports, and no legacy composition
4. Token families: spacing, radius, elevation, motion
```

### 2.3 Token Families

| Family | Canonical Tokens |
|--------|------------------|
| **Spacing** | `--space-0` through `--space-8` (0rem to 4rem) |
| **Radius** | `--radius-xs` (0.25rem), `--radius-sm` (0.375rem), `--radius-md` (0.5rem), `--radius-lg` (0.625rem), `--radius-full` (9999px) |
| **Elevation** | `--elevation-xs`, `--elevation-sm`, `--elevation-md`, `--elevation-lg` |
| **Motion Duration** | `--motion-duration-fast` (150ms), `--motion-duration-ui` (180ms), `--motion-duration-base` (220ms), `--motion-duration-slow` (320ms), `--motion-duration-slower` (420ms), `--motion-duration-emphasis` (500ms) |
| **Motion Ease** | `--motion-ease-default` (ease-out), `--motion-ease-elastic` (cubic-bezier), `--motion-ease-chart-series` |

### 2.4 Canonical Component Exports

**From `@/components/ui`:**
- Badge, Button, IconButton (alias), Card, CardHeader, CardTitle, CardDescription, CardContent
- Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- Table, TableBody, TableCell, TableHead, TableHeader, TableRow
- Tabs, TabsContent, TabsList, TabsTrigger
- Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
- ScrollArea, Separator, Textarea, Tooltip, Banner, Modal, SidebarNav

**From `@/components/primitives`:**
- Container, Section, Stack, Row, Grid
- PageHeader, SectionHeader
- CardPrimitive, TablePrimitive, SelectPrimitive, TextareaPrimitive, TooltipPrimitive
- BannerPrimitive, ModalPrimitive, NavigationPrimitive

---

## 3. Drift Scan Results

### 3.1 Legacy Re-exports in Primitives Barrel

The following primitives re-export from `@/components/legacy/primitives/Legacy*`:

| File | Re-exports From |
|------|-----------------|
| [BadgePrimitive.tsx](src/components/primitives/BadgePrimitive.tsx) | `LegacyBadgePrimitive` |
| [ButtonPrimitive.tsx](src/components/primitives/ButtonPrimitive.tsx) | `LegacyButtonPrimitive` |
| [InputPrimitive.tsx](src/components/primitives/InputPrimitive.tsx) | `LegacyInputPrimitive` |
| [SelectPrimitive.tsx](src/components/primitives/SelectPrimitive.tsx) | `LegacySelectPrimitive` |
| [TablePrimitive.tsx](src/components/primitives/TablePrimitive.tsx) | `LegacyTablePrimitive` |
| [TextareaPrimitive.tsx](src/components/primitives/TextareaPrimitive.tsx) | `LegacyTextareaPrimitive` |
| [TooltipPrimitive.tsx](src/components/primitives/TooltipPrimitive.tsx) | `LegacyTooltipPrimitive` |

**Impact:** These create a legacy layer that should eventually be consolidated into the canonical UI barrel.

### 3.2 House-Style Class Usage

**Heavy Usage Files:**

| File | Matches | Key Patterns |
|------|---------|--------------|
| [workspaces-page.tsx](src/pages/workspaces-page.tsx) | 50+ | `house-page-toolbar`, `house-content-container`, `HOUSE_*` constants |
| [profile-publications-page.tsx](src/pages/profile-publications-page.tsx) | 30+ | `houseDrilldown.*`, `houseTypography.*`, `houseActions.*` |
| [profile-personal-details-page.tsx](src/pages/profile-personal-details-page.tsx) | 20+ | `houseTypography.*`, form classes |

**House-style.ts Export Categories:**

```typescript
houseTypography    // buttonText, tableHead, tableCell, etc.
houseSurfaces      // tableShell, tableHead, tableRow, etc.
houseDividers      // soft, strong, section dividers
houseLayout        // containers, grids
houseNavigation    // nav items, sidebar
houseMotion        // chart animations, toggles
houseForms         // input, select, textarea
houseActions       // section tools, action pills
houseTables        // filterInput, filterSelect, sortTrigger
houseCollaborators // chip states, actions
houseDrilldown     // sheet, blocks, tabs, stats
houseChartColors   // accent, positive, warning bars
```

### 3.3 Ad-hoc Spacing Drift

**Pattern:** `space-y-*`, `mt-*`, `mb-*`, `gap-*` Tailwind utilities

| Location | Count | Example |
|----------|-------|---------|
| Pages folder | 100+ matches | `space-y-4`, `mt-3`, `gap-2`, `gap-3` |
| Stories | 50+ matches | Mixed with canonical `--space-*` usage |

**Canonical Alternative:** Use `Stack gap="md"` or `Row gap="sm"` primitives with token-backed spacing.

### 3.4 Hex Color Literals

| File | Line | Usage | Acceptable? |
|------|------|-------|-------------|
| [auth-page.tsx](src/pages/auth-page.tsx) | 843-859 | Brand logo colors (`#A6CE39`, `#4285F4`, etc.) | ✓ Yes (brand assets) |

**All other colors use `hsl(var(--tone-*))` semantic tokens.** ✓

---

## 4. Category Audits

### 4.1 Buttons

#### Canonical Standard

**Component:** `Button` from `@/components/ui/button.tsx`

**Variants (from button.variants.ts):**
```typescript
variant: {
  primary: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
  secondary: `${houseTypography.buttonText} bg-secondary text-secondary-foreground`,
  tertiary: `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted`,
  destructive: `${houseTypography.buttonText} bg-destructive text-destructive-foreground`,
  default: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
  housePrimary: `${houseTypography.buttonText} bg-primary text-primary-foreground`, // ALIAS
  house: `${houseTypography.buttonText} bg-secondary text-secondary-foreground`,    // ALIAS
  outline: `${houseTypography.buttonText} border border-border bg-background`,       // ALIAS to tertiary
  ghost: `${houseTypography.buttonText} border border-border bg-background`,         // DEPRECATED ALIAS
}
size: {
  default: `h-9 px-3`,
  sm: `h-9 rounded-md px-3`,
  lg: 'h-10 rounded-md px-8',
  icon: 'h-9 w-9',
}
```

**Features:**
- `isLoading` prop with spinner
- `loadingText` prop
- `data-ui="button"` and `data-house-role="action-button"` attributes

#### Current Implementation Issues

| Issue | Location | Snippet |
|-------|----------|---------|
| Alias variants not consolidated | [button.variants.ts#L17-20](src/components/ui/button.variants.ts#L17-L20) | `housePrimary`, `house`, `outline`, `ghost` duplicate semantic meanings |
| HOUSE_* class constants in pages | [workspaces-page.tsx#L3095](src/pages/workspaces-page.tsx#L3095) | `className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}` |
| IconButton is just an alias | [ui/index.ts#L3](src/components/ui/index.ts#L3) | `export { Button as IconButton }` |

#### Drift Evidence

**Pages importing canonical Button:** 11 files ✓
- admin-page.tsx, auth-page.tsx, landing-page.tsx, manuscript-page.tsx, manuscript-tables-page.tsx
- profile-collaboration-page.tsx, profile-integrations-page.tsx, profile-manage-account-page.tsx
- results-page.tsx, settings-page.tsx, workspace-exports-page.tsx, workspace-inbox-page.tsx
- workspaces-data-library-view.tsx, workspaces-page.tsx

**Pattern Mix:**
```tsx
// Canonical (GOOD):
<Button onClick={...}>Create workspace</Button>

// With class override (DRIFT):
<Button className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}>
  Create workspace
</Button>
```

#### Recommendations

1. **Consolidate variant aliases:** Remove `housePrimary` (use `primary`), `house` (use `secondary`), `ghost` (use `tertiary`)
2. **Remove HOUSE_* class constants:** Button component should be self-sufficient
3. **Create IconButton component:** Dedicated component with proper accessibility defaults

---

### 4.2 Icons

#### Canonical Standard

**Source:** Lucide React (`lucide-react`)

**Approved Sizes (from ApprovalsContent.tsx):**
```tsx
// Size scale: 14, 16, 18, 20, 24 (px equivalents)
<IconGlyph size={14} />  // Small context
<IconGlyph size={16} />  // Default
<IconGlyph size={18} />  // Emphasis
<IconGlyph size={20} />  // Large
<IconGlyph size={24} />  // Display
```

**Tailwind Equivalents:**
- `h-3.5 w-3.5` = 14px
- `h-4 w-4` = 16px (default)
- `h-5 w-5` = 20px
- `h-6 w-6` = 24px

#### Current Implementation

**Consistent Pattern Found:**
```tsx
// Most pages use h-4 w-4 (16px) consistently:
<Search className="h-4 w-4" />
<Check className="h-4 w-4" />
<X className="h-4 w-4" />
<ChevronDown className="h-4 w-4 text-muted-foreground" />
```

**Files importing Lucide icons:** 15+ page files

**Icon usage locations:**
| File | Icon Usage |
|------|------------|
| [workspaces-page.tsx](src/pages/workspaces-page.tsx) | Check, X, Pencil, RotateCcw, UserMinus, UserPlus, ChevronDown/Up, PanelRight* |
| [profile-publications-page.tsx](src/pages/profile-publications-page.tsx) | FileText, Download, Share2 |
| [manuscript-page.tsx](src/pages/manuscript-page.tsx) | Search |
| [settings-page.tsx](src/pages/settings-page.tsx) | Eye, EyeOff |

#### Drift Evidence

**No significant drift detected.** Icon sizing is consistent at `h-4 w-4` (16px) across pages.

**Minor Variation:**
```tsx
// Some navigation icons use h-5 w-5 (20px) - acceptable for nav context:
<Home className="h-5 w-5" />
<Settings className="h-5 w-5" />
```

#### Recommendations

1. **Document icon size policy:** Formalize 16px default, 20px for nav, 24px for display
2. **Consider icon wrapper component:** Encapsulate size/color defaults
3. **Audit aria-hidden usage:** Icons in buttons should have `aria-hidden="true"`

---

### 4.3 Tables

#### Canonical Standard

**Component:** `Table` from `@/components/ui/table.tsx`

**Structure:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Data Attributes:**
- `data-ui="table-shell"`, `data-house-role="table-shell"`
- `data-ui="table"`, `data-house-role="table"`
- `data-ui="table-header"`, `data-house-role="table-header"`
- `data-ui="table-row"`, `data-house-role="table-row"`
- `data-ui="table-head-cell"`, `data-house-role="table-head-cell"`
- `data-ui="table-cell"`, `data-house-role="table-cell"`

**House-style Integration:**
```typescript
// table.tsx uses these from house-style.ts:
houseSurfaces.tableShell  // 'house-table-shell'
houseSurfaces.tableHead   // 'house-table-head'
houseSurfaces.tableRow    // 'house-table-row'
houseTypography.tableHead // 'house-table-head-text'
houseTypography.tableCell // 'house-table-cell-text'
```

#### Current Implementation Issues

| Issue | Location | Snippet |
|-------|----------|---------|
| Direct CSS class usage | Stories | `<div className="house-table-shell house-table-context-profile">` |
| Filter bar not componentized | [workspaces-page.tsx](src/pages/workspaces-page.tsx) | Ad-hoc filter/sort inputs above table |
| Empty state inconsistency | Various | Some use `<TableCell colSpan={4}>No rows</TableCell>`, others use custom elements |
| No loading skeleton pattern | Component level | `isLoading` prop exists only in `LegacyTablePrimitive` |

#### Drift Evidence

**Direct house-table-* class usage (bypassing Table component):**

| File | Line | Usage |
|------|------|-------|
| [Approved.stories.tsx](src/stories/__archive__/design-system/approved/Approved.stories.tsx#L2812) | 2812+ | `<div className="house-table-shell house-table-context-profile">` |
| [house-table-resize.ts](src/lib/house-table-resize.ts) | 9-17 | Constants for resize handles |

**houseTables export usage:**
```typescript
houseTables.filterInput   // 'house-table-filter-input'
houseTables.filterSelect  // 'house-table-filter-select'
houseTables.sortTrigger   // 'house-table-sort-trigger'
```

These are used in [workspaces-page.tsx](src/pages/workspaces-page.tsx#L3120):
```tsx
<Input className={cn('w-sz-260', HOUSE_INPUT_CLASS, HOUSE_TABLE_FILTER_INPUT_CLASS)} />
```

#### Recommendations

1. **Create TableFilters component:** Encapsulate filter bar pattern
2. **Add loading state to Table:** Port `isLoading` from LegacyTablePrimitive
3. **Standardize empty state:** Create `TableEmptyState` subcomponent
4. **Deprecate direct house-table-* usage:** All styling through component

---

### 4.4 Toolbars

#### Canonical Standard

**No dedicated Toolbar component exists.**

Current pattern relies on:
- CSS class: `.house-page-toolbar` (defined in [index.css#L786](src/index.css#L786))
- Ad-hoc composition with `Input`, `Select`, `Button` in pages

#### Current Implementation

**Only 2 references to toolbar class exist:**

| File | Line | Usage |
|------|------|-------|
| [workspaces-page.tsx](src/pages/workspaces-page.tsx#L3082) | 3082 | `<div className="house-page-toolbar">` |
| [index.css](src/index.css#L786) | 786 | `.house-page-toolbar { ... }` |

**Ad-hoc toolbar patterns in pages:**

```tsx
// workspaces-page.tsx - Create workspace toolbar
<div className="house-page-toolbar">
  <Input ... />
  <Button>Create workspace</Button>
</div>

// workspaces-page.tsx - Filter toolbar
<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
  <div className="flex flex-wrap items-center gap-2">
    <Input ... />
    <SelectPrimitive ... />
  </div>
</div>

// profile-publications-page.tsx - action tools
<div className={houseActions.sectionTools}>
  {/* action buttons */}
</div>
```

#### Drift Evidence

| Pattern | Locations | Consistency |
|---------|-----------|-------------|
| `.house-page-toolbar` | workspaces-page.tsx | Single usage |
| `flex items-center gap-*` | All pages | Inconsistent gap values (2, 3, 4) |
| `houseActions.sectionTools` | profile-publications-page.tsx | Different component approach |

#### Recommendations

1. **Create Toolbar primitive component:**
```tsx
<Toolbar>
  <Toolbar.Group>
    <Input />
    <Select />
  </Toolbar.Group>
  <Toolbar.Actions>
    <Button />
  </Toolbar.Actions>
</Toolbar>
```

2. **Define canonical toolbar layout tokens:**
   - `--toolbar-height: 3rem`
   - `--toolbar-padding: var(--space-3)`
   - `--toolbar-gap: var(--space-2)`

3. **Migrate all ad-hoc toolbars** to use new primitive

---

### 4.5 Drilldowns

#### Canonical Standard

**house-style.ts provides extensive drilldown API:**

```typescript
houseDrilldown = {
  sheet: 'house-drilldown-sheet',
  sheetBody: 'house-drilldown-sheet-body',
  titleBlock: 'house-drilldown-title-block',
  headingBlock: 'house-drilldown-heading-block',
  subheadingBlock: 'house-drilldown-subheading-block',
  contentBlock: 'house-drilldown-content-block',
  title: 'house-drilldown-title',
  titleExpander: 'house-drilldown-title-expander',
  overline: 'house-drilldown-overline',
  sectionLabel: 'house-drilldown-section-label',
  tabTrigger: 'house-drilldown-tab-trigger',
  tabList: 'house-drilldown-tab-list',
  placeholder: 'house-drilldown-placeholder',
  alert: 'house-drilldown-alert',
  microValue: 'house-drilldown-micro-value',
  hint: 'house-drilldown-hint',
  caption: 'house-drilldown-caption',
  chip: 'house-drilldown-chip',
  chipActive: 'house-drilldown-chip-active',
  action: 'house-drilldown-action',
  row: 'house-drilldown-row',
  rowActive: 'house-drilldown-row-active',
  progressTrack: 'house-drilldown-progress-track',
  progressFill: 'house-drilldown-progress-fill',
  statCard: 'house-drilldown-stat-card',
  statTitle: 'house-drilldown-stat-title',
  statValue: 'house-drilldown-stat-value',
  valuePositive: 'house-drilldown-value-positive',
  valueNegative: 'house-drilldown-value-negative',
  statValueEmphasis: 'house-drilldown-stat-value-emphasis',
}
```

**Wrapper component:** Uses `Sheet` from UI barrel

```tsx
<Sheet open={...} onOpenChange={...}>
  <SheetContent>
    <div className={houseDrilldown.sheet}>
      <div className={houseDrilldown.titleBlock}>
        <span className={houseDrilldown.overline}>Publication</span>
        <h2 className={houseDrilldown.title}>Title Here</h2>
      </div>
      <Tabs>
        <TabsList className={houseDrilldown.tabList}>
          <TabsTrigger className={houseDrilldown.tabTrigger}>Overview</TabsTrigger>
        </TabsList>
        <TabsContent className={houseDrilldown.contentBlock}>
          {/* content */}
        </TabsContent>
      </Tabs>
    </div>
  </SheetContent>
</Sheet>
```

#### Current Implementation

**Heavy usage in publications drilldown:**
- [profile-publications-page.tsx](src/pages/profile-publications-page.tsx) - 50+ houseDrilldown.* references

**Tab panel accessibility:**
```tsx
<TabsContent 
  value="overview" 
  className="mt-0" 
  role="tabpanel" 
  id="publication-drilldown-panel-overview" 
  aria-labelledby="publication-drilldown-tab-overview"
>
```

#### Drift Evidence

| Pattern | Issue |
|---------|-------|
| No DrilldownSheet component | Pages compose Sheet + houseDrilldown classes manually |
| Empty state CSS only | `.house-publications-drilldown-empty-state` in index.css, no component |
| Ad-hoc stat cards | `houseDrilldown.statCard` styled divs, not reusable components |

#### Recommendations

1. **Create DrilldownSheet component:**
```tsx
<DrilldownSheet open={...}>
  <DrilldownSheet.Title overline="Publication">
    Title Here
  </DrilldownSheet.Title>
  <DrilldownSheet.Tabs defaultValue="overview">
    <DrilldownSheet.Tab value="overview">Overview</DrilldownSheet.Tab>
    <DrilldownSheet.Panel value="overview">
      {/* content */}
    </DrilldownSheet.Panel>
  </DrilldownSheet.Tabs>
</DrilldownSheet>
```

2. **Create DrilldownStatCard component:**
```tsx
<DrilldownStatCard 
  title="Citations" 
  value={84} 
  emphasis 
  trend="positive" 
/>
```

3. **Create DrilldownEmptyState component**

---

## 5. Cross-Cutting Governance Gaps

### 5.1 Architecture Ambiguity

**Current State:** Two parallel systems coexist:
1. **Canonical UI components** (`@/components/ui`)
2. **house-style.ts class layer** (`@/lib/house-style.ts`)

**Problem:** Pages mix both, leading to inconsistent composition patterns.

**Evidence:**
```tsx
// Pattern A: Canonical component
<Button variant="primary">Submit</Button>

// Pattern B: Canonical + class override
<Button className={HOUSE_PRIMARY_ACTION_BUTTON_CLASS}>Submit</Button>

// Pattern C: Direct house-* class
<div className={houseDividers.soft}>...</div>
```

**Recommendation:** Define clear scope for house-* classes:
- **Allow:** Motion/animation classes, chart styling, semantic tokens
- **Deprecate:** Component-level styling that duplicates UI component props

### 5.2 Missing Component Documentation

| Component | Status | Has Storybook Story | Has API Docs |
|-----------|--------|---------------------|--------------|
| Button | ✓ Canonical | ✓ Yes | ✓ Yes (variants) |
| Table | ✓ Canonical | ✓ Yes | Partial |
| Toolbar | ⚠️ Missing | ✗ No | ✗ No |
| DrilldownSheet | ⚠️ Missing | Partial (Approved.stories) | ✗ No |
| IconButton | ⚠️ Alias only | ✓ Yes | ✗ No |

### 5.3 Accessibility Gaps

| Pattern | Issue | Location |
|---------|-------|----------|
| Icon buttons without aria-label | Some icons in buttons lack labels | Various pages |
| Table loading state | No aria-busy or live region | Table component |
| Drilldown navigation | Tab roving not implemented | profile-publications-page.tsx |

**Positive Finding:** TabsContent panels have proper `role="tabpanel"` and `aria-labelledby` attributes.

### 5.4 Token Usage Consistency

| Token Family | Canonical Ref | Ad-hoc Usage |
|--------------|---------------|--------------|
| Spacing | `--space-*` in CSS | `space-y-*`, `gap-*`, `mt-*` Tailwind |
| Colors | `hsl(var(--tone-*))` | Minimal drift (brand colors only) |
| Radius | `--radius-*` | `rounded-*` Tailwind (acceptable) |
| Motion | `duration-ui` | `transition-*` raw values (some drift) |

---

## 6. Realignment Blueprint

### 6.1 Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Consolidate Button variants | Low | High - reduces cognitive load |
| P0 | Create Toolbar primitive | Medium | High - standardizes all pages |
| P1 | Create DrilldownSheet component | Medium | Medium - cleans up publications page |
| P1 | Deprecate Legacy* re-exports | High | Medium - removes tech debt |
| P2 | Add loading/empty states to Table | Low | Medium - improves UX consistency |
| P2 | Document icon sizing policy | Low | Low - prevents future drift |

### 6.2 Migration Strategy

**Phase 1: Foundation (Week 1)**
1. Consolidate Button variant aliases
2. Create Toolbar component
3. Update Approvals story with new patterns

**Phase 2: Composition (Week 2)**
1. Create DrilldownSheet component
2. Create DrilldownStatCard component
3. Migrate profile-publications-page.tsx

**Phase 3: Cleanup (Week 3-4)**
1. Audit and remove HOUSE_* class constants from pages
2. Create component-level loading/empty states
3. Remove Legacy* re-exports (coordinate with consumers)

### 6.3 File Change Impact

| File | Changes Required |
|------|------------------|
| `button.variants.ts` | Remove alias variants |
| `ui/index.ts` | Export new Toolbar, DrilldownSheet |
| `primitives/*.tsx` | Remove Legacy* re-exports (7 files) |
| `workspaces-page.tsx` | Replace HOUSE_* with component props |
| `profile-publications-page.tsx` | Use DrilldownSheet component |

---

## 7. Beginner Next Actions

### Quick Wins (< 1 hour each)

1. **Document icon sizes:**
   - Add comment in `ApprovalsContent.tsx` defining 16px default, 20px nav, 24px display
   
2. **Create TOOLBAR_STANDARD.md:**
   - Document expected toolbar layout until component exists
   
3. **Add ESLint rule:**
   - Warn on `housePrimary` and `ghost` variant usage

### First Component Task

**Create Toolbar primitive:**

```tsx
// frontend/src/components/primitives/Toolbar.tsx
export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div 
      data-ui="toolbar" 
      data-house-role="toolbar"
      className={cn('house-page-toolbar', className)}
    >
      {children}
    </div>
  )
}

Toolbar.Group = function ToolbarGroup({ children }) {
  return <div className="flex items-center gap-2">{children}</div>
}

Toolbar.Actions = function ToolbarActions({ children }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>
}
```

---

## Appendix A: File Index

### Pages Audited

| File | Lines | Key Patterns |
|------|-------|--------------|
| [admin-page.tsx](src/pages/admin-page.tsx) | 2100+ | SelectPrimitive, Button |
| [auth-page.tsx](src/pages/auth-page.tsx) | 1200+ | Custom auth styling, brand colors |
| [manuscript-page.tsx](src/pages/manuscript-page.tsx) | 800+ | Sheet, ScrollArea |
| [profile-collaboration-page.tsx](src/pages/profile-collaboration-page.tsx) | 2000+ | houseCollaborators.* |
| [profile-publications-page.tsx](src/pages/profile-publications-page.tsx) | 5500+ | houseDrilldown.*, Sheet, Tabs |
| [workspaces-page.tsx](src/pages/workspaces-page.tsx) | 3900+ | house-page-toolbar, HOUSE_* constants |
| [workspaces-data-library-view.tsx](src/pages/workspaces-data-library-view.tsx) | 900+ | Input, SelectPrimitive |

### Components Audited

| File | Purpose |
|------|---------|
| [button.tsx](src/components/ui/button.tsx) | Canonical Button with variants |
| [button.variants.ts](src/components/ui/button.variants.ts) | CVA variant definitions |
| [table.tsx](src/components/ui/table.tsx) | Canonical Table with house-* integration |
| [house-style.ts](src/lib/house-style.ts) | 523 lines of class mappings |
| [index.css](src/index.css) | 5107 lines of token definitions |

---

**End of Audit Report**

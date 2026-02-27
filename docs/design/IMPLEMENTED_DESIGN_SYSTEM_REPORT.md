# IMPLEMENTED DESIGN SYSTEM REPORT

**Repo scanned:** `frontend/` in `research-os-api`  
**Audit type:** As-implemented extraction (no refactor)  
**Scope covered:** `src/components`, `src/pages`, `src/index.css`, `tailwind.config.js`, Storybook (`.storybook/*`, `*.stories.tsx`)

## Audit Method

Commands used (representative):

- `rg --files src/components -g "*.tsx"`
- `rg --files src/pages -g "*.tsx"`
- `rg -n -- "framer-motion|AnimatePresence|\\bmotion\\." src .storybook`
- `rg -n -- "@keyframes|animation:|transition:|transition-property:|transition-duration:|transition-timing-function:|transition-delay:" src/index.css`
- `rg -n --glob "*.tsx" "transition-|duration-|ease-|animate-" src`
- `rg -n --glob "*.tsx" "transitionDuration|transitionTimingFunction|transitionDelay|lineTrackTransition|style=\\{\\{[^\\n]*transition" src`

Scan totals:

- Component files scanned: `42` (`src/components`, excluding stories)
- Page files scanned: `31` (`src/pages`, excluding stories)
- Story files scanned: `11`
- Total scanned TSX files: `84`
- Motion match counts (raw line hits):
  - CSS motion declarations: `123`
  - TSX utility motion classes: `107`
- TSX inline/hook motion declarations: `17`
  - Framer Motion hits: `0`
- Total raw motion hits: `247`

---

## 1) Token & Styling Sources (Source-of-Truth Map)

### 1.1 Source map

| Source | Role in system | Categories represented | Notes |
|---|---|---|---|
| `frontend/src/index.css` | Primary token values + house classes + keyframes | color, spacing-like dimensions, typography, radius, borders, shadows, motion | Core `:root` + `.dark` + all `.house-*` class implementations |
| `frontend/tailwind.config.js` | Token exposure to Tailwind utilities | color, spacing, typography, radius, motion duration | Uses CSS vars (`hsl(var(--...))`, `var(--motion-...)`) |
| `frontend/src/lib/house-style.ts` | Semantic class-name contract (token aliases) | typography, surfaces, dividers, layout, navigation, motion, forms, tables, charts, drilldown | No raw values; maps semantic names -> CSS classes |
| `frontend/src/components/publications/publications-house-style.ts` | Publications-domain aliasing of house semantic classes | publications headings/surfaces/motion/charts/actions/detail/drilldown | Pure pass-through mapping on top of `house-style.ts` |
| `frontend/.storybook/preview.ts` | Storybook runtime theme + CSS loading | all categories indirectly | Imports `../src/index.css`; toggles `.dark` on root |
| `frontend/src/main.tsx` | App runtime CSS loading | all categories indirectly | Imports `@/index.css` |

Key evidence:

- `tailwind.config.js:73-124` maps Tailwind color palette to CSS vars.
- `src/index.css:8-155` defines light theme token values.
- `src/index.css:157-254` defines dark theme token overrides.
- `src/lib/house-style.ts:97-116` defines semantic motion class contract.
- `src/components/publications/publications-house-style.ts:46-65` re-exports motion semantic contract for publications.

### 1.2 Token categories, values, definitions, semantics

#### Color

**Defined in:** `src/index.css:9-105` (light), `src/index.css:158-254` (dark overrides)  
**Exposed in Tailwind:** `tailwind.config.js:73-124`  
**Semantic naming:** Yes (`houseSurfaces`, `houseChartColors`, `houseDrilldown`, `houseTypography` in `house-style.ts`)

Core semantic HSL tokens (light):

- `--background: 0 0% 100%`
- `--foreground: 222 34% 14%`
- `--card: 210 20% 100%`
- `--card-foreground: 222 34% 14%`
- `--muted: 214 22% 98%`
- `--muted-foreground: 218 16% 38%`
- `--border: 214 14% 78%`
- `--ring: 210 22% 42%`
- `--stroke-subtle: 214 20% 94%`
- `--stroke-soft: 214 12% 80%`
- `--stroke-strong: 216 13% 71%`
- `--primary: 201 35% 36%`
- `--accent: 216 30% 22%`
- `--destructive: 2 46% 42%`
- `--status-ok: 164 28% 33%`
- `--status-warn: 34 42% 38%`
- `--status-danger: 3 42% 38%`

Tone scales (light) are fully explicit:

- Neutral: `--tone-neutral-50..950` (`src/index.css:40-50`)
- Positive: `--tone-positive-50..900` (`src/index.css:53-62`)
- Warning: `--tone-warning-50..900` (`src/index.css:64-73`)
- Danger: `--tone-danger-50..900` (`src/index.css:75-84`)
- Accent: `--tone-accent-50..900` (`src/index.css:86-95`)

Brand tokens:

- ORCID/Google/Microsoft colors (`src/index.css:97-105`)

Dark mode equivalents for the same families exist in `.dark` (`src/index.css:157-254`).

#### Spacing

**Defined in:** `tailwind.config.js:46-71`  
**Semantic naming:** Partial (utility-level custom size tokens only; not represented in `house-style.ts`)

Custom sizes:

- `sz-7: 0.4375rem`
- `sz-18: 1.125rem`
- `sz-22: 1.375rem`
- `sz-84: 5.25rem`
- `sz-86: 5.375rem`
- `sz-88: 5.5rem`
- `sz-110: 6.875rem`
- `sz-170: 10.625rem`
- `sz-180: 11.25rem`
- `sz-220: 13.75rem`
- `sz-260: 16.25rem`
- `sz-280: 17.5rem`
- `sz-290: 18.125rem`
- `sz-320: 20rem`
- `sz-340: 21.25rem`
- `sz-360: 22.5rem`
- `sz-420: 26.25rem`
- `sz-520: 32.5rem`
- `sz-560: 35rem`
- `sz-580: 36.25rem`
- `sz-720: 45rem`
- `sz-760: 47.5rem`
- `sz-1320: 82.5rem`
- `sz-1360: 85rem`
- `sz-1380: 86.25rem`

#### Typography

**Defined in:** `src/index.css:109-130`, `tailwind.config.js:26-35`  
**Semantic naming:** Yes (`houseTypography` in `house-style.ts:1-30`)

Typography tokens:

- Base family: `--font-family-base` = `"IBM Plex Sans", Inter, ui-sans-serif, system-ui, ...`
- Size/line pairs:
  - `caption`: `0.75rem / 1rem`
  - `micro`: `0.8125rem / 1.125rem`
  - `label`: `0.875rem / 1.25rem`
  - `body`: `0.9375rem / 1.375rem`
  - `display`: `2rem / 2.25rem`

Tailwind binds these tokens to `text-caption`, `text-micro`, `text-label`, `text-body`, `text-display`.

#### Radius / Borders

**Defined in:** `src/index.css:107`, `tailwind.config.js:125-132`  
**Semantic naming:** Partial (raw radius token + semantic classes for surfaces/forms)

Values:

- `--radius: 0.5rem`
- Tailwind:
  - `rounded-lg: var(--radius)`
  - `rounded-md: calc(var(--radius) - 2px)`
  - `rounded-sm: calc(var(--radius) - 4px)`
- Custom border width:
  - `border-3: 3px`

#### Elevation / Shadows

**Defined in:** mostly `src/index.css` class implementations  
**Semantic naming:** Yes for surfaces (`houseSurfaces`)

Observed pattern:

- Most surfaces intentionally use `box-shadow: none`.
- Exceptions:
  - `house-panel-strong`: inset border effect (`src/index.css:1499-1504`)
  - `house-publications-actions`: inset outline (`src/index.css:819-821`)
  - table column controls/triggers/panel shadows (`src/index.css:2301`, `2333`)
  - publication eye states use inset shadows (`src/index.css:1148-1159`)

#### Motion

**Defined in:** `src/index.css:132-145` + class definitions in `src/index.css:1719-1913`  
**Tailwind exposure:** `tailwind.config.js:36-45`  
**Semantic naming:** Yes (`houseMotion` and publications aliases)

Core motion tokens:

- `--motion-duration-fast: 150ms`
- `--motion-duration-ui: 180ms`
- `--motion-duration-base: 220ms`
- `--motion-duration-medium: 250ms`
- `--motion-duration-slow: 320ms`
- `--motion-duration-slower: 420ms`
- `--motion-duration-emphasis: 500ms`
- `--motion-duration-long: 700ms`
- `--motion-duration-chart-refresh: 1200ms`
- `--motion-duration-chart-toggle: 540ms`
- `--motion-duration-chart-ring-fill: var(--motion-duration-chart-refresh)`
- `--motion-duration-chart-ring-toggle: 1000ms`
- `--motion-duration-chart-series: var(--motion-duration-chart-toggle)`
- `--motion-ease-chart-series: cubic-bezier(0.2, 0.68, 0.16, 1)`

Out-of-token literals (drift candidates):

- `140ms` in publication eye micro-interactions (`src/index.css:1174`, `1179`)
- `duration-200`, `duration-300`, `duration-500`, `duration-700` utilities in multiple TSX files
- `displayModeSwapMs = 220` and a `0.55` split delay in drilldown distribution (`src/components/publications/PublicationsTopStrip.tsx:3580`, `3608`)

---

## 2) Component Inventory (Primitive / Composite / Page)

### 2.1 Primitive inventory

| Primitive | File path | Styling approach | Animation hooks |
|---|---|---|---|
| Button | `frontend/src/components/ui/button.tsx` | Tailwind + `cva` + `houseForms`/`houseTypography` | `transition-[background-color,border-color,color,transform] duration-220 ease-out`, `active:scale-[0.98]` |
| Input | `frontend/src/components/ui/input.tsx` | Tailwind wrapper + `houseForms.input` class token | `transition-colors` + tokenized CSS transitions in `.house-input` |
| Dropdown / Select | No dedicated primitive; class tokens in `src/index.css` + usage in pages/components | Native `<select>` with `houseForms.select` / `.house-dropdown` | `.house-dropdown,.house-select` transition border/bg/shadow (`src/index.css:937-946`) |
| Badge | `frontend/src/components/ui/badge.tsx` | Tailwind + `cva` | `transition-colors` |
| Table | `frontend/src/components/ui/table.tsx` | Tailwind wrappers + `houseSurfaces`/`houseTypography` | row hover transitions via `.house-table-row` (`src/index.css:2210-2211`) |
| Tabs | `frontend/src/components/ui/tabs.tsx` | Radix + Tailwind + `houseMotion.toggleButton` | Button transition inherited from `.house-toggle-button` (`src/index.css:1859-1869`) |
| Tooltip | `frontend/src/components/ui/tooltip.tsx` | Radix + Tailwind | No explicit open/close motion defined |
| Modal/Sheet | `frontend/src/components/ui/sheet.tsx` | Radix Dialog + tailwindcss-animate utilities | Overlay/content `animate-in/out`, open/close durations `200/300ms` |
| Card | `frontend/src/components/ui/card.tsx` | Tailwind + `houseSurfaces.card` | No explicit motion |
| Banner styles | `frontend/src/index.css` (`.house-banner*`) | Global house CSS classes | No explicit animation; static visual tokenization |
| Header frame | `frontend/src/pages/page-frame.tsx` + navigators | Tailwind + house layout tokens | No explicit animation |

### 2.2 Composite inventory

| Composite | File path | Styling approach | Animation hooks |
|---|---|---|---|
| Publications 9-tile strip | `frontend/src/components/publications/PublicationsTopStrip.tsx` | Tailwind + publications house aliases + inline chart styles | `useUnifiedToggleBarAnimation`, `useHouseBarSetTransition`, `useQueuedSlotChartTransition`, `useEasedValue`, `useEasedSeries`, `useEasedSeriesByKey` |
| Publication dashboard tile shell | `frontend/src/components/publications/dashboard-tile-styles.ts` | Tailwind class strings + house motion label transition | Tile hover transitions; label transition class reuse |
| Publications drilldown workspace | `frontend/src/components/publications/PublicationsTopStrip.tsx` (`TotalPublicationsDrilldownWorkspace`) | Tailwind + house drilldown classes | Composes trend charts + category charts + toggle controls |
| Publication detail right panel | `frontend/src/pages/profile-publications-page.tsx` + `.house-publication-detail-*` classes | Tailwind + publication detail class tokens | Sheet open/close animation from `ui/sheet`; tab trigger transitions |
| Data library drilldown panel | `frontend/src/components/workspaces/data-library-drilldown-panel.tsx` | Tailwind + house tokens | Relies on tokenized interactive transitions in shared classes |
| Workspace navigator side panel | `frontend/src/components/layout/workspace-navigator.tsx` | Tailwind + house layout/nav tokens | Shared nav hover/active transitions from `.house-nav-item*` |
| Study navigator side panel | `frontend/src/components/layout/study-navigator.tsx` | Tailwind + house layout/nav tokens | Shared nav transitions |
| Account navigator side panel | `frontend/src/components/layout/account-navigator.tsx` | Tailwind + house layout/nav tokens | Shared nav transitions |
| Publications top strip Storybook story | `frontend/src/components/publications/PublicationsTopStrip.stories.tsx` | Story wrapper only | No additional motion logic |

### 2.3 Page inventory (major pages)

| Page | File path | Styling approach | Motion footprint |
|---|---|---|---|
| Publications page (main) | `frontend/src/pages/profile-publications-page.tsx` | Tailwind + house + publications aliases | Contains `PublicationsTopStrip`; detail sheet open/close; table interaction transitions |
| Publications drilldown (inside page) | `frontend/src/components/publications/PublicationsTopStrip.tsx` | Tailwind + house publications motion classes | Full chart motion framework (load/reload/toggle/hover) |
| Workspaces home | `frontend/src/pages/workspaces-page.tsx` | Tailwind + house tokens | Mostly interactive UI transitions; no chart motion system |
| Workspaces data library view | `frontend/src/pages/workspaces-data-library-view.tsx` | Tailwind + house tokens | Spinner/util transitions only |
| Profile integrations | `frontend/src/pages/profile-integrations-page.tsx` | Tailwind + house tokens | Metric pulse/scale transforms, width transitions (`duration-500`, `duration-700`) |
| Profile personal details | `frontend/src/pages/profile-personal-details-page.tsx` | Tailwind + house tokens | Many utility transitions (`duration-150/200/700`) |
| Study core page | `frontend/src/pages/study-core-page.tsx` | Tailwind + global class | `wizard-step-transition` (fade+slide) |
| Manuscript page | `frontend/src/pages/manuscript-page.tsx` | Tailwind | Utility transitions + loading spinners |
| Results page | `frontend/src/pages/results-page.tsx` | Tailwind + house tokens | Spinner utility animations |
| Auth page | `frontend/src/pages/auth-page.tsx` | Tailwind | Form utility transitions + spinners |

Full page file list scanned: `31` files (`src/pages/*.tsx` excluding stories).

---

## 3) Motion Inventory (Exhaustive Scan Results)

### 3.1 Framer Motion scan

- **Result:** `not found`
- Query: `framer-motion|AnimatePresence|motion.*`
- Files scanned: `src/**`, `.storybook/**`

### 3.2 CSS motion declarations (`src/index.css`)

Key chart motion primitives:

- `@keyframes house-chart-frame-load` (`src/index.css:1733-1744`)
- `@keyframes house-chart-static-load` (`src/index.css:1746-1753`)
- `.house-motion-enter` uses chart frame load animation (`src/index.css:1755-1760`)
- `.house-motion-static-enter` uses static opacity-only load (`src/index.css:1768-1773`)
- `.house-chart-scale-*` classes animate axis/mean layers (`src/index.css:1781-1807`)
- `.house-toggle-chart-bar` and `.house-toggle-chart-swap` transition transform/filter/opacity (`src/index.css:1876-1888`)
- `.house-chart-series-by-slot .house-chart-scale-mean-line { transition: none; }` (`src/index.css:1900-1903`)

Global motion declarations count in CSS: `123` line hits.

### 3.3 TSX utility class motion scan

Files with utility motion classes (exhaustive file set):

- `src/components/auth/LoginCard.stories.tsx`
- `src/components/auth/LoginCard.tsx`
- `src/components/layout/insight-panel.tsx`
- `src/components/layout/top-bar.tsx`
- `src/components/publications/PublicationsTopStrip.tsx`
- `src/components/study-core/Step1Panel.tsx`
- `src/components/study-core/Step2Panel.tsx`
- `src/components/study-core/StepContext.tsx`
- `src/components/study-core/StepDraftReview.tsx`
- `src/components/study-core/StepLinkQcExport.tsx`
- `src/components/study-core/StepPlan.tsx`
- `src/components/study-core/StepRun.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/sheet.tsx`
- `src/pages/admin-page.tsx`
- `src/pages/auth-callback-page.tsx`
- `src/pages/auth-page.tsx`
- `src/pages/manuscript-page.tsx`
- `src/pages/orcid-callback-page.tsx`
- `src/pages/profile-integrations-page.tsx`
- `src/pages/profile-manage-account-page.tsx`
- `src/pages/profile-personal-details-page.tsx`
- `src/pages/profile-publications-page.tsx`
- `src/pages/qc-dashboard-page.tsx`
- `src/pages/results-page.tsx`
- `src/pages/settings-page.tsx`
- `src/pages/workspaces-data-library-view.tsx`
- `src/pages/workspaces-page.tsx`

Utility motion class line-hit count: `107`.

### 3.4 Publications page + drilldown motion table

Legend:

- <span style="color:#166534"><strong>GREEN</strong></span> = aligned with drilldown bar-language
- <span style="color:#b45309"><strong>AMBER</strong></span> = partially aligned
- <span style="color:#b91c1c"><strong>RED</strong></span> = drift/conflict

| Component / chart | Trigger | Property affected | Duration | Delay | Easing | Includes opacity fade | Includes stagger | Gold-standard drilldown style | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `PublicationsPerYearChart` (tile `this_year_vs_last`) | load/reload (`refreshAnimationEpoch`) | bar `scaleY`, value interpolation, hover transform | `540ms` series | `220ms` start gate | `--motion-ease-chart-series` | No | Yes (`index * 18ms`, capped `220ms`) | Yes (bar language baseline) | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:2321-2339`, `2621-2626`; `index.css:1876-1888` |
| `PublicationsPerYearChart` (drilldown trends, toggle enabled) | toggle `1y/3y/5y/all` + reload | bar structure swap + value easing + axis tick/title + mean line | `540ms` series; collapse phase `200ms` | `0ms` toggle path (`enableWindowToggle`), otherwise `220ms` | chart bezier token | No | Yes (bar stagger) | Yes | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:2326-2333`, `505-633`, `2390-2395`, `2579-2586` |
| `PublicationCategoryDistributionChart` (drilldown publication/article type) | toggle window/value mode, display mode swap | bars, y-axis/ticks/title, chart/table panel swap | `540ms` series; display-mode swap `220ms` | display swap midpoint `~121ms` (`0.55 * 220`) | chart bezier for bars | Yes on panel swap (`house-motion-enter/exit`) | No bar stagger | Bar transitions: Yes; panel swap: No | <span style="color:#b45309"><strong>AMBER</strong></span> | `PublicationsTopStrip.tsx:3772-3830`, `4018-4023`, `4073-4078`, `3580`, `3608` |
| `TotalCitationsModeChart` | load/reload | bar `scaleY`, value easing, hover transform | `540ms` | `220ms` | chart bezier | No | No | Mostly yes | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:1553-1565`, `1646-1650` |
| `MomentumTilePanel` | reload + toggle (`12m/5y`) | slot-based value/y-ratio interpolation, bar `scaleY` | `540ms` | `220ms` reload gate | chart bezier | No | No | Same-count toggle style | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:2852-2873`, `2973-2977` |
| `HIndexTrajectoryPanel` | reload + toggle (`trajectory/needed`) | slot transition values/y-ratios, bar `scaleY` | `540ms` | `220ms` reload gate | chart bezier | No | No | Same-count toggle style | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:5385-5415`, `5496-5500` |
| `HIndexYearChart` / `HIndexNeedsChart` | reload / mode-driven collapse/expand | keyed value + y-ratio easing, bar `scaleY` | `540ms` | `220ms` | chart bezier | No | No | Same-count bar style | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:1923-1953`, `5154-5184` |
| `ImpactConcentrationPanel` | reload | ring arc dash + color; container enter state | ring arc `1200ms` | `220ms` | chart bezier | **Yes** (`house-motion-static-enter` opacity fade) | No | No | <span style="color:#b91c1c"><strong>RED</strong></span> | `PublicationsTopStrip.tsx:2715-2725`, `2754-2757`; `index.css:1746-1753`, `1768-1773` |
| `FieldPercentilePanel` | reload + threshold toggle | ring arc dash + color | `1000ms` (`chart-ring-toggle`) | `220ms` reload gate | chart bezier | No | No | Ring-specific (not bar style) | <span style="color:#b45309"><strong>AMBER</strong></span> | `PublicationsTopStrip.tsx:3059-3063`, `3121-3124`; `index.css:143`, `2092-2098` |
| `AuthorshipStructurePanel` | reload | progress bar `width` | `1200ms` (`chart-refresh`) | `220ms` gate | chart bezier | No | No | Different from bar transform model | <span style="color:#b45309"><strong>AMBER</strong></span> | `PublicationsTopStrip.tsx:3169`, `3202-3206` |
| `CollaborationStructurePanel` | reload | progress bar `width` | `1200ms` (`chart-refresh`) | `220ms` gate | chart bezier | No | No | Different from bar transform model | <span style="color:#b45309"><strong>AMBER</strong></span> | `PublicationsTopStrip.tsx:3382`, `3419-3422` |
| `InfluentialTrendPanel` | reload | line `stroke-dashoffset` track-in | `1200ms` (`chart-refresh`) | `220ms` gate | chart bezier | No | No | Line-specific | <span style="color:#166534"><strong>GREEN</strong></span> | `PublicationsTopStrip.tsx:5656-5660`, `5674-5676`, `5698-5701` |
| Publication detail `Sheet` | open/close | overlay/content animation (Radix + tailwindcss-animate) | open `300ms`, close `200ms` | state-driven | `ease-in-out` | likely (plugin animate-in/out) | No | Not part of chart language | <span style="color:#b45309"><strong>AMBER</strong></span> | `ui/sheet.tsx:20`, `39-41`; usage `profile-publications-page.tsx:2722-2730` |

### 3.5 Mismatch flags specific to Publications + Drilldown

1. Impact concentration uses container fade (`house-motion-static-enter`) while bar charts avoid fade.
2. Field percentile uses `ring-toggle` duration (`1000ms`) for both refresh and toggle, unlike bar toggle (`540ms`) and chart refresh (`1200ms`).
3. Authorship/collaboration use width interpolation (`1200ms`) instead of bar transform path (`540ms`) used by gold-standard bar charts.
4. Publication distribution display-mode swap uses panel fade/blur translation (`house-motion-enter/exit`) and a custom split delay (`0.55 * 220`).
5. Slot-chart toggles (momentum/h-index) have no stagger, while publication trend bars can stagger.

---

## 4) Drift Analysis (What Differs That Should Be Unified)

### 4.1 Drift map by chart class

| Class | Current load/reload behavior | Current toggle behavior | Drift summary |
|---|---|---|---|
| Bar chart, no toggle | Uses `useUnifiedToggleBarAnimation` + series easing; generally `220ms` gate + `540ms` transform/value | N/A | Mostly aligned |
| Bar chart, toggle same-count | Uses slot/keyed easing (`540ms`) with chart-bezier | Smooth, no structure swap; no stagger in some panels | Minor variation (stagger present in some, absent in others) |
| Bar chart, toggle different-count | `useHouseBarSetTransition` collapse/swap + value easing + axis transition | Handles bar count changes with collapse/swap | Gold standard is present (publication trend + type) |
| Ring chart with toggle | Field percentile ring uses `1000ms` ring duration token | Same token for refresh + toggle | Different timing family from bar charts |
| Ring chart without toggle | Impact concentration ring uses `1200ms` + static container fade | N/A | Unwanted fade risk + different language from bars |
| Line chart | Influential trend line track-in (`1200ms`) | No toggle | Acceptable as line-specific language |

### 4.2 Same intent, different numbers (examples)

| Intent | Value A | Value B | Evidence |
|---|---|---|---|
| UI hover/interaction transitions | `--motion-duration-ui` = `180ms` | literal `140ms` | `src/index.css:133` vs `src/index.css:1174` |
| Chart toggle / series | `540ms` (`--motion-duration-chart-series`) | `1000ms` (`--motion-duration-chart-ring-toggle`) | `src/index.css:144` vs `143` |
| Chart refresh | `1200ms` (`--motion-duration-chart-refresh`) | panel swap `220ms` | `src/index.css:140` vs `PublicationsTopStrip.tsx:3580` |
| Modal open/close | `300ms/200ms` (Sheet) | chart refresh `1200ms` | `ui/sheet.tsx:39` vs `src/index.css:140` |
| Profile micro transitions | `duration-500`, `duration-700` | house UI token `180ms` | `profile-integrations-page.tsx:886-907`, `953` |

### 4.3 Unwanted fades / container animation

| Item | Fade present? | Evidence | Drift |
|---|---|---|---|
| Impact concentration container | Yes | `chartVisible ? HOUSE_CHART_RING_ENTERED_CLASS ...` (`PublicationsTopStrip.tsx:2724`) + `house-motion-static-enter` opacity animation (`index.css:1768-1773`) | Should be removed if chart containers are intended static on refresh |
| Publication distribution display-mode panel | Yes | `HOUSE_CHART_ENTERED_CLASS / HOUSE_CHART_EXITED_CLASS` (`PublicationsTopStrip.tsx:4019`, `4075`) + `house-chart-frame-load` keyframes include opacity/blur/translate (`index.css:1733-1744`) | Different language from direct bar morph |

### 4.4 Trends vs publication type language

- Publication type drilldown (`PublicationCategoryDistributionChart`) uses full different-count strategy (`useHouseBarSetTransition` + axis interpolation), which is currently the richest implementation.
- Trends-over-time drilldown (`PublicationsPerYearChart` with toggles) also uses structure-aware bar swap and axis interpolation, but includes per-index stagger and optional mean-line axis transitions.
- Net: these two are close but not identical; stagger behavior and panel fade handling diverge depending on branch/state.

### 4.5 Toggle consistency gaps

- Ring components are not using the same toggle language as bar charts by design, but timing families differ significantly (`1000ms` vs `540ms`).
- Progress-style bars (authorship/collaboration) use width transitions and bypass the reusable bar transform classes; this is a deliberate different implementation path and a standardization gap.

---

## 5) Proposed Standardization (Minimal Canonical Set, No Refactor Yet)

### 5.1 Canonical motion token set (proposed)

Keep existing tokens but formalize usage contracts:

- `--motion-duration-ui` (`180ms`): controls, hover/focus, pills/chips/tabs
- `--motion-duration-chart-toggle` (`540ms`): **all bar value/toggle interpolation**
- `--motion-duration-chart-refresh` (`1200ms`): **all chart load/reload enter**
- `--motion-delay-chart-refresh-kick` (`220ms`): pre-animation gate for reload
- `--motion-duration-chart-structure-swap` (`200ms`): bar-count structure collapse/swap
- `--motion-duration-chart-ring-toggle` (`1000ms`): ring-specific toggles only
- `--motion-ease-chart-series` (`cubic-bezier(0.2, 0.68, 0.16, 1)`): chart interpolation easing

### 5.2 Canonical motion classes / variants (proposed)

- `page-load`
- `tile-load`
- `chart-load`
- `toggle-same-count`
- `toggle-different-count`
- `ring-toggle`
- `ring-refresh`
- `line-load`
- `ui-hover-focus`

### 5.3 Mapping: existing component -> canonical class target

| Existing component | Should use canonical class |
|---|---|
| `PublicationsPerYearChart` (tile and drilldown) | `chart-load` + `toggle-different-count` |
| `PublicationCategoryDistributionChart` | `chart-load` + `toggle-different-count` |
| `MomentumTilePanel` | `chart-load` + `toggle-same-count` |
| `HIndexTrajectoryPanel` | `chart-load` + `toggle-same-count` |
| `HIndexYearChart`, `HIndexNeedsChart` | `chart-load` + `toggle-same-count` |
| `TotalCitationsModeChart` | `chart-load` (same-count, no explicit toggle UI) |
| `ImpactConcentrationPanel` | `ring-refresh` (without container fade) |
| `FieldPercentilePanel` | `ring-refresh` + `ring-toggle` |
| `AuthorshipStructurePanel`, `CollaborationStructurePanel` | either `chart-load` (bar transform model) or dedicated `progress-load`; avoid one-off width timing |
| `InfluentialTrendPanel` | `line-load` |
| `ui/sheet` | `page-load`/`panel-load` family separate from chart classes |

### 5.4 Class taxonomy check against requested groups

Requested groups covered:

- Bar charts without toggle
- Bar charts with toggle (same-count)
- Bar charts with toggle (different-count)
- Ring charts with toggle
- Ring charts without toggle
- Line charts

Additional types worth tracking (currently present):

- Modal/sheet open-close motion
- Spinner/loading indicators (`animate-spin`)
- Form/list micro-interactions (chips, rows, action icons)

---

## Appendix A: Storybook Coverage Notes

- Storybook includes all `*.stories.tsx` (`.storybook/main.ts:7`).
- Storybook uses app tokens by importing `src/index.css` (`.storybook/preview.ts:6`).
- Storybook theme toggles `.dark` class on `documentElement` (`.storybook/preview.ts:27`, `37`).
- No Storybook-only token/motion system was found.

## Appendix B: Key Evidence Snippets

1. Chart refresh/toggle tokens:

```css
/* src/index.css:140-145 */
--motion-duration-chart-refresh: 1200ms;
--motion-duration-chart-toggle: 540ms;
--motion-duration-chart-ring-toggle: 1000ms;
--motion-duration-chart-series: var(--motion-duration-chart-toggle);
--motion-ease-chart-series: cubic-bezier(0.2, 0.68, 0.16, 1);
```

2. Chart enter keyframes include fade/blur/translate:

```css
/* src/index.css:1733-1743 */
@keyframes house-chart-frame-load {
  from { opacity: 0; transform: translateY(0.25rem) scale(0.985); filter: blur(0.4px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
```

3. Impact concentration uses static-enter class + ring transitions:

```tsx
/* PublicationsTopStrip.tsx:2724-2725, 2756 */
chartVisible ? HOUSE_CHART_RING_ENTERED_CLASS : HOUSE_CHART_RING_EXITED_CLASS
transition: `${HOUSE_RING_ARC_REFRESH_TRANSITION}, ${HOUSE_RING_COLOR_REFRESH_TRANSITION}`
```

4. Different-count bar strategy exists:

```tsx
/* PublicationsTopStrip.tsx:3772-3776 */
const swapTransition = useHouseBarSetTransition({
  bars: activeBars,
  animationKey,
  enabled: hasBars,
})
```

5. Reload epoch trigger:

```tsx
/* PublicationsTopStrip.tsx:5924-5927 */
if (wasLoadingRef.current && !loading) {
  setRefreshAnimationEpoch((current) => current + 1)
}
```

## Appendix C: Raw Motion Occurrence Index (Exhaustive)

### C.1 Framer Motion query output

```text
NOT_FOUND
```

### C.2 CSS transition/animation declarations (rontend/src/index.css)

```text
490:    transition-property: background-color, color;
491:    transition-duration: var(--motion-duration-ui);
492:    transition-timing-function: ease-out;
513:    transition: background-color var(--motion-duration-ui) ease-out;
601:    transition-property: background-color, color, transform;
602:    transition-duration: var(--motion-duration-ui);
603:    transition-timing-function: ease-out;
617:    transition-property: background-color, opacity, transform;
618:    transition-duration: var(--motion-duration-base);
619:    transition-timing-function: ease-out;
653:    transition-property: background-color, color, border-color;
654:    transition-duration: var(--motion-duration-ui);
655:    transition-timing-function: ease-out;
734:    transition-property: background-color, color, border-color;
735:    transition-duration: var(--motion-duration-ui);
736:    transition-timing-function: ease-out;
871:    transition-property: background-color, color, border-color, box-shadow;
872:    transition-duration: var(--motion-duration-ui);
873:    transition-timing-function: ease-out;
912:    transition-property: border-color, box-shadow, background-color;
913:    transition-duration: var(--motion-duration-ui);
914:    transition-timing-function: ease-out;
943:    transition-property: border-color, box-shadow, background-color;
944:    transition-duration: var(--motion-duration-ui);
945:    transition-timing-function: ease-out;
992:    transition-property: border-color, box-shadow, background-color;
993:    transition-duration: var(--motion-duration-ui);
994:    transition-timing-function: ease-out;
1022:    transition-property: background-color, color, transform, box-shadow;
1023:    transition-duration: var(--motion-duration-ui);
1024:    transition-timing-function: ease-out;
1086:    transition-property: background-color, color, transform, box-shadow;
1087:    transition-duration: var(--motion-duration-ui);
1088:    transition-timing-function: ease-out;
1173:    transition-property: background-color, border-color, color, box-shadow;
1174:    transition-duration: 140ms;
1175:    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
1179:    transition: color 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
1215:    transition-property: background-color, color;
1216:    transition-duration: var(--motion-duration-ui);
1217:    transition-timing-function: ease-out;
1230:    transition-property: background-color, color, transform, box-shadow;
1231:    transition-duration: var(--motion-duration-ui);
1232:    transition-timing-function: ease-out;
1251:    transition-property: background-color, color, transform, box-shadow;
1252:    transition-duration: var(--motion-duration-ui);
1253:    transition-timing-function: ease-out;
1295:    transition-property: border-color, background-color, color;
1296:    transition-duration: var(--motion-duration-ui);
1297:    transition-timing-function: ease-out;
1372:    transition-property: border-color, color, background-color;
1373:    transition-duration: var(--motion-duration-ui);
1374:    transition-timing-function: ease-out;
1398:    transition-property: color, background-color;
1399:    transition-duration: var(--motion-duration-ui);
1400:    transition-timing-function: ease-out;
1728:    transition-property: opacity, transform, filter;
1729:    transition-duration: var(--motion-duration-chart-refresh);
1730:    transition-timing-function: ease-out;
1733:  @keyframes house-chart-frame-load {
1746:  @keyframes house-chart-static-load {
1759:    animation: house-chart-frame-load var(--motion-duration-chart-refresh) ease-out both;
1772:    animation: house-chart-static-load var(--motion-duration-chart-refresh) ease-out both;
1782:    transition-property: bottom;
1783:    transition-duration: var(--motion-duration-chart-series);
1784:    transition-timing-function: var(--motion-ease-chart-series);
1789:    transition-property: bottom, opacity;
1790:    transition-duration: var(--motion-duration-chart-series);
1791:    transition-timing-function: var(--motion-ease-chart-series);
1796:    transition-property: left;
1797:    transition-duration: var(--motion-duration-chart-series);
1798:    transition-timing-function: var(--motion-ease-chart-series);
1802:    transition-property: bottom, opacity;
1803:    transition-duration: var(--motion-duration-chart-series);
1804:    transition-timing-function: var(--motion-ease-chart-series);
1805:    transition-delay: 0ms;
1812:      animation: none;
1819:      transition: none;
1826:    transition: transform var(--motion-duration-chart-ring-toggle) cubic-bezier(0.22, 1, 0.36, 1), opacity var(--motion-duration-chart-ring-toggle) ease-out;
1854:    transition-property: left, width;
1855:    transition-duration: var(--motion-duration-slow);
1856:    transition-timing-function: ease-out;
1867:    transition-property: color, transform;
1868:    transition-duration: var(--motion-duration-medium);
1869:    transition-timing-function: ease-out;
1877:    transition-property: transform, filter, box-shadow;
1878:    transition-duration: var(--motion-duration-chart-series);
1879:    transition-timing-function: var(--motion-ease-chart-series);
1884:    transition-property: transform, filter, box-shadow, opacity;
1885:    transition-duration: var(--motion-duration-chart-series);
1886:    transition-timing-function: var(--motion-ease-chart-series);
1891:    transition-property: transform, filter, box-shadow, opacity;
1895:    transition-property: transform, filter, box-shadow, opacity;
1896:    transition-duration: var(--motion-duration-chart-series);
1901:    transition: none;
1906:    transition: none;
1910:    transition-property: opacity, transform;
1911:    transition-duration: var(--motion-duration-base);
1912:    transition-timing-function: ease-out;
2092:    transition-duration: var(--motion-duration-chart-ring-toggle);
2093:    transition-timing-function: var(--motion-ease-chart-series);
2097:    transition-duration: var(--motion-duration-chart-ring-toggle);
2098:    transition-timing-function: var(--motion-ease-chart-series);
2200:    transition-property: color;
2201:    transition-duration: var(--motion-duration-ui);
2202:    transition-timing-function: ease-out;
2211:    transition: background-color var(--motion-duration-ui) ease-out;
2240:    transition: opacity var(--motion-duration-fast) ease-out;
2273:    transition: opacity var(--motion-duration-fast) ease-out;
2438:    transition: background-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out;
2506:    transition-property: border-color, background-color, color, box-shadow;
2507:    transition-duration: var(--motion-duration-ui);
2508:    transition-timing-function: ease-out;
2549:    transition-property: border-color, background-color, color, box-shadow;
2550:    transition-duration: var(--motion-duration-ui);
2551:    transition-timing-function: ease-out;
2637:    transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out;
2662:    transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out;
2678:    transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out;
2966:    transition: background-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out;
2988:    transition: border-left-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out;
3138:@keyframes wizard-fade-slide {
3151:  animation: wizard-fade-slide var(--motion-duration-base) ease-out;
```

### C.3 TSX utility motion classes (rontend/src/**/*.tsx)

```text
frontend/src\pages\admin-page.tsx:940:                            'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
frontend/src\pages\auth-callback-page.tsx:108:                <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\auth-page.tsx:716:    'flex rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card transition-colors focus-within:border-[hsl(var(--auth-brand-accent))] focus-within:ring-2 focus-within:ring-[hsl(var(--auth-brand-accent))]'
frontend/src\pages\auth-page.tsx:718:    'inline-flex h-10 w-10 shrink-0 items-center justify-center border-l border-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-600))] transition-colors hover:text-[hsl(var(--auth-brand-navy))] focus-visible:outline-none'
frontend/src\pages\auth-page.tsx:722:    'text-label font-medium text-[hsl(var(--tone-neutral-600))] underline underline-offset-2 transition-colors hover:text-[hsl(var(--auth-brand-navy))]'
frontend/src\pages\auth-page.tsx:859:              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\auth-page.tsx:980:                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\auth-page.tsx:1091:              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\components\auth\LoginCard.stories.tsx:62:        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\components\auth\LoginCard.tsx:34:  'inline-flex h-9 items-center justify-center rounded-md border border-transparent px-3 text-label font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--auth-brand-accent))]'
frontend/src\components\auth\LoginCard.tsx:126:                    'inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-label font-medium transition-colors',
frontend/src\components\layout\insight-panel.tsx:766:            {loadingInsight && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
frontend/src\components\study-core\Step1Panel.tsx:39:const CARD_TRANSITION_CLASS = 'transition-all duration-300 ease-out'
frontend/src\components\study-core\Step2Panel.tsx:318:            {loadingQuestion ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
frontend/src\components\study-core\Step2Panel.tsx:332:              className={`h-full transition-all ${
frontend/src\components\study-core\Step2Panel.tsx:504:              {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
frontend/src\components\study-core\Step2Panel.tsx:513:              {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
frontend/src\components\layout\top-bar.tsx:194:                {isSigningOut ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
frontend/src\components\publications\PublicationsTopStrip.tsx:432:const HOUSE_RING_ARC_REFRESH_TRANSITION = 'stroke-dasharray var(--motion-duration-chart-ring-fill) var(--motion-ease-chart-series), stroke-dashoffset var(--motion-duration-chart-ring-fill) var(--motion-ease-chart-series)'
frontend/src\components\publications\PublicationsTopStrip.tsx:433:const HOUSE_RING_COLOR_REFRESH_TRANSITION = 'stroke var(--motion-duration-chart-ring-fill) var(--motion-ease-chart-series)'
frontend/src\components\publications\PublicationsTopStrip.tsx:434:const HOUSE_RING_ARC_TOGGLE_TRANSITION = 'stroke-dasharray var(--motion-duration-chart-ring-toggle) var(--motion-ease-chart-series), stroke-dashoffset var(--motion-duration-chart-ring-toggle) var(--motion-ease-chart-series)'
frontend/src\components\publications\PublicationsTopStrip.tsx:435:const HOUSE_RING_COLOR_TOGGLE_TRANSITION = 'stroke var(--motion-duration-chart-ring-toggle) var(--motion-ease-chart-series)'
frontend/src\components\publications\PublicationsTopStrip.tsx:453:    'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out',
frontend/src\components\publications\PublicationsTopStrip.tsx:3204:                  transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3205:                  transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3421:                    transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3422:                    transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:4759:                          'relative flex min-w-[1.95rem] flex-1 items-end rounded border border-transparent transition-all duration-200',
frontend/src\components\publications\PublicationsTopStrip.tsx:4769:                            'block w-full rounded transition-[height,filter] duration-220 ease-out',
frontend/src\components\publications\PublicationsTopStrip.tsx:4875:              className={cn('inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors', HOUSE_DRILLDOWN_ACTION_CLASS)}
frontend/src\components\publications\PublicationsTopStrip.tsx:5550:              transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:5551:              transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:5676:    : 'stroke-dashoffset var(--motion-duration-chart-refresh) var(--motion-ease-chart-series)'
frontend/src\pages\manuscript-page.tsx:297:                  className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`}
frontend/src\pages\manuscript-page.tsx:336:                            className="h-2 rounded-full bg-primary transition-all"
frontend/src\pages\manuscript-page.tsx:420:                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\manuscript-page.tsx:448:                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\manuscript-page.tsx:481:                              {savingClaimCitations ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
frontend/src\pages\manuscript-page.tsx:515:                {exportingClaimCitations ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
frontend/src\components\study-core\StepContext.tsx:716:        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
frontend/src\components\study-core\StepDraftReview.tsx:189:                    {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepDraftReview.tsx:193:                    {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepPlan.tsx:786:              {assetBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepPlan.tsx:790:              {uploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepPlan.tsx:795:              {profileBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepPlan.tsx:878:              {questionBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}Next question
frontend/src\components\study-core\StepPlan.tsx:905:          <div className="flex gap-2"><Button type="button" className="house-button-action-primary text-sm font-semibold" onClick={() => void generatePlan()} disabled={toolBusy}>{toolBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}Generate manuscript plan</Button><Button type="button" variant="outline" onClick={() => setPhase('data')}>Back to data</Button></div>
frontend/src\components\study-core\StepPlan.tsx:914:              <Button type="button" variant="outline" onClick={() => planJson && void savePlan(planJson)} disabled={!planJson || saveBusy}>{saveBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save plan</Button>
frontend/src\components\study-core\StepPlan.tsx:1162:                    <Button type="button" size="sm" variant="outline" onClick={() => sectionInputRef.current?.click()} disabled={sectionUploadBusy}>{sectionUploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}Upload and attach</Button>
frontend/src\components\ui\badge.tsx:7:  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
frontend/src\components\ui\input.tsx:13:        `flex h-9 w-full rounded-md px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 ${houseForms.input}`,
frontend/src\components\study-core\StepRun.tsx:666:        {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
frontend/src\components\study-core\StepRun.tsx:743:              {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
frontend/src\components\study-core\StepRun.tsx:773:                  {busy === 'cancel' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1 h-3.5 w-3.5" />}
frontend/src\components\study-core\StepRun.tsx:782:                  {busy === 'retry' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
frontend/src\pages\orcid-callback-page.tsx:58:                <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\components\study-core\StepLinkQcExport.tsx:215:          {busy === 'qc' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
frontend/src\components\study-core\StepLinkQcExport.tsx:223:          {busy === 'export' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
frontend/src\components\study-core\StepLinkQcExport.tsx:228:            {busy === 'export-override' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
frontend/src\components\study-core\StepLinkQcExport.tsx:262:                {busy === 'link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
frontend/src\components\study-core\StepLinkQcExport.tsx:279:              {busy === 'refs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
frontend/src\components\ui\scroll-area.tsx:36:      'flex touch-none select-none transition-colors',
frontend/src\components\ui\sheet.tsx:20:    className={cn('fixed inset-0 z-50 bg-[hsl(var(--tone-neutral-900)/0.34)] data-[state=open]:animate-in data-[state=closed]:animate-out', className)}
frontend/src\components\ui\sheet.tsx:39:          'fixed z-50 bg-background p-5 shadow-lg transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
frontend/src\components\ui\sheet.tsx:40:          side === 'right' && 'inset-y-0 right-0 h-full border-l border-border data-[state=open]:animate-in',
frontend/src\components\ui\sheet.tsx:41:          side === 'left' && 'inset-y-0 left-0 h-full border-r border-border data-[state=open]:animate-in',
frontend/src\components\ui\sheet.tsx:51:          className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
frontend/src\components\ui\button.tsx:9:  'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-[background-color,border-color,color,transform] duration-220 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
frontend/src\pages\profile-integrations-page.tsx:864:                      <label key={option.key} className="group flex cursor-pointer items-start gap-2 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-2 py-1.5 transition-colors hover:border-[hsl(var(--tone-accent-200))]">
frontend/src\pages\profile-integrations-page.tsx:886:                  <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${worksPermissionEnabled ? 'text-[hsl(var(--tone-neutral-900))]' : 'text-[hsl(var(--tone-neutral-500))]'}`} style={{ transform: animateWorksCount ? 'scale(1.04)' : 'scale(1)' }}>{formatMetricNumber(worksCount)}</p>
frontend/src\pages\profile-integrations-page.tsx:893:                  <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${worksPermissionEnabled && normalizedNewWorks > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-900))]'}`} style={{ transform: animateNewWorks ? 'scale(1.04)' : 'scale(1)' }}>{newWorksDeltaLabel}</p>
frontend/src\pages\profile-integrations-page.tsx:900:                  <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${citationsPermissionEnabled ? 'text-[hsl(var(--tone-neutral-900))]' : 'text-[hsl(var(--tone-neutral-500))]'}`} style={{ transform: animateTotalCitations ? 'scale(1.04)' : 'scale(1)' }}>{formatMetricNumber(totalCitations)}</p>
frontend/src\pages\profile-integrations-page.tsx:907:                  <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${citationsPermissionEnabled && normalizedNewCitations > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-900))]'}`} style={{ transform: animateNewCitations ? 'scale(1.04)' : 'scale(1)' }}>{newCitationsDeltaLabel}</p>
frontend/src\pages\profile-integrations-page.tsx:953:                    className="absolute inset-y-0 left-0 bg-[hsl(var(--tone-accent-200))] transition-[width] duration-700 ease-out"
frontend/src\pages\profile-integrations-page.tsx:958:                  {syncButtonBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\profile-integrations-page.tsx:1022:                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
frontend/src\pages\profile-manage-account-page.tsx:217:              {passwordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\profile-manage-account-page.tsx:263:              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\profile-personal-details-page.tsx:129:const HOUSE_SELECT_CLASS = `h-9 w-full rounded-md px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${houseForms.select}`
frontend/src\pages\profile-personal-details-page.tsx:2333:              'rounded-md border border-[hsl(var(--tone-neutral-200))] transition-[background-color,border-color,box-shadow] duration-700 ease-out',
frontend/src\pages\profile-personal-details-page.tsx:2343:                'w-full px-3 py-2.5 text-left transition-colors',
frontend/src\pages\profile-personal-details-page.tsx:2356:                      'h-4 w-4 text-[hsl(var(--tone-neutral-500))] transition-transform duration-200',
frontend/src\pages\profile-personal-details-page.tsx:2365:                      'truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))] transition-transform duration-200',
frontend/src\pages\profile-personal-details-page.tsx:2426:                              'group w-full flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-all duration-200 ease-out will-change-transform',
frontend/src\pages\profile-personal-details-page.tsx:2440:                                'inline-flex items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-150',
frontend/src\pages\profile-personal-details-page.tsx:2474:                                className="inline-flex w-[6.75rem] justify-center rounded-full border border-[hsl(var(--tone-neutral-300))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-700))]"
frontend/src\pages\profile-personal-details-page.tsx:2483:                                className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
frontend/src\pages\profile-personal-details-page.tsx:2531:                      className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
frontend/src\pages\profile-personal-details-page.tsx:2554:                        className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]"
frontend/src\pages\profile-personal-details-page.tsx:2711:                      className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]"
frontend/src\pages\profile-personal-details-page.tsx:2738:                      'group flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 transition-all duration-200 ease-out will-change-transform',
frontend/src\pages\profile-personal-details-page.tsx:2752:                        'inline-flex cursor-grab items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-150 active:cursor-grabbing',
frontend/src\pages\profile-personal-details-page.tsx:2769:                        className="rounded-full border border-[hsl(var(--tone-neutral-300))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-700))]"
frontend/src\pages\profile-personal-details-page.tsx:2777:                      className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
frontend/src\pages\profile-personal-details-page.tsx:2803:            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
frontend/src\pages\profile-publications-page.tsx:1279:      className={`inline-flex w-full items-center gap-1 transition-colors hover:text-foreground ${HOUSE_TABLE_SORT_TRIGGER_CLASS} ${alignClass}`}
frontend/src\pages\profile-publications-page.tsx:2662:                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\profile-publications-page.tsx:2704:                                  className={`align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass} transition-colors ${citationCellTone(
frontend/src\pages\qc-dashboard-page.tsx:51:              className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`}
frontend/src\pages\settings-page.tsx:47:                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
frontend/src\pages\settings-page.tsx:67:                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
frontend/src\pages\results-page.tsx:655:                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\results-page.tsx:708:                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\results-page.tsx:772:                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
frontend/src\pages\workspaces-data-library-view.tsx:395:            <RefreshCw className={cn('mr-1 h-4 w-4', isLoading && 'animate-spin')} />
frontend/src\pages\workspaces-data-library-view.tsx:476:            <Loader2 className="h-4 w-4 animate-spin" />
frontend/src\pages\workspaces-page.tsx:2209:      className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', HOUSE_TABLE_SORT_TRIGGER_CLASS, alignClass)}
```

### C.4 TSX inline/hook motion declarations (`frontend/src/**/*.tsx`)

```text
frontend/src\components\publications\PublicationsTopStrip.tsx:1649:                      transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:2036:                      transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:2625:                      transitionDelay: barsExpanded && !isStructureSwapActive ? `${Math.min(220, index * 18)}ms` : '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:2976:                      transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:3204:                  transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3205:                  transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3421:                    transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:3422:                    transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:4023:          style={{ transitionDuration: `${displayModeSwapMs}ms` }}
frontend/src\components\publications\PublicationsTopStrip.tsx:4078:          style={{ ...chartFrameStyle, transitionDuration: `${displayModeSwapMs}ms` }}
frontend/src\components\publications\PublicationsTopStrip.tsx:4133:                      transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:5266:                      transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:5499:                        transitionDelay: '0ms',
frontend/src\components\publications\PublicationsTopStrip.tsx:5550:              transitionDuration: 'var(--motion-duration-chart-refresh)',
frontend/src\components\publications\PublicationsTopStrip.tsx:5551:              transitionTimingFunction: 'var(--motion-ease-chart-series)',
frontend/src\components\publications\PublicationsTopStrip.tsx:5674:  const lineTrackTransition = reduceMotion
frontend/src\components\publications\PublicationsTopStrip.tsx:5700:                transition: lineTrackTransition,
```

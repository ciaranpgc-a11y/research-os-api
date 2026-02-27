# IMPLEMENTED DESIGN SYSTEM REPORT

Generated: 2026-02-27
Scope scanned: `frontend/src/components` (47 files), `frontend/src/pages` (31 files), `frontend/src/stories` (63 files), plus `.storybook` and global style config files.

## 1) Token & styling sources (source-of-truth map)

### Source map
| Source | Role | Evidence |
|---|---|---|
| `tailwind.config.js` | Tailwind token bridge (semantic color aliases, spacing scale extensions, font scale aliases, radius aliases, duration aliases) | `tailwind.config.js:22-139` (`screens`, `fontFamily`, `fontSize`, `transitionDuration`, `spacing`, `colors`, `borderRadius`) |
| `src/index.css` | Canonical CSS custom properties and house class implementations (light/dark theme vars + component classes + motion classes + keyframes) | `src/index.css:8-249`, `src/index.css:1651-1811`, `src/index.css:2982-2995` |
| `src/lib/house-style.ts` | Semantic class contract (token-like indirection for typography/surfaces/motion/drilldown) | `src/lib/house-style.ts:1`, `:32`, `:97`, `:214`, `:276` |
| `src/components/publications/publications-house-style.ts` | Publications-specific semantic alias map layered over `house-style` | `src/components/publications/publications-house-style.ts:3`, `:17`, `:46`, `:132` |
| `.storybook/preview.ts` | Storybook consumes same global CSS/token system | `.storybook/preview.ts:6` (`import '../src/index.css'`) |

### Token categories found

#### Color
- Defined in CSS vars (`src/index.css`) and exposed through Tailwind semantic color keys (`tailwind.config.js`).
- Semantic names exist: `background`, `foreground`, `primary`, `accent`, `destructive`, `status-*`, tone scales (`tone-neutral-*`, `tone-positive-*`, etc.), plus brand colors.
- Sample implemented values:
  - `--background: 0 0% 100%` (`src/index.css:9`)
  - `--primary: 201 35% 36%` (`src/index.css:24`)
  - `--tone-neutral-500: 218 15% 46%` (`src/index.css:45`)
  - `--tone-positive-500: 164 28% 41%` (`src/index.css:58`)
  - dark equivalents at `src/index.css:153-249`.

#### Spacing
- Tailwind extension tokens exist (`sz-*`) in `tailwind.config.js:48-78`.
- Actual values include: `sz-7=0.4375rem`, `sz-18=1.125rem`, `sz-22=1.375rem`, `sz-84=5.25rem`, `sz-320=20rem`, `sz-760=47.5rem`, `sz-1380=86.25rem`.
- Semantic naming is partial: `sz-*` numeric aliases exist, but many direct hardcoded paddings/margins remain in `src/index.css` and TSX class strings.

#### Typography
- Token vars in `src/index.css:109-130`: `--font-family-base`, `--text-caption-size`, `--text-micro-size`, `--text-label-size`, `--text-body-size`, `--text-display-size` (+ line-heights).
- Tailwind aliases at `tailwind.config.js:26-35` (`caption`, `micro`, `label`, `body`, `display`).
- Semantic class naming exists (`house-title`, `house-h1`, etc.) via `houseTypography` map (`src/lib/house-style.ts:1-30`).

#### Radius / borders
- Root radius token: `--radius: 0.5rem` (`src/index.css:107`), bridged in Tailwind (`tailwind.config.js:134-138`: `lg/md/sm`).
- Border width token extension: `borderWidth.3 = 3px` (`tailwind.config.js:139-141`).
- Semantic class names exist (`house-panel-*`, `house-divider-*`, `house-left-border-*`), but many per-component raw radii still exist (`0.375rem`, `0.52rem`, `9999px`, etc.).

#### Elevation / shadows
- No dedicated CSS variable token set for elevation found.
- Mostly flat style (`box-shadow: none`) in house classes; ad hoc shadows exist:
  - `shadow-sm/shadow-md/shadow-lg` utilities in UI primitives (`input`, `select`, `tooltip`, `sheet`)
  - raw shadows in CSS (`src/index.css:2189`, `:2221`).
- Semantic elevation naming: not found as formal token category.

#### Motion
- Canonical duration vars in `src/index.css:132-140`:
  - `--motion-duration-fast: 150ms`
  - `--motion-duration-ui: 180ms`
  - `--motion-duration-base: 220ms`
  - `--motion-duration-medium: 250ms`
  - `--motion-duration-slow: 320ms`
  - `--motion-duration-slower: 420ms`
  - `--motion-duration-emphasis: 500ms`
  - `--motion-duration-long: 700ms`
  - `--motion-duration-chart-ring-fill: var(--motion-duration-slower)`
- Tailwind duration aliases in `tailwind.config.js:37-46` (`ui`, `150`, `220`, `320`, `420`, `500`, `700`, plus hardcoded `200`, `300`).
- Semantic motion class naming exists: `house-chart-frame`, `house-motion-enter/exit`, `house-toggle-*`, `house-label-transition` (`src/index.css:1651-1811`, `src/lib/house-style.ts:97-112`).

## 2) Component inventory (primitive/composite/page)

### Primitives
| Primitive | File path | Styling approach | Animation hooks |
|---|---|---|---|
| Button | `src/components/ui/button.tsx` | Tailwind utility strings + CVA + `houseTypography` semantic class | `transition-[background-color,border-color,color,transform] duration-ui ease-out`, active scale (`button.tsx:9`) |
| Dropdown (Select) | `src/components/ui/select.tsx` | Tailwind utility strings + CVA | `transition-colors duration-ui` (`select.tsx:7`) |
| Input | `src/components/ui/input.tsx` | Tailwind utility strings + CVA | `transition-colors duration-ui` (`input.tsx:7`) |
| Textarea | `src/components/ui/textarea.tsx` | Tailwind utility strings + CVA | `transition-colors duration-ui` (`textarea.tsx:7`) |
| Banner | No dedicated primitive component found; implemented via surface classes | `houseSurfaces.banner*` semantic classes mapped in `house-style.ts` and consumed in pages (`profile-publications-page.tsx:108-110`) | Transition behavior mostly via shared house classes in `index.css` |
| Table | `src/components/ui/table.tsx` | Semantic classes (`houseSurfaces`, `houseTypography`) + utility classes | Row/selection visuals; no dedicated transition in component file |
| Header | `src/components/layout/top-bar.tsx`, `src/pages/page-frame.tsx` | Tailwind + house semantic classes | Hover/active transitions via `house-top-nav-*` classes (`index.css:582-640`) |
| Card | `src/components/ui/card.tsx` | Semantic surface/typography classes + utility layout | No explicit motion hooks in component file |
| Tooltip | `src/components/ui/tooltip.tsx` | Tailwind utility classes | No custom transition defined in wrapper |
| Modal/Sheet | `src/components/ui/sheet.tsx` | Radix + Tailwind utility classes | `animate-in/out`, `duration-200/300`, `transition-opacity` (`sheet.tsx:20,39,53`) |

### Composites
| Composite | File path | Styling approach | Animation hooks |
|---|---|---|---|
| Metric tiles | `src/components/publications/MetricTile.tsx`, `src/components/publications/dashboard-tile-styles.ts` | Utility strings + semantic house classes | tile hover transitions (`duration-220`), info button transitions |
| Chart containers | `src/components/publications/PublicationsTopStrip.tsx`, `src/stories/design-system/composites/ChartContainerFrame.stories.tsx` | House motion classes + inline style transitions + utility classes | `house-chart-frame`, `house-motion-enter/exit`, ring arc transitions, JS eased interpolation |
| Side panels | `src/components/layout/insight-panel.tsx`, `src/components/layout/profile-panel.tsx`, `src/components/layout/next-best-action-panel.tsx` | Mostly Card-based house/tailwind | mostly loading spinners (`animate-spin`) |
| Publication list | `src/pages/profile-publications-page.tsx` | Heavy use of house semantic class contracts + utility classes | drilldown file tab cards/rows use `house-label-transition` |
| Drilldown panel | `src/components/publications/PublicationMetricDrilldownPanel.tsx` + profile publications detail/sheet sections | `PublicationMetricDrilldownPanel` uses plain tailwind strings; profile page uses publications house drilldown classes | panel file itself has no explicit transitions; profile page injects label transition class on files tab cards/rows |

### Pages (major)
| Page | File path | Styling approach | Animation hooks |
|---|---|---|---|
| Publications page + drilldown | `src/pages/profile-publications-page.tsx` | House semantic classes + utility strings | drilldown file cards/rows use `labelTransition`; loaders use `animate-spin` |
| Publications top metrics strip (major page-level composite) | `src/components/publications/PublicationsTopStrip.tsx` | House semantic + utility + inline styles + JS easing hooks | richest motion implementation in repo |
| Profile integrations | `src/pages/profile-integrations-page.tsx` | Utility classes with HSL vars | 500/700ms transform/width animations |
| Profile personal details | `src/pages/profile-personal-details-page.tsx` | Utility-heavy | multiple `transition-all`, `duration-150/200/700` |
| Study core | `src/pages/study-core-page.tsx` | Utility + house classes | `wizard-step-transition` class |
| Manuscript | `src/pages/manuscript-page.tsx` | Utility-heavy | `transition-all`, loader `animate-spin` |

## 3) Motion inventory (exhaustive)

### Search results
- `framer-motion` / `motion.*` / `AnimatePresence`: **not found** in implementation.
- Combined motion-pattern hits (CSS + utility + inline style + animation refs): **247 matched lines**.

### Motion usage table
| Component/Page | Evidence | Trigger | Property affected | Duration (ms) | Delay (ms) | Easing | Opacity fade | Stagger | Gold-standard drilldown style |
|---|---|---|---|---:|---:|---|---|---|---|
| Global chart frame | `src/index.css:1651-1663` | load/reload/state | `opacity, transform, filter` | 320 | 0 | `ease-out` | Yes | No | Yes |
| Global chart enter/exit states | `src/index.css:1665-1675` | toggle/state | opacity + translate + scale + blur | inherits frame | 0 | inherits frame | Yes | No | Yes |
| Chart scale layer/tick/title/mean-line | `src/index.css:1689-1714` | reload/scale change | `bottom`, `left`, `opacity` | 320 | 0 | `cubic-bezier(0.2,0.68,0.16,1)` | Some | No | Yes |
| Ring float enter/exit | `src/index.css:1726-1734` | load/toggle | transform + opacity | 320/260 | 0 | cubic-bezier + ease-out | Yes | No | Yes |
| Toggle thumb | `src/index.css:1749-1759` | toggle | `left,width` | 320 | 0 | `ease-out` | No | No | Yes |
| Toggle button | `src/index.css:1762-1772` | toggle/active press | color + transform | 250 | 0 | `ease-out` | No | No | Yes |
| Toggle chart bar | `src/index.css:1779-1783` | toggle/chart morph | transform/filter/box-shadow | 420 | 0 | `cubic-bezier(0.2,0.68,0.16,1)` | No | No | Yes |
| Toggle chart swap | `src/index.css:1786-1800` | toggle/swap | opacity (+filter by slot mode) | 220 or 150 | 0 | `cubic-bezier(0.2,0.68,0.16,1)` | Yes | No | Yes |
| Label transition | `src/index.css:1807-1810` | state/hover/content | `opacity, transform` | 220 | 0 | `ease-out` | Yes | No | Yes |
| Wizard keyframe | `src/index.css:2982-2995` | load/step change | opacity + translateY | 220 | 0 | `ease-out` | Yes | No | No |
| UI sheet overlay/content | `src/components/ui/sheet.tsx:20,39,53` | open/close | opacity + entry animation | 200/300 | 0 | `ease-in-out` + plugin defaults | Yes | No | No |
| Button primitive | `src/components/ui/button.tsx:9` | hover/active/focus | bg/border/color/transform | 180 | 0 | `ease-out` | No | No | No |
| Input/select/textarea | `src/components/ui/input.tsx:7`, `select.tsx:7`, `textarea.tsx:7` | focus/invalid/disabled | colors | 180 | 0 | default | No | No | No |
| Dashboard tile shell/info button | `src/components/publications/dashboard-tile-styles.ts:5,10` | hover | bg/color | 220 | 0 | `ease-out` | No | No | Partial |
| Publications TopStrip chart wrappers | `src/components/publications/PublicationsTopStrip.tsx:417` | load/reload | opacity/transform/filter | 320 | 0 | `ease-out` | Yes | No | Yes |
| Publications ring arcs | `src/components/publications/PublicationsTopStrip.tsx:432-433,2424,2826` | reload/toggle | `stroke-dasharray`, `stroke-dashoffset`, `stroke` | 420 (via var) | 0 | `cubic-bezier(0.22,1,0.36,1)` | No | No | Yes |
| Publications custom eased hooks | `src/components/publications/PublicationsTopStrip.tsx:632-736` | data reload/toggle | numeric interpolation feeding height/labels | 420 default | 0 | JS easeOutCubic | Optional via bound classes | No | Yes |
| Publications bar labels | `src/components/publications/PublicationsTopStrip.tsx:1308,1665,2247,2654,3820,4925` | hover/state | opacity + translateY | 220 (label class) | 0 | ease-out | Yes | No | Yes |
| Publications bar shape stagger | `src/components/publications/PublicationsTopStrip.tsx:1325,1683,2266,3839,4943` | load/toggle | transition delay only | base from class (220/320/420 mix) | `min(220,index*18)` | inherited | Sometimes | Yes | Yes |
| Publications distribution mode swap | `src/components/publications/PublicationsTopStrip.tsx:3303,3738,3792` | toggle (chart/table) | opacity/transform/filter | 220 | 0 | inherited | Yes | No | Yes |
| H-index chart mode crossfade | `src/components/publications/PublicationsTopStrip.tsx:4983,5023-5026` | toggle (`needed`/`year`) | opacity | 220 | 0 | `ease-out` | Yes | No | Partial |
| Inline progress bar | `src/components/publications/PublicationsTopStrip.tsx:5042` | state-change | width | 500 | 0 | `ease-out` | No | No | Partial |
| Publications drilldown files tab cards/rows | `src/pages/profile-publications-page.tsx:128,2844,2853,2874` | load/drag state | opacity + transform (via `labelTransition`) + bg/border change | 220 | 0 | ease-out | Yes | No | Yes |
| Publication drilldown panel component | `src/components/publications/PublicationMetricDrilldownPanel.tsx` | tab/window changes | none explicit | n/a | n/a | n/a | No | No | No |
| Profile integrations counters | `src/pages/profile-integrations-page.tsx:886-907` | sync/update | transform scale | 500 | 0 | ease-out | No | No | No |
| Profile integrations progress | `src/pages/profile-integrations-page.tsx:953` | load/update | width | 700 | 0 | ease-out | No | No | No |
| Personal details drag/reorder UI | `src/pages/profile-personal-details-page.tsx:2332-2751` | hover/reorder/state | transform, bg, border, shadow | 150/200/700 | 0 | ease-out | Some | No | No |
| Study core page transitions | `src/pages/study-core-page.tsx:1082,1089` | step load/reload | keyframe opacity + translateY | 220 | 0 | ease-out | Yes | No | No |
| Loader spinners across pages/components/stories | many (`auth-page`, `results-page`, `Step*`, etc.) | async loading | rotation | browser default (spin) | 0 | linear default | No | No | No |
| Skeleton pulse story | `src/stories/design-system/primitives/SkeletonLoaders.stories.tsx:8` | loading placeholder | opacity pulse | plugin default | 0 | plugin default | Yes | No | No |
| Motion tokens story demos | `src/stories/design-system/foundations/MotionTokens.stories.tsx:42-51` | demo load | keyframe/rotate | 220 + undefined vars | 0 | ease-out | Yes | No | Intended |

### Publications page + drilldown mismatch flags
- `PublicationMetricDrilldownPanel.tsx` has no explicit motion primitives, while TopStrip uses a full motion language (`house-chart-*`, toggle classes, JS easing).
- In `profile-publications-page.tsx`, drilldown motion is concentrated in files tab (`labelTransition`) and not consistently applied across other drilldown tab sections.
- Publications charts rely on opacity fades (`house-motion-exit`, `transition-opacity`, `opacity-0/100`) in multiple places; this diverges from a pure morph-only approach.

## 4) Drift analysis (drift map)

| Drift theme | Evidence | Drift impact |
|---|---|---|
| Undefined motion tokens referenced in Storybook | `MotionTokens.stories.tsx:16-18` references `--motion-duration-chart-toggle`, `--motion-duration-chart-refresh`, `--motion-ease-chart-series`; not defined in `src/index.css:132-140` | Documentation/demo drift vs runtime token set |
| Mixed duration scales for same intent | 220ms (label/chart swap), 320ms (chart frame), 420ms (eased numeric/ring), 500ms (progress), 700ms (profile progress), 140ms special case (`src/index.css:1169`) | Inconsistent timing rhythm |
| Hardcoded durations outside token vars | `duration-200/300/500/700` in TSX and `140ms` in CSS | Bypasses token governance |
| Multiple easing families without tokenized names | `ease-out`, `ease-in-out`, `cubic-bezier(0.22,1,0.36,1)`, `cubic-bezier(0.2,0.68,0.16,1)` | Hard to standardize motion feel |
| Opacity fades on chart/container transitions | `house-chart-frame` uses opacity/filter (`index.css:1660-1663`), H-index mode crossfade (`PublicationsTopStrip.tsx:5023-5026`) | Potentially unwanted fades for data visual transitions |
| Stagger logic not centralized | `Math.min(220, index*18)` and `Math.min(220, index*45)` variants in same file | Uneven reveal cadence |
| Drilldown animation language incomplete | Files tab rows/cards use `labelTransition`; summary/breakdown/context/methods in `PublicationMetricDrilldownPanel.tsx` mostly static | Drilldown experience inconsistency |
| `transition-all` usage still present | `manuscript-page.tsx:336`, `Step2Panel.tsx:333`, `Step1Panel.tsx:39`, `profile-personal-details-page` spots | Animates unintended properties |
| Elevation system not tokenized | mix of `shadow-sm/md/lg`, raw shadows, and many `box-shadow:none` | Visual depth drift across primitives/composites |
| Banner primitive not formalized | banner styles exist as classes, but no dedicated `Banner` component contract | Reuse/consistency gap |

## 5) Proposed standardisation (minimal set)

### Canonical token set (proposed)
- Keep existing: `--motion-duration-fast (150)`, `ui (180)`, `base (220)`, `medium (250)`, `slow (320)`, `slower (420)`, `emphasis (500)`, `long (700)`.
- Add/normalize aliases for intent:
  - `--motion-duration-page-load: 220ms`
  - `--motion-duration-tile-load: 320ms`
  - `--motion-duration-chart-toggle: 220ms`
  - `--motion-duration-chart-refresh: 420ms`
  - `--motion-ease-standard: ease-out`
  - `--motion-ease-emphasis: cubic-bezier(0.22, 1, 0.36, 1)`
  - `--motion-ease-chart-series: cubic-bezier(0.2, 0.68, 0.16, 1)`
  - `--motion-stagger-bar-step: 18ms`
  - `--motion-stagger-bar-cap: 220ms`

### Canonical motion classes/variants (proposed)
- `page-load`: keyframe fade+rise (220ms).
- `tile-load`: subtle transform+opacity enter (320ms).
- `chart-load`: chart frame enter/exit without blur by default.
- `toggle-same-count`: opacity-only swap (220ms).
- `toggle-different-count`: shape morph + keyed stagger (base 220, step 18, cap 220).
- `ring-toggle`: ring arc dash transition (420ms, emphasis ease).
- `line-load`: series interpolation easing (`chart-series` cubic-bezier).
- `drilldown-row-enter`: unified row/card transition for all drilldown tabs.

### Existing component -> canonical class mapping
| Existing component | Current | Proposed canonical |
|---|---|---|
| `PublicationsTopStrip` chart frame | `house-chart-frame` + enter/exit + custom durations | `chart-load` + tokenized `--motion-duration-chart-refresh` |
| `PublicationsTopStrip` bars | mixed `house-toggle-chart-bar`, label fades, inline stagger | `toggle-different-count` |
| `PublicationsTopStrip` chart/table mode swap | `displayModeSwapMs=220` + opacity transition | `toggle-same-count` |
| `PublicationsTopStrip` ring arcs | inline `HOUSE_RING_*_TRANSITION` | `ring-toggle` |
| `profile-publications` drilldown file cards/rows | `house-label-transition` only in files tab | `drilldown-row-enter` across all drilldown tabs |
| `PublicationMetricDrilldownPanel` | no explicit motion | adopt `drilldown-row-enter` + optional `line-load` for trajectory bars |
| `dashboard-tile-styles` tile shell/info | direct utility transitions | `tile-load` + standardized hover token pair |
| `ui/sheet` | `duration-200/300` + plugin animate classes | map to `page-load`/panel-open token aliases |

## Appendix: representative short snippets

- `tailwind.config.js:37-46`
  - `transitionDuration: { ui: 'var(--motion-duration-ui)', 220: 'var(--motion-duration-base)', 320: 'var(--motion-duration-slow)', 420: 'var(--motion-duration-slower)' ... }`
- `src/index.css:132-140`
  - `--motion-duration-fast: 150ms; ... --motion-duration-long: 700ms;`
- `src/index.css:1807-1810`
  - `.house-label-transition { transition-property: opacity, transform; transition-duration: var(--motion-duration-base); }`
- `src/components/publications/PublicationsTopStrip.tsx:632`
  - `function useEasedValue(..., durationMs = 420)`
- `src/pages/profile-publications-page.tsx:128`
  - `const HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS = publicationsHouseMotion.labelTransition`

# Axiomos Design Governance Specification v1.0

## Purpose

This document defines the non-negotiable structural rules governing all visual, spatial, typographic, and interactive elements within Axiomos.

Axiomos is an operating system. The interface must reflect discipline, consistency, and restraint.

No element may be introduced or modified outside the constraints defined here.

## 1. Foundational Design Doctrine

### 1.1 Structural Integrity

The interface must communicate:

- Stability
- Analytical precision
- Hierarchical clarity
- Restraint
- Systems thinking

It must not communicate:

- Ornamentation
- Playfulness
- Visual noise
- Over-explanation
- Color-driven emphasis

## 2. Design Tokens Are Law

### 2.1 Color

- All color usage must derive exclusively from token definitions.
- No hard-coded color values are permitted outside token files.
- Component code must consume tokenized class contracts from `frontend/src/lib/house-style.ts` (or domain token maps such as `publications-house-style.ts`).
- Direct arbitrary Tailwind color utilities in component markup are prohibited for new/changed UI:
- `text-[hsl(...)]`
- `bg-[hsl(...)]`
- `border-[hsl(...)]`
- Inline SVG `stroke`/`fill` color literals in component files are prohibited; route SVG tones through token classes defined in `frontend/src/index.css`.
- When a required semantic style does not exist, add a new token class in `frontend/src/index.css`, map it in `house-style.ts`, then consume that mapped token in components.
- No additional accent colors may be introduced without updating this governance document.
- Raw white/black surface utilities (`bg-white`, `bg-black`, `border-white`, `border-black`) are prohibited.
- Overlays must use tokenized neutral tones with alpha, never raw black overlays.
- Accent usage must be limited to:
- Primary interactive states
- Highlighted data states
- Selected navigation states
- Accent may not dominate layout.
- Neutral surfaces must be drawn from `background`, `card`, `muted`, and `tone-neutral-*` tokens.

### 2.2 Spacing

- All spatial relationships must derive from the base spacing scale.
- No arbitrary pixel values may be used.
- The system must preserve vertical rhythm.
- Spacing communicates structure.

### 2.3 Typography

Hierarchy must be expressed through:

- Scale
- Weight
- Spacing

Not through color or decoration.

Typography must:

- Preserve legibility at data-dense scales
- Support analytical reading
- Avoid stylistic flourish

No font substitution outside the approved family.

## 3. Surface Philosophy

### 3.1 Flatness

- The interface must be predominantly flat.
- Elevation is to be used sparingly and subtly.
- Shadow must never replace structural clarity.

### 3.2 Borders

Structure must be defined through:

- Border
- Surface contrast
- Spatial grouping

Not heavy shadow.

Separator-first framing is required:

- Avoid nested container borders (frame-in-frame patterns).
- Use one structural outer boundary per section at most.
- Prefer soft separators between section bands and tool rows.
- For borderless section shells, use `house-panel-bare`.
- For neutral separators, use `house-divider-border-soft` and `house-divider-fill-soft`.

### 3.3 Radius

- Corner radius must be consistent system-wide.
- No component-specific stylistic radii allowed.

## 4. Hierarchy Rules

### 4.1 Information Density

- Information must be grouped logically.
- Each surface must have:
- A primary focal element
- A secondary contextual layer
- A tertiary metadata layer
- No surface may contain more than three competing focal hierarchies.

### 4.2 Numeric Emphasis

- Numeric values must dominate visually over labels.
- Labels support metrics.
- Metrics do not support labels.

### 4.3 Microcopy Discipline

All explanatory text must:

- Be structured
- Avoid ambiguity
- Avoid emotional phrasing
- Avoid marketing tone

Language must be analytical.

## 5. Data Visualization Governance

### 5.1 Color Discipline

- Color in charts must represent logic, not aesthetics.
- Multiple strong colors may not appear in a single data visualization without structural justification.
- Muted tones are default.

### 5.2 Visual Weight

Charts must avoid:

- Heavy gradients
- Decorative fill patterns
- Excessive grid lines
- Excessive markers

Data must remain primary.

## 6. Interaction Rules

### 6.1 Motion

Motion must be:

- Subtle
- Short duration
- Functional

No theatrical animation permitted.

Approved motion duration tokens:

- 150ms
- 200ms
- 220ms
- 300ms
- 320ms
- 420ms
- 500ms
- 700ms

No other duration tokens are permitted in UI classes.

### 6.3 Control Sizing

- Primary control height is `h-9`.
- Large/auth control height is `h-10`.
- Compact control height is `h-8`.
- New controls must use one of these three heights unless governance is updated.

### 6.4 Navigation Rail Contracts

- Approved left rail widths: `250px`, `280px`.
- Approved right rail widths: `280px`, `320px`, `340px`.
- Grid rail templates must use approved widths only.

### 6.5 Section Tone Contract

- Section rail and active-nav accent colors must come from the shared section tone resolver (`frontend/src/lib/section-tone.ts`).
- New top-level sections must declare a semantic tone (`overview`, `research`, `account`, `workspace`, `data`, `manuscript`, `governance`).
- Do not hard-code one-off rail/accent colors in page components.
- For new routes, update tone resolution rules in one place and let shared components inherit those changes.

### 6.2 Hover and Tooltip Governance

Hover states must:

- Clarify
- Not distract

Tooltips must:

- Be structured
- Use defined typography scale
- Avoid verbosity
- Avoid decorative styling

## 7. Table Governance

Tables are core infrastructure.

They must:

- Preserve alignment discipline
- Maintain consistent row height
- Respect numeric alignment
- Avoid decorative alternation

Tables are not decorative surfaces.

## 8. State Indicators

State indicators must:

- Be subdued
- Avoid saturated backgrounds
- Avoid dominance over primary metrics

State communicates status, not emphasis.

## 9. Dark Mode Parity

Dark mode must:

- Preserve hierarchy
- Maintain contrast ratios
- Not invert logic
- Not introduce new accents

Dark is an alternate environment, not a new aesthetic.

## 10. Governance Enforcement

All new UI elements must:

- Use design tokens
- Use spacing scale
- Use approved typography
- Conform to hierarchy rules

Any deviation requires:

- Justification
- Update to governance document
- Token revision

No visual experimentation in production UI without system update.

## 11. Drift Prevention

Codex must enforce:

- No inline hex values
- No inline RGB/HSL/HSLA color literals in component markup
- No arbitrary spacing
- No rogue typography sizes
- No unapproved color usage
- No raw white/black surface utilities
- No unsupported motion duration tokens
- No unsupported navigation rail width templates
- No `CardTitle` text-size overrides (`text-xs`, `text-sm`, `text-base`, etc.)
- No `text-xs` typography on `<table>`, `<thead>`, or `<th>` elements
- Table typography must use shared table components or `house-table-*` tokens
- New or modified drilldown surfaces must use house token contracts for typography, borders, tabs, chart states, and tooltips

PRs violating governance must fail.

## 12. Design Intent Summary

Axiomos must feel:

- Engineered
- Deliberate
- Quietly powerful
- Structurally coherent

If a design choice adds decoration but not structure, it is incorrect.

## 13. Documentation and Audit Rules

- Major UX and behavior changes must include same-delivery documentation updates.
- `docs/change-log.md` must be updated for all major changes.
- Relevant story documents under `docs/stories/` must be updated as scope evolves.
- Missing major-change documentation is considered a governance violation.
- See `docs/change-documentation-rules.md` for the full rule set.

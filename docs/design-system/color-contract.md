# Color Contract
AAWE Design System • Foundations → Colors • v1.0

## 0. Scope and intent
This document defines the **governed color API** for the application.

- Components must use **semantic tokens** only.
- Tone scales exist for **internal derivation** and **data visualisation**, not for general UI composition.
- This contract is the source of truth for palette usage, Storybook Foundations/Colors, and future lint rules.

---

## 1. Token layers
AAWE uses two layers of tokens.

### 1.1 Semantic tokens (public API)
These are the only tokens that UI primitives/composites/pages may reference.

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--border`

- `--muted`
- `--muted-foreground`

- `--primary`
- `--primary-foreground`

- `--secondary`
- `--secondary-foreground`

- `--accent`
- `--accent-foreground`

- `--destructive`
- `--destructive-foreground`

- `--ring` (focus ring color)
- `--focus` (optional alias; if present, must equal `--ring`)

**Rule:** UI components must use semantic tokens via Tailwind utilities:
`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, etc.

**Forbidden in UI components:** direct tone usage such as `--tone-*` and raw hex values.

---

### 1.2 Tone scales (internal + charts)
Tone tokens are raw ramps used to derive semantic tokens and to provide controlled color for charts, heatmaps, and data visualisation.

- Neutral ramp:
  - `--tone-neutral-50`
  - `--tone-neutral-100`
  - `--tone-neutral-200`
  - `--tone-neutral-300`
  - `--tone-neutral-500`
  - `--tone-neutral-700`
  - `--tone-neutral-900`

- Status tones:
  - `--tone-positive-500`
  - `--tone-warning-500`
  - `--tone-danger-500`
  - `--tone-accent-500`

**Rule:** Tone tokens must not be referenced by general UI components.
**Allowed:** chart components and analytics visualisations may use tone tokens explicitly.

---

## 2. Surface hierarchy rules
Surfaces must remain visually distinct, in both light and dark themes.

### 2.1 Surface roles
- `background` = app canvas (page background)
- `card` = raised surfaces (tiles, panels, sheets, modals)
- `muted` = subtle fills (secondary panels, hover backgrounds, section backplates)
- `border` = default outlines and dividers

### 2.2 Mandatory separation
- `background` and `card` must not be visually interchangeable.
- `border` must remain visible on both `background` and `card`.
- `foreground` must maintain readable contrast on both `background` and `card`.

**Rule:** Any palette change must be reviewed in Storybook Foundations/Colors under:
- Surface layering examples
- Contrast examples

---

## 3. Semantic role governance
This section prevents drift between `primary` and `accent`, which are easily confused.

### 3.1 Primary
**Primary** represents the highest-emphasis action.

Allowed uses:
- primary CTAs (Save, Generate, Continue, Confirm)
- the single dominant action in a view
- wizard progression actions

Not allowed:
- casual highlights
- navigation decoration
- data viz series colors (unless explicitly specified for one series)

### 3.2 Accent
**Accent** is for emphasis and guidance, not primary action.

Allowed uses:
- focus ring (if `--ring` maps to accent)
- subtle highlights (selected state borders, active nav markers)
- non-primary emphasis elements
- certain chart highlight states (if specified)

Not allowed:
- primary CTAs
- destructive actions

### 3.3 Secondary
Secondary supports primary.

Allowed uses:
- alternative action next to primary (Cancel, Back, Secondary options)
- lower emphasis actions

### 3.4 Destructive
Destructive indicates irreversible or risk-bearing actions.

Allowed uses:
- delete, remove, revoke, reset, clear data

Not allowed:
- warnings that are not actions (use status patterns, not destructive CTAs)

---

## 4. Status strategy (single source of truth)
Pick **one** of the following models. Do not run both as independent sources.

### Option A — Semantic-first (recommended)
Expose semantic status tokens:

- `--status-ok`
- `--status-warn`
- `--status-danger`

These are derived from tones:

- `--status-ok` → `--tone-positive-500`
- `--status-warn` → `--tone-warning-500`
- `--status-danger` → `--tone-danger-500`

**Rule:** Components use `--status-*` tokens only (not tones).

### Option B — Scale-first
Do not expose `--status-*` tokens. Use tone tokens in status components only.

**Rule:** Tones are used only inside status components and chart components, not in general UI.

> Decision: Choose A or B and remove/avoid the other as a public API.

---

## 5. Focus and accessibility rules
### 5.1 Focus visibility
- Use `:focus-visible` only (avoid focus rings on mouse click where possible).
- Focus ring color must be consistent across the UI.
- Focus ring color should be derived from `--ring` (preferred mapping is accent).

### 5.2 Contrast expectations
- Body text must meet WCAG AA contrast against `background` and `card`.
- Button foreground text must be legible on primary/destructive fills.
- Muted foreground must remain legible for secondary metadata.

**Rule:** Any token change requires a Foundations/Colors Storybook review including contrast examples.

---

## 6. Implementation rules (enforcement targets)
- Semantic tokens are defined in `index.css` under `:root` and `.dark`.
- Semantic tokens should reference tone tokens where feasible.
- Tailwind must map semantic tokens (e.g., `bg-background` uses `hsl(var(--background))`).
- Prohibit raw hex usage in UI code.
- Restrict tone token usage to:
  - chart components
  - analytics visualisation components
  - explicitly designated “viz” modules

---

## 7. Change control
A palette change is only valid if:

- Storybook Foundations/Colors snapshots are updated and reviewed in Chromatic.
- Surface layering still reads correctly (background vs card vs muted).
- Foreground readability remains acceptable.
- Primary vs accent usage remains consistent with governance above.

---

# CMR Quantitative Parameters — Severity Grading

## Overview

Add clinical severity grading to the CMR quantitative parameter table. When enabled, abnormal values are classified as mild, moderate, or severe using parameter-specific clinical cutoffs (where established) with SD-based fallback. Grading is displayed as graded row tinting and a labelled severity pill. The grading configuration is stored per-parameter in the reference data and editable in the parameter editor.

## Core Constraint

**The LL/UL normal range is the absolute authority.** If a measured value falls within the parameter's LL–UL range (per `abnormal_direction` rules), it is always "Normal" — regardless of what clinical severity cutoffs might suggest. Severity grading only applies to values already determined abnormal by the existing `isAbnormal()` logic. This prevents conflicts where sex/age-adjusted reference ranges differ from generic clinical cutoff tables.

## Data Model

### New fields on `output_params` (per parameter)

Added to `cmr_reference_data.json` alongside existing fields (`parameter`, `unit`, `indexing`, `abnormal_direction`, etc.):

```jsonc
{
  // Clinical terminology for this parameter's abnormality
  // One of: "impaired", "dilated", "enlarged", "hypertrophied", "thickened",
  //         "stenosis", "regurgitation", "elevated", "reduced", "abnormal"
  "severity_label": "impaired",

  // Absolute cutoffs for mild/moderate/severe. Null = SD-based fallback.
  // Direction-aware: for "low" direction, these are descending (mild > moderate > severe).
  // For "high" direction, these are ascending (mild < moderate < severe).
  "severity_thresholds": {
    "mild": 41,
    "moderate": 30,
    "severe": null
  },

  // Optional per-grade label overrides. Null = auto-generate from severity_label.
  "severity_label_override": {
    "mild": null,
    "moderate": null,
    "severe": null
  }
}
```

All three fields are optional (nullable). When absent:
- `severity_label`: inferred from parameter category (see defaults table)
- `severity_thresholds`: all null → SD-based grading
- `severity_label_override`: all null → auto-generated labels

### TypeScript types

```typescript
type SeverityLabelType =
  | 'impaired' | 'dilated' | 'enlarged' | 'hypertrophied' | 'thickened'
  | 'stenosis' | 'regurgitation' | 'elevated' | 'reduced' | 'abnormal'

type SeverityThresholds = {
  mild: number | null
  moderate: number | null
  severe: number | null
}

type SeverityLabelOverride = {
  mild: string | null
  moderate: string | null
  severe: string | null
}
```

These are added to the existing `CmrCanonicalParam` type (all optional) and to `CmrParamMetaUpdate` (for persistence via `updateParameterMeta()`).

### Reading from JSON

When `cmr-local-data.ts` reads `output_params`, missing severity fields default to `undefined` (not backfilled). The grading logic and `inferSeverityLabel()` handle undefined gracefully — undefined `severity_label` triggers auto-inference, undefined thresholds trigger SD fallback.

### Pre-populated defaults

| Parameter group | `severity_label` | Absolute thresholds | Notes |
|---|---|---|---|
| LV EF | `"impaired"` | mild: 41, moderate: 30, severe: null | Below 30 = severe |
| RV EF | `"impaired"` | mild: 40, moderate: 30, severe: null | Below 30 = severe |
| LA EF, RA EF | `"impaired"` | null (SD-based) | |
| LV EDV, LV ESV, RV EDV, RV ESV + indexed | `"dilated"` | null (SD-based) | |
| LA volumes, areas, diameters + indexed | `"enlarged"` | null (SD-based) | |
| RA volumes, areas, diameters + indexed | `"enlarged"` | null (SD-based) | |
| LV mass, LV mass (i) | `"hypertrophied"` | null (SD-based) | |
| LV peak wall thickness | `"thickened"` | null (SD-based) | |
| AV regurgitant fraction | `"regurgitation"` | null (SD-based) | Absolute cutoffs to be added when valve model is built |
| MR regurgitant fraction | `"regurgitation"` | null (SD-based) | As above |
| TR regurgitant fraction | `"regurgitation"` | null (SD-based) | As above |
| PV regurgitant fraction | `"regurgitation"` | null (SD-based) | As above |
| Native T1, ECV | direction-dependent | null (SD-based) | `"elevated"` when high, `"reduced"` when low |
| Native T2, T2* | direction-dependent | null (SD-based) | As above |
| Aortic diameters (annulus, sinus, SOV, STJ, ascending, descending) + indexed | `"dilated"` | null (SD-based) | |
| MPA, RPA, LPA diameters | `"dilated"` | null (SD-based) | |
| PCWP | `"elevated"` | null (SD-based) | |
| LV CO, LV CI, RV CO, RV CI | direction-dependent | null (SD-based) | `"elevated"` when high, `"reduced"` when low |
| MAPSE, TAPSE | `"impaired"` | null (SD-based) | Abnormal direction is "low" |
| LV SV, RV SV + indexed | direction-dependent | null (SD-based) | |
| LV mass/LV EDV | `"abnormal"` | null (SD-based) | |
| Valve annulus diameters | `"dilated"` | null (SD-based) | |
| AV/PV flow, velocity, pressure gradients | `"abnormal"` | null (SD-based) | |
| Vessel distensibility | `"abnormal"` | null (SD-based) | |
| Everything else | `"abnormal"` | null (SD-based) | |

### Direction-dependent label resolution

For parameters with `abnormal_direction: "both"`, the label is resolved at runtime based on which limit was breached:
- Value > UL → use `"elevated"` (or the parameter's `severity_label` if it's not direction-dependent)
- Value < LL → use `"reduced"` (or the parameter's `severity_label`)

For single-direction parameters (`"high"` or `"low"`), the `severity_label` is used directly.

## Grading Logic

### New file: `frontend/src/lib/cmr-severity.ts`

Pure function, no side effects, no dependencies beyond `cmr-chart-scaling.ts` (for `isAbnormal`).

```typescript
type SeverityGrade = 'normal' | 'mild' | 'moderate' | 'severe'

type SeverityResult = {
  grade: SeverityGrade
  label: string // e.g., "Mildly impaired", "Normal"
}
```

### Algorithm: `computeSeverity()`

**Inputs:** `measured`, `ll`, `ul`, `sd`, `abnormal_direction`, `severity_label`, `severity_thresholds`, `severity_label_override`

1. **Gate check**: Call existing `isAbnormal(measured, ll, ul, abnormal_direction)`. If false → return `{ grade: 'normal', label: 'Normal' }`.

2. **Determine breach direction**:
   - `abnormal_direction === 'high'` → breached high (value > UL)
   - `abnormal_direction === 'low'` → breached low (value < LL)
   - `abnormal_direction === 'both'` → check: if `ul !== null && measured > ul` → high; if `ll !== null && measured < ll` → low

3. **Compute grade**:

   **If absolute thresholds exist** (at least `mild` is non-null):

   For **low** direction (e.g., LVEF with mild=41, moderate=30):
   - mild: value ≥ mild_threshold (e.g., 41 ≤ value < LL)
   - moderate: value ≥ moderate_threshold && value < mild_threshold (e.g., 30 ≤ value < 41)
   - severe: value < moderate_threshold (or < severe_threshold if set) (e.g., value < 30)

   For **high** direction:
   - mild: value ≤ mild_threshold (e.g., UL < value ≤ mild_threshold)
   - moderate: value ≤ moderate_threshold && value > mild_threshold
   - severe: value > moderate_threshold (or > severe_threshold if set)

   **Partially-set thresholds**: If `mild` is set but `moderate` is null, values beyond the mild threshold fall through to SD-based grading for moderate/severe classification. If `moderate` is set but `severe` is null, everything beyond moderate is "severe". Boundaries are inclusive of the less severe grade (value exactly at a threshold gets the milder classification).

   **`abnormal_direction: "both"` with absolute thresholds**: Absolute thresholds apply to a single direction only. Parameters with `"both"` direction should use SD-based grading unless they have separate high/low threshold configurations (not currently supported — use `severity_label_override` for custom labels if needed). If absolute thresholds are set on a "both" parameter, they apply to whichever direction the value breached.

   **If no thresholds** (SD fallback):
   - Determine the breached limit: UL when value > UL, LL when value < LL
   - Compute `deviation = |measured - breached_limit| / sd`
   - If `sd` is null, zero, or negative → default to `'mild'`
   - mild: deviation ≤ 1; moderate: deviation ≤ 2; severe: deviation > 2

4. **Build label**:
   - Check `severity_label_override[grade]` — if non-null, use it directly
   - Otherwise auto-generate using the grammar table below
   - For direction-dependent parameters with `abnormal_direction: "both"`: resolve label based on breach direction (`"elevated"` or `"reduced"`)

   **Label grammar table** (some labels use adverb + past participle, others use adjective + noun):

   | `severity_label` | Mild | Moderate | Severe |
   |---|---|---|---|
   | `impaired` | Mildly impaired | Moderately impaired | Severely impaired |
   | `dilated` | Mildly dilated | Moderately dilated | Severely dilated |
   | `enlarged` | Mildly enlarged | Moderately enlarged | Severely enlarged |
   | `hypertrophied` | Mildly hypertrophied | Moderately hypertrophied | Severely hypertrophied |
   | `thickened` | Mildly thickened | Moderately thickened | Severely thickened |
   | `stenosis` | Mild stenosis | Moderate stenosis | Severe stenosis |
   | `regurgitation` | Mild regurgitation | Moderate regurgitation | Severe regurgitation |
   | `elevated` | Mildly elevated | Moderately elevated | Severely elevated |
   | `reduced` | Mildly reduced | Moderately reduced | Severely reduced |
   | `abnormal` | Mildly abnormal | Moderately abnormal | Severely abnormal |

5. **Return** `{ grade, label }`

### Helper: `inferSeverityLabel()`

Returns the default `severity_label` for a parameter based on its `parameter_key`, `major_section`, `sub_section`, and `abnormal_direction`. Used when `severity_label` is not explicitly set. Encodes the defaults table above as pattern-matching rules.

## UI Changes

### Viewing toggle

New pill toggle added to the Viewing group in the control bar:

```
Viewing: [Charts | Table Only]  [Off | Abnormal]  [Global | Per measurement]
```

- **Off** (default): No row tinting, no severity pills, no abnormal colouring on measured values. This is a change from the current behaviour where abnormal rows always have a faint red tint — that binary tinting is removed and gated behind this toggle.
- **Abnormal**: Graded row tinting and severity pills for abnormal values.

State: `severityMode: 'off' | 'abnormal'` (local React state, no persistence).

The chart chip controls (Global / Per measurement) only show when Charts is active. The severity toggle shows always.

### Row tinting (graded)

When `severityMode === 'abnormal'` and a row has a measured value:

| Grade | Row background |
|---|---|
| Normal | No tint |
| Mild | `bg-[hsl(var(--tone-danger-50)/0.25)]` |
| Moderate | `bg-[hsl(var(--tone-danger-50)/0.5)]` |
| Severe | `bg-[hsl(var(--tone-danger-50)/0.75)]` |

This replaces the current binary abnormal tinting (`bg-[hsl(var(--tone-danger-50)/0.4)]`) when severity mode is on. When severity mode is off, the existing binary tinting is also removed (the user specified "Off" means no colouring).

### Severity pill

A small badge rendered inline after the measured value in the Measured column:

```tsx
<span className={cn(
  'ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold',
  grade === 'mild' && 'bg-[hsl(var(--tone-danger-100)/0.5)] text-[hsl(var(--tone-danger-500))]',
  grade === 'moderate' && 'bg-[hsl(var(--tone-danger-200)/0.6)] text-[hsl(var(--tone-danger-600))]',
  grade === 'severe' && 'bg-[hsl(var(--tone-danger-500))] text-white',
)}>
  {label}
</span>
```

Only shown when `severityMode === 'abnormal'` and the value is abnormal.

### Measured value text colour

When severity mode is on, the measured value text colour reflects the grade:
- Normal: `tone-positive-600` (unchanged)
- Mild: `tone-danger-500`
- Moderate: `tone-danger-600`
- Severe: `tone-danger-600` (bold)

When severity mode is off, measured values have no abnormal colouring.

## Parameter Editor — Severity Section

In `cmr-reference-database-page.tsx`, add a new collapsible section **"Severity Grading"** in the `ParameterEditor` component, below the existing metadata fields.

### Fields

1. **Label type** — dropdown select:
   - Options: impaired, dilated, enlarged, hypertrophied, thickened, stenosis, regurgitation, elevated, reduced, abnormal
   - Placeholder: shows the inferred default (from `inferSeverityLabel()`) with "(auto)" suffix
   - Clearing the field reverts to auto-inference

2. **Custom thresholds** — three number inputs in a row:
   - Labels: "Mild", "Moderate", "Severe"
   - Helper text below: "Absolute cutoffs. Leave empty for SD-based grading (1/2/2+ SD beyond limit)."
   - Direction context shown: "Direction: {abnormal_direction}" so the editor knows how thresholds are interpreted

3. **Label overrides** — three text inputs:
   - Labels: "Mild label", "Moderate label", "Severe label"
   - Placeholder: shows the auto-generated label (e.g., "Mildly impaired")
   - Helper text: "Override the auto-generated severity label. Leave empty to use default."

### Persistence

These fields are saved alongside existing parameter metadata via `updateParameterMeta()`. The API layer and local data functions are extended to read/write the new fields.

## State Management

All severity grading state is derived (computed from reference data + measured values). The only new local state is:

- `severityMode: 'off' | 'abnormal'` — toggle in the Viewing group

No new API calls. The severity configuration is part of the reference data that's already fetched.

## Interaction with Existing Features

- **Abnormal filter** (`All / Abnormal Only`): Uses existing `isAbnormal()` — unaffected by severity grading. Filters by binary abnormal/normal, not by grade.
- **Charts**: Severity grading does not affect chart rendering (dot colour remains binary normal/abnormal).
- **Drilldown sheet**: Deferred — severity label display in the drilldown sheet is out of scope for this iteration. The `computeSeverity()` return value will be available for future integration.
- **Per-measurement chart scaling**: Uses `isAbnormal()` — unaffected.

## File Changes

| File | Change |
|---|---|
| `frontend/src/lib/cmr-severity.ts` | **New** — `computeSeverity()`, `inferSeverityLabel()`, types |
| `frontend/src/lib/cmr-api.ts` | Extend `CmrCanonicalParam` type with severity fields |
| `frontend/src/lib/cmr-local-data.ts` | Read severity fields from `output_params` |
| `frontend/src/data/cmr_reference_data.json` | Add severity fields to `output_params`, pre-populate defaults |
| `frontend/src/lib/cmr-api.ts` | Extend `CmrParamMetaUpdate` type with severity fields (for editor persistence) |
| `frontend/src/pages/cmr-new-report-page.tsx` | Add severity toggle, graded row tinting, severity pill, integrate `computeSeverity()`. Refactor inline abnormal check (lines 677-684) to use `isAbnormal()` for consistency with severity gate. |
| `frontend/src/pages/cmr-reference-database-page.tsx` | Add Severity Grading section to ParameterEditor |

No new dependencies. No API changes (local-first data model).

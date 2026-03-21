# CMR Severity Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clinical severity grading (mild/moderate/severe) to the CMR quantitative parameter table with graded row tinting, severity pills, per-parameter configurable thresholds, and an editor UI.

**Architecture:** New pure-function module `cmr-severity.ts` computes severity grades. Severity config is stored per-parameter in `output_params` within `cmr_reference_data.json`. The report page gains a Viewing toggle to enable graded colouring. The parameter editor gains a Severity Grading section.

**Tech Stack:** TypeScript, React, Vitest, Tailwind CSS, existing local-first JSON data layer.

**Spec:** `docs/superpowers/specs/2026-03-21-cmr-severity-grading-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/cmr-severity.ts` | **New** — `computeSeverity()`, `inferSeverityLabel()`, types, label grammar table |
| `frontend/tests/cmr-severity.test.ts` | **New** — Unit tests for severity grading logic |
| `frontend/src/lib/cmr-api.ts` | Extend `CmrCanonicalParam` and `CmrParamMetaUpdate` types |
| `frontend/src/lib/cmr-local-data.ts` | Read severity fields from `output_params` |
| `frontend/src/data/cmr_reference_data.json` | Add severity fields to `output_params` entries |
| `frontend/vite.config.ts` | Extend param-meta API middleware to persist severity fields |
| `frontend/src/pages/cmr-new-report-page.tsx` | Severity toggle, graded row tinting, severity pill |
| `frontend/src/pages/cmr-reference-database-page.tsx` | Severity Grading editor section |

---

### Task 1: Types and `computeSeverity()` core logic

**Files:**
- Create: `frontend/src/lib/cmr-severity.ts`
- Create: `frontend/tests/cmr-severity.test.ts`

- [ ] **Step 1: Write the types and label grammar table**

```typescript
// frontend/src/lib/cmr-severity.ts
import { isAbnormal } from './cmr-chart-scaling'

export type SeverityLabelType =
  | 'impaired' | 'dilated' | 'enlarged' | 'hypertrophied' | 'thickened'
  | 'stenosis' | 'regurgitation' | 'elevated' | 'reduced' | 'abnormal'

export type SeverityThresholds = {
  mild: number | null
  moderate: number | null
  severe: number | null
}

export type SeverityLabelOverride = {
  mild: string | null
  moderate: string | null
  severe: string | null
}

export type SeverityGrade = 'normal' | 'mild' | 'moderate' | 'severe'

export type SeverityResult = {
  grade: SeverityGrade
  label: string
}

// Grammar: some labels use adverb form ("Mildly impaired"), others use adjective form ("Mild stenosis")
const LABEL_GRAMMAR: Record<SeverityLabelType, { mild: string; moderate: string; severe: string }> = {
  impaired:      { mild: 'Mildly impaired',      moderate: 'Moderately impaired',      severe: 'Severely impaired' },
  dilated:       { mild: 'Mildly dilated',        moderate: 'Moderately dilated',       severe: 'Severely dilated' },
  enlarged:      { mild: 'Mildly enlarged',       moderate: 'Moderately enlarged',      severe: 'Severely enlarged' },
  hypertrophied: { mild: 'Mildly hypertrophied',  moderate: 'Moderately hypertrophied', severe: 'Severely hypertrophied' },
  thickened:     { mild: 'Mildly thickened',      moderate: 'Moderately thickened',     severe: 'Severely thickened' },
  stenosis:      { mild: 'Mild stenosis',         moderate: 'Moderate stenosis',        severe: 'Severe stenosis' },
  regurgitation: { mild: 'Mild regurgitation',    moderate: 'Moderate regurgitation',   severe: 'Severe regurgitation' },
  elevated:      { mild: 'Mildly elevated',       moderate: 'Moderately elevated',      severe: 'Severely elevated' },
  reduced:       { mild: 'Mildly reduced',        moderate: 'Moderately reduced',       severe: 'Severely reduced' },
  abnormal:      { mild: 'Mildly abnormal',       moderate: 'Moderately abnormal',      severe: 'Severely abnormal' },
}
```

- [ ] **Step 2: Write failing tests for `computeSeverity()`**

```typescript
// frontend/tests/cmr-severity.test.ts
import { describe, it, expect } from 'vitest'
import { computeSeverity } from '../src/lib/cmr-severity'

describe('computeSeverity', () => {
  // Gate check: normal values never get severity grading
  it('returns normal when value is within LL-UL range', () => {
    const result = computeSeverity(60, 53, 79, 5, 'low', 'impaired', null, null)
    expect(result).toEqual({ grade: 'normal', label: 'Normal' })
  })

  // LVEF with absolute thresholds, direction: low
  it('grades LVEF mild impairment with absolute thresholds', () => {
    // LVEF = 45, LL = 53 → abnormal. mild threshold = 41 → 45 >= 41 → mild
    const result = computeSeverity(45, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly impaired' })
  })

  it('grades LVEF moderate impairment with absolute thresholds', () => {
    // LVEF = 35, LL = 53 → abnormal. 35 >= 30 and < 41 → moderate
    const result = computeSeverity(35, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderately impaired' })
  })

  it('grades LVEF severe impairment with absolute thresholds', () => {
    // LVEF = 25, LL = 53 → abnormal. 25 < 30 → severe
    const result = computeSeverity(25, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severely impaired' })
  })

  // SD-based fallback, direction: high (e.g., dilated volume)
  it('grades mild with SD fallback (0-1 SD beyond UL)', () => {
    // measured=112, UL=108, SD=10 → deviation = 4/10 = 0.4 → mild
    const result = computeSeverity(112, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('grades moderate with SD fallback (1-2 SD beyond UL)', () => {
    // measured=125, UL=108, SD=10 → deviation = 17/10 = 1.7 → moderate
    const result = computeSeverity(125, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderately dilated' })
  })

  it('grades severe with SD fallback (>2 SD beyond UL)', () => {
    // measured=135, UL=108, SD=10 → deviation = 27/10 = 2.7 → severe
    const result = computeSeverity(135, 48, 108, 10, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severely dilated' })
  })

  // SD null or zero or negative → default to mild
  it('defaults to mild when SD is null', () => {
    const result = computeSeverity(112, 48, 108, null, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('defaults to mild when SD is zero', () => {
    const result = computeSeverity(112, 48, 108, 0, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  it('defaults to mild when SD is negative', () => {
    const result = computeSeverity(112, 48, 108, -5, 'high', 'dilated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly dilated' })
  })

  // Direction "both" — breached high
  it('handles both direction, breached high', () => {
    const result = computeSeverity(115, 48, 108, 10, 'both', 'abnormal', null, null)
    expect(result.grade).toBe('mild')
  })

  // Direction "both" — breached low
  it('handles both direction, breached low', () => {
    const result = computeSeverity(40, 48, 108, 10, 'both', 'abnormal', null, null)
    expect(result.grade).toBe('mild')
  })

  // Direction-dependent label resolution for "both" direction
  it('produces "Mildly elevated" for direction-dependent parameter breaching high', () => {
    const result = computeSeverity(115, 48, 108, 10, 'both', 'elevated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly elevated' })
  })

  it('produces "Mildly reduced" for direction-dependent parameter breaching low', () => {
    const result = computeSeverity(40, 48, 108, 10, 'both', 'elevated', null, null)
    expect(result).toEqual({ grade: 'mild', label: 'Mildly reduced' })
  })

  // Noun-form labels (stenosis, regurgitation) use adjective form: "Mild stenosis" not "Mildly stenosis"
  it('uses noun-form label for stenosis', () => {
    const result = computeSeverity(1.5, null, 1.0, 0.2, 'high', 'stenosis', null, null)
    expect(result).toEqual({ grade: 'moderate', label: 'Moderate stenosis' })
  })

  it('uses noun-form label for regurgitation', () => {
    const result = computeSeverity(55, null, 40, 5, 'high', 'regurgitation', null, null)
    expect(result).toEqual({ grade: 'severe', label: 'Severe regurgitation' })
  })

  // Label override
  it('uses severity_label_override when provided', () => {
    const result = computeSeverity(45, 53, 79, 5, 'low', 'impaired',
      { mild: 41, moderate: 30, severe: null },
      { mild: 'Mildly reduced EF', moderate: null, severe: null })
    expect(result).toEqual({ grade: 'mild', label: 'Mildly reduced EF' })
  })

  // Partially-set thresholds: mild set, moderate null → fall back to SD for deeper grades
  it('falls back to SD for moderate when only mild threshold is set', () => {
    // LVEF = 35, LL = 53, mild = 41, moderate = null, SD = 5
    // Value < 41 → past mild threshold. moderate is null → SD fallback from LL:
    // deviation from LL = |35 - 53| / 5 = 3.6 → severe by SD
    const result = computeSeverity(35, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: null, severe: null }, null)
    expect(result.grade).toBe('severe')
  })

  // Boundary: value exactly at threshold → milder grade
  it('value exactly at mild threshold gets mild grade (low direction)', () => {
    const result = computeSeverity(41, 53, 79, 5, 'low', 'impaired', { mild: 41, moderate: 30, severe: null }, null)
    expect(result.grade).toBe('mild')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/cmr-severity.test.ts`
Expected: FAIL — `computeSeverity` not exported / not implemented

- [ ] **Step 4: Implement `computeSeverity()`**

Add to `frontend/src/lib/cmr-severity.ts`:

```typescript
export function computeSeverity(
  measured: number,
  ll: number | null,
  ul: number | null,
  sd: number | null,
  abnormalDirection: string,
  severityLabel: SeverityLabelType | undefined | null,
  severityThresholds: SeverityThresholds | undefined | null,
  severityLabelOverride: SeverityLabelOverride | undefined | null,
): SeverityResult {
  const NORMAL: SeverityResult = { grade: 'normal', label: 'Normal' }

  // Gate: must be abnormal by LL/UL rules first
  if (!isAbnormal(measured, ll, ul, abnormalDirection)) return NORMAL

  // Determine breach direction
  let breachHigh = false
  if (abnormalDirection === 'high') breachHigh = true
  else if (abnormalDirection === 'low') breachHigh = false
  else if (abnormalDirection === 'both') {
    breachHigh = ul !== null && measured > ul
  }

  const resolvedLabel: SeverityLabelType = severityLabel ?? 'abnormal'
  const thresholds = severityThresholds ?? { mild: null, moderate: null, severe: null }
  const overrides = severityLabelOverride ?? { mild: null, moderate: null, severe: null }

  // Compute grade
  let grade: SeverityGrade = 'mild' // default

  if (thresholds.mild !== null) {
    // Absolute thresholds path
    grade = gradeFromThresholds(measured, thresholds, breachHigh, sd, ll, ul)
  } else {
    // Pure SD fallback
    grade = gradeFromSD(measured, breachHigh ? ul : ll, sd)
  }

  // Build label
  const labelType = resolveDirectionalLabel(resolvedLabel, breachHigh, abnormalDirection)
  const grammar = LABEL_GRAMMAR[labelType]
  const label = overrides[grade] ?? grammar[grade]

  return { grade, label }
}

function gradeFromThresholds(
  measured: number,
  thresholds: SeverityThresholds,
  breachHigh: boolean,
  sd: number | null,
  ll: number | null,
  ul: number | null,
): SeverityGrade {
  const { mild, moderate, severe } = thresholds

  if (breachHigh) {
    // High direction: mild < moderate < severe (ascending)
    if (mild !== null && measured <= mild) return 'mild'
    if (moderate !== null && measured <= moderate) return 'moderate'
    if (moderate !== null) return 'severe' // past moderate threshold
    if (severe !== null && measured > severe) return 'severe'
    // Only mild threshold set, value is past it → SD fallback for deeper grades
    return gradeFromSD(measured, ul, sd)
  } else {
    // Low direction: mild > moderate > severe (descending)
    if (mild !== null && measured >= mild) return 'mild'
    if (moderate !== null && measured >= moderate) return 'moderate'
    if (moderate !== null) return 'severe' // past moderate threshold
    if (severe !== null && measured < severe) return 'severe'
    // Only mild threshold set, value is past it → SD fallback for deeper grades
    return gradeFromSD(measured, ll, sd)
  }
}

function gradeFromSD(
  measured: number,
  breachedLimit: number | null,
  sd: number | null,
): SeverityGrade {
  if (breachedLimit === null || sd === null || sd <= 0) return 'mild'
  const deviation = Math.abs(measured - breachedLimit) / sd
  if (deviation <= 1) return 'mild'
  if (deviation <= 2) return 'moderate'
  return 'severe'
}

function resolveDirectionalLabel(
  label: SeverityLabelType,
  breachHigh: boolean,
  abnormalDirection: string,
): SeverityLabelType {
  // For "both" direction parameters, pick direction-specific label
  if (abnormalDirection === 'both') {
    if (label === 'elevated' || label === 'reduced') {
      return breachHigh ? 'elevated' : 'reduced'
    }
  }
  return label
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/cmr-severity.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/cmr-severity.ts frontend/tests/cmr-severity.test.ts
git commit -m "feat(cmr): add computeSeverity() with types, grammar table, and tests"
```

---

### Task 2: `inferSeverityLabel()` — auto-detect label from parameter

**Files:**
- Modify: `frontend/src/lib/cmr-severity.ts`
- Modify: `frontend/tests/cmr-severity.test.ts`

- [ ] **Step 1: Write failing tests for `inferSeverityLabel()`**

Add to `frontend/tests/cmr-severity.test.ts`:

```typescript
import { inferSeverityLabel } from '../src/lib/cmr-severity'

describe('inferSeverityLabel', () => {
  it('infers "impaired" for LV EF', () => {
    expect(inferSeverityLabel('LV EF', 'LEFT VENTRICLE', 'LV function')).toBe('impaired')
  })

  it('infers "impaired" for RV EF', () => {
    expect(inferSeverityLabel('RV EF', 'RIGHT VENTRICLE', 'RV function')).toBe('impaired')
  })

  it('infers "dilated" for LV EDV', () => {
    expect(inferSeverityLabel('LV EDV', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('dilated')
  })

  it('infers "dilated" for LV EDV (i)', () => {
    expect(inferSeverityLabel('LV EDV (i)', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('dilated')
  })

  it('infers "enlarged" for LA max volume', () => {
    expect(inferSeverityLabel('LA max volume', 'LEFT ATRIUM', 'LA volume')).toBe('enlarged')
  })

  it('infers "enlarged" for RA max area (4ch)', () => {
    expect(inferSeverityLabel('RA max area (4ch)', 'RIGHT ATRIUM', 'RA area')).toBe('enlarged')
  })

  it('infers "hypertrophied" for LV mass', () => {
    expect(inferSeverityLabel('LV mass', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('hypertrophied')
  })

  it('infers "hypertrophied" for LV mass (i)', () => {
    expect(inferSeverityLabel('LV mass (i)', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('hypertrophied')
  })

  it('infers "thickened" for LV peak wall thickness', () => {
    expect(inferSeverityLabel('LV peak wall thickness', 'LEFT VENTRICLE', 'LV size and geometry')).toBe('thickened')
  })

  it('infers "regurgitation" for AV regurgitant fraction', () => {
    expect(inferSeverityLabel('AV regurgitant fraction', 'AORTIC VALVE', '')).toBe('regurgitation')
  })

  it('infers "regurgitation" for MR regurgitant fraction', () => {
    expect(inferSeverityLabel('MR regurgitant fraction', 'MITRAL VALVE', '')).toBe('regurgitation')
  })

  it('infers "dilated" for aortic sinus diameter', () => {
    expect(inferSeverityLabel('Aortic sinus diameter', 'AORTA', '')).toBe('dilated')
  })

  it('infers "dilated" for MPA diameter', () => {
    expect(inferSeverityLabel('MPA systolic diameter', 'PULMONARY ARTERY', '')).toBe('dilated')
  })

  it('infers "impaired" for MAPSE', () => {
    expect(inferSeverityLabel('MAPSE', 'LEFT VENTRICLE', 'LV function')).toBe('impaired')
  })

  it('infers "impaired" for TAPSE', () => {
    expect(inferSeverityLabel('TAPSE', 'RIGHT VENTRICLE', 'RV function')).toBe('impaired')
  })

  it('infers "elevated" for PCWP', () => {
    expect(inferSeverityLabel('PCWP', 'FLOW', '')).toBe('elevated')
  })

  it('infers "elevated" for LV CO (direction-dependent)', () => {
    expect(inferSeverityLabel('LV CO', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for LV CI (direction-dependent)', () => {
    expect(inferSeverityLabel('LV CI', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for LV SV (direction-dependent)', () => {
    expect(inferSeverityLabel('LV SV', 'LEFT VENTRICLE', 'LV function')).toBe('elevated')
  })

  it('infers "elevated" for RV SV (i) (direction-dependent)', () => {
    expect(inferSeverityLabel('RV SV (i)', 'RIGHT VENTRICLE', 'RV function')).toBe('elevated')
  })

  it('infers "dilated" for ascending aorta (without "diameter" in name)', () => {
    expect(inferSeverityLabel('Ascending aorta', 'AORTA', '')).toBe('dilated')
  })

  it('infers "abnormal" for unknown parameters', () => {
    expect(inferSeverityLabel('Something unknown', 'OTHER', '')).toBe('abnormal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/cmr-severity.test.ts`
Expected: FAIL — `inferSeverityLabel` not exported

- [ ] **Step 3: Implement `inferSeverityLabel()`**

Add to `frontend/src/lib/cmr-severity.ts`:

```typescript
export function inferSeverityLabel(
  parameterKey: string,
  majorSection: string,
  subSection: string,
): SeverityLabelType {
  const key = parameterKey.toLowerCase()
  const section = majorSection.toLowerCase()

  // EF parameters → impaired
  if (key.endsWith(' ef') || key === 'lv ef' || key === 'rv ef' || key === 'la ef' || key === 'ra ef') return 'impaired'

  // MAPSE / TAPSE → impaired
  if (key === 'mapse' || key === 'tapse' || key.startsWith('mapse ') || key.startsWith('tapse ')) return 'impaired'

  // Regurgitant fraction → regurgitation
  if (key.includes('regurgitant fraction')) return 'regurgitation'

  // Mass → hypertrophied
  if (key.includes('mass') && !key.includes('mass/')) return 'hypertrophied'

  // Wall thickness → thickened
  if (key.includes('wall thickness') || key.includes('peak thickness')) return 'thickened'

  // PCWP → elevated
  if (key === 'pcwp') return 'elevated'

  // Native T1, T2, ECV, T2* → elevated (direction-dependent resolution happens at runtime)
  if (key.startsWith('native t1') || key.startsWith('native t2') || key === 'ecv' || key.includes('t2*')) return 'elevated'

  // Stroke volume → elevated (direction-dependent)
  if (key.match(/\bsv\b/)) return 'elevated'

  // Atrial parameters → enlarged
  if (section.includes('atrium') || section.startsWith('la') || section.startsWith('ra')) {
    if (!key.endsWith(' ef')) return 'enlarged'
  }

  // Ventricular volumes (EDV, ESV) → dilated
  if (key.includes('edv') || key.includes('esv')) return 'dilated'

  // Ventricular diameters → dilated
  if (key.includes('diameter') && (section.includes('ventricle'))) return 'dilated'

  // Aorta / pulmonary artery → dilated (all parameters in these sections)
  if (section.includes('aorta') || section.includes('pulmonary artery')) return 'dilated'

  // Valve annulus diameters → dilated
  if (key.includes('annulus diameter')) return 'dilated'

  // CO / CI → elevated (direction-dependent) — word-boundary match to avoid false positives
  if (key.match(/\bco\b/) || key.match(/\bci\b/)) return 'elevated'

  return 'abnormal'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/cmr-severity.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cmr-severity.ts frontend/tests/cmr-severity.test.ts
git commit -m "feat(cmr): add inferSeverityLabel() for auto-detecting parameter label type"
```

---

### Task 3: Extend types and data layer

**Files:**
- Modify: `frontend/src/lib/cmr-api.ts`
- Modify: `frontend/src/lib/cmr-local-data.ts`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Extend `CmrCanonicalParam` type**

In `frontend/src/lib/cmr-api.ts`, add severity fields to the `CmrCanonicalParam` type (after `sources`):

```typescript
export type CmrCanonicalParam = {
  parameter_key: string
  unit: string
  indexing: string
  abnormal_direction: string
  major_section: string
  sub_section: string
  sort_order: number
  ll: number | null
  mean: number | null
  ul: number | null
  sd: number | null
  age_band: string | null
  pap_differs: boolean
  sources: CmrSourceCitation[]
  // Severity grading (optional — undefined triggers auto-inference/SD fallback)
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
}
```

- [ ] **Step 2: Extend `CmrParamMetaUpdate` type**

In `frontend/src/lib/cmr-api.ts`, add severity fields to `CmrParamMetaUpdate`:

```typescript
export type CmrParamMetaUpdate = {
  parameter_key: string
  unit?: string
  indexing?: string
  abnormal_direction?: string
  major_section?: string
  sub_section?: string
  pap_affected?: boolean
  sources?: CmrSourceCitation[]
  severity_label?: string | null
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null } | null
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null } | null
}
```

- [ ] **Step 3: Read severity fields in `cmr-local-data.ts`**

Find the section in `cmr-local-data.ts` where `CmrCanonicalParam` objects are constructed (inside `resolveReferenceParameters()`). Add severity fields from the raw output_params data. The fields are optional and may be undefined on older data entries — this is fine since the grading logic handles undefined gracefully.

Look for where the result object is built (should have properties like `parameter_key: name, unit: outputParam.unit, ...`). Add:

```typescript
severity_label: outputParam.severity_label,
severity_thresholds: outputParam.severity_thresholds,
severity_label_override: outputParam.severity_label_override,
```

Also update the `RawOutputParam` type to include the optional severity fields:

```typescript
type RawOutputParam = {
  parameter: string
  unit: string
  indexing: string
  major_section: string
  sub_section: string
  pap_affected?: boolean
  sources?: RawSourceCitation[]
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
}
```

- [ ] **Step 4: Extend vite API middleware for persistence**

In `frontend/vite.config.ts`, find the param-meta PUT handler (around line 80-113). In the destructuring line (line 84), add the new fields:

```typescript
const { parameter_key, unit, indexing, abnormal_direction, major_section, sub_section, pap_affected, sources,
  severity_label, severity_thresholds, severity_label_override } =
  JSON.parse(await readBody(req))
```

In the `output_params` update block (after `if (sources !== undefined)`), add:

```typescript
if (severity_label !== undefined) data.output_params[parameter_key].severity_label = severity_label
if (severity_thresholds !== undefined) data.output_params[parameter_key].severity_thresholds = severity_thresholds
if (severity_label_override !== undefined) data.output_params[parameter_key].severity_label_override = severity_label_override
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cmr-api.ts frontend/src/lib/cmr-local-data.ts frontend/vite.config.ts
git commit -m "feat(cmr): extend types and data layer for severity grading fields"
```

---

### Task 4: Pre-populate severity defaults in reference data

**Files:**
- Modify: `frontend/src/data/cmr_reference_data.json`

- [ ] **Step 1: Add severity fields to key parameters**

Add `severity_label` and `severity_thresholds` to the following entries in `output_params`:

**LVEF:**
```json
"LV EF": {
  ...existing fields...,
  "severity_label": "impaired",
  "severity_thresholds": { "mild": 41, "moderate": 30, "severe": null }
}
```

**RVEF:**
```json
"RV EF": {
  ...existing fields...,
  "severity_label": "impaired",
  "severity_thresholds": { "mild": 40, "moderate": 30, "severe": null }
}
```

For all other parameters: no `severity_label` or `severity_thresholds` fields needed — `inferSeverityLabel()` and SD-based fallback handle them automatically. Only add explicit fields where clinical cutoffs differ from SD-based defaults.

- [ ] **Step 2: Verify the JSON is valid**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/data/cmr_reference_data.json','utf8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

- [ ] **Step 3: Commit**

```bash
git add frontend/src/data/cmr_reference_data.json
git commit -m "feat(cmr): pre-populate LVEF and RVEF severity thresholds in reference data"
```

---

### Task 5: Severity toggle and graded row rendering

**Files:**
- Modify: `frontend/src/pages/cmr-new-report-page.tsx`

- [ ] **Step 1: Add severity imports and state**

Add import at the top of `cmr-new-report-page.tsx`:

```typescript
import { computeSeverity, inferSeverityLabel, type SeverityLabelType, type SeverityResult } from '@/lib/cmr-severity'
```

Add state near the other state declarations (around line 370):

```typescript
const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>('off')
```

- [ ] **Step 2: Add severity toggle to Viewing group**

In the Viewing section of the control bar (find the `{/* Viewing */}` comment, around line 540), add a new PillToggle between the Charts toggle and the chart chip controls:

```tsx
<PillToggle
  options={[
    { key: 'off', label: 'Off' },
    { key: 'abnormal', label: 'Abnormal' },
  ]}
  value={severityMode}
  onChange={(v) => setSeverityMode(v as 'off' | 'abnormal')}
/>
```

- [ ] **Step 3: Refactor row `measuredStatus` to use `computeSeverity()`**

Replace the inline abnormal check block (lines ~677-685) with:

```typescript
let severity: SeverityResult = { grade: 'normal', label: 'Normal' }
if (hasMeasuredVal) {
  severity = computeSeverity(
    measured!,
    p.ll,
    p.ul,
    p.sd,
    p.abnormal_direction,
    (p.severity_label as SeverityLabelType) ?? inferSeverityLabel(p.parameter_key, p.major_section, p.sub_section),
    p.severity_thresholds ?? null,
    p.severity_label_override ?? null,
  )
}
const isAbnormalRow = severity.grade !== 'normal'
```

- [ ] **Step 4: Update row className for graded tinting**

Replace the existing row `className` that references `measuredStatus` with:

```typescript
className={cn(
  'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
  selectedParam?.parameter_key === p.parameter_key && 'bg-[hsl(var(--tone-danger-50)/0.6)]',
  severityMode === 'abnormal' && severity.grade === 'mild' && 'bg-[hsl(var(--tone-danger-50)/0.25)]',
  severityMode === 'abnormal' && severity.grade === 'moderate' && 'bg-[hsl(var(--tone-danger-50)/0.5)]',
  severityMode === 'abnormal' && severity.grade === 'severe' && 'bg-[hsl(var(--tone-danger-50)/0.75)]',
)}
```

Note: the old binary tinting (`measuredStatus === 'abnormal' && 'bg-[hsl(var(--tone-danger-50)/0.4)]'`) is removed entirely. Row colouring is now gated behind the severity toggle.

- [ ] **Step 5: Update measured value cell with severity pill and colour**

Replace the measured value `<td>` (around line 704-711) with:

```tsx
<td className={cn(
  'house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold',
  severityMode === 'abnormal' && isAbnormalRow && severity.grade === 'severe' && 'text-[hsl(var(--tone-danger-600))] font-bold',
  severityMode === 'abnormal' && isAbnormalRow && severity.grade !== 'severe' && 'text-[hsl(var(--tone-danger-500))]',
  severityMode === 'abnormal' && !isAbnormalRow && hasMeasuredVal && 'text-[hsl(var(--tone-positive-600))]',
  severityMode === 'off' && !hasMeasuredVal && 'text-[hsl(var(--tone-neutral-300))]',
)}>
  {hasMeasuredVal ? measured : '\u2014'}
  {severityMode === 'abnormal' && isAbnormalRow && (
    <span className={cn(
      'ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold',
      severity.grade === 'mild' && 'bg-[hsl(var(--tone-danger-100)/0.5)] text-[hsl(var(--tone-danger-500))]',
      severity.grade === 'moderate' && 'bg-[hsl(var(--tone-danger-200)/0.6)] text-[hsl(var(--tone-danger-600))]',
      severity.grade === 'severe' && 'bg-[hsl(var(--tone-danger-500))] text-white',
    )}>
      {severity.label}
    </span>
  )}
</td>
```

- [ ] **Step 6: Update colSpan for section dividers if needed**

Check that the `colSpan` on sub-section divider rows still matches the column count. The column count hasn't changed (no new table columns), so this should be fine — but verify.

- [ ] **Step 7: Test visually**

Start dev server: `cd frontend && npx vite`
Navigate to `/cmr-new-report` and:
1. Verify the "Off / Abnormal" toggle appears in the Viewing group
2. Switch to "All Metrics" to see rows
3. Toggle Abnormal — rows should have no tinting
4. If extraction data is loaded: verify graded tinting and severity pills appear for abnormal values

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/cmr-new-report-page.tsx
git commit -m "feat(cmr): add severity toggle with graded row tinting and severity pills"
```

---

### Task 6: Parameter editor — Severity Grading section

**Files:**
- Modify: `frontend/src/pages/cmr-reference-database-page.tsx`

- [ ] **Step 1: Add severity state variables to ParameterEditor**

Find the metadata state declarations in `ParameterEditor` (around line 233). Add:

```typescript
const [metaSeverityLabel, setMetaSeverityLabel] = useState<string>('')
const [metaSeverityThresholds, setMetaSeverityThresholds] = useState<{ mild: string; moderate: string; severe: string }>({ mild: '', moderate: '', severe: '' })
const [metaSeverityOverrides, setMetaSeverityOverrides] = useState<{ mild: string; moderate: string; severe: string }>({ mild: '', moderate: '', severe: '' })
```

Note: thresholds and overrides use string state for input fields (empty string = null when saving).

- [ ] **Step 2: Initialize severity state when parameter loads**

Find where other meta fields are initialized from the selected parameter (look for where `setMetaUnit`, `setMetaDirection` etc. are called when a parameter is selected). Add:

```typescript
setMetaSeverityLabel(param.severity_label ?? '')
setMetaSeverityThresholds({
  mild: param.severity_thresholds?.mild?.toString() ?? '',
  moderate: param.severity_thresholds?.moderate?.toString() ?? '',
  severe: param.severity_thresholds?.severe?.toString() ?? '',
})
setMetaSeverityOverrides({
  mild: param.severity_label_override?.mild ?? '',
  moderate: param.severity_label_override?.moderate ?? '',
  severe: param.severity_label_override?.severe ?? '',
})
```

- [ ] **Step 3: Add Severity Grading UI section**

Add after the existing metadata card (after the grid with Parameter Key, Unit, Section, etc. — around line 631). Follow the existing card/section pattern:

```tsx
{/* Severity Grading */}
<div className="space-y-3">
  <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
    Severity Grading
  </h4>
  <div className="grid grid-cols-2 gap-3">
    <MetaField
      label="Label type"
      value={metaSeverityLabel}
      onChange={(v) => { pushUndo(); setMetaSeverityLabel(v); setMetaDirty(true) }}
      placeholder={`${inferSeverityLabel(metaKey, metaSection, metaSubSection)} (auto)`}
      type="select"
      options={[
        { value: '', label: '(auto)' },
        { value: 'impaired', label: 'impaired' },
        { value: 'dilated', label: 'dilated' },
        { value: 'enlarged', label: 'enlarged' },
        { value: 'hypertrophied', label: 'hypertrophied' },
        { value: 'thickened', label: 'thickened' },
        { value: 'stenosis', label: 'stenosis' },
        { value: 'regurgitation', label: 'regurgitation' },
        { value: 'elevated', label: 'elevated' },
        { value: 'reduced', label: 'reduced' },
        { value: 'abnormal', label: 'abnormal' },
      ]}
    />
    <div className="text-xs text-[hsl(var(--tone-neutral-400))]">
      Direction: <strong>{metaDirection || 'none'}</strong>
    </div>
  </div>
  <div className="space-y-1">
    <label className="text-xs font-medium text-[hsl(var(--tone-neutral-500))]">
      Custom thresholds
    </label>
    <div className="grid grid-cols-3 gap-2">
      <input type="number" placeholder="Mild" value={metaSeverityThresholds.mild}
        onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, mild: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
      <input type="number" placeholder="Moderate" value={metaSeverityThresholds.moderate}
        onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, moderate: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
      <input type="number" placeholder="Severe" value={metaSeverityThresholds.severe}
        onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, severe: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
    </div>
    <p className="text-[10px] text-[hsl(var(--tone-neutral-400))]">
      Absolute cutoffs. Leave empty for SD-based grading (1/2/2+ SD beyond limit).
    </p>
  </div>
  <div className="space-y-1">
    <label className="text-xs font-medium text-[hsl(var(--tone-neutral-500))]">
      Label overrides
    </label>
    <div className="grid grid-cols-3 gap-2">
      <input type="text" placeholder="Mild label" value={metaSeverityOverrides.mild}
        onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, mild: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
      <input type="text" placeholder="Moderate label" value={metaSeverityOverrides.moderate}
        onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, moderate: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
      <input type="text" placeholder="Severe label" value={metaSeverityOverrides.severe}
        onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, severe: e.target.value })); setMetaDirty(true) }}
        className="rounded border border-[hsl(var(--stroke-soft))] px-2 py-1 text-xs" />
    </div>
    <p className="text-[10px] text-[hsl(var(--tone-neutral-400))]">
      Override the auto-generated severity label. Leave empty to use default.
    </p>
  </div>
</div>
```

Also add the import at the top of the file:

```typescript
import { inferSeverityLabel } from '@/lib/cmr-severity'
```

- [ ] **Step 4: Include severity fields in save logic**

Find the save handler that calls `updateParameterMeta()` (around line 428-477). Add severity fields to the update payload:

```typescript
severity_label: metaSeverityLabel || null,
severity_thresholds: (metaSeverityThresholds.mild || metaSeverityThresholds.moderate || metaSeverityThresholds.severe)
  ? {
      mild: metaSeverityThresholds.mild ? Number(metaSeverityThresholds.mild) : null,
      moderate: metaSeverityThresholds.moderate ? Number(metaSeverityThresholds.moderate) : null,
      severe: metaSeverityThresholds.severe ? Number(metaSeverityThresholds.severe) : null,
    }
  : null,
severity_label_override: (metaSeverityOverrides.mild || metaSeverityOverrides.moderate || metaSeverityOverrides.severe)
  ? {
      mild: metaSeverityOverrides.mild || null,
      moderate: metaSeverityOverrides.moderate || null,
      severe: metaSeverityOverrides.severe || null,
    }
  : null,
```

- [ ] **Step 5: Test visually**

Navigate to the reference database editor, select a parameter (e.g., LV EF), and:
1. Verify the Severity Grading section appears with label dropdown, threshold inputs, override inputs
2. Verify LV EF shows "impaired" as label type and 41/30 as mild/moderate thresholds
3. Edit a threshold, save, reload — verify it persists in the JSON file

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/cmr-reference-database-page.tsx
git commit -m "feat(cmr): add Severity Grading section to parameter editor"
```

---

### Task 7: Run all tests and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (including existing tests — no regressions)

- [ ] **Step 2: Visual verification checklist**

Start dev server and verify:
1. `/cmr-new-report` — Off/Abnormal toggle visible in Viewing group
2. Toggle to Abnormal — graded row tinting appears (if extraction data loaded)
3. Severity pills show correct labels (e.g., "Mildly impaired" for LVEF)
4. Toggle to Off — all row tinting disappears
5. Charts still work correctly with both scaling modes
6. Reference database editor — Severity Grading section editable and saves

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(cmr): cleanup after severity grading implementation"
```

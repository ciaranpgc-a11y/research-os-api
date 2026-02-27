# Input Inventory (Phase 1)

Generated: 2026-02-27
Scope: `frontend/src/components/ui` and `frontend/src/stories/design-system/primitives`

## Located Primitives

| Primitive | File | Status |
| --- | --- | --- |
| Input | `frontend/src/components/ui/input.tsx` | Exists |
| Textarea | `frontend/src/components/ui/textarea.tsx` | Missing |
| Select | `frontend/src/components/ui/select.tsx` | Missing |

## Located Stories

| Story | File | Uses UI primitive component? |
| --- | --- | --- |
| Input | `frontend/src/stories/design-system/primitives/Input.stories.tsx` | Yes (`Input`) |
| Textarea | `frontend/src/stories/design-system/primitives/Textarea.stories.tsx` | No (raw `<textarea>`) |
| Select Dropdown | `frontend/src/stories/design-system/primitives/SelectDropdown.stories.tsx` | No (raw `<select>`) |

## Current API

### Input (`input.tsx`)
- Component shape: `React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>`
- Props: native input props only (`type`, `disabled`, `readOnly`, `aria-*`, etc.)
- Custom API props: none
- Variant prop: none
- Size prop: none
- Data attributes: `data-ui="input"`, `data-house-role="form-input"`
- Base classes include utility sizing and `houseForms.input` (`house-input`)

### Textarea
- No primitive component/API in `components/ui`
- Current usage is ad hoc raw `<textarea>` plus classes

### Select
- No primitive component/API in `components/ui`
- Current usage is ad hoc raw `<select>` plus classes

## Story Coverage

- `Input.stories.tsx` has one `States` story showing: default value, placeholder, invalid (class override), disabled, focus simulated.
- `Textarea.stories.tsx` has one `States` story using raw `<textarea>`.
- `SelectDropdown.stories.tsx` has one `Variants` story using raw `<select>`.
- Missing coverage for canonical API (variants/sizes do not exist yet), dark-mode snapshots, and true focus-visible keyboard interactions.

## Drift Points And Duplicates

- Primitive drift: Input has a component, Textarea/Select do not.
- Story drift: Textarea/Select stories are not testing primitives, only ad hoc markup.
- Styling drift: form styling lives in global classes (`house-input`, `house-dropdown`, `house-textarea`) rather than semantic-token primitive APIs.
- Class duplication: both `.house-dropdown` and `.house-select` are defined with overlapping behavior.
- Adoption drift in app code: direct native form controls are common (`<select>` occurrences: 28, `<textarea>` occurrences: 13 in `frontend/src`).

## Ad Hoc Classnames Identified

- `house-input`
- `house-dropdown`
- `house-select`
- `house-dropdown-option`
- `house-textarea`

## Token-Policy And Motion Findings

### Violations / risks
- Tone-token + arbitrary HSL in stories:
  - `frontend/src/stories/design-system/primitives/Input.stories.tsx` uses `border-[hsl(var(--tone-danger-500))]`
  - `frontend/src/stories/design-system/primitives/Textarea.stories.tsx` uses `border-[hsl(var(--tone-danger-500))]`
  - `frontend/src/stories/design-system/primitives/SelectDropdown.stories.tsx` uses `border-[hsl(var(--tone-danger-500))]`
- Global form classes use tone ramps directly (non-semantic) in `frontend/src/index.css`:
  - `.house-input` block (starts at line 902)
  - `.house-dropdown/.house-select` block (starts at line 932)
  - `.house-textarea` block (starts at line 982)
- Input primitive depends on ad hoc global class token (`houseForms.input -> house-input`) rather than semantic-token utility classes.

### Motion findings
- No inline Tailwind duration utility classes found in primitive/story files.
- `input.tsx` uses `transition-colors` without explicit token duration utility.
- Relevant global form classes use token duration (`var(--motion-duration-ui)`) but literal easing (`ease-out`) instead of a motion-easing token.

### Raw hex
- No raw hex values found in the inventoried primitive/story files.

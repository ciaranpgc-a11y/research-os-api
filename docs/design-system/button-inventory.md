# Button Inventory

## Scope
- Inspected: `frontend/src/components/ui/button.tsx`
- Inspected: `frontend/src/stories/design-system/primitives/Button.stories.tsx`
- Inspected: `frontend/src/stories/design-system/primitives/ButtonTiers.stories.tsx`
- Searched for a non-story `ButtonTiers` component file under `frontend/src`: none found.

## Existing Variants, Sizes, Intent Values
- `variant` values in `Button` (`button.tsx:12-20`): `default`, `secondary`, `outline`, `house`, `housePrimary`, `ghost`, `destructive`
- `size` values in `Button` (`button.tsx:21-26`): `default`, `sm`, `lg`, `icon`
- Default values (`button.tsx:28-31`): `variant='default'`, `size='default'`
- `intent` prop values: none. There is no `intent` prop in `ButtonProps`.
- Story tier labels currently used as intent-like labels:
- `Primary` -> `variant="housePrimary"` (`Button.stories.tsx:14`, `ButtonTiers.stories.tsx:20`)
- `Secondary` -> `variant="house"` (`Button.stories.tsx:14`, `ButtonTiers.stories.tsx:21`)
- `Outline` -> `variant="outline"` (`Button.stories.tsx:14`, `ButtonTiers.stories.tsx:22`)
- `Ghost` -> `variant="ghost"` (`Button.stories.tsx:14`, `ButtonTiers.stories.tsx:23`)
- `Destructive` -> `variant="destructive"` (`Button.stories.tsx:14`, `ButtonTiers.stories.tsx:24`)
- `Disabled` -> `variant="housePrimary"` + `disabled` (`Button.stories.tsx:16`, `ButtonTiers.stories.tsx:25-26`)

## All Supported Props
- `ButtonProps` extends `React.ButtonHTMLAttributes<HTMLButtonElement>` (`button.tsx:35-37`)
- Supports all standard button HTML props, including examples like `disabled`, `type`, `onClick`, `aria-*`, etc.
- Variant props from CVA (`button.tsx:37`):
- `variant?: 'default' | 'secondary' | 'outline' | 'house' | 'housePrimary' | 'ghost' | 'destructive'`
- `size?: 'default' | 'sm' | 'lg' | 'icon'`
- Additional explicit prop:
- `asChild?: boolean` (`button.tsx:38`)
- Implementation behavior:
- Uses `Slot` when `asChild` is true, otherwise renders `button` (`button.tsx:42-43`)
- Adds data attributes `data-ui`, `data-house-role`, `data-ui-variant`, `data-ui-size` (`button.tsx:48-51`)

## Button vs ButtonTiers
- `Button` is a reusable UI primitive component with variant/size logic in CVA (`button.tsx`).
- `ButtonTiers` is not a component. It is a Storybook story title that renders `Button` examples (`ButtonTiers.stories.tsx:6-30`).
- `Button.stories.tsx` covers:
- Variant row (`Button.stories.tsx:14`)
- Size row (`Button.stories.tsx:15`)
- Disabled/loading/icon state row (`Button.stories.tsx:16`)
- `ButtonTiers.stories.tsx` covers:
- Tier-style variant row + disabled example only (`ButtonTiers.stories.tsx:20-26`)

## Wrap vs Duplicate Logic
- No `ButtonTiers` implementation wrapper exists in `src/components`.
- `ButtonTiers.stories.tsx` directly uses `<Button ...>` and does not duplicate variant logic.

## Raw Color or Tone Usage
- Found in `Button` component:
- `outline` variant uses raw `hsl(var(...))` arbitrary classes and tone tokens (`button.tsx:15`)
- Includes `--tone-neutral-50`, `--tone-neutral-800`, `--tone-accent-400`, `--tone-accent-50`, `--tone-accent-800`
- Uses `--stroke-strong` token in same line (`button.tsx:15`)
- No raw tone usage found in `Button.stories.tsx` or `ButtonTiers.stories.tsx`.

## Inline Tailwind Duration Utilities
- Found:
- `duration-220` in base class string (`button.tsx:9`)
- No duration utility classes found in `Button.stories.tsx` or `ButtonTiers.stories.tsx`.

## Hex Values
- No hex color literals found in the inspected files.

## Ad Hoc Classnames
- In `button.tsx`, arbitrary Tailwind classes are present:
- `transition-[background-color,border-color,color,transform]` (`button.tsx:9`)
- `active:scale-[0.98]` (`button.tsx:9`)
- `border-[hsl(var(--stroke-strong)/0.94)]` (`button.tsx:15`)
- `bg-[hsl(var(--tone-neutral-50))]` (`button.tsx:15`)
- `text-[hsl(var(--tone-neutral-800))]` (`button.tsx:15`)
- `hover:border-[hsl(var(--tone-accent-400)/0.88)]` (`button.tsx:15`)
- `hover:bg-[hsl(var(--tone-accent-50))]` (`button.tsx:15`)
- `hover:text-[hsl(var(--tone-accent-800))]` (`button.tsx:15`)
- Story files use regular utility classes for layout/icon spacing; no arbitrary `[...]` classes were found there.

## Overlapping Tier Names
- Variant-level overlap in `Button`:
- `default` and `housePrimary` map to the same class composition (`button.tsx:13`, `button.tsx:17`)
- `secondary` and `house` map to the same class composition (`button.tsx:14`, `button.tsx:16`)
- Story-level overlap:
- `Button.stories` and `ButtonTiers.stories` both present the same tier names and mappings: Primary, Secondary, Outline, Ghost, Destructive, Disabled.

## Conflicting Visual Behaviors
- Naming conflict risk:
- Multiple variant names resolve to identical visuals (`default` vs `housePrimary`; `secondary` vs `house`), which can produce inconsistent usage language across teams.
- Token policy inconsistency:
- `outline` uses direct tone tokens/raw `hsl(var(...))` while other variants rely more on shared semantic/house-style classes.
- Size differentiation risk:
- `default` and `sm` both use `h-9 px-3`; only an explicit `rounded-md` appears on `sm` despite base class already including `rounded-md` (`button.tsx:9`, `button.tsx:22-23`).

## Redundant Story Examples
- `ButtonTiers.stories.tsx` largely duplicates the variant/tier row already present in `Button.stories.tsx`.
- Disabled example is duplicated in both stories.
- `ButtonTiers.stories.tsx` adds no unique variant or behavior beyond what is already shown in `Button.stories.tsx`.

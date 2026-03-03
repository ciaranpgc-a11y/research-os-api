import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  LegacySelectPrimitive as SelectPrimitive,
  LegacySelectTrigger as LegacySelectTrigger,
  LegacySelectContent as SelectContent,
  LegacySelectItem as LegacySelectItem,
  LegacySelectValue as SelectValue,
} from '@/components/legacy/primitives/LegacySelectPrimitive'

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof LegacySelectTrigger>,
  React.ComponentPropsWithoutRef<typeof LegacySelectTrigger>
>(({ className, ...props }, ref) => (
  <LegacySelectTrigger
    ref={ref}
    className={cn(
      className,
      'h-9 min-h-9 hover:border-[hsl(var(--tone-neutral-900))] hover:shadow-[0_0_0_1px_hsl(var(--tone-neutral-900)/0.12)] focus-visible:border-[hsl(var(--tone-neutral-900))] focus-visible:shadow-[0_0_0_1px_hsl(var(--tone-neutral-900)/0.18)]',
    )}
    {...props}
  />
))

SelectTrigger.displayName = 'SelectTrigger'

const SelectItem = React.forwardRef<
  React.ElementRef<typeof LegacySelectItem>,
  React.ComponentPropsWithoutRef<typeof LegacySelectItem>
>(({ className, ...props }, ref) => (
  <LegacySelectItem
    ref={ref}
    className={cn(
      className,
      'focus:bg-[hsl(var(--house-select-accent)/0.12)] data-[state=checked]:bg-[hsl(var(--house-select-accent)/0.18)]',
    )}
    {...props}
  />
))

SelectItem.displayName = 'SelectItem'

export { SelectPrimitive, SelectTrigger, SelectContent, SelectItem, SelectValue }

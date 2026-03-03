import * as React from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

/**
 * TooltipPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-1 horizontal, --space-0 vertical
 * - Typography: text-caption
 * - Colors: neutral-900 background, neutral-50 text
 * - Elevation: --elevation-3
 * - Motion: --motion-slow + --ease-decelerate
 * - Entrance animation: tooltip-fade-in (opacity + translateY)
 *
 * Accessibility:
 * - Radix provides role=\"tooltip\" semantics
 * - Focus and keyboard trigger support is built in
 * - Screen reader support follows Radix tooltip primitives
 * - `motion-reduce:animate-none` respects reduced-motion preferences
 */

const LegacyTooltipProvider = RadixTooltip.Provider
const LegacyTooltipPrimitive = RadixTooltip.Root
const LegacyTooltipTrigger = RadixTooltip.Trigger

type TooltipContentProps = React.ComponentPropsWithoutRef<typeof RadixTooltip.Content> & {
  withArrow?: boolean
}

const LegacyTooltipContent = React.forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  TooltipContentProps
>(({ className, sideOffset = 6, withArrow = true, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      data-ui="tooltip-primitive-content"
      data-house-role="tooltip-content"
      className={cn(
        'z-50 w-fit max-w-xs rounded-[var(--radius-sm)] border border-[hsl(var(--tone-neutral-700))]',
        'bg-[hsl(var(--tone-neutral-900))] text-[hsl(var(--tone-neutral-50))]',
        'text-caption shadow-[var(--elevation-3)]',
        'motion-reduce:animate-none',
        'animate-[tooltip-fade-in_var(--motion-slow)_var(--ease-decelerate)]',
        className,
      )}
      style={{
        paddingInline: 'var(--space-1)',
        paddingBlock: 'var(--space-0)',
      }}
      {...props}
    >
      {props.children}
      {withArrow ? (
        <RadixTooltip.Arrow
          data-ui="tooltip-primitive-arrow"
          className="fill-[hsl(var(--tone-neutral-900))]"
        />
      ) : null}
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
))
LegacyTooltipContent.displayName = 'LegacyTooltipContent'

export {
  LegacyTooltipProvider,
  LegacyTooltipPrimitive,
  LegacyTooltipTrigger,
  LegacyTooltipContent,
}

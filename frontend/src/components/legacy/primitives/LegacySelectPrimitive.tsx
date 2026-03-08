import * as React from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * SelectPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-2 horizontal, --space-1 vertical
 * - Typography: text-body
 * - Border: hsl(var(--border))
 * - Focus/Error rings: --ring-focus / --ring-error
 * - Motion: --motion-duration-ui
 * - Dropdown elevation: --elevation-3
 * - Colors: --foreground, --background, --muted-foreground, --tone-accent-500, --tone-danger-500
 *
 * Accessibility:
 * - Radix Select provides keyboard navigation (arrows/enter/escape)
 * - Trigger focus visibility is tokenized and explicit
 * - Selected item state is visually indicated and screen-reader compatible
 */

const legacySelectTriggerVariants = cva(
  [
    'flex w-full min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)]',
    'border border-[hsl(var(--border))]',
    'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
    'text-body',
    'transition-[border-color,box-shadow]',
    'focus:outline-none focus:border-[hsl(var(--tone-accent-500))] focus:shadow-[var(--ring-focus)]',
    'data-[placeholder]:text-[hsl(var(--muted-foreground))]',
    'aria-[invalid=true]:border-[hsl(var(--tone-danger-500))]',
    'aria-[invalid=true]:shadow-[var(--ring-error)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'h-10 min-h-11',
        md: 'h-11',
        lg: 'h-14',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

type SelectTriggerProps = React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger> &
  VariantProps<typeof legacySelectTriggerVariants>

const LegacySelectPrimitive = RadixSelect.Root
const LegacySelectValue = RadixSelect.Value

const LegacySelectTrigger = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Trigger>,
  SelectTriggerProps
>(({ className, size, style, children, ...props }, ref) => {
  const resolvedSize = size ?? 'md'
  return (
    <RadixSelect.Trigger
      ref={ref}
      data-ui="select-primitive-trigger"
      data-house-role="form-select"
      data-ui-size={resolvedSize}
      className={cn(legacySelectTriggerVariants({ size: resolvedSize }), className)}
      style={{
        paddingInline: 'var(--space-2)',
        paddingBlock: 'var(--space-1)',
        transitionDuration: 'var(--motion-duration-ui)',
        ...style,
      }}
      {...props}
    >
      {children}
      <RadixSelect.Icon data-ui="select-primitive-icon">
        <ChevronDown className="h-4 w-4 opacity-70" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  )
})
LegacySelectTrigger.displayName = 'LegacySelectTrigger'

const LegacySelectContent = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Content>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(({ className, sideOffset = 4, position = 'popper', children, ...props }, ref) => (
  <RadixSelect.Portal>
    <RadixSelect.Content
      ref={ref}
      data-ui="select-primitive-content"
      data-house-role="select-content"
      sideOffset={sideOffset}
      position={position}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius-sm)]',
        'border border-[hsl(var(--border))]',
        'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
        'shadow-[var(--elevation-3)]',
        'motion-reduce:animate-none',
        'animate-[select-slide-down_var(--motion-duration-ui)_var(--motion-ease-default)]',
        className,
      )}
      {...props}
    >
      <RadixSelect.Viewport data-ui="select-primitive-viewport" className="max-h-60 p-1">
        {children}
      </RadixSelect.Viewport>
    </RadixSelect.Content>
  </RadixSelect.Portal>
))
LegacySelectContent.displayName = 'LegacySelectContent'

const LegacySelectItem = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Item>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    data-ui="select-primitive-item"
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-body',
      'outline-none',
      'focus:bg-[hsl(var(--tone-neutral-100))]',
      'data-[state=checked]:bg-[hsl(var(--tone-neutral-100))]',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span data-ui="select-primitive-item-indicator" className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
      <RadixSelect.ItemIndicator>
        <Check className="h-3.5 w-3.5" />
      </RadixSelect.ItemIndicator>
    </span>
    <RadixSelect.ItemText data-ui="select-primitive-item-text">{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
))
LegacySelectItem.displayName = 'LegacySelectItem'

export {
  LegacySelectPrimitive,
  LegacySelectTrigger,
  LegacySelectContent,
  LegacySelectItem,
  LegacySelectValue,
}

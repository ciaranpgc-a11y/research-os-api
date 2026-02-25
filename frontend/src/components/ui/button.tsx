import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { houseForms, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,border-color,color,transform] duration-220 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        outline: 'border border-[hsl(var(--tone-neutral-300))] bg-background text-[hsl(var(--tone-neutral-800))] hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]',
        house: `${houseForms.actionButton} ${houseTypography.buttonText}`,
        housePrimary: `${houseForms.actionButtonPrimary} ${houseTypography.buttonText}`,
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: `h-9 rounded-md px-3 ${houseTypography.buttonText}`,
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const resolvedVariant = variant ?? 'default'
    const resolvedSize = size ?? 'default'
    return (
      <Comp
        data-ui="button"
        data-house-role="action-button"
        data-ui-variant={resolvedVariant}
        data-ui-size={resolvedSize}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

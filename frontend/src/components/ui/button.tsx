import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-[background-color,border-color,color,transform] duration-ui ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
        secondary: `${houseTypography.buttonText} border border-border bg-secondary text-secondary-foreground shadow-none hover:bg-secondary/90`,
        tertiary: `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted hover:border-ring/30 active:bg-muted`,
        destructive: `${houseTypography.buttonText} bg-destructive text-destructive-foreground`,
      },
      size: {
        default: `h-9 px-3 ${houseTypography.buttonText}`,
        sm: `h-9 rounded-md px-3 ${houseTypography.buttonText}`,
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
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
    const resolvedVariant = variant ?? 'primary'
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

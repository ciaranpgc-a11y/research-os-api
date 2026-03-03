import { cva } from 'class-variance-authority'

import { houseTypography } from '@/lib/house-style'

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-[background-color,border-color,color,transform] duration-ui ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
        secondary: `${houseTypography.buttonText} bg-secondary text-secondary-foreground`,
        tertiary: `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted`,
        destructive: `${houseTypography.buttonText} bg-destructive text-destructive-foreground`,
        default: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
        housePrimary: `${houseTypography.buttonText} bg-primary text-primary-foreground`,
        house: `${houseTypography.buttonText} bg-secondary text-secondary-foreground`,
        outline: `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted`,
        // DEPRECATED: alias to tertiary for backward compatibility.
        ghost: `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted`,
      },
      size: {
        default: `h-9 px-3 ${houseTypography.buttonText}`,
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

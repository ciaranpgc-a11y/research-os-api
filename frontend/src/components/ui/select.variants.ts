import { cva } from 'class-variance-authority'

export const selectVariants = cva(
  'flex w-full appearance-none rounded-md border border-border bg-background text-foreground shadow-sm transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger',
  {
    variants: {
      size: {
        sm: 'h-9 px-2.5 text-sm',
        default: 'h-9 px-3 text-sm',
        lg: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

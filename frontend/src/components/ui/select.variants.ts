import { cva } from 'class-variance-authority'

export const selectVariants = cva(
  'flex w-full appearance-none rounded-md border border-border bg-background text-foreground shadow-sm transition-colors duration-ui focus-visible:outline-none focus-visible:border-[hsl(var(--tone-neutral-900))] focus-visible:shadow-[0_0_0_1px_hsl(var(--tone-neutral-900)/0.18)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger',
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

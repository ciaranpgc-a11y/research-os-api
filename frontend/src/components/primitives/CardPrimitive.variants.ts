import { cva } from 'class-variance-authority'

export const cardPrimitiveVariants = cva(
  [
    'rounded-[var(--radius-md)]',
    'border border-[hsl(var(--border))]',
    'bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]',
    'transition-[box-shadow,transform,border-color]',
    'duration-ui ease-out',
    'shadow-[var(--elevation-xs)]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'shadow-[var(--elevation-xs)]',
        flat: 'shadow-none',
        outlined: 'border-[hsl(var(--tone-neutral-400))] shadow-none',
      },
      interactive: {
        true: 'cursor-pointer hover:shadow-[var(--elevation-sm)]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      interactive: false,
    },
  },
)

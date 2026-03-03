import { cva } from 'class-variance-authority'

import { houseTypography } from '@/lib/house-style'

/**
 * Button variant system
 *
 * CANONICAL VARIANTS (use these):
 * - primary: Main CTA, high emphasis
 * - secondary: Supporting actions
 * - tertiary: Low emphasis, bordered
 * - destructive: Dangerous actions
 * - outline: Alias for tertiary (kept for semantic clarity)
 *
 * DEPRECATED ALIASES (migrate away):
 * - default: Use 'primary' instead
 * - housePrimary: Use 'primary' instead
 * - house: Use 'secondary' instead
 * - ghost: Use 'tertiary' instead
 */

const primaryStyles = `${houseTypography.buttonText} bg-primary text-primary-foreground`
const secondaryStyles = `${houseTypography.buttonText} bg-secondary text-secondary-foreground`
const tertiaryStyles = `${houseTypography.buttonText} border border-border bg-background text-foreground hover:bg-muted`
const destructiveStyles = `${houseTypography.buttonText} bg-destructive text-destructive-foreground`

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-[background-color,border-color,color,transform] duration-ui ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Canonical variants
        primary: primaryStyles,
        secondary: secondaryStyles,
        tertiary: tertiaryStyles,
        destructive: destructiveStyles,
        outline: tertiaryStyles, // Semantic alias for tertiary
        // Deprecated aliases (kept for backward compatibility)
        /** @deprecated Use 'primary' instead */
        default: primaryStyles,
        /** @deprecated Use 'primary' instead */
        housePrimary: primaryStyles,
        /** @deprecated Use 'secondary' instead */
        house: secondaryStyles,
        /** @deprecated Use 'tertiary' instead */
        ghost: tertiaryStyles,
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

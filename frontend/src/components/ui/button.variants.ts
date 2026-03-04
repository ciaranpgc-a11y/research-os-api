import { cva } from 'class-variance-authority'

import { houseTypography } from '@/lib/house-style'

/**
 * Button variant system
 *
 * CANONICAL VARIANTS (use these):
 * - cta: High-emphasis call-to-action (profile save/update style)
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

const defaultStyles = `${houseTypography.buttonText} border border-[hsl(var(--tone-neutral-900))] bg-white text-[hsl(var(--tone-neutral-900))] hover:bg-[hsl(var(--section-style-profile-accent,var(--tone-accent-500))/0.12)] hover:border-[hsl(var(--tone-neutral-900))] active:bg-[hsl(var(--section-style-profile-accent,var(--tone-accent-500))/0.22)] active:border-[hsl(var(--section-style-profile-accent,var(--tone-accent-500))/0.8)]`
const ctaStyles = `${houseTypography.buttonText} border border-[hsl(var(--tone-accent-700))] bg-[hsl(var(--tone-accent-700))] text-[hsl(var(--tone-neutral-50))] shadow-none hover:border-[hsl(var(--tone-accent-800))] hover:bg-[hsl(var(--tone-accent-800))] hover:text-[hsl(var(--tone-neutral-50))] active:border-[hsl(var(--tone-accent-800))] active:bg-[hsl(var(--tone-accent-800))] active:text-[hsl(var(--tone-neutral-50))]`
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
        cta: ctaStyles,
        primary: primaryStyles,
        secondary: secondaryStyles,
        tertiary: tertiaryStyles,
        destructive: destructiveStyles,
        outline: tertiaryStyles, // Semantic alias for tertiary
        // Deprecated aliases (kept for backward compatibility)
        /** @deprecated Use 'primary' instead */
        default: defaultStyles,
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

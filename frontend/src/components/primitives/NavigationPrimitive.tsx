import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { BadgePrimitive } from './BadgePrimitive'
import {
  TooltipProvider,
  TooltipPrimitive,
  TooltipTrigger,
  TooltipContent,
} from './TooltipPrimitive'

type NavigationVariant = 'default' | 'collapsed'
type NavigationAlign = 'vertical' | 'horizontal'

type NavigationContextValue = {
  variant: NavigationVariant
  align: NavigationAlign
  currentPath?: string
}

const NavigationContext = React.createContext<NavigationContextValue>({
  variant: 'default',
  align: 'vertical',
})

/**
 * NavigationPrimitive token contract:
 * - Width: sz-280 (default), 64px (collapsed)
 * - Border: hsl(var(--border))
 * - Spacing: --space-2 item gaps, --space-3 section padding
 * - Typography: text-label items, text-caption section labels
 * - Active state: tone-accent-50 bg, tone-accent-700 text, 4px accent rail
 * - Hover: tone-neutral-100 bg
 * - Motion: var(--motion-micro) transitions
 * - Badge: BadgePrimitive for counts/status
 *
 * Usage examples:
 * - Application sidebar with grouped sections and active route highlighting.
 * - Collapsed icon rail with tooltip labels.
 * - Horizontal mobile navigation variant.
 */

const navigationVariants = cva(
  [
    'border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
    'motion-reduce:transition-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'w-sz-280',
        collapsed: 'w-16',
      },
      align: {
        vertical: 'flex h-full flex-col',
        horizontal: 'flex w-full flex-row items-center',
      },
    },
    defaultVariants: {
      variant: 'default',
      align: 'vertical',
    },
  },
)

interface NavigationPrimitiveProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof navigationVariants> {
  currentPath?: string
}

const NavigationPrimitive = React.forwardRef<HTMLElement, NavigationPrimitiveProps>(
  (
    {
      className,
      variant = 'default',
      align = 'vertical',
      currentPath,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedVariant: NavigationVariant = variant ?? 'default'
    const resolvedAlign: NavigationAlign = align ?? 'vertical'
    return (
      <NavigationContext.Provider value={{ variant: resolvedVariant, align: resolvedAlign, currentPath }}>
        <nav
          ref={ref}
          data-ui="navigation-primitive"
          data-house-role="navigation"
          data-ui-variant={resolvedVariant}
          data-ui-align={resolvedAlign}
          className={cn(navigationVariants({ variant: resolvedVariant, align: resolvedAlign }), className)}
          style={{
            transitionDuration: 'var(--motion-micro)',
            ...style,
          }}
          {...props}
        >
          {children}
        </nav>
      </NavigationContext.Provider>
    )
  },
)
NavigationPrimitive.displayName = 'NavigationPrimitive'

const NavigationHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="navigation-primitive-header"
      data-house-role="navigation-header"
      className={cn('border-b border-[hsl(var(--border))]', className)}
      style={{
        padding: 'var(--space-3)',
        ...style,
      }}
      {...props}
    />
  ),
)
NavigationHeader.displayName = 'NavigationHeader'

const NavigationFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="navigation-primitive-footer"
      data-house-role="navigation-footer"
      className={cn('mt-auto border-t border-[hsl(var(--border))]', className)}
      style={{
        padding: 'var(--space-3)',
        ...style,
      }}
      {...props}
    />
  ),
)
NavigationFooter.displayName = 'NavigationFooter'

const NavigationSectionBase = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <section
      ref={ref}
      data-ui="navigation-primitive-section"
      data-house-role="navigation-section"
      className={cn('space-y-2', className)}
      style={{
        padding: 'var(--space-3)',
        ...style,
      }}
      {...props}
    />
  ),
)
NavigationSectionBase.displayName = 'NavigationSection'

const NavigationSectionLabel = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const { variant } = React.useContext(NavigationContext)
    if (variant === 'collapsed') {
      return null
    }
    return (
      <h3
        ref={ref}
        data-ui="navigation-primitive-section-label"
        data-house-role="navigation-section-label"
        className={cn('text-caption font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]', className)}
        {...props}
      />
    )
  },
)
NavigationSectionLabel.displayName = 'NavigationSectionLabel'

type NavigationSectionComponent = typeof NavigationSectionBase & {
  Label: typeof NavigationSectionLabel
}

const NavigationSection = NavigationSectionBase as NavigationSectionComponent
NavigationSection.Label = NavigationSectionLabel

const navigationItemVariants = cva(
  [
    'group relative flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-transparent',
    'text-label font-medium text-[hsl(var(--foreground))]',
    'transition-[background-color,color,border-color,box-shadow]',
    'focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]',
    'hover:bg-[hsl(var(--tone-neutral-100))]',
  ].join(' '),
  {
    variants: {
      active: {
        true: 'border-[hsl(var(--tone-accent-700)/0.22)] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-700))]',
        false: '',
      },
      variant: {
        default: '',
        collapsed: 'justify-center',
      },
    },
    defaultVariants: {
      active: false,
      variant: 'default',
    },
  },
)

interface NavigationItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  active?: boolean
}

const NavigationItemIcon = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-ui="navigation-primitive-item-icon"
      data-house-role="navigation-item-icon"
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center text-[hsl(var(--muted-foreground))]',
        className,
      )}
      {...props}
    />
  ),
)
NavigationItemIcon.displayName = 'NavigationItemIcon'

const NavigationItemLabel = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-ui="navigation-primitive-item-label"
      data-house-role="navigation-item-label"
      className={cn('truncate', className)}
      {...props}
    />
  ),
)
NavigationItemLabel.displayName = 'NavigationItemLabel'

interface NavigationItemBadgeProps extends React.ComponentPropsWithoutRef<typeof BadgePrimitive> {
  value?: string | number
}

const NavigationItemBadge = React.forwardRef<HTMLSpanElement, NavigationItemBadgeProps>(
  ({ className, value, children, variant = 'primary', size = 'sm', ...props }, ref) => (
    <BadgePrimitive
      ref={ref}
      data-ui="navigation-primitive-item-badge"
      data-house-role="navigation-item-badge"
      variant={variant}
      size={size}
      className={cn('ml-auto', className)}
      {...props}
    >
      {children ?? value}
    </BadgePrimitive>
  ),
)
NavigationItemBadge.displayName = 'NavigationItemBadge'

const NavigationItemBase = React.forwardRef<HTMLAnchorElement, NavigationItemProps>(
  ({ className, href, active, children, style, ...props }, ref) => {
    const { variant, currentPath } = React.useContext(NavigationContext)
    const isCollapsed = variant === 'collapsed'
    const isActive = active ?? (Boolean(currentPath) && currentPath === href)
    const childNodes = React.Children.toArray(children)
    const labelNode = childNodes.find(
      (child) => React.isValidElement(child) && child.type === NavigationItemLabel,
    ) as React.ReactElement | undefined

    const linkNode = (
      <a
        ref={ref}
        data-ui="navigation-primitive-item"
        data-house-role="navigation-item"
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          navigationItemVariants({ active: Boolean(isActive), variant }),
          isActive
            ? 'before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r before:bg-[hsl(var(--tone-accent-700))]'
            : '',
          className,
        )}
        style={{
          paddingInline: 'var(--space-2)',
          paddingBlock: 'var(--space-2)',
          transitionDuration: 'var(--motion-micro)',
          ...style,
        }}
        {...props}
      >
        {childNodes.map((child, index) => {
          if (
            isCollapsed &&
            React.isValidElement(child) &&
            (child.type === NavigationItemLabel || child.type === NavigationItemBadge)
          ) {
            return (
              <span key={`collapsed-hidden-${index}`} className="sr-only">
                {child}
              </span>
            )
          }
          return <React.Fragment key={`nav-item-child-${index}`}>{child}</React.Fragment>
        })}
      </a>
    )

    if (!isCollapsed || !labelNode?.props?.children) {
      return linkNode
    }

    return (
      <TooltipProvider delayDuration={100}>
        <TooltipPrimitive>
          <TooltipTrigger asChild>{linkNode}</TooltipTrigger>
          <TooltipContent side="right" withArrow>
            {labelNode.props.children}
          </TooltipContent>
        </TooltipPrimitive>
      </TooltipProvider>
    )
  },
)
NavigationItemBase.displayName = 'NavigationItem'

type NavigationItemComponent = typeof NavigationItemBase & {
  Icon: typeof NavigationItemIcon
  Label: typeof NavigationItemLabel
  Badge: typeof NavigationItemBadge
}

const NavigationItem = NavigationItemBase as NavigationItemComponent
NavigationItem.Icon = NavigationItemIcon
NavigationItem.Label = NavigationItemLabel
NavigationItem.Badge = NavigationItemBadge

export {
  NavigationPrimitive as SidebarNav,
  NavigationItem as NavItem,
  NavigationPrimitive,
  NavigationHeader,
  NavigationSection,
  NavigationItem,
  NavigationFooter,
}

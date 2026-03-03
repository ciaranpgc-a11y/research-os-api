import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Toolbar primitive for consistent action bar layouts
 *
 * Usage:
 * <Toolbar>
 *   <Toolbar.Group>
 *     <Input />
 *     <Select />
 *   </Toolbar.Group>
 *   <Toolbar.Spacer />
 *   <Toolbar.Actions>
 *     <Button>Create</Button>
 *   </Toolbar.Actions>
 * </Toolbar>
 */

const toolbarVariants = cva(
  'house-page-toolbar flex flex-wrap items-center gap-[var(--space-2)]',
  {
    variants: {
      density: {
        default: 'py-0',
        comfortable: 'py-[var(--space-2)]',
        compact: 'py-[var(--space-1)]',
      },
      justify: {
        start: 'justify-start',
        between: 'justify-between',
        end: 'justify-end',
      },
    },
    defaultVariants: {
      density: 'default',
      justify: 'start',
    },
  },
)

export interface ToolbarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toolbarVariants> {}

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  ({ className, density, justify, children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="toolbar"
      data-house-role="toolbar"
      role="toolbar"
      className={cn(toolbarVariants({ density, justify }), className)}
      {...props}
    >
      {children}
    </div>
  ),
)
Toolbar.displayName = 'Toolbar'

/* -------------------------------- Subcomponents ------------------------------- */

interface ToolbarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, items wrap to next line on overflow */
  wrap?: boolean
}

const ToolbarGroup = React.forwardRef<HTMLDivElement, ToolbarGroupProps>(
  ({ className, wrap = true, children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="toolbar-group"
      role="group"
      className={cn(
        'flex items-center gap-[var(--space-2)]',
        wrap && 'flex-wrap',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
)
ToolbarGroup.displayName = 'ToolbarGroup'

const ToolbarSpacer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="toolbar-spacer"
    aria-hidden="true"
    className={cn('flex-1', className)}
    {...props}
  />
))
ToolbarSpacer.displayName = 'ToolbarSpacer'

const ToolbarActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="toolbar-actions"
    role="group"
    className={cn('ml-auto flex items-center gap-[var(--space-2)]', className)}
    {...props}
  >
    {children}
  </div>
))
ToolbarActions.displayName = 'ToolbarActions'

interface ToolbarDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal'
}

const ToolbarDivider = React.forwardRef<HTMLDivElement, ToolbarDividerProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <div
      ref={ref}
      data-ui="toolbar-divider"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === 'vertical'
          ? 'mx-[var(--space-1)] h-5 w-px bg-border'
          : 'my-[var(--space-1)] h-px w-full bg-border',
        className,
      )}
      {...props}
    />
  ),
)
ToolbarDivider.displayName = 'ToolbarDivider'

/* -------------------------------- Compound Component ------------------------------- */

const ToolbarCompound = Object.assign(Toolbar, {
  Group: ToolbarGroup,
  Spacer: ToolbarSpacer,
  Actions: ToolbarActions,
  Divider: ToolbarDivider,
})

export {
  ToolbarCompound as Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  ToolbarActions,
  ToolbarDivider,
}

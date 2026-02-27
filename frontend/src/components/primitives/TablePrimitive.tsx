import * as React from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type SortDirection = 'asc' | 'desc' | 'none'

type TableContextValue = {
  striped: boolean
  hoverable: boolean
  compact: boolean
}

const TableContext = React.createContext<TableContextValue>({
  striped: true,
  hoverable: true,
  compact: false,
})

/**
 * TablePrimitive token contract:
 * - Border: hsl(var(--border))
 * - Cell spacing: --space-2 (default), compact uses --space-1 block padding
 * - Typography: text-caption (headers), text-body (cells)
 * - Surfaces: --tone-neutral-50 / --tone-neutral-100 row stripes
 * - Hover elevation: --elevation-1
 * - Motion: --motion-ui with --motion-ease-default
 * - Text: --foreground / --muted-foreground
 *
 * Usage examples:
 * - Basic data table: <TablePrimitive><TableHead /> <TableBody /></TablePrimitive>
 * - Sortable: set `sortable` on TableHeaderCell and render sort direction indicator
 * - Selectable: use `selection` on header/cell while CheckboxPrimitive is pending
 */

const tablePrimitiveVariants = cva(
  [
    'w-full border-separate border-spacing-0 rounded-[var(--radius-sm)]',
    'border border-[hsl(var(--border))]',
    'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
  ].join(' '),
  {
    variants: {
      striped: {
        true: '',
        false: '',
      },
      hoverable: {
        true: '',
        false: '',
      },
      compact: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      striped: true,
      hoverable: true,
      compact: false,
    },
  },
)

interface TablePrimitiveProps
  extends React.TableHTMLAttributes<HTMLTableElement>,
    VariantProps<typeof tablePrimitiveVariants> {
  layoutTable?: boolean
}

const TablePrimitive = React.forwardRef<HTMLTableElement, TablePrimitiveProps>(
  ({ className, striped = true, hoverable = true, compact = false, layoutTable = false, role, ...props }, ref) => {
    const resolvedStriped = striped ?? true
    const resolvedHoverable = hoverable ?? true
    const resolvedCompact = compact ?? false
    return (
      <TableContext.Provider value={{ striped: resolvedStriped, hoverable: resolvedHoverable, compact: resolvedCompact }}>
      <table
        ref={ref}
        data-ui="table-primitive"
        data-house-role="table"
        role={layoutTable ? 'presentation' : role}
        className={cn(tablePrimitiveVariants({ striped: resolvedStriped, hoverable: resolvedHoverable, compact: resolvedCompact }), className)}
        {...props}
      />
      </TableContext.Provider>
    )
  },
)
TablePrimitive.displayName = 'TablePrimitive'

const TableHead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      data-ui="table-primitive-head"
      data-house-role="table-head"
      className={cn('bg-[hsl(var(--tone-neutral-100))]', className)}
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean
  sortDirection?: SortDirection
  selection?: boolean
}

const TableHeaderCell = React.forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  ({ className, style, children, sortable = false, sortDirection = 'none', selection = false, ...props }, ref) => {
    const { compact } = React.useContext(TableContext)
    return (
      <th
        ref={ref}
        data-ui="table-primitive-header-cell"
        data-house-role="table-header-cell"
        aria-sort={sortable ? (sortDirection === 'none' ? 'none' : sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
        className={cn(
          'sticky top-0 z-[1] border-b border-[hsl(var(--border))]',
          'bg-[hsl(var(--tone-neutral-100))] text-left text-caption font-semibold',
          'text-[hsl(var(--muted-foreground))]',
          className,
        )}
        style={{
          paddingInline: 'var(--space-2)',
          paddingBlock: compact ? 'var(--space-1)' : 'var(--space-2)',
          ...style,
        }}
        {...props}
      >
        {selection ? (
          <input
            data-ui="table-primitive-selection-header"
            aria-label="Select all rows"
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--tone-accent-600))]"
          />
        ) : sortable ? (
          <span data-ui="table-primitive-sort-header" className="inline-flex items-center gap-1">
            <span>{children}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          </span>
        ) : (
          children
        )}
      </th>
    )
  },
)
TableHeaderCell.displayName = 'TableHeaderCell'

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
  columnCount?: number
  loadingRowCount?: number
}

const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(
  (
    {
      className,
      children,
      isLoading = false,
      isEmpty = false,
      emptyMessage = 'No data available.',
      columnCount = 1,
      loadingRowCount = 5,
      ...props
    },
    ref,
  ) => {
    if (isLoading) {
      return (
        <tbody
          ref={ref}
          data-ui="table-primitive-body-loading"
          data-house-role="table-body"
          className={cn(className)}
          {...props}
        >
          {Array.from({ length: loadingRowCount }).map((_, index) => (
            <tr key={`loading-row-${index}`} data-ui="table-primitive-loading-row" className="border-b border-[hsl(var(--border))]">
              <td
                data-ui="table-primitive-loading-cell"
                className="text-body text-[hsl(var(--muted-foreground))]"
                style={{ padding: 'var(--space-2)' }}
                colSpan={columnCount}
              >
                <div className="h-4 w-full animate-pulse rounded-[var(--radius-sm)] bg-[hsl(var(--tone-neutral-200))]" />
              </td>
            </tr>
          ))}
        </tbody>
      )
    }

    if (isEmpty) {
      return (
        <tbody
          ref={ref}
          data-ui="table-primitive-body-empty"
          data-house-role="table-body"
          className={cn(className)}
          {...props}
        >
          <tr data-ui="table-primitive-empty-row">
            <td
              data-ui="table-primitive-empty-cell"
              className="text-body text-[hsl(var(--muted-foreground))]"
              style={{ padding: 'var(--space-2)' }}
              colSpan={columnCount}
            >
              {emptyMessage}
            </td>
          </tr>
        </tbody>
      )
    }

    return (
      <tbody
        ref={ref}
        data-ui="table-primitive-body"
        data-house-role="table-body"
        className={cn(className)}
        {...props}
      >
        {children}
      </tbody>
    )
  },
)
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, style, ...props }, ref) => {
    const { striped, hoverable } = React.useContext(TableContext)
    return (
      <tr
        ref={ref}
        data-ui="table-primitive-row"
        data-house-role="table-row"
        className={cn(
          'border-b border-[hsl(var(--border))]',
          striped && 'odd:bg-[hsl(var(--tone-neutral-50))] even:bg-[hsl(var(--tone-neutral-100))]',
          hoverable &&
            'transition-[box-shadow,background-color] hover:shadow-[var(--elevation-1)] motion-reduce:transition-none',
          className,
        )}
        style={{
          transitionDuration: 'var(--motion-ui, var(--motion-duration-ui))',
          transitionTimingFunction: 'var(--motion-ease-default)',
          ...style,
        }}
        {...props}
      />
    )
  },
)
TableRow.displayName = 'TableRow'

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  secondary?: boolean
  selection?: boolean
  checked?: boolean
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, style, children, secondary = false, selection = false, checked = false, tabIndex = 0, ...props }, ref) => {
    const { compact } = React.useContext(TableContext)
    return (
      <td
        ref={ref}
        data-ui="table-primitive-cell"
        data-house-role="table-cell"
        tabIndex={tabIndex}
        className={cn('text-body', secondary ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]', className)}
        style={{
          paddingInline: 'var(--space-2)',
          paddingBlock: compact ? 'var(--space-1)' : 'var(--space-2)',
          ...style,
        }}
        {...props}
      >
        {selection ? (
          <input
            data-ui="table-primitive-selection-cell"
            aria-label="Select row"
            type="checkbox"
            defaultChecked={checked}
            className="h-4 w-4 accent-[hsl(var(--tone-accent-600))]"
          />
        ) : (
          children
        )}
      </td>
    )
  },
)
TableCell.displayName = 'TableCell'

export {
  TablePrimitive,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
}

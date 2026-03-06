import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Minus, Plus } from 'lucide-react'

import { type HouseSectionTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { houseDrilldown, houseTypography } from '@/lib/house-style'
import { Sheet, SheetContent } from '@/components/ui/sheet'

/**
 * DrilldownSheet - A compound component for detail panels that slide in from the side
 *
 * Wraps Sheet/SheetContent with drilldown-specific styling and canonical header structure.
 *
 * Usage:
 * <DrilldownSheet open={isOpen} onOpenChange={setIsOpen}>
 *   <DrilldownSheet.Header title="Total publication insights" subtitle="A Summary..." variant="publications">
 *     <DrilldownSheet.Tabs activeTab={tab} onTabChange={setTab}>
 *       <DrilldownSheet.Tab id="summary">Summary</DrilldownSheet.Tab>
 *       <DrilldownSheet.Tab id="breakdown">Breakdown</DrilldownSheet.Tab>
 *     </DrilldownSheet.Tabs>
 *   </DrilldownSheet.Header>
 *   <DrilldownSheet.Content>
 *     Primary content area
 *   </DrilldownSheet.Content>
 * </DrilldownSheet>
 */

/* -------------------------------- Root Component ------------------------------- */

interface DrilldownSheetProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'left' | 'right'
  className?: string
  modal?: boolean
}

const DrilldownSheetRoot = ({
  children,
  open,
  onOpenChange,
  side = 'right',
  className,
  modal = true,
}: DrilldownSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
    <SheetContent
      side={side}
      data-ui="drilldown-sheet"
      data-house-role="drilldown-sheet"
      className={cn(houseDrilldown.sheet, className)}
    >
      <div className={cn(houseDrilldown.sheetBody, 'house-drilldown-panel-no-pad')}>
        {children}
      </div>
    </SheetContent>
  </Sheet>
)
DrilldownSheetRoot.displayName = 'DrilldownSheet'

/* -------------------------------- Title Block ------------------------------- */

interface DrilldownTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small label above the main title */
  overline?: React.ReactNode
  /** Border style variant */
  borderVariant?: 'profile' | 'workspace' | 'none'
}

const DrilldownTitle = React.forwardRef<HTMLDivElement, DrilldownTitleProps>(
  ({ className, overline, borderVariant = 'none', children, ...props }, ref) => {
    const borderClass = borderVariant === 'profile'
      ? 'house-left-border house-left-border-profile'
      : borderVariant === 'workspace'
        ? 'house-left-border house-left-border-workspace'
        : ''

    return (
      <div
        ref={ref}
        data-ui="drilldown-title-block"
        className={cn(houseDrilldown.titleBlock, borderClass, className)}
        {...props}
      >
        {overline && (
          <span className={houseDrilldown.overline}>{overline}</span>
        )}
        <h2 className={houseDrilldown.title}>{children}</h2>
      </div>
    )
  },
)
DrilldownTitle.displayName = 'DrilldownSheet.Title'

/* -------------------------------- Heading ------------------------------- */

interface DrilldownHeadingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Heading level for semantic structure */
  level?: 'h3' | 'h4'
}

const DrilldownHeading = React.forwardRef<HTMLDivElement, DrilldownHeadingProps>(
  ({ className, level = 'h3', children, ...props }, ref) => {
    const HeadingTag = level

    return (
      <div
        ref={ref}
        data-ui="drilldown-heading-block"
        className={cn(houseDrilldown.headingBlock, className)}
        {...props}
      >
        <HeadingTag className="house-drilldown-heading-block-title">{children}</HeadingTag>
      </div>
    )
  },
)
DrilldownHeading.displayName = 'DrilldownSheet.Heading'

/* -------------------------------- Heading Toggle ------------------------------- */

interface DrilldownHeadingToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  expanded: boolean
  expandedLabel?: string
  collapsedLabel?: string
}

const DrilldownHeadingToggle = React.forwardRef<HTMLButtonElement, DrilldownHeadingToggleProps>(
  (
    {
      className,
      expanded,
      expandedLabel = 'Collapse',
      collapsedLabel = 'Expand',
      ...props
    },
    ref,
  ) => {
    const label = expanded ? expandedLabel : collapsedLabel
    return (
      <button
        ref={ref}
        type="button"
        data-ui="drilldown-heading-toggle"
        data-house-role="heading-toggle"
        className={cn(
          'inline-flex items-center justify-center rounded-sm p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]',
          className,
        )}
        aria-label={label}
        title={label}
        {...props}
      >
        {expanded ? <Minus className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      </button>
    )
  },
)
DrilldownHeadingToggle.displayName = 'DrilldownSheet.HeadingToggle'

/* -------------------------------- Content Block ------------------------------- */

const DrilldownContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="drilldown-content-block"
    className={cn(houseDrilldown.contentBlock, className)}
    {...props}
  >
    {children}
  </div>
))
DrilldownContent.displayName = 'DrilldownSheet.Content'

/* -------------------------------- Stat Card ------------------------------- */

const statCardVariants = cva(houseDrilldown.statCard, {
  variants: {
    size: {
      default: '',
      small: 'house-drilldown-summary-stat-card-small',
    },
    tone: {
      neutral: '',
      positive: houseDrilldown.valuePositive,
      negative: houseDrilldown.valueNegative,
    },
  },
  defaultVariants: {
    size: 'default',
    tone: 'neutral',
  },
})

interface DrilldownStatCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof statCardVariants> {
  title: React.ReactNode
  value: React.ReactNode
  emphasis?: boolean
}

const DrilldownStatCard = React.forwardRef<HTMLDivElement, DrilldownStatCardProps>(
  ({ className, title, value, size, tone, emphasis, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="drilldown-stat-card"
      className={cn(statCardVariants({ size, tone }), className)}
      {...props}
    >
      <p className={houseDrilldown.statTitle}>{title}</p>
      <p className={cn(houseDrilldown.statValue, emphasis && houseDrilldown.statValueEmphasis)}>
        {value}
      </p>
    </div>
  ),
)
DrilldownStatCard.displayName = 'DrilldownSheet.StatCard'

/* -------------------------------- Row ------------------------------- */

interface DrilldownRowProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean
}

const DrilldownRow = React.forwardRef<HTMLDivElement, DrilldownRowProps>(
  ({ className, active, children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="drilldown-row"
      className={cn(
        houseDrilldown.row,
        active && houseDrilldown.rowActive,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
)
DrilldownRow.displayName = 'DrilldownSheet.Row'

/* -------------------------------- Tab List (delegating to Tabs) ------------------------------- */

const DrilldownTabList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="drilldown-tab-list"
    role="tablist"
    className={cn(houseDrilldown.tabList, className)}
    {...props}
  >
    {children}
  </div>
))
DrilldownTabList.displayName = 'DrilldownSheet.TabList'

/* -------------------------------- Alert ------------------------------- */

interface DrilldownAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'warning' | 'error'
}

const DrilldownAlert = React.forwardRef<HTMLDivElement, DrilldownAlertProps>(
  ({ className, variant = 'info', children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="drilldown-alert"
      role="alert"
      className={cn(houseDrilldown.alert, className)}
      data-variant={variant}
      {...props}
    >
      {children}
    </div>
  ),
)
DrilldownAlert.displayName = 'DrilldownSheet.Alert'

/* -------------------------------- Placeholder ------------------------------- */

const DrilldownPlaceholder = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-ui="drilldown-placeholder"
    className={cn(houseDrilldown.placeholder, className)}
    {...props}
  >
    {children}
  </div>
))
DrilldownPlaceholder.displayName = 'DrilldownSheet.Placeholder'

/* -------------------------------- Header (Title + Subtitle + Tabs) ------------------------------- */

interface DrilldownHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Main title text */
  title: React.ReactNode
  /** Subtitle/description text below title */
  subtitle?: React.ReactNode
  /** Border style variant - controls left-border marker color */
  variant?: 'publications' | 'workspace' | 'profile' | 'none'
  /** Alert content (optional error or status message) */
  alert?: React.ReactNode
  /** Children typically includes DrilldownSheet.Tabs */
  children?: React.ReactNode
}

const DrilldownHeader = React.forwardRef<HTMLDivElement, DrilldownHeaderProps>(
  ({ className, title, subtitle, variant = 'none', alert, children, ...props }, ref) => {
    const borderClass = variant === 'profile'
      ? 'house-left-border house-left-border-profile'
      : variant === 'workspace'
        ? 'house-left-border house-left-border-workspace'
        : variant === 'publications'
          ? 'house-left-border house-left-border-publications'
          : ''

    return (
      <div
        ref={ref}
        data-ui="drilldown-header"
        className={cn('house-drilldown-header flex flex-col gap-[var(--space-3)]', className)}
        {...props}
      >
        <div 
          className={cn('flex flex-col gap-[var(--space-1)]', borderClass)}
        >
          <h2 className={cn(houseTypography.drilldownTitle)} data-ui="drilldown-title">
            {title}
          </h2>
          {subtitle && (
            <p className={cn(houseTypography.drilldownTitleExpander)} data-ui="drilldown-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        {alert && (
          <div className="mt-2">
            {alert}
          </div>
        )}
        {children && (
          <div>
            {children}
          </div>
        )}
      </div>
    )
  },
)
DrilldownHeader.displayName = 'DrilldownSheet.Header'

/* -------------------------------- Tabs Context & Root ------------------------------- */

interface DrilldownTabsContextValue {
  activeTab: string
  onTabChange: (tabId: string) => void
  tabIdPrefix: string
  panelIdPrefix: string
}

const DrilldownTabsContext = React.createContext<DrilldownTabsContextValue | undefined>(undefined)

function useDrilldownTabs() {
  const context = React.useContext(DrilldownTabsContext)
  if (!context) {
    throw new Error('useDrilldownTabs must be used within DrilldownSheet.Tabs')
  }
  return context
}

interface DrilldownTabsProps extends React.HTMLAttributes<HTMLDivElement> {
  activeTab: string
  onTabChange: (tabId: string) => void
  tabIdPrefix?: string
  panelIdPrefix?: string
  tone?: HouseSectionTone
  /** Optional: flex-grow function for responsive tab widths */
  flexGrow?: (label: string) => number
}

const DrilldownTabs = React.forwardRef<HTMLDivElement, DrilldownTabsProps>(
  (
    {
      className,
      activeTab,
      onTabChange,
      tabIdPrefix = 'drilldown-tab-',
      panelIdPrefix = 'drilldown-panel-',
      tone = 'neutral',
      flexGrow = () => 1,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <DrilldownTabsContext.Provider value={{ activeTab, onTabChange, tabIdPrefix, panelIdPrefix }}>
        <div
          ref={ref}
          role="tablist"
          data-ui="drilldown-tabs"
          data-tone={tone}
          className={cn('house-drilldown-navigation-block rounded-sm bg-card flex', className)}
          {...props}
        >
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === DrilldownTab) {
              const tabId = child.props.id
              const isActive = activeTab === tabId
              return React.cloneElement(child as React.ReactElement, {
                isActive,
                flexGrow: flexGrow(child.props.children),
              })
            }
            return child
          })}
        </div>
      </DrilldownTabsContext.Provider>
    )
  },
)
DrilldownTabs.displayName = 'DrilldownSheet.Tabs'

/* -------------------------------- Tab Item ------------------------------- */

interface DrilldownTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Unique identifier for this tab */
  id: string
  /** Tab label text */
  children: React.ReactNode
  /** Internal prop set by Tabs component */
  isActive?: boolean
  /** Internal prop set by Tabs component for responsive sizing */
  flexGrow?: number
}

const DrilldownTab = React.forwardRef<HTMLButtonElement, DrilldownTabProps>(
  ({ className, id, isActive = false, flexGrow, children, ...props }, ref) => {
    const context = useDrilldownTabs()
    const tabIdPrefix = context.tabIdPrefix
    const panelIdPrefix = context.panelIdPrefix

    return (
      <button
        ref={ref}
        id={`${tabIdPrefix}${id}`}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`${panelIdPrefix}${id}`}
        data-ui="drilldown-tab"
        className={cn(
          'house-nav-item approved-drilldown-nav-item house-drilldown-tab-item',
          isActive && 'approved-drilldown-nav-item-active',
          className,
        )}
        style={{
          ...(flexGrow ? { flexGrow, flexBasis: 0 } : {}),
        }}
        onClick={() => context.onTabChange(id)}
        {...props}
      >
        <span className="house-nav-item-label">{children}</span>
      </button>
    )
  },
)
DrilldownTab.displayName = 'DrilldownSheet.Tab'

/* -------------------------------- Tab Panel ------------------------------- */

interface DrilldownTabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Must match a DrilldownSheet.Tab id */
  id: string
  /** Should match the activeTab in DrilldownSheet.Tabs */
  isActive?: boolean
  /** Optional: tab ID prefix (defaults to 'drilldown-tab-') */
  tabIdPrefix?: string
  /** Optional: panel ID prefix (defaults to 'drilldown-panel-') */
  panelIdPrefix?: string
}

const DrilldownTabPanel = React.forwardRef<HTMLDivElement, DrilldownTabPanelProps>(
  ({ className, id, isActive = false, tabIdPrefix = 'drilldown-tab-', panelIdPrefix = 'drilldown-panel-', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        id={`${panelIdPrefix}${id}`}
        role="tabpanel"
        aria-labelledby={`${tabIdPrefix}${id}`}
        data-ui="drilldown-tab-panel"
        hidden={!isActive}
        className={cn(houseDrilldown.contentBlock, 'house-drilldown-tab-panel', className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)
DrilldownTabPanel.displayName = 'DrilldownSheet.TabPanel'

/* -------------------------------- Compound Component ------------------------------- */

const DrilldownSheet = Object.assign(DrilldownSheetRoot, {
  Header: DrilldownHeader,
  Tabs: DrilldownTabs,
  Tab: DrilldownTab,
  TabPanel: DrilldownTabPanel,
  Title: DrilldownTitle,
  Heading: DrilldownHeading,
  HeadingToggle: DrilldownHeadingToggle,
  Content: DrilldownContent,
  StatCard: DrilldownStatCard,
  Row: DrilldownRow,
  TabList: DrilldownTabList,
  Alert: DrilldownAlert,
  Placeholder: DrilldownPlaceholder,
})

export {
  DrilldownSheet,
  DrilldownHeader,
  DrilldownTabs,
  DrilldownTab,
  DrilldownTabPanel,
  DrilldownTitle,
  DrilldownHeading,
  DrilldownHeadingToggle,
  DrilldownContent,
  DrilldownStatCard,
  DrilldownRow,
  DrilldownTabList,
  DrilldownAlert,
  DrilldownPlaceholder,
}

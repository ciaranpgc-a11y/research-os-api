import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type HouseDrilldownHeaderTab = {
  id: string
  label: string
}

export function drilldownTabFlexGrow(label: string) {
  void label
  return 1
}

type HouseDrilldownHeaderShellProps = {
  title: ReactNode
  subtitle?: ReactNode
  alert?: ReactNode
  titleBlockClassName?: string
  dividerClassName?: string
  navigationClassName?: string
  tabClassName?: string
  activeTabClassName?: string
  navAriaLabel: string
  tabs: HouseDrilldownHeaderTab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  panelIdPrefix: string
  tabIdPrefix?: string
  tabFlexGrow?: (label: string) => number
}

export function HouseDrilldownHeaderShell({
  title,
  subtitle,
  alert,
  titleBlockClassName,
  dividerClassName = 'house-drilldown-divider-top',
  navigationClassName = 'house-drilldown-navigation-block house-publications-drilldown-tabs rounded-sm bg-card',
  tabClassName = 'house-nav-item approved-drilldown-nav-item house-publications-drilldown-tab-item',
  activeTabClassName = 'approved-drilldown-nav-item-active',
  navAriaLabel,
  tabs,
  activeTab,
  onTabChange,
  panelIdPrefix,
  tabIdPrefix,
  tabFlexGrow = drilldownTabFlexGrow,
}: HouseDrilldownHeaderShellProps) {
  return (
    <div className="house-drilldown-header-shell">
      <div className={cn('house-drilldown-title-block', titleBlockClassName)}>
        {title}
        {subtitle || null}
        {alert || null}
      </div>
      <div className={dividerClassName} />
      <div className={navigationClassName} role="tablist" aria-label={navAriaLabel}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              id={tabIdPrefix ? `${tabIdPrefix}${tab.id}` : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${panelIdPrefix}${tab.id}`}
              className={cn(tabClassName, isActive && activeTabClassName)}
              style={{
                flexGrow: tabFlexGrow(tab.label),
                flexBasis: 0,
              }}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="house-nav-item-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

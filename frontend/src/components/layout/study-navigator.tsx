import { Fragment, useMemo } from 'react'
import { NavLink } from 'react-router-dom'

import { NAV_GROUPS, type NavGroup, type NavItem } from '@/components/navigation/nav-config'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { useStudyCoreWizardStore } from '@/store/use-study-core-wizard-store'

type StudyNavigatorProps = {
  onNavigate?: () => void
}

type BadgeVisualVariant = 'neutral' | 'warning'
type ProjectHealth = 'green' | 'amber' | 'red'
type QcCounts = {
  high: number
  moderate: number
}

function parseBadgeNumber(value?: string): number {
  if (!value) {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function getBadgeVariant(itemKey: string, qcCounts: QcCounts): BadgeVisualVariant {
  if (itemKey === '/qc') {
    return 'warning'
  }
  if (itemKey === '/manuscript/discussion') {
    return qcCounts.high > 0 || qcCounts.moderate > 0 ? 'warning' : 'neutral'
  }
  return 'neutral'
}

function getProjectHealth(qcCounts: QcCounts): ProjectHealth {
  if (qcCounts.high > 0) {
    return 'red'
  }
  if (qcCounts.moderate > 0) {
    return 'amber'
  }
  return 'green'
}

function badgeClass(variant: BadgeVisualVariant): string {
  if (variant === 'warning') {
    return 'border-amber-300/70 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200'
  }
  return 'border-border bg-muted text-muted-foreground'
}

function healthDotClass(health: ProjectHealth): string {
  if (health === 'red') {
    return 'bg-red-500'
  }
  if (health === 'amber') {
    return 'bg-amber-500'
  }
  return 'bg-emerald-500'
}

function Group({ group, qcCounts, onNavigate }: { group: NavGroup; qcCounts: QcCounts; onNavigate?: () => void }) {
  const itemIndent = group.title === 'MANUSCRIPT' ? 'pl-4' : ''
  const groupToneClass = getHouseNavToneClass(group.tone)
  return (
    <section className={houseLayout.sidebarSection}>
      <p className={houseNavigation.sectionLabel}>{group.title}</p>
      <nav className="space-y-1">
        {group.items.map((item: NavItem) => {
          const itemBadgeVariant = getBadgeVariant(item.path, qcCounts)
          return (
            <Fragment key={item.path}>
              {item.dividerBefore ? <Separator className="my-2" /> : null}
              <NavLink
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    houseNavigation.item,
                    groupToneClass,
                    itemIndent,
                    isActive && houseNavigation.itemActive,
                  )
                }
              >
                <span className="truncate pl-2">{item.label}</span>
                {item.badge ? (
                  <Badge variant="outline" className={cn('h-5 min-w-5 px-1 text-caption font-medium', badgeClass(itemBadgeVariant))}>
                    {item.badge}
                  </Badge>
                ) : null}
              </NavLink>
            </Fragment>
          )
        })}
      </nav>
    </section>
  )
}

export function StudyNavigator({ onNavigate }: StudyNavigatorProps) {
  const qcStatus = useStudyCoreWizardStore((state) => state.qcStatus)
  const qcSeverityCounts = useStudyCoreWizardStore((state) => state.qcSeverityCounts)

  const qualityCheckBadge = useMemo(() => {
    const item = NAV_GROUPS.flatMap((group) => group.items).find((candidate) => candidate.path === '/qc')
    return parseBadgeNumber(item?.badge)
  }, [])

  const qcCounts = useMemo<QcCounts>(() => {
    if (qcStatus === 'idle') {
      return {
        high: 0,
        moderate: qualityCheckBadge > 0 ? 1 : 0,
      }
    }
    return {
      high: qcSeverityCounts.high,
      moderate: qcSeverityCounts.medium,
    }
  }, [qcSeverityCounts.high, qcSeverityCounts.medium, qcStatus, qualityCheckBadge])

  const projectHealth = getProjectHealth(qcCounts)

  return (
    <aside className={cn('flex h-full flex-col', houseLayout.sidebar)}>
      <div className={houseLayout.sidebarHeader}>
        <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))}>
          <div className="flex items-center gap-2">
            <h1 className={houseTypography.sectionTitle}>HF Registry Manuscript</h1>
            <span
              className={cn('h-2.5 w-2.5 rounded-full', healthDotClass(projectHealth))}
              aria-label={`Project health ${projectHealth}`}
              title={`Project health: ${projectHealth}`}
            />
          </div>
          <p className={houseTypography.fieldHelper}>Research Workspace</p>
          <p className={houseTypography.fieldHelper}>Version 0.1</p>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-3">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.title} className="space-y-3">
              <Group group={group} qcCounts={qcCounts} onNavigate={onNavigate} />
              {index < NAV_GROUPS.length - 1 ? <Separator /> : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

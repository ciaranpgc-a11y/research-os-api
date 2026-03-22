import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { ScrollArea } from '@/components/ui'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { resolveSections } from '@/lib/cmr-local-data'
import { cn } from '@/lib/utils'

type RefNavProps = {
  activeSection: string | null
  onSectionJump: (sectionKey: string) => void
  onNavigate?: () => void
  variant: 'reference' | 'database' | 'report' | 'admin'
  /** Optional override for section names (keys should be UPPERCASE). When provided, replaces locally-resolved sections. */
  sectionKeys?: string[]
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length <= 2 && w !== 'of' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Short display labels for long section names */
const LABEL_OVERRIDES: Record<string, string> = {
  'Valve Morphology And Function': 'Valve Morphology & Function',
  'Myocardial Tissue Characterisation': 'Tissue Characterisation',
  'Derived Haemodynamic Parameters': 'Haemodynamic Parameters',
  'Additional Granular Details': 'Additional Details',
}

const REPORT_RAW_NAV = [
  { key: 'upload', path: '/cmr-upload-report', label: 'Upload Report' },
]

const REPORT_VISUALISER_NAV = [
  { key: 'quantitative', path: '/cmr-new-report', label: 'Quantitative' },
  { key: 'rwma', path: '/cmr-rwma', label: 'RWMA' },
  { key: 'lge', path: '/cmr-lge', label: 'LGE Analysis' },
  { key: 'valves', path: '/cmr-valves', label: 'Valves' },
]

const REPORT_MODULES_NAV = [
  { key: 'lv-thrombus', path: '/cmr-lv-thrombus', label: 'LV Thrombus' },
]

const ADMIN_NAV = [
  { key: 'overview', sectionKey: 'Overview', label: 'Overview' },
  { key: 'access-codes', sectionKey: 'Access Codes', label: 'Access Codes' },
]

export function CmrReferenceNavigator({
  activeSection,
  onSectionJump,
  onNavigate,
  variant,
  sectionKeys,
}: RefNavProps) {
  const borderClass = variant === 'report'
    ? 'house-left-border-report'
    : variant === 'reference'
      ? 'house-left-border-profile'
      : variant === 'admin'
        ? 'house-left-border-admin'
      : 'house-left-border-learning-centre'
  const navItemClass = variant === 'report'
    ? houseNavigation.itemReport
    : variant === 'reference'
      ? houseNavigation.itemOverview
      : variant === 'admin'
        ? 'house-nav-item-admin'
      : houseNavigation.itemLearningCentre
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Build nav sections dynamically from sections config (or override prop)
  const paramSections = useMemo(() => {
    const keys = sectionKeys ?? Object.keys(resolveSections())
    return keys.map((key) => {
      const tc = titleCase(key)
      return { key: tc, label: LABEL_OVERRIDES[tc] || tc }
    })
  }, [sectionKeys])

  return (
    <aside className={cn(houseLayout.sidebarFrame, houseLayout.sidebar)}>
      <div className={houseLayout.sidebarHeader}>
        <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, borderClass)}>
          <h1 className={houseTypography.sectionTitle}>
            {variant === 'report'
              ? 'New Report'
              : variant === 'reference'
                ? 'Reference'
                : variant === 'database'
                  ? 'Reference Database'
                  : 'Admin'}
          </h1>
          {variant !== 'report' && (
            <p className={houseTypography.fieldHelper}>
              {variant === 'reference'
                ? 'CMR Reference Data'
                : variant === 'database'
                  ? 'View & Edit Reference Data'
                  : 'CMR Access Management'}
            </p>
          )}
        </div>
      </div>
      <ScrollArea className={houseLayout.sidebarScroll}>
        <nav className={houseLayout.sidebarBody}>
          {variant === 'report' ? (
            <>
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>RAW</p>
                <div className={houseNavigation.list}>
                  {REPORT_RAW_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { navigate(item.path); onNavigate?.() }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        pathname === item.path && houseNavigation.itemActive,
                      )}
                    >
                      <span className={houseNavigation.itemLabel}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>VISUALISER</p>
                <div className={houseNavigation.list}>
                  {REPORT_VISUALISER_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { navigate(item.path); onNavigate?.() }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        pathname === item.path && houseNavigation.itemActive,
                      )}
                    >
                      <span className={houseNavigation.itemLabel}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>MODULES</p>
                <div className={houseNavigation.list}>
                  {REPORT_MODULES_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => { navigate(item.path); onNavigate?.() }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        pathname === item.path && houseNavigation.itemActive,
                      )}
                    >
                      <span className={houseNavigation.itemLabel}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : variant === 'admin' ? (
            <section className={houseLayout.sidebarSection}>
              <p className={houseNavigation.sectionLabel}>MANAGEMENT</p>
              <div className={houseNavigation.list}>
                {ADMIN_NAV.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { onSectionJump(item.sectionKey); onNavigate?.() }}
                    className={cn(
                      houseNavigation.item,
                      navItemClass,
                      activeSection === item.sectionKey && houseNavigation.itemActive,
                    )}
                  >
                    <span className={houseNavigation.itemLabel}>{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className={houseLayout.sidebarSection}>
              <p className={houseNavigation.sectionLabel}>SECTIONS</p>
              <div className={houseNavigation.list}>
                {paramSections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { onSectionJump(s.key); onNavigate?.() }}
                    className={cn(
                      houseNavigation.item,
                      navItemClass,
                      activeSection === s.key && houseNavigation.itemActive,
                    )}
                  >
                    <span className={houseNavigation.itemLabel}>{s.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </nav>
      </ScrollArea>
    </aside>
  )
}

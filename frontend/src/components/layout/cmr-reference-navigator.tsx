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
  /** Whether a report has been extracted. When false, VISUALISER and MODULES nav items are disabled. */
  hasReport?: boolean
  /** Whether non-contrast scan is selected. When true, Tissue characterisation is greyed out. */
  nonContrast?: boolean
}

function sentenceCase(s: string): string {
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Short display labels for long section names */
const LABEL_OVERRIDES: Record<string, string> = {
  'Valve morphology and function': 'Valve morphology & function',
  'Myocardial tissue characterisation': 'Tissue characterisation',
  'Derived haemodynamic parameters': 'Haemodynamic parameters',
  'Additional granular details': 'Additional details',
}

const REPORT_RAW_NAV = [
  { key: 'upload', path: '/cmr-upload-report', label: 'Upload report' },
]

const REPORT_VISUALISER_NAV = [
  { key: 'quantitative', path: '/cmr-new-report', label: 'Quantitative metrics' },
  { key: 'rwma', path: '/cmr-rwma', label: 'Wall motion' },
  { key: 'lge', path: '/cmr-lge', label: 'Tissue characterisation' },
  { key: 'valves', path: '/cmr-valves', label: 'Valves' },
]

const REPORT_MODULES_NAV = [
  { key: 'lv-thrombus', path: '/cmr-lv-thrombus', label: 'Thrombus' },
  { key: 'ph', path: '/cmr-ph', label: 'PH' },
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
  hasReport = true,
  nonContrast = false,
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
      const tc = sentenceCase(key)
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
              <section className={cn(houseLayout.sidebarSection, !hasReport && 'opacity-40')}>
                <p className={houseNavigation.sectionLabel}>VISUALISER</p>
                <div className={houseNavigation.list}>
                  {REPORT_VISUALISER_NAV.map((item) => {
                    const isLge = item.key === 'lge'
                    const disabled = !hasReport || (isLge && nonContrast)
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => { if (!disabled) { navigate(item.path); onNavigate?.() } }}
                        className={cn(
                          houseNavigation.item,
                          navItemClass,
                          pathname === item.path && !disabled && houseNavigation.itemActive,
                          disabled && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <span className={houseNavigation.itemLabel}>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
              <section className={cn(houseLayout.sidebarSection, !hasReport && 'opacity-40')}>
                <p className={houseNavigation.sectionLabel}>MODULES</p>
                <div className={houseNavigation.list}>
                  {REPORT_MODULES_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!hasReport}
                      onClick={() => { if (hasReport) { navigate(item.path); onNavigate?.() } }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        pathname === item.path && hasReport && houseNavigation.itemActive,
                        !hasReport && 'cursor-not-allowed',
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

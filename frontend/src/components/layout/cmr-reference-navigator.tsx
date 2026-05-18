import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { ScrollArea } from '@/components/ui'
import { buildCmrCasePath } from '@/lib/cmr-case-routes'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { resolveSections } from '@/lib/cmr-local-data'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type RefNavProps = {
  activeSection: string | null
  onSectionJump: (sectionKey: string) => void
  onNavigate?: () => void
  variant: 'reference' | 'database' | 'report' | 'reports' | 'admin'
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
  const isReportStyleVariant = variant === 'report' || variant === 'reports'

  const borderClass = isReportStyleVariant
    ? 'house-left-border-report'
    : variant === 'reference'
      ? 'house-left-border-profile'
      : variant === 'admin'
        ? 'house-left-border-admin'
      : 'house-left-border-learning-centre'
  const navItemClass = isReportStyleVariant
    ? houseNavigation.itemReport
    : variant === 'reference'
      ? houseNavigation.itemOverview
      : variant === 'admin'
        ? 'house-nav-item-admin'
      : houseNavigation.itemLearningCentre
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeCaseId = useCmrCaseStore((state) => state.activeCaseId)
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const createFreshCase = useCmrCaseStore((state) => state.createFreshCase)
  const flushActiveCase = useCmrCaseStore((state) => state.flushActiveCase)
  const [creatingReport, setCreatingReport] = useState(false)
  const isReportsIndexPath = pathname === '/cmr-reports'
  const isAnyCasePath = pathname.startsWith('/cmr/cases/')

  const uploadPath = activeCaseId ? buildCmrCasePath(activeCaseId, 'upload') : null
  const uploadEntryLabel = creatingReport
    ? 'Creating...'
    : activeCaseId
      ? 'Raw Upload'
      : 'New Report'

  const REPORTS_CASE_NAV = [
    { key: 'reports', path: '/cmr-reports', label: 'My Reports' },
    { key: 'upload', path: uploadPath, label: uploadEntryLabel },
  ]

  const REPORT_VISUALISER_NAV = activeCaseId
    ? [
        { key: 'quantitative', path: buildCmrCasePath(activeCaseId, 'report'), label: 'Quantitative metrics' },
        { key: 'rwma', path: buildCmrCasePath(activeCaseId, 'rwma'), label: 'Wall motion' },
        { key: 'lge', path: buildCmrCasePath(activeCaseId, 'lge'), label: 'Tissue characterisation' },
        { key: 'perfusion', path: buildCmrCasePath(activeCaseId, 'perfusion'), label: 'Perfusion' },
        { key: 'valves', path: buildCmrCasePath(activeCaseId, 'valves'), label: 'Valves' },
      ]
    : []

  const REPORT_MODULES_NAV = activeCaseId
    ? [
        { key: 'lv-thrombus', path: buildCmrCasePath(activeCaseId, 'lv-thrombus'), label: 'Thrombus' },
        { key: 'ph', path: buildCmrCasePath(activeCaseId, 'ph'), label: 'PH' },
      ]
    : []

  const REPORT_OUTPUT_NAV = activeCaseId
    ? [
        { key: 'output', path: buildCmrCasePath(activeCaseId, 'output'), label: 'Report output' },
      ]
    : []

  const handleOpenUpload = async () => {
    if (uploadPath) {
      const saved = await flushActiveCase()
      if (!saved) return
      navigate(uploadPath)
      onNavigate?.()
      return
    }

    setCreatingReport(true)
    try {
      const created = await createFreshCase()
      if (!created) return
      navigate(buildCmrCasePath(created.id, 'upload'))
      onNavigate?.()
    } finally {
      setCreatingReport(false)
    }
  }

  const navigateWithAutosave = async (path: string) => {
    const saved = await flushActiveCase()
    if (!saved) return
    navigate(path)
    onNavigate?.()
  }

  const isReportsNavItemActive = (itemKey: string, itemPath: string | null) => {
    if (itemKey === 'reports') return isReportsIndexPath
    if (itemKey === 'upload') return isAnyCasePath
    return itemPath != null && pathname === itemPath
  }

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
              ? 'Reports'
              : variant === 'reports'
                ? 'Reports'
              : variant === 'reference'
                ? 'Reference'
                : variant === 'database'
                  ? 'Reference Database'
                  : 'Admin'}
          </h1>
          <p className={houseTypography.fieldHelper}>
            {variant === 'report'
              ? (activeCase?.title || 'Current report')
              : variant === 'reports'
                ? 'Persisted draft reports'
                : variant === 'reference'
                  ? 'CMR Reference Data'
                  : variant === 'database'
                    ? 'View & Edit Reference Data'
                    : 'CMR Access Management'}
          </p>
        </div>
      </div>
      <ScrollArea className={houseLayout.sidebarScroll}>
        <nav className={houseLayout.sidebarBody}>
          {variant === 'report' ? (
            <>
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>REPORTS</p>
                <div className={houseNavigation.list}>
                  {REPORTS_CASE_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={item.key === 'upload' && creatingReport}
                      onClick={() => {
                        if (item.key === 'upload') {
                          void handleOpenUpload()
                          return
                        }
                        void navigateWithAutosave(item.path!)
                      }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        isReportsNavItemActive(item.key, item.path) && houseNavigation.itemActive,
                        item.key === 'upload' && creatingReport && 'cursor-not-allowed opacity-60',
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
                        onClick={() => { if (!disabled) { void navigateWithAutosave(item.path) } }}
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
                      onClick={() => { if (hasReport) { void navigateWithAutosave(item.path) } }}
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
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>OUTPUT</p>
                <div className={houseNavigation.list}>
                  {REPORT_OUTPUT_NAV.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={!item.path}
                      onClick={() => { if (item.path) { void navigateWithAutosave(item.path) } }}
                      className={cn(
                        houseNavigation.item,
                        navItemClass,
                        item.path != null && pathname === item.path && houseNavigation.itemActive,
                        !item.path && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span className={houseNavigation.itemLabel}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : variant === 'reports' ? (
            <section className={houseLayout.sidebarSection}>
              <p className={houseNavigation.sectionLabel}>REPORTS</p>
              <div className={houseNavigation.list}>
                {REPORTS_CASE_NAV.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.key === 'upload' && creatingReport}
                    onClick={() => {
                      if (item.key === 'upload') {
                        void handleOpenUpload()
                        return
                      }
                      void navigateWithAutosave(item.path!)
                    }}
                    className={cn(
                      houseNavigation.item,
                      navItemClass,
                      isReportsNavItemActive(item.key, item.path) && houseNavigation.itemActive,
                      item.key === 'upload' && creatingReport && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <span className={houseNavigation.itemLabel}>{item.label}</span>
                  </button>
                ))}
              </div>
            </section>
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

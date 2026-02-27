# FULL SITE ANALYSIS

Generated: 2026-02-27
Scope: `frontend/src/components`, `frontend/src/pages`, `frontend/src/stories`, `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/.storybook`, and referenced governance surfaces.

Component files scanned: 47. Page files scanned: 31. Story files scanned: 63. Motion instances found: 246.

## Component Inventory

| file | name | styling | motion Y/N | dependencies |
| --- | --- | --- | --- | --- |
| frontend/src/components/ui/tooltip.tsx | unclear | tailwind-utility | N | @/lib/utils |
| frontend/src/components/ui/textarea.tsx | unclear | tailwind-utility + house-semantic + cva-variants | Y | @/lib/utils |
| frontend/src/components/ui/tabs.tsx | unclear | tailwind-utility + house-semantic | N | @/lib/house-style, @/lib/utils |
| frontend/src/components/ui/table.tsx | unclear | tailwind-utility + house-semantic | N | @/lib/house-style, @/lib/utils |
| frontend/src/components/ui/sheet.tsx | unclear | tailwind-utility + house-semantic | Y | @/lib/utils |
| frontend/src/components/ui/separator.tsx | unclear | tailwind-utility | N | @/lib/utils |
| frontend/src/components/ui/select.tsx | unclear | tailwind-utility + house-semantic + cva-variants | Y | @/lib/utils |
| frontend/src/components/ui/scroll-area.tsx | unclear | tailwind-utility + house-semantic | Y | @/lib/utils |
| frontend/src/components/ui/label.tsx | unclear | tailwind-utility + house-semantic | N | @/lib/house-style, @/lib/utils |
| frontend/src/components/ui/input.tsx | unclear | tailwind-utility + house-semantic + cva-variants | Y | @/lib/utils |
| frontend/src/components/ui/card.tsx | unclear | tailwind-utility + house-semantic | N | @/lib/house-style, @/lib/utils |
| frontend/src/components/ui/button.tsx | unclear | tailwind-utility + house-semantic + cva-variants | Y | @/lib/house-style, @/lib/utils |
| frontend/src/components/ui/badge.tsx | Badge | tailwind-utility + house-semantic + cva-variants | Y | @/lib/utils |
| frontend/src/components/study-core/StudyCoreStepper.tsx | StudyCoreStepper | tailwind-utility | N | @/components/ui/button, @/lib/utils, @/store/use-study-core-wizard-store |
| frontend/src/components/study-core/StepRun.tsx | StepRun | tailwind-utility + house-semantic | Y | @/components/ui/button, @/components/ui/input, @/components/ui/select, @/components/ui/textarea, @/lib/auth-session, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/StepPlan.tsx | StepPlan | tailwind-utility + house-semantic | Y | @/components/ui/button, @/components/ui/input, @/components/ui/label, @/components/ui/textarea, @/lib/research-frame-options, @/lib/plan-section-readiness, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/StepLinkQcExport.tsx | StepLinkQcExport | tailwind-utility + house-semantic | Y | @/components/ui/button, @/components/ui/select, @/lib/auth-session, @/lib/study-core-api, @/types/qc-run, @/types/study-core |
| frontend/src/components/study-core/StepDraftReview.tsx | StepDraftReview | tailwind-utility + house-semantic | Y | @/components/ui/button, @/components/ui/select, @/components/ui/tabs, @/components/ui/textarea, @/lib/auth-session, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/StepContext.tsx | StepContext | tailwind-utility + house-semantic | Y | @/components/ui/button, @/components/ui/input, @/components/ui/label, @/components/ui/select, @/components/ui/textarea, @/components/ui/tooltip, @/lib/research-frame-options, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/Step5Panel.tsx | Step5Panel | tailwind-utility + house-semantic | N | @/components/study-core/RecommendationCard |
| frontend/src/components/study-core/Step4Panel.tsx | Step4Panel | tailwind-utility + house-semantic | N | @/components/study-core/RecommendationCard |
| frontend/src/components/study-core/Step3Panel.tsx | Step3Panel | tailwind-utility + house-semantic | N | @/components/ui/button, @/components/study-core/RecommendationCard |
| frontend/src/components/study-core/Step2Panel.tsx | Step2Panel | tailwind-utility + house-semantic + inline-style | Y | @/components/ui/button, @/components/ui/textarea, @/lib/plan-section-readiness, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/Step1Panel.tsx | Step1Panel | tailwind-utility + house-semantic | Y | @/components/ui/button, @/lib/api, @/lib/study-core-api, @/types/study-core |
| frontend/src/components/study-core/RecommendationCard.tsx | RecommendationCard | tailwind-utility | N | @/components/ui/button |
| frontend/src/components/publications/PublicationsTopStrip.tsx | PublicationsTopStrip | tailwind-utility + house-semantic + inline-style | Y | @/components/ui/card, @/components/ui/button, @/components/ui/sheet, @/components/ui/tabs, @/lib/account-preferences, @/lib/impact-api, @/lib/utils, @/types/impact |
| frontend/src/components/publications/publications-house-style.ts | publicationsHouseHeadings, publicationsHouseSurfaces, publicationsHouseDividers, publicationsHouseMotion, publicationsHouseCharts, publicationsHouseActions, publicationsHouseDetail, publicationsHouseDrilldown | house-semantic | N | @/lib/house-style |
| frontend/src/components/publications/PublicationMetricDrilldownPanel.tsx | PublicationMetricDrilldownPanel | tailwind-utility + inline-style | N | @/components/ui/button, @/lib/utils, @/types/impact |
| frontend/src/components/publications/MetricTile.tsx | MetricTile | tailwind-utility | N | @/components/ui/tooltip, @/lib/utils, @/types/impact |
| frontend/src/components/publications/dashboard-tile-styles.ts | dashboardTileStyles, dashboardTileBarTabIndex | house-semantic | Y | @/lib/house-style |
| frontend/src/components/navigation/nav-config.ts | NAV_GROUPS | unclear | N | @/lib/section-tone |
| frontend/src/components/data-workspace/TableTabs.tsx | TableTabs | tailwind-utility + house-semantic | N | @/components/ui/badge, @/components/ui/button, @/components/ui/input, @/components/ui/textarea, @/components/ui/tabs, @/lib/house-style, @/types/data-workspace |
| frontend/src/components/data-workspace/TableHeader.tsx | TableHeader | tailwind-utility + house-semantic | N | @/components/ui/button, @/components/ui/input, @/components/ui/label, @/components/ui/select, @/components/ui/textarea, @/lib/house-style, @/types/data-workspace |
| frontend/src/components/data-workspace/AddColumnModal.tsx | AddColumnModal | tailwind-utility + house-semantic | N | @/components/ui/button, @/components/ui/input, @/components/ui/label, @/components/ui/select, @/components/ui/sheet, @/lib/house-style, @/types/data-workspace |
| frontend/src/components/layout/account-layout.tsx | AccountLayout | tailwind-utility + house-semantic | N | @/components/layout/account-navigator, @/components/layout/top-bar, @/components/ui/scroll-area, @/components/ui/sheet, @/store/use-aawe-store |
| frontend/src/components/auth/AxiomosMark.tsx | AxiomosMark | tailwind-utility | N | @/lib/utils |
| frontend/src/components/auth/LoginCard.tsx | LoginCard | tailwind-utility | Y | @/components/auth/AxiomosMark, @/components/ui/card, @/lib/utils |
| frontend/src/components/layout/app-error-boundary.tsx | unclear | tailwind-utility + house-semantic | N | @/components/ui/button |
| frontend/src/components/layout/account-navigator.tsx | AccountNavigator | tailwind-utility + house-semantic | N | @/components/ui/scroll-area, @/lib/auth-session, @/lib/house-style, @/lib/impact-api, @/lib/persona-cache, @/lib/section-tone, @/lib/utils |
| frontend/src/components/layout/app-shell.tsx | AppShell | tailwind-utility + house-semantic | N | @/components/layout/profile-panel, @/components/layout/study-navigator, @/components/layout/top-bar, @/components/ui/scroll-area, @/components/ui/sheet, @/lib/utils, @/store/use-aawe-store |
| frontend/src/components/layout/insight-panel.tsx | InsightPanel | tailwind-utility + house-semantic | Y | @/components/ui/badge, @/components/ui/card, @/components/ui/scroll-area, @/components/ui/separator, @/components/ui/tabs, @/lib/api, @/store/use-aawe-store, @/store/use-study-core-wizard-store, @/types/insight, @/types/selection |
| frontend/src/components/layout/workspace-navigator.tsx | WorkspaceNavigator | tailwind-utility + house-semantic | N | @/components/ui/scroll-area, @/components/ui/select, @/components/ui/separator, @/lib/house-style, @/lib/section-tone, @/lib/utils, @/store/use-workspace-store |
| frontend/src/components/layout/workspace-layout.tsx | WorkspaceLayout | tailwind-utility + house-semantic | N | @/components/layout/top-bar, @/components/layout/workspace-navigator, @/components/ui/scroll-area, @/components/ui/sheet, @/lib/utils, @/lib/auth-session, @/store/use-aawe-store, @/store/use-workspace-store |
| frontend/src/components/layout/top-bar.tsx | TopBar | tailwind-utility + house-semantic | Y | @/components/auth/AxiomosMark, @/components/ui/button, @/components/ui/input, @/components/ui/tooltip, @/lib/auth-session, @/lib/impact-api, @/lib/utils, @/store/use-aawe-store |
| frontend/src/components/layout/study-navigator.tsx | StudyNavigator | tailwind-utility + house-semantic | N | @/components/navigation/nav-config, @/components/ui/badge, @/components/ui/scroll-area, @/components/ui/separator, @/lib/house-style, @/lib/section-tone, @/lib/utils, @/store/use-study-core-wizard-store |
| frontend/src/components/layout/profile-panel.tsx | ProfilePanel | tailwind-utility + house-semantic | N | @/components/ui/button, @/components/ui/card, @/components/ui/scroll-area, @/lib/impact-api, @/lib/auth-session, @/types/impact |
| frontend/src/components/layout/next-best-action-panel.tsx | NextBestActionPanel | tailwind-utility + house-semantic | N | @/components/ui/button, @/components/ui/card, @/components/ui/scroll-area, @/lib/impact-api, @/lib/auth-session, @/types/impact |

## Page Inventory

| file | name | components used | layout approach |
| --- | --- | --- | --- |
| frontend/src/pages/workspaces-page.tsx | WorkspacesPage | @/components/layout/top-bar, @/components/ui/button, @/components/ui/input, @/components/ui/scroll-area, @/components/ui/select, @/components/ui/sheet, @/components/ui/tooltip | Tailwind utility layout |
| frontend/src/pages/workspaces-data-library-view.tsx | WorkspacesDataLibraryView | @/components/ui/button, @/components/ui/input, @/components/ui/scroll-area, @/components/ui/select | Tailwind utility layout |
| frontend/src/pages/workspace-inbox-page.tsx | WorkspaceInboxPage | @/components/layout/top-bar, @/components/ui/button, @/components/ui/textarea | Tailwind utility layout |
| frontend/src/pages/workspace-exports-page.tsx | WorkspaceExportsPage | @/components/ui/button, @/components/ui/card | Tailwind utility layout |
| frontend/src/pages/version-history-page.tsx | VersionHistoryPage | none | PageFrame wrapper |
| frontend/src/pages/study-core-page.tsx | StudyCorePage | @/components/study-core/Step1Panel, @/components/study-core/Step2Panel, @/components/study-core/StepContext, @/components/study-core/StepDraftReview, @/components/study-core/StepLinkQcExport, @/components/study-core/StepPlan, @/components/study-core/StepRun, @/components/study-core/StudyCoreStepper, @/components/ui/input | Tailwind utility layout |
| frontend/src/pages/settings-page.tsx | SettingsPage | @/components/ui/button, @/components/ui/card | Tailwind utility layout |
| frontend/src/pages/results-page.tsx | ResultsPage | @/components/ui/badge, @/components/ui/button, @/components/ui/card, @/components/ui/scroll-area, @/components/ui/sheet | PageFrame wrapper |
| frontend/src/pages/qc-dashboard-page.tsx | QCDashboardPage | @/components/ui/badge, @/components/ui/card | PageFrame wrapper |
| frontend/src/pages/profile-publications-page.tsx | ProfilePublicationsPage | @/components/publications/PublicationsTopStrip, @/components/publications/publications-house-style, @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/select, @/components/ui/sheet, @/components/ui/table, @/components/ui/tabs | Tailwind utility layout |
| frontend/src/pages/profile-personal-details-page.tsx | ProfilePersonalDetailsPage | @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/select | Tailwind utility layout |
| frontend/src/pages/profile-page.tsx | ProfilePage | none | Tailwind utility layout |
| frontend/src/pages/profile-manage-account-page.tsx | ProfileManageAccountPage | @/components/ui/button, @/components/ui/card, @/components/ui/input | Tailwind utility layout |
| frontend/src/pages/profile-integrations-page.tsx | ProfileIntegrationsPage | @/components/ui/button, @/components/ui/card | Tailwind utility layout |
| frontend/src/pages/profile-collaboration-page.tsx | ProfileCollaborationPage | @/components/ui/badge, @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/select, @/components/ui/table, @/components/ui/textarea | Tailwind utility layout |
| frontend/src/pages/page-frame.tsx | PageFrame | @/components/ui/card | PageFrame wrapper |
| frontend/src/pages/overview-page.tsx | OverviewPage | @/components/ui/badge, @/components/ui/card | PageFrame wrapper |
| frontend/src/pages/orcid-callback-page.tsx | OrcidCallbackPage | @/components/ui/card | Tailwind utility layout |
| frontend/src/pages/manuscript-tables-page.tsx | ManuscriptTablesPage | @/components/ui/badge, @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/scroll-area | PageFrame wrapper |
| frontend/src/pages/manuscript-page.tsx | ManuscriptPage | @/components/ui/badge, @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/scroll-area, @/components/ui/separator, @/components/ui/sheet | PageFrame wrapper |
| frontend/src/pages/literature-page.tsx | LiteraturePage | none | PageFrame wrapper |
| frontend/src/pages/landing-page.tsx | LandingPage | @/components/auth/AxiomosMark, @/components/ui/button | Tailwind utility layout |
| frontend/src/pages/journal-targeting-page.tsx | JournalTargetingPage | none | PageFrame wrapper |
| frontend/src/pages/inference-rules-page.tsx | InferenceRulesPage | none | PageFrame wrapper |
| frontend/src/pages/impact-page.tsx | ImpactPage | none | Tailwind utility layout |
| frontend/src/pages/claim-map-page.tsx | ClaimMapPage | none | PageFrame wrapper |
| frontend/src/pages/auth-page.tsx | AuthPage | @/components/auth/LoginCard, @/components/ui/button, @/components/ui/input | Tailwind utility layout |
| frontend/src/pages/auth-callback-page.tsx | AuthCallbackPage | @/components/ui/card | Tailwind utility layout |
| frontend/src/pages/audit-log-page.tsx | AuditLogPage | none | PageFrame wrapper |
| frontend/src/pages/agent-logs-page.tsx | AgentLogsPage | none | PageFrame wrapper |
| frontend/src/pages/admin-page.tsx | AdminPage | @/components/ui/button, @/components/ui/card, @/components/ui/input, @/components/ui/select | Tailwind utility layout |

## Motion Inventory

| file | component | trigger | property | duration | easing | notes |
| --- | --- | --- | --- | --- | --- | --- |
| frontend/src/components/auth/LoginCard.tsx:34 | LoginCard | focus | color/background/border | unclear | unclear | 'inline-flex h-9 items-center justify-center rounded-md border border-transparent px-3 text-label font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--auth-brand-accent))]' |
| frontend/src/components/auth/LoginCard.tsx:126 | LoginCard | unclear | color/background/border | unclear | unclear | 'inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-2 text-label font-medium transition-colors', |
| frontend/src/components/layout/insight-panel.tsx:766 | insight-panel | loading | unclear | unclear | unclear | {loadingInsight && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />} |
| frontend/src/components/layout/top-bar.tsx:194 | top-bar | loading | unclear | unclear | unclear | {isSigningOut ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} |
| frontend/src/components/publications/dashboard-tile-styles.ts:5 | dashboard-tile-styles | hover | color/background/border | 220ms | ease-out | 'group/tile flex h-full min-h-32 cursor-pointer flex-col rounded-md border border-[hsl(var(--stroke-strong)/0.98)] bg-card p-3 text-left transition-[background-color] duration-220 ease-out hover:bg-[hsl(var(--tone-neutral-100)/0.24)]', |
| frontend/src/components/publications/dashboard-tile-styles.ts:10 | dashboard-tile-styles | hover | color/background/border | 220ms | ease-out | 'inline-flex h-5 w-5 items-center justify-center rounded-sm text-[hsl(var(--tone-neutral-500))] transition-[background-color,color] duration-220 ease-out hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))]', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:417 | PublicationsTopStrip | unclear | opacity | 320ms | ease-out | cn(HOUSE_SURFACE_STRONG_PANEL_CLASS, 'flex flex-1 flex-col gap-2.5 px-2 py-2 transition-[opacity,transform,filter] duration-320 ease-out') |
| frontend/src/components/publications/PublicationsTopStrip.tsx:432 | PublicationsTopStrip | unclear | unclear | var(--motion-duration-chart-ring-fill) | cubic-bezier(0.22, 1, 0.36, 1) | const HOUSE_RING_ARC_TRANSITION = 'stroke-dasharray var(--motion-duration-chart-ring-fill) cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset var(--motion-duration-chart-ring-fill) cubic-bezier(0.22, 1, 0.36, 1)' |
| frontend/src/components/publications/PublicationsTopStrip.tsx:433 | PublicationsTopStrip | unclear | unclear | var(--motion-duration-chart-ring-fill) | cubic-bezier(0.22, 1, 0.36, 1) | const HOUSE_RING_COLOR_TRANSITION = 'stroke var(--motion-duration-chart-ring-fill) cubic-bezier(0.22, 1, 0.36, 1)' |
| frontend/src/components/publications/PublicationsTopStrip.tsx:451 | PublicationsTopStrip | unclear | transform | 150ms | ease-out | 'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:1317 | PublicationsTopStrip | unclear | transform | 220ms | ease-out | 'block w-full rounded transition-[transform,filter,box-shadow] duration-220 ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:2913 | PublicationsTopStrip | unclear | width | 320ms | ease-out | 'h-full rounded-full transition-[width] duration-320 ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:3140 | PublicationsTopStrip | unclear | width | 320ms | ease-out | 'h-full rounded-full transition-[width] duration-320 ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:4465 | PublicationsTopStrip | unclear | color/background/border | 200ms | unclear | 'relative flex min-w-[1.95rem] flex-1 items-end rounded border border-transparent transition-all duration-200', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:4475 | PublicationsTopStrip | unclear | height | 220ms | ease-out | 'block w-full rounded transition-[height,filter] duration-220 ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:4581 | PublicationsTopStrip | unclear | color/background/border | unclear | unclear | className={cn('inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors', HOUSE_DRILLDOWN_ACTION_CLASS)} |
| frontend/src/components/publications/PublicationsTopStrip.tsx:5023 | PublicationsTopStrip | unclear | opacity | unclear | ease-out | 'h-full w-full transition-opacity ease-out', |
| frontend/src/components/publications/PublicationsTopStrip.tsx:5042 | PublicationsTopStrip | unclear | width | 500ms | ease-out | className={cn('h-full rounded-full transition-[width] duration-500 ease-out', HOUSE_CHART_BAR_POSITIVE_CLASS)} |
| frontend/src/components/study-core/Step1Panel.tsx:39 | Step1Panel | unclear | unclear | 300ms | ease-out | const CARD_TRANSITION_CLASS = 'transition-all duration-300 ease-out' |
| frontend/src/components/study-core/Step2Panel.tsx:319 | Step2Panel | loading | unclear | unclear | unclear | {loadingQuestion ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} |
| frontend/src/components/study-core/Step2Panel.tsx:333 | Step2Panel | unclear | unclear | unclear | unclear | className={`h-full transition-all ${ |
| frontend/src/components/study-core/Step2Panel.tsx:505 | Step2Panel | loading | unclear | unclear | unclear | {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} |
| frontend/src/components/study-core/Step2Panel.tsx:514 | Step2Panel | loading | unclear | unclear | unclear | {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} |
| frontend/src/components/study-core/StepContext.tsx:717 | StepContext | loading | unclear | unclear | unclear | {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} |
| frontend/src/components/study-core/StepDraftReview.tsx:190 | StepDraftReview | loading | unclear | unclear | unclear | {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepDraftReview.tsx:194 | StepDraftReview | loading | unclear | unclear | unclear | {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepLinkQcExport.tsx:215 | StepLinkQcExport | loading | unclear | unclear | unclear | {busy === 'qc' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />} |
| frontend/src/components/study-core/StepLinkQcExport.tsx:223 | StepLinkQcExport | loading | unclear | unclear | unclear | {busy === 'export' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} |
| frontend/src/components/study-core/StepLinkQcExport.tsx:228 | StepLinkQcExport | loading | unclear | unclear | unclear | {busy === 'export-override' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} |
| frontend/src/components/study-core/StepLinkQcExport.tsx:262 | StepLinkQcExport | loading | unclear | unclear | unclear | {busy === 'link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} |
| frontend/src/components/study-core/StepLinkQcExport.tsx:279 | StepLinkQcExport | loading | unclear | unclear | unclear | {busy === 'refs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} |
| frontend/src/components/study-core/StepPlan.tsx:787 | StepPlan | loading | unclear | unclear | unclear | {assetBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepPlan.tsx:791 | StepPlan | loading | unclear | unclear | unclear | {uploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepPlan.tsx:796 | StepPlan | loading | unclear | unclear | unclear | {profileBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepPlan.tsx:879 | StepPlan | loading | unclear | unclear | unclear | {questionBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}Next question |
| frontend/src/components/study-core/StepPlan.tsx:906 | StepPlan | loading | unclear | unclear | unclear | <div className="flex gap-2"><Button type="button" className="house-button-action-primary text-sm font-semibold" onClick={() => void generatePlan()} disabled={toolBusy}>{toolBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}Generate manuscript plan</Button><Button type="button" variant="outline" onClick={() => setPhase('data')}>Back to data</Button></div> |
| frontend/src/components/study-core/StepPlan.tsx:915 | StepPlan | loading | unclear | unclear | unclear | <Button type="button" variant="outline" onClick={() => planJson && void savePlan(planJson)} disabled={!planJson \|\| saveBusy}>{saveBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save plan</Button> |
| frontend/src/components/study-core/StepPlan.tsx:1163 | StepPlan | loading | unclear | unclear | unclear | <Button type="button" size="sm" variant="outline" onClick={() => sectionInputRef.current?.click()} disabled={sectionUploadBusy}>{sectionUploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}Upload and attach</Button> |
| frontend/src/components/study-core/StepRun.tsx:661 | StepRun | loading | unclear | unclear | unclear | {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} |
| frontend/src/components/study-core/StepRun.tsx:738 | StepRun | loading | unclear | unclear | unclear | {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} |
| frontend/src/components/study-core/StepRun.tsx:768 | StepRun | loading | unclear | unclear | unclear | {busy === 'cancel' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/study-core/StepRun.tsx:777 | StepRun | loading | unclear | unclear | unclear | {busy === 'retry' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/components/ui/badge.tsx:7 | badge | focus | color/background/border | unclear | unclear | 'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2', |
| frontend/src/components/ui/button.tsx:9 | button | focus | opacity | unclear | ease-out | 'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-[background-color,border-color,color,transform] duration-ui ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', |
| frontend/src/components/ui/input.tsx:7 | input | focus | opacity | unclear | unclear | 'flex w-full rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground shadow-sm transition-colors duration-ui file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger', |
| frontend/src/components/ui/scroll-area.tsx:36 | scroll-area | unclear | color/background/border | unclear | unclear | 'flex touch-none select-none transition-colors', |
| frontend/src/components/ui/select.tsx:7 | select | focus | opacity | unclear | unclear | 'flex w-full appearance-none rounded-md border border-border bg-background text-foreground shadow-sm transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger', |
| frontend/src/components/ui/sheet.tsx:20 | sheet | toggle/state-change | unclear | unclear | unclear | className={cn('fixed inset-0 z-50 bg-[hsl(var(--tone-neutral-900)/0.34)] data-[state=open]:animate-in data-[state=closed]:animate-out', className)} |
| frontend/src/components/ui/sheet.tsx:39 | sheet | toggle/state-change | color/background/border | 200ms | ease-in-out | 'fixed z-50 bg-background p-5 shadow-lg transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300', |
| frontend/src/components/ui/sheet.tsx:40 | sheet | toggle/state-change | color/background/border | unclear | unclear | side === 'right' && 'inset-y-0 right-0 h-full border-l border-border data-[state=open]:animate-in', |
| frontend/src/components/ui/sheet.tsx:41 | sheet | toggle/state-change | color/background/border | unclear | unclear | side === 'left' && 'inset-y-0 left-0 h-full border-r border-border data-[state=open]:animate-in', |
| frontend/src/components/ui/sheet.tsx:53 | sheet | hover | opacity | unclear | unclear | className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring" |
| frontend/src/components/ui/textarea.tsx:7 | textarea | focus | opacity | unclear | unclear | 'flex w-full rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground shadow-sm transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger', |
| frontend/src/index.css:132 | index.css | unclear | unclear | 150ms | unclear | --motion-duration-fast: 150ms; |
| frontend/src/index.css:133 | index.css | unclear | unclear | 180ms | unclear | --motion-duration-ui: 180ms; |
| frontend/src/index.css:134 | index.css | unclear | unclear | 220ms | unclear | --motion-duration-base: 220ms; |
| frontend/src/index.css:135 | index.css | unclear | unclear | 250ms | unclear | --motion-duration-medium: 250ms; |
| frontend/src/index.css:136 | index.css | unclear | unclear | 320ms | unclear | --motion-duration-slow: 320ms; |
| frontend/src/index.css:137 | index.css | unclear | unclear | 420ms | unclear | --motion-duration-slower: 420ms; |
| frontend/src/index.css:138 | index.css | unclear | unclear | 500ms | unclear | --motion-duration-emphasis: 500ms; |
| frontend/src/index.css:139 | index.css | unclear | unclear | 700ms | unclear | --motion-duration-long: 700ms; |
| frontend/src/index.css:140 | index.css | unclear | unclear | var(--motion-duration-slower) | unclear | --motion-duration-chart-ring-fill: var(--motion-duration-slower); |
| frontend/src/index.css:485 | index.css | unclear | background-color, color | unclear | unclear | transition-property: background-color, color; |
| frontend/src/index.css:486 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:487 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:508 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: background-color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:596 | index.css | unclear | background-color, color, transform | unclear | unclear | transition-property: background-color, color, transform; |
| frontend/src/index.css:597 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:598 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:612 | index.css | unclear | background-color, opacity, transform | unclear | unclear | transition-property: background-color, opacity, transform; |
| frontend/src/index.css:613 | index.css | unclear | unclear | var(--motion-duration-base) | unclear | transition-duration: var(--motion-duration-base); |
| frontend/src/index.css:614 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:648 | index.css | unclear | background-color, color, border-color | unclear | unclear | transition-property: background-color, color, border-color; |
| frontend/src/index.css:649 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:650 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:729 | index.css | unclear | background-color, color, border-color | unclear | unclear | transition-property: background-color, color, border-color; |
| frontend/src/index.css:730 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:731 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:866 | index.css | unclear | background-color, color, border-color, box-shadow | unclear | unclear | transition-property: background-color, color, border-color, box-shadow; |
| frontend/src/index.css:867 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:868 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:907 | index.css | unclear | border-color, box-shadow, background-color | unclear | unclear | transition-property: border-color, box-shadow, background-color; |
| frontend/src/index.css:908 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:909 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:938 | index.css | unclear | border-color, box-shadow, background-color | unclear | unclear | transition-property: border-color, box-shadow, background-color; |
| frontend/src/index.css:939 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:940 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:987 | index.css | unclear | border-color, box-shadow, background-color | unclear | unclear | transition-property: border-color, box-shadow, background-color; |
| frontend/src/index.css:988 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:989 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1017 | index.css | unclear | background-color, color, transform, box-shadow | unclear | unclear | transition-property: background-color, color, transform, box-shadow; |
| frontend/src/index.css:1018 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1019 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1081 | index.css | unclear | background-color, color, transform, box-shadow | unclear | unclear | transition-property: background-color, color, transform, box-shadow; |
| frontend/src/index.css:1082 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1083 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1168 | index.css | unclear | background-color, border-color, color, box-shadow | unclear | unclear | transition-property: background-color, border-color, color, box-shadow; |
| frontend/src/index.css:1169 | index.css | unclear | unclear | 140ms | unclear | transition-duration: 140ms; |
| frontend/src/index.css:1170 | index.css | unclear | unclear | unclear | cubic-bezier(0.22, 1, 0.36, 1) | transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1); |
| frontend/src/index.css:1210 | index.css | unclear | background-color, color | unclear | unclear | transition-property: background-color, color; |
| frontend/src/index.css:1211 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1212 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1225 | index.css | unclear | background-color, color, transform, box-shadow | unclear | unclear | transition-property: background-color, color, transform, box-shadow; |
| frontend/src/index.css:1226 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1227 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1246 | index.css | unclear | background-color, color, transform, box-shadow | unclear | unclear | transition-property: background-color, color, transform, box-shadow; |
| frontend/src/index.css:1247 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1248 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1290 | index.css | unclear | border-color, background-color, color | unclear | unclear | transition-property: border-color, background-color, color; |
| frontend/src/index.css:1291 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1292 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1362 | index.css | unclear | border-color, color, background-color | unclear | unclear | transition-property: border-color, color, background-color; |
| frontend/src/index.css:1363 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1364 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1388 | index.css | unclear | color, background-color | unclear | unclear | transition-property: color, background-color; |
| frontend/src/index.css:1389 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:1390 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1660 | index.css | unclear | opacity, transform, filter | unclear | unclear | transition-property: opacity, transform, filter; |
| frontend/src/index.css:1661 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1662 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1690 | index.css | unclear | bottom | unclear | unclear | transition-property: bottom; |
| frontend/src/index.css:1691 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1692 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1697 | index.css | unclear | bottom, opacity | unclear | unclear | transition-property: bottom, opacity; |
| frontend/src/index.css:1698 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1699 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1704 | index.css | unclear | left | unclear | unclear | transition-property: left; |
| frontend/src/index.css:1705 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1706 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1710 | index.css | unclear | bottom, opacity | unclear | unclear | transition-property: bottom, opacity; |
| frontend/src/index.css:1711 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1712 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1713 | index.css | unclear | unclear | 0ms | unclear | transition-delay: 0ms; |
| frontend/src/index.css:1729 | index.css | unclear | opacity | 320ms | cubic-bezier(0.22, 1, 0.36, 1) | transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out; |
| frontend/src/index.css:1757 | index.css | unclear | left, width | unclear | unclear | transition-property: left, width; |
| frontend/src/index.css:1758 | index.css | unclear | unclear | var(--motion-duration-slow) | unclear | transition-duration: var(--motion-duration-slow); |
| frontend/src/index.css:1759 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1770 | index.css | unclear | color, transform | unclear | unclear | transition-property: color, transform; |
| frontend/src/index.css:1771 | index.css | unclear | unclear | var(--motion-duration-medium) | unclear | transition-duration: var(--motion-duration-medium); |
| frontend/src/index.css:1772 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:1780 | index.css | unclear | transform, filter, box-shadow | unclear | unclear | transition-property: transform, filter, box-shadow; |
| frontend/src/index.css:1781 | index.css | unclear | unclear | var(--motion-duration-slower) | unclear | transition-duration: var(--motion-duration-slower); |
| frontend/src/index.css:1782 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1787 | index.css | unclear | opacity | unclear | unclear | transition-property: opacity; |
| frontend/src/index.css:1788 | index.css | unclear | unclear | var(--motion-duration-base) | unclear | transition-duration: var(--motion-duration-base); |
| frontend/src/index.css:1789 | index.css | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | transition-timing-function: cubic-bezier(0.2, 0.68, 0.16, 1); |
| frontend/src/index.css:1794 | index.css | unclear | opacity | unclear | unclear | transition-property: opacity; |
| frontend/src/index.css:1798 | index.css | unclear | opacity, filter | unclear | unclear | transition-property: opacity, filter; |
| frontend/src/index.css:1799 | index.css | unclear | unclear | var(--motion-duration-fast) | unclear | transition-duration: var(--motion-duration-fast); |
| frontend/src/index.css:1808 | index.css | unclear | opacity, transform | unclear | unclear | transition-property: opacity, transform; |
| frontend/src/index.css:1809 | index.css | unclear | unclear | var(--motion-duration-base) | unclear | transition-duration: var(--motion-duration-base); |
| frontend/src/index.css:1810 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:2088 | index.css | unclear | color | unclear | unclear | transition-property: color; |
| frontend/src/index.css:2089 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:2090 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:2099 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: background-color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2128 | index.css | unclear | opacity | var(--motion-duration-fast) | ease-out | transition: opacity var(--motion-duration-fast) ease-out; |
| frontend/src/index.css:2161 | index.css | unclear | opacity | var(--motion-duration-fast) | ease-out | transition: opacity var(--motion-duration-fast) ease-out; |
| frontend/src/index.css:2326 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: background-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2394 | index.css | unclear | border-color, background-color, color, box-shadow | unclear | unclear | transition-property: border-color, background-color, color, box-shadow; |
| frontend/src/index.css:2395 | index.css | unclear | unclear | var(--motion-duration-ui) | unclear | transition-duration: var(--motion-duration-ui); |
| frontend/src/index.css:2396 | index.css | unclear | unclear | unclear | ease-out | transition-timing-function: ease-out; |
| frontend/src/index.css:2481 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2506 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out, color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2522 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2810 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: background-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2832 | index.css | unclear | color/background/border | var(--motion-duration-ui) | ease-out | transition: border-left-color var(--motion-duration-ui) ease-out, border-color var(--motion-duration-ui) ease-out, background-color var(--motion-duration-ui) ease-out; |
| frontend/src/index.css:2982 | index.css | load/reload | unclear | unclear | unclear | @keyframes wizard-fade-slide { |
| frontend/src/index.css:2995 | index.css | unclear | unclear | var(--motion-duration-base) | ease-out | animation: wizard-fade-slide var(--motion-duration-base) ease-out; |
| frontend/src/pages/admin-page.tsx:1034 | admin-page | unclear | color/background/border | unclear | unclear | 'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors', |
| frontend/src/pages/auth-callback-page.tsx:115 | auth-callback-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/auth-page.tsx:720 | auth-page | focus | color/background/border | unclear | unclear | 'flex rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card transition-colors focus-within:border-[hsl(var(--auth-brand-accent))] focus-within:ring-2 focus-within:ring-[hsl(var(--auth-brand-accent))]' |
| frontend/src/pages/auth-page.tsx:722 | auth-page | hover | color/background/border | unclear | unclear | 'inline-flex h-10 w-10 shrink-0 items-center justify-center border-l border-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-600))] transition-colors hover:text-[hsl(var(--auth-brand-navy))] focus-visible:outline-none' |
| frontend/src/pages/auth-page.tsx:726 | auth-page | hover | color/background/border | unclear | unclear | 'text-label font-medium text-[hsl(var(--tone-neutral-600))] underline underline-offset-2 transition-colors hover:text-[hsl(var(--auth-brand-navy))]' |
| frontend/src/pages/auth-page.tsx:863 | auth-page | loading | unclear | unclear | unclear | {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/auth-page.tsx:984 | auth-page | loading | unclear | unclear | unclear | {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/auth-page.tsx:1095 | auth-page | loading | unclear | unclear | unclear | {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/manuscript-page.tsx:297 | manuscript-page | unclear | color/background/border | unclear | unclear | className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`} |
| frontend/src/pages/manuscript-page.tsx:336 | manuscript-page | unclear | unclear | unclear | unclear | className="h-2 rounded-full bg-primary transition-all" |
| frontend/src/pages/manuscript-page.tsx:420 | manuscript-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/manuscript-page.tsx:448 | manuscript-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/manuscript-page.tsx:481 | manuscript-page | loading | unclear | unclear | unclear | {savingClaimCitations ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} |
| frontend/src/pages/manuscript-page.tsx:515 | manuscript-page | loading | unclear | unclear | unclear | {exportingClaimCitations ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} |
| frontend/src/pages/orcid-callback-page.tsx:58 | orcid-callback-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/profile-integrations-page.tsx:864 | profile-integrations-page | hover | color/background/border | unclear | unclear | <label key={option.key} className="group flex cursor-pointer items-start gap-2 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-2 py-1.5 transition-colors hover:border-[hsl(var(--tone-accent-200))]"> |
| frontend/src/pages/profile-integrations-page.tsx:886 | profile-integrations-page | unclear | transform | 500ms | ease-out | <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${worksPermissionEnabled ? 'text-[hsl(var(--tone-neutral-900))]' : 'text-[hsl(var(--tone-neutral-500))]'}`} style={{ transform: animateWorksCount ? 'scale(1.04)' : 'scale(1)' }}>{formatMetricNumber(worksCount)}</p> |
| frontend/src/pages/profile-integrations-page.tsx:893 | profile-integrations-page | unclear | transform | 500ms | ease-out | <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${worksPermissionEnabled && normalizedNewWorks > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-900))]'}`} style={{ transform: animateNewWorks ? 'scale(1.04)' : 'scale(1)' }}>{newWorksDeltaLabel}</p> |
| frontend/src/pages/profile-integrations-page.tsx:900 | profile-integrations-page | unclear | transform | 500ms | ease-out | <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${citationsPermissionEnabled ? 'text-[hsl(var(--tone-neutral-900))]' : 'text-[hsl(var(--tone-neutral-500))]'}`} style={{ transform: animateTotalCitations ? 'scale(1.04)' : 'scale(1)' }}>{formatMetricNumber(totalCitations)}</p> |
| frontend/src/pages/profile-integrations-page.tsx:907 | profile-integrations-page | unclear | transform | 500ms | ease-out | <p className={`mt-0.5 text-2xl font-semibold leading-tight transition-transform duration-500 ease-out ${citationsPermissionEnabled && normalizedNewCitations > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-900))]'}`} style={{ transform: animateNewCitations ? 'scale(1.04)' : 'scale(1)' }}>{newCitationsDeltaLabel}</p> |
| frontend/src/pages/profile-integrations-page.tsx:953 | profile-integrations-page | unclear | width | 700ms | ease-out | className="absolute inset-y-0 left-0 bg-[hsl(var(--tone-accent-200))] transition-[width] duration-700 ease-out" |
| frontend/src/pages/profile-integrations-page.tsx:958 | profile-integrations-page | loading | unclear | unclear | unclear | {syncButtonBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/profile-integrations-page.tsx:1022 | profile-integrations-page | loading | unclear | unclear | unclear | <Loader2 className="mr-2 h-4 w-4 animate-spin" /> |
| frontend/src/pages/profile-manage-account-page.tsx:217 | profile-manage-account-page | loading | unclear | unclear | unclear | {passwordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/profile-manage-account-page.tsx:263 | profile-manage-account-page | loading | unclear | unclear | unclear | {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/profile-personal-details-page.tsx:2332 | profile-personal-details-page | unclear | color/background/border | 700ms | ease-out | 'rounded-md border border-[hsl(var(--tone-neutral-200))] transition-[background-color,border-color,box-shadow] duration-700 ease-out', |
| frontend/src/pages/profile-personal-details-page.tsx:2342 | profile-personal-details-page | unclear | color/background/border | unclear | unclear | 'w-full px-3 py-2.5 text-left transition-colors', |
| frontend/src/pages/profile-personal-details-page.tsx:2355 | profile-personal-details-page | unclear | transform | 200ms | unclear | 'h-4 w-4 text-[hsl(var(--tone-neutral-500))] transition-transform duration-200', |
| frontend/src/pages/profile-personal-details-page.tsx:2364 | profile-personal-details-page | unclear | transform | 200ms | unclear | 'truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))] transition-transform duration-200', |
| frontend/src/pages/profile-personal-details-page.tsx:2425 | profile-personal-details-page | unclear | transform | 200ms | ease-out | 'group w-full flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-all duration-200 ease-out will-change-transform', |
| frontend/src/pages/profile-personal-details-page.tsx:2439 | profile-personal-details-page | unclear | transform | 150ms | unclear | 'inline-flex items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-150', |
| frontend/src/pages/profile-personal-details-page.tsx:2473 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="inline-flex w-[6.75rem] justify-center rounded-full border border-[hsl(var(--tone-neutral-300))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-700))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2482 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2530 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2553 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2710 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2737 | profile-personal-details-page | unclear | transform | 200ms | ease-out | 'group flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 transition-all duration-200 ease-out will-change-transform', |
| frontend/src/pages/profile-personal-details-page.tsx:2751 | profile-personal-details-page | unclear | transform | 150ms | unclear | 'inline-flex cursor-grab items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-150 active:cursor-grabbing', |
| frontend/src/pages/profile-personal-details-page.tsx:2768 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="rounded-full border border-[hsl(var(--tone-neutral-300))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-700))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2776 | profile-personal-details-page | hover | color/background/border | unclear | unclear | className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]" |
| frontend/src/pages/profile-personal-details-page.tsx:2802 | profile-personal-details-page | loading | unclear | unclear | unclear | {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/pages/profile-publications-page.tsx:1279 | profile-publications-page | hover | color/background/border | unclear | unclear | className={`inline-flex w-full items-center gap-1 transition-colors hover:text-foreground ${HOUSE_TABLE_SORT_TRIGGER_CLASS} ${alignClass}`} |
| frontend/src/pages/profile-publications-page.tsx:2662 | profile-publications-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/profile-publications-page.tsx:2704 | profile-publications-page | unclear | color/background/border | unclear | unclear | className={`align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass} transition-colors ${citationCellTone( |
| frontend/src/pages/qc-dashboard-page.tsx:51 | qc-dashboard-page | unclear | color/background/border | unclear | unclear | className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`} |
| frontend/src/pages/results-page.tsx:655 | results-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/results-page.tsx:708 | results-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/results-page.tsx:772 | results-page | loading | unclear | unclear | unclear | <Loader2 className="h-3.5 w-3.5 animate-spin" /> |
| frontend/src/pages/settings-page.tsx:47 | settings-page | unclear | color/background/border | unclear | unclear | 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors', |
| frontend/src/pages/settings-page.tsx:67 | settings-page | unclear | color/background/border | unclear | unclear | 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors', |
| frontend/src/pages/workspaces-data-library-view.tsx:596 | workspaces-data-library-view | loading | unclear | unclear | unclear | <RefreshCw className={cn('mr-1 h-4 w-4', isLoading && 'animate-spin')} /> |
| frontend/src/pages/workspaces-data-library-view.tsx:678 | workspaces-data-library-view | loading | unclear | unclear | unclear | <Loader2 className="h-4 w-4 animate-spin" /> |
| frontend/src/pages/workspaces-data-library-view.tsx:797 | workspaces-data-library-view | hover | color/background/border | unclear | unclear | className="w-full rounded px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-muted/70" |
| frontend/src/pages/workspaces-data-library-view.tsx:881 | workspaces-data-library-view | loading | unclear | unclear | unclear | {lookupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} |
| frontend/src/pages/workspaces-data-library-view.tsx:955 | workspaces-data-library-view | loading | unclear | unclear | unclear | {isBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} |
| frontend/src/pages/workspaces-page.tsx:1859 | workspaces-page | hover | color/background/border | unclear | unclear | className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', HOUSE_TABLE_SORT_TRIGGER_CLASS, alignClass)} |
| frontend/src/stories/_archive/components/auth/LoginCard.stories.tsx:62 | LoginCard.stories | loading | unclear | unclear | unclear | {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:13 | MotionTokens.stories | unclear | unclear | 150ms | unclear | ['--motion-duration-fast', '150ms'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:14 | MotionTokens.stories | unclear | unclear | 180ms | unclear | ['--motion-duration-ui', '180ms'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:15 | MotionTokens.stories | unclear | unclear | 220ms | unclear | ['--motion-duration-base', '220ms'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:16 | MotionTokens.stories | toggle/state-change | unclear | 540ms | unclear | ['--motion-duration-chart-toggle', '540ms'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:17 | MotionTokens.stories | unclear | unclear | 1200ms | unclear | ['--motion-duration-chart-refresh', '1200ms'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:18 | MotionTokens.stories | unclear | unclear | unclear | cubic-bezier(0.2, 0.68, 0.16, 1) | ['--motion-ease-chart-series', 'cubic-bezier(0.2, 0.68, 0.16, 1)'], |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:42 | MotionTokens.stories | load/reload | color/background/border | var(--motion-duration-base) | ease-out | <div className="animate-[wizard-fade-slide_var(--motion-duration-base)_ease-out] rounded border border-border p-2 text-caption">Page load</div> |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:43 | MotionTokens.stories | load/reload | color/background/border | var(--motion-duration-chart-refresh) | ease-out | <div className="animate-[wizard-fade-slide_var(--motion-duration-chart-refresh)_ease-out] rounded border border-border p-2 text-caption">Tile load</div> |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:49 | MotionTokens.stories | toggle/state-change | color/background/border | var(--motion-duration-chart-toggle) | ease-out | <div className="overflow-hidden rounded border border-border p-2"><div className="h-3 w-3/4 origin-left animate-[wizard-fade-slide_var(--motion-duration-chart-toggle)_ease-out] bg-[hsl(var(--tone-positive-500))]" /></div> |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:50 | MotionTokens.stories | load/reload | color/background/border | var(--motion-duration-chart-refresh) | ease-out | <div className="overflow-hidden rounded border border-border p-2"><div className="h-3 w-1/2 origin-left animate-[wizard-fade-slide_var(--motion-duration-chart-refresh)_ease-out] bg-[hsl(var(--tone-warning-500))]" /></div> |
| frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx:51 | MotionTokens.stories | toggle/state-change | color/background/border | unclear | unclear | <div className="flex items-center gap-2"><div className="h-10 w-10 rounded-full border-4 border-[hsl(var(--tone-accent-300))] border-t-[hsl(var(--tone-accent-700))] animate-spin" /><div className="text-caption">Ring refresh/toggle</div></div> |
| frontend/src/stories/design-system/primitives/Button.stories.tsx:65 | Button.stories | loading | unclear | unclear | unclear | <Loader2 className="mr-2 h-4 w-4 animate-spin" /> |
| frontend/src/stories/design-system/primitives/SkeletonLoaders.stories.tsx:8 | SkeletonLoaders.stories | unclear | unclear | unclear | unclear | export const States: Story = { render: () => <StoryFrame title="Skeleton loaders"><div className="space-y-2"><div className="h-4 w-1/3 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /><div className="h-20 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /></div></StoryFrame> } |
| frontend/tailwind.config.js:38 | tailwind.config | unclear | unclear | var(--motion-duration-ui) | unclear | ui: 'var(--motion-duration-ui)', |
| frontend/tailwind.config.js:39 | tailwind.config | unclear | unclear | var(--motion-duration-fast) | unclear | 150: 'var(--motion-duration-fast)', |
| frontend/tailwind.config.js:41 | tailwind.config | unclear | unclear | var(--motion-duration-base) | unclear | 220: 'var(--motion-duration-base)', |
| frontend/tailwind.config.js:43 | tailwind.config | unclear | unclear | var(--motion-duration-slow) | unclear | 320: 'var(--motion-duration-slow)', |
| frontend/tailwind.config.js:44 | tailwind.config | unclear | unclear | var(--motion-duration-slower) | unclear | 420: 'var(--motion-duration-slower)', |
| frontend/tailwind.config.js:45 | tailwind.config | unclear | unclear | var(--motion-duration-emphasis) | unclear | 500: 'var(--motion-duration-emphasis)', |
| frontend/tailwind.config.js:46 | tailwind.config | unclear | unclear | var(--motion-duration-long) | unclear | 700: 'var(--motion-duration-long)', |

## Design Pattern Analysis

### Colors

| source | pattern | observed | notes |
| --- | --- | --- | --- |
| frontend/src/index.css | CSS variable color-like tokens | 87 | Examples: --background, --primary, --tone-neutral-500, --status-ok, --brand-google-blue |
| frontend/tailwind.config.js | Semantic color mappings | background/foreground/card/muted/border/primary/secondary/accent/ring/focus/destructive/status-* + brand/tone scales | Mapped as hsl(var(--token) / <alpha-value>) |
| frontend/src/index.css | Theme scopes | 2 | :root and .dark define major color families |

### Spacing

| source | pattern | observed | notes |
| --- | --- | --- | --- |
| frontend/tailwind.config.js | Custom spacing tokens | 26 | sz-7=0.4375rem, sz-18=1.125rem, sz-22=1.375rem, sz-84=5.25rem, sz-86=5.375rem, sz-88=5.5rem, sz-110=6.875rem, sz-170=10.625rem, sz-180=11.25rem, sz-220=13.75rem, sz-260=16.25rem, sz-280=17.5rem ... |
| frontend/src/components + frontend/src/pages | Utility spacing usage | yes | Extensive p-*/px-*/py-*/gap-*/mt-*/w-*/h-* usage |
| frontend/src/index.css | Spacing-related CSS vars | 12 | Examples: --top-nav-rail-width, --top-nav-rail-gap, --top-nav-rail-left |

### Typography

| source | pattern | observed | notes |
| --- | --- | --- | --- |
| frontend/src/index.css | Typography variables | 11 | --font-family-base: "IBM Plex Sans",       Inter,       ui-sans-serif,       system-ui,       -apple-system,       Segoe UI,       Roboto,       Helvetica,       Arial,       sans-serif; --text-caption-size: 0.75rem; --text-caption-line: 1rem; --text-micro-size: 0.8125rem; --text-micro-line: 1.125rem; --text-label-size: 0.875rem; --text-label-line: 1.25rem; --text-body-size: 0.9375rem; --text-body-line: 1.375rem; --text-display-size: 2rem; --text-display-line: 2.25rem |
| frontend/tailwind.config.js | Font size aliases | caption, micro, tiny, label, body, display | Display includes letter spacing -0.02em |
| frontend/src/lib/house-style.ts | Semantic typography classes | houseTypography map | Includes title/h1/h2/h3/text/label/table text mappings |

### Radius

| source | pattern | observed | notes |
| --- | --- | --- | --- |
| frontend/src/index.css | Root radius token | --radius: 0.5rem | Referenced by tailwind borderRadius aliases |
| frontend/tailwind.config.js | Border radius aliases | lg/md/sm | lg=var(--radius), md=calc(var(--radius)-2px), sm=calc(var(--radius)-4px) |
| frontend/src/index.css | Unique border-radius literals | 12 | 0.375rem, 9999px, 0.42rem, 0.5rem, 0.8rem, 0.72rem 0 0 0.72rem, 0, 0.55rem !important, 0.25rem, 0.3rem, 0.625rem, 0.52rem |

### Shadows

| source | pattern | observed | notes |
| --- | --- | --- | --- |
| frontend/src/index.css | Unique box-shadow literals | 15 | none, inset 0 0 0 1px hsl(var(--stroke-strong) / 0.16), inset 0 0 0 1px hsl(var(--tone-positive-200) / 0.62), inset 0 0 0 1px hsl(var(--tone-danger-200) / 0.62), 0 0 0 2px hsl(var(--tone-accent-200) / 0.82), inset 0 0 0 1px hsl(var(--tone-positive-300) / 0.62) !important, inset 0 0 0 1px hsl(var(--tone-danger-300) / 0.62) !important, inset 0 0 0 1px hsl(var(--tone-positive-200) / 0.52), inset 0 0 0 1px hsl(var(--tone-accent-200) / 0.52), inset 0 0 0 1px hsl(var(--tone-danger-200) / 0.52), inset 0 0 0 var(--house-bold-outline-width) hsl(var(--stroke-strong) / 0.16), inset 0 0 0 1px hsl(var(--tone-accent-300) / 0.6), 0 1px 2px hsl(var(--tone-neutral-900) / 0.07), 0 8px 22px hsl(var(--tone-neutral-900) / 0.12), inset 0 0 0 1px hsl(var(--tone-positive-300) / 0.56) |
| frontend/src/**/* | Tailwind shadow utility usage | yes | shadow-sm/shadow-md/shadow-lg/shadow-none appear in component/page code |
| frontend/src/index.css | Dedicated shadow token variable family | not found | No --shadow-* or --elevation-* variable family detected |

## Drift Issues

| issue type | affected files | severity | example |
| --- | --- | --- | --- |
| Undefined motion token references in Storybook | frontend/src/stories/design-system/foundations/MotionTokens.stories.tsx | High | --motion-duration-chart-toggle / --motion-duration-chart-refresh / --motion-ease-chart-series referenced |
| Hardcoded duration values mixed with token vars | multiple motion-bearing files | Medium | 150ms, 180ms, 220ms, 250ms, 320ms, 420ms, 500ms, 700ms, 140ms, 0ms, 200ms, 300ms, 540ms, 1200ms |
| transition-all usage | frontend/src/pages/manuscript-page.tsx, frontend/src/components/publications/PublicationsTopStrip.tsx, frontend/src/components/study-core/Step2Panel.tsx, frontend/src/components/study-core/Step1Panel.tsx, frontend/src/pages/profile-personal-details-page.tsx | Medium | transition-all present in components/pages |
| Multiple easing families | multiple motion-bearing files | Medium | ease-out, cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.2, 0.68, 0.16, 1), ease-in-out |
| Framer Motion usage | frontend/src/**/* | Low | not found |
| Mixed chart/drilldown motion coverage | frontend/src/components/publications/PublicationsTopStrip.tsx, frontend/src/components/publications/PublicationMetricDrilldownPanel.tsx | Low | TopStrip has many motion hooks; DrilldownPanel explicit transitions unclear/limited |

Notes: Entries are factual from static scan results. Where direct intent/value inference was not possible, `unclear` is used.

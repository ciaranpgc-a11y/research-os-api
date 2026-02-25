import { houseChartColors, houseDividers, houseDrilldown, houseMotion, houseSurfaces, houseTypography } from '@/lib/house-style'

export const publicationsHouseHeadings = {
  title: houseTypography.title,
  sectionTitle: houseTypography.sectionTitle,
  h1: houseTypography.h1,
  h1Soft: houseTypography.h1Soft,
  h2: houseTypography.h2,
  h3: houseTypography.h3,
  label: houseTypography.label,
  text: houseTypography.text,
  textSoft: houseTypography.textSoft,
} as const

export const publicationsHouseSurfaces = {
  topPanel: houseSurfaces.topPanel,
  sectionPanel: houseSurfaces.sectionPanel,
  softPanel: houseSurfaces.softPanel,
  card: houseSurfaces.card,
  panelBare: houseSurfaces.panelBare,
  banner: houseSurfaces.banner,
  bannerInfo: houseSurfaces.bannerInfo,
  bannerSuccess: houseSurfaces.bannerSuccess,
  bannerWarning: houseSurfaces.bannerWarning,
  bannerDanger: houseSurfaces.bannerDanger,
  bannerPublications: houseSurfaces.bannerPublications,
  metricPill: houseSurfaces.metricPill,
  metricPillPublications: houseSurfaces.metricPillPublications,
  leftBorder: houseSurfaces.leftBorder,
  leftBorderPublications: houseSurfaces.leftBorderPublications,
  tableShell: houseSurfaces.tableShell,
  tableHead: houseSurfaces.tableHead,
  tableRow: houseSurfaces.tableRow,
} as const

export const publicationsHouseDividers = {
  borderSoft: houseDividers.borderSoft,
  fillSoft: houseDividers.fillSoft,
  strong: houseDividers.strong,
} as const

export const publicationsHouseMotion = {
  chartPanel: houseMotion.chartPanel,
  chartEnter: houseMotion.chartEnter,
  chartExit: houseMotion.chartExit,
  toggleTrack: houseMotion.toggleTrack,
  toggleThumb: houseMotion.toggleThumb,
  toggleButton: houseMotion.toggleButton,
  toggleChartBar: houseMotion.toggleChartBar,
  toggleChartSwap: houseMotion.toggleChartSwap,
  toggleChartLabel: houseMotion.toggleChartLabel,
  labelTransition: houseMotion.labelTransition,
} as const

export const publicationsHouseCharts = {
  barAccent: houseChartColors.accentBar,
  barPositive: houseChartColors.positiveBar,
  barWarning: houseChartColors.warningBar,
  barNeutral: houseChartColors.neutralBar,
  barCurrent: houseChartColors.currentBar,
  gridLine: houseChartColors.gridLine,
  gridDashed: houseChartColors.gridLineDashed,
  axisText: houseChartColors.axisText,
  axisSubtext: houseChartColors.axisSubtext,
  axisWindowSubtext: houseChartColors.axisWindowSubtext,
} as const

export const publicationsHouseActions = {
  sectionTools: 'house-section-tools',
  sectionToolsPublications: 'house-section-tools-publications',
  sectionToolButton: 'house-section-tool-button',
  sectionToolDivider: 'house-section-tool-divider',
} as const

export const publicationsHouseDetail = {
  panel: 'house-publication-detail-panel',
  scroll: 'house-publication-detail-scroll',
  header: 'house-publication-detail-header',
  title: 'house-publication-detail-title',
  tabs: 'house-publication-detail-tabs',
  tab: 'house-publication-detail-tab',
  body: 'house-publication-detail-body',
  section: 'house-publication-detail-section',
  sectionLabel: 'house-publication-detail-label',
  info: 'house-publication-detail-info',
} as const

export const publicationsHouseDrilldown = {
  sheet: houseDrilldown.sheet,
  tabTrigger: houseDrilldown.tabTrigger,
  placeholder: houseDrilldown.placeholder,
  alert: houseDrilldown.alert,
  microValue: houseDrilldown.microValue,
  hint: houseDrilldown.hint,
  caption: houseDrilldown.caption,
  chip: houseDrilldown.chip,
  chipActive: houseDrilldown.chipActive,
  action: houseDrilldown.action,
  row: houseDrilldown.row,
  rowActive: houseDrilldown.rowActive,
  progressTrack: houseDrilldown.progressTrack,
  progressFill: houseDrilldown.progressFill,
  statCard: houseDrilldown.statCard,
  statTitle: houseDrilldown.statTitle,
  statValue: houseDrilldown.statValue,
  axis: houseDrilldown.axis,
  range: houseDrilldown.range,
  badge: houseDrilldown.badge,
  badgePositive: houseDrilldown.badgePositive,
  badgeWarning: houseDrilldown.badgeWarning,
  badgeNeutral: houseDrilldown.badgeNeutral,
  note: houseDrilldown.note,
  noteSoft: houseDrilldown.noteSoft,
  dividerTop: houseDrilldown.dividerTop,
  chartGridSvg: houseDrilldown.chartGridSvg,
  chartAreaSvg: houseDrilldown.chartAreaSvg,
  chartMovingSvg: houseDrilldown.chartMovingSvg,
  chartMainSvg: houseDrilldown.chartMainSvg,
  barSelected: houseDrilldown.barSelected,
  barSelectedOutline: houseDrilldown.barSelectedOutline,
  tableRow: houseDrilldown.tableRow,
  tableEmpty: houseDrilldown.tableEmpty,
  toggleButtonMuted: houseDrilldown.toggleButtonMuted,
} as const

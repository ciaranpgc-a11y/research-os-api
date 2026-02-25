import { houseChartColors, houseMotion, houseSurfaces, houseTypography } from '@/lib/house-style'

export const publicationsHouseHeadings = {
  title: houseTypography.title,
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
  leftBorder: houseSurfaces.leftBorder,
  tableShell: houseSurfaces.tableShell,
  tableHead: houseSurfaces.tableHead,
  tableRow: houseSurfaces.tableRow,
} as const

export const publicationsHouseMotion = {
  chartPanel: houseMotion.chartPanel,
  chartEnter: houseMotion.chartEnter,
  chartExit: houseMotion.chartExit,
  toggleTrack: houseMotion.toggleTrack,
  toggleThumb: houseMotion.toggleThumb,
  toggleButton: houseMotion.toggleButton,
  toggleChartBar: houseMotion.toggleChartBar,
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
} as const

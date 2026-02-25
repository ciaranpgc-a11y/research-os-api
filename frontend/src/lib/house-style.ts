export const houseTypography = {
  // Page title level.
  title: 'house-title',
  subtitle: 'house-subtitle',
  sectionTitle: 'house-section-title',
  sectionSubtitle: 'house-section-subtitle',

  // Primary heading level for section blocks.
  h1: 'house-h1',
  h1Soft: 'house-h1-soft',

  // Tile heading and compact heading levels.
  h2: 'house-h2',
  h3: 'house-h3',

  // Standard text styles.
  text: 'house-text',
  textSoft: 'house-text-soft',
  label: 'house-label',
  fieldLabel: 'house-field-label',
  fieldLabelInline: 'house-field-label-inline',
  fieldHelper: 'house-field-helper',
  buttonText: 'house-button-text',

  // Shared table text styles.
  tableHead: 'house-table-head-text',
  tableCell: 'house-table-cell-text',
} as const

export const houseSurfaces = {
  topPanel: 'house-panel-top',
  sectionPanel: 'house-panel-section',
  softPanel: 'house-panel-soft',
  card: 'house-panel-card',
  leftBorder: 'house-left-border',
  tableShell: 'house-table-shell',
  tableHead: 'house-table-head',
  tableRow: 'house-table-row',
} as const

export const houseLayout = {
  pageHeader: 'house-page-header',
  sidebar: 'house-sidebar-shell',
  sidebarHeader: 'house-sidebar-header',
  sidebarSection: 'house-sidebar-section',
} as const

export const houseNavigation = {
  sectionLabel: 'house-nav-section-label',
  item: 'house-nav-item',
  itemActive: 'house-nav-item-active',
  itemMeta: 'house-nav-item-meta',
  itemCount: 'house-nav-item-count',
} as const

export const houseMotion = {
  chartPanel: 'house-chart-frame',
  chartEnter: 'house-motion-enter',
  chartExit: 'house-motion-exit',
  toggleTrack: 'house-toggle-track',
  toggleThumb: 'house-toggle-thumb',
  toggleButton: 'house-toggle-button',
  toggleChartBar: 'house-toggle-chart-bar',
  toggleChartLabel: 'house-toggle-chart-label',
  labelTransition: 'house-label-transition',
} as const

export const houseForms = {
  input: 'house-input',
  select: 'house-select',
  textarea: 'house-textarea',
  actionButton: 'house-button-action',
  actionButtonPrimary: 'house-button-action-primary',
  actionButtonGhost: 'house-button-action-ghost',
} as const

export const houseChartColors = {
  accentBar: 'house-chart-bar-accent',
  positiveBar: 'house-chart-bar-positive',
  warningBar: 'house-chart-bar-warning',
  neutralBar: 'house-chart-bar-neutral',
  currentBar: 'house-chart-bar-current',
  gridLine: 'house-chart-grid',
  gridLineDashed: 'house-chart-grid-dashed',
  axisText: 'house-chart-axis-text',
} as const

// Semantic map for element-level styling so pages can reference a single contract.
export const houseElements = {
  pageTitle: houseTypography.title,
  pageSubtitle: houseTypography.subtitle,
  sectionTitle: houseTypography.sectionTitle,
  sectionSubtitle: houseTypography.sectionSubtitle,
  metricTitle: houseTypography.h1,
  metricLabel: houseTypography.label,
  formLabel: houseTypography.fieldLabel,
  formLabelInline: houseTypography.fieldLabelInline,
  formHelper: houseTypography.fieldHelper,
  bodyText: houseTypography.text,
  bodyTextSoft: houseTypography.textSoft,
  buttonText: houseTypography.buttonText,
  formInput: houseForms.input,
  formSelect: houseForms.select,
  formTextarea: houseForms.textarea,
  actionButton: houseForms.actionButton,
  actionButtonPrimary: houseForms.actionButtonPrimary,
  actionButtonGhost: houseForms.actionButtonGhost,
  topPanel: houseSurfaces.topPanel,
  sectionPanel: houseSurfaces.sectionPanel,
  softPanel: houseSurfaces.softPanel,
  card: houseSurfaces.card,
  leftBorder: houseSurfaces.leftBorder,
  pageHeader: houseLayout.pageHeader,
  sidebar: houseLayout.sidebar,
  sidebarHeader: houseLayout.sidebarHeader,
  sidebarSection: houseLayout.sidebarSection,
  navSectionLabel: houseNavigation.sectionLabel,
  navItem: houseNavigation.item,
  navItemActive: houseNavigation.itemActive,
  navItemMeta: houseNavigation.itemMeta,
  navItemCount: houseNavigation.itemCount,
  tableShell: houseSurfaces.tableShell,
  tableHead: houseSurfaces.tableHead,
  tableRow: houseSurfaces.tableRow,
  chartPanel: houseMotion.chartPanel,
  toggleChartBar: houseMotion.toggleChartBar,
  toggleChartLabel: houseMotion.toggleChartLabel,
  chartGrid: houseChartColors.gridLine,
  chartGridDashed: houseChartColors.gridLineDashed,
  chartAxisText: houseChartColors.axisText,
} as const

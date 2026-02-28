import { houseMotion, houseTypography } from '@/lib/house-style'

export const dashboardTileStyles = {
  tileShell:
    'group/tile house-metric-tile-shell flex h-full min-h-32 cursor-pointer flex-col rounded-md border p-3 text-left',
  tileShellSelected: 'house-metric-tile-shell-selected',
  tileShellUnstable: 'bg-[hsl(var(--tone-warning-50)/0.44)]',
  tileHeader: 'flex items-start justify-between gap-1.5',
  tileTitle: houseTypography.metricTileTitle,
  tileInfoButton:
    'inline-flex h-5 w-5 items-center justify-center rounded-sm text-[hsl(var(--tone-neutral-500))] transition-[background-color,color] duration-220 ease-out hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))]',
  tileMetric: houseTypography.metricTileValue,
  tileSecondary: `mt-0.5 min-h-4 ${houseTypography.text}`,
  tileVisualWrap:
    'house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1',
  tileFooter: 'mt-1.5 flex min-h-5 items-center justify-between gap-1.5 pt-1',
  tileFooterText: houseTypography.textSoft,
  tileMicroLabel: houseTypography.textSoft,
  tagPill: 'inline-flex h-5 items-center rounded-full px-2 text-micro font-semibold',
  tagPositive: 'bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]',
  tagCaution: 'bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-700))]',
  tagNegative: 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]',
  tagNeutral: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]',
  chartSplit: 'flex h-full items-start gap-2',
  chartColumn: 'flex min-w-0 flex-1 flex-col justify-between gap-1',
  chartPanel: 'w-[50%] min-w-sz-132 self-stretch',
  rightChartSurface:
    `house-metric-tile-chart-surface relative flex h-14 items-end gap-0.5 overflow-visible rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1 ${houseMotion.labelTransition}`,
  barWrapper: 'flex w-full flex-col items-center gap-0.5',
  barTrigger:
    'group/bar relative flex h-14 w-full cursor-pointer items-end px-0.5 pt-2',
  barFocusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]',
  barShape:
    `w-full origin-bottom rounded-sm ${houseMotion.labelTransition} group-hover/tile:scale-[1.03]`,
  valuePill:
    'pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--tone-neutral-50))] px-1 py-px text-caption font-normal leading-none text-[hsl(var(--tone-neutral-700))]',
  emptyChart:
    `flex h-full min-h-[7.8rem] items-center justify-center rounded-sm border border-dashed border-[hsl(var(--stroke-strong)/0.86)] bg-transparent ${houseTypography.textSoft}`,
} as const

export const dashboardTileBarTabIndex = 0


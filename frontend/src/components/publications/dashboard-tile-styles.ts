export const dashboardTileStyles = {
  tileShell:
    'group/tile flex min-h-32 cursor-pointer flex-col rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2 text-left transition-all duration-200 hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))]',
  tileShellUnstable: 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))]',
  tileHeader: 'flex items-start justify-between gap-1.5',
  tileTitle: 'text-[0.58rem] font-medium uppercase leading-[0.72rem] tracking-[0.035em] text-[hsl(var(--tone-neutral-800))]',
  tileInfoButton:
    'inline-flex h-5 w-5 items-center justify-center rounded-sm border border-transparent text-[hsl(var(--tone-neutral-500))] transition-colors hover:border-[hsl(var(--tone-accent-200))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))]',
  tileMetric: 'mt-1 text-[1.9rem] font-semibold leading-none tracking-tight text-foreground',
  tileSecondary: 'mt-0.5 min-h-4 text-[0.73rem] font-medium leading-4 text-[hsl(var(--tone-neutral-600))]',
  tileVisualWrap:
    'mt-1.5 flex min-h-14 flex-1 rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] p-1.5',
  tileFooter: 'mt-1.5 flex min-h-5 items-center justify-between gap-1.5 border-t border-[hsl(var(--tone-neutral-200))] pt-1',
  tileFooterText: 'text-caption font-medium text-[hsl(var(--tone-neutral-600))]',
  tileMicroLabel: 'text-micro font-medium text-[hsl(var(--tone-neutral-600))]',
  tagPill: 'inline-flex h-5 items-center rounded-full border px-2 text-micro font-semibold',
  tagPositive: 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]',
  tagCaution: 'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-700))]',
  tagNegative: 'border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]',
  tagNeutral: 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-700))]',
  chartSplit: 'flex h-full items-start gap-2',
  chartColumn: 'flex min-w-0 flex-1 flex-col justify-between gap-1',
  chartPanel: 'w-[50%] min-w-sz-132 self-stretch',
  rightChartSurface:
    'relative flex h-14 items-end gap-0.5 overflow-visible rounded-md border border-[hsl(var(--tone-accent-200))] bg-background p-1',
  barWrapper: 'flex w-full flex-col items-center gap-0.5',
  barTrigger:
    'group/bar relative flex h-14 w-full cursor-pointer items-end px-0.5 pt-2',
  barFocusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]',
  barShape:
    'w-full origin-bottom rounded-sm transition-transform duration-150 group-hover/tile:scale-[1.03]',
  valuePill:
    'pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-1 py-px text-[0.52rem] font-normal leading-none text-[hsl(var(--tone-neutral-700))]',
  emptyChart:
    'flex h-14 items-center justify-center rounded-md border border-dashed border-[hsl(var(--tone-accent-200))] bg-background text-micro text-[hsl(var(--tone-neutral-500))]',
} as const

export const dashboardTileBarTabIndex = 0


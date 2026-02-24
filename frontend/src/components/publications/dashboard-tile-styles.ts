export const dashboardTileStyles = {
  tileShell:
    'group/tile flex h-full min-h-sz-220 cursor-pointer flex-col rounded-lg border border-border bg-background p-4 text-left transition-colors duration-150 hover:bg-muted/20',
  tileShellUnstable: 'border-amber-300/70 bg-amber-50/40',
  tileHeader: 'flex min-h-8 items-start justify-between gap-2',
  tileTitle: 'text-sm font-semibold leading-5 text-foreground',
  tileInfoButton:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
  tileMetric: 'mt-2 text-display font-semibold leading-none tracking-tight text-foreground',
  tileSecondary: 'mt-1 min-h-10 text-label font-normal leading-5 text-muted-foreground',
  tileVisualWrap: 'mt-3 rounded-md border border-border/70 bg-muted/15 p-2',
  tileFooter: 'mt-auto flex min-h-6 items-center justify-between gap-2 pt-3',
  tileFooterText: 'text-sm font-normal leading-5 text-muted-foreground',
  tileMicroLabel: 'text-micro font-normal leading-5 text-muted-foreground',
  tagPill: 'inline-flex h-5 items-center rounded-full border px-2 text-caption font-semibold',
  tagPositive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  tagCaution: 'bg-amber-50 text-amber-700 border-amber-200',
  tagNegative: 'bg-red-50 text-red-700 border-red-200',
  tagNeutral: 'bg-slate-100 text-slate-700 border-slate-200',
  chartSplit: 'grid grid-cols-[minmax(0,1fr)_minmax(10rem,44%)] items-start gap-2',
  chartColumn: 'min-w-0 space-y-1',
  chartPanel: 'min-w-0',
  rightChartSurface:
    'flex h-24 items-end gap-1.5 overflow-visible rounded-md border border-border/70 bg-muted/20 p-2',
  barWrapper: 'flex w-full flex-col items-center gap-1',
  barTrigger:
    'group/bar relative flex h-sz-88 w-full cursor-pointer items-end px-0.5 pt-5',
  barFocusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
  barShape:
    'w-full rounded-md origin-bottom transition-transform duration-150 group-hover/tile:scale-[1.03]',
  valuePill:
    'pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-1.5 py-0.5 text-micro font-medium text-popover-foreground shadow-sm',
  emptyChart:
    'flex h-24 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-micro text-muted-foreground',
} as const

export const dashboardTileBarTabIndex = 0

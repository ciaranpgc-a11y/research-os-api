export const dashboardTileStyles = {
  tileShell:
    'group/tile cursor-pointer rounded-lg border border-border bg-background p-6 text-left transition-all duration-200 hover:bg-muted/20 hover:shadow-sm',
  tileShellUnstable: 'border-amber-300/70 bg-amber-50/40',
  tileHeader: 'flex items-start justify-between gap-3',
  tileTitle: 'text-[15px] font-medium leading-tight text-foreground',
  tileInfoButton:
    'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60',
  tileMetric: 'mt-3 text-[32px] font-bold leading-none tracking-tight text-foreground',
  tileSecondary: 'mt-2 min-h-[20px] text-[13px] font-normal leading-5 text-muted-foreground',
  tileVisualWrap: 'mt-4 rounded-md border border-border/70 bg-muted/20 p-2',
  tileFooter: 'mt-3 flex min-h-[20px] items-center justify-between gap-2',
  tileFooterText: 'text-[12px] font-normal text-muted-foreground',
  tileMicroLabel: 'text-[11px] font-normal text-muted-foreground',
  tagPill: 'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold',
  tagPositive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  tagCaution: 'bg-amber-50 text-amber-700 border-amber-200',
  tagNegative: 'bg-red-50 text-red-700 border-red-200',
  tagNeutral: 'bg-slate-100 text-slate-700 border-slate-200',
  chartSplit: 'flex items-start gap-3',
  chartColumn: 'min-w-0 flex-1',
  chartPanel: 'w-[52%] min-w-[170px]',
  rightChartSurface:
    'flex h-24 items-end gap-1 overflow-visible rounded-md border border-border/70 bg-muted/20 p-2',
  barWrapper: 'flex w-full flex-col items-center gap-1',
  barTrigger:
    'group/bar relative flex h-[88px] w-full cursor-pointer items-end px-0.5 pt-5',
  barFocusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
  barShape:
    'w-full rounded-[6px] transition-transform duration-150 origin-bottom group-hover/tile:scale-[1.03]',
  valuePill:
    'pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-1.5 py-0.5 text-[11px] font-medium text-popover-foreground shadow-sm',
  emptyChart:
    'flex h-24 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-[11px] text-muted-foreground',
} as const

export const dashboardTileBarTabIndex = 0

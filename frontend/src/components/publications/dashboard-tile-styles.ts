export const dashboardTileStyles = {
  container: 'mt-1.5 flex items-start gap-3',
  leftColumn: 'min-w-0 flex-1',
  leftTitle: 'text-xs text-muted-foreground',
  leftPrimary: 'text-2xl font-semibold leading-tight',
  leftSecondary: 'mt-0.5 min-h-[16px] text-xs text-muted-foreground',
  rightChartColumn: 'w-[52%] min-w-[170px]',
  rightChartSurface: 'flex h-24 items-end gap-1 overflow-visible rounded border border-border/70 bg-muted/20 px-1.5 py-1',
  barWrapper: 'flex w-full flex-col items-center gap-1',
  barTrigger: 'group relative flex h-[88px] w-full cursor-pointer items-end px-0.5 pt-5',
  barFocusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70',
  valuePill: 'pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm',
  emptyChart: 'flex h-24 items-center justify-center rounded border border-dashed border-border/70 bg-muted/20 text-[10px] text-muted-foreground',
} as const

export const dashboardTileBarTabIndex = 0

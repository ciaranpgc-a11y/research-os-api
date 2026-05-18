export const REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME =
  'mb-4 flex w-full flex-nowrap items-center gap-2 border-b border-border/50 pb-4'

export const REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME =
  'flex h-[52px] min-w-[104px] shrink-0 flex-col items-center justify-center rounded-[14px] border border-border/70 bg-[hsl(var(--tone-neutral-50))] px-3 py-1.5 text-center'

const TISSUE_INDICATOR_BASE_CLASSNAME =
  'flex h-[52px] min-w-[80px] shrink-0 items-center justify-center rounded-[14px] border px-3 py-1.5 text-center text-xs'

export function getReportOutputTissueIndicatorClassName(present: boolean): string {
  return present
    ? `${TISSUE_INDICATOR_BASE_CLASSNAME} border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]`
    : `${TISSUE_INDICATOR_BASE_CLASSNAME} border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]`
}

export const REPORT_OUTPUT_ACTIONS_CLASSNAME =
  'ml-auto flex shrink-0 items-center justify-end gap-1.5 pl-2'

export const REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME =
  'h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm'

export const REPORT_OUTPUT_REFINE_BUTTON_LABEL = 'Refine'

export const REPORT_OUTPUT_UPDATE_VALUES_BUTTON_LABEL = 'Update values'

export const REPORT_OUTPUT_UNDO_REGENERATE_BUTTON_LABEL = 'Undo'

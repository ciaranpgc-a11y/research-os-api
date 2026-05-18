import { describe, expect, it } from 'vitest'

import {
  REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME,
  REPORT_OUTPUT_ACTIONS_CLASSNAME,
  REPORT_OUTPUT_REFINE_BUTTON_LABEL,
  REPORT_OUTPUT_UPDATE_VALUES_BUTTON_LABEL,
  REPORT_OUTPUT_UNDO_REGENERATE_BUTTON_LABEL,
  REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME,
  REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME,
  getReportOutputTissueIndicatorClassName,
} from '@/lib/cmr-report-output-layout'

describe('CMR report output layout', () => {
  it('keeps the protocol indicators and report actions on one horizontal row', () => {
    expect(REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME).toContain('flex-nowrap')
    expect(REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME).not.toContain('flex-wrap')
    expect(REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME).not.toContain('overflow-x-auto')
    expect(REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME).not.toContain('scrollbar')
    expect(REPORT_OUTPUT_ACTIONS_CLASSNAME).toContain('ml-auto')
    expect(REPORT_OUTPUT_ACTIONS_CLASSNAME).toContain('shrink-0')
    expect(REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME).toContain('whitespace-nowrap')
    expect(REPORT_OUTPUT_REFINE_BUTTON_LABEL).toBe('Refine')
    expect(REPORT_OUTPUT_UPDATE_VALUES_BUTTON_LABEL).toBe('Update values')
    expect(REPORT_OUTPUT_UNDO_REGENERATE_BUTTON_LABEL).toBe('Undo')
  })

  it('uses compact fixed indicator dimensions so the row fits at report widths', () => {
    expect(REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME).toContain('h-[52px]')
    expect(REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME).toContain('min-w-[104px]')
    expect(REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME).toContain('shrink-0')
    expect(getReportOutputTissueIndicatorClassName(true)).toContain('h-[52px]')
    expect(getReportOutputTissueIndicatorClassName(true)).toContain('min-w-[80px]')
    expect(getReportOutputTissueIndicatorClassName(false)).toContain('min-w-[80px]')
  })
})

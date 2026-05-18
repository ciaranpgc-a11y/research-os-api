const FLOW_LABEL_WIDTH = 22
const FLOW_GAP_WIDTH = 11
const FLOW_AORTA_WIDTH = 11
const FLOW_PULMONARY_WIDTH = 18

type ReportFlowLineInput = {
  fourDFlow?: boolean | null
  aorticForward?: number | null
  aorticBackward?: number | null
  aorticRegurgitantFraction?: number | null
  pulmonaryForward?: number | null
  pulmonaryBackward?: number | null
  pulmonaryRegurgitantFraction?: number | null
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text
  return `${text}${' '.repeat(width - text.length)}`
}

function hasValue(value: number | null | undefined): value is number {
  return value != null && !Number.isNaN(value)
}

function formatFlowVolume(value: number | null | undefined): string {
  return hasValue(value) ? `${value.toFixed(0)} mL` : '--'
}

function formatFlowPercent(value: number | null | undefined): string {
  return hasValue(value) ? `${value.toFixed(0)}%` : '--'
}

function buildFlowLine(label: string, aorta: string, pulmonary?: string): string {
  const aorticColumn = `${padRight(label, FLOW_LABEL_WIDTH)}${padRight('', FLOW_GAP_WIDTH)}${padRight(aorta, FLOW_AORTA_WIDTH)}`
  if (pulmonary === undefined) {
    return aorticColumn
  }
  return `${aorticColumn}${padRight(pulmonary, FLOW_PULMONARY_WIDTH)}`
}

export function buildReportFlowLines({
  fourDFlow,
  aorticForward,
  aorticBackward,
  aorticRegurgitantFraction,
  pulmonaryForward,
  pulmonaryBackward,
  pulmonaryRegurgitantFraction,
}: ReportFlowLineInput): string[] {
  const hasAorticFlow = [
    aorticForward,
    aorticBackward,
    aorticRegurgitantFraction,
  ].some(hasValue)
  const hasPulmonaryFlow = [
    pulmonaryForward,
    pulmonaryBackward,
    pulmonaryRegurgitantFraction,
  ].some(hasValue)

  if (!hasAorticFlow && !hasPulmonaryFlow) {
    return []
  }

  if (!hasPulmonaryFlow) {
    return [
      buildFlowLine(`Flow (${fourDFlow ? '2D-PC + 4D-flow' : '2D-PC'})`, 'Aorta'),
      buildFlowLine('Forward flow', formatFlowVolume(aorticForward)),
      buildFlowLine('Backward flow', formatFlowVolume(hasValue(aorticBackward) ? Math.abs(aorticBackward) : null)),
      buildFlowLine('Regurgitant fraction', formatFlowPercent(aorticRegurgitantFraction)),
    ]
  }

  return [
    buildFlowLine(`Flow (${fourDFlow ? '2D-PC + 4D-flow' : '2D-PC'})`, 'Aorta', 'Pulmonary'),
    buildFlowLine('Forward flow', formatFlowVolume(aorticForward), formatFlowVolume(pulmonaryForward)),
    buildFlowLine(
      'Backward flow',
      formatFlowVolume(hasValue(aorticBackward) ? Math.abs(aorticBackward) : null),
      formatFlowVolume(hasValue(pulmonaryBackward) ? Math.abs(pulmonaryBackward) : null),
    ),
    buildFlowLine(
      'Regurgitant fraction',
      formatFlowPercent(aorticRegurgitantFraction),
      formatFlowPercent(pulmonaryRegurgitantFraction),
    ),
  ]
}

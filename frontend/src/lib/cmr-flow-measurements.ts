import type { CmrCanonicalParam } from '@/lib/cmr-api'

export function getFirstMeasurement(
  measurements: Map<string, number>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = measurements.get(key)
    if (value !== undefined) return value
  }
  return undefined
}

export function setCanonicalMeasurementAlias(
  measurements: Map<string, number>,
  canonicalKey: string,
  aliases: readonly string[],
): void {
  if (measurements.has(canonicalKey)) return
  const value = getFirstMeasurement(measurements, aliases)
  if (value !== undefined) {
    measurements.set(canonicalKey, value)
  }
}

export function normalizeValveMeasurementMap(
  source: Map<string, number>,
): Map<string, number> {
  const next = new Map(source)

  setCanonicalMeasurementAlias(next, 'LV SV', ['LV stroke volume', 'LV stroke volume (per beat)'])
  setCanonicalMeasurementAlias(next, 'RV SV', ['RV stroke volume', 'RV stroke volume (per beat)'])
  setCanonicalMeasurementAlias(next, 'AV forward flow (per heartbeat)', ['AV forward flow', 'Estimated AV forward flow', 'Aortic forward flow', 'Estimated Aortic forward flow', 'AV forward flow/beat'])
  setCanonicalMeasurementAlias(next, 'AV forward flow (per minute)', ['Aortic forward flow (per minute)', 'Estimated Aortic forward flow (per minute)', 'AV forward flow/min', 'Estimated AV forward flow/min', 'Aortic forward flow/min'])
  setCanonicalMeasurementAlias(next, 'AV effective forward flow (per heartbeat)', ['AV effective forward flow', 'Estimated AV effective forward flow', 'Aortic effective forward flow', 'Estimated Aortic effective forward flow', 'AV effective forward flow/beat'])
  setCanonicalMeasurementAlias(next, 'AV effective forward flow (per minute)', ['Aortic effective forward flow (per minute)', 'Estimated Aortic effective forward flow (per minute)', 'AV effective forward flow/min', 'Estimated AV effective forward flow/min', 'Aortic effective forward flow/min'])
  setCanonicalMeasurementAlias(next, 'AV backward flow (per heartbeat)', ['AV backward flow', 'Estimated AV backward flow', 'Aortic backward flow', 'Estimated Aortic backward flow', 'AV backward flow/beat'])
  setCanonicalMeasurementAlias(next, 'AV backward flow (per minute)', ['Aortic backward flow (per minute)', 'Estimated Aortic backward flow (per minute)', 'AV backward flow/min', 'Estimated AV backward flow/min', 'Aortic backward flow/min'])
  setCanonicalMeasurementAlias(next, 'PV forward flow (per heartbeat)', ['PV forward flow', 'Estimated PV forward flow', 'Pulmonary forward flow', 'Estimated Pulmonary forward flow', 'PV forward flow/beat'])
  setCanonicalMeasurementAlias(next, 'PV forward flow (per minute)', ['Pulmonary forward flow (per minute)', 'Estimated Pulmonary forward flow (per minute)', 'PV forward flow/min', 'Estimated PV forward flow/min', 'Pulmonary forward flow/min'])
  setCanonicalMeasurementAlias(next, 'PV effective forward flow (per heartbeat)', ['PV effective forward flow', 'Estimated PV effective forward flow', 'Pulmonary effective forward flow', 'Estimated Pulmonary effective forward flow', 'PV effective forward flow/beat'])
  setCanonicalMeasurementAlias(next, 'PV effective forward flow (per minute)', ['Pulmonary effective forward flow (per minute)', 'Estimated Pulmonary effective forward flow (per minute)', 'PV effective forward flow/min', 'Estimated PV effective forward flow/min', 'Pulmonary effective forward flow/min'])
  setCanonicalMeasurementAlias(next, 'PV backward flow (per heartbeat)', ['PV backward flow', 'Estimated PV backward flow', 'Pulmonary backward flow', 'Estimated Pulmonary backward flow', 'PV backward flow/beat'])
  setCanonicalMeasurementAlias(next, 'PV backward flow (per minute)', ['Pulmonary backward flow (per minute)', 'Estimated Pulmonary backward flow (per minute)', 'PV backward flow/min', 'Estimated PV backward flow/min', 'Pulmonary backward flow/min'])

  return next
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function getIndexedBaseMeasurementKey(parameterKey: string): string | null {
  if (parameterKey === 'LV CI') return 'LV CO'
  if (parameterKey === 'RV CI') return 'RV CO'
  if (!parameterKey.endsWith('(i)')) return null
  return parameterKey.replace(/\s*\(i\)\s*$/, '')
}

export function populateIndexedMeasurements(
  measurements: Map<string, number>,
  referenceParams: readonly Pick<CmrCanonicalParam, 'parameter_key' | 'indexing' | 'decimal_places'>[],
  bsa: number | null | undefined,
): Map<string, number> {
  if (bsa == null || !Number.isFinite(bsa) || bsa <= 0) return measurements

  for (const param of referenceParams) {
    if (param.indexing !== 'BSA' || measurements.has(param.parameter_key)) continue
    const baseKey = getIndexedBaseMeasurementKey(param.parameter_key)
    if (!baseKey) continue
    const baseValue = measurements.get(baseKey)
    if (baseValue === undefined) continue
    measurements.set(param.parameter_key, round(baseValue / bsa, param.decimal_places ?? 1))
  }

  return measurements
}

export function getMeasurementWithRateFallback({
  measurements,
  perBeatKeys,
  perMinuteKeys,
  heartRate,
}: {
  measurements: Map<string, number>
  perBeatKeys: readonly string[]
  perMinuteKeys?: readonly string[]
  heartRate?: number | null
}): number | undefined {
  const perBeatValue = getFirstMeasurement(measurements, perBeatKeys)
  if (perBeatValue !== undefined) return perBeatValue
  if (heartRate == null || !Number.isFinite(heartRate) || heartRate <= 0 || !perMinuteKeys?.length) return undefined
  const perMinuteValue = getFirstMeasurement(measurements, perMinuteKeys)
  return perMinuteValue !== undefined ? (perMinuteValue * 1000) / heartRate : undefined
}

type ValveFlowCalculationArgs = {
  measurements: Map<string, number>
  effectiveBeatKeys?: readonly string[]
  effectiveMinuteKeys?: readonly string[]
  fractionKeys?: readonly string[]
  forwardBeatKeys: readonly string[]
  forwardMinuteKeys?: readonly string[]
  backwardBeatKeys?: readonly string[]
  backwardMinuteKeys?: readonly string[]
  heartRate?: number | null
}

export type ValveFlowCalculation = {
  effectiveForwardFlow?: number
  regurgitantFraction?: number
}

export function getValveFlowCalculation({
  measurements,
  effectiveBeatKeys,
  effectiveMinuteKeys,
  fractionKeys,
  forwardBeatKeys,
  forwardMinuteKeys,
  backwardBeatKeys,
  backwardMinuteKeys,
  heartRate,
}: ValveFlowCalculationArgs): ValveFlowCalculation {
  const forwardValue = getMeasurementWithRateFallback({
    measurements,
    perBeatKeys: forwardBeatKeys,
    perMinuteKeys: forwardMinuteKeys,
    heartRate,
  })

  const effectiveValue = effectiveBeatKeys?.length
    ? getMeasurementWithRateFallback({
      measurements,
      perBeatKeys: effectiveBeatKeys,
      perMinuteKeys: effectiveMinuteKeys,
      heartRate,
    })
    : undefined

  if (forwardValue === undefined || forwardValue <= 0) {
    return effectiveValue !== undefined ? { effectiveForwardFlow: effectiveValue } : {}
  }

  const backwardValue = backwardBeatKeys?.length
    ? getMeasurementWithRateFallback({
      measurements,
      perBeatKeys: backwardBeatKeys,
      perMinuteKeys: backwardMinuteKeys,
      heartRate,
    })
    : undefined
  if (backwardValue !== undefined) {
    const regurgitantVolume = Math.abs(backwardValue)
    return {
      effectiveForwardFlow: forwardValue - regurgitantVolume,
      regurgitantFraction: (regurgitantVolume / forwardValue) * 100,
    }
  }

  const regurgitantFraction = fractionKeys?.length
    ? getFirstMeasurement(measurements, fractionKeys)
    : undefined
  if (regurgitantFraction !== undefined && regurgitantFraction >= 0 && regurgitantFraction <= 100) {
    return {
      effectiveForwardFlow: forwardValue * (1 - (regurgitantFraction / 100)),
      regurgitantFraction,
    }
  }

  if (effectiveValue !== undefined) {
    const regurgitantVolume = forwardValue - effectiveValue
    return {
      effectiveForwardFlow: effectiveValue,
      regurgitantFraction: regurgitantVolume >= 0 ? (regurgitantVolume / forwardValue) * 100 : undefined,
    }
  }

  return { effectiveForwardFlow: forwardValue }
}

export function getEffectiveForwardFlow(
  args: ValveFlowCalculationArgs & { regurgitantFractionKeys?: readonly string[] },
): number | undefined {
  return getValveFlowCalculation({
    ...args,
    fractionKeys: args.fractionKeys ?? args.regurgitantFractionKeys,
  }).effectiveForwardFlow
}

export function getRegurgitantFraction(
  args: ValveFlowCalculationArgs & { regurgitantFractionKeys?: readonly string[] },
): number | undefined {
  return getValveFlowCalculation({
    ...args,
    fractionKeys: args.fractionKeys ?? args.regurgitantFractionKeys,
  }).regurgitantFraction
}

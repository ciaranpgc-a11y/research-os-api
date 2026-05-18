import { describe, expect, it } from 'vitest'

import {
  getEffectiveForwardFlow,
  getRegurgitantFraction,
  getValveFlowCalculation,
  normalizeValveMeasurementMap,
  populateIndexedMeasurements,
} from '@/lib/cmr-flow-measurements'

describe('normalizeValveMeasurementMap', () => {
  it('maps pulmonary effective forward flow aliases to the canonical PV key', () => {
    const normalized = normalizeValveMeasurementMap(new Map([
      ['Pulmonary effective forward flow', 67],
    ]))

    expect(normalized.get('PV effective forward flow (per heartbeat)')).toBe(67)
  })
})

describe('getEffectiveForwardFlow', () => {
  it('derives effective forward flow from per-minute pulmonary flow when heart rate is available', () => {
    const value = getEffectiveForwardFlow({
      measurements: new Map([
        ['PV effective forward flow (per minute)', 4.8],
      ]),
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      heartRate: 60,
    })

    expect(value).toBe(80)
  })

  it('falls back to forward flow and regurgitant fraction when direct pulmonary effective flow is absent', () => {
    const value = getEffectiveForwardFlow({
      measurements: new Map([
        ['PV forward flow (per heartbeat)', 100],
        ['PV regurgitant fraction', 20],
      ]),
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      regurgitantFractionKeys: ['PV regurgitant fraction'],
    })

    expect(value).toBe(80)
  })

  it('recalculates effective forward flow from forward and backward flow before using a stored effective value', () => {
    const value = getEffectiveForwardFlow({
      measurements: new Map([
        ['PV forward flow (per heartbeat)', 40],
        ['PV backward flow (per heartbeat)', -2],
        ['PV effective forward flow (per heartbeat)', 99],
      ]),
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
    })

    expect(value).toBe(38)
  })
})

describe('getRegurgitantFraction', () => {
  it('derives pulmonary regurgitant fraction from forward and backward flow', () => {
    const value = getRegurgitantFraction({
      measurements: new Map([
        ['PV forward flow (per heartbeat)', 40],
        ['PV backward flow (per heartbeat)', -2],
      ]),
      fractionKeys: ['PV regurgitant fraction'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
    })

    expect(value).toBe(5)
  })

  it('derives aortic regurgitant fraction from per-minute flow when heart rate is available', () => {
    const value = getRegurgitantFraction({
      measurements: new Map([
        ['AV forward flow (per minute)', 6],
        ['AV backward flow (per minute)', 0.9],
      ]),
      fractionKeys: ['AV regurgitant fraction'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      heartRate: 60,
    })

    expect(value).toBe(15)
  })
})

describe('getValveFlowCalculation', () => {
  it('returns paired effective flow and regurgitant fraction for valve flow rows', () => {
    const result = getValveFlowCalculation({
      measurements: new Map([
        ['AV forward flow (per heartbeat)', 100],
        ['AV backward flow (per heartbeat)', 12.5],
        ['AV effective forward flow (per heartbeat)', 50],
      ]),
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      fractionKeys: ['AV regurgitant fraction'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
    })

    expect(result).toEqual({
      effectiveForwardFlow: 87.5,
      regurgitantFraction: 12.5,
    })
  })
})

describe('populateIndexedMeasurements', () => {
  it('derives indexed rows from matching absolute values and BSA', () => {
    const populated = populateIndexedMeasurements(
      new Map([
        ['LV mass', 180],
      ]),
      [
        { parameter_key: 'LV mass (i)', indexing: 'BSA', decimal_places: 0 },
      ],
      2,
    )

    expect(populated.get('LV mass (i)')).toBe(90)
  })

  it('derives cardiac index rows from cardiac output', () => {
    const populated = populateIndexedMeasurements(
      new Map([
        ['LV CO', 5.1],
      ]),
      [
        { parameter_key: 'LV CI', indexing: 'BSA', decimal_places: 1 },
      ],
      1.7,
    )

    expect(populated.get('LV CI')).toBe(3)
  })

  it('preserves explicit indexed measurements', () => {
    const populated = populateIndexedMeasurements(
      new Map([
        ['LV mass', 180],
        ['LV mass (i)', 95],
      ]),
      [
        { parameter_key: 'LV mass (i)', indexing: 'BSA', decimal_places: 0 },
      ],
      2,
    )

    expect(populated.get('LV mass (i)')).toBe(95)
  })
})

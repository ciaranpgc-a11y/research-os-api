import { describe, expect, it } from 'vitest'

import { resolveAliases, resolveReferenceParameters } from '@/lib/cmr-local-data'

describe('CMR local reference data', () => {
  it('includes axial pulmonary artery diameter rows with adult ranges', () => {
    const parameters = resolveReferenceParameters('Male', 65).parameters
    const byKey = new Map(parameters.map((parameter) => [parameter.parameter_key, parameter]))

    expect(byKey.get('MPA diameter')).toMatchObject({
      unit: 'mm',
      major_section: 'GREAT VESSELS',
      sub_section: 'Pulmonary arteries',
      ll: 20,
      mean: 24,
      ul: 29,
      abnormal_direction: 'high',
    })
    expect(byKey.get('RPA diameter')).toMatchObject({
      unit: 'mm',
      major_section: 'GREAT VESSELS',
      sub_section: 'Pulmonary arteries',
      ll: 13,
      mean: 19,
      ul: 24,
      separator_before: true,
    })
    expect(byKey.get('LPA diameter')).toMatchObject({
      unit: 'mm',
      major_section: 'GREAT VESSELS',
      sub_section: 'Pulmonary arteries',
      ll: 14,
      mean: 21,
      ul: 28,
      separator_before: true,
    })
  })

  it('maps pulmonary artery axial measurement aliases to the new diameter rows', () => {
    const aliases = new Map(resolveAliases().map((alias) => [alias.extracted_name, alias.canonical_name]))

    expect(aliases.get('MPA length')).toBe('MPA diameter')
    expect(aliases.get('RPA diameter')).toBe('RPA diameter')
    expect(aliases.get('Left PA diameter')).toBe('LPA diameter')
  })
})

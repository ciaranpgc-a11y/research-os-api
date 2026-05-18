import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cmr-auth', () => ({
  buildCmrHeaders: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }),
  getCmrApiBase: () => 'http://127.0.0.1:8011',
  getCmrSessionToken: () => 'test-token',
}))

import { extractFromReport } from '@/lib/cmr-api'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('extractFromReport', () => {
  it('calls the authenticated CMR backend extraction route', async () => {
    const result = {
      demographics: {
        sex: 'Male',
        age: 52,
        height_cm: 178,
        weight_kg: 82,
        bsa: 2.01,
        heart_rate: 68,
        study_date: '2026-04-11',
      },
      measurements: [
        { parameter: 'LV EF', value: 55 },
      ],
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => result,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(extractFromReport('Example uploaded report')).resolves.toEqual(result)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8011/v1/cmr/report-extraction',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ reportText: 'Example uploaded report' }),
      },
    )
  })

  it('surfaces a useful status-based error when the backend returns html', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 405,
      json: async () => {
        throw new Error('not json')
      },
      text: async () => '<html><body>405 Not Allowed</body></html>',
    }))

    await expect(extractFromReport('Example uploaded report')).rejects.toThrow('Extraction failed (405)')
  })
})

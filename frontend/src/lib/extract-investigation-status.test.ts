import { describe, expect, it } from 'vitest'

import {
  INVESTIGATION_STATUSES,
  displayInvestigationStatus,
  nextInvestigationStatus,
  normalizeInvestigationStatus,
  shouldShowInvestigationRecordCount,
} from './extract-investigation-status'

describe('extract investigation statuses', () => {
  it('uses one standard status list for every investigation modality', () => {
    expect(INVESTIGATION_STATUSES).toEqual([
      'Not started',
      'Requested',
      'Scheduled',
      'Await report',
      'Completed',
      'Not done',
      'Not appropriate',
      'Emailed',
      'Declined',
    ])
  })

  it('translates legacy Booked values to Requested', () => {
    expect(normalizeInvestigationStatus('Booked')).toBe('Requested')
    expect(displayInvestigationStatus('Booked', 0)).toBe('Requested')
    expect(normalizeInvestigationStatus('Pending')).toBe('Await report')
  })

  it('cycles every modality through the standard list before resetting', () => {
    expect(nextInvestigationStatus('', 'rhc')).toBe('Requested')
    expect(nextInvestigationStatus('Requested', 'echo')).toBe('Scheduled')
    expect(nextInvestigationStatus('Scheduled', 'cmr')).toBe('Await report')
    expect(nextInvestigationStatus('Await report', 'cpex')).toBe('Completed')
    expect(nextInvestigationStatus('Completed', 'rhc')).toBe('Not done')
    expect(nextInvestigationStatus('Not done', 'echo')).toBe('Not appropriate')
    expect(nextInvestigationStatus('Not appropriate', 'cmr')).toBe('Emailed')
    expect(nextInvestigationStatus('Emailed', 'cpex')).toBe('Declined')
    expect(nextInvestigationStatus('Declined', 'rhc')).toBe('Not started')
    expect(nextInvestigationStatus('Declined', 'echo')).toBe('Not started')
    expect(nextInvestigationStatus('Declined', 'cmr')).toBe('Not started')
    expect(nextInvestigationStatus('Declined', 'cpex')).toBe('Not started')
  })

  it('keeps blank statuses auto-completed when records exist', () => {
    expect(displayInvestigationStatus('', 2)).toBe('Completed')
    expect(displayInvestigationStatus('Not started', 2)).toBe('Not started')
    expect(shouldShowInvestigationRecordCount('Completed', 2)).toBe(true)
    expect(shouldShowInvestigationRecordCount('Requested', 2)).toBe(false)
  })
})

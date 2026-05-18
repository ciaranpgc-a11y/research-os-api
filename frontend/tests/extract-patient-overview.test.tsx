import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ExtractPatientOverview from '@/pages/extract-patient-overview'

const mocks = vi.hoisted(() => ({
  fetchRecords: vi.fn(),
  fetchRecruitment: vi.fn(),
  fetchBookingEntries: vi.fn(),
  updatePatient: vi.fn(),
  updateRecruitment: vi.fn(),
  createRecruitment: vi.fn(),
  updateRecord: vi.fn(),
  usePatientContext: vi.fn(),
}))

vi.mock('@/lib/extract-api', () => ({
  fetchRecords: (...args: unknown[]) => mocks.fetchRecords(...args),
  fetchRecruitment: (...args: unknown[]) => mocks.fetchRecruitment(...args),
  fetchBookingEntries: (...args: unknown[]) => mocks.fetchBookingEntries(...args),
  updatePatient: (...args: unknown[]) => mocks.updatePatient(...args),
  updateRecruitment: (...args: unknown[]) => mocks.updateRecruitment(...args),
  createRecruitment: (...args: unknown[]) => mocks.createRecruitment(...args),
  updateRecord: (...args: unknown[]) => mocks.updateRecord(...args),
}))

vi.mock('@/pages/extract-patient-detail-page', () => ({
  usePatientContext: () => mocks.usePatientContext(),
}))

describe('ExtractPatientOverview', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.fetchRecords.mockResolvedValue({ items: [] })
    mocks.fetchRecruitment.mockResolvedValue({})
    mocks.fetchBookingEntries.mockResolvedValue({ items: [] })
  })

  it('translates legacy investigation statuses in the overview status pills', async () => {
    mocks.fetchRecords.mockResolvedValue({ items: [] })
    mocks.fetchRecruitment.mockResolvedValue({
      inx_rhc: 'Booked',
      inx_echo: 'Pending',
      inx_cmr: 'Booked',
      inx_cpex: 'Pending',
    })
    mocks.usePatientContext.mockReturnValue({
      loading: false,
      reload: vi.fn(),
      patient: {
        hn: 'HN001',
        name: 'Legacy Status',
        dob: '1944-01-24',
        gender: 'Male',
        anonymisation_code: '',
        study_id: '',
        cohort: 'Suspected PH',
        recruitment_source: 'RHC list',
        rhc_count: 0,
        echo_count: 0,
        cmr_count: 0,
        cpex_count: 0,
      },
    })

    render(<ExtractPatientOverview />)

    expect(await screen.findAllByText('Requested')).toHaveLength(2)
    expect(await screen.findAllByText('Await report')).toHaveLength(2)
    expect(screen.queryByText('Booked')).not.toBeInTheDocument()
    expect(screen.queryByText('Pending')).not.toBeInTheDocument()
  })

  it('shows a matching booking date and time beside scheduled investigation status', async () => {
    mocks.fetchRecruitment.mockResolvedValue({
      inx_rhc: 'Requested',
      inx_echo: 'Completed',
      inx_cmr: 'Scheduled',
      inx_cpex: 'Not started',
    })
    mocks.fetchBookingEntries.mockResolvedValue({
      items: [
        {
          id: 'booking-cmr',
          hn: null,
          name: 'Scheduled Patient',
          investigation: 'CMR',
          booking_date: '2026-06-05',
          booking_time: '14:30',
          details: null,
          created_at: null,
          updated_at: null,
        },
        {
          id: 'booking-rhc',
          hn: 'HN001',
          name: 'Scheduled Patient',
          investigation: 'RHC',
          booking_date: '2026-06-06',
          booking_time: '09:00',
          details: null,
          created_at: null,
          updated_at: null,
        },
      ],
    })
    mocks.usePatientContext.mockReturnValue({
      loading: false,
      reload: vi.fn(),
      patient: {
        hn: 'HN001',
        name: 'Scheduled Patient',
        dob: '1944-01-24',
        gender: 'Male',
        anonymisation_code: '',
        study_id: '',
        cohort: 'Suspected PH',
        recruitment_source: 'RHC list',
        rhc_count: 0,
        echo_count: 0,
        cmr_count: 0,
        cpex_count: 0,
      },
    })

    render(<ExtractPatientOverview />)

    expect(await screen.findByText('Scheduled')).toBeInTheDocument()
    expect(await screen.findByText('05/06/2026 14:30')).toBeInTheDocument()
    expect(screen.queryByText('06/06/2026 09:00')).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExtractCohortPage } from '@/pages/extract-cohort-page'

const mocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
  fetchStats: vi.fn(),
  createPatient: vi.fn(),
  deletePatient: vi.fn(),
  updatePatient: vi.fn(),
  fetchTrackingEntries: vi.fn(),
  createTrackingEntry: vi.fn(),
  updateTrackingEntry: vi.fn(),
  deleteTrackingEntry: vi.fn(),
  fetchBookingEntries: vi.fn(),
  createBookingEntry: vi.fn(),
  updateBookingEntry: vi.fn(),
  deleteBookingEntry: vi.fn(),
}))

vi.mock('@/lib/extract-api', () => ({
  fetchPatients: (...args: unknown[]) => mocks.fetchPatients(...args),
  fetchStats: (...args: unknown[]) => mocks.fetchStats(...args),
  createPatient: (...args: unknown[]) => mocks.createPatient(...args),
  deletePatient: (...args: unknown[]) => mocks.deletePatient(...args),
  updatePatient: (...args: unknown[]) => mocks.updatePatient(...args),
  fetchTrackingEntries: (...args: unknown[]) => mocks.fetchTrackingEntries(...args),
  createTrackingEntry: (...args: unknown[]) => mocks.createTrackingEntry(...args),
  updateTrackingEntry: (...args: unknown[]) => mocks.updateTrackingEntry(...args),
  deleteTrackingEntry: (...args: unknown[]) => mocks.deleteTrackingEntry(...args),
  fetchBookingEntries: (...args: unknown[]) => mocks.fetchBookingEntries(...args),
  createBookingEntry: (...args: unknown[]) => mocks.createBookingEntry(...args),
  updateBookingEntry: (...args: unknown[]) => mocks.updateBookingEntry(...args),
  deleteBookingEntry: (...args: unknown[]) => mocks.deleteBookingEntry(...args),
}))

const patient = {
  hn: 'HN001',
  name: 'Flag Test',
  dob: '1980-01-01',
  gender: 'F',
  images_uploaded: false,
  rip_tag: false,
  action_flag: false,
  tracking_details: null,
  cohort: 'PH',
  recruitment_status: 'Identified',
  source: 'RACPC',
  rhc_count: 0,
  echo_count: 0,
  cmr_count: 0,
  cpex_count: 0,
  inx_rhc: null,
  inx_echo: null,
  inx_cmr: null,
  inx_cpex: null,
  pa_mean: null,
  pvr: null,
  pcwp: null,
  echo_ph_prob: null,
  cmr_ph: null,
}

function patientWith(overrides: Partial<typeof patient>) {
  return { ...patient, ...overrides }
}

describe('ExtractCohortPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.fetchStats.mockResolvedValue({
      total_patients: 1,
      rhc_count: 0,
      echo_count: 0,
      cmr_count: 0,
      cpex_count: 0,
    })
    mocks.fetchPatients.mockResolvedValue({ items: [patient], total: 1 })
    mocks.fetchTrackingEntries.mockResolvedValue({ items: [] })
    mocks.fetchBookingEntries.mockResolvedValue({ items: [] })
  })

  it('shows an error and reverts the flag when saving the action flag fails', async () => {
    mocks.updatePatient.mockRejectedValue(new Error('Network unavailable'))

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ExtractCohortPage />
      </MemoryRouter>,
    )

    const flagButton = await screen.findByRole('button', { name: 'Flag HN001 for action' })
    fireEvent.click(flagButton)

    await waitFor(() => {
      expect(screen.getByText('Could not save action flag for HN001.')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Flag HN001 for action' })).toBeInTheDocument()
  })

  it('orders the cohort table by name on first load', async () => {
    mocks.fetchPatients.mockResolvedValue({
      items: [
        patientWith({ hn: '001', name: 'Zara Young' }),
        patientWith({ hn: '003', name: 'Aaron Smith' }),
        patientWith({ hn: '002', name: 'Mina Patel' }),
      ],
      total: 3,
    })

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ExtractCohortPage />
      </MemoryRouter>,
    )

    const first = await screen.findByText('Aaron Smith')
    const second = await screen.findByText('Mina Patel')
    const third = await screen.findByText('Zara Young')

    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Name').textContent).toContain('▲')
  })
})

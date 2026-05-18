import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ExtractPatientDetailPage from '@/pages/extract-patient-detail-page'

const mocks = vi.hoisted(() => ({
  fetchPatient: vi.fn(),
  fetchPatients: vi.fn(),
}))

vi.mock('@/lib/extract-api', () => ({
  fetchPatient: (...args: unknown[]) => mocks.fetchPatient(...args),
  fetchPatients: (...args: unknown[]) => mocks.fetchPatients(...args),
}))

describe('ExtractPatientDetailPage', () => {
  it('uses name ordering for the participant navigator', async () => {
    mocks.fetchPatient.mockResolvedValue({
      hn: '003',
      name: 'Mina Patel',
      dob: '',
      gender: '',
      anonymisation_code: '',
      images_uploaded: false,
      study_id: '',
      cohort: '',
      recruitment_status: '',
      recruitment_source: '',
      rhc_count: 0,
      echo_count: 0,
      cmr_count: 0,
      cpex_count: 0,
    })
    mocks.fetchPatients.mockResolvedValueOnce({
      items: [
        { hn: '002', name: 'Zara Young' },
        { hn: '001', name: 'Aaron Smith' },
        { hn: '003', name: 'Mina Patel' },
      ],
      total: 3,
    })

    render(
      <MemoryRouter
        initialEntries={['/extract-patient/003/overview']}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="/extract-patient/:hn/*" element={<ExtractPatientDetailPage />}>
            <Route path="overview" element={<div>Overview content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('2 of 3 participants')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveAttribute('title', 'Aaron Smith')
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('title', 'Zara Young')
  })
})

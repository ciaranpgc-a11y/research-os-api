import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useMemo } from 'react'

import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import type { ProfilePublicationsPageFixture } from '@/pages/profile-publications-page'
import { ACCOUNT_SETTINGS_STORAGE_KEY } from '@/lib/account-preferences'
import { StandaloneRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'
import { pagesReviewProfilePublicationsDefaultFixture } from '@/stories/pages-review/_helpers/profile-publications-fixture'

const DRILLDOWN_TILE_KEY = 'this_year_vs_last'

const meta: Meta = {
  title: 'Design System/APPROVED/Drilldown Approved Chart',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
    docs: {
      description: {
        component: 'Approved canonical drilldown chart for Total publications. Uses production chart behavior aligned with Approved #6 choreography.',
      },
    },
  },
}

export default meta

type Story = StoryObj

function ensurePublicationInsightsVisibleDefault() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SETTINGS_STORAGE_KEY)
    let parsed: Record<string, unknown> = {}
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        parsed = {}
      }
    }
    if (parsed.publicationInsightsDefaultVisibility !== 'visible') {
      window.localStorage.setItem(
        ACCOUNT_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          publicationInsightsDefaultVisibility: 'visible',
        }),
      )
    }
  } catch {
    // Ignore storage errors in restricted iframe/browser contexts.
  }
}

function openDrilldownTile(tileKey: string) {
  if (typeof document === 'undefined') {
    return false
  }
  const selector = `.publications-insights-grid [data-metric-key="${tileKey}"]`
  const target = document.querySelector(selector)
  if (target instanceof HTMLElement) {
    target.click()
    return true
  }
  return false
}

function DrilldownApprovedChartCanvas() {
  ensurePublicationInsightsVisibleDefault()

  const fixture = useMemo<ProfilePublicationsPageFixture>(() => {
    const next = JSON.parse(JSON.stringify(pagesReviewProfilePublicationsDefaultFixture)) as ProfilePublicationsPageFixture
    next.token = ''
    return next
  }, [])

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      if (openDrilldownTile(DRILLDOWN_TILE_KEY)) {
        return
      }
      window.setTimeout(() => {
        openDrilldownTile(DRILLDOWN_TILE_KEY)
      }, 160)
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[94rem] px-5 pt-4">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Approved drilldown chart — Total publications</p>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
              onClick={() => {
                openDrilldownTile(DRILLDOWN_TILE_KEY)
              }}
            >
              Open drilldown
            </button>
          </div>
        </div>
      </div>
      <StandaloneRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={fixture} />}
      />
    </div>
  )
}

export const Approved: Story = {
  render: () => <DrilldownApprovedChartCanvas />,
}

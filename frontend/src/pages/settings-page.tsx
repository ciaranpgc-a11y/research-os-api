import { useState } from 'react'

import { PageHeader, Row, Section, SectionHeader, Stack, Subheading } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Button } from '@/components/ui'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseDrilldown, houseLayout, houseMotion } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { readAccountSettings, writeAccountSettings } from '@/lib/account-preferences'
import { PageFrame } from '@/pages/page-frame'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TOGGLE_TRACK_CLASS = houseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = houseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = houseMotion.toggleButton
const HOUSE_TOGGLE_BUTTON_MUTED_CLASS = houseDrilldown.toggleButtonMuted

export function SettingsPage() {
  const [settings, setSettings] = useState(() => readAccountSettings())
  const [status, setStatus] = useState('')

  const onSave = () => {
    writeAccountSettings(settings)
    setStatus('Preferences saved.')
  }

  return (
    <PageFrame tone="account" hideScaffoldHeader>
      <Stack data-house-role="page" space="sm">
        <Row
          align="center"
          gap="md"
          wrap={false}
          className="house-page-title-row"
        >
          <SectionMarker tone={getSectionMarkerTone('account')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Settings & preferences"
            description="Control profile and publications preferences."
            className="!ml-0 !mt-0"
          />
        </Row>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Publications" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content space-y-3 text-sm">
            <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
              <Stack space="sm">
                <Subheading>Publication insights visibility default</Subheading>
                <p className="m-0 text-body text-[hsl(var(--tone-neutral-700))]">
                  Sets whether the publication insights tile section is shown or hidden by default.
                </p>
                <div className="house-approved-toggle-context inline-flex w-full items-center">
                  <div
                    className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'grid w-full max-w-md grid-cols-2')}
                    data-ui="publication-insights-default-visibility-toggle"
                    data-house-role="horizontal-toggle"
                  >
                    <span
                      className={HOUSE_TOGGLE_THUMB_CLASS}
                      style={{
                        left: settings.publicationInsightsDefaultVisibility === 'visible' ? '0%' : '50%',
                        width: '50%',
                      }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={cn(
                        HOUSE_TOGGLE_BUTTON_CLASS,
                        settings.publicationInsightsDefaultVisibility === 'visible' ? 'text-white' : HOUSE_TOGGLE_BUTTON_MUTED_CLASS,
                      )}
                      aria-pressed={settings.publicationInsightsDefaultVisibility === 'visible'}
                      onClick={() => {
                        setSettings((current) => ({
                          ...current,
                          publicationInsightsDefaultVisibility: 'visible',
                        }))
                        setStatus('')
                      }}
                    >
                      Visible by default
                    </button>
                    <button
                      type="button"
                      className={cn(
                        HOUSE_TOGGLE_BUTTON_CLASS,
                        settings.publicationInsightsDefaultVisibility === 'hidden' ? 'text-white' : HOUSE_TOGGLE_BUTTON_MUTED_CLASS,
                      )}
                      aria-pressed={settings.publicationInsightsDefaultVisibility === 'hidden'}
                      onClick={() => {
                        setSettings((current) => ({
                          ...current,
                          publicationInsightsDefaultVisibility: 'hidden',
                        }))
                        setStatus('')
                      }}
                    >
                      Hidden by default
                    </button>
                  </div>
                </div>
              </Stack>
            </div>
            <Row align="end" gap="sm" wrap={false}>
              <Button type="button" size="sm" variant="cta" onClick={onSave}>
                Save preferences
              </Button>
            </Row>
            {status ? <p className="m-0 text-caption text-[hsl(var(--tone-positive-700))]">{status}</p> : null}
          </div>
        </Section>
      </Stack>
    </PageFrame>
  )
}

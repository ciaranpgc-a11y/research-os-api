import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Button } from '@/components/ui'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { readAccountSettings, writeAccountSettings } from '@/lib/account-preferences'
import { PageFrame } from '@/pages/page-frame'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor

export function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(() => readAccountSettings())
  const [status, setStatus] = useState('')

  const onSave = () => {
    writeAccountSettings(settings)
    setStatus('Preferences saved.')
  }

  return (
    <PageFrame tone="account" hideScaffoldHeader>
      <Stack space="sm">
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

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
          <SectionHeader heading="Publications" className="house-section-header-marker-aligned" />
          <Stack space="sm">
            <p className="m-0 text-caption font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
              Publication insights visibility default
            </p>
            <p className="m-0 text-body text-[hsl(var(--tone-neutral-700))]">
              Sets whether the publication insights tile section is shown or hidden by default.
            </p>
            <Row align="start" gap="sm">
              <Button
                type="button"
                variant={settings.publicationInsightsDefaultVisibility === 'visible' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setSettings((current) => ({
                    ...current,
                    publicationInsightsDefaultVisibility: 'visible',
                  }))
                  setStatus('')
                }}
              >
                <Eye className="h-4 w-4" />
                Visible by default
              </Button>
              <Button
                type="button"
                variant={settings.publicationInsightsDefaultVisibility === 'hidden' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setSettings((current) => ({
                    ...current,
                    publicationInsightsDefaultVisibility: 'hidden',
                  }))
                  setStatus('')
                }}
              >
                <EyeOff className="h-4 w-4" />
                Hidden by default
              </Button>
            </Row>
            <Row align="start" gap="sm">
              <Button type="button" size="sm" onClick={onSave}>
                Save preferences
              </Button>
              {status ? <p className="m-0 text-caption text-[hsl(var(--tone-positive-700))]">{status}</p> : null}
            </Row>
          </Stack>
        </Section>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
          <SectionHeader heading="Profile controls" className="house-section-header-marker-aligned" />
          <Stack space="sm">
            <p className="m-0 text-body text-[hsl(var(--tone-neutral-700))]">
              Personal identity, ORCID linking, and research profile fields now live in dedicated profile pages.
            </p>
            <Row align="start" gap="sm">
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile/personal-details')}>
                Open personal details
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile/integrations')}>
                Open integrations
              </Button>
            </Row>
          </Stack>
        </Section>
      </Stack>
    </PageFrame>
  )
}

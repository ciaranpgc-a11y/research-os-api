import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readAccountSettings, writeAccountSettings } from '@/lib/account-preferences'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(() => readAccountSettings())
  const [status, setStatus] = useState('')

  const onSave = () => {
    writeAccountSettings(settings)
    setStatus('Preferences saved.')
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings & preferences</h1>
        <p className="text-sm text-[hsl(var(--tone-neutral-600))]">
          Control profile and publications preferences.
        </p>
      </header>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">
            Publications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[hsl(var(--tone-neutral-700))]">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
              Publication insights visibility default
            </p>
            <p className="text-sm text-[hsl(var(--tone-neutral-700))]">
              Sets whether the publication insights tile section is shown or hidden by default.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                settings.publicationInsightsDefaultVisibility === 'visible'
                  ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
                  : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))]',
              )}
              onClick={() => {
                setSettings((current) => ({
                  ...current,
                  publicationInsightsDefaultVisibility: 'visible',
                }))
                setStatus('')
              }}
              aria-pressed={settings.publicationInsightsDefaultVisibility === 'visible'}
            >
              <Eye className="h-3.5 w-3.5" />
              Visible by default
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                settings.publicationInsightsDefaultVisibility === 'hidden'
                  ? 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-700))]'
                  : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))]',
              )}
              onClick={() => {
                setSettings((current) => ({
                  ...current,
                  publicationInsightsDefaultVisibility: 'hidden',
                }))
                setStatus('')
              }}
              aria-pressed={settings.publicationInsightsDefaultVisibility === 'hidden'}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hidden by default
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={onSave}>
              Save preferences
            </Button>
            {status ? <p className="text-xs text-[hsl(var(--tone-positive-700))]">{status}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">
            Profile controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[hsl(var(--tone-neutral-700))]">
          <p>
            Personal identity, ORCID linking, and research profile fields now live in dedicated profile pages.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile/personal-details')}>
              Open personal details
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile/integrations')}>
              Open integrations
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

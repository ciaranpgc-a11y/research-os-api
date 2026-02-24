import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsPage() {
  const navigate = useNavigate()

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings & preferences</h1>
        <p className="text-sm text-[hsl(var(--tone-neutral-600))]">
          This section has been cleared while profile controls are consolidated.
        </p>
      </header>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">
            Preferences reset in progress
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
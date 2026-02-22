import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const SETTINGS_STORAGE_KEY = 'aawe-account-settings'

type AccountSettings = {
  affiliation: string
  defaultLanguage: string
  notificationsEmail: string
}

function readSettings(): AccountSettings {
  if (typeof window === 'undefined') {
    return {
      affiliation: '',
      defaultLanguage: 'en-GB',
      notificationsEmail: '',
    }
  }
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) {
    return {
      affiliation: '',
      defaultLanguage: 'en-GB',
      notificationsEmail: '',
    }
  }
  try {
    const parsed = JSON.parse(raw) as AccountSettings
    return {
      affiliation: parsed.affiliation || '',
      defaultLanguage: parsed.defaultLanguage || 'en-GB',
      notificationsEmail: parsed.notificationsEmail || '',
    }
  } catch {
    return {
      affiliation: '',
      defaultLanguage: 'en-GB',
      notificationsEmail: '',
    }
  }
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AccountSettings>(() => readSettings())
  const [status, setStatus] = useState('')

  const onSave = () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    setStatus('Settings saved locally for this browser.')
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account-level defaults that apply across all workspaces.</p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Profile defaults</CardTitle>
          <CardDescription>Used when creating new workspaces and manuscript plans.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Affiliation</label>
            <Input
              value={settings.affiliation}
              onChange={(event) => setSettings((current) => ({ ...current, affiliation: event.target.value }))}
              placeholder="Institution / department"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Default language</label>
            <select
              value={settings.defaultLanguage}
              onChange={(event) =>
                setSettings((current) => ({ ...current, defaultLanguage: event.target.value }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="en-GB">British English (en-GB)</option>
              <option value="en-US">US English (en-US)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Notification email</label>
            <Input
              value={settings.notificationsEmail}
              onChange={(event) =>
                setSettings((current) => ({ ...current, notificationsEmail: event.target.value }))
              }
              placeholder="optional@example.com"
            />
          </div>
          <Button type="button" size="sm" onClick={onSave}>
            Save settings
          </Button>
          {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
        </CardContent>
      </Card>
    </section>
  )
}

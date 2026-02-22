import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  parseCsvList,
  readAccountSettings,
  REPORTING_GUIDELINE_OPTIONS,
  settingsCompleteness,
  STUDY_TYPE_OPTIONS,
  writeAccountSettings,
} from '@/lib/account-preferences'

export function SettingsPage() {
  const [settings, setSettings] = useState(() => readAccountSettings())
  const [keywordsInput, setKeywordsInput] = useState(settings.researchKeywords.join(', '))
  const [journalsInput, setJournalsInput] = useState(settings.preferredJournals.join(', '))
  const [status, setStatus] = useState('')

  const toggleStudyType = (value: string) => {
    setSettings((current) => {
      const next = new Set(current.defaultStudyTypes)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return { ...current, defaultStudyTypes: Array.from(next) }
    })
  }

  const toggleGuideline = (value: string) => {
    setSettings((current) => {
      const next = new Set(current.reportingGuidelines)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return { ...current, reportingGuidelines: Array.from(next) }
    })
  }

  const onReset = () => {
    const defaults = readAccountSettings()
    setSettings(defaults)
    setKeywordsInput(defaults.researchKeywords.join(', '))
    setJournalsInput(defaults.preferredJournals.join(', '))
    setStatus('')
  }

  const onSave = () => {
    const nextSettings = {
      ...settings,
      researchKeywords: parseCsvList(keywordsInput, 8),
      preferredJournals: parseCsvList(journalsInput, 20),
    }
    writeAccountSettings(nextSettings)
    setSettings(nextSettings)
    setKeywordsInput(nextSettings.researchKeywords.join(', '))
    setJournalsInput(nextSettings.preferredJournals.join(', '))
    setStatus('Settings saved for this browser session.')
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings & preferences</h1>
      </header>

      <Card>
        <CardContent className="grid gap-2 p-4 md:grid-cols-3">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Preferences completeness</p>
            <p className="font-semibold">{settingsCompleteness(settings)}%</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Preferred journals</p>
            <p className="font-semibold">{settings.preferredJournals.length}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Default study types</p>
            <p className="font-semibold">{settings.defaultStudyTypes.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identity defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Affiliation</label>
              <Input
                value={settings.affiliation}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, affiliation: event.target.value }))
                }
                placeholder="Institution / department"
              />
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
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Default language</label>
            <select
              value={settings.defaultLanguage}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  defaultLanguage: event.target.value === 'en-US' ? 'en-US' : 'en-GB',
                }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="en-GB">British English (en-GB)</option>
              <option value="en-US">US English (en-US)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Writing preferences</CardTitle>
          <CardDescription>Used to condition manuscript planning defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Default study types</p>
            <div className="flex flex-wrap gap-2">
              {STUDY_TYPE_OPTIONS.map((option) => {
                const selected = settings.defaultStudyTypes.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      selected
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-border bg-background text-foreground'
                    }`}
                    onClick={() => toggleStudyType(option)}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Claim tone</label>
            <select
              value={settings.claimTone}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  claimTone:
                    event.target.value === 'assertive' || event.target.value === 'balanced'
                      ? event.target.value
                      : 'conservative',
                }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="conservative">Conservative</option>
              <option value="balanced">Balanced</option>
              <option value="assertive">Assertive</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Reporting guidelines</p>
            <div className="flex flex-wrap gap-2">
              {REPORTING_GUIDELINE_OPTIONS.map((option) => {
                const selected = settings.reportingGuidelines.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-md border px-3 py-1.5 text-xs ${
                      selected
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-border bg-background text-foreground'
                    }`}
                    onClick={() => toggleGuideline(option)}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Research profile</CardTitle>
          <CardDescription>Keywords and journals used by account-level recommendations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Research keywords (max 8)</label>
            <Input
              value={keywordsInput}
              onChange={(event) => setKeywordsInput(event.target.value)}
              placeholder="e.g. pulmonary hypertension, 4D flow CMR, right ventricle"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Preferred journals</label>
            <Input
              value={journalsInput}
              onChange={(event) => setJournalsInput(event.target.value)}
              placeholder="Comma-separated list"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onSave}>
          Save settings
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReset}>
          Reset local values
        </Button>
      </div>
      {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
    </section>
  )
}

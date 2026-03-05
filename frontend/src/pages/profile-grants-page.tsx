import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import {
  Button,
  Input,
} from '@/components/ui'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout } from '@/lib/house-style'
import { fetchMe, fetchPersonaGrants } from '@/lib/impact-api'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { PageFrame } from '@/pages/page-frame'
import type { PersonaGrantsPayload } from '@/types/impact'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor

function normalizeNamePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const clean = normalizeNamePart(String(fullName || ''))
  if (!clean) {
    return { firstName: '', lastName: '' }
  }
  const tokens = clean.split(' ').filter(Boolean)
  if (tokens.length < 2) {
    return { firstName: tokens[0] || '', lastName: '' }
  }
  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') }
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) {
    return '-'
  }
  const code = String(currency || '').trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('en-GB')} ${code}`
  }
}

function formatAwardPeriod(item: {
  start_year: number | null
  end_year: number | null
  start_date: string | null
  end_date: string | null
}): string {
  const startYear = Number(item.start_year || 0)
  const endYear = Number(item.end_year || 0)
  if (startYear > 0 && endYear > 0) {
    return `${startYear} - ${endYear}`
  }
  if (startYear > 0) {
    return `${startYear} -`
  }
  if (endYear > 0) {
    return `- ${endYear}`
  }
  const startDate = String(item.start_date || '').trim()
  const endDate = String(item.end_date || '').trim()
  if (startDate || endDate) {
    return `${startDate || '?'} - ${endDate || '?'}`
  }
  return '-'
}

function formatSourceTimestamp(value: string | null): string {
  const clean = String(value || '').trim()
  if (!clean) {
    return '-'
  }
  const date = new Date(clean)
  if (Number.isNaN(date.getTime())) {
    return clean
  }
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ProfileGrantsPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => getAuthSessionToken())
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [initialising, setInitialising] = useState(true)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [error, setError] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [payload, setPayload] = useState<PersonaGrantsPayload | null>(null)
  const autoLookupTriggeredRef = useRef(false)

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    setToken(sessionToken)

    const load = async () => {
      setInitialising(true)
      setError('')
      try {
        const me = await fetchMe(sessionToken)
        const parsed = splitName(me.name)
        setFirstName(parsed.firstName)
        setLastName(parsed.lastName)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Could not load profile name.'
        if (message.toLowerCase().includes('session')) {
          clearAuthSessionToken()
          navigate('/auth?next=/profile/grants&reason=session_expired', { replace: true })
          return
        }
        setError(message)
      } finally {
        setInitialising(false)
      }
    }

    void load()
  }, [navigate])

  const canLookup = useMemo(
    () => Boolean(normalizeNamePart(firstName) && normalizeNamePart(lastName)),
    [firstName, lastName],
  )

  const runLookup = useCallback(async (input?: {
    firstName?: string
    lastName?: string
  }) => {
    const sessionToken = token || getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    const cleanFirstName = normalizeNamePart(input?.firstName ?? firstName)
    const cleanLastName = normalizeNamePart(input?.lastName ?? lastName)
    if (!cleanFirstName || !cleanLastName) {
      setLookupError('First name and last name are required to look up grants.')
      return
    }
    setLookupBusy(true)
    setLookupError('')
    try {
      const response = await fetchPersonaGrants(sessionToken, {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        limit: 40,
        relationship: 'all',
      })
      setPayload(response)
    } catch (lookupErr) {
      const message = lookupErr instanceof Error ? lookupErr.message : 'Could not load grants.'
      if (message.toLowerCase().includes('session')) {
        clearAuthSessionToken()
        navigate('/auth?next=/profile/grants&reason=session_expired', { replace: true })
        return
      }
      setPayload(null)
      setLookupError(message)
    } finally {
      setLookupBusy(false)
    }
  }, [firstName, lastName, navigate, token])

  useEffect(() => {
    if (initialising || autoLookupTriggeredRef.current) {
      return
    }
    const cleanFirstName = normalizeNamePart(firstName)
    const cleanLastName = normalizeNamePart(lastName)
    if (!cleanFirstName || !cleanLastName) {
      return
    }
    autoLookupTriggeredRef.current = true
    void runLookup({
      firstName: cleanFirstName,
      lastName: cleanLastName,
    })
  }, [firstName, initialising, lastName, runLookup])

  const matchedAuthorLabel = payload?.author?.display_name || null
  const matchedAuthorId = payload?.author?.openalex_author_id || null
  const myGrants = useMemo(
    () => (payload?.items || []).filter((item) => item.relationship_to_person === 'won_by_person'),
    [payload?.items],
  )
  const publicationsUnderGrants = useMemo(
    () => (payload?.items || []).filter((item) => item.relationship_to_person !== 'won_by_person'),
    [payload?.items],
  )

  const renderGrantTable = useCallback((rows: PersonaGrantsPayload['items']) => (
    <div className="w-full overflow-visible">
      <div
        className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
        style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
      >
        <table className="w-full border-collapse" data-house-no-column-resize="true" data-house-no-column-controls="true">
          <thead className="house-table-head">
            <tr>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Grant</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Funder</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Award ID</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Period</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Grant owner</th>
              <th className="house-table-head-text h-10 px-2 text-right align-middle font-semibold whitespace-nowrap">Amount</th>
              <th className="house-table-head-text h-10 px-2 text-right align-middle font-semibold whitespace-nowrap">Works</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item) => (
              <tr key={`${item.funder.id || ''}:${item.funder_award_id || ''}:${item.openalex_award_id || ''}`} className="house-table-row">
                <td className="house-table-cell-text px-2 py-2 align-top">
                  <div className="font-medium">{item.display_name || 'Untitled grant'}</div>
                  {item.description ? (
                    <p className="mt-1 max-w-[42rem] text-xs text-[hsl(var(--muted-foreground))]">
                      {item.description}
                    </p>
                  ) : null}
                </td>
                <td className="house-table-cell-text px-2 py-2 align-top">
                  <div>{item.funder.display_name || '-'}</div>
                  {item.funder.id ? (
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.funder.id}</div>
                  ) : null}
                </td>
                <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{item.funder_award_id || '-'}</td>
                <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{formatAwardPeriod(item)}</td>
                <td className="house-table-cell-text px-2 py-2 align-top">
                  <div className="font-medium text-[hsl(var(--foreground))]">
                    {item.grant_owner_name || 'Unknown in OpenAlex'}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {item.person_role
                      ? `Matched person role: ${item.person_role}`
                      : item.grant_owner_role
                        ? item.grant_owner_role.replace(/_/g, ' ')
                        : 'owner role not provided'}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Source: {(item.source || 'openalex').toUpperCase()} · Snapshot: {formatSourceTimestamp(item.source_timestamp)}
                  </div>
                  {item.award_holders.length > 1 ? (
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Additional holders: {item.award_holders.slice(0, 3).map((holder) => holder.name).join(', ')}
                    </div>
                  ) : null}
                </td>
                <td className="house-table-cell-text px-2 py-2 text-right align-top whitespace-nowrap">{formatMoney(item.amount, item.currency)}</td>
                <td className="house-table-cell-text px-2 py-2 text-right align-top whitespace-nowrap">{item.supporting_works_count || 0}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="house-table-cell-text px-3 py-4 text-center text-[hsl(var(--muted-foreground))]">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  ), [])

  const renderPublicationsUnderGrantsTable = useCallback((rows: PersonaGrantsPayload['items']) => (
    <div className="w-full overflow-visible">
      <div
        className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
        style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
      >
        <table className="w-full border-collapse" data-house-no-column-resize="true" data-house-no-column-controls="true">
          <thead className="house-table-head">
            <tr>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Award ID</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Funder</th>
              <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Period</th>
              <th className="house-table-head-text h-10 px-2 text-right align-middle font-semibold whitespace-nowrap">Works</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((item) => (
              <tr key={`${item.funder.id || ''}:${item.funder_award_id || ''}:${item.openalex_award_id || ''}`} className="house-table-row">
                <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{item.funder_award_id || '-'}</td>
                <td className="house-table-cell-text px-2 py-2 align-top">{item.funder.display_name || '-'}</td>
                <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{formatAwardPeriod(item)}</td>
                <td className="house-table-cell-text px-2 py-2 text-right align-top whitespace-nowrap">{item.supporting_works_count || 0}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="house-table-cell-text px-3 py-4 text-center text-[hsl(var(--muted-foreground))]">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  ), [])

  return (
    <PageFrame tone="profile" hideScaffoldHeader>
      <Stack data-house-role="page" space="sm">
        <Row align="center" gap="md" wrap={false} className="house-page-title-row">
          <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Grants"
            description="OpenAlex funder awards linked to a named researcher."
            className="!ml-0 !mt-0"
          />
        </Row>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Lookup" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content rounded-md border p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <label data-house-role="field-group" className="space-y-1">
                <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">First name</span>
                <Input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First name"
                  disabled={lookupBusy || initialising}
                />
              </label>
              <label data-house-role="field-group" className="space-y-1">
                <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">Last name</span>
                <Input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last name"
                  disabled={lookupBusy || initialising}
                />
              </label>
              <Button
                type="button"
                variant="housePrimary"
                disabled={!canLookup || lookupBusy || initialising}
                onClick={() => void runLookup()}
              >
                {lookupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                {lookupBusy ? 'Looking up...' : 'Lookup grants'}
              </Button>
            </div>
            {error ? (
              <p className="mt-3 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                {error}
              </p>
            ) : null}
            {lookupError ? (
              <p className="mt-3 rounded-md border border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] px-3 py-2 text-sm text-[hsl(var(--tone-warning-800))]">
                {lookupError}
              </p>
            ) : null}
            {matchedAuthorLabel ? (
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                Matched author: <span className="font-medium text-[hsl(var(--foreground))]">{matchedAuthorLabel}</span>
                {matchedAuthorId ? ` (${matchedAuthorId})` : ''}
              </p>
            ) : null}
          </div>
        </Section>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="My grants" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Grants identified as awarded to the matched person (using investigator metadata when available).
            </p>
            {initialising || lookupBusy ? (
              <div className="rounded-md border px-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                {initialising ? 'Loading profile details...' : 'Looking up grants...'}
              </div>
            ) : (
              renderGrantTable(myGrants)
            )}
          </div>
        </Section>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Publications under grants" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Publications linked to grants where ownership is unclear or attributed to someone else.
            </p>
            {initialising || lookupBusy ? (
              <div className="rounded-md border px-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                {initialising ? 'Loading profile details...' : 'Looking up grants...'}
              </div>
            ) : (
              renderPublicationsUnderGrantsTable(publicationsUnderGrants)
            )}
          </div>
        </Section>
      </Stack>
    </PageFrame>
  )
}


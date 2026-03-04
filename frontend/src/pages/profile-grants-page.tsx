import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import {
  Button,
  Input,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout } from '@/lib/house-style'
import { fetchMe, fetchPersonaGrants } from '@/lib/impact-api'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { PageFrame } from '@/pages/page-frame'
import type { PersonaGrantsPayload } from '@/types/impact'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
type GrantRelationshipFilter = 'all' | 'won' | 'published_under'

const GRANT_RELATIONSHIP_FILTER_OPTIONS: Array<{
  value: GrantRelationshipFilter
  label: string
}> = [
  { value: 'all', label: 'All linked grants' },
  { value: 'won', label: 'Grants won by this person' },
  { value: 'published_under', label: 'Published under other grants' },
]

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

export function ProfileGrantsPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => getAuthSessionToken())
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [relationshipFilter, setRelationshipFilter] = useState<GrantRelationshipFilter>('all')
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
    relationship?: GrantRelationshipFilter
  }) => {
    const sessionToken = token || getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    const cleanFirstName = normalizeNamePart(input?.firstName ?? firstName)
    const cleanLastName = normalizeNamePart(input?.lastName ?? lastName)
    const cleanRelationship = input?.relationship ?? relationshipFilter
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
        relationship: cleanRelationship,
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
  }, [firstName, lastName, navigate, relationshipFilter, token])

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
      relationship: relationshipFilter,
    })
  }, [firstName, initialising, lastName, relationshipFilter, runLookup])

  const matchedAuthorLabel = payload?.author?.display_name || null
  const matchedAuthorId = payload?.author?.openalex_author_id || null

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
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
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
              <label data-house-role="field-group" className="space-y-1">
                <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">Relationship filter</span>
                <SelectPrimitive
                  value={relationshipFilter}
                  onValueChange={(nextValue) => {
                    const value = (
                      nextValue === 'won' || nextValue === 'published_under'
                        ? nextValue
                        : 'all'
                    ) as GrantRelationshipFilter
                    setRelationshipFilter(value)
                    if (!lookupBusy && !initialising && canLookup) {
                      void runLookup({
                        firstName,
                        lastName,
                        relationship: value,
                      })
                    }
                  }}
                  disabled={lookupBusy || initialising}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter grants" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_RELATIONSHIP_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectPrimitive>
              </label>
              <Button
                type="button"
                variant="housePrimary"
                disabled={!canLookup || lookupBusy || initialising}
                onClick={() => void runLookup({ relationship: relationshipFilter })}
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
          <SectionHeader heading="Results" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grant</TableHead>
                  <TableHead>Funder</TableHead>
                  <TableHead>Award ID</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Relationship / Owner</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Works</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload?.items?.length ? payload.items.map((item) => (
                  <TableRow key={`${item.funder.id || ''}:${item.funder_award_id || ''}:${item.openalex_award_id || ''}`}>
                    <TableCell className="align-top">
                      <div className="font-medium">{item.display_name || 'Untitled grant'}</div>
                      {item.description ? (
                        <p className="mt-1 max-w-[42rem] text-xs text-[hsl(var(--muted-foreground))]">
                          {item.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div>{item.funder.display_name || '-'}</div>
                      {item.funder.id ? (
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.funder.id}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">{item.funder_award_id || '-'}</TableCell>
                    <TableCell className="align-top">{formatAwardPeriod(item)}</TableCell>
                    <TableCell className="align-top">
                      {item.relationship_to_person === 'won_by_person' ? (
                        <div className="font-medium text-[hsl(var(--tone-positive-700))]">
                          Won by matched person
                        </div>
                      ) : null}
                      {item.relationship_to_person !== 'won_by_person' ? (
                        <div className="font-medium text-[hsl(var(--tone-warning-800))]">
                          Published under another grant
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        Owner:{' '}
                        <span className="font-medium text-[hsl(var(--foreground))]">
                          {item.grant_owner_name || 'Unknown in OpenAlex'}
                        </span>
                        {item.grant_owner_role ? ` (${item.grant_owner_role.replace(/_/g, ' ')})` : ''}
                      </div>
                      {item.award_holders.length > 1 ? (
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          Additional holders: {item.award_holders.slice(0, 3).map((holder) => holder.name).join(', ')}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right align-top">{formatMoney(item.amount, item.currency)}</TableCell>
                    <TableCell className="text-right align-top">{item.supporting_works_count || 0}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-5 text-sm text-[hsl(var(--muted-foreground))]">
                      {initialising
                        ? 'Loading profile details...'
                        : lookupBusy
                          ? 'Looking up grants...'
                          : 'No grants found for this name yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Section>
      </Stack>
    </PageFrame>
  )
}

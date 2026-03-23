import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CollectionsViewport } from '@/components/collections/CollectionsViewport'
import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseSurfaces } from '@/lib/house-style'
import { fetchPersonaState } from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import type { PersonaStatePayload } from '@/types/impact'

export function ProfileCollectionsPage() {
  const navigate = useNavigate()
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(() => readCachedPersonaState())
  const [loading, setLoading] = useState(!personaState)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getAuthSessionToken()
    if (!token) {
      setLoading(false)
      setError('Your session expired. Sign in again to manage collections.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    void fetchPersonaState(token)
      .then((payload) => {
        if (cancelled) {
          return
        }
        setPersonaState(payload)
        writeCachedPersonaState(payload)
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return
        }
        const message = fetchError instanceof Error ? fetchError.message : 'Collections could not be loaded.'
        if (message.toLowerCase().includes('session')) {
          clearAuthSessionToken()
        }
        setError(message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Stack space="lg">
      <Row
        align="center"
        gap="md"
        wrap={false}
        className="house-page-title-row"
      >
        <SectionMarker tone={getSectionMarkerTone('research')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Collections"
          description="Organise publication groups from your profile library and jump back into publication detail when you need it."
          className="!ml-0 !mt-0"
        />
      </Row>

      <section
        data-house-role="section-content"
        className={cn(
          houseSurfaces.sectionPanel,
          'min-h-[calc(100vh-15rem)] overflow-hidden p-0',
        )}
      >
        {loading ? (
          <div className="flex min-h-[24rem] items-center justify-center px-6 py-10 text-sm text-muted-foreground">
            Loading collections...
          </div>
        ) : error ? (
          <div className="flex min-h-[24rem] items-center justify-center px-6 py-10">
            <div className="max-w-xl rounded-2xl border border-border bg-background px-6 py-5 text-sm text-muted-foreground shadow-sm">
              {error}
            </div>
          </div>
        ) : (
          <CollectionsViewport
            works={personaState?.works || []}
            pageMode
            onOpenPublication={(workId) => {
              navigate(`/profile/publications?work=${encodeURIComponent(workId)}`)
            }}
          />
        )}
      </section>
    </Stack>
  )
}

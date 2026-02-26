import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { fetchAdminOverview, fetchAdminUsers } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type { AdminOverviewPayload, AdminUsersListPayload } from '@/types/impact'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [users, setUsers] = useState<AdminUsersListPayload | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(
    async (searchQuery: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        navigate('/auth', { replace: true })
        return
      }
      setLoading(true)
      setError('')
      setStatus('')
      try {
        const [overviewPayload, usersPayload] = await Promise.all([
          fetchAdminOverview(token),
          fetchAdminUsers(token, {
            query: searchQuery,
            limit: 50,
            offset: 0,
          }),
        ])
        setOverview(overviewPayload)
        setUsers(usersPayload)
        setStatus(`Loaded ${usersPayload.items.length} of ${usersPayload.total} user accounts.`)
      } catch (loadError) {
        const detail = loadError instanceof Error ? loadError.message : 'Could not load admin data.'
        if (detail.toLowerCase().includes('unauthorized')) {
          clearAuthSessionToken()
          navigate('/auth', { replace: true })
          return
        }
        setError(detail)
      } finally {
        setLoading(false)
      }
    },
    [navigate],
  )

  useEffect(() => {
    void loadData('')
  }, [loadData])

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(query)
  }

  return (
    <section data-house-role="page" className="space-y-4">
      <header data-house-role="page-header" className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
        <h1 data-house-role="page-title" className={houseTypography.title}>Admin</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>
          Owner console for account visibility and access checks.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overview?.total_users ?? 'n/a'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overview?.active_users ?? 'n/a'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inactive users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overview?.inactive_users ?? 'n/a'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Admin users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overview?.admin_users ?? 'n/a'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sign-ins (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overview?.recent_signins_24h ?? 'n/a'}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User directory</CardTitle>
          <CardDescription>
            Query by name or email to audit access. Last refreshed: {formatTimestamp(overview?.generated_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex flex-wrap items-center gap-2" onSubmit={onSearch}>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email"
              className="max-w-md"
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Loading...' : 'Search'}
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadData(query)}>
              Refresh
            </Button>
          </form>

          {users?.items.length ? (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last sign-in</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-3 py-2">{item.name || 'Unnamed user'}</td>
                      <td className="px-3 py-2">{item.email}</td>
                      <td className="px-3 py-2">{item.role}</td>
                      <td className="px-3 py-2">{item.is_active ? 'active' : 'inactive'}</td>
                      <td className="px-3 py-2">{formatTimestamp(item.last_sign_in_at)}</td>
                      <td className="px-3 py-2">{formatTimestamp(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No users matched the current filter.</p>
          )}
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}

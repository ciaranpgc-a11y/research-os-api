import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { cmrLogin, setCmrSession } from '@/lib/cmr-auth'
import { cn } from '@/lib/utils'

export function CmrLoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError(null)
    try {
      const result = await cmrLogin(code.trim())
      setCmrSession(result.session_token, result.name, result.is_admin)
      navigate('/cmr-reference-table', { replace: true })
    } catch {
      setError('Invalid access code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">CMR Analysis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Access code"
              autoFocus
              className={cn(
                'house-input w-full text-center text-lg tracking-wider',
                error && 'ring-2 ring-[hsl(var(--tone-danger-400))]',
              )}
            />
            {error && (
              <p className="mt-2 text-center text-xs text-[hsl(var(--tone-danger-500))]">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="house-button-primary w-full"
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <a href="/cmr-admin" className="underline hover:text-foreground">
            Admin access
          </a>
        </p>
      </div>
    </div>
  )
}

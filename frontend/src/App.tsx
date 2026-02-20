import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type HealthState = 'checking' | 'ok' | 'error'

type DraftApiError = {
  error: {
    message: string
    type: string
    detail: string
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

function App() {
  const [notes, setNotes] = useState('')
  const [methods, setMethods] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [health, setHealth] = useState<HealthState>('checking')
  const [healthText, setHealthText] = useState('Checking API...')

  const canSubmit = useMemo(() => notes.trim().length > 0 && !isSubmitting, [notes, isSubmitting])

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/health`)
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`)
        }
        setHealth('ok')
        setHealthText('API healthy')
      } catch {
        setHealth('error')
        setHealthText('API unreachable')
      }
    }

    checkHealth()
  }, [])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    setIsSubmitting(true)
    setErrorMessage('')
    setMethods('')
    setRequestId('')

    try {
      const response = await fetch(`${API_BASE_URL}/v1/draft/methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      })

      const returnedRequestId = response.headers.get('X-Request-ID') ?? ''
      setRequestId(returnedRequestId)

      if (!response.ok) {
        const payload = (await response.json()) as DraftApiError
        const detail = payload?.error?.detail ? `: ${payload.error.detail}` : ''
        throw new Error(`${payload?.error?.message ?? 'Request failed'}${detail}`)
      }

      const payload = (await response.json()) as { methods: string }
      setMethods(payload.methods)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page">
      <div className="aurora" />
      <section className="panel">
        <header className="panel-header">
          <p className="eyebrow">Research OS</p>
          <h1>Methods Draft Studio</h1>
          <p className="subhead">Generate a methods draft from your notes using the API.</p>
          <span className={`health-chip health-${health}`}>{healthText}</span>
        </header>

        <form onSubmit={onSubmit} className="composer">
          <label htmlFor="notes">Study Notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Paste rough protocol notes, instrumentation details, and analysis plan..."
            rows={10}
          />
          <button type="submit" disabled={!canSubmit}>
            {isSubmitting ? 'Generating...' : 'Generate Draft'}
          </button>
        </form>

        {errorMessage && (
          <section className="result error">
            <h2>Request Failed</h2>
            <p>{errorMessage}</p>
          </section>
        )}

        {methods && (
          <section className="result success">
            <h2>Generated Methods</h2>
            <pre>{methods}</pre>
          </section>
        )}

        {requestId && (
          <footer className="trace">
            Request ID: <code>{requestId}</code>
          </footer>
        )}
      </section>
      <section className="api-hint">
        <p>API base URL</p>
        <code>{API_BASE_URL}</code>
      </section>
    </main>
  )
}

export default App

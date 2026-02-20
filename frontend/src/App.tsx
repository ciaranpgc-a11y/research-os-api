import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type HealthState = 'checking' | 'ok' | 'error'

type ApiErrorPayload = {
  error: {
    message: string
    type: string
    detail: string
  }
}

type JournalOption = {
  slug: string
  display_name: string
  default_voice: string
}

type WizardQuestion = {
  id: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

type WizardInferResponse = {
  target_journal: string
  journal_voice: string
  inferred_study_type: string
  inferred_primary_endpoint_type: string
  recommended_sections: string[]
  answered_fields: string[]
  next_questions: WizardQuestion[]
}

type ProjectResponse = {
  id: string
  title: string
  target_journal: string
  journal_voice: string | null
  language: string
  study_type: string | null
  study_brief: string | null
  created_at: string
  updated_at: string
}

type ManuscriptResponse = {
  id: string
  project_id: string
  branch_name: string
  status: string
  sections: Record<string, string>
  created_at: string
  updated_at: string
}

type WizardBootstrapResponse = {
  project: ProjectResponse
  manuscript: ManuscriptResponse
  inference: WizardInferResponse
}

type WizardFieldConfig = {
  id: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

const MANUSCRIPT_GOAL_LABELS: Record<string, string> = {
  generate_full_manuscript: 'Generate full manuscript',
  revise_existing_draft: 'Revise existing draft',
  journal_reformat_existing_draft: 'Reformat existing draft for journal',
}

const DATA_SOURCE_LABELS: Record<string, string> = {
  csv_or_xlsx: 'CSV or XLSX',
  stats_text_output: 'Statistical text output',
  existing_draft: 'Existing draft',
  manual_entry: 'Manual entry',
}

const BASE_WIZARD_FIELDS: WizardFieldConfig[] = [
  {
    id: 'disease_focus',
    label: 'Disease focus',
    kind: 'text',
    required: true,
  },
  {
    id: 'population',
    label: 'Population',
    kind: 'text',
    required: true,
  },
  {
    id: 'primary_outcome',
    label: 'Primary outcome',
    kind: 'text',
    required: true,
  },
  {
    id: 'analysis_summary',
    label: 'Analysis summary',
    kind: 'textarea',
    required: true,
  },
  {
    id: 'key_findings',
    label: 'Key findings',
    kind: 'textarea',
    required: true,
  },
  {
    id: 'manuscript_goal',
    label: 'Manuscript goal',
    kind: 'select',
    required: true,
    options: ['generate_full_manuscript', 'revise_existing_draft', 'journal_reformat_existing_draft'],
  },
  {
    id: 'data_source',
    label: 'Data source',
    kind: 'select',
    required: true,
    options: ['csv_or_xlsx', 'stats_text_output', 'existing_draft', 'manual_entry'],
  },
]

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    const detail = payload?.error?.detail ? `: ${payload.error.detail}` : ''
    return `${payload?.error?.message ?? fallback}${detail}`
  } catch {
    return `${fallback} (${response.status})`
  }
}

function normalizeAnswers(answers: Record<string, string>): Record<string, string> {
  const sanitized = Object.entries(answers).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmed = value.trim()
    if (trimmed) {
      acc[key] = trimmed
    }
    return acc
  }, {})
  return sanitized
}

function formatUtcDate(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return value
  }
  return new Date(timestamp).toLocaleString()
}

function humanizeIdentifier(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').trim()
  if (!normalized) {
    return value
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function prettyOption(value: string, labelMap?: Record<string, string>): string {
  if (labelMap && labelMap[value]) {
    return labelMap[value]
  }
  return humanizeIdentifier(value)
}

function App() {
  const [notes, setNotes] = useState('')
  const [methods, setMethods] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [health, setHealth] = useState<HealthState>('checking')
  const [healthText, setHealthText] = useState('Checking API...')
  const [journals, setJournals] = useState<JournalOption[]>([])
  const [isLoadingJournals, setIsLoadingJournals] = useState(false)
  const [journalsError, setJournalsError] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({
    manuscript_goal: 'generate_full_manuscript',
    data_source: 'manual_entry',
  })
  const [wizardInference, setWizardInference] = useState<WizardInferResponse | null>(null)
  const [wizardBootstrap, setWizardBootstrap] = useState<WizardBootstrapResponse | null>(null)
  const [wizardError, setWizardError] = useState('')
  const [isInferring, setIsInferring] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [projectsError, setProjectsError] = useState('')
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [manuscripts, setManuscripts] = useState<ManuscriptResponse[]>([])
  const [isLoadingManuscripts, setIsLoadingManuscripts] = useState(false)
  const [manuscriptsError, setManuscriptsError] = useState('')

  const canSubmit = useMemo(() => notes.trim().length > 0 && !isSubmitting, [notes, isSubmitting])
  const canBootstrap = useMemo(
    () => projectTitle.trim().length > 0 && targetJournal.trim().length > 0 && !isBootstrapping,
    [isBootstrapping, projectTitle, targetJournal],
  )
  const dynamicQuestionIds = useMemo(() => {
    if (!wizardInference) {
      return new Set<string>()
    }
    const baseFieldIds = new Set(BASE_WIZARD_FIELDS.map((field) => field.id))
    const dynamicIds = wizardInference.next_questions
      .map((question) => question.id)
      .filter((questionId) => !baseFieldIds.has(questionId))
    return new Set(dynamicIds)
  }, [wizardInference])
  const dynamicQuestions = useMemo(() => {
    if (!wizardInference) {
      return [] as WizardQuestion[]
    }
    return wizardInference.next_questions.filter((question) => dynamicQuestionIds.has(question.id))
  }, [dynamicQuestionIds, wizardInference])
  const journalDisplayNameBySlug = useMemo(() => {
    return new Map(journals.map((journal) => [journal.slug, journal.display_name]))
  }, [journals])

  const onWizardAnswerChange = (fieldId: string, value: string) => {
    setWizardAnswers((current) => ({
      ...current,
      [fieldId]: value,
    }))
  }

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    setProjectsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects`)
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load projects'))
      }
      const payload = (await response.json()) as ProjectResponse[]
      setProjects(payload)
      setSelectedProjectId((current) => {
        if (payload.some((project) => project.id === current)) {
          return current
        }
        return payload[0]?.id ?? ''
      })
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : 'Could not load projects')
      setProjects([])
      setSelectedProjectId('')
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  const loadManuscripts = useCallback(async (projectId: string) => {
    setIsLoadingManuscripts(true)
    setManuscriptsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/manuscripts`)
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load manuscripts'))
      }
      const payload = (await response.json()) as ManuscriptResponse[]
      setManuscripts(payload)
    } catch (error) {
      setManuscriptsError(error instanceof Error ? error.message : 'Could not load manuscripts')
      setManuscripts([])
    } finally {
      setIsLoadingManuscripts(false)
    }
  }, [])

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

    const loadJournals = async () => {
      setIsLoadingJournals(true)
      try {
        const response = await fetch(`${API_BASE_URL}/v1/journals`)
        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Could not load journal presets'))
        }
        const payload = (await response.json()) as JournalOption[]
        setJournals(payload)
        setTargetJournal((current) => {
          if (payload.some((journal) => journal.slug === current)) {
            return current
          }
          return payload[0]?.slug ?? 'generic-original'
        })
      } catch (error) {
        setJournalsError(error instanceof Error ? error.message : 'Could not load journal presets')
      } finally {
        setIsLoadingJournals(false)
      }
    }

    checkHealth()
    loadJournals()
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!selectedProjectId) {
      setManuscripts([])
      setManuscriptsError('')
      return
    }
    loadManuscripts(selectedProjectId)
  }, [loadManuscripts, selectedProjectId])

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
        throw new Error(await readApiErrorMessage(response, 'Request failed'))
      }

      const payload = (await response.json()) as { methods: string }
      setMethods(payload.methods)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inferWizard = async () => {
    setWizardError('')
    setWizardBootstrap(null)
    setIsInferring(true)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/wizard/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_journal: targetJournal,
          answers: normalizeAnswers(wizardAnswers),
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not infer wizard state'))
      }
      const payload = (await response.json()) as WizardInferResponse
      setWizardInference(payload)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Could not infer wizard state')
    } finally {
      setIsInferring(false)
    }
  }

  const bootstrapProject = async () => {
    if (!canBootstrap) {
      return
    }
    setWizardError('')
    setIsBootstrapping(true)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/wizard/bootstrap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: projectTitle.trim(),
          target_journal: targetJournal,
          answers: normalizeAnswers(wizardAnswers),
          branch_name: 'main',
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not bootstrap project'))
      }
      const payload = (await response.json()) as WizardBootstrapResponse
      setWizardBootstrap(payload)
      setWizardInference(payload.inference)
      setSelectedProjectId(payload.project.id)
      await loadProjects()
      await loadManuscripts(payload.project.id)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Could not bootstrap project')
    } finally {
      setIsBootstrapping(false)
    }
  }

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  return (
    <main className="page">
      <div className="aurora" />
      <section className="panel">
        <header className="panel-header">
          <p className="eyebrow">Research OS</p>
          <h1>Authoring + Project Wizard</h1>
          <p className="subhead">Draft methods text and bootstrap manuscript projects from one console.</p>
          <span className={`health-chip health-${health}`}>{healthText}</span>
        </header>

        <section className="section-block">
          <h2>Methods Draft Studio</h2>
          <form onSubmit={onSubmit} className="composer">
            <label htmlFor="notes">Study Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste rough protocol notes, instrumentation details, and analysis plan..."
              rows={8}
            />
            <button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Generating...' : 'Generate Draft'}
            </button>
          </form>

          {errorMessage && (
            <section className="result error">
              <h3>Request Failed</h3>
              <p>{errorMessage}</p>
            </section>
          )}

          {methods && (
            <section className="result success">
              <h3>Generated Methods</h3>
              <pre>{methods}</pre>
            </section>
          )}

          {requestId && (
            <footer className="trace">
              Request ID: <code>{requestId}</code>
            </footer>
          )}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <h2>Project Bootstrap Wizard</h2>
          </div>
          <p className="section-note">Infer adapts required questions from your current answers before creating a project.</p>

          <div className="field-grid two-column">
            <label>
              Project title
              <input
                type="text"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="e.g. Heart Failure Registry Manuscript"
              />
            </label>
            <label>
              Target journal
              <select
                value={targetJournal}
                onChange={(event) => setTargetJournal(event.target.value)}
                disabled={isLoadingJournals || journals.length === 0}
              >
                {journals.map((journal) => (
                  <option key={journal.slug} value={journal.slug}>
                    {journal.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {journalsError && (
            <section className="result error compact">
              <p>{journalsError}</p>
            </section>
          )}

          <div className="field-grid">
            {BASE_WIZARD_FIELDS.map((field) => {
              const value = wizardAnswers[field.id] ?? ''
              if (field.kind === 'textarea') {
                return (
                  <label key={field.id} className="wide">
                    {field.label}
                    {field.required ? ' *' : ''}
                    <textarea
                      rows={3}
                      value={value}
                      onChange={(event) => onWizardAnswerChange(field.id, event.target.value)}
                    />
                  </label>
                )
              }
              if (field.kind === 'select') {
                return (
                  <label key={field.id}>
                    {field.label}
                    {field.required ? ' *' : ''}
                    <select value={value} onChange={(event) => onWizardAnswerChange(field.id, event.target.value)}>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {prettyOption(
                            option,
                            field.id === 'manuscript_goal' ? MANUSCRIPT_GOAL_LABELS : DATA_SOURCE_LABELS,
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              return (
                <label key={field.id}>
                  {field.label}
                  {field.required ? ' *' : ''}
                  <input type="text" value={value} onChange={(event) => onWizardAnswerChange(field.id, event.target.value)} />
                </label>
              )
            })}
            {dynamicQuestions.map((question) => {
              const value = wizardAnswers[question.id] ?? ''
              if (question.kind === 'select') {
                return (
                  <label key={question.id}>
                    {question.label}
                    {question.required ? ' *' : ''}
                    <select value={value} onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}>
                      <option value="">Select...</option>
                      {(question.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {prettyOption(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (question.kind === 'textarea') {
                return (
                  <label key={question.id} className="wide">
                    {question.label}
                    {question.required ? ' *' : ''}
                    <textarea
                      rows={3}
                      value={value}
                      onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}
                    />
                  </label>
                )
              }
              return (
                <label key={question.id}>
                  {question.label}
                  {question.required ? ' *' : ''}
                  <input
                    type="text"
                    value={value}
                    onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}
                  />
                </label>
              )
            })}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="ghost-button"
              onClick={inferWizard}
              disabled={isInferring || isBootstrapping || targetJournal.trim().length === 0}
            >
              {isInferring ? 'Inferring...' : 'Infer Wizard State'}
            </button>
            <button type="button" onClick={bootstrapProject} disabled={!canBootstrap}>
              {isBootstrapping ? 'Bootstrapping...' : 'Bootstrap Project + Manuscript'}
            </button>
          </div>

          {wizardError && (
            <section className="result error compact">
              <p>{wizardError}</p>
            </section>
          )}

          {wizardInference && (
            <section className="result info">
              <h3>Inference Snapshot</h3>
              <p>
                Study type: <strong>{humanizeIdentifier(wizardInference.inferred_study_type)}</strong>
              </p>
              <p>
                Endpoint type: <strong>{humanizeIdentifier(wizardInference.inferred_primary_endpoint_type)}</strong>
              </p>
              <p>
                Recommended sections: <code>{wizardInference.recommended_sections.join(', ')}</code>
              </p>
              <p>
                Answered fields: <strong>{wizardInference.answered_fields.length}</strong>
              </p>
              {wizardInference.next_questions.length > 0 && (
                <p>
                  Next required fields:{' '}
                  <code>
                    {wizardInference.next_questions.map((question) => humanizeIdentifier(question.id)).join(', ')}
                  </code>
                </p>
              )}
            </section>
          )}

          {wizardBootstrap && (
            <section className="result success">
              <h3>Project Bootstrapped</h3>
              <p>
                Project: <code>{wizardBootstrap.project.id}</code>
              </p>
              <p>
                Manuscript: <code>{wizardBootstrap.manuscript.id}</code>
              </p>
              <p>
                Branch: <code>{wizardBootstrap.manuscript.branch_name}</code>
              </p>
            </section>
          )}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <h2>Project Library</h2>
            <button type="button" className="ghost-button" onClick={loadProjects} disabled={isLoadingProjects}>
              {isLoadingProjects ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {projectsError && (
            <section className="result error compact">
              <p>{projectsError}</p>
            </section>
          )}

          {projects.length === 0 ? (
            <p className="muted">No projects found yet.</p>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  className={`project-item ${project.id === selectedProjectId ? 'selected' : ''}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.title}</strong>
                  <span>{journalDisplayNameBySlug.get(project.target_journal) ?? humanizeIdentifier(project.target_journal)}</span>
                  <span>Updated {formatUtcDate(project.updated_at)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedProject && (
            <section className="result info">
              <h3>Manuscripts for {selectedProject.title}</h3>
              {isLoadingManuscripts && <p>Loading manuscripts...</p>}
              {manuscriptsError && <p>{manuscriptsError}</p>}
              {!isLoadingManuscripts && !manuscriptsError && manuscripts.length === 0 && <p>No manuscripts yet.</p>}
              {!isLoadingManuscripts && !manuscriptsError && manuscripts.length > 0 && (
                <ul className="manuscript-list">
                  {manuscripts.map((manuscript) => (
                    <li key={manuscript.id}>
                      <span>
                        {manuscript.branch_name} ({manuscript.status})
                      </span>
                      <code>{Object.keys(manuscript.sections).join(', ')}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      </section>
      <section className="api-hint">
        <p>API base URL</p>
        <code>{API_BASE_URL}</code>
      </section>
    </main>
  )
}

export default App

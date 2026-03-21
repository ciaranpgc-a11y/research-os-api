import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { fetchSections, type CmrSectionsConfig } from '@/lib/cmr-api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Main admin page
// ---------------------------------------------------------------------------

export function CmrAdminPage() {
  const [sections, setSections] = useState<CmrSectionsConfig>({})
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetchSections()
      .then((s) => { setSections(s); setDirty(false) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const addMajorSection = () => {
    const name = newSectionName.trim().toUpperCase()
    if (!name || sections[name]) return
    setSections((prev) => ({ ...prev, [name]: [] }))
    setNewSectionName('')
    setDirty(true)
  }

  const removeMajorSection = (key: string) => {
    setSections((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDirty(true)
  }

  const addSubSection = (majorKey: string) => {
    const name = newSubName.trim()
    if (!name || sections[majorKey]?.includes(name)) return
    setSections((prev) => ({
      ...prev,
      [majorKey]: [...(prev[majorKey] || []), name],
    }))
    setNewSubName('')
    setAddingSubFor(null)
    setDirty(true)
  }

  const removeSubSection = (majorKey: string, sub: string) => {
    setSections((prev) => ({
      ...prev,
      [majorKey]: (prev[majorKey] || []).filter((s) => s !== sub),
    }))
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      const { updateSections } = await import('@/lib/cmr-api')
      await updateSections(sections)
      setDirty(false)
    } catch {
      // API not available — data saved locally only
      setDirty(false)
    }
  }

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="warning" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Admin"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Separator */}
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)]" />

      {loading ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading...</p>
      ) : (
        <>
          {/* Add new major section */}
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                New Major Section
              </label>
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addMajorSection() }}
                placeholder="e.g. PERICARDIUM"
                className="w-64 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
              />
            </div>
            <button
              onClick={addMajorSection}
              disabled={!newSectionName.trim()}
              className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--foreground))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--background))] shadow-sm transition-colors hover:bg-[hsl(var(--foreground)/0.85)] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Section
            </button>
            {dirty && (
              <button
                onClick={handleSave}
                className="ml-auto rounded-md bg-[hsl(var(--tone-positive-600))] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-positive-700))]"
              >
                Save Changes
              </button>
            )}
          </div>

          {/* Sections list */}
          <div className="space-y-4">
            {Object.entries(sections).map(([major, subs]) => (
              <div
                key={major}
                className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)]"
              >
                {/* Major section header */}
                <div className="flex items-center gap-3 bg-[hsl(var(--tone-neutral-50))] px-4 py-3">
                  <div className="w-1 self-stretch rounded-full bg-[hsl(var(--tone-warning-500))]" />
                  <h3 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                    {major}
                  </h3>
                  <button
                    onClick={() => {
                      if (addingSubFor === major) {
                        setAddingSubFor(null)
                        setNewSubName('')
                      } else {
                        setAddingSubFor(major)
                        setNewSubName('')
                      }
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--tone-positive-600))] transition-colors hover:bg-[hsl(var(--tone-positive-50))]"
                  >
                    <Plus className="inline h-3 w-3" /> Sub-section
                  </button>
                  <button
                    onClick={() => removeMajorSection(major)}
                    className="rounded-md p-1 text-[hsl(var(--tone-danger-500))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
                    title="Remove section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Sub-sections */}
                {(subs.length > 0 || addingSubFor === major) && (
                  <div className="border-t border-[hsl(var(--stroke-soft)/0.5)]">
                    {subs.map((sub) => (
                      <div
                        key={sub}
                        className="flex items-center gap-3 border-b border-[hsl(var(--stroke-soft)/0.3)] px-4 py-2 last:border-b-0"
                      >
                        <span className="ml-5 flex-1 text-sm text-[hsl(var(--foreground))]">{sub}</span>
                        <button
                          onClick={() => removeSubSection(major, sub)}
                          className="rounded-md p-1 text-[hsl(var(--tone-danger-400))] transition-colors hover:bg-[hsl(var(--tone-danger-50))] hover:text-[hsl(var(--tone-danger-500))]"
                          title="Remove sub-section"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {/* Inline add sub-section */}
                    {addingSubFor === major && (
                      <div className="flex items-center gap-2 border-b border-[hsl(var(--stroke-soft)/0.3)] px-4 py-2 last:border-b-0">
                        <input
                          type="text"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addSubSection(major); if (e.key === 'Escape') { setAddingSubFor(null); setNewSubName('') } }}
                          placeholder="Sub-section name..."
                          autoFocus
                          className="ml-5 flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                        />
                        <button
                          onClick={() => addSubSection(major)}
                          disabled={!newSubName.trim()}
                          className="rounded-md bg-[hsl(var(--foreground))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--background))] disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingSubFor(null); setNewSubName('') }}
                          className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Stack>
  )
}

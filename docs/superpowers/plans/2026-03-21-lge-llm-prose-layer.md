# LGE LLM Prose Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Generate Summary" button to the LGE Analysis page that sends structured segment data to an LLM endpoint and replaces the deterministic summary with natural clinical prose, with revert capability.

**Architecture:** A new `buildLgeSummaryData()` function extracts structured facts from the existing segment/pattern state. A new Vite middleware endpoint (`POST /api/cmr-lge-prose`) sends this data to OpenAI gpt-4o with a clinical reporting system prompt. The UI adds a Generate Summary button, loading state, editable textarea for LLM output, and a revert link.

**Tech Stack:** React, TypeScript, Vite dev middleware, OpenAI gpt-4o API

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/lib/lge-summary-data.ts` | `LgeSummaryData` type + `buildLgeSummaryData()` function |
| Modify | `frontend/vite.config.ts` (lines 130-224 area) | Add `POST /api/cmr-lge-prose` endpoint |
| Modify | `frontend/src/pages/cmr-lge-page.tsx` (lines 762-795) | Add Generate Summary button, loading state, editable output, revert |

---

### Task 1: Create `buildLgeSummaryData` function

**Files:**
- Create: `frontend/src/lib/lge-summary-data.ts`

This function mirrors the classification logic in `generateLgeSummary` (cmr-lge-page.tsx:260-445) but outputs structured data instead of prose. It needs access to the same types (`LgeCode`, `PatternCode`, `SegmentMeta`, `SEGMENT_META`) and territory mapping logic.

- [ ] **Step 1: Create the `LgeSummaryData` type and `buildLgeSummaryData` function**

```typescript
// frontend/src/lib/lge-summary-data.ts

// Re-declare the types needed (these are local to cmr-lge-page.tsx)
type LgeCode = 0 | 1 | 2 | 3 | 4
type PatternCode = 0 | 1 | 2 | 3 | 4
type SegmentMeta = { level: string; wall: string; territory: 'LAD' | 'RCA' | 'LCx' }

const SEGMENT_META: Record<number, SegmentMeta> = {
  1: { level: 'Basal', wall: 'Anterior', territory: 'LAD' },
  2: { level: 'Basal', wall: 'Anteroseptal', territory: 'LAD' },
  3: { level: 'Basal', wall: 'Inferoseptal', territory: 'RCA' },
  4: { level: 'Basal', wall: 'Inferior', territory: 'RCA' },
  5: { level: 'Basal', wall: 'Inferolateral', territory: 'LCx' },
  6: { level: 'Basal', wall: 'Anterolateral', territory: 'LCx' },
  7: { level: 'Mid', wall: 'Anterior', territory: 'LAD' },
  8: { level: 'Mid', wall: 'Anteroseptal', territory: 'LAD' },
  9: { level: 'Mid', wall: 'Inferoseptal', territory: 'RCA' },
  10: { level: 'Mid', wall: 'Inferior', territory: 'RCA' },
  11: { level: 'Mid', wall: 'Inferolateral', territory: 'LCx' },
  12: { level: 'Mid', wall: 'Anterolateral', territory: 'LCx' },
  13: { level: 'Apical', wall: 'Anterior', territory: 'LAD' },
  14: { level: 'Apical', wall: 'Septal', territory: 'LAD' },
  15: { level: 'Apical', wall: 'Inferior', territory: 'RCA' },
  16: { level: 'Apical', wall: 'Lateral', territory: 'LCx' },
  17: { level: 'Apex', wall: 'Apex', territory: 'LAD' },
}

export type LgeSummaryData = {
  deterministicText: string

  segments: {
    name: string
    pattern: number  // 0=unspecified, 1=subendo, 2=mid-wall, 3=subepi, 4=transmural
    transmurality: number // 0-4
    territory: string
    wall: string
    level: string
  }[]

  territories: Record<string, {
    segments: string[]
    patterns: number[]
    transRange: [number, number]
  }>

  isDiffuse: boolean
  nonIschaemicSegments: { segments: string[], pattern: number }[]
  viability: { viable: string[], nonViable: string[] } | null
}

export function buildLgeSummaryData(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
  deterministicText: string,
): LgeSummaryData {
  const segments: LgeSummaryData['segments'] = []
  for (let seg = 1; seg <= 17; seg++) {
    if (segStates[seg] > 0) {
      const meta = SEGMENT_META[seg]
      segments.push({
        name: `${meta.level.toLowerCase()} ${meta.wall.toLowerCase()}`,
        pattern: patternStates[seg],
        transmurality: segStates[seg],
        territory: meta.territory,
        wall: meta.wall.toLowerCase(),
        level: meta.level.toLowerCase(),
      })
    }
  }

  // Build territory groupings from ischaemic segments (pattern 1 or 4)
  const ischaemic = segments.filter(s => s.pattern === 1 || s.pattern === 4)
  const territories: LgeSummaryData['territories'] = {}
  for (const s of ischaemic) {
    if (!territories[s.territory]) {
      territories[s.territory] = { segments: [], patterns: [], transRange: [5, 0] as [number, number] }
    }
    const t = territories[s.territory]
    t.segments.push(s.name)
    if (!t.patterns.includes(s.pattern)) t.patterns.push(s.pattern)
    if (s.transmurality < t.transRange[0]) t.transRange[0] = s.transmurality
    if (s.transmurality > t.transRange[1]) t.transRange[1] = s.transmurality
  }

  // Diffuse detection
  const allThreeTerritories = Object.keys(territories).length === 3
  const isDiffuse = allThreeTerritories && ischaemic.length >= 12

  // Non-ischaemic grouping (patterns 2 and 3)
  const nonIschaemicSegments: LgeSummaryData['nonIschaemicSegments'] = []
  for (const patCode of [2, 3]) {
    const group = segments.filter(s => s.pattern === patCode)
    if (group.length > 0) {
      nonIschaemicSegments.push({ segments: group.map(s => s.name), pattern: patCode })
    }
  }

  // Viability (null when no ischaemic or diffuse)
  let viability: LgeSummaryData['viability'] = null
  if (ischaemic.length > 0 && !isDiffuse) {
    const viable = ischaemic.filter(s => s.transmurality <= 2).map(s => s.name)
    const nonViable = ischaemic.filter(s => s.transmurality >= 3).map(s => s.name)
    if (viable.length > 0 || nonViable.length > 0) {
      viability = { viable, nonViable }
    }
  }

  return {
    deterministicText,
    segments,
    territories,
    isDiffuse,
    nonIschaemicSegments,
    viability,
  }
}
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `lge-summary-data.ts`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/lge-summary-data.ts
git commit -m "feat(lge): add buildLgeSummaryData for structured LLM input"
```

---

### Task 2: Add `/api/cmr-lge-prose` endpoint

**Files:**
- Modify: `frontend/vite.config.ts` (add new middleware after the existing `/api/cmr-extract` block, around line 224)

The endpoint follows the exact same pattern as the existing `/api/cmr-extract` middleware. It receives `LgeSummaryData` JSON, sends it to OpenAI gpt-4o with a clinical system prompt, and returns the prose text.

- [ ] **Step 1: Add the LGE prose endpoint middleware**

Insert a new `server.middlewares.use(...)` block after the existing `/api/cmr-extract` middleware (after line 224 in vite.config.ts). The system prompt should instruct the LLM to:
- Rewrite the deterministic text into natural SCMR-style clinical prose
- Use the structured segment data as ground truth
- Never invent findings not present in the data
- Combine related findings naturally rather than listing them
- Use appropriate clinical terminology and natural sentence flow

```typescript
// POST /api/cmr-lge-prose → LLM prose rewrite of LGE summary
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/api/cmr-lge-prose' || req.method !== 'POST') return next()

  try {
    const summaryData = JSON.parse(await readBody(req))

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      jsonRes(res, { error: 'OPENAI_API_KEY not set' }, 500)
      return
    }

    const systemPrompt = `You are an expert cardiac MRI reporting physician. Your task is to rewrite a structured LGE (Late Gadolinium Enhancement) summary into natural, fluent clinical prose suitable for an SCMR-style report.

RULES:
1. Use ONLY the findings present in the provided data. Never invent or infer findings.
2. Combine related findings into flowing sentences rather than listing them mechanically.
3. Use standard SCMR terminology: "late gadolinium enhancement", "transmurality", "subendocardial", "mid-wall", "subepicardial", "transmural".
4. For coronary territories, use full names: "left anterior descending", "right coronary artery", "left circumflex".
5. When describing transmurality ranges, use the percentage bands: 1-25%, 26-50%, 51-75%, 76-100%.
6. Viability language: >50% transmurality = "non-viable myocardium", <50% = "viable myocardium amenable to revascularisation".
7. For diffuse patterns, do NOT include viability statements.
8. Keep the LGE score index sentence at the end.
9. Output ONLY the rewritten summary text. No preamble, no markdown, no explanation.

You will receive a JSON object containing:
- "deterministicText": the current engine-generated summary (use as a starting point)
- "segments": array of enhanced segments with their metadata
- "territories": grouped ischaemic territory data
- "isDiffuse": boolean flag for diffuse enhancement patterns
- "nonIschaemicSegments": non-ischaemic pattern groups
- "viability": viable/non-viable segment classification (null if suppressed)`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(summaryData) },
        ],
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.text()
      jsonRes(res, { error: `OpenAI API error: ${err}` }, 500)
      return
    }

    const completion = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const prose = completion.choices[0].message.content.trim()

    jsonRes(res, { prose })
  } catch (e) {
    jsonRes(res, { error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Verify vite.config.ts has no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in vite.config.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat(lge): add /api/cmr-lge-prose endpoint for LLM summary rewrite"
```

---

### Task 3: Add UI controls for LLM prose generation

**Files:**
- Modify: `frontend/src/pages/cmr-lge-page.tsx` (component section, lines 472-795)

This task adds:
1. Import `buildLgeSummaryData` from the new lib file
2. State for LLM prose (`llmProse`, `isGenerating`, `llmError`)
3. A `handleGenerate` function that calls the endpoint
4. UI: "Generate Summary" button, loading state, editable textarea, revert link, error display

- [ ] **Step 1: Add import for `buildLgeSummaryData`**

At the top of `cmr-lge-page.tsx` (after line 6), add:

```typescript
import { buildLgeSummaryData } from '@/lib/lge-summary-data'
```

- [ ] **Step 2: Add LLM prose state variables**

Inside the `CmrLgePage` component, after the existing `hoveredSeg` state (line 488), add:

```typescript
const [llmProse, setLlmProse] = useState<string | null>(null)
const [isGenerating, setIsGenerating] = useState(false)
const [llmError, setLlmError] = useState<string | null>(null)
```

- [ ] **Step 3: Add `handleGenerate` callback**

After the `resetAll` callback (line 533), add:

```typescript
const handleGenerate = useCallback(async () => {
  setIsGenerating(true)
  setLlmError(null)
  try {
    const data = buildLgeSummaryData(segStates, patternStates, summary.text)
    const res = await fetch('/api/cmr-lge-prose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const { prose } = await res.json()
    setLlmProse(prose)
  } catch (e) {
    setLlmError(e instanceof Error ? e.message : String(e))
  } finally {
    setIsGenerating(false)
  }
}, [segStates, patternStates, summary.text])
```

- [ ] **Step 4: Update `resetAll` to clear LLM state**

In the `resetAll` callback (line 524-533), add before the closing `}, []`:

```typescript
setLlmProse(null)
setLlmError(null)
```

Also update the dependency array to `[]` (it should remain empty since setters are stable).

- [ ] **Step 5: Replace the summary display section**

Replace the segment summary `<div>` (lines 762-792) with the updated UI that includes the Generate Summary button, editable textarea when LLM prose is active, and revert link:

```tsx
{/* ── Segment summary ── */}
<div className="rounded-lg border border-border bg-muted/30 p-4">
  <div className="flex items-center gap-2 mb-2 flex-wrap">
    <span className="text-xs font-semibold tracking-wider text-muted-foreground">SEGMENT SUMMARY</span>
    {summary.enhancedCount > 0 && (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: 'hsl(350 60% 48%)' }}>
        {summary.enhancedCount}/17 ENHANCED
      </span>
    )}
    {summary.scoreIndex > 0 && (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-foreground bg-muted">
        INDEX {summary.scoreIndex.toFixed(2)}
      </span>
    )}
    {Object.entries(patternCounts).map(([code, count]) => (
      <span
        key={code}
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{
          backgroundColor: LGE_PATTERNS[Number(code)].strokeColor,
          color: Number(code) === 4 ? 'white' : 'black',
        }}
      >
        {count} {LGE_PATTERNS[Number(code)].label}
      </span>
    ))}
  </div>

  {llmProse !== null ? (
    <textarea
      className="w-full min-h-[80px] bg-transparent text-sm leading-relaxed text-muted-foreground resize-y border-0 outline-none p-0"
      value={llmProse}
      onChange={(e) => setLlmProse(e.target.value)}
    />
  ) : (
    <p className="text-sm leading-relaxed text-muted-foreground">
      {summary.text}
    </p>
  )}

  {llmError && (
    <p className="mt-2 text-xs text-red-500">{llmError}</p>
  )}

  <div className="flex items-center gap-3 mt-3">
    <button
      type="button"
      disabled={summary.enhancedCount === 0 || isGenerating}
      onClick={handleGenerate}
      className={cn(
        'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
        'bg-foreground text-background hover:bg-foreground/90',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {isGenerating ? 'Generating…' : 'Generate Summary'}
    </button>
    {llmProse !== null && (
      <button
        type="button"
        onClick={() => { setLlmProse(null); setLlmError(null) }}
        className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
      >
        Revert to original
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Verify no TypeScript errors**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/cmr-lge-page.tsx
git commit -m "feat(lge): add Generate Summary button with LLM prose, revert, and editing"
```

---

### Task 4: Manual integration test

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`
Verify: Server starts without errors

- [ ] **Step 2: Test with no enhancement**

Open the LGE page. Verify the "Generate Summary" button is visible but disabled (greyed out) when no segments are enhanced.

- [ ] **Step 3: Test with enhancement**

Paint a few segments with transmurality and patterns. Verify:
- The deterministic summary updates as before
- The "Generate Summary" button becomes enabled
- Clicking it shows "Generating…" text
- After response, the summary area shows the LLM prose in an editable textarea
- A "Revert to original" link appears

- [ ] **Step 4: Test revert**

Click "Revert to original". Verify:
- The textarea disappears and the deterministic text returns
- The revert link disappears

- [ ] **Step 5: Test re-generate**

Edit the LLM text in the textarea, then click "Generate Summary" again. Verify the textarea is replaced with fresh LLM output (edits discarded).

- [ ] **Step 6: Test error handling**

Temporarily remove `OPENAI_API_KEY` from the environment and click Generate. Verify an error message appears and the deterministic text remains visible.

- [ ] **Step 7: Commit if any fixes were needed**

```bash
git add -u
git commit -m "fix(lge): address integration test findings"
```

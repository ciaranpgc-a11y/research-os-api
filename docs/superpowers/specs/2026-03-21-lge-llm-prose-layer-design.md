# LGE LLM Prose Layer — Design Spec

## Overview

Add an optional LLM prose generation layer to the LGE Analysis page. The deterministic summary engine remains the source of truth; the LLM rewrites its output into natural clinical prose suitable for SCMR-style reporting.

## Architecture

**Hybrid approach**: deterministic engine extracts structured facts → LLM rewrites into natural clinical prose.

- A new `buildLgeSummaryData(segStates, patternStates)` function is created alongside the existing `generateLgeSummary`. It reuses the same segment metadata and territory mapping but outputs the structured `LgeSummaryData` object. The deterministic text is included as a field so the LLM has both representations.
- The LLM receives both the deterministic text and structured data. It uses the structured data as ground truth and the deterministic text as a starting point, producing fluent prose that combines related findings naturally.
- The LLM never invents findings — it can only rephrase and restructure what the engine provides.

## Data Flow

The deterministic engine produces a `LgeSummaryData` object:

```typescript
type LgeSummaryData = {
  deterministicText: string

  segments: {
    name: string        // "basal anterior"
    pattern: number     // 0=unspecified, 1=subendo, 2=mid-wall, 3=subepi, 4=transmural
    transmurality: number // 0-4
    territory: string   // "LAD" | "RCA" | "LCx"
    wall: string
    level: string
  }[]

  territories: Record<string, {
    segments: string[]
    patterns: number[]
    transRange: [number, number]
  }>

  isDiffuse: boolean
  nonIschaemicSegments: { segments: string[], pattern: number }[] // One entry per non-ischaemic pattern (2=mid-wall, 3=subepi)
  viability: { viable: string[], nonViable: string[] } | null     // null when no ischaemic segments or isDiffuse is true
}
```

This is sent as the request body to the LLM endpoint.

## LLM Integration

- **Endpoint**: `POST /api/cmr-lge-prose` (Vite dev server middleware, same pattern as existing `/api/cmr-extract`)
- **Model**: OpenAI `gpt-4o` via `OPENAI_API_KEY` env var (already configured)
- **System prompt**: Clinical reporting style guide — SCMR conventions, no invented findings, natural flow over list-like structure. Prompt to be drafted during implementation and iterated separately
- **User message**: The `LgeSummaryData` JSON
- **Response**: Plain text prose string

## UI Behaviour

- **Default state**: Deterministic summary displayed as currently implemented
- **"Generate Summary" button**: Near the summary output, consistent with existing CMR button styles. Disabled when no segments are enhanced or when a request is in-flight
- **Loading state**: Button text becomes "Generating..." with spinner. Summary area unchanged until response arrives
- **LLM result state**: Summary text replaced inline with LLM prose. A "Revert to original" link appears below. Text becomes editable (textarea pre-filled with LLM output)
- **Revert**: Restores deterministic text, hides revert link, returns to read-only display
- **Re-generate**: Clicking "Generate Summary" again produces fresh LLM prose from current segment state. Any manual edits are discarded without confirmation
- **Error handling**: Toast/inline error on failure, deterministic text remains visible
- **Copy**: Existing copy mechanism works on whatever text is currently displayed

## Out of Scope

- Persisting LLM-generated text across page reloads
- Multiple LLM model options
- Prompt editing UI
- Batch generation across multiple reports

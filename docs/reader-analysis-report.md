# Reader Functionality — Full Analysis & Remediation Plan

## Executive Summary

The reader has a solid architectural foundation — a two-mode (structured/PDF) viewer with a three-column layout, GROBID-based parsing, and a rich navigation sidebar. However, there are significant issues across **five domains**: figure/table content delivery, inline citations, section ordering, visual consistency, and data pipeline reliability. This report catalogs every issue found and proposes a phased remediation plan using an orchestrated multi-agent approach.

---

## Part 1: Issue Catalog

### 1. Figures

| # | Issue | Severity | Location |
|---|---|---|---|
| F1 | **Figure images often missing** — `image_data` only populates when PyMuPDF (`fitz`) is installed AND GROBID returns usable `graphic_coords`. If either is absent, figures render as title+caption cards with no image. | Critical | `_crop_figure_images_from_pdf` (L6772–6813) |
| F2 | **Only first coordinate entry cropped** — multi-region figures (spanning two columns or pages) only get one region. | Medium | `_crop_figure_images_from_pdf` (L6796) |
| F3 | **`graphic_coords` falls back to `coords`** — the `coords` attribute on `<figure>` includes the caption bounding box, producing noisy crops that include caption text in the image. | Medium | `_crop_figure_images_from_pdf` (L6790–6795) |
| F4 | **2KB minimum filter too aggressive** — small diagrams, icons, and schematic figures under 2KB are silently discarded. | Low | `_FIGURE_CROP_MIN_BYTES = 2048` (L6750) |
| F5 | **No image for parsed figures with no coords** — when GROBID provides no coordinates at all, there's no fallback strategy (e.g., Docling-based figure extraction). | Medium | Pipeline gap |
| F6 | **Inline figures max-height inconsistency** — card view uses `max-h-[280px]`, inline uses `max-h-[400px]`, lightbox uses `max-h-[82vh]`. Landscape figures in the card view are very small. | Low | Profile-publications-page styling |

### 2. Tables

| # | Issue | Severity | Location |
|---|---|---|---|
| T1 | **`structured_html` requires Docling** — if Docling isn't installed (it's import-guarded), all tables render as empty cards with only title+caption. No fallback to GROBID's own `<table>` markup. | Critical | `_extract_docling_tables_html` (L6816–6870) |
| T2 | **Docling table matching is page-only** — matches GROBID tables to Docling tables using only page number + row count. Two tables on the same page with the same row count can be swapped. | High | `_match_docling_tables_to_assets` (L6873–6901) |
| T3 | **GROBID's own table HTML is discarded** — GROBID produces `<table><row><cell>` markup inside each `<figure type="table">`, but the extraction code ignores this structured content entirely. This could serve as a reliable fallback when Docling is unavailable. | High | `_extract_publication_paper_assets_from_tei` |
| T4 | **Docling processes entire PDF** — even if the paper has only one table, Docling converts the full document. This is expensive and slow. | Medium | `_extract_docling_tables_html` (L6830) |
| T5 | **Dual table CSS creates conflicts** — `.publication-structured-table` rules in `index.css` use full `border: 1px solid` on all cell sides, while Tailwind overrides use `border-b` only. Both apply, producing doubled bottom borders and inconsistent side borders. | Medium | `index.css` L5638 + `PUBLICATION_STRUCTURED_TABLE_CLASS_NAME` L248 |

### 3. Inline Citations & References

| # | Issue | Severity | Location |
|---|---|---|---|
| C1 | **No inline-to-reference linking from GROBID** — GROBID TEI contains `<ref type="bibr" target="#b0">` elements that link in-text citations to bibliography entries, but the section text extractor flattens all XML to plain text, losing these links. | Critical | `_tei_section_blocks` / section text extraction |
| C2 | **Citation regex is fragile** — the frontend regex `\[(\d+...)\]` only matches bracket-number style citations. Author-year (`(Smith 2020)`), superscript, and other citation styles are entirely unsupported. | High | `renderPublicationReaderParagraphWithReferences` (L7309) |
| C3 | **Reference entries are raw text only** — GROBID extracts structured fields (authors, title, year, DOI, journal) from `<biblStruct>`, but the parser discards all of it and keeps only concatenated raw text. | High | `_extract_publication_paper_reference_entries_from_tei` (L5810) |
| C4 | **Reference labels are generic** — "Reference 1", "Reference 2" regardless of the paper's actual numbering scheme. | Medium | `_extract_publication_paper_reference_entries_from_tei` (L5838) |
| C5 | **Citation popover positioning can overflow** — positioned at click coordinates without viewport boundary clamping. On narrow viewports or right-edge clicks, the popover can extend off-screen. | Low | Reference popover portal (L10081) |

### 4. Section Ordering & Structure

| # | Issue | Severity | Location |
|---|---|---|---|
| S1 | **Sections rely on GROBID parse order** — if GROBID miorders sections (common with multi-column layouts), the reader inherits the error. No post-hoc reordering by page position. | Medium | `_refine_publication_paper_sections` |
| S2 | **Fallback sections from unknown groups land at the end** — sections that don't match known `canonical_kind` values (abstract, introduction, etc.) fall to the bottom of the structured view, even if they appear early in the paper (e.g., "Background" before "Methods"). | Medium | `PUBLICATION_READER_STRUCTURED_GROUP_ORDER` + frontend grouping |
| S3 | **Section page ranges have gaps** — `page_end` is set to `next_section.page_start - 1`, which can create page gaps if two consecutive sections start pages apart. Assets in those gap pages become unplaced. | Medium | `_align_structured_publication_sections_to_pdf_pages` (L5370) |
| S4 | **Inline asset placement uses page overlap only** — figures/tables are matched to sections by page-range overlap, not by proximity in the text or GROBID's section-level grouping. Two assets on the same page go to the same section even if one belongs to the next. | Medium | `selectedPaperInlineAssetsBySectionId` memo (L4888) |

### 5. Visual & UX Polish

| # | Issue | Severity | Location |
|---|---|---|---|
| V1 | **Inline asset border colors diverge from navigator group tones** — tables use `accent-400` (blue) inline but `#186e83` (teal) in the navigator; figures use `positive-400` (green) inline but `#a14c73` (pink) in the navigator. | Low | Profile-publications-page styling |
| V2 | **Navigator groups default to collapsed** — all outline groups start collapsed (`publicationReaderCollapsedNodeIds[group.id] ?? true`), requiring manual expansion. First-time users see only group labels with no sub-items visible. | Medium | Navigator render (L7528) |
| V3 | **No empty state for missing figures/tables** — if no figures or tables are found, the right panel sections simply don't render. No message explaining why. | Low | Right panel asset groups |
| V4 | **Reference popover has no scroll constraint** — papers with long reference text can produce popovers taller than the viewport. | Low | Reference popover (L10081) |
| V5 | **`--tone-neutral-150` and `--tone-neutral-250` may be undefined** — these intermediate tone stops are used throughout borders but weren't found in the `:root` CSS variable definitions. They may render as transparent. | Medium | `index.css` variable definitions |

---

## Part 2: Root Cause Analysis

The issues cluster around three root causes:

### A. GROBID Data Not Fully Utilized
GROBID produces rich structured data — inline citation links (`<ref target="#b0">`), structured bibliography fields (authors/title/year/DOI), table cell markup (`<table><row><cell>`), and section-level figure grouping. The current parser treats TEI XML as a bag of text, extracting only plain-text content and discarding structural relationships. This single root cause drives issues **C1, C3, C4, T3**.

### B. Optional Dependencies Create Silent Degradation
PyMuPDF (figure cropping) and Docling (table HTML) are import-guarded optionals. When absent, figures become image-less cards and tables become content-less cards — with no user-visible explanation. This drives **F1, T1** and contributes to the overall "tables don't show" problem.

### C. Page-Based Heuristics Are Fragile
Asset placement, section ordering, and table matching all rely on page-number heuristics. When GROBID coordinates are missing (very common for tables), the fallback text-search alignment can place assets on wrong pages, which cascades into wrong section assignments. This drives **S3, S4, T2**.

---

## Part 3: Remediation Plan — Agent Architecture

### Proposed Agent Structure

```
┌─────────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT                      │
│  Coordinates work, validates integration, runs       │
│  cross-cutting checks (types, lint, tests)           │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
  ┌────▼────┐ ┌──▼───┐ ┌───▼───┐ ┌───▼────┐
  │ Agent 1 │ │Agt 2 │ │Agt 3  │ │Agt 4   │
  │ TEI     │ │Asset │ │Visual │ │Citation│
  │ Parser  │ │Render│ │Polish │ │System  │
  └─────────┘ └──────┘ └───────┘ └────────┘
```

| Agent | Scope | Files Touched |
|-------|-------|---------------|
| **Orchestrator** | Sequences phases, runs `Checks: Full Health` between phases, manages shared types | `types/impact.ts`, `schemas.py`, task runners |
| **Agent 1 — TEI Parser** | Backend GROBID TEI extraction improvements | `publication_console_service.py` |
| **Agent 2 — Asset Rendering** | Frontend figure/table display and content delivery | `profile-publications-page.tsx`, `index.css` |
| **Agent 3 — Visual Polish** | CSS consistency, navigator UX, empty states | `profile-publications-page.tsx`, `index.css` |
| **Agent 4 — Citation System** | Inline citations end-to-end (backend extraction → frontend rendering) | `publication_console_service.py`, `profile-publications-page.tsx`, `schemas.py` |

---

### Phase 1: Foundation — TEI Parser (Agent 1)

**Goal**: Extract all available GROBID data without discarding structural relationships.

| Task | Issues Fixed | Effort |
|------|-------------|--------|
| 1a. Extract GROBID `<table><row><cell>` markup as HTML fallback for `structured_html` when Docling is unavailable | T1, T3 | Medium |
| 1b. Parse `<biblStruct>` fields (authors, title, year, DOI, journal) into structured reference objects | C3, C4 | Medium |
| 1c. Preserve `<ref type="bibr" target="#bN">` links during section text extraction — emit inline citation markers with reference IDs | C1 | High |
| 1d. Use GROBID's original reference label (from `<label>` or `xml:id`) instead of generic "Reference N" | C4 | Low |
| 1e. Remove dead `tag_name == "table"` code path (already done) | — | Done |

**Validation**: Re-parse a test publication and verify the payload contains `structured_html` from GROBID fallback, structured reference fields, and inline citation markers.

### Phase 2: Asset Content Delivery (Agent 2)

**Goal**: Ensure figures always have images and tables always have rendered HTML.

| Task | Issues Fixed | Effort |
|------|-------------|--------|
| 2a. Improve Docling table matching — add text-similarity scoring (compare first few cell values) alongside page+row heuristic | T2 | Medium |
| 2b. When `graphic_coords` absent, use `coords` but subtract estimated caption region height | F3 | Medium |
| 2c. Lower `_FIGURE_CROP_MIN_BYTES` to `512` or make configurable | F4 | Low |
| 2d. Add user-visible indicator when figure image is unavailable ("Image not extractable from PDF") | F5 | Low |
| 2e. Add user-visible indicator when table HTML is unavailable ("Table content not available — view in PDF") with a "Jump to PDF page" action | T1 fallback | Low |

**Validation**: Process 5 diverse publications (text-heavy, figure-heavy, table-heavy, multi-column, supplementary). Verify all figures have images and all tables have HTML content.

### Phase 3: Citation System (Agent 4)

**Goal**: Clickable inline citations that link to structured reference entries.

| Task | Issues Fixed | Effort |
|------|-------------|--------|
| 3a. Backend: emit citation markers in section text as `{{cite:ref-id}}` tokens | C1 | Medium |
| 3b. Frontend: parse `{{cite:ref-id}}` tokens in paragraph renderer alongside existing bracket-number regex | C1 | Medium |
| 3c. Expand citation regex to support author-year format `(Author, Year)` | C2 | Low |
| 3d. Display structured reference fields in popover (authors, title, year, journal, DOI link) | C3 | Medium |
| 3e. Add viewport boundary clamping to popover positioning | C5 | Low |

**Validation**: Open a publication with bracket-number citations and verify clicking `[1]` shows a structured reference with authors/title/DOI. Test with author-year format paper.

### Phase 4: Visual Polish (Agent 3)

**Goal**: Consistent, polished reading experience.

| Task | Issues Fixed | Effort |
|------|-------------|--------|
| 4a. Unify table CSS — remove redundant `index.css` rules, rely solely on Tailwind class string | T5 | Low |
| 4b. Align inline asset border colors with navigator group tone colors | V1 | Low |
| 4c. Auto-expand navigator groups that have content; collapse empty groups | V2 | Low |
| 4d. Add empty-state messages for missing figures/tables in right panel | V3 | Low |
| 4e. Add `max-h-[60vh] overflow-y-auto` to reference popover | V4 | Low |
| 4f. Verify `--tone-neutral-150` and `--tone-neutral-250` are defined; add if missing | V5 | Low |
| 4g. Improve section ordering — cross-reference page positions when GROBID order seems wrong | S1, S2 | Medium |
| 4h. Refine inline asset placement — prefer nearest-preceding section with matching `canonical_kind` context | S4 | Medium |

**Validation**: Visual review of 3 publications in structured view. Check navigator, inline assets, table rendering, citation popovers, empty states.

---

### Phase 5: Integration & Hardening (Orchestrator)

| Task | Description |
|------|-------------|
| 5a. Run `Checks: Full Health` (lint + typecheck + tests + build) | Catch any regressions |
| 5b. Update `PublicationPaperModelAssetResponse` schema if new fields added | Keep API contract in sync |
| 5c. Update frontend `PublicationPaperModelAssetPayload` type if backend fields change | TypeScript contract |
| 5d. Add integration test: parse a known PDF, assert payload contains figures with `image_data`, tables with `structured_html`, references with structured fields | Regression guard |
| 5e. Review all `dangerouslySetInnerHTML` usage for XSS safety — ensure Docling/GROBID HTML is sanitized | Security |

---

## Part 4: Priority Matrix

| Priority | Issues | Phase | Impact |
|----------|--------|-------|--------|
| **P0 — Critical** | T1 (table HTML missing), T3 (GROBID table markup discarded), C1 (no inline citation links) | 1, 3 | Core reader features non-functional |
| **P1 — High** | F1 (figure images missing), T2 (table matching), C2 (citation regex), C3 (raw text refs) | 1, 2, 3 | Degraded experience for most papers |
| **P2 — Medium** | F3, F5, S1–S4, T4, T5, V2, V5 | 2, 4 | Edge cases and polish |
| **P3 — Low** | F4, F6, C5, V1, V3, V4 | 4 | Nice-to-have refinements |

---

## Part 5: Recommended Execution Order

```
Phase 1 (TEI Parser)          ██████████░░░░░░░░░░  — Agent 1
Phase 2 (Asset Rendering)     ░░░░░████████░░░░░░░  — Agent 2
Phase 3 (Citation System)     ░░░░░░░░████████░░░░  — Agent 4
Phase 4 (Visual Polish)       ░░░░░░░░░░░░████████  — Agent 3
Phase 5 (Integration)         ░░░░░█░░░░█░░░░█░░░█  — Orchestrator (runs between phases)
```

Phases 1 and 2 can partially overlap since they touch different parts of the backend. Phase 3 depends on Phase 1 (needs inline citation markers from the TEI parser). Phase 4 can run in parallel with Phase 3 for non-citation visual work.

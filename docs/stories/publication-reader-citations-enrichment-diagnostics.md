# Publication Reader: Citations, Enrichment, and Dev Diagnostics

## Summary

End-to-end implementation of inline citation markers in the structured paper reader, a fix for JATS enrichment truncating section content, parsing UX improvements, and a developer process log for debugging stuck parses.

## Changes

### Inline Citations
- Added `_tei_node_text_with_citations` (GROBID path) and `_jats_node_text_with_citations` (PMC path) to inject `{{cite:xmlId}}` markers into section text.
- Built `reference_id_map` (XML reference ID → display label) in both parser paths.
- Added `reference_id_map: dict[str, str]` to API schema.
- Frontend resolves `{{cite:xmlId}}` markers into `[N]` popovers via `selectedPaperReferenceIdMap`.

### JATS Enrichment Fix
- Rewrote `_enrich_bioc_sections_with_jats_citations` from paragraph-level to section-level matching.
- Old approach: matched individual BioC paragraphs to JATS `<p>` elements — failed when BioC concatenated multiple JATS paragraphs into one passage, causing truncation.
- New approach: parses JATS `<sec>` elements, matches to BioC sections by heading key, replaces entire section content with all JATS paragraphs joined with `\n\n`.
- Added 70% coverage guard to avoid replacement when JATS doesn't cover enough of the BioC text.

### Parsing UX
- Guarded "No GROBID-derived sections" message with `!selectedPaperParsingInProgress` so it doesn't show during active parsing.
- Hid "Current Focus" right-rail section during parsing to prevent abstract from appearing before content is ready.
- Added 2-minute max polling timeout to prevent infinite polling when GROBID hangs or backend job gets stuck.

### Dev Process Log
- Added collapsible "Process log (dev)" panel in the right-rail inspector panel.
- Displays: response.status, parser_status, parser_version, generation_method, parser_provider, grobid_url, computed_at, parse_duration, asset_enrichment status, section/ref/fig/table counts, current polling state, errors, and per-step timing breakdown.
- Backend injects parse timing data into provenance dict: `parse_started_at`, `parse_completed_at`, `parse_duration_ms`, `parse_steps` (source_state, pdf_fetch, parser durations).

## Verification
- TypeScript typecheck: clean
- ruff check: clean
- ruff format: clean
- py_compile: clean
- Synthetic unit test for enrichment: 3 citations injected, 3 paragraphs created from 1 BioC passage

# Reader Health Audit

This is the Phase 0 scorecard for the publication reader. It is designed to answer two questions consistently:

1. Is a paper actually reader-ready?
2. If it is, where is quality breaking down?

## What It Audits

The audit inspects a saved `paper-model` response and reports:

- readiness: `response.status`, `document.parser_status`, PDF availability, full-text availability
- anchors: section/figure/table page-anchor coverage
- structure: cross-zone parent links, back-matter mapped into body groups, body sections classified as metadata, generic-section rate, duplicate IDs
- assets: figure image coverage, table HTML coverage, low-fidelity table extraction signals
- citations: inline citation marker coverage, unresolved citation IDs, structured-reference coverage, duplicate reference IDs
- provenance: whether the reader payload reports parse/enrichment metadata the frontend already expects

## Runner

Use the CLI against one or more saved JSON responses:

```bash
python scripts/reader_health_audit.py output/reader-payloads --format pretty
python scripts/reader_health_audit.py payload-a.json payload-b.json --format json
```

The runner accepts files or directories. Directories are scanned recursively for `*.json`.

## Live Baseline Fetch

If you already have a valid session token, you can fetch a live corpus and build a baseline in one step:

```bash
AXIOMOS_SESSION_TOKEN=... python scripts/generate_reader_health_baseline.py \
  --publication-id <id-1> \
  --publication-id <id-2> \
  --output-dir output/reader-health/live-baseline
```

This writes:

- raw `paper-model` responses into `responses/`
- aggregate JSON into `reader-health-baseline.json`
- a markdown summary into `reader-health-baseline.md`

## Expected Inputs

Each JSON file should contain the full response returned by:

```text
GET /v1/publications/{id}/paper-model
```

The audit accepts either:

- the top-level API response object with `payload`
- or the payload object itself

## Why This Exists

The reader currently has quality issues in multiple layers at once:

- parse readiness and background completion
- section classification and ordering
- nav/content parity
- figure and table extraction quality
- citation/reference integrity

This audit gives us one baseline so we can improve those layers intentionally and measure whether each change makes the reader healthier or just different.

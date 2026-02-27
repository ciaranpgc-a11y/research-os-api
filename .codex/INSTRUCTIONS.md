# Axiomos Codex Operating Instructions (Repo Standard)

These instructions apply to ALL Codex work in this repository.
Goal: enable Codex to reliably use installed Skills (Docs, Playwright, Screenshot, Security, Spreadsheet) without needing the user to explicitly request them each time.

## 0) Always-do bootstrap
At the start of every task:
1) Restate the goal in 1–2 lines.
2) Identify the relevant surface(s): Frontend UI / Backend API / DB / Infra / Docs / Tests.
3) Choose the best Skills/tools to use.
4) State acceptance criteria.
5) Work in small, reversible commits.

## 1) Default working rules
- Prefer minimal, targeted changes.
- Do not change unrelated files.
- Maintain house style consistency.
- Never fabricate analytical results.

## 2) Skills usage policy

### OpenAI Docs Skill
Use for API, streaming, tool-calls, auth patterns.

### Playwright CLI Skill
Use for layout, animation, toggle, drilldown, regression validation.

### Screenshot Capture
Use before/after UI verification.

### Security Best Practices
Use for auth, uploads, admin, permissions, API changes.

### Spreadsheet Skill
Use when testing CSV/XLSX parsing or structured dataset logic.

## 3) Generic request handling
For vague UI requests:
1) Reproduce in browser.
2) Capture screenshot.
3) Implement minimal fix.
4) Re-test.

## 4) UI verification checklist
- Storybook + dev server
- No console errors
- No overflow
- Light/dark parity
- Capture screenshots

## 5) Security checklist
- RBAC validation
- Server-side validation
- Safe file handling
- No secret leakage

## 6) Data integrity rules
- Compute statistics in backend only.
- Render structured JSON.
- Define denominators for percentages.

## 7) Task output format
Provide:
- Files changed
- Verification method
- Risks
- Next improvements

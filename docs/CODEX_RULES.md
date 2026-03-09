# Codex Rulebook

## Workspace boundaries

- Workspace root is `C:\Users\Ciaran\Documents\GitHub\research-os-api`.
- Treat repo root as the only allowed write target.
- Do not read or modify `.env*`, key material, tokens, or secret files.
- Node commands must run from repo root with `--prefix frontend`.

## Default daily workflow (Storybook-first)

- Primary UI loop: `Frontend: Storybook (Dev)` and `Dev: Start UI (Storybook + Frontend)`.
- Use app dev server for integration checks only after Storybook/component iteration.
- Keep Storybook as the default place to iterate on shared UI work.

## Pre-push routine

- For UI changes:
  - Run `Dev: UI Validate (Smoke + Build Storybook)`.
- For full-stack or risky changes:
  - Run `Checks: Full Health`.

## When Codex must ask first

- Any network access not explicitly requested in the current prompt.
- Any command/path outside workspace root.
- Any `git push`.
- Any destructive recursive delete operation.
- Any action that touches env/secrets files.

## Where to edit

- UI implementation: `frontend/src`
- UI stories/tests for component behavior: `frontend/src/stories`
- Backend API/services: `src/research_os`
- Workspace automation/docs: `.vscode`, `docs`, `.codex`

## Publication drilldown guidance

- For publication `?` explainers and live insight cards, follow `docs/publication-insights-guidelines.md`.
- Preserve the two explainer patterns:
  - `Deep ?`
  - `Compact ?`
- New publication explainers should match the documented writing, tone, and scope-note rules instead of inventing a third style ad hoc.

## Command conventions

- Backend dev server:
  - `python -m uvicorn research_os.api.app:app --reload`
- Frontend dev:
  - `npm run dev --prefix frontend`
- Storybook dev/build:
  - `npm run storybook --prefix frontend`
  - `npm run build-storybook --prefix frontend`

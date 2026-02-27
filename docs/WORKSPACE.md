# Research OS Workspace Runbook

## The Storybook-first workflow

For daily UI work, treat Storybook as the primary validation loop:

1. Open Command Palette (`Ctrl+Shift+P`) → `Tasks: Run Task`
2. Run `Dev: Start Core (App + Storybook + Backend)` for end-to-end day-to-day context.
3. For UI-only editing, run `Dev: Start UI (Storybook + Frontend)`.
4. Before pushing UI-related changes, run `Dev: UI Validate (Smoke + Build Storybook)`.

Storybook keeps component work fast, deterministic, and reviewable. Use the app dev server when you need routing/integration behavior, but keep component iteration inside Storybook first.

## When to run Storybook vs app

- Run **Storybook** for:
  - New or changed shared UI components.
  - Visual behavior, spacing, props, variants, and interactions.
  - Accessibility and story-level smoke-level confidence.
- Run **Frontend App** for:
  - Page-level composition and route-level behavior.
  - State flows across multiple components.
  - Final pre-production functional checks with actual app wiring.
- Run **both** when:
  - Component changes may affect route-driven behavior.
  - You are modifying shared UI code consumed by many views.
- Keep **Backend** running concurrently if API models, payloads, or auth flows are being changed.

## Common commands (copy/paste)

```powershell
npm ci --prefix frontend
npm run dev --prefix frontend
npm run storybook --prefix frontend
npm run build-storybook --prefix frontend
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend
python -m pip install -e ".[dev]"
ruff check .
python -m pytest -q
python -m uvicorn research_os.api.app:app --reload
```

## Recommended VS Code tasks (click from `Tasks: Run Task`)

- Core dev
  - `Backend: Dev Server`
  - `Frontend: Dev Server`
  - `Frontend: Storybook (Dev)`
  - `Frontend: Storybook (Build)`
  - `Frontend: Storybook (Smoke Check)`
- Checks
  - `Checks: Frontend`
  - `Checks: Backend`
  - `Checks: Full Health`
- Convenience
  - `Dev: Start Core (App + Storybook + Backend)`
  - `Dev: Start UI (Storybook + Frontend)`
  - `Dev: UI Validate (Smoke + Build Storybook)`

## If you feel lost

Run these three first:

```powershell
git status --short
pwd
npm --prefix frontend run
```

## Troubleshooting

### Port conflicts (6006, 5173, 8000)

```powershell
Get-NetTCPConnection -State Listen -LocalPort 6006,5173,8000
```

If ports are stuck, stop the owning process:

```powershell
Get-Process -Id (Get-NetTCPConnection -State Listen -LocalPort 6006,5173,8000).OwningProcess -ErrorAction SilentlyContinue
```

### Stale lock/state

```powershell
Remove-Item -Recurse -Force .\frontend\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\frontend\dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\frontend\storybook-static -ErrorAction SilentlyContinue
```

Then run `npm ci --prefix frontend`.

### Stale process

```powershell
Get-Process node, python -ErrorAction SilentlyContinue | Sort-Object Id
Stop-Process -Name node, python -ErrorAction SilentlyContinue
```

## Local UI guardrail (local only)

- `Dev: UI Validate (Smoke + Build Storybook)` is the local safety task for shared UI changes.
- It runs the Storybook smoke checks (`lint`, `typecheck`, `test`) and then `build-storybook`.
- Run this before pushing shared UI/component changes.
- CI changes were not added here to keep rollout risk low unless your team wants to make Storybook build mandatory there later.

## Recommended terminal layout (3 panes)

- Pane 1: **Backend** → `Backend: Dev Server`
- Pane 2: **Storybook** → `Frontend: Storybook (Dev)`
- Pane 3: **Frontend App** → `Frontend: Dev Server`

This keeps all three workflows alive while you iterate on shared UI components.

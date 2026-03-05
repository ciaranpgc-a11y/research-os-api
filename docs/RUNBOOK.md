# Runbook

## Backend

- Install backend deps:
  - `python -m pip install -e ".[dev]"`
- Start backend:
  - `python -m uvicorn research_os.api.app:app --reload`
- Run backend tests:
  - `python -m pytest -q`

## Frontend (from repo root)

- Install frontend deps:
  - `npm ci --prefix frontend`
- Run frontend dev server:
  - `npm run dev --prefix frontend`
- Run frontend tests:
  - `npm run test --prefix frontend`
- Run frontend lint:
  - `npm run lint --prefix frontend`
- Run frontend typecheck:
  - `npm run typecheck --prefix frontend`
- Build frontend:
  - `npm run build --prefix frontend`
- Run Storybook:
  - `npm run storybook --prefix frontend`

## Render deployment pointers

- API service: `research-os-api-achk`
  - Uses Docker runtime.
  - Deployed from root `Dockerfile`.
  - Health check: `https://api.axiomos.studio/v1/health/ready`.
- UI service: `research-os-ui-achk`
  - Uses static runtime.
  - Builds from `frontend/` using `npm ci && npm run build`.
  - Pins `NODE_VERSION=20` to match `frontend/package.json`.
  - Publishes output from `frontend/dist`.

## If you feel lost

Use these 3 checks first:

1. Confirm root and branch:
   - `pwd`
2. Confirm repo layout:
   - `git status --short`
3. Confirm whether you are in frontend vs backend context:
   - `if (Test-Path frontend/package.json) { "frontend context" } else { "backend root context" }`

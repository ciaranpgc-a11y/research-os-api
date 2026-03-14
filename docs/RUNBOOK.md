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

## Production deployment pointers

- Production host: Hetzner VPS
- Reverse proxy: Caddy
- Live UI: `https://app.axiomos.studio`
- Live API: `https://api.axiomos.studio`
- Live stack entrypoint: `docker compose up -d --build`
- Live health check: `https://api.axiomos.studio/v1/health/ready`

Useful server checks:
- `docker compose ps`
- `docker compose logs -f api`
- `docker compose logs -f frontend`
- `docker compose logs -f caddy`

Preview can be enabled later with the `preview` compose profile once preview DNS is in place.

## If you feel lost

Use these 3 checks first:

1. Confirm root and branch:
   - `pwd`
2. Confirm repo layout:
   - `git status --short`
3. Confirm whether you are in frontend vs backend context:
   - `if (Test-Path frontend/package.json) { "frontend context" } else { "backend root context" }`

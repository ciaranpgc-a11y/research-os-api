# Research OS

Research OS provides:
- A FastAPI backend for manuscript drafting + project/manuscript state.
- A React frontend for section drafting, manuscript editing, and project bootstrap wizard flows.

## Codex Contributors

Codex contributors: follow `.codex/INSTRUCTIONS.md` for tool usage, verification, and security rules.

## Local Development

Backend install:
```bash
python -m pip install -e ".[dev]"
```

Backend test:
```bash
python -m pytest -q
```

Database migration:
```bash
python -m alembic upgrade head
```

Run API locally:
```bash
python -m uvicorn --app-dir src research_os.api.app:app --reload
```

Frontend dev:
```bash
cd frontend
npm ci
npm run dev
```

CMR frontend dev:
- Start the API locally on `http://127.0.0.1:8000`
- Start Vite with `npm run dev`
- Open `http://localhost:5173/cmr-login`

You can also use `http://cmr.localhost:5173/cmr-login` if you already have that hostname mapped, but it is no longer required for local CMR work.

`npm run dev` now clears any existing listener on port `5173` before starting Vite, so the current repo takes over the standard local frontend URL by default.

The Vite dev server proxies `/v1/*`, `/health/*`, and `/draft/*` to the local API by default, so no `VITE_API_BASE_URL` override is needed for the CMR app.

For local admin access through the CMR code-entry screen, set `CMR_ADMIN_PASSWORD` in the repository `.env` file before starting the API.

Seed local publication tiles (all users):
```bash
python scripts/seed_publications_demo.py --all-users --target-works 180
```

Seed local publication tiles (single user):
```bash
python scripts/seed_publications_demo.py --email your-email@example.com --target-works 180
```

VS Code task equivalent: `Backend: Seed Publications (All Users)`.

Optional frontend API base override (PowerShell):
```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:8000"
```

## API Surface

Primary versioned routes:
- `GET /v1/health`
- `GET /v1/journals`
- `POST /v1/wizard/infer`
- `POST /v1/wizard/bootstrap`
- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/{project_id}/manuscripts`
- `POST /v1/projects/{project_id}/manuscripts`
- `GET /v1/projects/{project_id}/manuscripts/{manuscript_id}`
- `PATCH /v1/projects/{project_id}/manuscripts/{manuscript_id}`
- `GET /v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots`
- `POST /v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots`
- `POST /v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/{snapshot_id}/restore`
- `GET /v1/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown`
- `POST /v1/projects/{project_id}/manuscripts/{manuscript_id}/generate`
- `GET /v1/projects/{project_id}/manuscripts/{manuscript_id}/generation-jobs`
- `GET /v1/generation-jobs/{job_id}`
- `POST /v1/generation-jobs/{job_id}/cancel`
- `POST /v1/generation-jobs/{job_id}/retry`
- `POST /v1/draft/section`
- `POST /v1/draft/methods`

`/v1/generation-jobs/{job_id}` responses include estimated token and USD cost ranges for planning.
Generation enqueue and retry requests can include `max_estimated_cost_usd` and `project_daily_budget_usd` guardrails.
Snapshot restore requests support `mode` (`replace` or `merge`) and optional `sections` filters.
Markdown export accepts `include_empty=true` to include blank sections in output.

Compatibility routes:
- `GET /health`
- `POST /draft/section`
- `POST /draft/methods`

### Quick checks

Health:
```bash
curl http://127.0.0.1:8000/v1/health
```

Readiness:
```bash
curl http://127.0.0.1:8000/v1/health/ready
```

PowerShell-safe section draft request:
```powershell
curl.exe --% -X POST http://127.0.0.1:8000/v1/draft/section -H "Content-Type: application/json" -d "{\"section\":\"results\",\"notes\":\"test notes\"}"
```

PowerShell-safe methods draft request:
```powershell
curl.exe --% -X POST http://127.0.0.1:8000/v1/draft/methods -H "Content-Type: application/json" -d "{\"notes\":\"test notes\"}"
```

PowerShell-safe wizard infer request:
```powershell
curl.exe --% -X POST http://127.0.0.1:8000/v1/wizard/infer -H "Content-Type: application/json" -d "{\"target_journal\":\"ehj\",\"answers\":{\"disease_focus\":\"Heart failure\",\"population\":\"Adults\"}}"
```

PowerShell-safe async generation enqueue:
```powershell
curl.exe --% -X POST http://127.0.0.1:8000/v1/projects/PROJECT_ID/manuscripts/MANUSCRIPT_ID/generate -H "Content-Type: application/json" -d "{\"sections\":[\"introduction\",\"methods\",\"results\"],\"notes_context\":\"core trial notes\"}"
```

## Deploy to Hetzner

Production runs on a Hetzner VPS using Docker Compose with Caddy in front.

Production domains:
- Frontend: `https://app.axiomos.studio`
- API: `https://api.axiomos.studio`

The API Docker startup runs `alembic upgrade head` before launching Uvicorn.
The API health check path is `/v1/health/ready` so database connectivity is verified.

Required API environment variables:
- `OPENAI_API_KEY` (must be set; API fails startup if missing)

Recommended API environment variables:
- `CORS_ALLOW_ORIGINS` (comma-separated origins for frontend access)
- `FRONTEND_BASE_URL=https://app.axiomos.studio` (production)
- `DATABASE_URL` (defaults to local SQLite when absent)
- `DATA_LIBRARY_ROOT` (directory for uploaded library files; set to a persistent mount path in production)
- `PUBLICATION_FILES_ROOT` (directory for stored publication files)
- `AAWE_BOOTSTRAP_EMAIL` (optional stable seeded login for rebuilds)
- `AAWE_BOOTSTRAP_PASSWORD` (password for seeded login)
- `AAWE_BOOTSTRAP_NAME` (optional; default `AAWE Test User`)
- `AAWE_BOOTSTRAP_EMAIL_VERIFIED` (`1` to skip manual verification for that seeded account)
- `AAWE_BOOTSTRAP_FORCE_PASSWORD` (`1` to reset seeded account password on every startup)

Frontend build/runtime variables:
- `VITE_API_BASE_URL=https://api.axiomos.studio` (production)
- `VITE_TEST_ACCOUNT_EMAIL` / `VITE_TEST_ACCOUNT_PASSWORD` (optional auth-page shortcut for test environments)

OAuth redirect URI configuration (production):
- `ORCID_REDIRECT_URI=https://api.axiomos.studio/v1/orcid/callback`
- `ORCID_SIGNIN_REDIRECT_URI=https://app.axiomos.studio/auth/callback/?provider=orcid`

SPA refresh routing:
- Frontend build copies `dist/index.html` to `dist/404.html` and `dist/200.html` so direct refreshes on deep routes (e.g. `/w/...`) still load the app shell on static hosts.

See `docs/DEPLOYMENT.md` for the full Hetzner deployment, cutover, preview, and rollback runbook.

## Docker

Build:
```bash
docker build -t research-os-api .
```

Run:
```bash
docker run --rm -p 8000:8000 -e OPENAI_API_KEY=YOUR_KEY research-os-api
```

## Logging

The API emits structured JSON logs and attaches `X-Request-ID` to responses for traceability.

## Documentation Rules

Major changes must be documented in the same delivery.

- Rules: `docs/change-documentation-rules.md`
- Parallel delivery framework: `docs/parallel-feature-delivery.md`
- Running audit log: `docs/change-log.md`
- Feature/story details: `docs/stories/`
- CI gate for major-change documentation: `scripts/verify_change_documentation.py`

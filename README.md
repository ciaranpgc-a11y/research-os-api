# Research OS

Research OS provides:
- A FastAPI backend for manuscript drafting + project/manuscript state.
- A React frontend for section drafting, manuscript editing, and project bootstrap wizard flows.

## Local Development

Backend install:
```bash
python -m pip install -e ".[dev]"
```

Backend test:
```bash
python -m pytest -q
```

Run API locally:
```bash
python -m uvicorn research_os.api.app:app --reload
```

Frontend dev:
```bash
cd frontend
npm install
npm run dev
```

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
- `POST /v1/projects/{project_id}/manuscripts/{manuscript_id}/generate`
- `GET /v1/projects/{project_id}/manuscripts/{manuscript_id}/generation-jobs`
- `GET /v1/generation-jobs/{job_id}`
- `POST /v1/generation-jobs/{job_id}/cancel`
- `POST /v1/generation-jobs/{job_id}/retry`
- `POST /v1/draft/section`
- `POST /v1/draft/methods`

`/v1/generation-jobs/{job_id}` responses include estimated token and USD cost ranges for planning.
Generation enqueue and retry requests can include `max_estimated_cost_usd` and `project_daily_budget_usd` guardrails.

Compatibility routes:
- `GET /health`
- `POST /draft/section`
- `POST /draft/methods`

### Quick checks

Health:
```bash
curl http://127.0.0.1:8000/v1/health
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

## Deploy to Render

`render.yaml` provisions:
- `research-os-api-achk` (Docker web service)
- `research-os-ui-achk` (static site from `frontend/`)

Required API environment variables:
- `OPENAI_API_KEY` (must be set; API fails startup if missing)

Recommended API environment variables:
- `CORS_ALLOW_ORIGINS` (comma-separated origins for frontend access)
- `DATABASE_URL` (defaults to local SQLite when absent)

Frontend environment variables:
- `VITE_API_BASE_URL` should point to the API service URL.

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

# Local Development

Install:
  python -m pip install -e ".[dev]"

Run tests:
  python -m pytest -q

Run API locally:
  python -m uvicorn research_os.api.app:app --reload

Health check:
  curl http://127.0.0.1:8000/health

PowerShell-safe POST example:
  curl.exe --% -X POST http://127.0.0.1:8000/draft/methods -H "Content-Type: application/json" -d "{\"notes\":\"test\"}"

# Deploy to Render

1. Connect the GitHub repository in Render.
2. Render reads `render.yaml` and creates:
   - `research-os-api` (Docker web service)
   - `research-os-ui` (static site from `frontend/`)
3. Set `OPENAI_API_KEY` in the Render dashboard environment variables for `research-os-api`.
4. Deploy both services.

Health check endpoint:
  /v1/health

Expected startup behavior:
  The service fails fast during startup if OPENAI_API_KEY is missing.

UI/API wiring:
  `research-os-ui` uses `VITE_API_BASE_URL=https://research-os-api.onrender.com`
  API CORS is controlled by `CORS_ALLOW_ORIGINS`.

# Production notes

- Use at least 1 worker only.
- Keep reload off in production (Docker CMD already runs uvicorn without --reload).
- No `.env` file is required in production; Render env vars supply OPENAI_API_KEY.

## Logging
This service emits structured JSON logs including request_id and duration.
Each response includes X-Request-ID header for traceability.

# Docker

Docker build:
  docker build -t research-os-api .

Docker run (requires OPENAI_API_KEY):
  docker run --rm -p 8000:8000 -e OPENAI_API_KEY=YOUR_KEY research-os-api

Health check:
  curl http://127.0.0.1:8000/health

PowerShell-safe POST example:
  curl.exe --% -X POST http://127.0.0.1:8000/draft/methods -H "Content-Type: application/json" -d "{\"notes\":\"test\"}"

# UI (frontend)

From `frontend/`:
  npm install
  npm run dev

Optional API base override:
  set VITE_API_BASE_URL=http://127.0.0.1:8000

The UI calls:
  GET /v1/health
  POST /v1/draft/methods

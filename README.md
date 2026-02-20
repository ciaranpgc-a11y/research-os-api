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
2. Render reads `render.yaml` and creates the `research-os-api` web service.
3. Set `OPENAI_API_KEY` in the Render dashboard environment variables.
4. Deploy.

Health check endpoint:
  /v1/health

Expected startup behavior:
  The service fails fast during startup if OPENAI_API_KEY is missing.

# Production notes

- Use at least 1 worker only.
- Keep reload off in production (Docker CMD already runs uvicorn without --reload).
- No `.env` file is required in production; Render env vars supply OPENAI_API_KEY.

# Docker

Docker build:
  docker build -t research-os-api .

Docker run (requires OPENAI_API_KEY):
  docker run --rm -p 8000:8000 -e OPENAI_API_KEY=YOUR_KEY research-os-api

Health check:
  curl http://127.0.0.1:8000/health

PowerShell-safe POST example:
  curl.exe --% -X POST http://127.0.0.1:8000/draft/methods -H "Content-Type: application/json" -d "{\"notes\":\"test\"}"

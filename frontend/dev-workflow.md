# Frontend Dev Workflow

## Start app + Storybook together
1. Open Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `AAWE: Start Frontend (Dev + Storybook)`.

This launches:
- Vite app on `http://localhost:5176`
- Storybook on `http://localhost:6006`

## CMR local app
Run the backend locally with `python -m uvicorn --app-dir src research_os.api.app:app --reload` on `http://127.0.0.1:8000`, then start Vite as usual and open:
- `http://localhost:5173/cmr-login`
- `http://cmr.localhost:5173/cmr-login`

`npm run dev` now clears any existing listener on port `5173` before starting Vite, so the current repo takes over the standard local frontend URL automatically. The frontend also proxies `/v1/*`, `/health/*`, and `/draft/*` to the local API automatically on the dev server, so no `VITE_API_BASE_URL` override is required for the CMR app. `cmr.localhost` remains optional if you already use that hostname.

If you want local admin access through the main CMR code field, set `CMR_ADMIN_PASSWORD` in the repository `.env` file before starting the API.

## Run checks on demand
1. Open Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `AAWE: Check`.

## Optional: run Playwright E2E UI mode
1. Open Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `AAWE: E2E UI`.

## MSW enablement
To enable MSW locally, create/update `.env.local` with:

```env
VITE_ENABLE_MSW=true
```

## Optional: inbox realtime tuning
You can tune workspace inbox realtime behavior in `.env.local`:

```env
VITE_WORKSPACE_INBOX_WS_RECONNECT_DELAY_MS=1500
VITE_WORKSPACE_INBOX_FALLBACK_SYNC_MS=30000
```

# Frontend Dev Workflow

## Start app + Storybook together
1. Open Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `AAWE: Start Frontend (Dev + Storybook)`.

This launches:
- Vite app on `http://localhost:5176`
- Storybook on `http://localhost:6006`

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

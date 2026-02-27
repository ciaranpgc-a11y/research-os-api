# Quickstart

## UI-first (recommended)

1. Open VS Code Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `Dev: Start UI (Storybook + Frontend)`.

This keeps Storybook as the primary UI development surface.

## Full stack

1. Open VS Code Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `Dev: Start Core (App + Storybook + Backend)`.

## Before pushing UI changes

1. Open VS Code Command Palette (`Ctrl+Shift+P`).
2. Run `Tasks: Run Task`.
3. Select `Dev: UI Validate (Smoke + Build Storybook)`.

## If port 6006 is busy

Find the process:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 6006 | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id (Get-NetTCPConnection -State Listen -LocalPort 6006).OwningProcess
```

Stop it:

```powershell
Stop-Process -Id <PID> -Force
```

## If you feel lost (3 commands)

```powershell
git status --short
pwd
npm --prefix frontend run
```

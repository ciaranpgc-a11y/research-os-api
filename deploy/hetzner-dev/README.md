# Hetzner Dev Server

Helpers for operating the Hetzner dev environment from a developer workstation.

> Production deployment is documented in [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md). This folder is the *dev* counterpart: the staging-style stack at `dev-research-os-api` on the same Hetzner box, reached via SSH tunnel.

## What runs on the server

- `dev-research-os-api` on server-local `127.0.0.1:8000`
- `dev-postgres` on server-local `127.0.0.1:5432`
- GROBID at `https://grobid.axiomos.studio`

The dev API and Postgres are intentionally not public. You reach the API from your workstation through an SSH tunnel.

## Server-side layout (for reference)

```
/srv/dev/research-os-api/
├── .env                     # secrets — NEVER committed
├── app/                     # git clone of this repo (tracking origin/main)
├── data/                    # dev SQLite/file store
├── docker-compose.yml       # = dev-api-compose.yml from this folder
└── ...
/srv/dev/postgres/
├── .env                     # postgres secrets
├── data/                    # postgres volume
└── docker-compose.yml       # = dev-postgres-compose.yml from this folder
```

The compose files in this folder are the canonical source. Keep the server copies in sync by re-uploading after edits.

## Prerequisites on the workstation

- Windows + PowerShell 7
- OpenSSH client (`ssh.exe` on PATH)
- SSH key at `$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid` (see "First-time setup on a new PC" below)
- Node.js LTS (for the frontend dev server)

## First-time setup on a new PC

The SSH key and `.env` files are committed to this **private** repo so a fresh clone is self-contained. After cloning:

```powershell
# Copy SSH key into the user's .ssh folder
Copy-Item "deploy\hetzner-dev\keys\id_ed25519_hetzner_grobid"     "$env:USERPROFILE\.ssh\"
Copy-Item "deploy\hetzner-dev\keys\id_ed25519_hetzner_grobid.pub" "$env:USERPROFILE\.ssh\"

# Tighten permissions so OpenSSH will accept it
icacls "$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

The local `.env` and `frontend/.env.local` arrive in place on `git checkout` — no further action needed for them.

> NOTE: The dev *server-side* `.env` files (`/srv/dev/research-os-api/.env`, `/srv/dev/postgres/.env`) live on the Hetzner box itself and are NOT yet in this repo. Treat the server as the source of truth for those. If you need an offline copy, SSH in and `scp` them down to a secure local vault.

## Daily use

1. **Open the API tunnel** (keep the window open while developing):

   ```powershell
   powershell -ExecutionPolicy Bypass -File "$PWD\deploy\hetzner-dev\scripts\open-dev-api-tunnel.ps1"
   ```

2. **In another PowerShell window, run the frontend against the remote API:**

   ```powershell
   cd frontend
   $env:VITE_API_BASE_URL = "http://127.0.0.1:18000"
   npm.cmd run dev
   ```

   The frontend's local `.env.local` already points at `http://127.0.0.1:18000`, so ordinary `npm run dev` stays on the Hetzner dev API unless you override it.

3. **To run the local frontend against the *live* API instead:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File "$PWD\deploy\hetzner-dev\scripts\start-live-system.ps1"
   ```

## Handy commands

| Action | Script |
|---|---|
| Show dev container status | `scripts\show-dev-server-status.ps1` |
| Tail dev API logs (follow) | `scripts\tail-dev-api-logs.ps1` |
| Restart the dev API | `scripts\restart-dev-api.ps1` |
| Pull latest `main` + rebuild | `scripts\update-dev-server.ps1` |
| One-shot tunnel + frontend | `scripts\start-remote-dev.ps1` |

Each script is invoked with:

```powershell
powershell -ExecutionPolicy Bypass -File "$PWD\deploy\hetzner-dev\scripts\<script-name>.ps1"
```

## Recommended update flow

1. Commit and push backend changes to `origin/main`.
2. Run `scripts\update-dev-server.ps1`.
3. Wait for the health check to return `{"status":"ok","database":"ok"}`.

## Connection details

- Host: `178.104.54.229`
- User: `ciaran`
- Key: `$env:USERPROFILE\.ssh\id_ed25519_hetzner_grobid`
- Local tunnel port: `18000` → remote `127.0.0.1:8000`

If those defaults ever change, update the variables at the top of each script.

## Notes

- Keep the tunnel window open while using the remote API.
- The frontend still runs on your workstation unless you choose to move it.
- If the remote API gets rebuilt from a clean upstream clone, make sure any fresh-Postgres migration guard fixes are committed to `main` first.
- The dev server `.env` is **not** stored in this repo. Treat it like any other secret: keep a copy in your password manager / encrypted vault.

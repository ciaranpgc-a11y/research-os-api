# Deployment Notes

## Current production target

Production now runs on Hetzner with Docker Compose.

The historical Render files remain in the repository only as legacy reference during the transition period. They are no longer the canonical production deployment path.

---

## Hetzner self-hosted deployment (docker-compose)

The preferred production target is a Hetzner VPS running Docker Compose.
This co-locates the API with GROBID for fast parsing and eliminates
cold-start latency.

### Architecture

```
Internet
  │
  ├─ app.axiomos.studio      ─▶  Cloudflare  ─▶  Caddy :443  ─▶  frontend :80
  ├─ api.axiomos.studio      ─▶  Cloudflare  ─▶  Caddy :443  ─▶  api :8000
  └─ grobid.axiomos.studio   ─▶  (direct)   ─▶  Caddy :443  ─▶  grobid :8070
```

Core services managed by `docker-compose.yml`:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `caddy` | `caddy:2-alpine` | 80, 443 | Reverse proxy + auto HTTPS |
| `frontend` | built from `frontend/Dockerfile.production` | 80 (internal) | Static SPA build |
| `api` | Built from `Dockerfile` | 8000 (internal) | FastAPI backend |
| `grobid` | `lfoppiano/grobid:0.8.1` | 8070 (internal) | PDF parser |

Optional preview services can also be started with the `preview` profile:

| Service | Profile | Purpose |
|---------|---------|---------|
| `frontend-preview` | `preview` | Preview SPA |
| `api-preview` | `preview` | Preview API with separate data volume |

### Prerequisites

- Hetzner VPS with Docker and Docker Compose installed
- DNS: `app.axiomos.studio` A-record pointing to the server IP
- DNS: `api.axiomos.studio` A-record pointing to the server IP
- DNS: `grobid.axiomos.studio` A-record pointing to the server IP
- Ports 80 and 443 open in the firewall

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/<org>/research-os-api.git
cd research-os-api

# 2. Create .env from template and fill in secrets
cp deploy/.env.example .env
nano .env   # set OPENAI_API_KEY, OPENALEX_*, CROSSREF_*, bootstrap user, etc.

# 3. Build and start
docker compose up -d --build

# 4. Verify
docker compose ps                 # all services healthy
curl -I https://app.axiomos.studio
curl -sf https://api.axiomos.studio/v1/health/ready && echo OK
```

### Updating

```bash
git pull origin main
docker compose up -d --build      # rebuilds only if Dockerfile/source changed
```

### Logs & debugging

```bash
docker compose logs -f api        # API logs
docker compose logs -f frontend   # Frontend logs
docker compose logs -f grobid     # GROBID logs
docker compose exec api alembic history   # migration history
```

### Optional preview stack

If you want a real testing view on the same Hetzner box, use a second hostname pair and the preview profile. This is the most useful setup for validating backend and frontend changes without touching live.

Recommended hostnames:

- `preview.axiomos.studio`
- `preview-api.axiomos.studio`

Bring it up like this:

```bash
cp deploy/.env.preview.example .env.preview
nano .env.preview
docker compose --profile preview up -d --build
```

This gives you:

- a separate preview SQLite/data volume: `api-preview-data`
- a separate preview API hostname
- a separate preview frontend hostname
- shared Caddy and shared GROBID

That is usually enough for safe validation while keeping operational overhead low.

### Data volumes

| Volume | Mount | Contents |
|--------|-------|----------|
| `api-data` | `/var/data` | Production SQLite DB, publication files, data library |
| `api-preview-data` | `/var/data` | Preview SQLite DB, publication files, data library |
| `caddy-data` | `/data` | TLS certificates |
| `caddy-config` | `/config` | Caddy runtime config |

Back up the `api-data` volume regularly:

```bash
docker run --rm -v research-os-api_api-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/api-data-$(date +%Y%m%d).tar.gz -C /data .
```

### DNS / Cloudflare notes

If `app.axiomos.studio` or `api.axiomos.studio` is proxied through Cloudflare (orange cloud), set the
Cloudflare SSL/TLS encryption mode to **Full (strict)** so Cloudflare trusts
the certificate that Caddy auto-provisions from Let's Encrypt.

If `grobid.axiomos.studio` is DNS-only (grey cloud), Caddy provisions its own
Let's Encrypt certificate directly.

If you use the preview hostnames, treat them the same way: either proxy them through Cloudflare with Full (strict), or point them directly at the Hetzner IP.

### Frontend cutover from Render to Hetzner

Use this order to finish the transition with minimal risk.

#### Recommended hostnames

- Live UI: `app.axiomos.studio`
- Live API: `api.axiomos.studio`
- Preview UI: `preview.axiomos.studio`
- Preview API: `preview-api.axiomos.studio`

#### 1. Prepare the Hetzner host

```bash
cd /srv/research-os-api
git pull origin main
cp deploy/.env.example .env
nano .env
```

Confirm these values in `.env`:

- `FRONTEND_BASE_URL=https://app.axiomos.studio`
- `CORS_ALLOW_ORIGINS=http://localhost:5173,https://app.axiomos.studio`
- `VITE_API_BASE_URL=https://api.axiomos.studio`

#### 2. Start the full live stack on Hetzner

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f frontend
docker compose logs -f api
```

#### 3. Verify directly before DNS cutover

On the server:

```bash
curl -I http://localhost
curl -sf http://localhost:8000/v1/health/ready && echo API_OK
docker compose exec caddy wget -qO- http://frontend:80 | head
```

From your own machine, once DNS is in place and Caddy has had a minute to provision certificates:

```bash
curl -I https://app.axiomos.studio
curl -sf https://api.axiomos.studio/v1/health/ready && echo API_OK
```

#### 4. Cut over DNS / Cloudflare

Create or update these DNS records to point at the Hetzner IP:

- `app.axiomos.studio`
- `api.axiomos.studio`

Cloudflare settings:

- proxy enabled is fine for `app` and `api`
- SSL mode should be `Full (strict)`

Wait for DNS to settle, then verify the live UI is loading the Hetzner-served frontend and talking to the Hetzner API.

#### 5. Keep Render alive briefly, then retire it

Do not switch Render off immediately. Leave the old static frontend service running until all of the following are true:

- `https://app.axiomos.studio` loads correctly
- login works
- Publications page loads
- file downloads still work
- OpenAlex refresh / imports still work

After that, disable or delete the Render UI service.

#### 6. Optional preview stack

If you want a separate testing view on the same Hetzner box:

```bash
cp deploy/.env.preview.example .env.preview
nano .env.preview
docker compose --profile preview up -d --build
docker compose --profile preview ps
```

Set these in `.env.preview`:

- `FRONTEND_BASE_URL=https://preview.axiomos.studio`
- `CORS_ALLOW_ORIGINS=http://localhost:5173,https://preview.axiomos.studio`
- `VITE_API_BASE_URL=https://preview-api.axiomos.studio`

Then add DNS for:

- `preview.axiomos.studio`
- `preview-api.axiomos.studio`

That preview stack uses its own data volume, `api-preview-data`, so it does not overwrite live SQLite or publication files.

#### 7. Rollback plan

If the frontend cutover misbehaves:

1. Point `app.axiomos.studio` back to the old Render UI target or re-enable the old route.
2. Leave `api.axiomos.studio` on Hetzner unless the API itself is faulty.
3. Fix the Hetzner frontend container and retry.

Useful rollback diagnostics:

```bash
docker compose logs --tail=200 frontend
docker compose logs --tail=200 caddy
docker compose logs --tail=200 api
```

#### 8. Backup note

With 240 GB on Hetzner, capacity is not the immediate problem. Reliability is. Back up both live and preview volumes regularly, especially `api-data` and `api-preview-data` if you use preview long-term.

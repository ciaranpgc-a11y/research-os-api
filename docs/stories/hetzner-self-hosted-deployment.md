# Hetzner Self-Hosted Deployment

## Summary

Migrate the backend API from Render to a self-hosted Hetzner VPS, co-locating
GROBID with the API server to eliminate cold-start latency and network overhead
during PDF parsing.

## Problem

On Render's free/starter tier, the parsing pipeline (PubMed → PMC → GROBID,
~5 sequential external calls) frequently exceeded the frontend's 2-minute
polling timeout. Users saw perpetual "Parsing…" spinners even though parsing
eventually completed.

## Solution

- `docker-compose.yml` running three containers: Caddy (reverse proxy + auto
  HTTPS), API (existing Dockerfile), GROBID (`lfoppiano/grobid:0.8.1`).
- GROBID reached at `http://grobid:8070` (Docker network), not over the
  public internet.
- `deploy/Caddyfile` handles TLS for `api.axiomos.studio` and
  `grobid.axiomos.studio`.
- Polling timeout increased from 120 s → 300 s as a safety net.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Compose definition for API + GROBID + Caddy |
| `deploy/Caddyfile` | Caddy reverse-proxy config |
| `deploy/.env.example` | Environment variable template |
| `docs/DEPLOYMENT.md` | Updated with Hetzner deployment guide |
| `frontend/src/pages/profile-publications-page.tsx` | Polling timeout fix |

## Status

Ready for initial deployment.

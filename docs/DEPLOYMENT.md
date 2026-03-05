# Deployment Notes

## What `render.yaml` deploys

`render.yaml` defines two services:

- `research-os-api-achk`
  - Type: `web`
  - Runtime: `docker`
  - Deploys the backend API from the repository root `Dockerfile`.
  - API health check path: `/v1/health/ready`
- `research-os-ui-achk`
  - Type: `web`
  - Runtime: `static`
  - Builds from `frontend/` with `npm ci && npm run build`.
  - Pins `NODE_VERSION=20` to match the frontend engine requirement.
  - Publishes `frontend/dist`.
  - Rewrites `/*` to `/index.html` for SPA deep-link refreshes.

The render service names and routes in this file represent the production deployment targets.

## What `local_render.yaml` is for

`local_render.yaml` is a sibling config intended for local or alternate deployment experiments.
It is currently separate from `render.yaml` and should not be treated as the canonical production
blueprint.

## Health check endpoint difference

- `render.yaml` uses `/v1/health/ready` for the API service.
- `local_render.yaml` also uses `/v1/health/ready`.

Both currently use the stricter readiness probe:
- `/v1/health/ready` verifies database connectivity and is suitable for deployment health checks.

## Deployment flow summary

1. CI builds the backend Docker image and frontend bundle.
2. API image is built from root and served as a web service.
3. Frontend is built under `frontend/` and served as a static web service.
4. Route rewrites for static hosting are required so SPA deep links return the app shell.

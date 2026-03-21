# CMR Access Control & Admin Panel — Design Spec

## Goal

Add a self-contained access control system to the CMR tool so it can be deployed on `cmr.axiomos.studio` with individual access codes managed by an admin. Completely separate from Axiomos authentication.

## Requirements Summary

- Admin (single user) manages access codes via a dedicated admin panel
- Each person gets a unique, reusable access code (chosen by admin)
- Users enter their code on a full-page gate; session lasts until browser closes
- Admin authenticates via a server-side password (env var)
- Admin session grants full site access including Reference Database tab
- Regular users cannot see or access the Reference Database
- Individual usage tracking: last access time, session count
- Future-ready: `cmr_access_codes` table will serve as FK for saved reports

## Architecture

### Separation from Axiomos

The CMR auth system is fully self-contained:
- Own database tables (no shared tables with Axiomos)
- Own API namespace (`/v1/cmr/`)
- Own frontend routes and session management (sessionStorage, not localStorage)
- No imports from or dependencies on Axiomos auth code (`lib/auth-session.ts`)

It lives within the same FastAPI service and React SPA for deployment simplicity, but shares zero auth logic or data.

---

## Database

Two new tables in the existing SQLite database, managed via Alembic migration.

### `cmr_access_codes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | Person's display name |
| `code_hash` | TEXT | bcrypt hash of the access code |
| `created_at` | DATETIME | When the code was created |
| `last_accessed_at` | DATETIME | Last successful login (nullable) |
| `session_count` | INTEGER | Total number of sessions created |
| `is_active` | BOOLEAN | `true` by default, `false` when revoked |

### `cmr_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `access_code_id` | TEXT (FK) | References `cmr_access_codes.id` |
| `session_token` | TEXT | Random 64-char hex string |
| `is_admin` | BOOLEAN | `true` for admin sessions |
| `created_at` | DATETIME | When the session was created |

**Indexes:** `cmr_sessions.session_token` (unique), `cmr_sessions.access_code_id`.

**Admin row:** The Alembic migration seeds a reserved row in `cmr_access_codes` with `id = "admin"`, `name = "Admin"`, `code_hash = NULL`, `is_active = true`. This row is the FK anchor for admin sessions and cannot be revoked via the API.

Sessions have no explicit expiry — they are validated server-side and the frontend stores the token in `sessionStorage` (cleared when browser closes).

---

## API Endpoints

All endpoints live under `/v1/cmr/`. A new FastAPI router mounted separately from Axiomos routes.

### User-facing

**`POST /v1/cmr/auth/login`**
- Body: `{ "code": "the-access-code" }`
- Iterates active codes, checks bcrypt hash match
- On match: creates session, updates `last_accessed_at`, increments `session_count`
- Returns: `{ "session_token": "...", "name": "Dr. Smith", "is_admin": false }`
- On failure: `401 { "detail": "Invalid access code" }`

**`GET /v1/cmr/auth/me`**
- Header: `Authorization: Bearer <session_token>`
- Looks up session token in `cmr_sessions`, joins to `cmr_access_codes`
- Checks that the linked access code has `is_active = true`; if revoked, returns `401` (invalidates existing sessions on revoke)
- Returns: `{ "name": "Dr. Smith", "is_admin": false }` (or `{ "name": "Admin", "is_admin": true }` for admin sessions)
- On invalid/missing token or revoked code: `401`

**`POST /v1/cmr/auth/logout`**
- Header: `Authorization: Bearer <session_token>`
- Deletes the session row from `cmr_sessions`
- Returns: `204`

### Admin-facing

All admin endpoints require `Authorization: Bearer <admin_session_token>` where the session has `is_admin = true`.

**`POST /v1/cmr/admin/login`**
- Body: `{ "password": "the-admin-password" }`
- Validates against `CMR_ADMIN_PASSWORD` environment variable using `secrets.compare_digest` (constant-time comparison)
- On match: creates a session with `is_admin = true`. The session references a reserved admin row in `cmr_access_codes` (seeded by the Alembic migration with `id = "admin"`, `name = "Admin"`, `code_hash = NULL`, `is_active = true`). This row cannot be revoked via the `DELETE` endpoint (the endpoint rejects `id = "admin"`).
- Returns: `{ "session_token": "...", "name": "Admin", "is_admin": true }`
- On failure: `401 { "detail": "Invalid admin password" }`

**`GET /v1/cmr/admin/codes`**
- Returns: list of all access codes (never includes the actual code):
  ```json
  [
    {
      "id": "uuid",
      "name": "Dr. Smith",
      "created_at": "2026-03-21T...",
      "last_accessed_at": "2026-03-21T...",
      "session_count": 5,
      "is_active": true
    }
  ]
  ```

**`POST /v1/cmr/admin/codes`**
- Body: `{ "name": "Dr. Smith", "code": "chosen-access-code" }`
- Hashes the code with bcrypt, stores in `cmr_access_codes`
- Returns: `201 { "id": "uuid", "name": "Dr. Smith" }`

**`DELETE /v1/cmr/admin/codes/:id`**
- Rejects if `id = "admin"` (protected row): `400 { "detail": "Cannot revoke admin access" }`
- Sets `is_active = false` (soft delete, preserves history for future report FK integrity)
- Existing sessions for this code are immediately invalidated (the `GET /v1/cmr/auth/me` check verifies `is_active`)
- Returns: `204`

---

## Frontend

### Subdomain Detection

The frontend detects `cmr.axiomos.studio` via `window.location.hostname` and switches behaviour:

- On CMR subdomain: show CMR experience (gate → CMR tools)
- On `app.axiomos.studio`: show normal Axiomos experience (unchanged)

This is a single check at the router level — no build-time configuration needed.

### New Routes

| Route | Component | Auth |
|---|---|---|
| `/cmr-login` | Access code gate page | None |
| `/cmr-admin` | Admin login + management panel | Admin session |

### Access Code Gate (`/cmr-login`)

- Full-page, centred layout
- Single input field: "Enter your access code"
- Submit button
- On success: stores `cmr_session_token`, `cmr_user_name`, and `cmr_is_admin` in `sessionStorage`, redirects to `/cmr-reference-table`
- On failure: shows inline error message
- Clean, minimal design consistent with CMR visual language

### Session Guard

A new `RequireCmrSession` wrapper component (separate from Axiomos `RequireSignIn`):

- Checks `sessionStorage` for `cmr_session_token`
- Validates via `GET /v1/cmr/auth/me`
- If valid: renders children
- If invalid: redirects to `/cmr-login`
- Shows brief "Checking session..." state while validating

All CMR routes (except `/cmr-login` and `/cmr-admin`) are wrapped in this guard.

### Route Visibility

When on the CMR subdomain:
- `is_admin = true`: all CMR tabs visible including Reference Database
- `is_admin = false`: Reference Database tab hidden from navigation
- The Reference Database route itself also checks `is_admin` and redirects if false

### Admin Panel (`/cmr-admin`)

- Own login screen: "Enter admin password" field
- On successful admin login: stores the same `cmr_session_token`, `cmr_user_name`, and `cmr_is_admin` keys in `sessionStorage` (same keys as regular user login, so the `RequireCmrSession` guard recognises admin sessions for CMR page access)
- The admin panel page itself checks `cmr_is_admin === "true"` in sessionStorage; if not admin, redirects to `/cmr-login`
- Once authenticated, shows:
  - **Header**: "CMR Access Management"
  - **Add new code form**: name input + code input + "Create" button
  - **Users table**: name, created date, last accessed (relative time), session count, status badge (active/revoked), revoke button
- Revoke button shows confirmation before proceeding
- No navigation to CMR tools from admin panel (separate concern)

### CMR Top Bar Changes

When on CMR subdomain and authenticated:
- Show user's name in the top bar (from session)
- Add a "Sign out" button that calls `POST /v1/cmr/auth/logout`, clears sessionStorage, and redirects to `/cmr-login`

---

## Deployment

### Cloudflare DNS Setup (Step-by-Step)

1. Log in to your Cloudflare dashboard at `dash.cloudflare.com`
2. Select your domain (`axiomos.studio`)
3. Click **DNS** in the left sidebar → **Records**
4. Click **Add record**
5. Fill in:
   - **Type**: `A`
   - **Name**: `cmr`
   - **IPv4 address**: *(same IP as your existing `app` and `api` records — you can find it by looking at the existing `app` A record)*
   - **Proxy status**: **Proxied** (orange cloud icon — this enables Cloudflare's CDN and SSL)
   - **TTL**: Auto
6. Click **Save**
7. Go to **SSL/TLS** in the left sidebar → **Overview**
8. Confirm the SSL mode is set to **Full (strict)** *(it should already be, since your other subdomains use this)*

The new subdomain will be active within a few minutes. Caddy will automatically provision a TLS certificate via Let's Encrypt on first request.

### Caddyfile

Add to `deploy/Caddyfile`:

```
cmr.axiomos.studio {
    handle /v1/* {
        reverse_proxy api:8000
    }
    handle {
        reverse_proxy frontend:80
    }
}
```

This routes API calls (`/v1/cmr/*`) to the API container and everything else to the frontend container, matching the same pattern as `app.axiomos.studio`.

### Environment Variables

Add to `deploy/.env` on the server:

```
CMR_ADMIN_PASSWORD=<choose-a-strong-password>
```

Add to `deploy/.env.example` in the repo:

```
# CMR access control
CMR_ADMIN_PASSWORD=changeme
```

### CORS

Add `https://cmr.axiomos.studio` to the API's CORS allowed origins list.

### Docker

No new containers. The existing `frontend` and `api` services handle everything. Just rebuild and restart after code changes:

```bash
docker compose up -d --build
```

---

## Security Considerations

- Access codes are bcrypt-hashed at rest — never stored in plain text
- Session tokens are cryptographically random (64-char hex via `secrets.token_hex(32)`)
- Admin password compared using `secrets.compare_digest` (constant-time) to prevent timing attacks
- Login endpoint runs a dummy bcrypt check on failure to prevent timing-based enumeration of valid codes
- Admin endpoints protected by session `is_admin` check
- Revoking a code immediately invalidates existing sessions (checked on every `/me` call)
- Server-side logout endpoint deletes session tokens
- HTTPS enforced via Caddy + Cloudflare Full (strict)
- No code or table sharing with Axiomos auth — compromise of one doesn't affect the other

---

## What This Design Does NOT Include (Future Work)

- **Saved reports**: will use `cmr_access_codes.id` as FK — schema is ready for this
- **Password reset / code rotation**: admin can revoke + create a new code
- **Rate limiting on login**: could be added later if needed
- **Session expiry**: sessions persist until browser closes; server-side cleanup of stale sessions can be added later

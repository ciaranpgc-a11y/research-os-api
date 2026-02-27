# RBAC Simulation Harness

This harness validates RBAC, invitation token edge cases, workspace/data-library isolation, and audit-log guarantees.

## Contents

- `permission_matrix.json`: single source of truth for role/action allow-deny expectations.
- `conftest.py`: deterministic seed fixture for two workspaces (`workspace-a`, `workspace-b`), role users, assets, and invitation states.
- `test_api_rbac_matrix.py`: matrix-driven API integration tests (same-workspace + cross-workspace checks).
- `test_invitation_tokens.py`: edge-case tests for invitation token lifecycle (`expired`, `revoked`, `already accepted`, `wrong workspace`).

## Run Locally

### Backend API matrix + token edge tests

```bash
pytest tests/rbac -q
```

### Frontend critical RBAC E2E flows

```bash
npx --prefix frontend playwright install chromium
npm --prefix frontend run test:e2e -- frontend/tests/e2e/rbac-critical-flows.spec.ts
```

## CI Example

```bash
pytest tests/rbac -q
npm --prefix frontend ci
npm --prefix frontend run test:e2e -- frontend/tests/e2e/rbac-critical-flows.spec.ts
```

## Notes

- Tests are deterministic: each run uses a temporary SQLite DB and isolated `DATA_LIBRARY_ROOT`.
- State is rebuilt from scratch via fixtures, not shared across tests.
- Audit assertions check structured fields: `actor`, `workspace_id`, `action`, `target_type`, `target_id`, `outcome`, `timestamp` (`created_at`).

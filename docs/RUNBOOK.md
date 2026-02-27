# Runbook

## Frontend commands

Run frontend Node commands from `frontend/` or with `--prefix frontend`.

Recommended:
- `npm ci --prefix frontend`
- `npm run lint --prefix frontend`
- `npm run typecheck --prefix frontend`
- `npm run test --prefix frontend`
- `npm run build --prefix frontend`
- `npm run storybook --prefix frontend`

Avoid running plain `npm` commands from the repository root unless a command is explicitly added to a root-level `package.json`.

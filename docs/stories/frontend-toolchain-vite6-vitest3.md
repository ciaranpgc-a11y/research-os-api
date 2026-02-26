# Story: Frontend Toolchain Upgrade (Vite 6 + Vitest 3)

## Context

Safe `npm audit fix` reduced vulnerabilities but left moderate issues in the Vite/Vitest dependency chain that required major-version upgrades.

## Goal

Upgrade the frontend build/test toolchain to Vite 6 and Vitest 3 in a controlled way, while preserving app and Storybook build integrity on the current Node 18 runtime.

## Scope

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/components/publications/PublicationsTopStrip.tsx` (build-blocking cleanup)

## Delivered

- Upgraded:
  - `vite` to `^6.4.1`
  - `vitest` to `^3.2.4`
  - `@vitejs/plugin-react` to `^4.7.0` (Node 18-compatible + Vite 6 peer support)
- Kept Storybook build flow working with Vite 6.
- Removed one unused publications top-strip constant that was causing strict TypeScript build failure.

## Verification

- `npm --prefix frontend audit --json` (remaining advisory: `xlsx`, no upstream fix via npm audit)
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run test:unit`
- `npm --prefix frontend run build`
- `npm --prefix frontend run build-storybook`

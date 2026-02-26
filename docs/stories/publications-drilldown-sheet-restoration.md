# Story: Publications Drilldown Sheet Restoration

## Context

The Publications page detail panel regressed from the house drilldown sheet pattern to an inline/sticky card layout. This reduced consistency with established right-side drilldown behavior used across analytics and review surfaces.

## Goal

Restore the Publications detail view to the right-side slide-over drilldown sheet while preserving current publication detail tabs and actions.

## Scope

- `frontend/src/pages/profile-publications-page.tsx`

## Delivered

- Replaced inline/sticky right detail card container with `Sheet` + `SheetContent` using house drilldown sheet styling.
- Bound sheet visibility to selected publication state so row selection opens drilldown and close action clears selection.
- Preserved existing tabbed publication detail content (`Overview`, `Content`, `Impact`, `Files`, `AI Insights`) without feature-level behavior changes.

## Verification

- `npm --prefix frontend run typecheck`

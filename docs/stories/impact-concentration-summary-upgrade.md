# Story: Impact Concentration Summary Upgrade

## Context

The impact concentration metric drilldown lagged the interaction quality of the h-index and total-citations drilldowns. Its Summary tab was a single flat section (approved-story narrative, a static donut split, and a readout table) with no per-section help tooltips, insight overlays, or expand/collapse affordances, and no analytical visualization beyond the donut. Separately, the influential-citations trend chart flickered on every metrics poll.

## Goal

Bring the impact concentration Summary tab up to the same quality bar as the h-index and citations drilldowns, and remove the influential-citations chart flicker.

## Scope

- `frontend/src/components/publications/PublicationsTopStrip.tsx`
- `frontend/src/components/publications/remaining-metric-drilldown.ts`
- `frontend/tests/publications-top-strip.test.tsx`
- `frontend/scripts/design-governance-baseline.json`

## Delivered

- Restructured the impact concentration Summary into three bounded sections — **Top-set concentration**, **Concentration curve**, and **Concentration readout** — each with a `HelpTooltipIconButton`, a `PublicationInsightsTriggerButton` + `StaticPublicationInsightsOverlay`, and a `DrilldownSheet.HeadingToggle` expand/collapse control, mirroring the h-index pattern.
- Added a **Lorenz concentration curve** (`ImpactConcentrationLorenzPanel`) plotting cumulative citation share against cumulative paper share, drawn against the dashed line of equality with a shaded Gini area. Reuses the existing line-draw animation primitives. The curve is derived from `lorenzPoints`, computed in `buildImpactConcentrationDrilldownStats` from the full publication citation distribution.
- Derived the top-set paper count from stats instead of hard-coding "3".
- Removed the influential-citations flicker by dropping the redundant refresh counter from the chart animation key, along with the now-dead `refreshKey` prop and `chartRefreshCycle` state/effect.
- Updated stale unit-test expectations to the current implementation contracts and froze the clock for date-sensitive cases.

## Verification

- `npm --prefix frontend run build` (tsc -b + vite build)
- `npm --prefix frontend run design:governance`
- `npm --prefix frontend run test:unit -- tests/publications-top-strip.test.tsx tests/remaining-metric-drilldown.test.ts`

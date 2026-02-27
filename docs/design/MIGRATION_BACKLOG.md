# Migration Backlog

Generated: 2026-02-27  
Phase: 1 Complete  
Baseline Violations: 26

## Violation List

| File | Violation Type | Line/Pattern | Severity | Target Phase |
|------|---------------|--------------|----------|--------------|
| src/pages/admin-page.tsx | card-title-size-override | 2286: `<CardTitle className="text-base">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | card-title-size-override | 2301: `<CardTitle className="text-base">` | Medium | Phase 5 Wave 2 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 271: `<div className="space-y-3">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 272: `<div className="flex items-center justify-between">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 273: `<div className="inline-flex ... text-[hsl(var(--tone-neutral-700))]">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 275: `<span className="rounded-full ...">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 281: `<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 283: `<div key={metric.metricId} className="rounded-md ...">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 284: `<p className="text-caption font-semibold uppercase ...">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 285: `<p className="mt-1 text-lg font-semibold ...">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 286: `<p className="text-caption text-[hsl(var(--tone-neutral-600))]">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 290: `<div className="rounded-md border ... text-sm ...">` | High | Phase 5 Wave 3 |
| src/components/publications/PublicationMetricDrilldownPanel.tsx | house-role | 1: `Additional untagged intrinsic JSX elements omitted -> +48 more` | High | Phase 5 Wave 3 |
| src/pages/admin-page.tsx | house-role | 2310: `<p className="text-sm text-muted-foreground">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2325: `<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2326: `<div className="rounded-md border ... px-3 py-2">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2327: `<p className="text-sm uppercase tracking-wide ...">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2328: `<p className="text-xl font-semibold ...">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2330: `<div className="rounded-md border ... px-3 py-2">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2331: `<p className="text-sm uppercase tracking-wide ...">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2332: `<p className="text-xl font-semibold ...">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2336: `<div className="rounded-md border ... px-3 py-2">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 2337: `<p className="text-sm uppercase tracking-wide ...">` | Medium | Phase 5 Wave 2 |
| src/pages/admin-page.tsx | house-role | 1: `Additional untagged intrinsic JSX elements omitted -> +103 more` | Medium | Phase 5 Wave 2 |
| src/pages/auth-callback-page.tsx | house-role | 114: `<p className="flex items-center gap-2 text-xs text-slate-500">` | Low | Phase 5 Wave 1 |
| src/pages/auth-page.tsx | house-role | 1099: `<p className="text-sm text-[hsl(var(--tone-danger-700))]">` | Low | Phase 5 Wave 1 |

## Acceptance Criteria

- [ ] Phase 5 exit: All violations resolved
- [ ] Governance script passes with 0 violations
- [ ] All components use token system

## Notes

These are pre-existing legacy code violations. New code must have zero violations.

# UI Fit Check Report

This report maps inspected UI elements to the approved Design System. The place of truth for replacements is **Design System / Approvals** in Storybook.

## Summary

| Input | Approved status | Confidence | Recommended replacement |
|---|---|---|---|
| #root > div > div > main > div > div > div > div > div > div.flex.w-full.min-w-0.items-center.justify-start.flex-nowrap.gap-[var(--marker-gap-title)].ml-[var(--layout-section-anchor-inline)] > header > div > div | 🟡 Allowed temporarily (needs migration) | Medium | Use Stack/Section recipe for rhythm instead of utility spacing classes. |

## Detailed results

## #root > div > div > main > div > div > div > div > div > div.flex.w-full.min-w-0.items-center.justify-start.flex-nowrap.gap-[var(--marker-gap-title)].ml-[var(--layout-section-anchor-inline)] > header > div > div




Confidence: Medium

**A) What it is**
- Class

**B) Where it comes from in the code**
- src/components/layout/top-bar.tsx (layout shell (frontend/src/components/layout/**))
  - src/components/layout/top-bar.tsx:97 → <header className="border-b border-[hsl(var(--stroke-soft)/0.82)] bg-card/95 backdrop-blur">
  - src/components/layout/top-bar.tsx:98 → <div className="flex h-14 items-center px-[var(--header-side-padding)] xl:px-[var(--header-side-padding-xl)]">
  - src/components/layout/top-bar.tsx:99 → <div className="flex min-w-[11.5rem] shrink-0 items-center gap-[var(--header-gap-group)] xl:min-w-[14.5rem] 2xl:min-w-72">
  - src/components/layout/top-bar.tsx:114 → <div className="flex min-w-0 items-center gap-[var(--header-gap-tight)]">
- src/components/layout/account-navigator.tsx (layout shell (frontend/src/components/layout/**))
  - src/components/layout/account-navigator.tsx:106 → <div className={houseLayout.sidebarHeader}>
  - src/components/layout/account-navigator.tsx:107 → <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass('overview'))}>
  - src/components/layout/account-navigator.tsx:109 → </div>
  - src/components/layout/account-navigator.tsx:110 → </div>
- src/components/layout/study-navigator.tsx (layout shell (frontend/src/components/layout/**))
  - src/components/layout/study-navigator.tsx:80 → {item.dividerBefore ? <Separator className="house-nav-section-separator" /> : null}
  - src/components/layout/study-navigator.tsx:134 → <div className={houseLayout.sidebarHeader}>
  - src/components/layout/study-navigator.tsx:135 → <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))}>
  - src/components/layout/study-navigator.tsx:136 → <div className="flex items-center gap-2">
- src/components/layout/workspace-navigator.tsx (layout shell (frontend/src/components/layout/**))
  - src/components/layout/workspace-navigator.tsx:97 → <div className={houseLayout.sidebarHeader}>
  - src/components/layout/workspace-navigator.tsx:98 → <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))}>
  - src/components/layout/workspace-navigator.tsx:99 → <div className="flex items-center gap-2">
  - src/components/layout/workspace-navigator.tsx:109 → </div>
- src/pages/workspaces-data-library-view.tsx (page (frontend/src/pages/**))
  - src/pages/workspaces-data-library-view.tsx:564 → <div className="house-main-heading-block flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
  - src/pages/workspaces-data-library-view.tsx:565 → <div className="house-main-title-block">
  - src/pages/workspaces-data-library-view.tsx:570 → </div>
  - src/pages/workspaces-data-library-view.tsx:571 → <div className="flex flex-wrap items-center gap-2">

**C) Approved status**
- 🟡 Allowed temporarily (needs migration)

**D) Why**
- Class-based styling may be valid now, but canonical approvals prefer primitive and pattern composition.

**E) Where to check it in Storybook**
- Design System / Approvals → Patterns (PanelShell/ChartFrame/SectionMarker etc)

**F) What it should become (recommended replacement)**
- Use Stack/Section recipe for rhythm instead of utility spacing classes.
Suggested snippet:

```tsx
<Section surface="card" inset="md" spaceY="sm">
  <Stack space="md">
    <SectionHeader heading="Title" />
    <div>Content</div>
  </Stack>
</Section>
```


**G) Scope suggestion**
- Fix in this page only

## Next actions (most efficient first)

- [ ] #root > div > div > main > div > div > div > div > div > div.flex.w-full.min-w-0.items-center.justify-start.flex-nowrap.gap-[var(--marker-gap-title)].ml-[var(--layout-section-anchor-inline)] > header > div > div: fix in this page only → Use Stack/Section recipe for rhythm instead of utility spacing classes.

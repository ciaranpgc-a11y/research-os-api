# Add Citation Momentum Story States (Empty + Error)

Task:
- Add new Storybook story variants for **Citation momentum**:
  - Empty state
  - Error state

Scope rules:
- You may edit only:
  - `frontend/src/components/publications/PublicationsTopStrip.stories.tsx`
  - `frontend/src/mocks/fixtures/publications-metrics.ts` (only if additional fixtures are required)
- Do not edit any production app logic.
- Do not edit runtime page/component logic outside Storybook/fixtures.

Acceptance:
- Storybook shows separate variants for empty and error cases.
- Existing story variants continue to work.
- Production build behavior is unchanged.

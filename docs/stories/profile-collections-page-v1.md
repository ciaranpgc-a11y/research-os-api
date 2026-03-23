# Profile Collections Page v1

- **Status:** live
- **Lane:** Now
- **Area:** Profile > My Research > Collections

## Goal

Promote publication collections from an overlay inside Publications into a first-class Profile page that uses the standard account shell and left navigation.

## Scope Delivered

- Added `Collections` as a sibling nav item to `Publications` under the Profile shell.
- Added a dedicated route at `/profile/collections`.
- Reused the existing collections workspace in page mode instead of the old sheet overlay.
- Removed the global `Delete all collections` affordance from the page experience.
- Kept publication handoff by routing users back into the Publications page when they open a publication from Collections.
- Added a batch collections-membership read endpoint to reduce request fan-out during collections hydration.

## Acceptance Notes

- The Collections page loads within the standard Profile left-nav layout.
- The Publications page no longer opens the old collections overlay when `My collections` is selected.
- Page-level empty states explain how to create a collection and how to add publications.
- Icon-only controls in the collections flow expose accessible labels.
- Collections hydration uses a batch membership read before falling back to per-publication reads.

## Known Gaps

- Publication drilldown is still owned by the Publications page, so collection-origin context is only preserved at the route level in v1.
- Bulk membership actions, collection-aware previous/next navigation, and richer collection metadata remain follow-on work.

## Verification

- `python -m compileall src/research_os/api/app.py src/research_os/api/schemas.py src/research_os/services/collection_service.py`
- `cmd /c npm run typecheck --prefix frontend`
- `cmd /c npm run build --prefix frontend`
- Browser smoke on localhost for create/delete collection flow and Publications -> Collections navigation.

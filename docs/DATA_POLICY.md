# Data Policy

## Hard rule

- Never commit real datasets, model exports, or audit screenshots in this repository.

## Local workdir for real data

- Put real local data in `data_local/`.
- `data_local/` is intentionally ignored by git so it is safe for local/offline use and not committed.

## Tracked sample fixtures

- Put tiny synthetic fixtures under `data_samples/` only.
- `data_samples/` is tracked and intended for minimal demo/sample fixtures used by docs or tests.

## Enforcement

- `data_local/*` is ignored.
- `data_local/README.md` is allowed to track the policy note for this folder.
- `data_samples/*` is allowed to track fixture files (when added).

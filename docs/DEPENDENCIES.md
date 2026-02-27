# Dependencies

## Source of truth

- Primary dependency source: `pyproject.toml`
  - Install app + dev/test dependencies with:
    - `python -m pip install -e ".[dev]"`

## Secondary / legacy file

- `requirements.txt` is deprecated for active dependency management.
- It is retained temporarily for historical/legacy workflows only.
- For active development, CI, and rebuilds, use `pyproject.toml` as the authoritative file.

## Why this exists

- CI installs from `.[dev]` in `.github/workflows/ci.yml`.
- Frontend tooling is managed via `frontend/package.json` + `frontend/package-lock.json`.

# Dependencies

## Source of truth

- Primary dependency source: `pyproject.toml`
  - Install app + dev/test dependencies with:
    - `python -m pip install -e ".[dev]"`

## Secondary / legacy file

- `requirements.txt` is deprecated for active dependency management.
- It is retained temporarily for historical/legacy workflows only.
- For active development, CI, and rebuilds, use `pyproject.toml` as the authoritative file.
- `requirements.txt` intentionally carries this warning at the top:
  - `Generated/legacy; do not edit manually; source of truth is pyproject.toml.`

## Regenerating legacy requirements (manual)

If you must refresh `requirements.txt`, use a dedicated environment and regenerate it explicitly:

```bash
python -m pip install -U pip-tools
pip-compile pyproject.toml --all-extras --output-file requirements.txt
```

Because exports can vary by environment, we do not fail CI on exact lock drift by default.

## Why this exists

- CI installs from `.[dev]` in `.github/workflows/ci.yml`.
- Frontend tooling is managed via `frontend/package.json` + `frontend/package-lock.json`.

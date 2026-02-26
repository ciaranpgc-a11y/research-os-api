from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

MAJOR_CHANGE_PREFIXES = (
    "frontend/src/",
    "src/research_os/api/",
    "src/research_os/services/",
    "alembic/versions/",
)

CHANGE_LOG_PATH = "docs/change-log.md"
STORY_DOC_PREFIX = "docs/stories/"
GOVERNANCE_DOC_PATHS = {
    "docs/change-documentation-rules.md",
    "docs/parallel-feature-delivery.md",
    "docs/design-governance.md",
}


def run_git(args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return completed.stdout.strip()


def normalize_changed_files(raw: str) -> list[str]:
    items = [line.strip().replace("\\", "/") for line in raw.splitlines()]
    return [item for item in items if item]


def resolve_base_sha() -> str | None:
    env_base = str(os.getenv("DOCS_BASE_SHA", "")).strip()
    if env_base and set(env_base) != {"0"}:
        return env_base
    try:
        return run_git(["rev-parse", "HEAD~1"])
    except subprocess.CalledProcessError:
        return None


def is_major_change(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in MAJOR_CHANGE_PREFIXES)


def has_story_or_governance_doc(changed_files: list[str]) -> bool:
    for path in changed_files:
        if path.startswith(STORY_DOC_PREFIX) and path.endswith(".md"):
            return True
        if path in GOVERNANCE_DOC_PATHS:
            return True
    return False


def main() -> int:
    base_sha = resolve_base_sha()
    if not base_sha:
        print("Documentation check skipped: no base revision available.")
        return 0

    changed_raw = run_git(["diff", "--name-only", base_sha, "HEAD"])
    changed_files = normalize_changed_files(changed_raw)
    if not changed_files:
        print("Documentation check passed: no changed files detected.")
        return 0

    major_changed_files = [path for path in changed_files if is_major_change(path)]
    if not major_changed_files:
        print("Documentation check passed: no major product/engineering files changed.")
        return 0

    failures: list[str] = []
    if CHANGE_LOG_PATH not in changed_files:
        failures.append(f"- Missing required change-log update: `{CHANGE_LOG_PATH}`")
    if not has_story_or_governance_doc(changed_files):
        failures.append(
            "- Missing required story/governance update: add a document under "
            f"`{STORY_DOC_PREFIX}` or update one of {sorted(GOVERNANCE_DOC_PATHS)}"
        )

    if failures:
        print("Documentation check failed.")
        print("Major files changed:")
        for path in major_changed_files:
            print(f"- {path}")
        print("Required documentation gaps:")
        for failure in failures:
            print(failure)
        return 1

    print("Documentation check passed for major changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

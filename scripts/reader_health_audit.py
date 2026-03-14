#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from research_os.services.reader_health_service import (  # noqa: E402
    audit_publication_reader_response,
    load_reader_response_json,
    summarize_publication_reader_audits,
)


def _iter_json_paths(inputs: list[str]) -> list[Path]:
    paths: list[Path] = []
    for raw_input in inputs:
        path = Path(raw_input).expanduser().resolve()
        if path.is_dir():
            paths.extend(sorted(candidate for candidate in path.rglob("*.json") if candidate.is_file()))
            continue
        if path.is_file():
            paths.append(path)
            continue
        raise FileNotFoundError(f"Input path does not exist: {raw_input}")
    return paths


def _build_report(paths: list[Path]) -> dict:
    audits: list[dict] = []
    for path in paths:
        response = load_reader_response_json(path)
        audit = audit_publication_reader_response(response)
        audits.append(
            {
                "path": str(path),
                "audit": audit,
            }
        )
    return {
        "audits": audits,
        "aggregate": summarize_publication_reader_audits(
            [entry["audit"] for entry in audits]
        ),
    }


def _print_pretty(report: dict) -> None:
    aggregate = report.get("aggregate") or {}
    print("Reader Health Audit")
    print("===================")
    print(f"Publications: {aggregate.get('publication_count', 0)}")
    if aggregate.get("parser_status_counts"):
        print(f"Parser states: {aggregate['parser_status_counts']}")
    if aggregate.get("highest_severity_counts"):
        print(f"Highest severities: {aggregate['highest_severity_counts']}")
    if aggregate.get("finding_code_counts"):
        print("Top findings:")
        for code, count in sorted(
            aggregate["finding_code_counts"].items(),
            key=lambda item: (-item[1], item[0]),
        )[:10]:
            print(f"  {code}: {count}")

    print("")
    for entry in report.get("audits", []):
        path = entry.get("path") or "unknown"
        audit = entry.get("audit") or {}
        metadata = audit.get("metadata") or {}
        summary = audit.get("summary") or {}
        print(f"{metadata.get('title') or path}")
        print(f"  file: {path}")
        print(
            f"  highest severity: {summary.get('highest_severity', 'none')} | "
            f"findings: {summary.get('finding_count', 0)}"
        )
        for finding in audit.get("findings", [])[:8]:
            print(f"  - [{finding.get('severity', 'info')}] {finding.get('code')}: {finding.get('message')}")
        if len(audit.get("findings", [])) > 8:
            print(f"  - ... {len(audit['findings']) - 8} more findings")
        print("")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Audit saved publication paper-model JSON responses and summarize reader readiness, "
            "structure, anchors, assets, and citation health."
        )
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="One or more JSON files or directories containing saved paper-model responses.",
    )
    parser.add_argument(
        "--format",
        choices=("pretty", "json"),
        default="pretty",
        help="Output format.",
    )
    args = parser.parse_args()

    report = _build_report(_iter_json_paths(args.inputs))
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0

    _print_pretty(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

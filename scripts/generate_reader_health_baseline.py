#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from research_os.services.reader_health_service import (  # noqa: E402
    audit_publication_reader_response,
    summarize_publication_reader_audits,
)


def _load_ids(args: argparse.Namespace) -> list[str]:
    ids: list[str] = []
    for publication_id in args.publication_id or []:
        clean = str(publication_id or "").strip()
        if clean:
            ids.append(clean)
    if args.ids_json:
        raw = json.loads(Path(args.ids_json).read_text(encoding="utf-8-sig"))
        if isinstance(raw, list):
            ids.extend(str(item or "").strip() for item in raw if str(item or "").strip())
        else:
            raise ValueError("--ids-json must contain a JSON array of publication IDs.")
    seen: set[str] = set()
    ordered_ids: list[str] = []
    for publication_id in ids:
        if publication_id in seen:
            continue
        seen.add(publication_id)
        ordered_ids.append(publication_id)
    if not ordered_ids:
        raise ValueError("Provide at least one publication ID via --publication-id or --ids-json.")
    return ordered_ids


def _fetch_paper_model(
    *,
    client: httpx.Client,
    api_base_url: str,
    publication_id: str,
) -> dict[str, Any]:
    response = client.get(f"{api_base_url}/v1/publications/{publication_id}/paper-model")
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f"Expected object response for publication '{publication_id}'.")
    return payload


def _write_markdown_summary(path: Path, report: dict[str, Any]) -> None:
    aggregate = report.get("aggregate") or {}
    lines = [
        "# Reader Health Baseline",
        "",
        f"- Publications audited: {aggregate.get('publication_count', 0)}",
        f"- Parser states: `{json.dumps(aggregate.get('parser_status_counts', {}), sort_keys=True)}`",
        f"- Highest severities: `{json.dumps(aggregate.get('highest_severity_counts', {}), sort_keys=True)}`",
        f"- Average section anchor coverage: `{aggregate.get('average_section_anchor_coverage')}`",
        f"- Average figure surface coverage: `{aggregate.get('average_figure_surface_coverage')}`",
        f"- Average table surface coverage: `{aggregate.get('average_table_surface_coverage')}`",
        "",
        "## Top Findings",
        "",
    ]
    finding_counts = aggregate.get("finding_code_counts") or {}
    if finding_counts:
        for code, count in sorted(finding_counts.items(), key=lambda item: (-item[1], item[0]))[:12]:
            lines.append(f"- `{code}`: {count}")
    else:
        lines.append("- None")

    lines.extend(["", "## Per Publication", ""])
    for entry in report.get("audits", []):
        audit = entry.get("audit") or {}
        metadata = audit.get("metadata") or {}
        summary = audit.get("summary") or {}
        lines.append(f"### {metadata.get('title') or entry.get('publication_id')}")
        lines.append("")
        lines.append(f"- Publication ID: `{metadata.get('publication_id') or entry.get('publication_id')}`")
        lines.append(f"- Highest severity: `{summary.get('highest_severity', 'none')}`")
        lines.append(f"- Finding count: `{summary.get('finding_count', 0)}`")
        findings = audit.get("findings") or []
        if findings:
            lines.append("- Findings:")
            for finding in findings[:8]:
                lines.append(
                    f"  - `{finding.get('severity', 'info')}` `{finding.get('code')}`: {finding.get('message')}"
                )
            if len(findings) > 8:
                lines.append(f"  - ... {len(findings) - 8} more")
        else:
            lines.append("- Findings: none")
        lines.append("")

    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch live publication paper-model responses, save them, and build a reader health baseline report."
        )
    )
    parser.add_argument(
        "--api-base-url",
        default="https://api.axiomos.studio",
        help="Base URL for the Axiomos API.",
    )
    parser.add_argument(
        "--publication-id",
        action="append",
        default=[],
        help="Publication ID to include. Repeat for multiple IDs.",
    )
    parser.add_argument(
        "--ids-json",
        help="Path to a JSON array of publication IDs.",
    )
    parser.add_argument(
        "--token-env",
        default="AXIOMOS_SESSION_TOKEN",
        help="Environment variable containing the bearer token.",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory to write raw responses and aggregate reports into.",
    )
    args = parser.parse_args()

    token = str(os.getenv(args.token_env) or "").strip()
    if not token:
        raise ValueError(
            f"Environment variable '{args.token_env}' is required to fetch live reader payloads."
        )

    publication_ids = _load_ids(args)
    output_dir = Path(args.output_dir).resolve()
    responses_dir = output_dir / "responses"
    responses_dir.mkdir(parents=True, exist_ok=True)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    audits: list[dict[str, Any]] = []

    with httpx.Client(headers=headers, timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True) as client:
        for publication_id in publication_ids:
            response_payload = _fetch_paper_model(
                client=client,
                api_base_url=args.api_base_url.rstrip("/"),
                publication_id=publication_id,
            )
            (responses_dir / f"{publication_id}.json").write_text(
                json.dumps(response_payload, indent=2, sort_keys=True),
                encoding="utf-8",
            )
            audits.append(
                {
                    "publication_id": publication_id,
                    "audit": audit_publication_reader_response(response_payload),
                }
            )

    report = {
        "api_base_url": args.api_base_url.rstrip("/"),
        "publication_ids": publication_ids,
        "audits": audits,
        "aggregate": summarize_publication_reader_audits(
            [entry["audit"] for entry in audits]
        ),
    }

    report_json_path = output_dir / "reader-health-baseline.json"
    report_json_path.write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    _write_markdown_summary(output_dir / "reader-health-baseline.md", report)

    print(f"Wrote baseline report to {report_json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

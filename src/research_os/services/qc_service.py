from datetime import UTC
from datetime import datetime
from uuid import uuid4

_SEVERITY_WEIGHT = {"high": 0, "medium": 1, "low": 2}

_QC_ISSUES: list[dict[str, object]] = [
    {
        "id": "QC-001",
        "category": "Unsupported claims",
        "severity": "high",
        "count": 3,
        "summary": "Inferential statements without direct evidence anchors.",
    },
    {
        "id": "QC-002",
        "category": "Missing citations",
        "severity": "medium",
        "count": 5,
        "summary": "Mandatory citation slots remain unfilled in key sections.",
    },
    {
        "id": "QC-003",
        "category": "Inconsistent numbers",
        "severity": "high",
        "count": 2,
        "summary": "Methods and Results report conflicting denominators.",
    },
    {
        "id": "QC-004",
        "category": "Journal non-compliance",
        "severity": "medium",
        "count": 4,
        "summary": "Abstract structure diverges from target journal instructions.",
    },
    {
        "id": "QC-005",
        "category": "Word budget issues",
        "severity": "low",
        "count": 6,
        "summary": "Section budgets exceeded by 8-12% in Methods and Discussion.",
    },
]


def run_qc_checks() -> dict[str, object]:
    issues = sorted(
        _QC_ISSUES,
        key=lambda issue: (
            _SEVERITY_WEIGHT[str(issue["severity"])],
            -int(issue["count"]),
        ),
    )
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for issue in issues:
        severity = str(issue["severity"])
        severity_counts[severity] += int(issue["count"])

    return {
        "run_id": str(uuid4()),
        "generated_at": datetime.now(UTC),
        "total_findings": sum(int(issue["count"]) for issue in issues),
        "high_severity_count": severity_counts["high"],
        "medium_severity_count": severity_counts["medium"],
        "low_severity_count": severity_counts["low"],
        "issues": issues,
    }

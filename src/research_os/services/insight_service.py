from typing import Literal

SelectionType = Literal["claim", "result", "qc"]


class SelectionInsightNotFoundError(Exception):
    """Raised when no insight payload exists for a selected item."""


_CLAIM_INSIGHTS: dict[str, dict[str, object]] = {
    "intro-p1": {
        "title": "Clinical Burden",
        "summary": (
            "Baseline burden statement anchored to registry incidence and external"
            " epidemiology benchmarks."
        ),
        "evidence": [
            {
                "id": "ehr-cohort-overview",
                "label": "Registry baseline report",
                "source": "Internal HF Registry 2019-2024",
                "confidence": "High",
            },
            {
                "id": "aha-epidemiology",
                "label": "National epidemiology benchmark",
                "source": "AHA Scientific Statement 2024",
                "confidence": "Moderate",
            },
        ],
        "qc": [
            "Numeric prevalence aligns with cohort table T1.",
            "One citation slot still open for regional benchmark.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "Adults with index HF admission",
            "model": "Descriptive prevalence extraction",
            "covariates": [],
            "validation_checks": ["Cross-check vs admissions cube", "Range sanity pass"],
            "notes": ["Generated from structured cohort summary template."],
        },
        "citations": [
            "AHA 2024 HF Statement",
            "ESC 2023 Heart Failure Guidelines",
        ],
    },
    "methods-p1": {
        "title": "Population Definition",
        "summary": "Eligibility and exclusion logic for reproducible cohort construction.",
        "evidence": [
            {
                "id": "phenotype-logic",
                "label": "Inclusion/exclusion phenotype logic",
                "source": "SQL Phenotype v3.2",
                "confidence": "High",
            },
            {
                "id": "chart-review-kappa",
                "label": "Chart review agreement",
                "source": "Validation Memo kappa=0.89",
                "confidence": "High",
            },
        ],
        "qc": [
            "Definition is stable across frozen extraction script.",
            "Transplant exclusion criterion documented in audit trail.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "ICD-10 primary HF codes with exclusions",
            "model": "Rule-based phenotype assembly",
            "covariates": ["Age", "Sex"],
            "validation_checks": ["Dual review sample n=120", "Code-set version pinning"],
            "notes": ["Phenotype promoted to production in release 2025.2."],
        },
        "citations": ["STROBE Checklist", "ICD-10 Coding Validation Framework"],
    },
}

_RESULT_INSIGHTS: dict[str, dict[str, object]] = {
    "RES-001": {
        "title": "Primary Endpoint Model",
        "summary": "Adjusted hazard ratio for 90-day readmission risk.",
        "evidence": [
            {
                "id": "res-001",
                "label": "Primary adjusted model output",
                "source": "Cox PH model artifact",
                "confidence": "High",
            }
        ],
        "qc": [
            "PH assumption passed.",
            "Bootstrap calibration slope within tolerance.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "Adults, complete 90-day follow-up",
            "model": "Cox PH (Adjusted)",
            "covariates": [
                "Age",
                "Sex",
                "LVEF stratum",
                "CKD",
                "Baseline NT-proBNP",
            ],
            "validation_checks": [
                "PH assumption passed",
                "Bootstrap B=500",
                "Calibration slope 0.96",
            ],
            "notes": ["Model artifact hash: mdl_res001_2f9b"],
        },
        "citations": ["Harrell Regression Modeling Strategies", "TRIPOD-AI 2024"],
    },
    "RES-002": {
        "title": "Secondary Endpoint Model",
        "summary": "Adjusted logistic model for medication reconciliation endpoint.",
        "evidence": [
            {
                "id": "res-002",
                "label": "Secondary model output",
                "source": "Logistic model artifact",
                "confidence": "High",
            }
        ],
        "qc": [
            "Cross-validation complete.",
            "No high-leverage points detected.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "Completed discharge medication reconciliation",
            "model": "Logistic (Adjusted)",
            "covariates": ["Age", "eGFR", "Diabetes", "Prior HF admission"],
            "validation_checks": ["10-fold CV", "Brier score 0.14"],
            "notes": ["L2 penalty tuned on nested CV."],
        },
        "citations": ["Steyerberg Clinical Prediction Models"],
    },
}

_QC_INSIGHTS: dict[str, dict[str, object]] = {
    "QC-001": {
        "title": "Unsupported Claims",
        "summary": "Inferential statements without direct anchor linkage.",
        "evidence": [
            {
                "id": "qc-unsupported-claims",
                "label": "Rule engine output",
                "source": "Integrity Rule Pack 3.1",
                "confidence": "High",
            }
        ],
        "qc": [
            "3 discussion statements require direct result-object links.",
            "At least one anchor must be high confidence for inferential claims.",
        ],
        "derivation": {
            "dataset": "AAWE rule evaluation graph",
            "population_filter": "Discussion section claims",
            "model": "Rule-based classification",
            "covariates": [],
            "validation_checks": ["Rule parity check", "Manual adjudication sample n=25"],
            "notes": ["Triggered by rule UNSUPPORTED_INFERENTIAL_CLAIM."],
        },
        "citations": [
            "AAWE Evidence Linking Standard v1.1",
            "CONSORT Explanation & Elaboration",
        ],
    }
}


def get_selection_insight(selection_type: SelectionType, item_id: str) -> dict[str, object]:
    lookup = {
        "claim": _CLAIM_INSIGHTS,
        "result": _RESULT_INSIGHTS,
        "qc": _QC_INSIGHTS,
    }[selection_type]
    payload = lookup.get(item_id)
    if payload is None:
        raise SelectionInsightNotFoundError(
            f"No insight payload found for {selection_type} '{item_id}'."
        )
    return {
        "selection_type": selection_type,
        "item_id": item_id,
        **payload,
    }

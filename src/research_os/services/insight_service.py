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
    "results-p1": {
        "title": "Primary Endpoint Signal",
        "summary": "Adjusted intervention effect statement linked to primary model output.",
        "evidence": [
            {
                "id": "res-001",
                "label": "Primary adjusted model output",
                "source": "Result Object RES-001",
                "confidence": "High",
            },
            {
                "id": "bootstrap-valid",
                "label": "Bootstrap calibration check",
                "source": "Validation Pipeline v2",
                "confidence": "Moderate",
            },
        ],
        "qc": [
            "Effect estimate matches canonical result registry.",
            "Language remains inferential, not causal.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "Analysis cohort with complete follow-up",
            "model": "Cox PH (Adjusted)",
            "covariates": [
                "Age",
                "Sex",
                "LVEF stratum",
                "CKD",
                "Baseline NT-proBNP",
            ],
            "validation_checks": ["PH assumption passed", "Bootstrap B=500"],
            "notes": ["Sentence is generated from result object summary template."],
        },
        "citations": ["TRIPOD-AI Guidance 2024"],
    },
    "discussion-p1": {
        "title": "Interpretation in Practice",
        "summary": "Comparative interpretation against pragmatic program benchmarks.",
        "evidence": [
            {
                "id": "sensitivity-pack",
                "label": "Sensitivity models bundle",
                "source": "Result Objects RES-003 to RES-006",
                "confidence": "Moderate",
            },
            {
                "id": "external-compare",
                "label": "External benchmark cohort",
                "source": "Regional HF Learning Network",
                "confidence": "Preliminary",
            },
        ],
        "qc": [
            "Comparative phrasing requires at least one external citation.",
            "Preliminary anchor flagged for low confidence.",
        ],
        "derivation": {
            "dataset": "AAWE interpretation layer",
            "population_filter": "Post-hoc comparative narrative candidates",
            "model": "Comparative claim synthesis",
            "covariates": [],
            "validation_checks": ["External benchmark harmonization pending"],
            "notes": ["Generated after sensitivity summary import."],
        },
        "citations": [
            "JACC HF Pragmatic Programs Review",
            "ESC Pragmatic Trials Position Paper",
        ],
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
    "RES-003": {
        "title": "Subgroup Interaction Model",
        "summary": "HFpEF subgroup effect with interaction term assessment.",
        "evidence": [
            {
                "id": "res-003",
                "label": "Subgroup model output",
                "source": "Cox PH interaction artifact",
                "confidence": "Moderate",
            }
        ],
        "qc": [
            "Interaction p-value below prespecified threshold.",
            "Bootstrap validation pending before publication lock.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "HFpEF subgroup",
            "model": "Cox PH + interaction",
            "covariates": [
                "Age",
                "Sex",
                "Atrial fibrillation",
                "Loop diuretic dose",
            ],
            "validation_checks": ["Interaction p=0.03", "Bootstrap pending"],
            "notes": ["Use cautious language due to subgroup analysis."],
        },
        "citations": ["Subgroup Analysis Best Practices JAMA"],
    },
    "RES-004": {
        "title": "Safety Signal Model",
        "summary": "Safety endpoint robust Poisson estimate.",
        "evidence": [
            {
                "id": "res-004",
                "label": "Safety model output",
                "source": "Robust Poisson artifact",
                "confidence": "High",
            }
        ],
        "qc": [
            "No excess safety signal detected.",
            "Negative control outcome remains neutral.",
        ],
        "derivation": {
            "dataset": "HF Registry v2025.2",
            "population_filter": "Intervention exposure >=30 days",
            "model": "Poisson robust",
            "covariates": ["Age", "Baseline potassium", "ACEi/ARB use"],
            "validation_checks": [
                "Overdispersion check passed",
                "Negative control outcome neutral",
            ],
            "notes": ["Safety model maintained as confirmatory secondary output."],
        },
        "citations": ["FDA Post-Marketing Safety Signal Framework"],
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
    },
    "QC-002": {
        "title": "Missing Citations",
        "summary": "Mandatory citation slots remain unresolved in key sections.",
        "evidence": [
            {
                "id": "qc-missing-citations",
                "label": "Citation slot audit",
                "source": "AAWE citation completeness checker",
                "confidence": "High",
            }
        ],
        "qc": [
            "5 slots still open across introduction and limitations.",
            "Pre-submission gate requires 100% mandatory slot completion.",
        ],
        "derivation": {
            "dataset": "Manuscript citation graph",
            "population_filter": "Required citation slots",
            "model": "Rule-based completeness scoring",
            "covariates": [],
            "validation_checks": ["Slot graph integrity pass"],
            "notes": ["Triggered by rule CITATION_SLOT_EMPTY."],
        },
        "citations": [
            "ICMJE Recommendations",
            "Journal Citation Completeness Checklist",
        ],
    },
    "QC-003": {
        "title": "Inconsistent Numbers",
        "summary": "Numerical mismatch detected between Methods and Results.",
        "evidence": [
            {
                "id": "qc-inconsistent-numbers",
                "label": "Numeric consistency checker",
                "source": "AAWE number alignment engine",
                "confidence": "High",
            }
        ],
        "qc": [
            "Methods reports n=1248 while Results reports n=1284.",
            "Canonical population object RES-POP-BASE should be referenced.",
        ],
        "derivation": {
            "dataset": "Section-level numeric parse graph",
            "population_filter": "Methods + Results sections",
            "model": "Cross-section denominator reconciliation",
            "covariates": [],
            "validation_checks": ["Regex extract pass", "Token-level alignment check"],
            "notes": ["Triggered by NUMERIC_MISMATCH_DENOMINATOR."],
        },
        "citations": ["AAWE Numeric Consistency Rulebook"],
    },
    "QC-004": {
        "title": "Journal Non-Compliance",
        "summary": "Abstract structure diverges from target journal requirements.",
        "evidence": [
            {
                "id": "qc-journal-compliance",
                "label": "Journal policy validator",
                "source": "Author Instructions parser",
                "confidence": "Moderate",
            }
        ],
        "qc": [
            "Structured heading schema not fully satisfied.",
            "Background sub-section exceeds allowed sentence budget.",
        ],
        "derivation": {
            "dataset": "Journal profile ruleset",
            "population_filter": "Abstract section",
            "model": "Template conformance validator",
            "covariates": [],
            "validation_checks": ["Heading schema check", "Word budget check"],
            "notes": ["Triggered by JOURNAL_SCHEMA_ABSTRACT mismatch."],
        },
        "citations": ["Target Journal Author Instructions v2026.1"],
    },
    "QC-005": {
        "title": "Word Budget Issues",
        "summary": "Section-level text exceeds configured target budgets.",
        "evidence": [
            {
                "id": "qc-word-budget",
                "label": "Section budget analyzer",
                "source": "AAWE token/word budget monitor",
                "confidence": "High",
            }
        ],
        "qc": [
            "Methods and Discussion exceed target by 8-12%.",
            "Condense low-evidence narrative before submission draft freeze.",
        ],
        "derivation": {
            "dataset": "Draft section metrics",
            "population_filter": "Methods + Discussion sections",
            "model": "Budget variance scoring",
            "covariates": [],
            "validation_checks": ["Word count normalization", "Section target policy match"],
            "notes": ["Triggered by WORD_BUDGET_VARIANCE threshold breach."],
        },
        "citations": ["Internal Word Budget Policy"],
    },
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

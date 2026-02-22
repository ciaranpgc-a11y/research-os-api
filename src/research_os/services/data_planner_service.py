from __future__ import annotations

import csv
import io
import os
import re
from pathlib import Path
from typing import Any

from sqlalchemy import select

from research_os.db import (
    DataLibraryAsset,
    DataProfile,
    Manuscript,
    ManuscriptAssetLink,
    ManuscriptPlan,
    PlannerArtifact,
    create_all_tables,
    session_scope,
)

SECTION_CONTEXTS = {"RESULTS", "TABLES", "FIGURES", "PLANNER"}
TOOL_NAMES = {"improve", "critique", "alternatives", "subheadings", "link_to_data", "checklist"}


class DataAssetNotFoundError(RuntimeError):
    pass


class PlannerValidationError(RuntimeError):
    pass


def _storage_root() -> Path:
    root = Path(os.getenv("DATA_LIBRARY_ROOT", "./data_library_store"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slugify_filename(value: str) -> str:
    candidate = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip(".-")
    return candidate or "asset"


def _guess_kind(filename: str) -> str:
    lowered = filename.lower()
    if lowered.endswith(".csv"):
        return "csv"
    if lowered.endswith(".tsv"):
        return "tsv"
    if lowered.endswith(".xlsx"):
        return "xlsx"
    if lowered.endswith(".txt"):
        return "txt"
    return "unknown"


def upload_library_assets(*, files: list[tuple[str, str | None, bytes]], project_id: str | None = None) -> list[str]:
    create_all_tables()
    if not files:
        raise PlannerValidationError("At least one file is required for upload.")
    asset_ids: list[str] = []
    with session_scope() as session:
        for raw_filename, mime_type, content in files:
            filename = _slugify_filename(raw_filename)
            asset = DataLibraryAsset(
                project_id=project_id or None,
                filename=filename,
                kind=_guess_kind(filename),
                mime_type=(mime_type or "").strip() or None,
                byte_size=len(content),
                storage_path="",
            )
            session.add(asset)
            session.flush()
            extension = Path(filename).suffix or ".bin"
            path = _storage_root() / f"{asset.id}{extension}"
            path.write_bytes(content)
            asset.storage_path = str(path.resolve())
            session.flush()
            asset_ids.append(asset.id)
    return asset_ids


def list_library_assets(*, project_id: str | None = None) -> list[dict[str, object]]:
    create_all_tables()
    with session_scope() as session:
        query = select(DataLibraryAsset).order_by(DataLibraryAsset.uploaded_at.desc())
        if project_id:
            query = query.where(DataLibraryAsset.project_id == project_id)
        rows = session.scalars(query).all()
        return [
            {
                "id": row.id,
                "project_id": row.project_id,
                "filename": row.filename,
                "kind": row.kind,
                "mime_type": row.mime_type,
                "byte_size": int(row.byte_size or 0),
                "uploaded_at": row.uploaded_at,
            }
            for row in rows
        ]


def attach_assets_to_manuscript(*, manuscript_id: str, asset_ids: list[str], section_context: str) -> list[str]:
    create_all_tables()
    context = section_context.strip().upper()
    clean_ids = [item.strip() for item in asset_ids if item.strip()]
    if context not in SECTION_CONTEXTS:
        raise PlannerValidationError("section_context must be RESULTS, TABLES, FIGURES, or PLANNER.")
    if not clean_ids:
        raise PlannerValidationError("asset_ids must contain at least one id.")

    with session_scope() as session:
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None:
            raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")
        found = session.scalars(select(DataLibraryAsset).where(DataLibraryAsset.id.in_(clean_ids))).all()
        found_ids = {row.id for row in found}
        missing = [item for item in clean_ids if item not in found_ids]
        if missing:
            raise DataAssetNotFoundError(f"Data assets not found: {', '.join(missing)}.")

        for asset_id in clean_ids:
            existing = session.scalars(
                select(ManuscriptAssetLink).where(
                    ManuscriptAssetLink.manuscript_id == manuscript_id,
                    ManuscriptAssetLink.asset_id == asset_id,
                    ManuscriptAssetLink.section_context == context,
                )
            ).first()
            if existing is None:
                session.add(
                    ManuscriptAssetLink(
                        manuscript_id=manuscript_id,
                        asset_id=asset_id,
                        section_context=context,
                    )
                )
        return clean_ids


def _decode_sample(content: bytes, max_chars: int) -> str:
    chunk = content[: max(0, max_chars)]
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return chunk.decode(encoding, errors="ignore")
        except Exception:
            continue
    return chunk.decode("utf-8", errors="ignore")


def _parse_csv_like(text: str, delimiter: str, max_rows: int) -> tuple[list[str], list[dict[str, str]], list[str]]:
    warnings: list[str] = []
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not rows:
        return [], [], ["No rows detected in sampled content."]
    header = [item.strip() for item in rows[0]]
    if not any(header):
        header = [f"column_{idx + 1}" for idx in range(len(rows[0]))]
        warnings.append("Header row was empty; synthetic column names were assigned.")
    preview: list[dict[str, str]] = []
    for row in rows[1 : max_rows + 1]:
        preview.append({header[idx]: (str(row[idx]).strip() if idx < len(row) else "") for idx in range(len(header))})
    return header, preview, warnings


def _role_guesses(columns: list[str]) -> dict[str, list[str]]:
    tokens = [item.lower() for item in columns]

    def _match(words: tuple[str, ...]) -> list[str]:
        return [token for token in tokens if any(word in token for word in words)]

    return {
        "outcomes": _match(("outcome", "event", "death", "mortality", "survival", "readmission", "time_to")),
        "exposures": _match(("exposure", "treatment", "drug", "group", "intervention")),
        "covariates": _match(("age", "sex", "bmi", "covariate", "comorbidity", "pressure", "rate")),
        "identifiers": _match(("id", "patient", "subject", "mrn")),
        "time_variables": _match(("time", "visit", "follow", "month", "week", "day")),
    }


def create_data_profile(*, asset_ids: list[str], sampling: dict[str, int] | None = None) -> dict[str, object]:
    create_all_tables()
    ids = [item.strip() for item in asset_ids if item.strip()]
    if not ids:
        raise PlannerValidationError("asset_ids must contain at least one value.")
    max_rows = max(20, min(int((sampling or {}).get("max_rows", 200)), 1000))
    max_chars = max(1000, min(int((sampling or {}).get("max_chars", 20000)), 200000))

    with session_scope() as session:
        assets = session.scalars(select(DataLibraryAsset).where(DataLibraryAsset.id.in_(ids))).all()
        found_ids = {row.id for row in assets}
        missing = [item for item in ids if item not in found_ids]
        if missing:
            raise DataAssetNotFoundError(f"Data assets not found: {', '.join(missing)}.")

        all_columns: list[str] = []
        warnings: list[str] = []
        rows_sampled = 0
        previews: list[dict[str, object]] = []

        for asset in assets:
            content = Path(asset.storage_path).read_bytes()
            sample = _decode_sample(content, max_chars=max_chars)
            if asset.kind in {"csv", "tsv", "txt"}:
                delimiter = "\t" if asset.kind == "tsv" else ","
                columns, preview_rows, parser_warnings = _parse_csv_like(sample, delimiter, max_rows)
                all_columns.extend(columns)
                rows_sampled += len(preview_rows)
                warnings.extend(parser_warnings)
                previews.append({"asset_id": asset.id, "filename": asset.filename, "columns": columns, "sample_rows": preview_rows[:3]})
            else:
                warnings.append(f"Asset '{asset.filename}' is {asset.kind.upper()}; variable parsing is limited.")
                previews.append({"asset_id": asset.id, "filename": asset.filename, "columns": [], "sample_rows": []})

        deduped_columns = list(dict.fromkeys([col for col in all_columns if col.strip()]))
        roles = _role_guesses(deduped_columns)
        hints: list[str] = []
        if roles["time_variables"] and roles["identifiers"]:
            hints.append("Possible repeated-measures or longitudinal structure.")
        if any("survival" in item or "time_to" in item for item in roles["outcomes"]):
            hints.append("Potential time-to-event outcome framing.")
        if any("sensitivity" in item or "specificity" in item for item in [col.lower() for col in deduped_columns]):
            hints.append("Potential diagnostic-accuracy framing.")
        if not hints:
            hints.append("Likely observational tabular dataset; confirm design explicitly.")

        unresolved: list[str] = []
        if any("time-to-event" in hint.lower() for hint in hints):
            unresolved.append("Should time-to-event modelling (Kaplan-Meier/Cox) be the primary analysis?")
        if roles["time_variables"] and roles["identifiers"]:
            unresolved.append("Are repeated measurements expected per participant and therefore mixed-effects modelling required?")
        if any("diagnostic" in hint.lower() for hint in hints):
            unresolved.append("Is there a validated reference standard for diagnostic performance evaluation?")
        if not roles["outcomes"]:
            unresolved.append("Which variable should be treated as the primary outcome?")
        if not roles["exposures"]:
            unresolved.append("Which variable(s) should be treated as primary exposure(s)?")

        uncertainty: list[str] = []
        if any(asset.kind in {"xlsx", "unknown"} for asset in assets):
            uncertainty.append("Non-CSV assets were profiled with limited variable extraction; verify mappings manually.")

        profile_json: dict[str, object] = {
            "dataset_kind": "mixed" if len({asset.kind for asset in assets}) > 1 else (assets[0].kind if assets else "unknown"),
            "likely_design_hints": hints,
            "variable_role_guesses": roles,
            "sample_size_signals": {"assets_count": len(assets), "rows_sampled": rows_sampled, "columns_detected": len(deduped_columns)},
            "warnings": list(dict.fromkeys(warnings)),
            "uncertainty": uncertainty,
            "unresolved_questions": unresolved,
            "preview": previews,
        }
        human_summary = f"Profiled {len(assets)} asset(s); sampled {rows_sampled} row(s), detected {len(deduped_columns)} column(s)."

        profile = DataProfile(asset_ids=ids, data_profile_json=profile_json, human_summary=human_summary)
        session.add(profile)
        session.flush()
        return {"profile_id": profile.id, "data_profile_json": profile_json, "human_summary": human_summary}


def _confirmed_fields(fields: dict[str, Any] | None) -> dict[str, str]:
    payload = dict(fields or {})
    return {
        "design": str(payload.get("design", "")).strip(),
        "unit_of_analysis": str(payload.get("unit_of_analysis", "")).strip(),
        "primary_outcome": str(payload.get("primary_outcome", "")).strip(),
        "key_exposures": str(payload.get("key_exposures", "")).strip(),
        "key_covariates": str(payload.get("key_covariates", "")).strip(),
    }


def _load_profile_json(profile_id: str | None) -> dict[str, Any]:
    if not (profile_id or "").strip():
        return {}
    with session_scope() as session:
        profile = session.get(DataProfile, profile_id)
        if profile is None:
            raise DataAssetNotFoundError(f"Data profile '{profile_id}' was not found.")
        return dict(profile.data_profile_json or {})


def _create_artifact(*, manuscript_id: str, profile_id: str | None, artifact_type: str, scaffold_json: dict[str, Any], human_summary: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None:
            raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")
        artifact = PlannerArtifact(manuscript_id=manuscript_id, profile_id=profile_id or None, artifact_type=artifact_type, scaffold_json=scaffold_json, human_summary=human_summary)
        session.add(artifact)
        session.flush()
        return {f"{artifact_type}_scaffold_id": artifact.id, f"{artifact_type}_scaffold_json": scaffold_json, "human_summary": human_summary}


def create_analysis_scaffold(*, manuscript_id: str, profile_id: str | None, confirmed_fields: dict[str, Any] | None) -> dict[str, object]:
    fields = _confirmed_fields(confirmed_fields)
    profile_json = _load_profile_json(profile_id)
    roles = dict(profile_json.get("variable_role_guesses", {}) or {})
    outcome = fields["primary_outcome"] or ", ".join(roles.get("outcomes", [])[:1]) or "Primary outcome to confirm"
    exposure = fields["key_exposures"] or ", ".join(roles.get("exposures", [])[:2]) or "Primary exposure to confirm"
    covariates = fields["key_covariates"] or ", ".join(roles.get("covariates", [])[:4]) or "Covariates to confirm"
    scaffold_json = {
        "methods_analytic_approach": [{"analysis_name": "Primary analysis", "model_family": "Generalised linear model", "outcome": outcome, "exposure": exposure, "covariates": covariates, "assumptions": "Model assumptions will be checked and reported.", "qc": "Methods/Results consistency checks.", "missing_data": "Specify complete-case vs imputation strategy."}],
        "results_narrative_outline": [{"subheading": "Primary findings", "what_goes_here": "Report primary estimate with uncertainty."}, {"subheading": "Sensitivity analyses", "what_goes_here": "Report robustness checks and key divergences."}],
        "unresolved_questions": list(profile_json.get("unresolved_questions", []) or []),
    }
    return _create_artifact(manuscript_id=manuscript_id, profile_id=profile_id, artifact_type="analysis", scaffold_json=scaffold_json, human_summary="Analysis scaffold generated.")


def create_tables_scaffold(*, manuscript_id: str, profile_id: str | None, confirmed_fields: dict[str, Any] | None) -> dict[str, object]:
    profile_json = _load_profile_json(profile_id)
    unresolved = list(profile_json.get("unresolved_questions", []) or [])
    scaffold_json = {
        "proposed_tables": [
            {"table_id": "T1", "title": "Table 1. Baseline characteristics", "purpose": "Describe cohort composition.", "columns": ["Variable", "Overall", "Group A", "Group B"], "footnotes": ["Define abbreviations and denominators."], "unresolved_inputs": unresolved[:2]},
            {"table_id": "T2", "title": "Table 2. Primary analysis results", "purpose": "Report primary estimate and uncertainty.", "columns": ["Outcome", "Estimate", "Uncertainty", "Adjusted model"], "footnotes": ["State covariates and model family."], "unresolved_inputs": unresolved[2:4]},
            {"table_id": "T3", "title": "Table 3. Sensitivity analyses", "purpose": "Summarise robustness checks.", "columns": ["Analysis", "Estimate", "Uncertainty", "Interpretation"], "footnotes": ["Pre-specify subgroup and sensitivity definitions."], "unresolved_inputs": unresolved[4:6]},
        ]
    }
    return _create_artifact(manuscript_id=manuscript_id, profile_id=profile_id, artifact_type="tables", scaffold_json=scaffold_json, human_summary="Tables scaffold generated.")


def create_figures_scaffold(*, manuscript_id: str, profile_id: str | None, confirmed_fields: dict[str, Any] | None) -> dict[str, object]:
    profile_json = _load_profile_json(profile_id)
    unresolved = list(profile_json.get("unresolved_questions", []) or [])
    scaffold_json = {
        "proposed_figures": [
            {"figure_id": "F1", "title": "Figure 1. Cohort selection flow", "purpose": "Visualise eligibility and exclusions.", "figure_type": "Flow diagram", "caption_stub": "Flow of participants into final analytic set.", "inputs_needed": ["Screened count", "Excluded count by reason", "Final sample"], "unresolved_inputs": unresolved[:2]},
            {"figure_id": "F2", "title": "Figure 2. Primary outcome visual summary", "purpose": "Visualise primary outcome pattern.", "figure_type": "Forest/line/bar (confirm)", "caption_stub": "Primary outcome summary with uncertainty.", "inputs_needed": ["Primary estimate", "Uncertainty intervals", "Group labels"], "unresolved_inputs": unresolved[2:4]},
        ]
    }
    return _create_artifact(manuscript_id=manuscript_id, profile_id=profile_id, artifact_type="figures", scaffold_json=scaffold_json, human_summary="Figures scaffold generated.")


def save_manuscript_plan(*, manuscript_id: str, plan_json: dict[str, Any]) -> dict[str, object]:
    create_all_tables()
    if not isinstance(plan_json.get("sections"), list):
        raise PlannerValidationError("plan_json.sections must be a list.")
    with session_scope() as session:
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None:
            raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")
        existing = session.scalars(select(ManuscriptPlan).where(ManuscriptPlan.manuscript_id == manuscript_id)).first()
        if existing is None:
            existing = ManuscriptPlan(manuscript_id=manuscript_id, plan_json=plan_json)
            session.add(existing)
        else:
            existing.plan_json = plan_json
        session.flush()
        return {"manuscript_id": manuscript_id, "plan_json": dict(existing.plan_json or {}), "updated_at": existing.updated_at}


def improve_plan_section(*, manuscript_id: str, section_key: str, current_text: str, context: dict[str, Any] | None, tool: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None:
            raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")

    tool_name = tool.strip().lower()
    if tool_name not in TOOL_NAMES:
        raise PlannerValidationError("tool must be one of improve, critique, alternatives, subheadings, link_to_data, checklist.")

    text = re.sub(r"\s+", " ", current_text or "").strip() or f"Plan placeholder for {section_key}."
    suggestions: list[str] = []
    to_confirm: list[str] = []
    updated_text = text

    if tool_name == "improve":
        updated_text = f"Plan: {text}\n\nAssumptions: This is a planning scaffold, not completed results.\n\nTo confirm: Confirm unresolved methods and data constraints before drafting."
    elif tool_name == "critique":
        if len(text.split()) < 20:
            suggestions.append("Section plan is brief; add explicit scope and sequencing.")
        if section_key.upper() == "RESULTS" and "uncertainty" not in text.lower():
            suggestions.append("Add explicit uncertainty language for primary findings.")
        if not suggestions:
            suggestions.append("No major structural gaps detected; refine precision and order.")
    elif tool_name == "alternatives":
        suggestions = [f"Alternative A: {text}", f"Alternative B: {text}", f"Alternative C: {text}"]
    elif tool_name == "subheadings":
        suggestions = ["Clinical context", "Evidence gap", "Objective"] if section_key.upper() == "INTRODUCTION" else ["Design", "Analysis", "To confirm"]
    elif tool_name == "link_to_data":
        profile_id = str((context or {}).get("profile_id", "")).strip()
        profile_json = _load_profile_json(profile_id) if profile_id else {}
        role_summary = profile_json.get("variable_role_guesses", {}) if isinstance(profile_json.get("variable_role_guesses", {}), dict) else {}
        updated_text = f"{text}\n\nData link: outcomes={', '.join(role_summary.get('outcomes', [])[:2]) or 'to confirm'}; exposures={', '.join(role_summary.get('exposures', [])[:2]) or 'to confirm'}."
        to_confirm.extend(list(profile_json.get("unresolved_questions", []) or [])[:3])
    elif tool_name == "checklist":
        suggestions = [
            "STROBE prompt: specify participants, variables, bias handling, and statistical methods.",
            "Checklist prompt: define missing-data handling and sensitivity analyses.",
        ]

    return {"updated_text": updated_text, "suggestions": suggestions, "to_confirm": list(dict.fromkeys([item for item in to_confirm if str(item).strip()]))}

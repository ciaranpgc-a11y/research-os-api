"""CMR case persistence service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from research_os.cmr_auth.service import get_session_context
from research_os.cmr_cases.models import CmrCaseRecord
from research_os.db import create_all_tables, session_scope


class CmrCaseNotFoundError(RuntimeError):
    pass


class CmrCaseValidationError(RuntimeError):
    pass


_DEFAULT_PH_CHOICES = {
    "septalFlattening": "none",
    "septalMotion": "normal",
    "interatrialSeptalBowing": "none",
    "pericardialEffusion": "none",
    "venaCava": "normal",
    "trSeverity": "none",
    "mrSeverity": "none",
    "prSeverity": "none",
    "vortexFormation": "not-assessed",
    "vortexSeverity": None,
    "helicity": "not-assessed",
    "helicitySeverity": None,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _normalize_payload(payload: Any) -> dict[str, Any]:
    source = dict(payload) if isinstance(payload, dict) else {}
    normalized = dict(source)
    try:
        normalized["schemaVersion"] = int(source.get("schemaVersion") or 1)
    except (TypeError, ValueError):
        normalized["schemaVersion"] = 1

    report_input_source = source.get("reportInput")
    report_input = dict(report_input_source) if isinstance(report_input_source, dict) else {}
    normalized["reportInput"] = {
        "reportText": str(report_input.get("reportText") or ""),
        "reportType": "stress"
        if str(report_input.get("reportType") or "").strip().lower() == "stress"
        else "standard",
        "fourDFlow": bool(report_input.get("fourDFlow")),
        "nonContrast": bool(report_input.get("nonContrast")),
        "fileName": _trim(report_input.get("fileName")) or None,
    }

    if not isinstance(source.get("previousStudies"), list):
        normalized["previousStudies"] = []
    if "previousStudiesVisible" not in source:
        normalized["previousStudiesVisible"] = True
    if "extractionResult" not in source:
        normalized["extractionResult"] = None
    return normalized


def _default_case_payload() -> dict[str, Any]:
    return _normalize_payload({})


def _has_non_zero_states(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    for item in value.values():
        try:
            if float(item or 0) > 0:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _has_valve_content(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    morphologies = value.get("morphologies")
    if not isinstance(morphologies, dict):
        return False
    for valve in morphologies.values():
        if not isinstance(valve, dict):
            continue
        findings = valve.get("findings")
        if not isinstance(findings, dict):
            continue
        for finding in findings.values():
            if not isinstance(finding, dict):
                continue
            leaflets = finding.get("leaflets")
            if isinstance(leaflets, list) and len(leaflets) > 0:
                return True
            detail_values = finding.get("detailValues")
            if isinstance(detail_values, dict) and any(
                str(item or "").strip() for item in detail_values.values()
            ):
                return True
            if str(finding.get("notes") or "").strip():
                return True
    return False


def _has_thrombus_content(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    entries = value.get("entries")
    if not isinstance(entries, list):
        return False
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        morphology = entry.get("morphology")
        morphology_dict = morphology if isinstance(morphology, dict) else {}
        if (
            entry.get("primary") is not None
            or entry.get("sublocation") is not None
            or str(entry.get("otherLocation") or "").strip()
            or entry.get("confidence") is not None
            or (
                isinstance(morphology_dict.get("maxDiameter"), (int, float))
                and morphology_dict.get("maxDiameter") > 0
            )
            or morphology_dict.get("shape") is not None
            or morphology_dict.get("mobility") is not None
            or morphology_dict.get("attachment") is not None
            or morphology_dict.get("surface") is not None
        ):
            return True
    return False


def _has_ph_content(value: Any) -> bool:
    if not isinstance(value, dict):
        return False

    manual_numeric = value.get("manualNumeric")
    if isinstance(manual_numeric, dict) and any(
        str(item or "").strip() for item in manual_numeric.values()
    ):
        return True

    texts = value.get("texts")
    if isinstance(texts, dict) and any(str(item or "").strip() for item in texts.values()):
        return True

    choices = value.get("choices")
    if isinstance(choices, dict):
        for key, default_value in _DEFAULT_PH_CHOICES.items():
            if choices.get(key) != default_value:
                return True

    return False


def _content_sections_from_payload(payload: Any) -> list[str]:
    source = dict(payload) if isinstance(payload, dict) else {}
    report_input = source.get("reportInput")
    report_input_dict = report_input if isinstance(report_input, dict) else {}
    extraction_result = source.get("extractionResult")
    previous_studies = source.get("previousStudies")

    def _positive_number(value: Any) -> bool:
        try:
            return float(value or 0) > 0
        except (TypeError, ValueError):
            return False

    sections: list[str] = []

    if (
        str(report_input_dict.get("reportText") or "").strip()
        or report_input_dict.get("fileName") is not None
        or extraction_result is not None
    ):
        sections.append("upload")

    if extraction_result is not None:
        sections.append("metrics")

    if isinstance(previous_studies, list) and len(previous_studies) > 0:
        sections.append("previous-studies")

    rwma = source.get("rwma")
    rwma_dict = rwma if isinstance(rwma, dict) else {}
    if _has_non_zero_states(rwma_dict.get("segStates")):
        sections.append("rwma")

    lge = source.get("lge")
    lge_dict = lge if isinstance(lge, dict) else {}
    if (
        _has_non_zero_states(lge_dict.get("segStates"))
        or _has_non_zero_states(lge_dict.get("patternStates"))
        or str(lge_dict.get("llmProse") or "").strip()
    ):
        sections.append("lge")

    perfusion = source.get("perfusion")
    perfusion_dict = perfusion if isinstance(perfusion, dict) else {}
    if (
        _has_non_zero_states(perfusion_dict.get("stressSegStates"))
        or _has_non_zero_states(perfusion_dict.get("restSegStates"))
        or _positive_number(perfusion_dict.get("stressPersistenceBeats"))
        or _positive_number(perfusion_dict.get("restPersistenceBeats"))
        or str(perfusion_dict.get("llmProse") or "").strip()
    ):
        sections.append("perfusion")

    if _has_valve_content(source.get("valves")):
        sections.append("valves")

    if _has_thrombus_content(source.get("thrombus")):
        sections.append("thrombus")

    if _has_ph_content(source.get("ph")):
        sections.append("ph")

    return sections


def _serialize_case_summary(row: CmrCaseRecord) -> dict[str, Any]:
    payload = row.payload_json if isinstance(row.payload_json, dict) else {}
    return {
        "id": row.id,
        "title": row.title,
        "patient_label": row.patient_label,
        "report_tag": row.report_tag,
        "study_date": row.study_date,
        "status": row.status,
        "last_completed_step": row.last_completed_step,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "content_sections": _content_sections_from_payload(payload),
    }


def _serialize_case(row: CmrCaseRecord) -> dict[str, Any]:
    payload = row.payload_json if isinstance(row.payload_json, dict) else {}
    return {
        **_serialize_case_summary(row),
        "payload": _normalize_payload(payload),
    }


def _require_context(token: str) -> dict[str, Any]:
    context = get_session_context(token)
    if context is None:
        raise CmrCaseValidationError("Invalid session")
    return context


def _load_case_row(*, case_id: str, access_code_id: str) -> CmrCaseRecord:
    with session_scope() as session:
        row = session.scalars(
            select(CmrCaseRecord).where(
                CmrCaseRecord.id == case_id,
                CmrCaseRecord.access_code_id == access_code_id,
            )
        ).first()
        if row is None:
            raise CmrCaseNotFoundError("Case not found")
        session.expunge(row)
        return row


def list_cases(token: str) -> list[dict[str, Any]]:
    context = _require_context(token)
    create_all_tables()
    with session_scope() as session:
        rows = session.scalars(
            select(CmrCaseRecord)
            .where(CmrCaseRecord.access_code_id == context["access_code_id"])
            .order_by(CmrCaseRecord.updated_at.desc(), CmrCaseRecord.created_at.desc())
        ).all()
        return [_serialize_case_summary(row) for row in rows]


def create_case(token: str, *, title: str | None = None) -> dict[str, Any]:
    context = _require_context(token)
    create_all_tables()
    clean_title = _trim(title) or "Untitled report"
    with session_scope() as session:
        row = CmrCaseRecord(
            access_code_id=context["access_code_id"],
            title=clean_title,
            report_tag=None,
            status="draft",
            last_completed_step="upload",
            payload_json=_default_case_payload(),
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_case(row)


def get_case(token: str, *, case_id: str) -> dict[str, Any]:
    context = _require_context(token)
    create_all_tables()
    row = _load_case_row(case_id=case_id, access_code_id=context["access_code_id"])
    return _serialize_case(row)


def update_case(
    token: str,
    *,
    case_id: str,
    title: str | None | object = ...,
    patient_label: str | None | object = ...,
    report_tag: str | None | object = ...,
    study_date: str | None | object = ...,
    status: str | None | object = ...,
    last_completed_step: str | None | object = ...,
    payload: dict[str, Any] | None | object = ...,
) -> dict[str, Any]:
    context = _require_context(token)
    create_all_tables()
    allowed_statuses = {"draft", "finalized", "archived"}
    with session_scope() as session:
        row = session.scalars(
            select(CmrCaseRecord).where(
                CmrCaseRecord.id == case_id,
                CmrCaseRecord.access_code_id == context["access_code_id"],
            )
        ).first()
        if row is None:
            raise CmrCaseNotFoundError("Case not found")

        if title is not ...:
            row.title = _trim(title) or "Untitled report"
        if patient_label is not ...:
            row.patient_label = _trim(patient_label) or None
        if report_tag is not ...:
            row.report_tag = _trim(report_tag) or None
        if study_date is not ...:
            row.study_date = _trim(study_date) or None
        if status is not ...:
            clean_status = _trim(status).lower()
            if clean_status and clean_status not in allowed_statuses:
                raise CmrCaseValidationError("Invalid case status")
            row.status = clean_status or "draft"
        if last_completed_step is not ...:
            row.last_completed_step = _trim(last_completed_step) or None
        if payload is not ...:
            row.payload_json = _normalize_payload(payload)

        row.updated_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_case(row)


def delete_case(token: str, *, case_id: str) -> None:
    context = _require_context(token)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(CmrCaseRecord).where(
                CmrCaseRecord.id == case_id,
                CmrCaseRecord.access_code_id == context["access_code_id"],
            )
        ).first()
        if row is None:
            raise CmrCaseNotFoundError("Case not found")
        session.delete(row)

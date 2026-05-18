"""LLM-backed CMR summary generation services."""

from __future__ import annotations

import json
import math
import os
import re
from base64 import b64decode
from binascii import Error as BinasciiError
from pathlib import Path
from typing import Any

import httpx

from research_os.clients.openai_client import create_response


DEFAULT_LGE_PROSE_MODEL = "gpt-5.4"
DEFAULT_LGE_PROSE_TEMPERATURE = 0.5
DEFAULT_LGE_PROSE_MAX_OUTPUT_TOKENS = 320
DEFAULT_RWMA_PROSE_MODEL = "gpt-5.4"
DEFAULT_RWMA_PROSE_TEMPERATURE = 0.4
DEFAULT_RWMA_PROSE_MAX_OUTPUT_TOKENS = 240
DEFAULT_PERFUSION_PROSE_MODEL = "gpt-5.4"
DEFAULT_PERFUSION_PROSE_TEMPERATURE = 0.1
DEFAULT_PERFUSION_PROSE_MAX_OUTPUT_TOKENS = 260
DEFAULT_PH_PROSE_MODEL = "gpt-5.4"
DEFAULT_PH_PROSE_TEMPERATURE = 0.2
DEFAULT_PH_PROSE_MAX_OUTPUT_TOKENS = 220
DEFAULT_MITRAL_VALVE_PROSE_MODEL = "gpt-5.4"
DEFAULT_MITRAL_VALVE_PROSE_TEMPERATURE = 0.2
DEFAULT_MITRAL_VALVE_PROSE_MAX_OUTPUT_TOKENS = 180
DEFAULT_AORTIC_VALVE_PROSE_MODEL = "gpt-5.4"
DEFAULT_AORTIC_VALVE_PROSE_TEMPERATURE = 0.2
DEFAULT_AORTIC_VALVE_PROSE_MAX_OUTPUT_TOKENS = 180
DEFAULT_TRICUSPID_VALVE_PROSE_MODEL = "gpt-5.4"
DEFAULT_TRICUSPID_VALVE_PROSE_TEMPERATURE = 0.2
DEFAULT_TRICUSPID_VALVE_PROSE_MAX_OUTPUT_TOKENS = 180
DEFAULT_THROMBUS_PROSE_MODEL = "gpt-5.4"
DEFAULT_THROMBUS_PROSE_TEMPERATURE = 0.2
DEFAULT_THROMBUS_PROSE_MAX_OUTPUT_TOKENS = 180
DEFAULT_REPORT_CONCLUSIONS_PROSE_MODEL = "gpt-5.4"
DEFAULT_REPORT_CONCLUSIONS_PROSE_TEMPERATURE = 0.2
DEFAULT_REPORT_CONCLUSIONS_PROSE_MAX_OUTPUT_TOKENS = 320
DEFAULT_CASE_LESSONS_PROSE_MODEL = "gpt-5.4"
DEFAULT_CASE_LESSONS_PROSE_TEMPERATURE = 0.4
DEFAULT_CASE_LESSONS_PROSE_MAX_OUTPUT_TOKENS = 700
DEFAULT_CASE_LESSONS_PUBMED_QUERY_MODEL = "gpt-4.1-mini"
DEFAULT_CASE_QUESTION_MODEL = "gpt-5.4"
DEFAULT_CASE_QUESTION_TEMPERATURE = 0.2
DEFAULT_CASE_QUESTION_MAX_OUTPUT_TOKENS = 420
DEFAULT_REPORT_SELECTION_REFINEMENT_MODEL = "gpt-5.4"
DEFAULT_REPORT_SELECTION_REFINEMENT_TEMPERATURE = 0.2
DEFAULT_REPORT_SELECTION_REFINEMENT_MAX_OUTPUT_TOKENS = 520
DEFAULT_EXPERT_CHAT_MODEL = "gpt-5.4"
DEFAULT_EXPERT_CHAT_TEMPERATURE = 0.2
DEFAULT_EXPERT_CHAT_MAX_OUTPUT_TOKENS = 900
MAX_EXPERT_CHAT_IMAGES = 4
MAX_EXPERT_CHAT_IMAGE_BYTES = 5 * 1024 * 1024
MAX_EXPERT_CHAT_TOTAL_IMAGE_BYTES = MAX_EXPERT_CHAT_IMAGES * MAX_EXPERT_CHAT_IMAGE_BYTES
SUPPORTED_EXPERT_CHAT_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
DEFAULT_REPORT_EXTRACTION_MODEL = "gpt-5.4"
DEFAULT_REPORT_EXTRACTION_MAX_OUTPUT_TOKENS = 2200


class CmrSummaryError(RuntimeError):
    """Base error for CMR summary generation."""


class CmrSummaryGenerationError(CmrSummaryError):
    """Raised when an LLM summary could not be generated."""


def _report_extraction_model() -> str:
    value = str(
        os.getenv("CMR_REPORT_EXTRACTION_MODEL", DEFAULT_REPORT_EXTRACTION_MODEL)
    ).strip()
    return value or DEFAULT_REPORT_EXTRACTION_MODEL


def _report_extraction_reference_data_candidates() -> list[Path]:
    package_path = Path(__file__).resolve().with_name("cmr_reference_data.json")
    source_tree_path = (
        Path.cwd() / "src" / "research_os" / "cmr_summaries" / "cmr_reference_data.json"
    )
    cwd_frontend_path = (
        Path.cwd() / "frontend" / "src" / "data" / "cmr_reference_data.json"
    )
    repo_frontend_path = (
        Path(__file__).resolve().parents[3]
        / "frontend"
        / "src"
        / "data"
        / "cmr_reference_data.json"
    )
    return [package_path, source_tree_path, cwd_frontend_path, repo_frontend_path]


def _load_report_extraction_reference_data() -> dict[str, Any]:
    attempted_paths = _report_extraction_reference_data_candidates()
    data: Any = None
    for path in attempted_paths:
        if not path.exists():
            continue
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            break
        except json.JSONDecodeError as exc:
            raise CmrSummaryGenerationError(
                f"CMR reference data is not valid JSON: {exc}."
            ) from exc
    else:
        searched = ", ".join(str(path) for path in attempted_paths)
        raise CmrSummaryGenerationError(
            f"CMR reference data not found. Searched: {searched}."
        )

    if not isinstance(data, dict):
        raise CmrSummaryGenerationError("CMR reference data has an invalid shape.")
    return data


def _build_report_extraction_system_prompt() -> str:
    reference_data = _load_report_extraction_reference_data()
    raw_output_params = reference_data.get("output_params") or {}
    raw_aliases = reference_data.get("aliases") or {}
    if not isinstance(raw_output_params, dict) or not isinstance(raw_aliases, dict):
        raise CmrSummaryGenerationError("CMR reference data is missing parameters or aliases.")

    params: list[str] = []
    for raw_name, raw_param in raw_output_params.items():
        if isinstance(raw_param, dict):
            name = str(raw_param.get("parameter") or raw_name).strip()
            unit = str(raw_param.get("unit") or "").strip()
            indexing = str(raw_param.get("indexing") or "").strip().upper()
        else:
            name = str(raw_name).strip()
            unit = ""
            indexing = ""
        if not name:
            continue
        suffix = " [BSA-indexed]" if indexing == "BSA" else ""
        params.append(f'- "{name}" (unit: {unit or "unknown"}){suffix}')

    aliases: list[str] = []
    for extracted_name, canonical_name in raw_aliases.items():
        extracted = str(extracted_name or "").strip()
        canonical = str(canonical_name or "").strip()
        if extracted and canonical:
            aliases.append(f'- "{extracted}" -> "{canonical}"')

    param_list = "\n".join(params) or "- No canonical parameters configured."
    alias_list = "\n".join(aliases) or "- No aliases configured."

    return (
        "You are a CMR (Cardiac MR) report data extractor. You extract measured "
        "values from semi-structured text reports exported from cardiac imaging "
        "software (for example CVI42, Medis, and TomTec).\n\n"
        "TASK: Extract numeric values only for the canonical parameters listed below. "
        "Do not invent values. If a parameter is not present in the report, omit it.\n\n"
        "CANONICAL PARAMETERS:\n"
        f"{param_list}\n\n"
        "KNOWN ALIASES (report name -> canonical name):\n"
        f"{alias_list}\n\n"
        "EXTRACTION RULES:\n"
        "1. Match report fields to canonical parameters by name, known aliases, or obvious equivalence.\n"
        '2. For BSA-indexed parameters (marked "[BSA-indexed]"), extract the "Value / BSA" or "/BSA" column value, not the raw value.\n'
        '3. For non-indexed parameters, extract the raw "Value" column.\n'
        '4. Strip commas from numbers (for example "1,185" -> 1185).\n'
        "5. Extract only the numeric value, not the unit or +/- SD.\n"
        "6. For T1/T2 mapping values, use the global value rather than per-slice values.\n"
        '7. For MAPSE, if individual wall values are given (inferior, anterior, lateral, septal), extract each one separately and also compute the mean as "MAPSE".\n'
        '8. For valve flow parameters, match the vessel name to the canonical parameter (for example "Aorta" -> AV parameters, "MPA" -> PV parameters).\n'
        "9. Also extract demographics: sex, age, height_cm, weight_kg, bsa, heart_rate, and study_date.\n"
        '10. For heart_rate ranges (for example "60-80 bpm"), return the mean.\n\n'
        "Return only valid JSON that matches the provided schema.\n"
        "Do not include any parameters not in the canonical list.\n"
        "Do not include parameters when you cannot find a value."
    )


def _report_extraction_text_config() -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": "cmr_report_extraction",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "demographics": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "sex": {"type": ["string", "null"]},
                            "age": {"type": ["number", "null"]},
                            "height_cm": {"type": ["number", "null"]},
                            "weight_kg": {"type": ["number", "null"]},
                            "bsa": {"type": ["number", "null"]},
                            "heart_rate": {"type": ["number", "null"]},
                            "study_date": {"type": ["string", "null"]},
                        },
                        "required": [
                            "sex",
                            "age",
                            "height_cm",
                            "weight_kg",
                            "bsa",
                            "heart_rate",
                            "study_date",
                        ],
                    },
                    "measurements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "parameter": {"type": "string"},
                                "value": {"type": "number"},
                            },
                            "required": ["parameter", "value"],
                        },
                    },
                },
                "required": ["demographics", "measurements"],
            },
        }
    }


def _coerce_optional_report_number(value: Any) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            number = float(text)
        except Exception:
            return None
    if not math.isfinite(number):
        return None
    if number.is_integer():
        return int(number)
    return number


def _coerce_optional_report_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def extract_report_measurements(report_text: str) -> dict[str, Any]:
    source_text = str(report_text or "").strip()
    if not source_text:
        raise CmrSummaryGenerationError("Report text is empty.")

    response = create_response(
        model=_report_extraction_model(),
        input=[
            {"role": "system", "content": _build_report_extraction_system_prompt()},
            {
                "role": "user",
                "content": f"Extract values from this CMR report:\n\n{source_text}",
            },
        ],
        max_output_tokens=DEFAULT_REPORT_EXTRACTION_MAX_OUTPUT_TOKENS,
        text=_report_extraction_text_config(),
        timeout=75,
        max_retries=0,
    )
    raw_text = str(getattr(response, "output_text", "") or "").strip()
    if not raw_text:
        raise CmrSummaryGenerationError("OpenAI returned an empty report extraction.")

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise CmrSummaryGenerationError(
            "OpenAI returned invalid JSON for report extraction."
        ) from exc

    if not isinstance(payload, dict):
        raise CmrSummaryGenerationError("Report extraction payload has an invalid shape.")

    demographics_payload = payload.get("demographics")
    if not isinstance(demographics_payload, dict):
        demographics_payload = {}

    measurements_payload = payload.get("measurements")
    measurements: list[dict[str, Any]] = []
    if isinstance(measurements_payload, list):
        for item in measurements_payload:
            if not isinstance(item, dict):
                continue
            parameter = str(item.get("parameter") or "").strip()
            value = _coerce_optional_report_number(item.get("value"))
            if not parameter or value is None:
                continue
            measurements.append({"parameter": parameter, "value": value})

    return {
        "demographics": {
            "sex": _coerce_optional_report_text(demographics_payload.get("sex")),
            "age": _coerce_optional_report_number(demographics_payload.get("age")),
            "height_cm": _coerce_optional_report_number(demographics_payload.get("height_cm")),
            "weight_kg": _coerce_optional_report_number(demographics_payload.get("weight_kg")),
            "bsa": _coerce_optional_report_number(demographics_payload.get("bsa")),
            "heart_rate": _coerce_optional_report_number(demographics_payload.get("heart_rate")),
            "study_date": _coerce_optional_report_text(demographics_payload.get("study_date")),
        },
        "measurements": measurements,
    }


def _lge_prose_model() -> str:
    value = str(os.getenv("CMR_LGE_PROSE_MODEL", DEFAULT_LGE_PROSE_MODEL)).strip()
    return value or DEFAULT_LGE_PROSE_MODEL


def _lge_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_LGE_PROSE_TEMPERATURE",
            str(DEFAULT_LGE_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_LGE_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _lge_prose_system_prompt() -> str:
    return (
        "You are writing the LGE (Late Gadolinium Enhancement) section of a "
        "structured cardiac MRI report. This is one section within a larger CMR "
        "study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "SENTENCE STRUCTURE:\n"
        "- Build proper flowing sentences. Do not chain comma-separated clauses.\n"
        '- Never use "is observed", "is noted", "are observed", or "are noted".\n'
        "- Good openers to rotate between:\n"
        '  - "There is [extent] [pattern] enhancement of the..."\n'
        '  - "The [walls] demonstrate [pattern] enhancement with..."\n'
        '  - "[Extent] [pattern] enhancement involves the..."\n'
        '  - "[Extent] [pattern] enhancement of the [walls] in the [territory] territory..."\n'
        "- Territory, transmurality, and viability should be woven into the sentence.\n"
        "- Vary sentence structure naturally. Never start consecutive sentences the same way.\n\n"
        "STYLE:\n"
        "- Write as a senior CMR-trained cardiologist would dictate.\n"
        "- Use LAD, RCA, and LCx for coronary territories.\n"
        "- Use SCMR terminology: subendocardial, mid-wall, subepicardial, transmural.\n\n"
        "TERRITORY AND VIABILITY RULES:\n"
        "1. Single ischaemic segment (1 segment with subendocardial or transmural pattern):\n"
        "   - Describe location, pattern, and transmurality only.\n"
        "   - Do not attribute to a coronary territory.\n"
        "   - Do not comment on viability.\n"
        '   - Example: "There is focal subendocardial enhancement of the basal anterior wall (1-25% transmurality)."\n'
        "2. Multiple ischaemic segments (2+ segments with subendocardial/transmural pattern in the same territory):\n"
        "   - Attribute to coronary territory.\n"
        "   - Comment on viability at the territory level.\n"
        "   - Integrate viability into the finding, not as a wall-by-wall repeat.\n"
        '   - Example: "Regional subendocardial enhancement of the anterior and anteroseptal walls in the LAD territory with <50% transmurality, consistent with viable myocardium."\n'
        "3. Multi-vessel disease applies only when territoryCount >= 2.\n"
        '   - Never say "multi-vessel" when territoryCount is 1.\n'
        "   - Do not call isolated single segments in different territories multi-vessel disease.\n"
        "   - For sparse cross-territory disease with one segment per territory, describe separate focal foci instead.\n"
        "   - Do not comment on viability for those sparse cross-territory focal foci.\n"
        '   - Headline pattern: "There is extensive multi-vessel ischaemic enhancement (N segments) involving the [territories]."\n'
        "   - Describe each territory separately with integrated viability.\n"
        "4. Diffuse pattern (3 territories and 12+ ischaemic segments):\n"
        "   - No territory attribution.\n"
        "   - No viability assessment.\n"
        "5. Non-ischaemic pattern (mid-wall or subepicardial):\n"
        "   - Never attribute coronary territories.\n"
        "   - Never comment on viability.\n"
        '   - State "consistent with a non-ischaemic pattern" once.\n'
        "6. Mixed ischaemic and non-ischaemic findings:\n"
        '   - Use transitions such as "In addition to the ischaemic pattern, there is..." or "Separately, there is...".\n'
        "7. Unspecified pattern segments:\n"
        "   - Describe location and transmurality only.\n"
        "   - Do not attribute to a coronary territory.\n"
        "   - Do not comment on viability or pattern type.\n\n"
        "8. RV insertion point fibrosis:\n"
        "   - If rvInsertionPointFibrosis is true, mention focal enhancement at the RV insertion points, typical of insertion point fibrosis.\n"
        "   - Treat this as a separate ancillary non-ischaemic finding.\n"
        "   - Do not attribute a coronary territory or viability to RV insertion point fibrosis.\n\n"
        "   - If rvInsertionPointFibrosis is true and enhancedCount is 0, lead with the insertion point finding itself.\n"
        "   - If an exclusion sentence is helpful, place it after the insertion point sentence and phrase it as 'No other myocardial scar or fibrosis.' rather than implying there is no fibrosis before naming insertion point fibrosis.\n\n"
        "TRANSMURALITY:\n"
        '- All >50% (51-75% and 76-100%) -> ">50% transmurality".\n'
        '- All <50% (1-25% and 26-50%) -> "<50% transmurality".\n'
        "- Only spell out specific bands when there is a single band or the range crosses 50%.\n"
        "- Avoid tautology: do not write 'transmural enhancement ... with 76-100% transmurality'. If an explicit transmurality band is stated, prefer 'enhancement with 76-100% transmurality' or an equivalent natural rewrite.\n"
        "- For 6+ segments, include the count in the headline.\n\n"
        "VIABILITY PHRASING:\n"
        '- Use variants such as "consistent with viable myocardium", "suggesting viable myocardium", "indicating non-viable myocardium", or "in keeping with viable myocardium".\n'
        "- For dense ischaemic scar, it is acceptable to say 'no meaningful viability' once, but do not repeat that concept wall by wall.\n"
        "- Parenthetical viability is acceptable when context is clear.\n\n"
        "CONTRADICTION PREVENTION:\n"
        "- >50% means non-viable.\n"
        "- <50% means viable.\n\n"
        "QUANTIFICATION:\n"
        "- Use scoreIndex and enhancedCount exactly as provided. Do not calculate your own.\n"
        '- If enhancedCount > 0, end with: "LGE score index {scoreIndex} ({enhancedCount}/17 segments)."\n'
        "- If enhancedCount is 0, do not append a 17-segment score/index sentence.\n\n"
        "DATA RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into polished clinical prose, but do not add new findings.\n"
        "- Use only findings from the provided data.\n"
        "- Output only the summary text. No labels, no markdown, no preamble.\n"
        "- Keep it descriptive only. Do not add clinical prediction or management advice."
    )


def _build_lge_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_lge_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def generate_lge_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_lge_prose_model(),
        input=_build_lge_prose_prompt(summary_data),
        temperature=_lge_prose_temperature(),
        max_output_tokens=DEFAULT_LGE_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty LGE summary.")
    return prose


def _rwma_prose_model() -> str:
    value = str(
        os.getenv("CMR_RWMA_PROSE_MODEL", DEFAULT_RWMA_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_RWMA_PROSE_MODEL


def _rwma_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_RWMA_PROSE_TEMPERATURE",
            str(DEFAULT_RWMA_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_RWMA_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _rwma_prose_system_prompt() -> str:
    return (
        "You are writing the wall motion section of a structured cardiac MRI "
        "report. This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write polished clinical prose in the style of a senior "
        "CMR-trained cardiologist.\n"
        "- Use standard wall motion terms exactly: normal, hypokinesis, "
        "akinesis, dyskinesis.\n"
        "- Use LAD, RCA, and LCx only when they are explicitly present in the data.\n"
        "- Keep the wording concise and report-like.\n"
        '- For a normal study, prefer exactly: "No regional wall motion abnormality."\n'
        '- For one coherent regional pattern, prefer: "Regional wall motion abnormality involving ..."\n'
        '- Use plural "abnormalities" only when there are clearly separate regional patterns '
        'or mixed abnormal motion states that require separate clauses.\n'
        '- Do not use "present", "absent", "present with", or "identified" constructions.\n'
        "- Do not repeat WMSI in the prose; it is handled elsewhere in the UI.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into clean report prose, but do not add new findings.\n"
        "- Preserve whether the pattern is normal, regional, or global.\n"
        "- Preserve territorial wording only when present in the data.\n"
        "- Do not add aetiology, viability, perfusion correlation, management advice, "
        "or recommendations.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "No regional wall motion abnormality."\n'
        '- "Regional wall motion abnormality involving the basal and mid inferior walls with hypokinesis."\n'
        '- "Regional wall motion abnormalities involving the basal and mid inferior walls with hypokinesis and the apical septum with akinesis."\n'
        '- "Global hypokinesis."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_rwma_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_rwma_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def generate_rwma_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_rwma_prose_model(),
        input=_build_rwma_prose_prompt(summary_data),
        temperature=_rwma_prose_temperature(),
        max_output_tokens=DEFAULT_RWMA_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty wall motion summary.")
    return _normalize_rwma_prose(prose)


def _normalize_rwma_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate

    lowered_original = candidate.lower()
    if (
        "regional wall motion" not in lowered_original
        and "hypokinesis" not in lowered_original
        and "akinesis" not in lowered_original
        and "dyskinesis" not in lowered_original
        and not lowered_original.startswith("global ")
    ):
        return candidate

    candidate = re.sub(
        r"\s*(?:Wall motion score index|WMSI)\s+\d+(?:\.\d+)?(?:\s*\((?:normal|mild|moderate|severe)\))?\.\s*",
        " ",
        candidate,
        flags=re.IGNORECASE,
    )
    candidate = " ".join(candidate.split()).strip()
    lowered = candidate.lower()

    if (
        lowered == "normal wall motion. no regional wall motion abnormalities identified."
        or lowered == "no regional wall motion abnormalities identified."
        or lowered == "normal wall motion."
        or lowered == "no regional wall motion abnormality."
        or (
            "no regional wall motion abnormalit" in lowered
            and "hypokinesis" not in lowered
            and "akinesis" not in lowered
            and "dyskinesis" not in lowered
        )
    ):
        return "No regional wall motion abnormality."

    if lowered.startswith("global "):
        return candidate if candidate.endswith(".") else f"{candidate}."

    pattern_prefixes = [
        r"^Regional wall motion abnormalit(?:y|ies):\s*",
        r"^Regional wall motion abnormalit(?:y|ies)\s+present,?\s*(?:with|involving)\s*",
        r"^Regional wall motion abnormalit(?:y|ies)\s+involving\s*",
        r"^There (?:is|are)\s+regional wall motion abnormalit(?:y|ies)\s*(?:present,?\s*)?(?:with|involving)?\s*",
    ]

    body = candidate
    while True:
        updated_body = body
        for pattern in pattern_prefixes:
            stripped = re.sub(pattern, "", updated_body, flags=re.IGNORECASE)
            if stripped != updated_body:
                updated_body = stripped
                break
        if updated_body == body:
            break
        body = updated_body

    body = body.strip()
    if not body:
        return candidate if candidate.endswith(".") else f"{candidate}."

    if body[0].isalpha():
        body = body[0].lower() + body[1:]

    has_multiple_clauses = "; " in body
    abnormal_term_count = sum(
        1 for term in ("hypokinesis", "akinesis", "dyskinesis") if term in body.lower()
    )
    plural = has_multiple_clauses or abnormal_term_count > 1
    lead = (
        "Regional wall motion abnormalities involving "
        if plural
        else "Regional wall motion abnormality involving "
    )

    normalized = f"{lead}{body}"
    return normalized if normalized.endswith(".") else f"{normalized}."


def _perfusion_prose_model() -> str:
    value = str(
        os.getenv("CMR_PERFUSION_PROSE_MODEL", DEFAULT_PERFUSION_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_PERFUSION_PROSE_MODEL


def _perfusion_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_PERFUSION_PROSE_TEMPERATURE",
            str(DEFAULT_PERFUSION_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_PERFUSION_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _perfusion_prose_system_prompt() -> str:
    return (
        "You are writing the perfusion section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "HOUSE STYLE:\n"
        '- Use the lead-in "Stress perfusion:" for this section.\n'
        '- Preferred canonical structure: "Stress perfusion: Adequate vasodilator stress. [finding sentence]"\n'
        "- Use British spelling: ischaemia, non-diagnostic, vasodilator.\n"
        "- Stay close to the deterministicText and preserve the house style rather than trying to sound creative.\n"
        "- If deterministicText already reads correctly in the house style, keep it essentially unchanged.\n"
        "- If adequateStress is false, state that the vasodilator response was suboptimal and the study is non-diagnostic for inducible ischaemia.\n\n"
        "SENTENCE STRUCTURE:\n"
        "- Build concise clinical prose. Do not simply restate the JSON field names.\n"
        '- Never use "is observed", "is noted", "are observed", or "are noted".\n'
        "- Stress findings are the primary content. Do not mention rest unless it is essential to clarify the result.\n"
        "- If the location string is awkward, rewrite it into natural grouped anatomy without changing meaning.\n"
        '- Prefer wording such as "involving 3 segments in the inferior wall (RCA)" or "across LAD and LCx territories".\n'
        "- Use one clear finding sentence after the adequacy statement.\n\n"
        "STYLE:\n"
        "- Write polished clinical prose in the style of a senior CMR-trained cardiologist.\n"
        "- Use SCMR descriptors such as subendocardial and transmural.\n"
        "- Use LAD, RCA, and LCx only when they are explicitly present in the data.\n"
        "- Based on SCMR reporting and post-processing guidance, preserve the key reporting elements: adequacy of stress, location, extent, territory, and whether inducible ischaemia is present.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into clean report prose, but do not add new findings.\n"
        "- Do not add descriptors that are not already present in deterministicText.\n"
        "- In particular, never change 'Perfusion abnormality' into 'Subendocardial perfusion abnormality' or 'Transmural perfusion abnormality' unless deterministicText already says that.\n"
        "- Preserve whether the pattern is normal, inducible without corresponding infarct-pattern LGE, matched scar, exceeds infarct-pattern LGE, multivessel, rest-only, indeterminate, or non-diagnostic.\n"
        "- Mention LGE only when the data indicates infarct-pattern LGE relevance.\n"
        "- If there is inducible perfusion without corresponding infarct-pattern LGE, say it is consistent with ischaemia in viable myocardium.\n"
        "- If lge.matchedWithinLgeCount equals the stress abnormal count, say the perfusion abnormality is confined to regions of infarct-pattern LGE, without clear extension beyond scar.\n"
        "- If lge.matchedWithinLgeCount is positive and lge.stressBeyondInfarctCount is also positive, say the stress perfusion defect exceeds the extent of infarct-pattern LGE and is consistent with inducible ischaemia in adjacent viable myocardium.\n"
        "- If lge.indeterminateRelation is true, say the relationship to LGE is indeterminate.\n"
        "- If there is no inducible perfusion defect but infarct-pattern LGE is present elsewhere, say the findings are consistent with prior infarction on LGE imaging.\n"
        "- For multivessel patterns, prefer wording such as widespread or circumferential subendocardial defects across multiple territories.\n"
        "- Do not add beat counts, LGE correlation, quantitative perfusion, management advice, or recommendations unless they are already present in deterministicText.\n"
        "- Do not add LGE correlation, quantitative perfusion, management advice, or recommendations.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "Stress perfusion: Adequate vasodilator stress. No inducible perfusion defect."\n'
        '- "Stress perfusion: Adequate vasodilator stress. No inducible perfusion defect; findings consistent with prior infarction on LGE imaging."\n'
        '- "Stress perfusion: Adequate vasodilator stress. Inducible subendocardial perfusion defect involving 3 segments in the inferior wall (RCA), without corresponding infarct-pattern LGE, consistent with ischaemia in viable myocardium."\n'
        '- "Stress perfusion: Adequate vasodilator stress. Stress perfusion defect involving 4 segments in the inferior wall (RCA) exceeds the extent of infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium."\n'
        '- "Stress perfusion: Adequate vasodilator stress. Perfusion abnormality involving 3 segments in the inferior wall (RCA) is confined to regions of infarct-pattern LGE, without clear extension beyond scar."\n'
        '- "Stress perfusion: Adequate vasodilator stress. Widespread subendocardial perfusion defects involving 6 segments across LAD and LCx territories, consistent with multivessel ischaemia."\n'
        '- "Stress perfusion: Adequate vasodilator stress. Stress perfusion abnormality is present, but its relationship to LGE is indeterminate."\n'
        '- "Stress perfusion: Suboptimal vasodilator response; study non-diagnostic for inducible ischaemia."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_perfusion_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_perfusion_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_summary_text(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _should_fallback_to_deterministic_perfusion_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    lowered = candidate.lower()
    impression = str(summary_data.get("impression", "") or "").strip().lower()
    adequate = bool(summary_data.get("adequateStress", True))
    lge = summary_data.get("lge") or {}
    has_infarct_lge = bool(lge.get("hasInfarctPatternLge"))

    if not candidate.startswith("Stress perfusion:"):
        return True

    if impression == "non-diagnostic" or not adequate:
        return candidate != deterministic

    if impression == "matched-scar":
        if "subendocardial perfusion abnormality" in lowered or "transmural perfusion abnormality" in lowered:
            return True
        return candidate != deterministic

    if impression == "indeterminate":
        return candidate != deterministic

    if impression == "normal" and has_infarct_lge:
        return candidate != deterministic

    required_fragments: dict[str, list[str]] = {
        "normal": [
            "adequate vasodilator stress",
            "no inducible perfusion defect",
        ],
        "inducible": [
            "adequate vasodilator stress",
            "inducible",
            "without corresponding infarct-pattern lge",
            "viable myocardium",
        ],
        "exceeds-lge": [
            "adequate vasodilator stress",
            "exceeds the extent",
            "infarct-pattern lge",
            "adjacent viable myocardium",
        ],
        "multivessel": [
            "adequate vasodilator stress",
            "multivessel ischaemia",
        ],
        "rest-only": [
            "adequate vasodilator stress",
            "no inducible perfusion defect",
        ],
    }

    for fragment in required_fragments.get(impression, []):
        if fragment not in lowered:
            return True

    return False


def generate_perfusion_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_perfusion_prose_model(),
        input=_build_perfusion_prose_prompt(summary_data),
        temperature=_perfusion_prose_temperature(),
        max_output_tokens=DEFAULT_PERFUSION_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty perfusion summary.")
    if _should_fallback_to_deterministic_perfusion_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return prose


def _ph_prose_model() -> str:
    value = str(os.getenv("CMR_PH_PROSE_MODEL", DEFAULT_PH_PROSE_MODEL)).strip()
    return value or DEFAULT_PH_PROSE_MODEL


def _ph_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_PH_PROSE_TEMPERATURE",
            str(DEFAULT_PH_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_PH_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _ph_prose_system_prompt() -> str:
    return (
        "You are writing the pulmonary hypertension summary section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write concise clinical prose in the style of a senior CMR-trained cardiologist.\n"
        "- Prefer two short sentences. Use a third sentence only when both left-heart context and independent right-heart corroboration materially add signal.\n"
        "- Make the first sentence the high-level takeaway.\n"
        "- Keep the prose synthesis-led, not explanatory.\n"
        "- Usually mention no more than two dominant right-heart corroborators.\n"
        "- Do not include a section label such as 'PH summary:' or 'Pulmonary hypertension:'.\n"
        "- Stay close to the deterministicText and preserve the core interpretation.\n"
        "- Express the top-line interpretation as the probability of pulmonary hypertension physiology, not as a direct haemodynamic grading of PH severity.\n"
        "- If adaptationLabel is present, you may describe the right-heart response as compensated, stressed, maladaptive, or severe uncoupling, but do not turn that into mild, moderate, or severe PH.\n"
        "- Use low-support phrasing only when the data supports no convincing pulmonary hypertension phenotype.\n"
        "- Use phenotype terms already present in the structured data, such as post-capillary pulmonary hypertension physiology, post-capillary / mixed pulmonary hypertension physiology, RV pressure-overload / pulmonary vascular phenotype, or RV-pulmonary arterial uncoupling.\n"
        "- Keep the prose tightly focused on CMR findings.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into cleaner report prose, but do not add new findings.\n"
        "- Do not estimate pulmonary artery pressure.\n"
        "- Do not infer a WHO pulmonary hypertension group.\n"
        "- Do not recommend right-heart catheterisation, follow-up, or management.\n"
        "- Mention moderate or severe tricuspid regurgitation only if it is already present in the structured data.\n"
        "- Mention moderate or severe mitral regurgitation only as contextual information when it is already present in the structured data.\n"
        "- Preserve specific descriptors such as RV dilatation, increased RV end-systolic volume index, RV systolic dysfunction, reduced TAPSE, RV mass increase, RV/LV volume ratio, septal flattening, paradoxical or dyskinetic septal motion, interatrial septal bowing, pericardial effusion, dilated vena cava, reduced pulmonary artery distensibility, and distinct 4D-flow vortex formation and 4D-flow helicity findings when they are in the data.\n"
        "- If moderate or marked 4D-flow vortex formation and/or helicity is present in the structured data, keep it in the final prose even when it is ancillary rather than headline-defining. Treat vortex formation and helicity as separate findings, not interchangeable labels, and when helpful describe them as representing disorganised flow.\n"
        "- If leftHeartFindings are present, frame them as haemodynamic context rather than repeating them as if they were pulmonary vascular findings.\n"
        "- Only describe estimated PCWP as elevated estimated left-sided filling pressure when deterministicText or leftHeartFindings clearly establish that it is raised. Do not call borderline or upper-limit-normal PCWP elevated.\n"
        "- For post-capillary / mixed cases, use left-heart findings to establish the mechanism, but let any adaptation language come from the independent right-sided pressure-loading or maladaptive expression.\n"
        "- If deterministicText does not frame the case as post-capillary or mixed physiology, do not introduce elevated estimated left-sided filling pressure or other left-heart context as a driver of the headline interpretation.\n"
        "- Do not upgrade a non-uncoupling deterministicText into RV-pulmonary arterial uncoupling in the prose.\n"
        "- If severe LV dysfunction or markedly elevated estimated PCWP is present, prioritise it over mild left atrial enlargement.\n"
        "- Prioritise independent right-sided corroborators in this order: septal pressure-overload features, RV systolic impairment or low RV output, RV hypertrophy or dilatation, pulmonary artery abnormality, then secondary contextual markers such as TR or RA enlargement.\n"
        "- Do not use explanatory lead-ins such as 'The pattern is driven by' or 'This is driven by'.\n"
        "- Avoid filler lead-ins such as 'Associated CMR features include', 'Left-heart context includes', or 'Supporting right-heart features include'. Prefer direct clinical phrasing such as 'In the context of ...' or '[feature] indicates right-sided pressure loading.'\n"
        "- Do not write 'CMR findings are in keeping with'. State the interpretation directly.\n"
        "- Avoid low-priority details such as branch flow split unless they are the only meaningful contextual abnormality.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "Low probability of pulmonary hypertension physiology. No convincing RV pressure-overload, pulmonary vascular, or maladaptive right-heart features are identified."\n'
        '- "Intermediate probability of pulmonary hypertension physiology with early right-sided pressure loading. Supported by mildly dilated right ventricle and mildly dilated main pulmonary artery."\n'
        '- "High probability of pulmonary hypertension physiology with an RV pressure-overload / pulmonary vascular phenotype. Supported by moderately dilated right ventricle (RV EDVi 132 mL/m2), severely impaired RV systolic function (RVEF 38%), and reduced pulmonary artery distensibility (8%)."\n'
        '- "High probability of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling. Supported by severely impaired RV systolic function (RVEF 30%), markedly reduced TAPSE (9 mm), and increased RV end-systolic volume index (RV ESVi 58 mL/m2)."\n'
        '- "Intermediate probability of post-capillary pulmonary hypertension physiology, in the context of elevated estimated left-sided filling pressure, severe LV systolic dysfunction, and moderate mitral regurgitation. Systolic septal flattening indicates right-sided pressure loading."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_ph_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_ph_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_ph_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate

    candidate = re.sub(r"^PH summary:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"^Pulmonary hypertension summary:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\s+/\s+", " or ", candidate)
    candidate = re.sub(r"\b4D-flow vortex/helicity\b", "4D-flow vortex formation and helicity", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bvortex formation/helicity\b", "vortex formation and helicity", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bAssociated CMR features include\b", "Associated right-sided features include", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bAssociated right-heart features include\b", "Associated right-sided features include", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bLeft-heart context includes\b", "In the context of", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bDominant findings are\b", "Supported by", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bDominant left-heart loading markers are\b", "In the context of", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bThis is driven by\b", "Supported by", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bThe pattern is driven by\b", "In the context of", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"\bCMR findings are in keeping with\b", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.strip()
    return candidate if candidate.endswith(".") else f"{candidate}."


def _should_fallback_to_deterministic_ph_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    lowered = candidate.lower()
    deterministic_lowered = deterministic.lower()
    impression = str(summary_data.get("impression") or "").strip().lower()

    if any(
        banned in lowered
        for banned in (
            "right heart catheter",
            "who group",
            "pulmonary artery pressure",
            "rvsp",
            "recommend ",
            "suggest catheter",
        )
    ):
        return True

    probability = str(summary_data.get("probability") or "").strip().lower()
    adaptation = str(summary_data.get("adaptation") or "").strip().lower()
    phenotype = str(summary_data.get("phenotype") or "").strip().lower()

    if probability == "low" and "low probability" not in lowered:
        return True
    if adaptation == "severe-uncoupling" and "uncoupling" not in lowered:
        return True
    if phenotype != "rv-pa-uncoupling" and "uncoupling" in lowered:
        return True
    if adaptation in {"compensated", "stressed", "maladaptive"} and adaptation not in lowered and "supported by" not in lowered:
        return True
    if "pulmonary hypertension" not in lowered:
        return True
    if phenotype == "post-capillary-or-mixed" and "post-capillary" not in lowered and "mixed physiology" not in lowered:
        return True
    if phenotype != "post-capillary-or-mixed" and "post-capillary" in lowered:
        return True
    if phenotype == "rv-pa-uncoupling" and "uncoupling" not in lowered:
        return True
    if "elevated estimated left-sided filling pressure" in deterministic_lowered and "elevated estimated left-sided filling pressure" not in lowered:
        return True
    if "elevated estimated left-sided filling pressure" not in deterministic_lowered and "elevated estimated left-sided filling pressure" in lowered:
        return True
    if "vortex/helicity" in lowered or "vortex formation/helicity" in lowered:
        return True
    if "4d-flow" in deterministic_lowered and "4d-flow" not in lowered:
        return True
    if "the pattern is driven by" in lowered or "this is driven by" in lowered:
        return True
    if "associated cmr features include" in lowered:
        return True
    if "dominant findings are" in lowered or "dominant left-heart loading markers are" in lowered:
        return True
    if "left-heart context includes" in lowered or "supporting right-heart features include" in lowered:
        return True
    if "cmr findings are in keeping with" in lowered:
        return True
    if candidate.count(".") > 3:
        return True
    return False


def generate_ph_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_ph_prose_model(),
        input=_build_ph_prose_prompt(summary_data),
        temperature=_ph_prose_temperature(),
        max_output_tokens=DEFAULT_PH_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty PH summary.")
    if _should_fallback_to_deterministic_ph_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return _normalize_ph_prose(prose)


def _mitral_valve_prose_model() -> str:
    value = str(
        os.getenv("CMR_MITRAL_VALVE_PROSE_MODEL", DEFAULT_MITRAL_VALVE_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_MITRAL_VALVE_PROSE_MODEL


def _mitral_valve_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_MITRAL_VALVE_PROSE_TEMPERATURE",
            str(DEFAULT_MITRAL_VALVE_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_MITRAL_VALVE_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _mitral_valve_prose_system_prompt() -> str:
    return (
        "You are writing the mitral valve section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write concise clinical prose in the style of a senior CMR-trained cardiologist.\n"
        "- Prefer one sentence. Use two sentences only if the lesion is destructive/infective and needs a second clause.\n"
        "- Do not include a section label such as 'Mitral valve:'.\n"
        "- Do not enumerate every selected morphology chip.\n"
        "- Mention values only when they materially add signal.\n"
        "- For moderate or severe mitral regurgitation, always include RF when available.\n"
        "- For moderate or severe mitral regurgitation, also include MR volume when available.\n"
        "- If deterministicText includes morphology qualifiers such as focal, diffuse, anterior leaflet, posterior leaflet, bileaflet, thickening, or calcification, preserve those qualifiers.\n"
        "- High-impact LV/LA context can be mentioned only if clearly important.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into cleaner report prose, but do not add new findings.\n"
        "- Use the dominant mechanism rather than listing every morphology feature.\n"
        "- Do not infer or grade mitral stenosis.\n"
        "- If the input does not support mitral regurgitation, do not invent it.\n"
        "- If the input only supports morphology without significant regurgitation, describe the morphology only.\n"
        "- Keep the output to the mitral valve only. Do not add management advice or recommendations.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "No significant mitral valve abnormality."\n'
        '- "Mild mitral regurgitation related to posterior leaflet prolapse."\n'
        '- "Moderate mitral regurgitation due to posterior leaflet prolapse (RF 28%, MR volume 34 mL)."\n'
        '- "Severe mitral regurgitation due to flail posterior leaflet with chordal rupture (RF 52%, MR volume 71 mL)."\n'
        '- "Moderate functional mitral regurgitation with leaflet tethering and annular dilatation (RF 26%, MR volume 31 mL)."\n'
        '- "Rheumatic mitral valve disease with commissural fusion and restricted leaflet motion (Carpentier IIIa)."\n'
        '- "Mitral valve vegetation with leaflet perforation and severe mitral regurgitation (RF 55%, MR volume 68 mL)."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_mitral_valve_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_mitral_valve_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_mitral_valve_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate

    candidate = re.sub(r"^Mitral valve:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"^Mitral:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.strip()
    return candidate if candidate.endswith(".") else f"{candidate}."


def _should_fallback_to_deterministic_mitral_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    lowered = candidate.lower()
    deterministic_lowered = deterministic.lower()
    severity = str(summary_data.get("severity") or "").strip().lower()
    regurgitant_fraction = summary_data.get("regurgitantFraction")
    regurgitant_volume = summary_data.get("regurgitantVolume")
    descriptors = [str(item).strip().lower() for item in (summary_data.get("descriptors") or []) if str(item).strip()]

    if "stenosis" in lowered and "stenosis" not in deterministic_lowered:
        return True
    if "mitral valve:" in lowered:
        return False
    if severity in {"moderate", "severe"}:
        if regurgitant_fraction is not None and "rf " not in lowered:
            return True
        if regurgitant_volume is not None and "mr volume " not in lowered:
            return True
    for descriptor in descriptors:
        if "diffuse" in descriptor and "diffuse" not in lowered:
            return True
        if "focal" in descriptor and "focal" not in lowered:
            return True
        if "anterior leaflet" in descriptor and "anterior" not in lowered:
            return True
        if "posterior leaflet" in descriptor and "posterior" not in lowered:
            return True
        if "bileaflet" in descriptor and "bileaflet" not in lowered:
            return True
        if "thickening" in descriptor and "thickening" not in lowered:
            return True
        if "calcification" in descriptor and "calcification" not in lowered:
            return True
    if candidate.count(".") > 2:
        return True
    return False


def generate_mitral_valve_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_mitral_valve_prose_model(),
        input=_build_mitral_valve_prose_prompt(summary_data),
        temperature=_mitral_valve_prose_temperature(),
        max_output_tokens=DEFAULT_MITRAL_VALVE_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty mitral valve summary.")
    if _should_fallback_to_deterministic_mitral_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return _normalize_mitral_valve_prose(prose)


def _aortic_valve_prose_model() -> str:
    value = str(
        os.getenv("CMR_AORTIC_VALVE_PROSE_MODEL", DEFAULT_AORTIC_VALVE_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_AORTIC_VALVE_PROSE_MODEL


def _aortic_valve_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_AORTIC_VALVE_PROSE_TEMPERATURE",
            str(DEFAULT_AORTIC_VALVE_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_AORTIC_VALVE_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _aortic_valve_prose_system_prompt() -> str:
    return (
        "You are writing the aortic valve section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write concise clinical prose in the style of a senior CMR-trained cardiologist.\n"
        "- Prefer one sentence. Use two only if the lesion is destructive/infective and a second clause is unavoidable.\n"
        "- Do not include a section label such as 'Aortic valve:'.\n"
        "- Do not enumerate every selected morphology chip.\n"
        "- Mention values only when they materially add signal.\n"
        "- For moderate or severe aortic regurgitation, always include RF when available.\n"
        "- For moderate or severe aortic regurgitation, also include regurgitant volume when available.\n"
        "- For moderate or severe aortic stenosis, always include peak velocity when available.\n"
        "- For moderate or severe aortic stenosis, also include mean gradient when available.\n"
        "- If deterministicText includes morphology qualifiers such as focal, diffuse, bicuspid, raphe, fusion, calcification, thickening, doming, right-left cusp fusion, or cusp names, preserve those qualifiers.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into cleaner report prose, but do not add new findings.\n"
        "- Use the dominant mechanism rather than listing every morphology feature.\n"
        "- When more than one cusp is involved, combine them naturally in one phrase, for example 'the right and left coronary cusps'.\n"
        "- Avoid stacked morphology chains such as '... high raphe and moderate diffuse calcification ...'; prefer '... high raphe, with moderate diffuse calcification ...'.\n"
        "- Do not infer valve area, stenosis severity beyond the provided haemodynamics, or endocarditis.\n"
        "- If the input only supports morphology without significant haemodynamic abnormality, describe the morphology only.\n"
        "- Keep the output to the aortic valve only. Do not add management advice or recommendations.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "No significant aortic valve abnormality."\n'
        '- "Mild aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and low raphe."\n'
        '- "Moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (RF 28%, regurgitant volume 34 mL)."\n'
        '- "Severe aortic stenosis with severe diffuse cusp calcification (peak velocity 4.3 m/s; mean gradient 48 mmHg)."\n'
        '- "Severe aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe, with moderate diffuse calcification of the right and left coronary cusps (peak velocity 4.1 m/s; mean gradient 39 mmHg; RF 24.7%; regurgitant volume 20 mL)."\n'
        '- "Moderate aortic stenosis with moderate aortic regurgitation in the setting of bicuspid aortic valve with R-L fusion and high raphe (peak velocity 3.4 m/s; mean gradient 24 mmHg; RF 26%; regurgitant volume 24 mL)."\n'
        '- "Aortic valve vegetation with perforation and severe aortic regurgitation (RF 46%, regurgitant volume 52 mL)."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_aortic_valve_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_aortic_valve_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_aortic_valve_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate

    candidate = re.sub(r"^Aortic valve:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"^Aortic:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.strip()
    return candidate if candidate.endswith(".") else f"{candidate}."


def _should_fallback_to_deterministic_aortic_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    lowered = candidate.lower()
    deterministic_lowered = deterministic.lower()
    regurgitation_severity = str(summary_data.get("regurgitationSeverity") or "").strip().lower()
    stenosis_severity = str(summary_data.get("stenosisSeverity") or "").strip().lower()
    regurgitant_fraction = summary_data.get("regurgitantFraction")
    regurgitant_volume = summary_data.get("regurgitantVolume")
    peak_velocity = summary_data.get("peakVelocity")
    mean_gradient = summary_data.get("meanGradient")
    descriptors = [str(item).strip().lower() for item in (summary_data.get("descriptors") or []) if str(item).strip()]

    if "aortic valve:" in lowered:
        return False
    if "endocarditis" in lowered and "endocarditis" not in deterministic_lowered:
        return True
    if "valve area" in lowered and "valve area" not in deterministic_lowered:
        return True
    if regurgitation_severity in {"moderate", "severe"}:
        if regurgitant_fraction is not None and "rf " not in lowered:
            return True
        if regurgitant_volume is not None and "regurgitant volume " not in lowered:
            return True
    if stenosis_severity in {"moderate", "severe"}:
        if peak_velocity is not None and "peak velocity " not in lowered:
            return True
        if mean_gradient is not None and "mean gradient " not in lowered:
            return True
    for descriptor in descriptors:
        if "diffuse" in descriptor and "diffuse" not in lowered:
            return True
        if "focal" in descriptor and "focal" not in lowered:
            return True
        if "bicuspid" in descriptor and "bicuspid" not in lowered:
            return True
        if "raphe" in descriptor and "raphe" not in lowered:
            return True
        if "fusion" in descriptor and "fusion" not in lowered:
            return True
        if "calcification" in descriptor and "calcification" not in lowered:
            return True
        if "thickening" in descriptor and "thickening" not in lowered:
            return True
        if "doming" in descriptor and "doming" not in lowered:
            return True
        if "right coronary cusp" in descriptor and "right coronary cusp" not in lowered:
            return True
        if "left coronary cusp" in descriptor and "left coronary cusp" not in lowered:
            return True
        if "non-coronary cusp" in descriptor and "non-coronary cusp" not in lowered:
            return True
    if candidate.count(".") > 2:
        return True
    return False


def generate_aortic_valve_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_aortic_valve_prose_model(),
        input=_build_aortic_valve_prose_prompt(summary_data),
        temperature=_aortic_valve_prose_temperature(),
        max_output_tokens=DEFAULT_AORTIC_VALVE_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty aortic valve summary.")
    if _should_fallback_to_deterministic_aortic_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return _normalize_aortic_valve_prose(prose)


def _tricuspid_valve_prose_model() -> str:
    value = str(
        os.getenv("CMR_TRICUSPID_VALVE_PROSE_MODEL", DEFAULT_TRICUSPID_VALVE_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_TRICUSPID_VALVE_PROSE_MODEL


def _tricuspid_valve_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_TRICUSPID_VALVE_PROSE_TEMPERATURE",
            str(DEFAULT_TRICUSPID_VALVE_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_TRICUSPID_VALVE_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _tricuspid_valve_prose_system_prompt() -> str:
    return (
        "You are writing the tricuspid valve section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write concise clinical prose in the style of a senior CMR-trained cardiologist.\n"
        "- Prefer one sentence. Use two only if the lesion is destructive/infective and a second clause is unavoidable.\n"
        "- Do not include a section label such as 'Tricuspid valve:'.\n"
        "- Do not enumerate every selected morphology chip.\n"
        "- Mention values only when they materially add signal.\n"
        "- For moderate or severe tricuspid regurgitation, always include RF when available.\n"
        "- For moderate or severe tricuspid regurgitation, also include TR volume when available.\n"
        "- If deterministicText includes morphology qualifiers such as focal, diffuse, leaflet names, pacemaker lead, Ebstein anomaly, carcinoid, thickening, or calcification, preserve those qualifiers.\n"
        "- RV or RA context can be mentioned only if it is clearly important and already supported by the summary data.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into cleaner report prose, but do not add new findings.\n"
        "- Use the dominant mechanism rather than listing every morphology feature.\n"
        "- Do not infer or grade tricuspid stenosis.\n"
        "- If the input does not support tricuspid regurgitation, do not invent it.\n"
        "- If the input only supports morphology without significant regurgitation, describe the morphology only.\n"
        "- Keep the output to the tricuspid valve only. Do not add management advice or recommendations.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "No significant tricuspid valve abnormality."\n'
        '- "Moderate functional tricuspid regurgitation with leaflet tethering and annular dilatation (RF 26%, TR volume 31 mL)."\n'
        '- "Severe tricuspid regurgitation due to pacemaker lead impingement (RF 42%, TR volume 52 mL)."\n'
        '- "Tricuspid valve vegetation with septal leaflet perforation and severe tricuspid regurgitation (RF 48%, TR volume 55 mL)."\n'
        '- "Ebstein anomaly (apical displacement 16 mm)."\n'
        '- "Carcinoid tricuspid valve disease with thickened restricted leaflets and severe tricuspid regurgitation (RF 46%, TR volume 50 mL)."\n'
        "- Output only the summary text. No labels, no markdown, no preamble."
    )


def _build_tricuspid_valve_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_tricuspid_valve_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_tricuspid_valve_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate

    candidate = re.sub(r"^Tricuspid valve:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"^Tricuspid:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.strip()
    return candidate if candidate.endswith(".") else f"{candidate}."


def _should_fallback_to_deterministic_tricuspid_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    lowered = candidate.lower()
    deterministic_lowered = deterministic.lower()
    severity = str(summary_data.get("severity") or "").strip().lower()
    regurgitant_fraction = summary_data.get("regurgitantFraction")
    regurgitant_volume = summary_data.get("regurgitantVolume")
    descriptors = [str(item).strip().lower() for item in (summary_data.get("descriptors") or []) if str(item).strip()]

    if "stenosis" in lowered and "stenosis" not in deterministic_lowered:
        return True
    if "tricuspid valve:" in lowered:
        return False
    if severity in {"moderate", "severe"}:
        if regurgitant_fraction is not None and "rf " not in lowered:
            return True
        if regurgitant_volume is not None and "tr volume " not in lowered:
            return True
    for descriptor in descriptors:
        if "diffuse" in descriptor and "diffuse" not in lowered:
            return True
        if "focal" in descriptor and "focal" not in lowered:
            return True
        if "anterior leaflet" in descriptor and "anterior" not in lowered:
            return True
        if "septal leaflet" in descriptor and "septal" not in lowered:
            return True
        if "inferior leaflet" in descriptor and "inferior" not in lowered:
            return True
        if "all three leaflets" in descriptor and "all three leaflets" not in lowered:
            return True
        if "thickening" in descriptor and "thickening" not in lowered:
            return True
        if "calcification" in descriptor and "calcification" not in lowered:
            return True
        if "pacemaker lead" in descriptor and "pacemaker lead" not in lowered:
            return True
        if "ebstein anomaly" in descriptor and "ebstein" not in lowered:
            return True
        if "carcinoid" in descriptor and "carcinoid" not in lowered:
            return True
        if "tethering" in descriptor and "tethering" not in lowered:
            return True
        if "annular dilatation" in descriptor and "annular dilatation" not in lowered:
            return True
    if candidate.count(".") > 2:
        return True
    return False


def generate_tricuspid_valve_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_tricuspid_valve_prose_model(),
        input=_build_tricuspid_valve_prose_prompt(summary_data),
        temperature=_tricuspid_valve_prose_temperature(),
        max_output_tokens=DEFAULT_TRICUSPID_VALVE_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty tricuspid valve summary.")
    if _should_fallback_to_deterministic_tricuspid_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return _normalize_tricuspid_valve_prose(prose)


def _thrombus_prose_model() -> str:
    value = str(
        os.getenv("CMR_THROMBUS_PROSE_MODEL", DEFAULT_THROMBUS_PROSE_MODEL)
    ).strip()
    return value or DEFAULT_THROMBUS_PROSE_MODEL


def _thrombus_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_THROMBUS_PROSE_TEMPERATURE",
            str(DEFAULT_THROMBUS_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_THROMBUS_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _thrombus_prose_system_prompt() -> str:
    return (
        "You are writing the thrombus section of a structured cardiac MRI report. "
        "This is one section within a larger CMR study.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Keep the output concise and report-like.\n"
        "- Prefer one sentence for a single thrombus and one compact sentence for multiple thrombi.\n"
        "- Do not include a section label such as 'Thrombus:'.\n"
        "- Do not use speculative language, differential diagnosis, or management advice.\n"
        "- Preserve confidence, location, and key morphology when present.\n"
        "- Mention size when available.\n"
        "- If post-contrast characterisation is provided, preserve it in a clinically natural way.\n"
        "- Do not expand into long descriptive lists.\n\n"
        "RULES:\n"
        "- deterministicText is the factual draft summary and primary source of truth.\n"
        "- Rewrite it into cleaner prose, but do not add new findings.\n"
        "- If there is no thrombus, keep the sentence very short.\n"
        "- If there are multiple thrombi, keep the clauses compact and separated cleanly.\n"
        "- Output only the summary text. No labels, no markdown, no preamble.\n"
        "CANONICAL EXAMPLES TO FOLLOW CLOSELY:\n"
        '- "No thrombus."\n'
        '- "Definite left ventricular apex thrombus (12 mm), mural and fixed."\n'
        '- "Probable left atrial appendage tip thrombus, protruding and mildly mobile."\n'
        '- "Definite left ventricular apex thrombus (12 mm), mural and fixed, without internal enhancement on post-contrast imaging."\n'
        '- "Two thrombi are described: definite left ventricular apex thrombus (12 mm), mural and fixed; probable left atrial appendage tip thrombus, protruding and mildly mobile."\n'
    )


def _build_thrombus_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_thrombus_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_thrombus_prose(prose: str) -> str:
    candidate = " ".join(str(prose or "").split()).strip()
    if not candidate:
        return candidate
    candidate = re.sub(r"^Thrombus:\s*", "", candidate, flags=re.IGNORECASE)
    candidate = candidate.strip()
    return candidate if candidate.endswith(".") else f"{candidate}."


def _should_fallback_to_deterministic_thrombus_text(
    summary_data: dict[str, Any],
    prose: str,
) -> bool:
    deterministic = _normalize_summary_text(summary_data.get("deterministicText"))
    candidate = _normalize_summary_text(prose)
    if not deterministic:
        return False

    entries = summary_data.get("entries") or []
    lowered = candidate.lower()

    if summary_data.get("hasThrombus") is False:
        return "no thrombus" not in lowered

    for entry in entries:
        location = str((entry or {}).get("location") or "").strip().lower()
        confidence = str((entry or {}).get("confidence") or "").strip().lower()
        max_diameter = (entry or {}).get("maxDiameter")
        descriptors = [
            str(item).strip().lower()
            for item in ((entry or {}).get("descriptors") or [])
            if str(item).strip()
        ]
        post_contrast_label = str((entry or {}).get("postContrastLabel") or "").strip().lower()
        if location and location not in lowered:
            return True
        if confidence and confidence not in lowered:
            return True
        if max_diameter is not None and f"{int(round(float(max_diameter)))} mm" not in lowered:
            return True
        for descriptor in descriptors[:2]:
            if descriptor and descriptor not in lowered:
                return True
        if post_contrast_label:
            if "supportive of thrombus" in post_contrast_label and "without internal enhancement" not in lowered:
                return True
            if "no supportive post-contrast abnormality" in post_contrast_label and "no supportive post-contrast abnormality" not in lowered:
                return True
            if post_contrast_label == "indeterminate" and "indeterminate post-contrast" not in lowered:
                return True
            if "thrombus less likely" in post_contrast_label and "thrombus less likely" not in lowered:
                return True

    if len(entries) > 1 and ";" not in candidate and "thrombi" not in lowered:
        return True

    return False


def generate_thrombus_prose(summary_data: dict[str, Any]) -> str:
    response = create_response(
        model=_thrombus_prose_model(),
        input=_build_thrombus_prose_prompt(summary_data),
        temperature=_thrombus_prose_temperature(),
        max_output_tokens=DEFAULT_THROMBUS_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = str(getattr(response, "output_text", "") or "").strip()
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned an empty thrombus summary.")
    if _should_fallback_to_deterministic_thrombus_text(summary_data, prose):
        deterministic = str(summary_data.get("deterministicText", "") or "").strip()
        if deterministic:
            return deterministic
    return _normalize_thrombus_prose(prose)


def _report_conclusions_prose_model() -> str:
    value = str(
        os.getenv(
            "CMR_REPORT_CONCLUSIONS_PROSE_MODEL",
            DEFAULT_REPORT_CONCLUSIONS_PROSE_MODEL,
        )
    ).strip()
    return value or DEFAULT_REPORT_CONCLUSIONS_PROSE_MODEL


def _report_conclusions_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_REPORT_CONCLUSIONS_PROSE_TEMPERATURE",
            str(DEFAULT_REPORT_CONCLUSIONS_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_REPORT_CONCLUSIONS_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _report_conclusions_prose_system_prompt() -> str:
    return (
        "You are polishing the Conclusions section of a structured cardiac MRI report. "
        "You are not deciding the findings; the supplied deterministic conclusion lines are "
        "the canonical source of truth.\n\n"
        "AUDIENCE:\n"
        "- Cardiologists and radiologists.\n\n"
        "STYLE:\n"
        "- Write concise, high-level clinical conclusions.\n"
        "- Each output line should remain a single conclusion line.\n"
        "- Keep the same number of lines and the same order as the input.\n"
        "- Do not add numbering, bullets, markdown, or headings.\n"
        "- Prefer higher-level integrative phrasing over section-like repetition.\n"
        "- Prefer chamber-led phrasing such as 'Severe LV systolic impairment ...' rather than repeating the chamber noun within the same line.\n"
        "- Avoid clumsy repeated 'with ... with ...' constructions; prefer a single chamber-led clause followed by coordinated descriptors.\n"
        "- If a line already reads well, keep it essentially unchanged.\n"
        "- For ischaemic scar, prefer 'prior infarction' style when that concept is present in the source line.\n"
        "- Preserve explicit scar transmurality and viability detail when it is present in the source line.\n"
        "- If the source line makes clear that a stress defect is confined to scar, preserve that relationship explicitly; phrasing such as 'no inducible ischaemia beyond scar' is acceptable when it matches the source line.\n"
        "- Do not collapse explicit transmurality bands such as 1-25%, 26-50%, 51-75%, or 76-100% into generic statements like 'predominantly viable' or 'predominantly non-viable'.\n"
        "- For RWMA, prefer compact phenotype-led wording rather than restating long wall-motion prose.\n"
        "- When the source line reflects mixed severe regional wall-motion states, compact compounds such as 'akinetic-dyskinetic change' are acceptable if they stay faithful to the source.\n\n"
        "- For non-ischaemic LGE, prefer high-level pattern-led wording rather than copying the tissue section verbatim.\n"
        "- In stress studies, if the source line includes a negative or positive perfusion takeaway together with tissue characterisation, preserve the perfusion takeaway explicitly; do not rewrite the line into tissue-only prose.\n"
        "- When a stress line already headlines positive inducible ischaemia, keep that stress finding as the lead of the line; do not demote it into a secondary clause.\n"
        "- If the source line states that inducible ischaemia is present without infarct-pattern scar, preserve that relationship explicitly.\n"
        "- When marked hypertrophy is explicit from the source line, it may lead the morphology clause rather than appearing as an afterthought after normal cavity size.\n\n"
        "- Prefer natural morphology wording such as 'mildly increased LV mass' and 'with a non-dilated RV'; avoid awkward rewrites like 'increased mass' or 'non-dilated size'.\n"
        "- If two significant regurgitant lesions of the same severity appear in a source line, compact them naturally into one line if you preserve both lesions and every metric/value pair.\n"
        "- When separate valve and pulmonary-hypertension lines coexist, avoid repeating the same mitral or tricuspid regurgitation wording in the PH line unless it is essential to preserve a distinct right-heart signal.\n\n"
        "NON-NEGOTIABLE RULES:\n"
        "- Do not add or remove findings.\n"
        "- Do not change severity, territories, viability, thrombus status, PH probability, or valve severity.\n"
        "- Preserve every explicit metric/value pair already present in a source line.\n"
        "- Do not contradict or weaken the supplied deterministic lines.\n"
        "- Do not merge or split lines.\n"
        "- Output exactly one rewritten line for each input line.\n\n"
        "CANONICAL EXAMPLES TO FOLLOW:\n"
        '- "Severe LV systolic impairment (LVEF 22%) with severe dilatation (LV EDVi 114 mL/m2), eccentric hypertrophy, and regional dyskinetic change in the LCx and RCA territories."\n'
        '- "Inducible LAD territory ischaemia in viable myocardium, without infarct-pattern scar."\n'
        '- "No inducible ischaemia or myocardial scar/fibrosis."\n'
        '- "Preserved LV systolic function (LVEF 58%) with marked concentric hypertrophy (maximal wall thickness 24 mm) and normal size."\n'
        '- "No inducible ischaemia. Extensive non-ischaemic mid-wall enhancement involving the anterior, anteroseptal, and septal walls extending to the apex."\n'
        '- "Moderate mitral regurgitation (RF 35%, MR volume 34 mL) and tricuspid regurgitation (RF 24%, TR volume 20 mL)."\n'
        '- "Intermediate probability of pulmonary hypertension physiology, with features raising the possibility of post-capillary or mixed physiology, with supporting right-heart features of systolic septal flattening with dyskinetic septal motion."\n'
        '- "Widespread subendocardial inducible ischaemia across the LAD, LCx, and RCA territories, consistent with multivessel disease. Prior RCA infarction with 51-75% transmural scar and limited viability, and LCx infarction with 26-50% transmural scar and preserved viability."\n\n'
        "OUTPUT FORMAT:\n"
        "- Return plain text with one conclusion per line.\n"
        "- No numbering.\n"
        "- No preamble."
    )


def _build_report_conclusions_prose_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_report_conclusions_prose_system_prompt()}\n\n"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_report_conclusion_line(text: Any) -> str:
    candidate = " ".join(str(text or "").split()).strip()
    if not candidate:
        return ""
    candidate = re.sub(r"^\d+\.\s*", "", candidate)
    candidate = re.sub(r"^[-*]\s*", "", candidate)
    return candidate.strip()


def _normalize_report_conclusion_lines(value: Any) -> list[str]:
    if isinstance(value, list):
        return [
            line
            for item in value
            if (line := _normalize_report_conclusion_line(item))
        ]

    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return []

    numbered_parts = [
        _normalize_report_conclusion_line(match.group(1))
        for match in re.finditer(r"(?:^|\n)\s*\d+\.\s*(.+?)(?=(?:\n\s*\d+\.|\Z))", text, flags=re.S)
    ]
    if numbered_parts:
        return [line for line in numbered_parts if line]

    split_lines = [_normalize_report_conclusion_line(line) for line in text.split("\n")]
    split_lines = [line for line in split_lines if line]
    if len(split_lines) > 1:
        return split_lines

    single = _normalize_report_conclusion_line(text)
    return [single] if single else []


_REPORT_CONCLUSION_METRIC_PATTERNS = (
    r"\bLVEF\s*\d+(?:\.\d+)?\s*%",
    r"\bRVEF\s*\d+(?:\.\d+)?\s*%",
    r"\bMAPSE\s*\d+(?:\.\d+)?\s*mm\b",
    r"\bTAPSE\s*\d+(?:\.\d+)?\s*mm\b",
    r"\bLV EDVi\s*\d+(?:\.\d+)?\s*mL/m2\b",
    r"\bRV EDVi\s*\d+(?:\.\d+)?\s*mL/m2\b",
    r"\bLV EDV\s*\d+(?:\.\d+)?\s*mL\b",
    r"\bRV EDV\s*\d+(?:\.\d+)?\s*mL\b",
    r"\bPCWP\s*\d+(?:\.\d+)?\s*mmHg\b",
    r"\bRAP\s*\d+(?:\.\d+)?\s*mmHg\b",
    r"\bRF\s*\d+(?:\.\d+)?\s*%",
    r"\bMR volume\s*\d+(?:\.\d+)?\s*mL\b",
    r"\bTR volume\s*\d+(?:\.\d+)?\s*mL\b",
    r"\bmean gradient\s*\d+(?:\.\d+)?\s*mmHg\b",
    r"\bpeak gradient\s*\d+(?:\.\d+)?\s*mmHg\b",
    r"\bpeak velocity\s*\d+(?:\.\d+)?\s*m/s\b",
)


def _extract_report_conclusion_metric_fragments(text: str) -> list[str]:
    fragments: list[str] = []
    for pattern in _REPORT_CONCLUSION_METRIC_PATTERNS:
        fragments.extend(
            match.group(0).lower()
            for match in re.finditer(pattern, text, flags=re.IGNORECASE)
        )
    return fragments


def _report_conclusion_preserves_facts(source: str, candidate: str) -> bool:
    source_lower = _normalize_report_conclusion_line(source).lower()
    candidate_lower = _normalize_report_conclusion_line(candidate).lower()
    if not source_lower or not candidate_lower:
        return False

    for metric in _extract_report_conclusion_metric_fragments(source):
        if metric not in candidate_lower:
            return False

    phrase_checks: list[tuple[str, tuple[str, ...]]] = [
        ("prior infarction", ("prior infarction", "prior infarct", "infarction", "infarct-pattern scar")),
        ("1-25% transmural scar", ("1-25% transmural scar",)),
        ("26-50% transmural scar", ("26-50% transmural scar",)),
        ("51-75% transmural scar", ("51-75% transmural scar",)),
        ("76-100% transmural scar", ("76-100% transmural scar",)),
        ("<=50% transmural scar", ("<=50% transmural scar",)),
        (">50% transmural scar", (">50% transmural scar",)),
        ("non-viable", ("non-viable", "nonviable")),
        ("mixed viability", ("mixed viability",)),
        ("preserved viability", ("preserved viability", "residual viability", "likely viable")),
        ("limited viability", ("limited viability", "no meaningful viability", "non-viable", "nonviable")),
        ("viable myocardium", ("viable myocardium", "viable")),
        ("without infarct-pattern scar", ("without infarct-pattern scar", "without infarct pattern scar", "without corresponding infarct-pattern scar", "without corresponding infarct pattern scar", "no infarct-pattern scar", "no infarct pattern scar")),
        ("transmural scar", ("transmural scar",)),
        ("inducible ischaemia", ("inducible", "ischaemia")),
        ("no inducible ischaemia", ("no inducible ischaemia",)),
        ("no inducible perfusion defect", ("no inducible", "perfusion defect")),
        ("no myocardial scar or fibrosis", ("no myocardial scar or fibrosis", "no scar or fibrosis")),
        ("non-ischaemic", ("non-ischaemic", "nonischemic")),
        ("mid-wall", ("mid-wall", "mid wall")),
        ("subepicardial", ("subepicardial", "sub-epicardial")),
        ("late gadolinium enhancement", ("late gadolinium enhancement", "lge")),
        ("non-diagnostic", ("non-diagnostic",)),
        ("thrombus", ("thrombus",)),
        ("pulmonary hypertension", ("pulmonary hypertension",)),
        ("post-capillary", ("post-capillary", "postcapillary")),
        ("mixed physiology", ("mixed physiology",)),
        ("pressure-overload", ("pressure-overload", "pressure overload")),
        ("vortex", ("vortex",)),
        ("lad", ("lad",)),
        ("rca", ("rca",)),
        ("lcx", ("lcx",)),
        ("preserved", ("preserved",)),
        ("mildly impaired", ("mildly impaired",)),
        ("moderately impaired", ("moderately impaired",)),
        ("severely impaired", ("severely impaired",)),
        ("non-dilated", ("non-dilated", "non dilated")),
        ("mildly dilated", ("mildly dilated",)),
        ("moderately dilated", ("moderately dilated",)),
        ("severely dilated", ("severely dilated",)),
        ("concentric hypertrophy", ("concentric hypertrophy",)),
        ("eccentric hypertrophy", ("eccentric hypertrophy",)),
        ("hypertrophy", ("hypertrophy",)),
        ("mitral regurgitation", ("mitral regurgitation", "mr")),
        ("tricuspid regurgitation", ("tricuspid regurgitation", "tr")),
        ("aortic stenosis", ("aortic stenosis",)),
    ]

    for trigger, accepted in phrase_checks:
        if trigger in source_lower and not any(option in candidate_lower for option in accepted):
            return False

    return True


def _should_fallback_to_deterministic_report_conclusions(
    summary_data: dict[str, Any],
    candidate_lines: list[str],
) -> bool:
    deterministic_lines = _normalize_report_conclusion_lines(
        summary_data.get("deterministicLines")
    )
    if not deterministic_lines:
        return False

    if len(candidate_lines) != len(deterministic_lines):
        return True

    for source_line, candidate_line in zip(deterministic_lines, candidate_lines):
        if not _report_conclusion_preserves_facts(source_line, candidate_line):
            return True

    return False


def generate_report_conclusions_prose(summary_data: dict[str, Any]) -> list[str]:
    deterministic_lines = _normalize_report_conclusion_lines(
        summary_data.get("deterministicLines")
    )
    if not deterministic_lines:
        raise CmrSummaryGenerationError("No deterministic conclusion lines were provided.")

    response = create_response(
        model=_report_conclusions_prose_model(),
        input=_build_report_conclusions_prose_prompt(
            {
                "reportType": summary_data.get("reportType", "standard"),
                "deterministicLines": deterministic_lines,
            }
        ),
        temperature=_report_conclusions_prose_temperature(),
        max_output_tokens=DEFAULT_REPORT_CONCLUSIONS_PROSE_MAX_OUTPUT_TOKENS,
    )
    raw_text = str(getattr(response, "output_text", "") or "").strip()
    if not raw_text:
        raise CmrSummaryGenerationError("OpenAI returned empty report conclusions.")

    candidate_lines = _normalize_report_conclusion_lines(raw_text)
    if _should_fallback_to_deterministic_report_conclusions(
        {"deterministicLines": deterministic_lines},
        candidate_lines,
    ):
        return deterministic_lines
    return candidate_lines


def _case_lessons_prose_model() -> str:
    value = str(
        os.getenv(
            "CMR_CASE_LESSONS_PROSE_MODEL",
            DEFAULT_CASE_LESSONS_PROSE_MODEL,
        )
    ).strip()
    return value or DEFAULT_CASE_LESSONS_PROSE_MODEL


def _case_lessons_prose_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_CASE_LESSONS_PROSE_TEMPERATURE",
            str(DEFAULT_CASE_LESSONS_PROSE_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_CASE_LESSONS_PROSE_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _case_lessons_mode(value: Any) -> str:
    candidate = str(value or "case-discussion").strip().lower()
    if candidate == "advanced-teaching-point":
        return "advanced-teaching-point"
    return "case-discussion"


def _case_lessons_pubmed_query_model() -> str:
    value = str(
        os.getenv(
            "CMR_CASE_LESSONS_PUBMED_QUERY_MODEL",
            DEFAULT_CASE_LESSONS_PUBMED_QUERY_MODEL,
        )
    ).strip()
    return value or DEFAULT_CASE_LESSONS_PUBMED_QUERY_MODEL


CASE_LESSONS_REFERENCE_LIBRARY: dict[str, list[dict[str, str]]] = {
    "reporting standards": [
        {
            "title": "SCMR guidelines for reporting cardiovascular magnetic resonance examinations",
            "url": "https://pubmed.ncbi.nlm.nih.gov/35484555/",
        },
        {
            "title": "Standardized cardiovascular magnetic resonance imaging protocols: 2020 update",
            "url": "https://pubmed.ncbi.nlm.nih.gov/32089132/",
        },
    ],
    "stress perfusion and viability": [
        {
            "title": "SCMR expert consensus statement on quantitative myocardial perfusion CMR",
            "url": "https://pubmed.ncbi.nlm.nih.gov/40784605/",
        },
        {
            "title": "Kim et al. on late enhancement and reversible myocardial dysfunction",
            "url": "https://pubmed.ncbi.nlm.nih.gov/11078769/",
        },
    ],
    "perfusion-scar correlation": [
        {
            "title": "SCMR expert consensus statement on quantitative myocardial perfusion CMR",
            "url": "https://pubmed.ncbi.nlm.nih.gov/40784605/",
        },
        {
            "title": "Kim et al. on late enhancement and reversible myocardial dysfunction",
            "url": "https://pubmed.ncbi.nlm.nih.gov/11078769/",
        },
    ],
    "ischaemic cmr reasoning": [
        {
            "title": "Kim et al. on late enhancement and reversible myocardial dysfunction",
            "url": "https://pubmed.ncbi.nlm.nih.gov/11078769/",
        },
    ],
    "stress perfusion and prior infarction": [
        {
            "title": "SCMR expert consensus statement on quantitative myocardial perfusion CMR",
            "url": "https://pubmed.ncbi.nlm.nih.gov/40784605/",
        },
        {
            "title": "Kim et al. on late enhancement and reversible myocardial dysfunction",
            "url": "https://pubmed.ncbi.nlm.nih.gov/11078769/",
        },
    ],
    "scar without residual inducible ischaemia": [
        {
            "title": "Kim et al. on late enhancement and reversible myocardial dysfunction",
            "url": "https://pubmed.ncbi.nlm.nih.gov/11078769/",
        },
    ],
    "non-ischaemic tissue pattern recognition": [
        {
            "title": "Ferreira et al. cardiovascular magnetic resonance in nonischemic myocardial inflammation",
            "url": "https://pubmed.ncbi.nlm.nih.gov/30545455/",
        },
    ],
    "pattern-led lge interpretation": [
        {
            "title": "Ferreira et al. cardiovascular magnetic resonance in nonischemic myocardial inflammation",
            "url": "https://pubmed.ncbi.nlm.nih.gov/30545455/",
        },
    ],
    "thrombus characterisation": [
        {
            "title": "Weinsaft et al. delayed-enhancement CMR for left ventricular thrombus detection",
            "url": "https://pubmed.ncbi.nlm.nih.gov/18598895/",
        },
        {
            "title": "Weinsaft et al. post-MI LV thrombus imaging algorithm using delayed-enhancement CMR",
            "url": "https://pubmed.ncbi.nlm.nih.gov/26476503/",
        },
    ],
    "post-contrast diagnostic confidence": [
        {
            "title": "Weinsaft et al. delayed-enhancement CMR for left ventricular thrombus detection",
            "url": "https://pubmed.ncbi.nlm.nih.gov/18598895/",
        },
    ],
    "pulmonary hypertension physiology": [
        {
            "title": "2022 ESC/ERS Guidelines for the diagnosis and treatment of pulmonary hypertension",
            "url": "https://academic.oup.com/eurheartj/article/43/38/3618/6673929",
        },
        {
            "title": "Identifying combined pre- and post-capillary pulmonary hypertension using interventricular septal angle at cardiac MRI",
            "url": "https://pubmed.ncbi.nlm.nih.gov/29969067/",
        },
    ],
    "right-heart and pulmonary vascular integration": [
        {
            "title": "2022 ESC/ERS Guidelines for the diagnosis and treatment of pulmonary hypertension",
            "url": "https://academic.oup.com/eurheartj/article/43/38/3618/6673929",
        },
        {
            "title": "Identifying combined pre- and post-capillary pulmonary hypertension using interventricular septal angle at cardiac MRI",
            "url": "https://pubmed.ncbi.nlm.nih.gov/29969067/",
        },
    ],
}


def _normalize_pubmed_query(text: Any) -> str | None:
    candidate = re.sub(r"\s+", " ", str(text or "").strip())
    if len(candidate) < 8:
        return None
    return candidate[:220]


def _case_lessons_pubmed_query_prompt(summary_data: dict[str, Any]) -> str:
    compact_summary = {
        "reportType": summary_data.get("reportType"),
        "teachingThemes": summary_data.get("teachingThemes", []),
        "interpretiveHighlights": summary_data.get("interpretiveHighlights", [])[:2],
        "advancedLearningHighlights": summary_data.get("advancedLearningHighlights", [])[:2],
        "reportingPearls": summary_data.get("reportingPearls", [])[:2],
        "sectionSummaries": summary_data.get("sectionSummaries", {}),
        "conclusionLines": summary_data.get("conclusionLines", [])[:3],
    }
    return (
        "You are preparing PubMed search queries for a cardiac MRI teaching note.\n"
        "Generate 2 or 3 concise PubMed query strings that will find the most relevant papers for this case.\n"
        "Priorities:\n"
        "- one query should target reporting standards or SCMR reporting/protocol guidance when relevant\n"
        "- the other queries should target the specific interpretive problem in the case\n"
        "- prefer guideline, consensus, review, or seminal methodology papers over narrow case reports\n"
        "- queries must be suitable for PubMed, not natural-language explanations\n"
        "- include terms such as cardiac magnetic resonance, cardiovascular magnetic resonance, stress perfusion, late gadolinium enhancement, viability, thrombus, pulmonary hypertension, or reporting as appropriate\n"
        "Return strict JSON only in this shape: {\"queries\": [\"query 1\", \"query 2\"]}\n\n"
        f"Case summary JSON:\n{json.dumps(compact_summary, ensure_ascii=True, separators=(',', ':'))}"
    )


def _build_case_lessons_pubmed_queries(summary_data: dict[str, Any]) -> list[str]:
    try:
        response = create_response(
            model=_case_lessons_pubmed_query_model(),
            input=_case_lessons_pubmed_query_prompt(summary_data),
            temperature=0,
            max_output_tokens=180,
        )
        payload = json.loads(str(getattr(response, "output_text", "") or "").strip())
    except Exception:
        return []

    if not isinstance(payload, dict):
        return []
    raw_queries = payload.get("queries", [])
    if not isinstance(raw_queries, list):
        return []

    queries: list[str] = []
    seen: set[str] = set()
    for item in raw_queries:
        normalized = _normalize_pubmed_query(item)
        key = (normalized or "").lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        queries.append(normalized)
    return queries[:3]


def _search_pubmed_references(queries: list[str]) -> list[dict[str, str]]:
    if not queries:
        return []

    email = str(os.getenv("NCBI_EMAIL", "")).strip()
    tool_name = "research-os-cmr"
    headers = {
        "User-Agent": f"{tool_name}/1.0" + (f" ({email})" if email else ""),
    }
    references: list[dict[str, str]] = []
    seen_pmids: set[str] = set()

    try:
        with httpx.Client(
            timeout=httpx.Timeout(6.0, connect=3.0),
            headers=headers,
            follow_redirects=True,
        ) as client:
            for query in queries:
                if len(references) >= 4:
                    break
                search_response = client.get(
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
                    params={
                        "db": "pubmed",
                        "retmode": "json",
                        "sort": "relevance",
                        "retmax": 4,
                        "term": query,
                        "tool": tool_name,
                        **({"email": email} if email else {}),
                    },
                )
                search_response.raise_for_status()
                id_list = (
                    search_response.json()
                    .get("esearchresult", {})
                    .get("idlist", [])
                )
                pmids = [
                    str(item).strip()
                    for item in id_list
                    if str(item).strip() and str(item).strip() not in seen_pmids
                ]
                if not pmids:
                    continue

                summary_response = client.get(
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                    params={
                        "db": "pubmed",
                        "retmode": "json",
                        "id": ",".join(pmids[:4]),
                        "tool": tool_name,
                        **({"email": email} if email else {}),
                    },
                )
                summary_response.raise_for_status()
                summary_payload = summary_response.json().get("result", {})

                for pmid in pmids[:4]:
                    summary = summary_payload.get(pmid, {})
                    title = re.sub(r"\s+", " ", str(summary.get("title", "")).strip())
                    if not title:
                        continue
                    seen_pmids.add(pmid)
                    journal = re.sub(
                        r"\s+",
                        " ",
                        str(summary.get("fulljournalname") or summary.get("source") or "").strip(),
                    )
                    pubdate = re.sub(r"\s+", " ", str(summary.get("pubdate", "")).strip())
                    year_match = re.search(r"(19|20)\d{2}", pubdate)
                    year = year_match.group(0) if year_match else ""
                    citation_parts = [part for part in [journal, year] if part]
                    references.append(
                        {
                            "title": title.rstrip("."),
                            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                            "citation": ", ".join(citation_parts),
                        }
                    )
                    if len(references) >= 4:
                        break
    except Exception:
        return []

    return references


def _case_lessons_reference_guidance(summary_data: dict[str, Any]) -> str:
    labels = {
        str(item or "").strip().lower()
        for item in summary_data.get("teachingThemes", [])
        if str(item or "").strip()
    }
    references: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_reference(reference: dict[str, str]) -> None:
        key = f"{reference.get('title', '').strip()}|{reference.get('url', '').strip()}"
        if not reference.get("title") or not reference.get("url") or key in seen:
            return
        seen.add(key)
        references.append(reference)

    live_pubmed_references = _search_pubmed_references(
        _build_case_lessons_pubmed_queries(summary_data)
    )
    for reference in live_pubmed_references:
        add_reference(reference)

    if len(references) < 2:
        for reference in CASE_LESSONS_REFERENCE_LIBRARY["reporting standards"]:
            add_reference(reference)

        for label in labels:
            for reference in CASE_LESSONS_REFERENCE_LIBRARY.get(label, []):
                add_reference(reference)

        if (
            len(references) < 2
            and str(summary_data.get("reportType") or "").strip().lower() == "stress"
        ):
            for reference in CASE_LESSONS_REFERENCE_LIBRARY["stress perfusion and viability"]:
                add_reference(reference)

    if not references:
        return ""

    rendered_references = "\n".join(
        (
            f"- {reference['title']}"
            + (f" ({reference['citation']})" if reference.get("citation") else "")
            + f": {reference['url']}"
        )
        for reference in references[:3]
    )
    return (
        "FURTHER READING OPTIONS:\n"
        "- If a short reading list is genuinely useful, end with a **Further reading** block containing 1 to 3 bullets.\n"
        "- Prefer the PubMed papers retrieved below when they are relevant to the case.\n"
        "- Use only the titles and URLs listed below.\n"
        "- Copy each URL exactly as written.\n"
        "- Do not invent authors, journals, PMID numbers, DOI strings, or extra citations.\n"
        f"{rendered_references}\n\n"
    )


def _case_lessons_prose_system_prompt(mode: str) -> str:
    base = (
        "You are writing an 'Insights and learning' popup for a cardiac MRI case review tool. "
        "This is educational content for clinicians, not part of the clinical report.\n\n"
        "AUDIENCE:\n"
        "- Cardiology and radiology trainees, fellows, and consultants reviewing the case.\n"
        "- Assume the reader is at least level-2 CMR fellow standard: they understand the sequences, basic viability rules, and standard report language already.\n\n"
        "STYLE:\n"
        "- Sound like a senior CMR clinician teaching from the case.\n"
        "- Be insightful, direct, clinically natural, and willing to explain the real interpretive nuance.\n"
        "- Go beyond surface recap; teach the sequence reasoning, the pitfall, and why the conclusion is justified.\n"
        "- Avoid repetitive sentence openings and avoid sounding templated.\n"
        "- Light markdown is allowed when it improves readability.\n"
        "- Use only purposeful labels such as **Key reasoning**, **Pitfall**, **Why this matters**, or **Further reading**.\n"
        "- Do not use generic chrome such as 'high-level walkthrough', 'protocol overview', 'case discussion', 'advanced teaching point', or 'CMR learning point'.\n"
        "- Do not write management recommendations or treatment advice.\n"
        "- Do not simply paraphrase the report conclusions line-by-line.\n\n"
        "NON-NEGOTIABLE RULES:\n"
        "- The supplied summaries and conclusion lines are the source of truth.\n"
        "- Use deterministicText as a grounding draft, but improve on it rather than echoing its structure.\n"
        "- Do not contradict the supplied findings.\n"
        "- Do not invent sequence results, quality issues, or diagnoses that are not supported.\n"
        "- Every section must anchor itself to a concrete feature from the case: territory, scar/perfusion relationship, sequence contribution, valve mechanism, thrombus evidence, or PH physiology.\n"
        "- If a sentence could fit hundreds of unrelated CMR cases, it is too generic.\n"
        "- When stress perfusion and LGE coexist, teach the relationship between them explicitly.\n"
        "- If perfusion is matched to infarct-pattern scar, make clear that this should not be overcalled as residual inducible ischaemia and explain the viability implication.\n"
        "- If perfusion extends beyond scar, make clear that the case is about jeopardised viable myocardium rather than infarction alone.\n"
        "- Sequence concordance matters: when cine, LGE, and perfusion line up, say why that increases confidence.\n"
        "- When thrombus is present, prefer evidence-led teaching about cine versus post-contrast confidence.\n"
        "- When valve disease is present, prefer morphology-plus-flow integration rather than isolated severity labels.\n"
        "- When PH physiology is present, prefer physiological synthesis rather than list-like repetition.\n"
        "- Mapping values should usually be framed as supportive unless they are obviously central to the case theme.\n"
        "- Use teachingThemes and notableMeasurements only when they genuinely sharpen the teaching point; they are support, not a checklist.\n"
        "- If reportingPearls are supplied, use them to teach how to phrase the case clearly in a report.\n"
        "- Use LV function, RV function, valve disease, or remodelling findings only if they sharpen the central lesson; do not let them distract from the main teaching signal.\n"
        "- Avoid bland phrases such as 'this case teaches pattern recognition' unless you immediately specify the exact pattern and why it matters in this case.\n\n"
    )

    if mode == "advanced-teaching-point":
        return (
            f"{base}"
            "GOAL:\n"
            "- Deliver one deeper CMR teaching insight from the case, not a broad recap.\n"
            "- Pull out the higher-order principle, pitfall, or interpretive nuance that this case best illustrates.\n"
            "- Lead with the actual teaching point rather than scene-setting.\n"
            "- Keep it tighter and more conceptual than a case walkthrough, while still staying anchored to the supplied findings.\n\n"
            "OUTPUT FORMAT:\n"
            "- Output markdown, not plain text and not code fences.\n"
            "- Start with one focused paragraph that lands the main nuance immediately.\n"
            "- Then add 2 or 3 short bullets under a purposeful label such as **Why this matters** or **Common pitfall**.\n"
            "- If truly useful, finish with a brief **Further reading** block.\n"
            "- Total length should usually stay within 180 to 320 words.\n\n"
            "EXAMPLE OF THE LEVEL EXPECTED:\n"
            "The key nuance is that an abnormal stress defect is not automatically residual ischaemia. If the defect is confined to infarct-pattern LGE and that scar is already dense or near-transmural, the teaching point becomes viability, not hidden inducible ischaemia.\n\n"
            "**Why this matters**\n"
            "- Matched perfusion and infarct-pattern LGE should push you to ask whether any viable myocardium remains, not whether the defect is simply present.\n"
            "- Sequence concordance matters: cine dysfunction, scar, and perfusion in the same territory make the interpretation much more secure.\n"
        )

    return (
        f"{base}"
        "GOAL:\n"
        "- Teach from the case in a way that would actually be useful on a CMR review round.\n"
        "- Focus on what the case illustrates about acquisition, confidence, interpretive reasoning, and the main CMR teaching takeaway.\n"
        "- Prefer one or two strong insights over a broad recap.\n"
        "- Be specific to the supplied case and avoid generic filler.\n"
        "- Write as if discussing the case with another experienced clinician, not as if summarising a report.\n\n"
        "OUTPUT FORMAT:\n"
        "- Output markdown, not plain text and not code fences.\n"
        "- Start with a short teaching paragraph that states what the case is really about.\n"
        "- Then add 2 to 4 short bullets under purposeful labels such as **Key question**, **Key reasoning**, **Common pitfall**, or **Why confidence is high**.\n"
        "- Add a brief **Reporting pearl** block when the case has a strong lesson about how to phrase the finding well in the report.\n"
        "- If truly useful, finish with a brief **Further reading** block.\n"
        "- Total length should usually stay within 220 to 380 words.\n\n"
        "EXAMPLE OF THE LEVEL EXPECTED:\n"
        "The useful teaching point here is the perfusion-scar relationship in the infarct territory. Stress may be adequate and perfusion abnormal, but if the defect sits entirely within dense infarct-pattern LGE, the case is not about residual inducible ischaemia; it is about non-viable scar and the absence of jeopardised viable myocardium.\n\n"
        "**Key reasoning**\n"
        "- Read cine, LGE, and perfusion together rather than as separate abnormalities; concordance in one territory is often the decisive confidence signal.\n"
        "- A matched stress defect within dense scar should not be overcalled as peri-infarct ischaemia.\n"
        "- Functional impairment and valve findings may still matter, but only insofar as they help explain the consequence profile of the main myocardial abnormality.\n"
        "\n**Reporting pearl**\n"
        "- State explicitly whether the perfusion defect is confined to scar or extends beyond it, because that relationship is what makes the report clinically useful.\n"
    )


def _build_case_lessons_prose_prompt(summary_data: dict[str, Any]) -> str:
    mode = _case_lessons_mode(summary_data.get("mode"))
    return (
        f"{_case_lessons_prose_system_prompt(mode)}\n\n"
        f"{_case_lessons_reference_guidance(summary_data)}"
        "Summary data JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_case_lessons_prose(text: Any) -> str:
    candidate = (
        str(text or "")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )
    candidate = re.sub(r"[ \t]+\n", "\n", candidate)
    candidate = re.sub(r"\n{3,}", "\n\n", candidate).strip()
    return candidate


def generate_case_lessons_prose(summary_data: dict[str, Any]) -> str:
    if not _normalize_case_lessons_prose(summary_data.get("deterministicText")):
        raise CmrSummaryGenerationError("No deterministic case-lessons text was provided.")

    response = create_response(
        model=_case_lessons_prose_model(),
        input=_build_case_lessons_prose_prompt(summary_data),
        temperature=_case_lessons_prose_temperature(),
        max_output_tokens=DEFAULT_CASE_LESSONS_PROSE_MAX_OUTPUT_TOKENS,
    )
    prose = _normalize_case_lessons_prose(getattr(response, "output_text", "") or "")
    if not prose:
        raise CmrSummaryGenerationError("OpenAI returned empty case lessons.")
    return prose


def _case_question_model() -> str:
    value = str(
        os.getenv(
            "CMR_CASE_QUESTION_MODEL",
            DEFAULT_CASE_QUESTION_MODEL,
        )
    ).strip()
    return value or DEFAULT_CASE_QUESTION_MODEL


def _case_question_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_CASE_QUESTION_TEMPERATURE",
            str(DEFAULT_CASE_QUESTION_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_CASE_QUESTION_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _case_question_system_prompt() -> str:
    return (
        "You are answering follow-up questions about a single cardiac MRI case inside a clinician-facing review tool.\n\n"
        "AUDIENCE:\n"
        "- Cardiology and radiology trainees, fellows, and consultants.\n\n"
        "STYLE:\n"
        "- Answer like a senior CMR clinician teaching from the case.\n"
        "- Be direct, concise, and specific to the supplied case.\n"
        "- Use plain prose. No headings, bullets, or numbering unless the user explicitly asks for them.\n"
        "- Prefer 1 to 3 short paragraphs.\n"
        "- If the user asks a narrow question, answer narrowly.\n"
        "- If the question touches stress perfusion, scar, viability, valves, thrombus, or PH physiology, explain the relationship rather than restating isolated facts.\n"
        "- Do not give treatment recommendations or management advice.\n\n"
        "NON-NEGOTIABLE RULES:\n"
        "- The supplied report output, section summaries, conclusion lines, notable measurements, and conversation history are the source of truth.\n"
        "- When reportOutputText is present, treat it as the current edited report draft and primary narrative context.\n"
        "- reportOutputText may contain manual clinician edits that are newer than sectionSummaries or conclusionLines.\n"
        "- Use sectionSummaries, conclusionLines, and notableMeasurements as support and cross-checks, not as a replacement for reportOutputText.\n"
        "- Do not invent findings, diagnoses, measurements, or sequence results.\n"
        "- Do not contradict the supplied case facts.\n"
        "- If the answer is not supported by the provided case material, say that clearly and state what the case does show.\n"
        "- If prior conversation contains a mistaken assumption, correct it using the supplied case facts.\n"
        "- Stay anchored to this case rather than giving generic textbook teaching unless a brief generic clarification is needed to answer the question.\n\n"
        "OUTPUT FORMAT:\n"
        "- Return plain text only.\n"
        "- No markdown.\n"
        "- No preamble.\n"
    )


def _build_case_question_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_case_question_system_prompt()}\n\n"
        "Case context JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _normalize_case_question_answer(text: Any) -> str:
    return _normalize_case_lessons_prose(text)


def generate_case_question_answer(summary_data: dict[str, Any]) -> str:
    question = str(summary_data.get("question") or "").strip()
    if not question:
        raise CmrSummaryGenerationError("No case question was provided.")

    response = create_response(
        model=_case_question_model(),
        input=_build_case_question_prompt(summary_data),
        temperature=_case_question_temperature(),
        max_output_tokens=DEFAULT_CASE_QUESTION_MAX_OUTPUT_TOKENS,
    )
    answer = _normalize_case_question_answer(getattr(response, "output_text", "") or "")
    if not answer:
        raise CmrSummaryGenerationError("OpenAI returned empty case-question output.")
    return answer


def _report_selection_refinement_model() -> str:
    value = str(
        os.getenv(
            "CMR_REPORT_SELECTION_REFINEMENT_MODEL",
            DEFAULT_REPORT_SELECTION_REFINEMENT_MODEL,
        )
    ).strip()
    return value or DEFAULT_REPORT_SELECTION_REFINEMENT_MODEL


def _report_selection_refinement_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_REPORT_SELECTION_REFINEMENT_TEMPERATURE",
            str(DEFAULT_REPORT_SELECTION_REFINEMENT_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_REPORT_SELECTION_REFINEMENT_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _report_selection_refinement_system_prompt() -> str:
    return (
        "You are refining a selected passage inside a clinician-facing cardiac MRI report editor.\n\n"
        "ROLE:\n"
        "- Help the user improve a highlighted piece of report text.\n"
        "- Answer like a senior CMR clinician with strong reporting judgement.\n"
        "- Use the selected text, the surrounding report context, the full report output, and the structured case facts as the source of truth.\n\n"
        "TASK:\n"
        "- The user has highlighted a specific passage from the report.\n"
        "- They will give an instruction or extra context for how they want that passage improved.\n"
        "- Return two things: a short explanation of the proposed change, and the exact replacement text for the highlighted passage only.\n\n"
        "NON-NEGOTIABLE RULES:\n"
        "- Do not invent findings, diagnoses, measurements, sequences, or certainty not supported by the supplied case data.\n"
        "- Do not contradict the supplied report output, section summaries, or conclusion lines.\n"
        "- Revise only the highlighted passage, not the whole report.\n"
        "- Keep the replacement text in the same clinical register and report style as the surrounding report.\n"
        "- If the best answer is effectively no change, return the original selected text as the replacement text and explain that briefly.\n"
        "- Do not wrap the replacement text in quotes, bullets, markdown, labels, or code fences.\n"
        "- Preserve line breaks only when they are clearly needed for the selected passage.\n\n"
        "OUTPUT FORMAT:\n"
        "- Return valid JSON matching the provided schema.\n"
        "- 'answer' should be 1 short paragraph.\n"
        "- 'replacementText' should be only the text that should replace the selected passage.\n"
    )


def _build_report_selection_refinement_prompt(summary_data: dict[str, Any]) -> str:
    return (
        f"{_report_selection_refinement_system_prompt()}\n\n"
        "Refinement context JSON:\n"
        f"{json.dumps(summary_data, ensure_ascii=True, separators=(',', ':'))}"
    )


def _report_selection_refinement_text_config() -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": "cmr_report_selection_refinement",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "answer": {"type": "string"},
                    "replacementText": {"type": "string"},
                },
                "required": ["answer", "replacementText"],
            },
        }
    }


def _normalize_report_selection_refinement_text(text: Any) -> str:
    return _normalize_case_lessons_prose(text)


def generate_report_selection_refinement(
    summary_data: dict[str, Any],
) -> dict[str, str]:
    selected_text = _normalize_report_selection_refinement_text(
        summary_data.get("selectedText")
    )
    instruction = _normalize_report_selection_refinement_text(
        summary_data.get("instruction")
    )
    if not selected_text:
        raise CmrSummaryGenerationError("No selected report text was provided.")
    if not instruction:
        raise CmrSummaryGenerationError(
            "No refinement instruction or additional context was provided."
        )

    response = create_response(
        model=_report_selection_refinement_model(),
        input=_build_report_selection_refinement_prompt(summary_data),
        temperature=_report_selection_refinement_temperature(),
        max_output_tokens=DEFAULT_REPORT_SELECTION_REFINEMENT_MAX_OUTPUT_TOKENS,
        text=_report_selection_refinement_text_config(),
    )
    raw_text = str(getattr(response, "output_text", "") or "").strip()
    if not raw_text:
        raise CmrSummaryGenerationError(
            "OpenAI returned empty report-refinement output."
        )

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise CmrSummaryGenerationError(
            "OpenAI returned invalid JSON for report refinement."
        ) from exc

    if not isinstance(payload, dict):
        raise CmrSummaryGenerationError(
            "Report refinement payload has an invalid shape."
        )

    answer = _normalize_report_selection_refinement_text(payload.get("answer"))
    replacement_text = _normalize_report_selection_refinement_text(
        payload.get("replacementText")
    )
    if not answer or not replacement_text:
        raise CmrSummaryGenerationError(
            "OpenAI returned incomplete report-refinement output."
        )

    return {
        "answer": answer,
        "replacementText": replacement_text,
    }


def _expert_chat_model() -> str:
    value = str(
        os.getenv(
            "CMR_EXPERT_CHAT_MODEL",
            DEFAULT_EXPERT_CHAT_MODEL,
        )
    ).strip()
    return value or DEFAULT_EXPERT_CHAT_MODEL


def _expert_chat_temperature() -> float:
    raw = str(
        os.getenv(
            "CMR_EXPERT_CHAT_TEMPERATURE",
            str(DEFAULT_EXPERT_CHAT_TEMPERATURE),
        )
    ).strip()
    try:
        value = float(raw)
    except Exception:
        return DEFAULT_EXPERT_CHAT_TEMPERATURE
    return min(max(value, 0.0), 1.0)


def _expert_chat_system_prompt() -> str:
    return (
        "You are an expert cardiac MRI cardiologist inside a clinician-facing CMR workspace.\n\n"
        "ROLE:\n"
        "- Answer immediate CMR questions from clinicians.\n"
        "- Answer as a senior CMR clinician on general cardiac MRI interpretation, protocol, reporting, and practical phrasing.\n\n"
        "SCOPE HANDLING:\n"
        "- The request includes a scope field.\n"
        "- If scope is 'general', answer as a general practical CMR consult even if the user is currently on a case page.\n"
        "- In general scope, do not drift into analysing the active case unless the user explicitly asks to apply the point to that case.\n"
        "- If scope is 'case', stay tightly grounded to the supplied case facts.\n\n"
        "IMAGE AND CINE-FRAME HANDLING:\n"
        "- The user may attach one or more CMR images, screenshots, or representative frames extracted from an uploaded cine/video clip.\n"
        "- Use uploaded images and cine frames as adjunct visual evidence when present.\n"
        "- Be explicit that image comments are limited to the uploaded views/frames, not the full dataset, if that matters.\n"
        "- Do not claim findings that would require full stack review when only a few still images or sampled cine frames are supplied.\n"
        "- If image quality, temporal sampling, or field of view limits confidence, say so briefly.\n\n"
        "STYLE:\n"
        "- Sound like an experienced CMR cardiologist, not a generic assistant.\n"
        "- Be direct, clinically natural, and useful.\n"
        "- Prefer 1 to 3 short paragraphs.\n"
        "- Use bullets only if they clearly improve the answer.\n"
        "- When the user is on a specific page or module, answer with that context in mind.\n"
        "- If the question is about report wording, naming a finding, or practical reporting style, give concise report-ready phrasing and the key distinction behind it.\n"
        "- For general wording questions, prefer practical tips and example phrasing over case recap.\n"
        "- If the question is about scar, perfusion, viability, valves, thrombus, or PH physiology, explain the relationship between domains rather than restating isolated facts.\n"
        "- Do not pad the answer with generic safety language or scene-setting.\n\n"
        "NON-NEGOTIABLE RULES:\n"
        "- The supplied case data, report output, section summaries, conclusion lines, notable measurements, and conversation history are the source of truth when scope is 'case'.\n"
        "- When scope is 'case' and reportOutputText is present, treat it as the current edited report draft and primary narrative context.\n"
        "- reportOutputText may contain manual clinician edits that are newer than sectionSummaries or conclusionLines.\n"
        "- Use sectionSummaries, conclusionLines, and notableMeasurements as support and cross-checks, not as a replacement for reportOutputText.\n"
        "- Do not invent findings, diagnoses, measurements, or sequence results.\n"
        "- Do not contradict supplied case facts.\n"
        "- If the question reaches beyond what the supplied case material supports, say that clearly and answer only to the extent supported.\n"
        "- Do not give treatment recommendations or management advice.\n"
        "- This is a CMR expert chat. If the question is unrelated to cardiac MRI, say so briefly and steer back to CMR.\n\n"
        "OUTPUT FORMAT:\n"
        "- Return plain text only.\n"
        "- No markdown code fences.\n"
        "- No preamble.\n"
    )


def _classify_expert_chat_question(question: str) -> str:
    lowered = question.lower()
    wording_terms = (
        "how should i phrase",
        "how would you phrase",
        "how do i phrase",
        "how should this be phrased",
        "what would you call",
        "what do you call",
        "how should i report",
        "how do you report",
        "report wording",
        "report-ready",
        "how to write",
        "how should i write",
        "what term",
        "what wording",
        "best wording",
        "best phrase",
        "how to call",
        "call something",
    )
    if any(term in lowered for term in wording_terms):
        return "wording"

    protocol_terms = (
        "protocol",
        "sequence",
        "mapping",
        "stress protocol",
        "vasodilator",
        "how do you acquire",
        "what sequence",
        "when should i use",
    )
    if any(term in lowered for term in protocol_terms):
        return "protocol"

    interpretation_terms = (
        "why",
        "difference",
        "distinguish",
        "matched scar",
        "residual ischaemia",
        "viability",
        "how do you tell",
        "how can you tell",
        "versus",
        " vs ",
    )
    if any(term in lowered for term in interpretation_terms):
        return "interpretation"

    return "general"


def _expert_chat_answer_playbook(summary_data: dict[str, Any]) -> str:
    question_type = _classify_expert_chat_question(str(summary_data.get("question") or ""))

    if question_type == "wording":
        return (
            "Question type: wording/report phrasing.\n"
            "- Lead with the best term or best phrasing immediately.\n"
            "- Then give 2 to 4 short bullets under practical labels such as Write, Acceptable alternative, Avoid, and Why.\n"
            "- Use report-ready language, not textbook exposition.\n"
            "- If scope is general, stay general and do not drift into the active case.\n"
            "- If scope is case, give the report-ready wording that fits the supplied case facts exactly.\n"
        )

    if question_type == "protocol":
        return (
            "Question type: protocol/sequence selection.\n"
            "- Start with the direct practical answer.\n"
            "- Then give 2 to 4 short bullets such as When to use it, What makes it convincing, and How it changes reporting.\n"
            "- Keep the answer operational and fellow-level, not generic.\n"
        )

    if question_type == "interpretation":
        return (
            "Question type: interpretive distinction.\n"
            "- Open with the key distinction in one clear sentence.\n"
            "- Then give 2 to 4 short bullets such as Why this interpretation fits, What would push you the other way, and How to report it.\n"
            "- Make the reasoning explicit and comparative rather than simply restating facts.\n"
        )

    return (
        "Question type: general practical CMR consult.\n"
        "- Start with the direct answer.\n"
        "- Add 2 to 4 short bullets only if they improve usefulness.\n"
        "- Prefer practical distinctions, report-ready examples, and sequence integration over generic textbook summary.\n"
    )


def _normalize_expert_chat_image(
    raw_image: Any,
    *,
    label: str,
) -> dict[str, str]:
    if not isinstance(raw_image, dict):
        raise CmrSummaryGenerationError(f"{label} is invalid.")

    mime_type = str(raw_image.get("mimeType") or "").strip().lower()
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in SUPPORTED_EXPERT_CHAT_IMAGE_MIME_TYPES:
        raise CmrSummaryGenerationError(
            f"{label} must be PNG, JPG, or WebP."
        )

    data_url = str(raw_image.get("dataUrl") or "").strip()
    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$", data_url)
    if not match:
        raise CmrSummaryGenerationError(f"{label} is not a valid data URL.")

    normalized_data_mime = match.group(1).strip().lower()
    if normalized_data_mime == "image/jpg":
        normalized_data_mime = "image/jpeg"
    if normalized_data_mime != mime_type:
        mime_type = normalized_data_mime
    if mime_type not in SUPPORTED_EXPERT_CHAT_IMAGE_MIME_TYPES:
        raise CmrSummaryGenerationError(
            f"{label} must be PNG, JPG, or WebP."
        )

    base64_payload = re.sub(r"\s+", "", match.group(2))
    try:
        raw_bytes = b64decode(base64_payload, validate=True)
    except BinasciiError as exc:
        raise CmrSummaryGenerationError(f"{label} is not valid base64 image data.") from exc

    if len(raw_bytes) > MAX_EXPERT_CHAT_IMAGE_BYTES:
        raise CmrSummaryGenerationError(
            f"{label} is too large. Keep each image under 5 MB."
        )

    image_name = str(raw_image.get("name") or "").strip() or "cmr-scan.png"
    return {
        "name": image_name,
        "mimeType": mime_type,
        "dataUrl": f"data:{mime_type};base64,{base64_payload}",
        "byteCount": str(len(raw_bytes)),
    }


def _normalize_expert_chat_images(raw_images: Any, *, label: str) -> list[dict[str, str]]:
    if raw_images is None:
        return []
    if not isinstance(raw_images, list):
        raise CmrSummaryGenerationError(f"{label} list is invalid.")

    if len(raw_images) > MAX_EXPERT_CHAT_IMAGES:
        raise CmrSummaryGenerationError(
            f"No more than {MAX_EXPERT_CHAT_IMAGES} images can be attached to one expert chat request."
        )

    normalized_images = [
        _normalize_expert_chat_image(raw_image, label=f"{label} {index + 1}")
        for index, raw_image in enumerate(raw_images)
    ]
    total_bytes = sum(int(image["byteCount"]) for image in normalized_images)
    if total_bytes > MAX_EXPERT_CHAT_TOTAL_IMAGE_BYTES:
        raise CmrSummaryGenerationError(
            "Uploaded expert chat images are too large overall. Keep the total under 20 MB."
        )
    return normalized_images


def _normalize_expert_chat_conversation(summary_data: dict[str, Any]) -> list[dict[str, Any]]:
    raw_conversation = summary_data.get("conversation")
    if raw_conversation is None:
        return []
    if not isinstance(raw_conversation, list):
        raise CmrSummaryGenerationError("Expert chat conversation is invalid.")

    normalized_conversation: list[dict[str, Any]] = []
    for index, raw_turn in enumerate(raw_conversation):
        if not isinstance(raw_turn, dict):
            continue
        role = str(raw_turn.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = str(raw_turn.get("content") or "").strip()
        images = _normalize_expert_chat_images(
            raw_turn.get("images"),
            label=f"Conversation image in turn {index + 1}",
        )
        if role == "assistant" and not content:
            continue
        if role == "user" and not content and not images:
            continue
        normalized_conversation.append(
            {
                "role": role,
                "content": content,
                "images": images,
            }
        )
    return normalized_conversation


def _expert_chat_image_metadata(image: dict[str, str]) -> dict[str, str]:
    return {
        "name": image["name"],
        "mimeType": image["mimeType"],
    }


def _build_expert_chat_context(
    summary_data: dict[str, Any],
    *,
    conversation: list[dict[str, Any]],
    images: list[dict[str, str]],
) -> dict[str, Any]:
    context = {
        key: value
        for key, value in summary_data.items()
        if key not in {"conversation", "images"}
    }
    context["conversation"] = [
        {
            "role": turn["role"],
            "content": turn["content"],
            "images": [_expert_chat_image_metadata(image) for image in turn["images"]],
        }
        for turn in conversation
    ]
    context["images"] = [_expert_chat_image_metadata(image) for image in images]
    return context


def _build_expert_chat_system_message(
    summary_data: dict[str, Any],
    *,
    conversation: list[dict[str, Any]],
    images: list[dict[str, str]],
) -> str:
    scope = str(summary_data.get("scope") or "general").strip().lower()
    scope_instruction = (
        "Active scope: general practical CMR guidance. Treat this as a broad expert question unless the user explicitly asks to apply the answer to the current case."
        if scope != "case"
        else "Active scope: current case. Keep the answer anchored to the supplied case facts."
    )
    context_json = json.dumps(
        _build_expert_chat_context(summary_data, conversation=conversation, images=images),
        ensure_ascii=True,
        separators=(",", ":"),
    )
    return (
        f"{_expert_chat_system_prompt()}\n\n"
        f"{scope_instruction}\n\n"
        f"{_expert_chat_answer_playbook(summary_data)}\n\n"
        "Chat context JSON:\n"
        f"{context_json}"
    )


def _normalize_expert_chat_answer(text: Any) -> str:
    return _normalize_case_lessons_prose(text)


def _build_expert_chat_user_content(
    text: str,
    images: list[dict[str, str]],
) -> str | list[dict[str, str]]:
    content: list[dict[str, str]] = []
    normalized_text = text.strip()
    if normalized_text:
        content.append({"type": "input_text", "text": normalized_text})
    elif images:
        content.append(
            {
                "type": "input_text",
                "text": "Please comment on the uploaded CMR image(s).",
            }
        )

    for image in images:
        content.append({"type": "input_image", "image_url": image["dataUrl"]})

    if not content:
        return ""
    if len(content) == 1 and content[0]["type"] == "input_text":
        return content[0]["text"]
    return content


def _build_expert_chat_input(summary_data: dict[str, Any]) -> list[dict[str, Any]]:
    conversation = _normalize_expert_chat_conversation(summary_data)
    current_images = _normalize_expert_chat_images(
        summary_data.get("images"),
        label="Uploaded image",
    )
    current_question = str(summary_data.get("question") or "").strip()

    latest_history_image_index = -1
    if not current_images:
        for index, turn in enumerate(conversation):
            if turn["role"] == "user" and turn["images"]:
                latest_history_image_index = index

    input_messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": _build_expert_chat_system_message(
                summary_data,
                conversation=conversation,
                images=current_images,
            ),
        }
    ]

    for index, turn in enumerate(conversation):
        role = turn["role"]
        content = str(turn["content"] or "").strip()
        if role == "assistant":
            if content:
                input_messages.append({"role": "assistant", "content": content})
            continue

        turn_images = turn["images"] if index == latest_history_image_index else []
        turn_content = _build_expert_chat_user_content(content, turn_images)
        if turn_content:
            input_messages.append({"role": "user", "content": turn_content})

    current_user_content = _build_expert_chat_user_content(current_question, current_images)
    if not current_user_content:
        raise CmrSummaryGenerationError("No expert chat question or images were provided.")
    input_messages.append({"role": "user", "content": current_user_content})
    return input_messages


def generate_expert_chat_answer(summary_data: dict[str, Any]) -> str:
    question = str(summary_data.get("question") or "").strip()
    current_images = summary_data.get("images")
    if not question and not current_images:
        raise CmrSummaryGenerationError("No expert chat question was provided.")

    response = create_response(
        model=_expert_chat_model(),
        input=_build_expert_chat_input(summary_data),
        temperature=_expert_chat_temperature(),
        max_output_tokens=DEFAULT_EXPERT_CHAT_MAX_OUTPUT_TOKENS,
    )
    answer = _normalize_expert_chat_answer(getattr(response, "output_text", "") or "")
    if not answer:
        raise CmrSummaryGenerationError("OpenAI returned empty expert-chat output.")
    return answer

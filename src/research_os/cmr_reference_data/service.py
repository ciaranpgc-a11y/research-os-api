"""Persistence helpers for editable CMR reference data."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from threading import Lock
from typing import Any


_write_lock = Lock()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _package_data_path() -> Path:
    return Path(__file__).resolve().parents[1] / "cmr_summaries" / "cmr_reference_data.json"


def _frontend_data_path() -> Path:
    return _repo_root() / "frontend" / "src" / "data" / "cmr_reference_data.json"


def _candidate_paths() -> list[Path]:
    return [
        _package_data_path(),
        _repo_root() / "src" / "research_os" / "cmr_summaries" / "cmr_reference_data.json",
        _frontend_data_path(),
    ]


def _existing_write_paths() -> list[Path]:
    seen: set[Path] = set()
    paths: list[Path] = []
    for path in _candidate_paths():
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if path.exists():
            paths.append(path)
    if paths:
        return paths
    return [_package_data_path()]


def _read_path() -> Path:
    for path in _candidate_paths():
        if path.exists():
            return path
    raise FileNotFoundError("CMR reference data file not found.")


def read_reference_data() -> dict[str, Any]:
    path = _read_path()
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("CMR reference data has an invalid shape.")
    return payload


def _write_reference_data(data: dict[str, Any]) -> None:
    serialized = json.dumps(data, indent=2)
    with _write_lock:
        for path in _existing_write_paths():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"{serialized}\n", encoding="utf-8")


def replace_reference_data(data: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(data)
    _write_reference_data(payload)
    return payload


def update_reference_ranges(updates: list[dict[str, Any]]) -> int:
    data = read_reference_data()
    ref_ranges = data.get("ref_ranges")
    if not isinstance(ref_ranges, list):
        raise ValueError("CMR reference data is missing ref_ranges.")

    updated = 0
    for update in updates:
        parameter = str(update.get("parameter", "")).strip()
        sex = str(update.get("sex", "")).strip()
        age_band = str(update.get("age_band", "")).strip()
        if not parameter or not sex or not age_band:
            continue

        for row in ref_ranges:
            if not isinstance(row, dict):
                continue
            if row.get("parameter") != parameter or row.get("sex") != sex or row.get("age_band") != age_band:
                continue
            for field in ("ll", "mean", "ul", "sd", "ll_mass", "mean_mass", "ul_mass", "sd_mass"):
                if field in update:
                    row[field] = update[field]
            updated += 1
            break

    _write_reference_data(data)
    return updated


def update_parameter_meta(update: dict[str, Any]) -> None:
    parameter_key = str(update.get("parameter_key", "")).strip()
    if not parameter_key:
        raise ValueError("parameter_key is required.")

    data = read_reference_data()
    output_params = data.get("output_params")
    ref_ranges = data.get("ref_ranges")
    if not isinstance(output_params, dict) or not isinstance(ref_ranges, list):
        raise ValueError("CMR reference data has an invalid shape.")

    output_param = output_params.get(parameter_key)
    if not isinstance(output_param, dict):
        raise ValueError(f"Parameter not found: {parameter_key}")

    for field in (
        "unit",
        "indexing",
        "abnormal_direction",
        "major_section",
        "sub_section",
        "pap_affected",
        "sources",
        "severity_label",
        "severity_thresholds",
        "severity_label_override",
    ):
        if field in update:
            output_param[field] = update[field]

    if "nested_under" in update:
        nested_under = update.get("nested_under")
        if nested_under:
            output_param["nested_under"] = nested_under
        else:
            output_param.pop("nested_under", None)

    if "decimal_places" in update:
        decimal_places = update.get("decimal_places")
        if decimal_places is None:
            output_param.pop("decimal_places", None)
        else:
            output_param["decimal_places"] = decimal_places

    for row in ref_ranges:
        if not isinstance(row, dict) or row.get("parameter") != parameter_key:
            continue
        for field in ("unit", "indexing", "abnormal_direction"):
            if field in update:
                row[field] = update[field]

    _write_reference_data(data)


def update_sections(sections: dict[str, list[str]]) -> None:
    data = read_reference_data()
    data["sections"] = deepcopy(sections)
    _write_reference_data(data)


def update_config(updates: dict[str, Any]) -> None:
    data = read_reference_data()
    current_config = data.get("config")
    if not isinstance(current_config, dict):
        current_config = {}
        data["config"] = current_config
    current_config.update(deepcopy(updates))
    _write_reference_data(data)


def apply_edit_mode_changes(payload: dict[str, Any]) -> None:
    data = read_reference_data()
    output_params = data.get("output_params")
    ref_ranges = data.get("ref_ranges")
    if not isinstance(output_params, dict) or not isinstance(ref_ranges, list):
        raise ValueError("CMR reference data has an invalid shape.")

    section_renames = payload.get("section_renames")
    if isinstance(section_renames, list):
        for rename in section_renames:
            if not isinstance(rename, dict):
                continue
            old_name = str(rename.get("old_name", "")).strip()
            new_name = str(rename.get("new_name", "")).strip()
            if not old_name or not new_name or old_name == new_name:
                continue
            for output_param in output_params.values():
                if isinstance(output_param, dict) and output_param.get("major_section") == old_name:
                    output_param["major_section"] = new_name

    sub_section_renames = payload.get("sub_section_renames")
    if isinstance(sub_section_renames, list):
        for rename in sub_section_renames:
            if not isinstance(rename, dict):
                continue
            section = str(rename.get("section", "")).strip()
            old_name = str(rename.get("old_name", "")).strip()
            new_name = str(rename.get("new_name", "")).strip()
            if not section or old_name == new_name:
                continue
            for output_param in output_params.values():
                if not isinstance(output_param, dict):
                    continue
                if output_param.get("major_section") == section and output_param.get("sub_section") == old_name:
                    output_param["sub_section"] = new_name

    sections = payload.get("sections")
    if isinstance(sections, dict):
        data["sections"] = deepcopy(sections)

    param_order = payload.get("param_order")
    if isinstance(param_order, list):
        reordered: dict[str, Any] = {}
        for key in param_order:
            if isinstance(key, str) and key in output_params:
                reordered[key] = output_params[key]
        for key, value in output_params.items():
            if key not in reordered:
                reordered[key] = value
        data["output_params"] = reordered

    _write_reference_data(data)


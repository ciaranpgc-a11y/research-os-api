from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
import json
import math
import os
from pathlib import Path
import time
from typing import Any

from research_os.clients.openai_client import create_response as openai_create_response
import research_os.services.publication_insights_agent_service as publication_insights_agent_service


AS_OF_DATE = date(2026, 3, 8)
SECTION_KEYS = (
    "publication_output_pattern",
    "publication_production_phase",
    "publication_volume_over_time",
    "publication_article_type_over_time",
    "publication_type_over_time",
)
SECTION_LABELS = {
    "publication_output_pattern": "Publication output pattern",
    "publication_production_phase": "Production phase",
    "publication_volume_over_time": "Publication volume over time",
    "publication_article_type_over_time": "Type of articles published over time",
    "publication_type_over_time": "Type of publications published over time",
}
MONTH_LABELS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
GENERATION_MODEL = "gpt-5.4"
CRITIQUE_MODEL = "gpt-4.1-mini"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "publication_insights_eval_2026-03-09"
ARTIFACT_PATH = OUTPUT_DIR / "artifacts.json"
REPORT_PATH = OUTPUT_DIR / "REPORT.md"
LOG_PREFIX = "[publication-insights-eval]"


@dataclass(frozen=True)
class MixSegment:
    start_year: int
    end_year: int
    ratios: list[tuple[str, str, float]]


@dataclass(frozen=True)
class PortfolioCase:
    case_id: str
    name: str
    theme: str
    summary: str
    yearly_counts: dict[int, int]
    mix_segments: list[MixSegment]
    month_overrides: dict[int, list[int]]


def _log(message: str) -> None:
    print(f"{LOG_PREFIX} {message}", flush=True)


def _round_robin_months(count: int) -> list[int]:
    if count <= 0:
        return []
    if count == 1:
        return [6]
    return [
        max(1, min(12, 1 + round((11 * index) / float(count - 1))))
        for index in range(count)
    ]


def _largest_remainder_allocate(total: int, ratios: list[tuple[str, str, float]]) -> list[tuple[str, str, int]]:
    if total <= 0:
        return [(article_type, publication_type, 0) for article_type, publication_type, _weight in ratios]
    weights = [max(0.0, float(weight)) for _article_type, _publication_type, weight in ratios]
    weight_sum = sum(weights) or float(len(ratios))
    raw_counts = [(weight / weight_sum) * float(total) for weight in weights]
    floors = [int(math.floor(value)) for value in raw_counts]
    for index in sorted(
        range(len(raw_counts)),
        key=lambda item: (raw_counts[item] - floors[item], weights[item], -item),
        reverse=True,
    )[: max(0, total - sum(floors))]:
        floors[index] += 1
    return [(ratios[index][0], ratios[index][1], floors[index]) for index in range(len(ratios))]


def _segment_for_year(case: PortfolioCase, year: int) -> MixSegment:
    for segment in case.mix_segments:
        if segment.start_year <= year <= segment.end_year:
            return segment
    return case.mix_segments[-1]


def _article_type_title(article_type: str) -> str:
    mapping = {
        "original-article": "original research",
        "review-article": "review article",
        "systematic-review": "systematic review",
        "editorial": "editorial",
        "protocol": "protocol",
        "case-report": "case report",
        "letter": "letter",
    }
    return mapping.get(article_type, article_type.replace("-", " "))


def _journal_name(theme: str, publication_type: str) -> str:
    if publication_type == "journal-article":
        return f"{theme} Research"
    if publication_type == "review-article":
        return f"{theme} Review Quarterly"
    if publication_type == "conference-abstract":
        return f"{theme} Annual Meeting"
    if publication_type == "preprint":
        return f"{theme} Preprints"
    if publication_type == "editorial":
        return f"{theme} Perspectives"
    if publication_type == "letter":
        return f"{theme} Correspondence"
    return f"{theme} {publication_type.replace('-', ' ').title()}"


def _estimate_citations(*, publication_year: int, publication_type: str, article_type: str) -> int:
    years_old = max(0, AS_OF_DATE.year - int(publication_year))
    base = max(0, years_old - 1) * 2
    if publication_type == "review-article" or article_type == "systematic-review":
        base += 6
    elif article_type == "original-article":
        base += 4
    elif article_type == "editorial":
        base += 1
    if publication_type == "conference-abstract":
        base = max(0, base - 3)
    if publication_type == "preprint":
        base = max(0, base - 1)
    return int(base)


def _build_publication_rows(case: PortfolioCase) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sequence = 0
    for year in sorted(case.yearly_counts.keys()):
        total_count = max(0, int(case.yearly_counts[year]))
        if total_count <= 0:
            continue
        segment = _segment_for_year(case, year)
        bucket_counts = _largest_remainder_allocate(total_count, segment.ratios)
        month_pattern = case.month_overrides.get(year) or _round_robin_months(total_count)
        month_index = 0
        for article_type, publication_type, bucket_count in bucket_counts:
            for bucket_position in range(bucket_count):
                month = month_pattern[month_index % len(month_pattern)]
                month_index += 1
                day = min(28, 1 + ((sequence + bucket_position) % 27))
                sequence += 1
                rows.append(
                    {
                        "work_id": f"{case.case_id}-w{sequence:03d}",
                        "title": f"{case.theme} {_article_type_title(article_type)} {year} study {bucket_position + 1}",
                        "year": year,
                        "publication_date": date(year, month, day).isoformat(),
                        "article_type": article_type,
                        "publication_type": publication_type,
                        "work_type": publication_type,
                        "journal": _journal_name(case.theme, publication_type),
                        "citations_lifetime": _estimate_citations(
                            publication_year=year,
                            publication_type=publication_type,
                            article_type=article_type,
                        ),
                    }
                )
    rows.sort(key=lambda item: (str(item.get("publication_date") or ""), str(item.get("title") or "")))
    return rows


def _month_starts_between(start_month: date, end_month: date) -> list[date]:
    month_starts: list[date] = []
    current = date(start_month.year, start_month.month, 1)
    end = date(end_month.year, end_month.month, 1)
    while current <= end:
        month_starts.append(current)
        current = date(current.year + 1, 1, 1) if current.month == 12 else date(current.year, current.month + 1, 1)
    return month_starts


def _build_chart_data(publications: list[dict[str, Any]], *, as_of_date: date) -> dict[str, Any]:
    current_month_start = date(as_of_date.year, as_of_date.month, 1)
    by_year = Counter(int(item["year"]) for item in publications)
    years = sorted(by_year.keys())
    first_year = min(years) if years else as_of_date.year
    complete_last_year = as_of_date.year - 1
    chart_years = list(range(first_year, complete_last_year + 1))
    chart_values = [int(by_year.get(year, 0)) for year in chart_years]
    current_year_ytd = sum(
        1
        for item in publications
        if publication_insights_agent_service._parse_iso_date(item.get("publication_date")) is not None
        and publication_insights_agent_service._parse_iso_date(item.get("publication_date")) < current_month_start
        and str(item.get("publication_date") or "").startswith(str(as_of_date.year))
    )
    month_starts = _month_starts_between(date(first_year, 1, 1), date(as_of_date.year, as_of_date.month - 1, 1))
    month_counter = Counter(
        publication_insights_agent_service._parse_iso_date(item.get("publication_date")).replace(day=1)
        for item in publications
        if publication_insights_agent_service._parse_iso_date(item.get("publication_date")) is not None
        and publication_insights_agent_service._parse_iso_date(item.get("publication_date")) < current_month_start
    )
    monthly_values_lifetime = [int(month_counter.get(month_start, 0)) for month_start in month_starts]
    month_labels_lifetime = [month_start.isoformat() for month_start in month_starts]
    last_12_months = month_starts[-12:]
    return {
        "years": chart_years,
        "values": chart_values,
        "monthly_values_12m": [int(month_counter.get(month_start, 0)) for month_start in last_12_months],
        "month_labels_12m": [MONTH_LABELS[month_start.month - 1] for month_start in last_12_months],
        "monthly_values_lifetime": monthly_values_lifetime,
        "month_labels_lifetime": month_labels_lifetime,
        "lifetime_month_start": month_starts[0].isoformat() if month_starts else date(first_year, 1, 1).isoformat(),
        "projected_year": as_of_date.year,
        "current_year_ytd": current_year_ytd,
    }


def _estimate_h_index(publications: list[dict[str, Any]]) -> int:
    citations = sorted([max(0, int(item.get("citations_lifetime") or 0)) for item in publications], reverse=True)
    h_index = 0
    for position, citation_count in enumerate(citations, start=1):
        if citation_count >= position:
            h_index = position
        else:
            break
    return h_index


def _build_metrics_payload(case: PortfolioCase, publications: list[dict[str, Any]]) -> dict[str, Any]:
    chart_data = _build_chart_data(publications, as_of_date=AS_OF_DATE)
    total_publications = len(publications)
    total_citations = sum(max(0, int(item.get("citations_lifetime") or 0)) for item in publications)
    complete_year_counts = [int(value) for value in (chart_data.get("values") or [])]
    recent_slice = complete_year_counts[-3:] if len(complete_year_counts) >= 3 else complete_year_counts
    earlier_slice = complete_year_counts[:-3] if len(complete_year_counts) > 3 else complete_year_counts
    recent_mean = (sum(recent_slice) / float(len(recent_slice))) if recent_slice else 0.0
    earlier_mean = (sum(earlier_slice) / float(len(earlier_slice))) if earlier_slice else recent_mean
    momentum_index = round(recent_mean - earlier_mean, 1)
    if momentum_index >= 2.0:
        momentum_state = "Strengthening"
    elif momentum_index <= -2.0:
        momentum_state = "Softening"
    else:
        momentum_state = "Stable"
    citations_last_12_months = sum(
        max(0, int(item.get("citations_lifetime") or 0))
        for item in publications
        if publication_insights_agent_service._parse_iso_date(item.get("publication_date")) is not None
        and publication_insights_agent_service._parse_iso_date(item.get("publication_date")) >= date(2025, 3, 1)
    )
    h_index = _estimate_h_index(publications)
    concentration_pct = 0.0
    if total_citations > 0:
        top_citations = sorted(
            [max(0, int(item.get("citations_lifetime") or 0)) for item in publications],
            reverse=True,
        )[: max(1, min(5, total_publications))]
        concentration_pct = round((sum(top_citations) / float(total_citations)) * 100.0, 1)
    uncited_pct = (
        round(
            (
                sum(1 for item in publications if max(0, int(item.get("citations_lifetime") or 0)) <= 0)
                / float(total_publications)
            )
            * 100.0,
            1,
        )
        if total_publications > 0
        else 0.0
    )
    return {
        "status": "READY",
        "data_sources": ["Synthetic eval"],
        "tiles": [
            {
                "key": "this_year_vs_last",
                "main_value": str(total_publications),
                "value": str(total_publications),
                "data_source": ["Synthetic eval"],
                "chart_data": chart_data,
                "drilldown": {"as_of_date": AS_OF_DATE.isoformat(), "publications": publications},
            },
            {
                "key": "total_citations",
                "value": str(total_citations),
                "drilldown": {"metadata": {"intermediate_values": {"citations_last_12_months": citations_last_12_months}}},
            },
            {"key": "momentum", "value": str(momentum_index), "subtext": momentum_state},
            {
                "key": "h_index_projection",
                "value": str(h_index),
                "drilldown": {
                    "metadata": {
                        "intermediate_values": {
                            "projected_h_index": h_index + 1,
                            "h_core_share_total_citations_pct": min(100.0, concentration_pct + 10.0),
                        }
                    }
                },
            },
            {
                "key": "impact_concentration",
                "subtext": "Concentrated" if concentration_pct >= 45.0 else "Mixed",
                "drilldown": {
                    "metadata": {
                        "intermediate_values": {
                            "concentration_pct": concentration_pct,
                            "classification": "Concentrated" if concentration_pct >= 45.0 else "Mixed",
                            "uncited_publications_pct": uncited_pct,
                        }
                    }
                },
            },
            {"key": "field_percentile_share", "value": "58", "chart_data": {"coverage_pct": 100.0}},
            {"key": "authorship_composition", "value": "41", "chart_data": {}},
            {
                "key": "collaboration_structure",
                "chart_data": {
                    "repeat_collaborator_rate_pct": 62.0,
                    "unique_collaborators": max(4, min(40, total_publications // 2)),
                    "countries": 4,
                },
            },
        ],
    }


def _build_case_summary(case: PortfolioCase, publications: list[dict[str, Any]]) -> str:
    by_year = Counter(int(item["year"]) for item in publications)
    peak_count = max(by_year.values()) if by_year else 0
    peak_years = [str(year) for year, count in sorted(by_year.items()) if count == peak_count]
    article_counter = Counter(
        publication_insights_agent_service._format_publication_article_type_label(item)
        for item in publications
    )
    publication_counter = Counter(
        publication_insights_agent_service._format_publication_type_label(item)
        for item in publications
    )
    article_top = ", ".join(f"{label} ({count})" for label, count in article_counter.most_common(3))
    publication_top = ", ".join(f"{label} ({count})" for label, count in publication_counter.most_common(3))
    years = sorted(by_year.keys())
    return (
        f"{case.summary} The library contains {len(publications)} publications from {years[0]} to {years[-1]}. "
        f"Peak years are {', '.join(peak_years)} at {peak_count} publications. "
        f"Top article types: {article_top}. Top publication types: {publication_top}."
    )


def _call_with_retry(func, *args, **kwargs):  # type: ignore[no-untyped-def]
    for attempt in range(2):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            error_text = str(exc).lower()
            if "invalid_api_key" in error_text or "incorrect api key" in error_text:
                raise RuntimeError(
                    "OPENAI_API_KEY is invalid for live publication-insight evaluation."
                ) from exc
            if attempt == 1:
                raise
            if "rate" not in error_text and "timeout" not in error_text:
                raise
            time.sleep(3)
    raise RuntimeError("unreachable")


def _prompt_components_for_section(section_key: str, user_id: str) -> tuple[dict[str, Any], str]:
    if section_key == "publication_output_pattern":
        evidence = publication_insights_agent_service._build_publication_output_pattern_evidence(user_id=user_id)
        prompt = publication_insights_agent_service._build_publication_output_pattern_prompt(evidence)
        return evidence, prompt
    if section_key == "publication_production_phase":
        evidence = publication_insights_agent_service._build_publication_production_phase_evidence(user_id=user_id)
        prompt = publication_insights_agent_service._build_publication_production_phase_prompt(evidence)
        return evidence, prompt
    if section_key == "publication_volume_over_time":
        evidence = publication_insights_agent_service._build_publication_volume_over_time_evidence(user_id=user_id)
        prompt = publication_insights_agent_service._build_publication_volume_over_time_prompt(evidence)
        return evidence, prompt
    if section_key == "publication_article_type_over_time":
        evidence = publication_insights_agent_service._build_publication_article_type_over_time_evidence(user_id=user_id)
        prompt = publication_insights_agent_service._build_publication_article_type_over_time_prompt(evidence)
        return evidence, prompt
    if section_key == "publication_type_over_time":
        evidence = publication_insights_agent_service._build_publication_type_over_time_evidence(user_id=user_id)
        prompt = publication_insights_agent_service._build_publication_type_over_time_prompt(evidence)
        return evidence, prompt
    raise KeyError(section_key)


def _coerce_section_payload(section_key: str, payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    if section_key == "publication_output_pattern":
        return publication_insights_agent_service._coerce_publication_output_pattern_payload(payload, evidence)
    if section_key == "publication_production_phase":
        return publication_insights_agent_service._coerce_publication_production_phase_payload(payload, evidence)
    if section_key == "publication_volume_over_time":
        return publication_insights_agent_service._coerce_publication_volume_over_time_payload(payload, evidence)
    if section_key == "publication_article_type_over_time":
        return publication_insights_agent_service._coerce_publication_article_type_over_time_payload(payload, evidence)
    if section_key == "publication_type_over_time":
        return publication_insights_agent_service._coerce_publication_type_over_time_payload(payload, evidence)
    return payload


def _run_case_section(case: PortfolioCase, metrics_payload: dict[str, Any], section_key: str) -> dict[str, Any]:
    real_get_metrics = publication_insights_agent_service.get_publication_top_metrics

    def _fake_get_metrics(**kwargs: Any) -> dict[str, Any]:
        return metrics_payload

    publication_insights_agent_service.get_publication_top_metrics = _fake_get_metrics
    try:
        evidence, prompt = _prompt_components_for_section(section_key, f"eval-{case.case_id}")
    finally:
        publication_insights_agent_service.get_publication_top_metrics = real_get_metrics
    response = _call_with_retry(
        openai_create_response,
        model=GENERATION_MODEL,
        input=prompt,
        timeout=float(os.getenv("PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS", "45") or "45"),
        max_retries=0,
    )
    raw_output_text = str(response.output_text or "").strip()
    parsed_payload: dict[str, Any] | None = None
    section: dict[str, Any] | None = None
    generation_mode = "model_direct"
    try:
        parsed_payload = _parse_json_object(raw_output_text)
        parsed_payload = _coerce_section_payload(section_key, parsed_payload, evidence)
        section = dict((parsed_payload.get("sections") or [None])[0] or {})
    except Exception:
        generation_mode = "model_direct_unparsed"
        section = {
            "headline": "(unparsed model output)",
            "body": raw_output_text,
            "consideration_label": None,
            "consideration": None,
        }
    return {
        "section_key": section_key,
        "section_label": SECTION_LABELS[section_key],
        "model": GENERATION_MODEL,
        "prompt": prompt,
        "payload": parsed_payload,
        "raw_output_text": raw_output_text,
        "evidence": evidence,
        "headline": section.get("headline"),
        "body": section.get("body"),
        "consideration_label": section.get("consideration_label"),
        "consideration": section.get("consideration"),
        "generation_mode": generation_mode,
    }


def _fallback_section_analysis(result: dict[str, Any]) -> dict[str, Any]:
    body = str(result.get("body") or "")
    strengths: list[str] = []
    weaknesses: list[str] = []
    plan: list[str] = []
    if any(char.isdigit() for char in body):
        strengths.append("Uses concrete years or counts rather than staying purely generic.")
    else:
        weaknesses.append("Needs more precise year/count anchors to feel evidence-led.")
        plan.append("Inject one or two decisive numeric comparisons from the section evidence.")
    if result.get("consideration"):
        strengths.append("Adds a secondary note rather than stopping at the headline and body.")
    else:
        weaknesses.append("Misses a secondary note that could add why-it-matters or what-changes-it value.")
        plan.append("Let the model choose a second tile when a genuine follow-on angle is available.")
    if "why it matters" in str(result.get("consideration_label") or "").lower():
        strengths.append("Includes an academic so-what rather than only a metric recap.")
    else:
        weaknesses.append("The secondary note could be more academically consequential.")
        plan.append("Bias the follow-on note toward why-it-matters or what-changes-it when evidence supports it.")
    if not strengths:
        strengths.append("Grounded in the current section evidence.")
    if not weaknesses:
        weaknesses.append("Still reads slightly templated and could feel more tailored to the exact record shape.")
    if not plan:
        plan.append("Loosen stylistic constraints further and let the model pick the strongest interpretive angle.")
    return {"strengths": strengths[:3], "weaknesses": weaknesses[:3], "plan": plan[:3]}


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = str(text or "").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < 0 or end <= start:
        raise ValueError("No JSON object found")
    return json.loads(cleaned[start : end + 1])


def _analyze_case_outputs(case_summary: str, results: list[dict[str, Any]]) -> dict[str, dict[str, list[str]]]:
    sections_payload = [
        {
            "key": result["section_key"],
            "label": result["section_label"],
            "headline": result["headline"],
            "body": result["body"],
            "consideration_label": result["consideration_label"],
            "consideration": result["consideration"],
            "generation_mode": result["generation_mode"],
        }
        for result in results
    ]
    prompt = (
        "You are reviewing publication insight outputs for a research analytics product.\n"
        "Return JSON only.\n"
        "For each section, give 2-3 strengths, 2-3 weaknesses, and 2-3 concrete improvement actions.\n"
        "Write like a rigorous product reviewer for a highly capable academic audience.\n"
        "Focus on personalness, analytical depth, academic usefulness, whether the response overweights thin recent data, and whether it sounds templated.\n"
        "Schema:\n"
        "{\n"
        '  "sections": [\n'
        "    {\n"
        '      "key": "string",\n'
        '      "strengths": ["string"],\n'
        '      "weaknesses": ["string"],\n'
        '      "plan": ["string"]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        f"Case summary: {case_summary}\n"
        f"Section outputs: {json.dumps(sections_payload, ensure_ascii=True)}\n"
    )
    try:
        response = _call_with_retry(
            openai_create_response,
            model=CRITIQUE_MODEL,
            input=prompt,
            timeout=30.0,
            max_retries=0,
        )
        parsed = _parse_json_object(str(response.output_text or ""))
        sections = parsed.get("sections") if isinstance(parsed, dict) else None
        if not isinstance(sections, list):
            raise ValueError("sections missing")
        analysis_by_key: dict[str, dict[str, list[str]]] = {}
        for item in sections:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip()
            if not key:
                continue
            analysis_by_key[key] = {
                "strengths": [str(value).strip() for value in (item.get("strengths") or []) if str(value).strip()][:3],
                "weaknesses": [str(value).strip() for value in (item.get("weaknesses") or []) if str(value).strip()][:3],
                "plan": [str(value).strip() for value in (item.get("plan") or []) if str(value).strip()][:3],
            }
        return analysis_by_key
    except Exception:
        return {result["section_key"]: _fallback_section_analysis(result) for result in results}


def _report_prompt_block(prompt: str) -> str:
    safe_prompt = str(prompt or "").replace("```", "'''")
    return f"<details><summary>Exact prompt</summary>\n\n```text\n{safe_prompt}\n```\n\n</details>"


def _write_report(payload: dict[str, Any]) -> None:
    lines: list[str] = [
        "# Publication insights evaluation report",
        "",
        f"- Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"- Generation model: `{GENERATION_MODEL}`",
        f"- Critique model: `{CRITIQUE_MODEL}`",
        f"- As-of date: `{AS_OF_DATE.isoformat()}`",
        f"- Artifact JSON: `{ARTIFACT_PATH}`",
        "",
        "## Cases",
        "",
    ]
    for case in payload["cases"]:
        lines.append(f"- `{case['case_id']}` {case['name']}: {case['summary']}")
    lines.append("")
    for case in payload["cases"]:
        lines.append(f"## {case['case_id']} - {case['name']}")
        lines.append("")
        lines.append(case["summary"])
        lines.append("")
        for result in case["results"]:
            analysis = result.get("analysis") or {}
            lines.append(f"### {result['section_label']}")
            lines.append("")
            lines.append(f"- Headline: `{result.get('headline') or ''}`")
            lines.append(f"- Body: {result.get('body') or ''}")
            if result.get("consideration"):
                lines.append(f"- Secondary note: `{result.get('consideration_label') or 'Note'}` - {result.get('consideration')}")
            else:
                lines.append("- Secondary note: none")
            lines.append(f"- Generation mode: `{result.get('generation_mode')}`")
            lines.append("")
            lines.append("**Strengths**")
            for item in analysis.get("strengths") or []:
                lines.append(f"- {item}")
            lines.append("")
            lines.append("**Weaknesses**")
            for item in analysis.get("weaknesses") or []:
                lines.append(f"- {item}")
            lines.append("")
            lines.append("**Suggested plan**")
            for item in analysis.get("plan") or []:
                lines.append(f"- {item}")
            lines.append("")
            lines.append(_report_prompt_block(str(result.get("prompt") or "")))
            lines.append("")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def _build_cases() -> list[PortfolioCase]:
    return [
        PortfolioCase(
            case_id="case_01",
            name="Scaling continuous build",
            theme="Cardiology",
            summary="Continuous output builds year by year from a light early base into a stronger recent run.",
            yearly_counts={2018: 2, 2019: 3, 2020: 4, 2021: 5, 2022: 7, 2023: 9, 2024: 11, 2025: 13, 2026: 3},
            mix_segments=[
                MixSegment(2018, 2022, [("original-article", "journal-article", 0.75), ("systematic-review", "review-article", 0.15), ("editorial", "editorial", 0.10)]),
                MixSegment(2023, 2026, [("original-article", "journal-article", 0.60), ("systematic-review", "review-article", 0.20), ("protocol", "journal-article", 0.10), ("editorial", "editorial", 0.10)]),
            ],
            month_overrides={2025: [3, 4, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 12], 2026: [1, 2, 2]},
        ),
        PortfolioCase(
            case_id="case_02",
            name="Plateauing with shared peaks",
            theme="Imaging",
            summary="Repeated high years are followed by a sharp recent pullback without gap years.",
            yearly_counts={2016: 1, 2017: 1, 2018: 16, 2019: 8, 2020: 8, 2021: 19, 2022: 11, 2023: 14, 2024: 19, 2025: 4, 2026: 1},
            mix_segments=[
                MixSegment(2016, 2022, [("original-article", "journal-article", 0.72), ("systematic-review", "review-article", 0.14), ("editorial", "editorial", 0.14)]),
                MixSegment(2023, 2026, [("original-article", "journal-article", 0.52), ("review-article", "review-article", 0.23), ("systematic-review", "journal-article", 0.15), ("editorial", "editorial", 0.10)]),
            ],
            month_overrides={2025: [4, 11, 11, 11], 2026: [1]},
        ),
        PortfolioCase(
            case_id="case_03",
            name="Contracting after long rise",
            theme="Epidemiology",
            summary="A long climb into a strong run gives way to a multi-year pullback and very light recent output.",
            yearly_counts={2014: 4, 2015: 6, 2016: 8, 2017: 10, 2018: 12, 2019: 14, 2020: 15, 2021: 14, 2022: 10, 2023: 7, 2024: 5, 2025: 3},
            mix_segments=[
                MixSegment(2014, 2020, [("original-article", "journal-article", 0.78), ("systematic-review", "review-article", 0.12), ("editorial", "editorial", 0.10)]),
                MixSegment(2021, 2025, [("original-article", "journal-article", 0.58), ("review-article", "review-article", 0.18), ("editorial", "editorial", 0.14), ("letter", "letter", 0.10)]),
            ],
            month_overrides={2025: [2, 6, 11]},
        ),
        PortfolioCase(
            case_id="case_04",
            name="Rebuilding after gap years",
            theme="Population health",
            summary="An interrupted record resumes and then strengthens into a clear rebuilding phase.",
            yearly_counts={2013: 3, 2014: 4, 2015: 5, 2016: 0, 2017: 0, 2018: 2, 2019: 3, 2020: 5, 2021: 7, 2022: 8, 2023: 10, 2024: 11, 2025: 12, 2026: 2},
            mix_segments=[
                MixSegment(2013, 2019, [("original-article", "journal-article", 0.80), ("editorial", "editorial", 0.20)]),
                MixSegment(2020, 2026, [("original-article", "journal-article", 0.55), ("systematic-review", "review-article", 0.20), ("protocol", "journal-article", 0.15), ("editorial", "editorial", 0.10)]),
            ],
            month_overrides={2025: [3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 12], 2026: [1, 2]},
        ),
        PortfolioCase(
            case_id="case_05",
            name="Emerging short record",
            theme="Clinical AI",
            summary="A short recent record is building, but it is still too early for deeper long-run claims.",
            yearly_counts={2022: 1, 2023: 2, 2024: 4, 2025: 5, 2026: 1},
            mix_segments=[MixSegment(2022, 2026, [("original-article", "journal-article", 0.60), ("protocol", "journal-article", 0.20), ("systematic-review", "review-article", 0.20)])],
            month_overrides={2025: [4, 6, 8, 10, 12], 2026: [2]},
        ),
        PortfolioCase(
            case_id="case_06",
            name="Established steady band",
            theme="Health services",
            summary="A long uninterrupted record sits in a fairly settled annual range rather than building or falling sharply.",
            yearly_counts={2015: 7, 2016: 8, 2017: 8, 2018: 9, 2019: 8, 2020: 9, 2021: 8, 2022: 9, 2023: 9, 2024: 8, 2025: 8, 2026: 1},
            mix_segments=[MixSegment(2015, 2026, [("original-article", "journal-article", 0.55), ("review-article", "review-article", 0.20), ("protocol", "journal-article", 0.15), ("editorial", "editorial", 0.10)])],
            month_overrides={2025: [3, 4, 6, 7, 8, 9, 10, 12], 2026: [2]},
        ),
        PortfolioCase(
            case_id="case_07",
            name="Bursty isolated spike",
            theme="Global surgery",
            summary="One standout year dominates an otherwise lighter record, creating a very different shape from repeated broad strength.",
            yearly_counts={2016: 2, 2017: 2, 2018: 3, 2019: 4, 2020: 18, 2021: 4, 2022: 3, 2023: 5, 2024: 4, 2025: 3},
            mix_segments=[
                MixSegment(2016, 2019, [("original-article", "journal-article", 0.80), ("editorial", "editorial", 0.20)]),
                MixSegment(2020, 2020, [("original-article", "conference-abstract", 0.45), ("original-article", "journal-article", 0.35), ("systematic-review", "review-article", 0.20)]),
                MixSegment(2021, 2025, [("original-article", "journal-article", 0.60), ("review-article", "review-article", 0.20), ("editorial", "editorial", 0.20)]),
            ],
            month_overrides={2020: [2, 3, 4, 4, 5, 6, 6, 7, 7, 8, 9, 9, 10, 10, 11, 11, 12, 12], 2025: [4, 9, 11]},
        ),
        PortfolioCase(
            case_id="case_08",
            name="Alternating strong years",
            theme="Implementation science",
            summary="The record remains continuous but swings between stronger and softer years in a repeated pattern.",
            yearly_counts={2016: 4, 2017: 9, 2018: 5, 2019: 11, 2020: 6, 2021: 13, 2022: 7, 2023: 14, 2024: 8, 2025: 12, 2026: 2},
            mix_segments=[
                MixSegment(2016, 2020, [("original-article", "journal-article", 0.68), ("systematic-review", "review-article", 0.18), ("editorial", "editorial", 0.14)]),
                MixSegment(2021, 2026, [("original-article", "journal-article", 0.48), ("systematic-review", "review-article", 0.28), ("review-article", "review-article", 0.14), ("editorial", "editorial", 0.10)]),
            ],
            month_overrides={2025: [3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 12], 2026: [1, 2]},
        ),
        PortfolioCase(
            case_id="case_09",
            name="Recent broadening of formats",
            theme="Digital health",
            summary="Annual volume is fairly steady, but the recent record broadens into more publication and article formats than the long-run base.",
            yearly_counts={2016: 6, 2017: 6, 2018: 7, 2019: 7, 2020: 8, 2021: 8, 2022: 8, 2023: 9, 2024: 10, 2025: 10, 2026: 2},
            mix_segments=[
                MixSegment(2016, 2021, [("original-article", "journal-article", 0.78), ("editorial", "editorial", 0.12), ("systematic-review", "review-article", 0.10)]),
                MixSegment(2022, 2026, [("original-article", "journal-article", 0.40), ("protocol", "preprint", 0.18), ("systematic-review", "review-article", 0.18), ("editorial", "editorial", 0.12), ("letter", "conference-abstract", 0.12)]),
            ],
            month_overrides={2025: [3, 4, 4, 5, 6, 7, 8, 9, 10, 12], 2026: [1, 2]},
        ),
        PortfolioCase(
            case_id="case_10",
            name="Mature portfolio, recent pause",
            theme="Oncology",
            summary="A long high-output record remains substantial, but the latest complete year falls below the mature working range.",
            yearly_counts={2010: 5, 2011: 6, 2012: 7, 2013: 8, 2014: 9, 2015: 10, 2016: 11, 2017: 12, 2018: 13, 2019: 14, 2020: 15, 2021: 16, 2022: 16, 2023: 15, 2024: 16, 2025: 9, 2026: 1},
            mix_segments=[
                MixSegment(2010, 2018, [("original-article", "journal-article", 0.72), ("systematic-review", "review-article", 0.16), ("editorial", "editorial", 0.12)]),
                MixSegment(2019, 2026, [("original-article", "journal-article", 0.58), ("systematic-review", "review-article", 0.22), ("review-article", "review-article", 0.10), ("editorial", "editorial", 0.10)]),
            ],
            month_overrides={2025: [3, 5, 6, 7, 8, 9, 10, 11, 12], 2026: [2]},
        ),
    ]


def main() -> None:
    os.environ.setdefault("PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS", "45")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cases_payload: list[dict[str, Any]] = []
    case_limit = max(0, int(os.getenv("PUBLICATION_EVAL_CASE_LIMIT", "0") or "0"))
    section_limit = max(0, int(os.getenv("PUBLICATION_EVAL_SECTION_LIMIT", "0") or "0"))
    cases = _build_cases()
    if case_limit > 0:
        cases = cases[:case_limit]
    section_keys = SECTION_KEYS[:section_limit] if section_limit > 0 else SECTION_KEYS
    for case in cases:
        _log(f"Running {case.case_id} - {case.name}")
        publications = _build_publication_rows(case)
        metrics_payload = _build_metrics_payload(case, publications)
        case_summary = _build_case_summary(case, publications)
        results: list[dict[str, Any]] = []
        for section_key in section_keys:
            _log(f"  generating {section_key}")
            results.append(_run_case_section(case, metrics_payload, section_key))
        _log(f"  critiquing {case.case_id}")
        analysis_by_key = _analyze_case_outputs(case_summary, results)
        for result in results:
            result["analysis"] = analysis_by_key.get(result["section_key"]) or _fallback_section_analysis(result)
        cases_payload.append(
            {
                "case_id": case.case_id,
                "name": case.name,
                "theme": case.theme,
                "summary": case_summary,
                "publication_count": len(publications),
                "publications": publications,
                "results": results,
            }
        )
    artifact = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "generation_model": GENERATION_MODEL,
        "critique_model": CRITIQUE_MODEL,
        "as_of_date": AS_OF_DATE.isoformat(),
        "cases": cases_payload,
    }
    ARTIFACT_PATH.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    _write_report(artifact)
    _log(f"Wrote report to {REPORT_PATH}")


if __name__ == "__main__":
    main()

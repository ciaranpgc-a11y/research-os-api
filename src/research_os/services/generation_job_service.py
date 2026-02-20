from __future__ import annotations

import threading
from datetime import datetime, timezone

from research_os.db import (
    GenerationJob,
    Manuscript,
    Project,
    create_all_tables,
    get_session_factory,
)
from research_os.services.manuscript_service import draft_section_from_notes
from research_os.services.project_service import (
    DEFAULT_SECTIONS,
    ManuscriptNotFoundError,
    ProjectNotFoundError,
)


class GenerationJobNotFoundError(RuntimeError):
    """Raised when a generation job cannot be located."""


DEFAULT_GENERATION_MODEL = "gpt-4.1-mini"
_MODEL_PRICING_USD_PER_1M = {
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
}
_DEFAULT_PRICING_USD_PER_1M = {"input": 0.40, "output": 1.60}
_PROMPT_OVERHEAD_TOKENS = 90
_MIN_NOTES_TOKENS = 24
_SECTION_OUTPUT_TOKEN_RANGES = {
    "title": (12, 32),
    "abstract": (120, 280),
    "introduction": (180, 420),
    "methods": (220, 520),
    "results": (180, 420),
    "discussion": (220, 520),
    "conclusion": (70, 180),
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_sections(
    sections: list[str] | None, existing_sections: dict[str, str]
) -> list[str]:
    source = sections if sections else list(existing_sections.keys())
    if not source:
        source = list(DEFAULT_SECTIONS)
    resolved: list[str] = []
    seen: set[str] = set()
    for section_name in source:
        normalized = section_name.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        resolved.append(normalized)
    return resolved


def _mark_job_failed(job: GenerationJob, detail: str) -> None:
    job.status = "failed"
    job.error_detail = detail
    job.current_section = None
    job.completed_at = _utcnow()


def _estimate_notes_tokens(notes_context: str) -> int:
    estimated = int(len(notes_context) / 4)
    return max(estimated, _MIN_NOTES_TOKENS)


def estimate_generation_cost(
    *,
    sections: list[str] | None,
    notes_context: str,
    model: str = DEFAULT_GENERATION_MODEL,
) -> dict[str, object]:
    normalized_sections = _resolve_sections(sections, {})
    if not normalized_sections:
        normalized_sections = list(DEFAULT_SECTIONS)

    pricing = _MODEL_PRICING_USD_PER_1M.get(model, _DEFAULT_PRICING_USD_PER_1M)
    notes_tokens = _estimate_notes_tokens(notes_context)
    input_tokens_per_section = notes_tokens + _PROMPT_OVERHEAD_TOKENS
    estimated_input_tokens = input_tokens_per_section * len(normalized_sections)

    output_low = 0
    output_high = 0
    for section_name in normalized_sections:
        low, high = _SECTION_OUTPUT_TOKEN_RANGES.get(section_name, (160, 380))
        output_low += low
        output_high += high

    estimated_cost_usd_low = (
        (estimated_input_tokens / 1_000_000) * pricing["input"]
        + (output_low / 1_000_000) * pricing["output"]
    )
    estimated_cost_usd_high = (
        (estimated_input_tokens / 1_000_000) * pricing["input"]
        + (output_high / 1_000_000) * pricing["output"]
    )
    return {
        "pricing_model": model,
        "estimated_input_tokens": estimated_input_tokens,
        "estimated_output_tokens_low": output_low,
        "estimated_output_tokens_high": output_high,
        "estimated_cost_usd_low": round(estimated_cost_usd_low, 6),
        "estimated_cost_usd_high": round(estimated_cost_usd_high, 6),
    }


def serialize_generation_job(job: GenerationJob) -> dict[str, object]:
    estimate = estimate_generation_cost(
        sections=list(job.sections or []),
        notes_context=job.notes_context or "",
        model=DEFAULT_GENERATION_MODEL,
    )
    return {
        "id": job.id,
        "project_id": job.project_id,
        "manuscript_id": job.manuscript_id,
        "status": job.status,
        "sections": list(job.sections or []),
        "notes_context": job.notes_context,
        "progress_percent": job.progress_percent,
        "current_section": job.current_section,
        "error_detail": job.error_detail,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        **estimate,
    }


def _run_generation_job(job_id: str) -> None:
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        job = session.get(GenerationJob, job_id)
        if job is None:
            return
        manuscript = session.get(Manuscript, job.manuscript_id)
        if manuscript is None or manuscript.project_id != job.project_id:
            _mark_job_failed(
                job,
                (
                    f"Manuscript '{job.manuscript_id}' was not found for project "
                    f"'{job.project_id}'."
                ),
            )
            session.commit()
            return

        sections = list(job.sections or [])
        if not sections:
            sections = _resolve_sections(None, manuscript.sections or {})
            job.sections = sections

        job.status = "running"
        job.error_detail = None
        job.started_at = _utcnow()
        job.completed_at = None
        job.current_section = None
        job.progress_percent = 0
        manuscript.status = "generating"
        session.commit()

        total_sections = len(sections)
        manuscript_sections = dict(manuscript.sections or {})
        for index, section_name in enumerate(sections, start=1):
            job.current_section = section_name
            session.commit()

            section_draft = draft_section_from_notes(
                section_name, job.notes_context or ""
            )
            manuscript_sections[section_name] = section_draft
            manuscript.sections = manuscript_sections

            job.progress_percent = int((index / total_sections) * 100)
            session.commit()

        job.status = "completed"
        job.current_section = None
        job.progress_percent = 100
        job.completed_at = _utcnow()
        manuscript.status = "draft"
        session.commit()
    except Exception as exc:
        session.rollback()
        job = session.get(GenerationJob, job_id)
        if job is not None:
            _mark_job_failed(job, str(exc))
            manuscript = session.get(Manuscript, job.manuscript_id)
            if manuscript is not None:
                manuscript.status = "draft"
            session.commit()
    finally:
        session.close()


def _start_generation_thread(job_id: str) -> None:
    thread = threading.Thread(
        target=_run_generation_job,
        args=(job_id,),
        daemon=True,
        name=f"generation-job-{job_id[:8]}",
    )
    thread.start()


def enqueue_generation_job(
    *,
    project_id: str,
    manuscript_id: str,
    sections: list[str] | None,
    notes_context: str,
) -> GenerationJob:
    create_all_tables()
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                f"Manuscript '{manuscript_id}' was not found for project '{project_id}'."
            )

        resolved_sections = _resolve_sections(sections, manuscript.sections or {})
        job = GenerationJob(
            project_id=project_id,
            manuscript_id=manuscript_id,
            status="queued",
            sections=resolved_sections,
            notes_context=notes_context.strip(),
            progress_percent=0,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        session.expunge(job)
    finally:
        session.close()

    _start_generation_thread(job.id)
    return job


def get_generation_job_record(job_id: str) -> GenerationJob:
    create_all_tables()
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        job = session.get(GenerationJob, job_id)
        if job is None:
            raise GenerationJobNotFoundError(f"Generation job '{job_id}' was not found.")
        session.expunge(job)
        return job
    finally:
        session.close()

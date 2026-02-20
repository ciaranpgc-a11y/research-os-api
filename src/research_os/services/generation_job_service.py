from __future__ import annotations

import threading
from datetime import date, datetime, timezone

from sqlalchemy import select

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


class GenerationJobConflictError(RuntimeError):
    """Raised when another generation job is already active for a manuscript."""


class GenerationBudgetExceededError(RuntimeError):
    """Raised when a per-job estimated-cost cap is exceeded."""


class GenerationDailyBudgetExceededError(RuntimeError):
    """Raised when a project daily budget cap would be exceeded."""


class GenerationJobStateError(RuntimeError):
    """Raised when a generation job cannot transition from current state."""


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
_ACTIVE_JOB_STATUSES = ("queued", "running", "cancel_requested")
_DAILY_BUDGET_STATUSES = ("queued", "running", "cancel_requested", "completed", "failed")
_RETRYABLE_STATUSES = ("failed", "cancelled")
_TERMINAL_STATUSES = ("completed", "failed", "cancelled")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc_date(timestamp: datetime) -> date:
    if timestamp.tzinfo is None:
        return timestamp.date()
    return timestamp.astimezone(timezone.utc).date()


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
    job.cancel_requested = False


def _mark_job_cancelled(job: GenerationJob) -> None:
    job.status = "cancelled"
    job.current_section = None
    job.completed_at = _utcnow()
    job.cancel_requested = False
    job.error_detail = None


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


def _project_daily_estimated_spend_high(session, project_id: str, today_utc: date) -> float:
    jobs = session.scalars(
        select(GenerationJob).where(
            GenerationJob.project_id == project_id,
            GenerationJob.status.in_(_DAILY_BUDGET_STATUSES),
        )
    ).all()
    total = 0.0
    for job in jobs:
        if _coerce_utc_date(job.created_at) != today_utc:
            continue
        total += float(job.estimated_cost_usd_high or 0.0)
    return round(total, 6)


def _validate_enqueue_guardrails(
    *,
    session,
    manuscript_id: str,
    project_id: str,
    estimate_high_cost_usd: float,
    max_estimated_cost_usd: float | None,
    project_daily_budget_usd: float | None,
) -> None:
    if (
        max_estimated_cost_usd is not None
        and estimate_high_cost_usd > max_estimated_cost_usd
    ):
        raise GenerationBudgetExceededError(
            (
                "Estimated generation cost exceeds the per-job cap "
                f"({estimate_high_cost_usd:.4f} > {max_estimated_cost_usd:.4f} USD)."
            )
        )

    if project_daily_budget_usd is not None:
        today_utc = _utcnow().date()
        spend_so_far = _project_daily_estimated_spend_high(
            session, project_id, today_utc
        )
        projected_total = spend_so_far + estimate_high_cost_usd
        if projected_total > project_daily_budget_usd:
            raise GenerationDailyBudgetExceededError(
                (
                    "Estimated generation cost would exceed project daily budget "
                    f"({projected_total:.4f} > {project_daily_budget_usd:.4f} USD)."
                )
            )

    active_job = session.scalars(
        select(GenerationJob).where(
            GenerationJob.manuscript_id == manuscript_id,
            GenerationJob.status.in_(_ACTIVE_JOB_STATUSES),
        )
    ).first()
    if active_job is not None:
        raise GenerationJobConflictError(
            (
                "Another generation job is already active for this manuscript "
                f"(job_id={active_job.id})."
            )
        )


def serialize_generation_job(job: GenerationJob) -> dict[str, object]:
    return {
        "id": job.id,
        "project_id": job.project_id,
        "manuscript_id": job.manuscript_id,
        "status": job.status,
        "cancel_requested": bool(job.cancel_requested),
        "run_count": int(job.run_count),
        "parent_job_id": job.parent_job_id,
        "sections": list(job.sections or []),
        "notes_context": job.notes_context,
        "progress_percent": job.progress_percent,
        "current_section": job.current_section,
        "error_detail": job.error_detail,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "pricing_model": job.pricing_model,
        "estimated_input_tokens": job.estimated_input_tokens,
        "estimated_output_tokens_low": job.estimated_output_tokens_low,
        "estimated_output_tokens_high": job.estimated_output_tokens_high,
        "estimated_cost_usd_low": float(job.estimated_cost_usd_low or 0.0),
        "estimated_cost_usd_high": float(job.estimated_cost_usd_high or 0.0),
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

        if job.status != "queued":
            return
        if job.cancel_requested:
            _mark_job_cancelled(job)
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
            session.refresh(job)
            if job.cancel_requested:
                _mark_job_cancelled(job)
                manuscript.status = "draft"
                session.commit()
                return

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
        job.cancel_requested = False
        manuscript.status = "draft"
        session.commit()
    except Exception as exc:
        session.rollback()
        job = session.get(GenerationJob, job_id)
        if job is not None:
            if job.cancel_requested:
                _mark_job_cancelled(job)
            else:
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
    max_estimated_cost_usd: float | None = None,
    project_daily_budget_usd: float | None = None,
    parent_job_id: str | None = None,
    run_count: int = 1,
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
        normalized_notes_context = notes_context.strip()
        estimate = estimate_generation_cost(
            sections=resolved_sections,
            notes_context=normalized_notes_context,
            model=DEFAULT_GENERATION_MODEL,
        )
        estimate_high_cost_usd = float(estimate["estimated_cost_usd_high"])
        _validate_enqueue_guardrails(
            session=session,
            manuscript_id=manuscript_id,
            project_id=project_id,
            estimate_high_cost_usd=estimate_high_cost_usd,
            max_estimated_cost_usd=max_estimated_cost_usd,
            project_daily_budget_usd=project_daily_budget_usd,
        )

        job = GenerationJob(
            project_id=project_id,
            manuscript_id=manuscript_id,
            status="queued",
            cancel_requested=False,
            run_count=max(1, run_count),
            parent_job_id=parent_job_id,
            sections=resolved_sections,
            notes_context=normalized_notes_context,
            pricing_model=str(estimate["pricing_model"]),
            estimated_input_tokens=int(estimate["estimated_input_tokens"]),
            estimated_output_tokens_low=int(estimate["estimated_output_tokens_low"]),
            estimated_output_tokens_high=int(estimate["estimated_output_tokens_high"]),
            estimated_cost_usd_low=float(estimate["estimated_cost_usd_low"]),
            estimated_cost_usd_high=float(estimate["estimated_cost_usd_high"]),
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


def list_generation_jobs_for_manuscript(
    project_id: str, manuscript_id: str, *, limit: int = 20
) -> list[GenerationJob]:
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

        normalized_limit = max(1, min(limit, 100))
        jobs = session.scalars(
            select(GenerationJob)
            .where(
                GenerationJob.project_id == project_id,
                GenerationJob.manuscript_id == manuscript_id,
            )
            .order_by(GenerationJob.created_at.desc())
            .limit(normalized_limit)
        ).all()
        for job in jobs:
            session.expunge(job)
        return jobs
    finally:
        session.close()


def cancel_generation_job(job_id: str) -> GenerationJob:
    create_all_tables()
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        job = session.get(GenerationJob, job_id)
        if job is None:
            raise GenerationJobNotFoundError(f"Generation job '{job_id}' was not found.")

        if job.status in _TERMINAL_STATUSES:
            session.expunge(job)
            return job

        if job.status == "queued":
            _mark_job_cancelled(job)
        elif job.status in {"running", "cancel_requested"}:
            job.status = "cancel_requested"
            job.cancel_requested = True
        else:
            raise GenerationJobStateError(
                f"Generation job '{job_id}' cannot be cancelled from status '{job.status}'."
            )

        session.commit()
        session.refresh(job)
        session.expunge(job)
        return job
    finally:
        session.close()


def retry_generation_job(
    job_id: str,
    *,
    max_estimated_cost_usd: float | None = None,
    project_daily_budget_usd: float | None = None,
) -> GenerationJob:
    source_job = get_generation_job_record(job_id)
    if source_job.status not in _RETRYABLE_STATUSES:
        raise GenerationJobStateError(
            (
                f"Generation job '{job_id}' cannot be retried from status "
                f"'{source_job.status}'."
            )
        )

    return enqueue_generation_job(
        project_id=source_job.project_id,
        manuscript_id=source_job.manuscript_id,
        sections=list(source_job.sections or []),
        notes_context=source_job.notes_context,
        max_estimated_cost_usd=max_estimated_cost_usd,
        project_daily_budget_usd=project_daily_budget_usd,
        parent_job_id=source_job.id,
        run_count=int(source_job.run_count) + 1,
    )

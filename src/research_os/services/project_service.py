from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import (
    Manuscript,
    ManuscriptSnapshot,
    Project,
    create_all_tables,
    session_scope,
)

DEFAULT_SECTIONS = (
    "title",
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
)


class ProjectNotFoundError(RuntimeError):
    """Raised when a project cannot be located."""


class ManuscriptBranchConflictError(RuntimeError):
    """Raised when a manuscript branch already exists for a project."""


class ManuscriptNotFoundError(RuntimeError):
    """Raised when a manuscript cannot be located for the given project."""


class ManuscriptSnapshotNotFoundError(RuntimeError):
    """Raised when a snapshot cannot be located for the given manuscript."""


def _utc_timestamp_label() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    return f"Snapshot {timestamp}"


def _materialize_sections(section_names: list[str] | None) -> dict[str, str]:
    names = section_names if section_names else list(DEFAULT_SECTIONS)
    return {name.strip(): "" for name in names if name.strip()}


def _normalize_section_updates(sections: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for section_name, content in sections.items():
        key = section_name.strip()
        if not key:
            continue
        normalized[key] = content
    return normalized


def _select_snapshot_sections(
    sections: dict[str, str], include_sections: list[str] | None
) -> dict[str, str]:
    if not include_sections:
        return dict(sections)
    selected: dict[str, str] = {}
    for section_name in include_sections:
        key = section_name.strip()
        if not key:
            continue
        if key in sections:
            selected[key] = sections[key]
    return selected


def create_project_record(
    *,
    title: str,
    target_journal: str,
    journal_voice: str | None = None,
    language: str = "en-GB",
    study_type: str | None = None,
    study_brief: str | None = None,
) -> Project:
    create_all_tables()
    with session_scope() as session:
        project = Project(
            title=title,
            target_journal=target_journal,
            journal_voice=journal_voice,
            language=language,
            study_type=study_type,
            study_brief=study_brief,
        )
        session.add(project)
        session.flush()
        session.refresh(project)
        session.expunge(project)
        return project


def list_project_records() -> list[Project]:
    create_all_tables()
    with session_scope() as session:
        projects = session.scalars(
            select(Project).order_by(Project.updated_at.desc())
        ).all()
        for project in projects:
            session.expunge(project)
        return projects


def create_manuscript_for_project(
    *,
    project_id: str,
    branch_name: str = "main",
    sections: list[str] | None = None,
) -> Manuscript:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        try:
            manuscript = Manuscript(
                project_id=project.id,
                branch_name=branch_name,
                sections=_materialize_sections(sections),
            )
            session.add(manuscript)
            session.flush()
            session.refresh(manuscript)
            session.expunge(manuscript)
            return manuscript
        except IntegrityError as exc:
            raise ManuscriptBranchConflictError(
                f"Branch '{branch_name}' already exists for project '{project_id}'."
            ) from exc


def list_project_manuscripts(project_id: str) -> list[Manuscript]:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscripts = session.scalars(
            select(Manuscript)
            .where(Manuscript.project_id == project_id)
            .order_by(Manuscript.updated_at.desc())
        ).all()
        for manuscript in manuscripts:
            session.expunge(manuscript)
        return manuscripts


def get_project_manuscript(project_id: str, manuscript_id: str) -> Manuscript:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                f"Manuscript '{manuscript_id}' was not found for project '{project_id}'."
            )
        session.expunge(manuscript)
        return manuscript


def update_project_manuscript_sections(
    *,
    project_id: str,
    manuscript_id: str,
    sections: dict[str, str],
) -> Manuscript:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                f"Manuscript '{manuscript_id}' was not found for project '{project_id}'."
            )
        current_sections = dict(manuscript.sections or {})
        current_sections.update(_normalize_section_updates(sections))
        manuscript.sections = current_sections
        session.flush()
        session.refresh(manuscript)
        session.expunge(manuscript)
        return manuscript


def create_manuscript_snapshot(
    *,
    project_id: str,
    manuscript_id: str,
    label: str | None = None,
    include_sections: list[str] | None = None,
) -> ManuscriptSnapshot:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                (
                    f"Manuscript '{manuscript_id}' was not found for project "
                    f"'{project_id}'."
                )
            )

        manuscript_sections = dict(manuscript.sections or {})
        snapshot_sections = _select_snapshot_sections(
            manuscript_sections, include_sections
        )
        normalized_label = (label or "").strip() or _utc_timestamp_label()
        snapshot = ManuscriptSnapshot(
            project_id=project_id,
            manuscript_id=manuscript_id,
            label=normalized_label,
            sections=snapshot_sections,
        )
        session.add(snapshot)
        session.flush()
        session.refresh(snapshot)
        session.expunge(snapshot)
        return snapshot


def list_manuscript_snapshots(
    project_id: str, manuscript_id: str, *, limit: int = 20
) -> list[ManuscriptSnapshot]:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                (
                    f"Manuscript '{manuscript_id}' was not found for project "
                    f"'{project_id}'."
                )
            )
        normalized_limit = max(1, min(limit, 100))
        snapshots = session.scalars(
            select(ManuscriptSnapshot)
            .where(
                ManuscriptSnapshot.project_id == project_id,
                ManuscriptSnapshot.manuscript_id == manuscript_id,
            )
            .order_by(ManuscriptSnapshot.created_at.desc())
            .limit(normalized_limit)
        ).all()
        for snapshot in snapshots:
            session.expunge(snapshot)
        return snapshots


def restore_manuscript_snapshot(
    *,
    project_id: str,
    manuscript_id: str,
    snapshot_id: str,
) -> Manuscript:
    create_all_tables()
    with session_scope() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise ProjectNotFoundError(f"Project '{project_id}' was not found.")
        manuscript = session.get(Manuscript, manuscript_id)
        if manuscript is None or manuscript.project_id != project_id:
            raise ManuscriptNotFoundError(
                (
                    f"Manuscript '{manuscript_id}' was not found for project "
                    f"'{project_id}'."
                )
            )

        snapshot = session.get(ManuscriptSnapshot, snapshot_id)
        if snapshot is None:
            raise ManuscriptSnapshotNotFoundError(
                f"Snapshot '{snapshot_id}' was not found."
            )
        if (
            snapshot.project_id != project_id
            or snapshot.manuscript_id != manuscript_id
        ):
            raise ManuscriptSnapshotNotFoundError(
                (
                    f"Snapshot '{snapshot_id}' was not found for manuscript "
                    f"'{manuscript_id}'."
                )
            )

        manuscript.sections = dict(snapshot.sections or {})
        manuscript.status = "draft"
        session.flush()
        session.refresh(manuscript)
        session.expunge(manuscript)
        return manuscript

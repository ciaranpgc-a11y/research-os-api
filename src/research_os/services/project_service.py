from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import Manuscript, Project, create_all_tables, session_scope

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


def _materialize_sections(section_names: list[str] | None) -> dict[str, str]:
    names = section_names if section_names else list(DEFAULT_SECTIONS)
    return {name.strip(): "" for name in names if name.strip()}


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

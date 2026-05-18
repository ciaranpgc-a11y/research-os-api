"""Extract study recruitment model."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractStudyRecruitment(Base):
    __tablename__ = "extract_study_recruitment"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    hn: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    patient_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("extract_patients.id"), nullable=True
    )
    eligible_for_study: Mapped[int] = mapped_column(Integer, default=0)
    cohort: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    recruitment_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_identified: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_first_contact: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_pis_sent: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_consent: Mapped[str | None] = mapped_column(Text, nullable=True)
    cpex_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_to_email: Mapped[int] = mapped_column(Integer, default=0)
    pis_sent: Mapped[int] = mapped_column(Integer, default=0)
    consent_obtained: Mapped[int] = mapped_column(Integer, default=0)
    cpex_required: Mapped[int] = mapped_column(Integer, default=0)
    cpex_booked: Mapped[int] = mapped_column(Integer, default=0)
    cpex_completed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    status: Mapped[str] = mapped_column(Text, default="Pending")
    cpex_scheduled: Mapped[int] = mapped_column(Integer, default=0)
    cmr_required: Mapped[int] = mapped_column(Integer, default=0)
    cmr_requested: Mapped[int] = mapped_column(Integer, default=0)
    cmr_scheduled: Mapped[int] = mapped_column(Integer, default=0)
    cmr_completed: Mapped[int] = mapped_column(Integer, default=0)
    rhc_required: Mapped[int] = mapped_column(Integer, default=0)
    rhc_requested: Mapped[int] = mapped_column(Integer, default=0)
    rhc_scheduled: Mapped[int] = mapped_column(Integer, default=0)
    rhc_completed: Mapped[int] = mapped_column(Integer, default=0)
    echo_required: Mapped[int] = mapped_column(Integer, default=0)
    echo_requested: Mapped[int] = mapped_column(Integer, default=0)
    echo_scheduled: Mapped[int] = mapped_column(Integer, default=0)
    echo_completed: Mapped[int] = mapped_column(Integer, default=0)
    cpex_appropriate: Mapped[int] = mapped_column(Integer, default=0)
    cmr_appropriate: Mapped[int] = mapped_column(Integer, default=0)
    rhc_appropriate: Mapped[int] = mapped_column(Integer, default=0)
    echo_appropriate: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    inx_rhc: Mapped[str | None] = mapped_column(Text, nullable=True)
    inx_echo: Mapped[str | None] = mapped_column(Text, nullable=True)
    inx_cmr: Mapped[str | None] = mapped_column(Text, nullable=True)
    inx_cpex: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExtractRecruitmentNote(Base):
    __tablename__ = "extract_recruitment_notes"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    hn: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    author_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_access_code_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    note_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

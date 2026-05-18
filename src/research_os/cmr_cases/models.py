"""CMR case persistence models."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CmrCaseRecord(Base):
    __tablename__ = "cmr_cases"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    access_code_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("cmr_access_codes.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), default="Untitled report")
    patient_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    report_tag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    study_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    last_completed_step: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

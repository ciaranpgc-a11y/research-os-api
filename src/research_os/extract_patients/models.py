"""Extract patients model."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractPatient(Base):
    __tablename__ = "extract_patients"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    hn: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    dob: Mapped[str | None] = mapped_column(Text, nullable=True)
    gender: Mapped[str | None] = mapped_column(Text, nullable=True)
    anonymisation_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    images_uploaded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rip_tag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    action_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tracking_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    study_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

"""Extract study entry questionnaire persistence model."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractQuestionnaire(Base):
    __tablename__ = "extract_questionnaire"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    hn: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

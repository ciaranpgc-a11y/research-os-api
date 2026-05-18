"""Uploaded source files for Extract investigation records."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Integer, LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractSourceFile(Base):
    __tablename__ = "extract_source_files"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    modality: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    hn: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    record_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    source_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    linked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

"""Extract standalone tracking model."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from research_os.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ExtractTrackingEntry(Base):
    __tablename__ = "extract_tracking_entries"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    hn: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ExtractBookingEntry(Base):
    __tablename__ = "extract_booking_entries"

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    hn: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    investigation: Mapped[str] = mapped_column(Text, nullable=False)
    booking_date: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    booking_time: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

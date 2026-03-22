"""CMR access control models — fully separate from Axiomos auth."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from research_os.db import Base

def _utcnow() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc)


class CmrAccessCode(Base):
    __tablename__ = "cmr_access_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(255))
    code_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    session_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    sessions: Mapped[list["CmrSession"]] = relationship(
        back_populates="access_code", cascade="all, delete-orphan"
    )


class CmrSession(Base):
    __tablename__ = "cmr_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    access_code_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("cmr_access_codes.id", ondelete="CASCADE"),
        index=True,
    )
    session_token: Mapped[str] = mapped_column(
        String(128), unique=True, index=True
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    access_code: Mapped[CmrAccessCode] = relationship(back_populates="sessions")

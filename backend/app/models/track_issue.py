from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TrackInspectionCase(Base):
    """One field-maintenance job created from one AI inspection run."""

    __tablename__ = "track_inspection_cases"
    __table_args__ = (
        UniqueConstraint("inspection_id", name="uq_track_inspection_case_inspection"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)

    assigned_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(30), default="OPEN", server_default="OPEN", nullable=False, index=True)
    ai_overall_priority: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    ai_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    media_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verifying_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    blocked_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completion_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False, index=True
    )

    assigned_staff = relationship("Staff", foreign_keys=[assigned_staff_id])
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    issues = relationship(
        "TrackIssue",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="TrackIssue.distance_from_start_miles, TrackIssue.created_at",
    )
    activities = relationship(
        "TrackCaseActivity",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="TrackCaseActivity.created_at",
    )


class TrackIssue(Base):
    """Checklist item for one AI defect event within an inspection case."""

    __tablename__ = "track_issues"
    __table_args__ = (
        UniqueConstraint("case_id", "inspection_event_id", name="uq_track_issue_case_event"),
        Index("ix_track_issues_location", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("track_inspection_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inspection_event_id: Mapped[str] = mapped_column(String(64), nullable=False)

    defect_type: Mapped[str] = mapped_column(String(120), nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rail_side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_from_start_miles: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="AI inspection distance from inspection origin in miles",
    )

    ai_priority: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    ai_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    media_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    field_verification_status: Mapped[str] = mapped_column(
        String(30), default="NOT_CHECKED", server_default="NOT_CHECKED", nullable=False, index=True
    )
    field_verification_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    field_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    field_verified_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    maintenance_status: Mapped[str] = mapped_column(
        String(30), default="PENDING", server_default="PENDING", nullable=False, index=True
    )
    maintenance_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    repair_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    repair_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    last_location_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_location_distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_location_proximity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    location_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False, index=True
    )

    case = relationship("TrackInspectionCase", back_populates="issues")
    field_verified_by_staff = relationship("Staff", foreign_keys=[field_verified_by_staff_id])
    activities = relationship("TrackCaseActivity", back_populates="issue")


class TrackCaseActivity(Base):
    """Append-only case conversation/audit trail; may optionally target one checklist issue."""

    __tablename__ = "track_case_activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("track_inspection_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    issue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("track_issues.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff.id", ondelete="SET NULL"), nullable=True
    )

    activity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    message_kind: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_to_issue_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    proximity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    extra_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    parent_activity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("track_case_activities.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    case = relationship("TrackInspectionCase", back_populates="activities")
    issue = relationship("TrackIssue", back_populates="activities")
    actor_user = relationship("User", foreign_keys=[actor_user_id])
    actor_staff = relationship("Staff", foreign_keys=[actor_staff_id])
    parent_activity = relationship("TrackCaseActivity", remote_side=[id])

# Backward-compatible Python import name used by the existing models/__init__.py.
# The workflow/API now uses TrackCaseActivity directly.
TrackIssueActivity = TrackCaseActivity

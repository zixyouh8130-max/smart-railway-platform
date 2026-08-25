from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


class TrackIssue(Base):
    """Maintenance work item created from one AI inspection event."""

    __tablename__ = "track_issues"
    __table_args__ = (
        UniqueConstraint(
            "inspection_id",
            "inspection_event_id",
            name="uq_track_issue_inspection_event",
        ),
        Index("ix_track_issues_location", "latitude", "longitude"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    inspection_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    inspection_event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

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

    status: Mapped[str] = mapped_column(
        String(30),
        default="OPEN",
        nullable=False,
        index=True,
    )

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

    last_location_checked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_location_distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_location_proximity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    location_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    resolution_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    assigned_staff = relationship("Staff", foreign_keys=[assigned_staff_id])
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    activities = relationship(
        "TrackIssueActivity",
        back_populates="issue",
        cascade="all, delete-orphan",
        order_by="TrackIssueActivity.created_at",
    )


class TrackIssueActivity(Base):
    """Append-only audit/comment stream for a track issue."""

    __tablename__ = "track_issue_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("track_issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    activity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
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
        ForeignKey("track_issue_activities.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    issue = relationship("TrackIssue", back_populates="activities")
    actor_user = relationship("User", foreign_keys=[actor_user_id])
    actor_staff = relationship("Staff", foreign_keys=[actor_staff_id])
    parent_activity = relationship("TrackIssueActivity", remote_side=[id])

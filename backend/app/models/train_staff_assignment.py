# models/train_staff_assignment.py
from enum import Enum
import uuid
from typing import Optional
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base


class AssignmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class TrainStaffAssignment(Base):
    """Assigns staff members to specific trains and schedules"""
    __tablename__ = "train_staff_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Staff member
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="CASCADE"),
        nullable=False
    )

    # Train assignment
    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id", ondelete="CASCADE"),
        nullable=False
    )

    # Schedule assignment
    schedule_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("schedules.id", ondelete="SET NULL"),
        nullable=True
    )

    # Assignment details
    role_on_train: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # e.g., "DRIVER", "GUARD", "TICKET_CHECKER"

    assignment_date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    # Route segment (if assigned only for part of route)
    from_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stations.id"),
        nullable=True
    )

    to_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stations.id"),
        nullable=True
    )

    # Status
    status: Mapped[AssignmentStatus] = mapped_column(
        SQLEnum(AssignmentStatus),
        default=AssignmentStatus.SCHEDULED,
        nullable=False
    )

    # Notes
    remarks: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    # Relationships
    staff = relationship("Staff", back_populates="train_assignments")
    train = relationship("Train")
    schedule = relationship(
        "Schedule",
        back_populates="staff_assignments"
    )
    from_station = relationship("Station", foreign_keys=[from_station_id])
    to_station = relationship("Station", foreign_keys=[to_station_id])
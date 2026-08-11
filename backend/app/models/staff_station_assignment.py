# models/staff_station_assignment.py
from enum import Enum
import uuid
from typing import Optional
from datetime import datetime
from sqlalchemy import String, DateTime, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base


class StationAssignmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class StaffStationAssignment(Base):
    """Assigns staff members to specific stations"""
    __tablename__ = "staff_station_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="CASCADE"),
        nullable=False
    )

    station_id: Mapped[int] = mapped_column(
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False
    )

    role_at_station: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # e.g., "STATION_MASTER", "TICKET_COUNTER"

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

    status: Mapped[StationAssignmentStatus] = mapped_column(
        SQLEnum(StationAssignmentStatus),
        default=StationAssignmentStatus.SCHEDULED,
        nullable=False
    )

    remarks: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

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
    staff = relationship("Staff", back_populates="station_assignments")
    station = relationship("Station")
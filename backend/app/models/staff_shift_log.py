# models/staff_shift_log.py
import uuid
from typing import Optional
from datetime import datetime
from sqlalchemy import String, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base


class StaffShiftLog(Base):
    """Tracks staff shift activities and location during work hours"""
    __tablename__ = "staff_shift_logs"

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

    # Current assignment tracking
    train_assignment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("train_staff_assignments.id"),
        nullable=True
    )

    station_assignment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_station_assignments.id"),
        nullable=True
    )

    # Location tracking
    latitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    longitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    # Activity details
    activity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )  # e.g., "CHECK_IN", "CHECK_OUT", "LOCATION_UPDATE", "TASK_START", "TASK_END"

    description: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    # Timestamp
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    # Relationships
    staff = relationship("Staff", back_populates="shift_logs")
    train_assignment = relationship("TrainStaffAssignment")
    station_assignment = relationship("StaffStationAssignment")
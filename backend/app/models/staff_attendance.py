# models/staff_attendance.py
from enum import Enum
import uuid
from typing import Optional
from datetime import datetime, time
from sqlalchemy import String, DateTime, Time, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base


class AttendanceType(str, Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"
    HALF_DAY = "HALF_DAY"
    ON_LEAVE = "ON_LEAVE"


class StaffAttendance(Base):
    """Tracks staff attendance"""
    __tablename__ = "staff_attendance"

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

    date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    check_in_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    check_out_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    attendance_type: Mapped[AttendanceType] = mapped_column(
        SQLEnum(AttendanceType),
        default=AttendanceType.PRESENT,
        nullable=False
    )

    location_check_in: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )  # GPS coordinates or station name

    location_check_out: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True
    )

    device_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )  # Device used for check-in

    remarks: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    # Relationships
    staff = relationship("Staff", back_populates="attendance_logs")
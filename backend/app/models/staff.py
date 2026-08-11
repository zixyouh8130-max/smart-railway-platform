# models/staff.py
from enum import Enum
import uuid
from typing import Optional, List
from sqlalchemy import String, Boolean, Enum as SQLEnum, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..core.database import Base
from datetime import datetime


class StaffRole(str, Enum):
    """Staff roles specific to railway operations"""
    TRAIN_DRIVER = "TRAIN_DRIVER"  # ရထားမောင်းသူ
    ASSISTANT_DRIVER = "ASSISTANT_DRIVER"  # လက်ထောက်ရထားမောင်းသူ
    TRAIN_GUARD = "TRAIN_GUARD"  # ရထားစောင့်
    TICKET_CHECKER = "TICKET_CHECKER"  # လက်မှတ်စစ်ဆေးသူ
    STATION_MASTER = "STATION_MASTER"  # ဘူတာရုံမှူး
    STATION_STAFF = "STATION_STAFF"  # ဘူတာရုံဝန်ထမ်း
    DISPATCHER = "DISPATCHER"  # ရထားထိန်းချုပ်ရေးဝန်ထမ်း
    MAINTENANCE = "MAINTENANCE"  # ပြုပြင်ထိန်းသိမ်းရေးဝန်ထမ်း
    INSPECTOR = "INSPECTOR"  # စစ်ဆေးရေးမှူး


class StaffStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ON_DUTY = "ON_DUTY"
    OFF_DUTY = "OFF_DUTY"
    ON_LEAVE = "ON_LEAVE"
    INACTIVE = "INACTIVE"


class Staff(Base):
    """Staff model for railway employees"""
    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Link to user account
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )

    # Staff identification
    staff_id: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False
    )

    # Staff details
    role: Mapped[StaffRole] = mapped_column(
        SQLEnum(StaffRole),
        nullable=False
    )

    # Contact information
    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )

    emergency_contact: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )

    # Work details
    department: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    joining_date: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    # License and certifications
    license_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    license_expiry_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    certification_details: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    # Work status
    status: Mapped[StaffStatus] = mapped_column(
        SQLEnum(StaffStatus),
        default=StaffStatus.ACTIVE,
        nullable=False
    )

    is_available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    # Shift tracking
    current_shift_start: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    current_shift_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    # Administrative
    supervisor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id"),
        nullable=True
    )

    notes: Mapped[Optional[str]] = mapped_column(
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
    user = relationship("User", back_populates="staff_profile")
    supervisor = relationship("Staff", remote_side=[id], backref="subordinates")
    train_assignments = relationship("TrainStaffAssignment", back_populates="staff")
    station_assignments = relationship("StaffStationAssignment", back_populates="staff")
    attendance_logs = relationship("StaffAttendance", back_populates="staff")
    shift_logs = relationship("StaffShiftLog", back_populates="staff")

    def __repr__(self):
        return f"<Staff {self.staff_id} - {self.role.value}>"
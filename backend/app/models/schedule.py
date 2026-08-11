from datetime import date, time, datetime
from sqlalchemy import ForeignKey, String, Date, Time, DateTime, Boolean, func
from sqlalchemy.orm import relationship, mapped_column, Mapped
from typing import Optional, List
from ..core.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True)

    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id"),
        nullable=False
    )

    route_id: Mapped[int] = mapped_column(
        ForeignKey("routes.id"),
        nullable=False
    )

    departure_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )

    departure_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    arrival_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    # NEW: Indicates if the schedule arrives on the next day
    is_overnight: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )

    # NEW: Actual arrival date (could be different from departure_date for overnight)
    arrival_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="SCHEDULED",
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationships
    train = relationship("Train", back_populates="schedules")
    route = relationship("Route", back_populates="schedules")

    # 🆕 Staff assignments relationship
    staff_assignments = relationship(
        "TrainStaffAssignment",
        back_populates="schedule",
        cascade="all, delete-orphan",
        lazy="select"
    )
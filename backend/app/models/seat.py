# backend/models/seat.py (add to existing)
from datetime import datetime
from sqlalchemy import ForeignKey, String, Integer, Boolean, DateTime, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
from ..core.database import Base


class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[int] = mapped_column(primary_key=True)

    coach_id: Mapped[int] = mapped_column(
        ForeignKey("coaches.id", ondelete="CASCADE"),
        nullable=False
    )

    seat_number: Mapped[str] = mapped_column(String(10), nullable=False)
    seat_type: Mapped[str] = mapped_column(String(20), nullable=False, default="REGULAR")
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    position_in_row: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

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
    coach = relationship("Coach", back_populates="seats")
    bookings = relationship("Booking", back_populates="seat")
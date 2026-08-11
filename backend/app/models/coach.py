# backend/models/coach.py (add to existing)
from datetime import datetime
from sqlalchemy import ForeignKey, String, Integer, DateTime, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
from ..core.database import Base


class Coach(Base):
    __tablename__ = "coaches"

    id: Mapped[int] = mapped_column(primary_key=True)
    train_id: Mapped[int] = mapped_column(ForeignKey("trains.id", ondelete="CASCADE"), nullable=False)
    coach_type: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    rows: Mapped[int] = mapped_column(Integer, nullable=False)
    seats_per_row: Mapped[int] = mapped_column(Integer, nullable=False)
    total_seats: Mapped[int] = mapped_column(Integer, nullable=False)
    order_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())

    # Relationships
    train = relationship("Train", back_populates="coaches")
    seats = relationship("Seat", back_populates="coach", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="coach")
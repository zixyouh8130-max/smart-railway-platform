from typing import Optional, List
from sqlalchemy import String, ForeignKey, Float, Integer
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class Train(Base):
    __tablename__ = "trains"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    train_no: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    train_name: Mapped[str] = mapped_column(String(100), nullable=False)
    train_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Foreign key to route
    route_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("routes.id", ondelete="SET NULL"),
        nullable=True
    )

    # Train details
    total_coaches: Mapped[int] = mapped_column(Integer, default=0)
    capacity: Mapped[int] = mapped_column(Integer, default=0)

    # Train speed in km/h
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    # Relationships
    route = relationship("Route", back_populates="trains")
    schedules = relationship("Schedule", back_populates="train")
    coaches = relationship("Coach", back_populates="train", cascade="all, delete-orphan")
    train_stops = relationship("TrainStop", back_populates="train")
    fee_rules = relationship("StationFeeRule", back_populates="train")
    bookings = relationship("Booking", back_populates="train")
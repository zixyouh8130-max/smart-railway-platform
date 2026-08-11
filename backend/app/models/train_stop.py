# models/train_stop.py
from typing import Optional
from datetime import time
from sqlalchemy import ForeignKey, Integer, String, Boolean, Time
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class TrainStop(Base):
    """Train-specific stop information - timing and schedule for each train at route stations"""
    __tablename__ = "train_stops"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id", ondelete="CASCADE"),
        nullable=False
    )
    route_station_id: Mapped[int] = mapped_column(
        ForeignKey("route_stations.id", ondelete="CASCADE"),
        nullable=False
    )

    # Train-specific schedule timing
    expected_arrival_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    expected_departure_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    # Buffer times for this specific train
    arrival_buffer_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    departure_buffer_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)

    # Stop configuration for this specific train
    stop_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=2)
    is_timed_stop: Mapped[bool] = mapped_column(Boolean, default=True)

    # Actual time tracking (for real-time updates)
    actual_arrival_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    actual_departure_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="SCHEDULED")  # SCHEDULED, ARRIVED, DEPARTED, DELAYED

    # Relationships
    train = relationship("Train", back_populates="train_stops")
    route_station = relationship("RouteStation", back_populates="train_stops")
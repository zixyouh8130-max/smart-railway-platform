# models/station_arrival_log.py
from typing import Optional
from datetime import datetime, time
from sqlalchemy import ForeignKey, Integer, String, Float, DateTime, Time
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class StationArrivalLog(Base):
    """Logs actual train arrivals and departures at stations"""
    __tablename__ = "station_arrival_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Device and train info
    device_id: Mapped[int] = mapped_column(
        ForeignKey("train_rider_devices.id", ondelete="CASCADE"),
        nullable=False
    )
    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id", ondelete="CASCADE"),
        nullable=False
    )
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedules.id", ondelete="CASCADE"),
        nullable=False
    )

    # Station info - current station
    route_station_id: Mapped[int] = mapped_column(
        ForeignKey("route_stations.id", ondelete="CASCADE"),
        nullable=False
    )
    train_stop_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("train_stops.id", ondelete="SET NULL"),
        nullable=True
    )

    # Schedule dates
    schedule_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Arrival information
    arrival_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expected_arrival_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    arrival_delay_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)

    # Departure information
    departure_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expected_departure_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    departure_delay_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)

    # Stop duration
    stop_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stop_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Next station info - separate FK for next station
    next_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("route_stations.id", ondelete="SET NULL"),
        nullable=True
    )
    next_station_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expected_next_arrival: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # GPS coordinates at time of arrival
    arrival_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    arrival_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="ARRIVED")  # ARRIVED, DEPARTED, SKIPPED

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships - explicitly specify foreign_keys to resolve ambiguity
    device = relationship("TrainRiderDevice", back_populates="station_logs")
    train = relationship("Train")
    schedule = relationship("Schedule")

    # Current station relationship - specify which foreign key to use
    route_station = relationship(
        "RouteStation",
        foreign_keys=[route_station_id],
        back_populates="arrival_logs"
    )

    # Next station relationship - specify which foreign key to use
    next_route_station = relationship(
        "RouteStation",
        foreign_keys=[next_route_station_id]
    )

    train_stop = relationship("TrainStop")
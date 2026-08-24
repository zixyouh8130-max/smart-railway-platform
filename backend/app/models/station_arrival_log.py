from typing import Optional
from datetime import datetime, time, date

from sqlalchemy import (
    ForeignKey,
    Integer,
    String,
    Float,
    DateTime,
    Time,
    Date,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..core.database import Base


class StationArrivalLog(Base):
    """
    Runtime state/event record for ONE dated schedule at ONE route station.

    This is the authoritative home for actual arrival/departure state.
    """

    __tablename__ = "station_arrival_logs"

    __table_args__ = (
        UniqueConstraint(
            "schedule_id",
            "route_station_id",
            name="uq_station_arrival_logs_schedule_station"
        ),
        Index(
            "ix_station_arrival_logs_schedule_station",
            "schedule_id",
            "route_station_id"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True
    )

    device_id: Mapped[int] = mapped_column(
        ForeignKey(
            "train_rider_devices.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    train_id: Mapped[int] = mapped_column(
        ForeignKey(
            "trains.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    schedule_id: Mapped[int] = mapped_column(
        ForeignKey(
            "schedules.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )

    route_station_id: Mapped[int] = mapped_column(
        ForeignKey(
            "route_stations.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    # Optional pointer back to the static timetable row.
    train_stop_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "train_stops.id",
            ondelete="SET NULL"
        ),
        nullable=True
    )

    # The run's date. A DATE is clearer than a DateTime here.
    schedule_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True
    )

    # Actual runtime events
    arrival_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    departure_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    # Expected-time snapshot for this run/station.
    expected_arrival_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    expected_departure_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    arrival_delay_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=0
    )

    departure_delay_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=0
    )

    stop_duration_seconds: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    stop_duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    next_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "route_stations.id",
            ondelete="SET NULL"
        ),
        nullable=True
    )

    next_station_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    expected_next_arrival: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True
    )

    arrival_latitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    arrival_longitude: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    # SCHEDULED, ARRIVED, DEPARTED, SKIPPED
    status: Mapped[str] = mapped_column(
        String(20),
        default="SCHEDULED",
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    device = relationship(
        "TrainRiderDevice",
        back_populates="station_logs"
    )

    train = relationship("Train")
    schedule = relationship("Schedule")

    route_station = relationship(
        "RouteStation",
        foreign_keys=[route_station_id],
        back_populates="arrival_logs"
    )

    next_route_station = relationship(
        "RouteStation",
        foreign_keys=[next_route_station_id]
    )

    train_stop = relationship("TrainStop")

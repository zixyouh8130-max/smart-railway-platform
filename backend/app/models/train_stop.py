from typing import Optional
from datetime import time

from sqlalchemy import ForeignKey, Integer, Boolean, Time, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..core.database import Base


class TrainStop(Base):
    """
    Static/master timetable for one train at one route station.

    IMPORTANT:
    - This table is NOT schedule/run state.
    - It must not store ARRIVED/DEPARTED/DELAYED state.
    - It must not store actual arrival/departure times.
    - Runtime state belongs to StationArrivalLog, scoped by schedule_id.
    """

    __tablename__ = "train_stops"

    __table_args__ = (
        UniqueConstraint(
            "train_id",
            "route_station_id",
            name="uq_train_stops_train_route_station"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True
    )

    train_id: Mapped[int] = mapped_column(
        ForeignKey(
            "trains.id",
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
        nullable=False,
        index=True
    )

    # Static / planned timetable
    expected_arrival_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    expected_departure_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True
    )

    arrival_buffer_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=0
    )

    departure_buffer_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=0
    )

    stop_duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=2
    )

    is_timed_stop: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    train = relationship(
        "Train",
        back_populates="train_stops"
    )

    route_station = relationship(
        "RouteStation",
        back_populates="train_stops"
    )

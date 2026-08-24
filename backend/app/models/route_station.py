# models/route_station.py
from typing import Optional
from sqlalchemy import ForeignKey, Integer, String, Float, Boolean
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class RouteStation(Base):
    """Stations belonging to a specific route - general route data only"""
    __tablename__ = "route_stations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    route_id: Mapped[int] = mapped_column(
        ForeignKey("routes.id", ondelete="CASCADE"),
        nullable=False
    )
    station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stations.id"),
        nullable=True
    )

    # Station info (can be denormalized or referenced)
    station_name: Mapped[str] = mapped_column(String(100), nullable=False)
    station_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Route-specific station configuration
    order_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Distance from route origin in miles
    distance_from_origin: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
        comment="Distance in miles from route origin",
    )
    is_major_stop: Mapped[bool] = mapped_column(Boolean, default=False)

    # Time from origin (route-level, not train-specific)
    # This represents the typical/minimum travel time from origin
    time_from_origin_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    route = relationship("Route", back_populates="stations")
    station = relationship("Station", back_populates="route_stations")
    train_stops = relationship("TrainStop", back_populates="route_station")
    arrival_logs = relationship(
        "StationArrivalLog",
        foreign_keys="[StationArrivalLog.route_station_id]",
        back_populates="route_station"
    )

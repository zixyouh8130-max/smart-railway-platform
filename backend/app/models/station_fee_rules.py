# models/station_fee_rule.py
from typing import Optional
from sqlalchemy import ForeignKey, String, Float, Boolean
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class StationFeeRule(Base):
    """Flexible fee rules between station pairs - specific to each train"""
    __tablename__ = "station_fee_rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Link to train instead of route
    train_id: Mapped[int] = mapped_column(
        ForeignKey("trains.id", ondelete="CASCADE"),
        nullable=False
    )

    # Keep route_id for reference/queries (denormalized)
    route_id: Mapped[int] = mapped_column(
        ForeignKey("routes.id", ondelete="CASCADE"),
        nullable=False
    )

    from_station_id: Mapped[int] = mapped_column(
        ForeignKey("route_stations.id", ondelete="CASCADE"),
        nullable=False
    )
    to_station_id: Mapped[int] = mapped_column(
        ForeignKey("route_stations.id", ondelete="CASCADE"),
        nullable=False
    )

    # Fare configuration
    base_fare: Mapped[float] = mapped_column(Float, nullable=False)
    per_mile_rate: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        comment="Additional fare amount per mile",
    )
    class_type: Mapped[str] = mapped_column(String(50), default="ECONOMY_CLASS")
    seat_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    calculated_distance: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="Calculated route distance in miles",
    )
    surcharge_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    train = relationship("Train", back_populates="fee_rules")
    route = relationship("Route", back_populates="fee_rules")
    from_station = relationship(
        "RouteStation",
        foreign_keys=[from_station_id]
    )
    to_station = relationship(
        "RouteStation",
        foreign_keys=[to_station_id]
    )
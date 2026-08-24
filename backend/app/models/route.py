# backend/app/models/route.py
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime
from typing import List, Optional
from ..core.database import Base


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin: Mapped[str] = mapped_column(String(100), nullable=False)
    destination: Mapped[str] = mapped_column(String(100), nullable=False)
    # Route distance in miles
    distance: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="Route distance in miles",
    )
    duration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    base_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

    # Fee calculation configuration
    fee_calculation_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        default="FIXED_PER_STATION",
        nullable=True
    )

    # Timestamps
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    stations = relationship(
        "RouteStation",
        back_populates="route",
        order_by="RouteStation.order_number",
        cascade="all, delete-orphan"
    )

    trains = relationship(
        "Train",
        back_populates="route"
    )

    schedules = relationship(
        "Schedule",
        back_populates="route"
    )

    fee_rules = relationship(
        "StationFeeRule",
        back_populates="route",
        cascade="all, delete-orphan"
    )
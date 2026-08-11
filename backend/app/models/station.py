# backend/app/models/station.py
from sqlalchemy import Column, Integer, String, Float, Boolean, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional
from ..core.database import Base


class Station(Base):
    """Master station catalog"""
    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(10), unique=True, nullable=True, index=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state_region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Location coordinates
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(9, 6), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    route_stations = relationship("RouteStation", back_populates="station")
    # REMOVED: fee_rules_from and fee_rules_to - these now reference RouteStation instead
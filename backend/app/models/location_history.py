# models/location_history.py
from typing import Optional
from datetime import datetime
from sqlalchemy import ForeignKey, Integer, Float, DateTime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..core.database import Base


class LocationHistory(Base):
    """Stores location history of train rider devices"""
    __tablename__ = "location_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("train_rider_devices.id", ondelete="CASCADE"),
        nullable=False
    )

    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # GPS accuracy in meters

    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    device = relationship("TrainRiderDevice", back_populates="location_history")
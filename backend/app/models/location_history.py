from typing import Optional
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Float, DateTime, Index
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..core.database import Base


class LocationHistory(Base):
    """
    GPS history for a device DURING a specific schedule/run.

    schedule_id prevents history from a reused device leaking across journeys.
    """

    __tablename__ = "location_history"

    __table_args__ = (
        Index(
            "ix_location_history_schedule_timestamp",
            "schedule_id",
            "timestamp"
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

    schedule_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "schedules.id",
            ondelete="CASCADE"
        ),
        nullable=True,
        index=True
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    # Speed in miles per hour (mph)
    speed: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="Speed in miles per hour (mph)",
    )

    accuracy: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        index=True
    )

    device = relationship(
        "TrainRiderDevice",
        back_populates="location_history"
    )

    schedule = relationship("Schedule")

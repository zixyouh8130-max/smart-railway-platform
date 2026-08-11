# models/train_rider_device.py
from enum import Enum  # Add this import
from typing import Optional
from datetime import datetime
from sqlalchemy import ForeignKey, Integer, String, Float, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
import uuid
from ..core.database import Base


class DeviceType(str, Enum):
    TRAIN_DEVICE = "TRAIN_DEVICE"  # Device mounted on train
    STAFF_DEVICE = "STAFF_DEVICE"  # Staff mobile device
    STATION_DEVICE = "STATION_DEVICE"  # Fixed station device


class TrainRiderDevice(Base):
    """Tracks train rider devices and their current locations"""
    __tablename__ = "train_rider_devices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    device_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_type: Mapped[DeviceType] = mapped_column(
        SQLEnum(DeviceType),
        default=DeviceType.TRAIN_DEVICE,
        nullable=False
    )

    # Current train assignment
    train_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trains.id", ondelete="SET NULL"),
        nullable=True
    )
    schedule_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("schedules.id", ondelete="SET NULL"),
        nullable=True
    )

    # Staff assignment (if device is assigned to staff)
    staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True
    )

    # Current location
    current_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Current status tracking
    current_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("route_stations.id", ondelete="SET NULL"),
        nullable=True
    )
    next_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("route_stations.id", ondelete="SET NULL"),
        nullable=True
    )

    # Speed tracking
    current_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # km/h

    # Battery status
    battery_level: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_charging: Mapped[bool] = mapped_column(Boolean, default=False)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="INACTIVE")  # ACTIVE, INACTIVE, STOPPED

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships - explicitly specify foreign_keys
    train = relationship("Train")
    schedule = relationship("Schedule")
    staff = relationship("Staff")

    current_route_station = relationship(
        "RouteStation",
        foreign_keys=[current_route_station_id]
    )

    next_route_station = relationship(
        "RouteStation",
        foreign_keys=[next_route_station_id]
    )

    location_history = relationship(
        "LocationHistory",
        back_populates="device",
        order_by="LocationHistory.timestamp.desc()"
    )

    station_logs = relationship(
        "StationArrivalLog",
        back_populates="device",
        order_by="StationArrivalLog.arrival_time.desc()"
    )
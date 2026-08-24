# backend/models/booking.py

from datetime import datetime, date
import enum
from typing import Optional

from sqlalchemy import (
    String,
    Integer,
    Float,
    ForeignKey,
    Date,
    DateTime,
    Enum,
    Boolean,
    func,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from ..core.database import Base


class BookingStatus(str, enum.Enum):
    RESERVED = "RESERVED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    COMPLETED = "COMPLETED"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"


class Booking(Base):
    """
    Passenger booking for ONE exact Schedule and ONE journey segment.

    schedule_id is the authoritative dated run.
    train_id/travel_date are retained as denormalized snapshots for
    compatibility/reporting and are derived from Schedule when creating.
    """

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    # ------------------------------------------------------------
    # Customer
    # ------------------------------------------------------------

    customer_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    nrc: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
    )

    email: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    # ------------------------------------------------------------
    # Booking identity
    # ------------------------------------------------------------

    ticket_no: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    booking_no: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
        index=True,
    )

    # Exact dated run.
    schedule_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "schedules.id",
            ondelete="RESTRICT",
        ),
        nullable=True,  # Make non-null after legacy backfill.
        index=True,
    )

    # Denormalized from schedule.train_id.
    train_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("trains.id"),
        nullable=False,
        index=True,
    )

    # Exact physical seat.
    seat_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("seats.id"),
        nullable=False,
        index=True,
    )

    # Passenger segment. These deliberately point to route_stations.id.
    from_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "route_stations.id",
            ondelete="RESTRICT",
        ),
        nullable=True,  # Make non-null after legacy backfill.
        index=True,
    )

    to_route_station_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "route_stations.id",
            ondelete="RESTRICT",
        ),
        nullable=True,  # Make non-null after legacy backfill.
        index=True,
    )

    # Denormalized from schedule.departure_date.
    travel_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------
    # Booking dates
    # ------------------------------------------------------------

    booking_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    reservation_expiry: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    cancellation_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ------------------------------------------------------------
    # Financial snapshot
    #
    # base_fare stores the FINAL railway fare returned by FeeCalculator
    # (including any configured base/mile/surcharge rule).
    # tax/service_fee remain separate future platform charges.
    # ------------------------------------------------------------

    base_fare: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    tax: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    service_fee: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    total_cost: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    refund_amount: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    # ------------------------------------------------------------
    # Status
    # ------------------------------------------------------------

    booking_status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus),
        default=BookingStatus.RESERVED,
        nullable=False,
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus),
        default=PaymentStatus.PENDING,
        nullable=False,
    )

    # ------------------------------------------------------------
    # Passenger details
    # ------------------------------------------------------------

    passenger_count: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    passenger_names: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    notes: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------

    schedule = relationship(
        "Schedule",
        back_populates="bookings",
    )

    seat = relationship(
        "Seat",
        back_populates="bookings",
    )

    train = relationship(
        "Train",
        back_populates="bookings",
    )

    from_route_station = relationship(
        "RouteStation",
        foreign_keys=[from_route_station_id],
    )

    to_route_station = relationship(
        "RouteStation",
        foreign_keys=[to_route_station_id],
    )

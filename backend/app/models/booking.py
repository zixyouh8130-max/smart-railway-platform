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
    """Booking status enum"""

    RESERVED = "RESERVED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    COMPLETED = "COMPLETED"


class PaymentStatus(str, enum.Enum):
    """Payment status enum"""

    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    # ============================================================
    # Customer Information
    # ============================================================

    customer_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    nrc: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )

    email: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True
    )

    # ============================================================
    # Booking Details
    # ============================================================

    ticket_no: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True
    )

    booking_no: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
        index=True
    )

    # ============================================================
    # Foreign Keys
    # ============================================================

    # Keep train_id because a booking is associated with a
    # particular train/journey.
    train_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("trains.id"),
        nullable=False,
        index=True
    )

    # Booking is directly attached to the selected seat.
    seat_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("seats.id"),
        nullable=False,
        index=True
    )

    # coach_id REMOVED.
    #
    # Coach can be obtained through:
    # booking.seat.coach

    # ============================================================
    # Dates
    # ============================================================

    travel_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )

    booking_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    reservation_expiry: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    cancellation_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ============================================================
    # Financial
    # ============================================================

    base_fare: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False
    )

    tax: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False
    )

    service_fee: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False
    )

    total_cost: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    refund_amount: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True
    )

    # ============================================================
    # Status
    # ============================================================

    booking_status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus),
        default=BookingStatus.RESERVED,
        nullable=False
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus),
        default=PaymentStatus.PENDING,
        nullable=False
    )

    # ============================================================
    # Passenger Details
    # ============================================================

    passenger_count: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False
    )

    passenger_names: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    # ============================================================
    # Additional Information
    # ============================================================

    notes: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    # ============================================================
    # Timestamps
    # ============================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # ============================================================
    # Relationships
    # ============================================================

    seat = relationship(
        "Seat",
        back_populates="bookings"
    )

    train = relationship(
        "Train",
        back_populates="bookings"
    )

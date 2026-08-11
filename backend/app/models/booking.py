# backend/models/booking.py
from datetime import datetime, date
from sqlalchemy import String, Integer, Float, ForeignKey, Date, DateTime, Enum, Boolean, func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
import enum
from ..core.database import Base


class BookingStatus(str, enum.Enum):
    """Booking status enum"""
    RESERVED = "RESERVED"  # Seat is temporarily held
    CONFIRMED = "CONFIRMED"  # Booking is confirmed and paid
    CANCELLED = "CANCELLED"  # Booking is cancelled
    EXPIRED = "EXPIRED"  # Reservation expired without payment
    COMPLETED = "COMPLETED"  # Journey completed


class PaymentStatus(str, enum.Enum):
    """Payment status enum"""
    PENDING = "PENDING"  # Payment not yet made
    PAID = "PAID"  # Payment completed
    REFUNDED = "REFUNDED"  # Payment refunded
    FAILED = "FAILED"  # Payment failed
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Customer Information
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    nrc: Mapped[str] = mapped_column(String(50), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Booking Details
    ticket_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    booking_no: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True, index=True)

    # Foreign Keys
    train_id: Mapped[int] = mapped_column(Integer, ForeignKey("trains.id"), nullable=False)
    seat_id: Mapped[int] = mapped_column(Integer, ForeignKey("seats.id"), nullable=False)
    coach_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("coaches.id"), nullable=True)

    # Dates
    travel_date: Mapped[date] = mapped_column(Date, nullable=False)
    booking_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reservation_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Financial
    base_fare: Mapped[float] = mapped_column(Float, default=0.0)
    tax: Mapped[float] = mapped_column(Float, default=0.0)
    service_fee: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False)
    refund_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status
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

    # Passenger Details
    passenger_count: Mapped[int] = mapped_column(Integer, default=1)
    passenger_names: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # JSON string or comma-separated

    # Additional Info
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationships
    seat = relationship("Seat", back_populates="bookings")
    train = relationship("Train", back_populates="bookings")
    coach = relationship("Coach", back_populates="bookings")
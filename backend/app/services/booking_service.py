# backend/services/booking_service.py
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from ..models.booking import Booking, BookingStatus, PaymentStatus
from ..models.seat import Seat
from ..core.database import SessionLocal
import uuid
import random
import string


class BookingService:
    """Service for managing bookings and reservations"""

    # Reservation timeout in minutes
    RESERVATION_TIMEOUT = 15

    @staticmethod
    def generate_ticket_no() -> str:
        """Generate unique ticket number"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        return f"TKT-{timestamp}-{random_str}"

    @staticmethod
    def generate_booking_no() -> str:
        """Generate unique booking number"""
        timestamp = datetime.now().strftime("%Y%m%d")
        random_str = ''.join(random.choices(string.digits, k=6))
        return f"BKG-{timestamp}-{random_str}"

    @staticmethod
    def check_seat_availability(
            db: Session,
            seat_id: int,
            travel_date: date
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if a seat is available for booking.
        Returns (is_available, message)
        """
        # Check if seat exists and is active
        seat = db.query(Seat).filter(
            Seat.id == seat_id,
            Seat.is_active == True
        ).first()

        if not seat:
            return False, "Seat not found or inactive"

        # Check for conflicting bookings
        conflicting_booking = db.query(Booking).filter(
            Booking.seat_id == seat_id,
            Booking.travel_date == travel_date,
            Booking.booking_status.in_([
                BookingStatus.RESERVED,
                BookingStatus.CONFIRMED
            ]),
            Booking.is_active == True
        ).first()

        if conflicting_booking:
            if conflicting_booking.booking_status == BookingStatus.RESERVED:
                # Check if reservation has expired
                if conflicting_booking.reservation_expiry and \
                        conflicting_booking.reservation_expiry < datetime.now():
                    # Expire the reservation
                    conflicting_booking.booking_status = BookingStatus.EXPIRED
                    conflicting_booking.is_active = False
                    db.commit()
                    return True, "Seat available (previous reservation expired)"
                return False, "Seat is currently reserved"
            return False, "Seat is already booked"

        return True, "Seat available"

    @staticmethod
    def create_reservation(
            db: Session,
            booking_data: dict
    ) -> Booking:
        """Create a new reservation with timeout"""

        # Check availability
        is_available, message = BookingService.check_seat_availability(
            db,
            booking_data['seat_id'],
            booking_data['travel_date']
        )

        if not is_available:
            raise ValueError(message)

        # Generate ticket and booking numbers
        ticket_no = BookingService.generate_ticket_no()
        booking_no = BookingService.generate_booking_no()

        # Set reservation expiry
        reservation_expiry = datetime.now() + timedelta(minutes=BookingService.RESERVATION_TIMEOUT)

        # Create booking
        booking = Booking(
            ticket_no=ticket_no,
            booking_no=booking_no,
            booking_status=BookingStatus.RESERVED,
            payment_status=PaymentStatus.PENDING,
            reservation_expiry=reservation_expiry,
            **booking_data
        )

        db.add(booking)
        db.commit()
        db.refresh(booking)

        return booking

    @staticmethod
    def confirm_booking(
            db: Session,
            booking_id: int,
            payment_amount: float
    ) -> Booking:
        """Confirm a reservation and process payment"""
        booking = db.query(Booking).filter(Booking.id == booking_id).first()

        if not booking:
            raise ValueError("Booking not found")

        if booking.booking_status != BookingStatus.RESERVED:
            raise ValueError("Booking is not in reserved state")

        # Check if reservation has expired
        if booking.reservation_expiry and booking.reservation_expiry < datetime.now():
            booking.booking_status = BookingStatus.EXPIRED
            booking.is_active = False
            db.commit()
            raise ValueError("Reservation has expired")

        # Confirm booking
        booking.booking_status = BookingStatus.CONFIRMED
        booking.payment_status = PaymentStatus.PAID

        # Clear reservation expiry
        booking.reservation_expiry = None

        db.commit()
        db.refresh(booking)

        return booking

    @staticmethod
    def cancel_booking(
            db: Session,
            booking_id: int,
            reason: Optional[str] = None
    ) -> Booking:
        """Cancel a booking and process refund if applicable"""
        booking = db.query(Booking).filter(Booking.id == booking_id).first()

        if not booking:
            raise ValueError("Booking not found")

        if booking.booking_status == BookingStatus.CANCELLED:
            raise ValueError("Booking is already cancelled")

        if booking.booking_status == BookingStatus.COMPLETED:
            raise ValueError("Cannot cancel completed journey")

        # Calculate refund
        refund_amount = 0.0
        if booking.payment_status == PaymentStatus.PAID:
            # Refund logic (you can customize this)
            if booking.booking_status == BookingStatus.CONFIRMED:
                # Full refund if cancelled before travel date
                refund_amount = booking.total_cost
            elif booking.booking_status == BookingStatus.RESERVED:
                # Partial refund for reservation cancellation
                refund_amount = booking.total_cost * 0.5

        # Update booking
        booking.booking_status = BookingStatus.CANCELLED
        booking.payment_status = PaymentStatus.REFUNDED if refund_amount > 0 else PaymentStatus.PENDING
        booking.refund_amount = refund_amount
        booking.cancellation_date = datetime.now()
        booking.notes = f"{booking.notes or ''}\nCancelled: {reason}" if reason else booking.notes
        booking.is_active = False

        db.commit()
        db.refresh(booking)

        return booking

    @staticmethod
    def expire_reservations(db: Session) -> int:
        """Expire all unpaid reservations that have timed out"""
        now = datetime.now()

        expired_bookings = db.query(Booking).filter(
            Booking.booking_status == BookingStatus.RESERVED,
            Booking.reservation_expiry < now,
            Booking.is_active == True
        ).all()

        count = 0
        for booking in expired_bookings:
            booking.booking_status = BookingStatus.EXPIRED
            booking.is_active = False
            count += 1

        db.commit()
        return count

    @staticmethod
    def complete_journey(db: Session, booking_id: int) -> Booking:
        """Mark a booking as completed after journey"""
        booking = db.query(Booking).filter(Booking.id == booking_id).first()

        if not booking:
            raise ValueError("Booking not found")

        if booking.booking_status != BookingStatus.CONFIRMED:
            raise ValueError("Only confirmed bookings can be completed")

        booking.booking_status = BookingStatus.COMPLETED

        db.commit()
        db.refresh(booking)

        return booking
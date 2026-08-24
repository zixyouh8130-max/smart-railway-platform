# backend/services/booking_service.py

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from ..models.booking import (
    Booking,
    BookingStatus,
    PaymentStatus,
)
from ..models.seat import Seat
from ..models.coach import Coach
from ..models.schedule import Schedule
from ..models.route_station import RouteStation
from ..services.fee_calculator import FeeCalculator

import random
import string


class BookingService:
    """
    Booking identity:
        schedule_id + seat_id + passenger segment.

    Fare is computed on the backend from configured StationFeeRule data.
    """

    RESERVATION_TIMEOUT = 15

    # Fare class comes directly from the canonical passenger coach type.
    COACH_TO_FEE_CLASS = {
        "UPPER_CLASS": "UPPER_CLASS",
        "ECONOMY_CLASS": "ECONOMY_CLASS",
        "SLEEPER": "SLEEPER",
    }

    NON_PASSENGER_COACH_TYPES = {
        "DINING",
        "BAGGAGE",
    }

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def generate_ticket_no() -> str:
        timestamp = (
            BookingService._utcnow()
            .strftime("%Y%m%d%H%M%S")
        )

        random_str = "".join(
            random.choices(
                string.ascii_uppercase
                + string.digits,
                k=4,
            )
        )

        return f"TKT-{timestamp}-{random_str}"

    @staticmethod
    def generate_booking_no() -> str:
        timestamp = (
            BookingService._utcnow()
            .strftime("%Y%m%d")
        )

        random_str = "".join(
            random.choices(
                string.digits,
                k=6,
            )
        )

        return f"BKG-{timestamp}-{random_str}"

    # ------------------------------------------------------------
    # Context validation
    # ------------------------------------------------------------

    @staticmethod
    def _get_schedule(
        db: Session,
        schedule_id: int,
    ) -> Schedule:
        schedule = (
            db.query(Schedule)
            .filter(
                Schedule.id == schedule_id
            )
            .first()
        )

        if not schedule:
            raise ValueError("Schedule not found")

        return schedule

    @staticmethod
    def _get_segment(
        db: Session,
        schedule: Schedule,
        from_route_station_id: int,
        to_route_station_id: int,
    ):
        from_rs = (
            db.query(RouteStation)
            .filter(
                RouteStation.id
                == from_route_station_id,
                RouteStation.route_id
                == schedule.route_id,
            )
            .first()
        )

        to_rs = (
            db.query(RouteStation)
            .filter(
                RouteStation.id
                == to_route_station_id,
                RouteStation.route_id
                == schedule.route_id,
            )
            .first()
        )

        if not from_rs or not to_rs:
            raise ValueError(
                "Boarding and destination stations "
                "must belong to the schedule route"
            )

        if (
            from_rs.order_number
            >= to_rs.order_number
        ):
            raise ValueError(
                "Destination must come after "
                "the boarding station"
            )

        return from_rs, to_rs

    @staticmethod
    def _get_seat_and_coach(
        db: Session,
        seat_id: int,
        schedule: Schedule,
    ):
        seat = (
            db.query(Seat)
            .filter(
                Seat.id == seat_id,
                Seat.is_active.is_(True),
            )
            .first()
        )

        if not seat:
            raise ValueError(
                "Seat not found or inactive"
            )

        coach = (
            db.query(Coach)
            .filter(
                Coach.id == seat.coach_id,
                Coach.is_active.is_(True),
            )
            .first()
        )

        if not coach:
            raise ValueError(
                "Seat coach not found or inactive"
            )

        coach_type = str(
            coach.coach_type
        ).upper()

        if (
            coach_type
            in BookingService
            .NON_PASSENGER_COACH_TYPES
        ):
            raise ValueError(
                "This coach is not available "
                "for passenger ticket booking"
            )

        if (
            coach_type
            not in BookingService
            .COACH_TO_FEE_CLASS
        ):
            raise ValueError(
                "This coach type has no "
                "passenger fare class configured"
            )

        if coach.train_id != schedule.train_id:
            raise ValueError(
                "Seat does not belong to "
                "the schedule's train"
            )

        return seat, coach

    @staticmethod
    def _fee_class_for_coach(
        coach: Coach,
        seat: Seat,
    ) -> str:
        del seat  # seat metadata does not select the railway fare class.

        coach_type = str(
            coach.coach_type
        ).upper()

        class_type = (
            BookingService
            .COACH_TO_FEE_CLASS
            .get(coach_type)
        )

        if not class_type:
            raise ValueError(
                "Selected coach type does not "
                "have a passenger fare class"
            )

        return class_type

    # ------------------------------------------------------------
    # Seat availability
    # ------------------------------------------------------------

    @staticmethod
    def check_seat_availability(
        db: Session,
        seat_id: int,
        schedule_id: int,
    ) -> Tuple[bool, Optional[str]]:
        try:
            schedule = (
                BookingService._get_schedule(
                    db,
                    schedule_id,
                )
            )

            BookingService._get_seat_and_coach(
                db,
                seat_id,
                schedule,
            )

        except ValueError as exc:
            return False, str(exc)

        if schedule.status != "SCHEDULED":
            return (
                False,
                "Bookings are allowed only "
                "for SCHEDULED services",
            )

        now = BookingService._utcnow()

        conflicts = (
            db.query(Booking)
            .filter(
                Booking.seat_id == seat_id,
                Booking.schedule_id
                == schedule_id,
                Booking.is_active.is_(True),
                Booking.booking_status.in_([
                    BookingStatus.RESERVED,
                    BookingStatus.CONFIRMED,
                ]),
            )
            .all()
        )

        for booking in conflicts:
            if (
                booking.booking_status
                == BookingStatus.RESERVED
                and booking.reservation_expiry
                and booking.reservation_expiry
                < now
            ):
                booking.booking_status = (
                    BookingStatus.EXPIRED
                )
                booking.is_active = False
                continue

            return False, (
                "Seat is currently reserved"
                if booking.booking_status
                == BookingStatus.RESERVED
                else "Seat is already booked"
            )

        db.commit()

        return True, "Seat available"

    # ------------------------------------------------------------
    # Create reservation
    # ------------------------------------------------------------

    @staticmethod
    def create_reservation(
        db: Session,
        booking_data: dict,
    ) -> Booking:
        payload = dict(booking_data)

        schedule_id = payload.pop(
            "schedule_id"
        )
        seat_id = payload.pop("seat_id")
        from_route_station_id = payload.pop(
            "from_route_station_id"
        )
        to_route_station_id = payload.pop(
            "to_route_station_id"
        )

        schedule = (
            BookingService._get_schedule(
                db,
                schedule_id,
            )
        )

        if schedule.status != "SCHEDULED":
            raise ValueError(
                "Bookings are allowed only "
                "for SCHEDULED services"
            )

        from_rs, to_rs = (
            BookingService._get_segment(
                db,
                schedule,
                from_route_station_id,
                to_route_station_id,
            )
        )

        seat, coach = (
            BookingService._get_seat_and_coach(
                db,
                seat_id,
                schedule,
            )
        )

        is_available, message = (
            BookingService
            .check_seat_availability(
                db,
                seat_id,
                schedule.id,
            )
        )

        if not is_available:
            raise ValueError(message)

        class_type = (
            BookingService._fee_class_for_coach(
                coach,
                seat,
            )
        )

        fee = FeeCalculator(
            db
        ).calculate_fee_for_train(
            train_id=schedule.train_id,
            from_station_id=from_rs.id,
            to_station_id=to_rs.id,
            class_type=class_type,
            seat_type=seat.seat_type,
            route_id=schedule.route_id,
        )

        # Booking base_fare is the final railway ticket fare snapshot.
        railway_fare = float(
            fee["total_fare"]
        )

        # No sourced tax/platform service fee yet.
        tax = 0.0
        service_fee = 0.0

        total_cost = (
            railway_fare
            + tax
            + service_fee
        )

        booking = Booking(
            ticket_no=(
                BookingService.generate_ticket_no()
            ),
            booking_no=(
                BookingService.generate_booking_no()
            ),

            schedule_id=schedule.id,
            train_id=schedule.train_id,
            seat_id=seat.id,

            from_route_station_id=from_rs.id,
            to_route_station_id=to_rs.id,

            travel_date=(
                schedule.departure_date
            ),

            booking_status=(
                BookingStatus.RESERVED
            ),
            payment_status=(
                PaymentStatus.PENDING
            ),

            reservation_expiry=(
                BookingService._utcnow()
                + timedelta(
                    minutes=(
                        BookingService
                        .RESERVATION_TIMEOUT
                    )
                )
            ),

            base_fare=railway_fare,
            tax=tax,
            service_fee=service_fee,
            total_cost=total_cost,

            **payload,
        )

        try:
            db.add(booking)
            db.commit()
            db.refresh(booking)

            return booking

        except Exception:
            db.rollback()
            raise

    # ------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------

    @staticmethod
    def confirm_booking(
        db: Session,
        booking_id: int,
        payment_amount: float,
    ) -> Booking:
        booking = (
            db.query(Booking)
            .filter(
                Booking.id == booking_id
            )
            .first()
        )

        if not booking:
            raise ValueError(
                "Booking not found"
            )

        if (
            booking.booking_status
            != BookingStatus.RESERVED
        ):
            raise ValueError(
                "Booking is not in reserved state"
            )

        now = BookingService._utcnow()

        if (
            booking.reservation_expiry
            and booking.reservation_expiry
            < now
        ):
            booking.booking_status = (
                BookingStatus.EXPIRED
            )
            booking.is_active = False
            db.commit()

            raise ValueError(
                "Reservation has expired"
            )

        # Demo payment validation.
        if payment_amount < booking.total_cost:
            raise ValueError(
                "Payment amount is less than "
                "the booking total"
            )

        booking.booking_status = (
            BookingStatus.CONFIRMED
        )
        booking.payment_status = (
            PaymentStatus.PAID
        )
        booking.reservation_expiry = None

        db.commit()
        db.refresh(booking)

        return booking

    @staticmethod
    def cancel_booking(
        db: Session,
        booking_id: int,
        reason: Optional[str] = None,
    ) -> Booking:
        booking = (
            db.query(Booking)
            .filter(
                Booking.id == booking_id
            )
            .first()
        )

        if not booking:
            raise ValueError("Booking not found")

        if (
            booking.booking_status
            == BookingStatus.CANCELLED
        ):
            raise ValueError(
                "Booking is already cancelled"
            )

        if (
            booking.booking_status
            == BookingStatus.COMPLETED
        ):
            raise ValueError(
                "Cannot cancel completed journey"
            )

        if (
            booking.schedule
            and booking.schedule.status
            in {"ACTIVE", "COMPLETED"}
        ):
            raise ValueError(
                "Cannot cancel after "
                "the journey has started"
            )

        refund_amount = 0.0

        if (
            booking.payment_status
            == PaymentStatus.PAID
        ):
            if (
                booking.booking_status
                == BookingStatus.CONFIRMED
            ):
                refund_amount = (
                    booking.total_cost
                )
            elif (
                booking.booking_status
                == BookingStatus.RESERVED
            ):
                refund_amount = (
                    booking.total_cost * 0.5
                )

        booking.booking_status = (
            BookingStatus.CANCELLED
        )

        booking.payment_status = (
            PaymentStatus.REFUNDED
            if refund_amount > 0
            else PaymentStatus.PENDING
        )

        booking.refund_amount = refund_amount
        booking.cancellation_date = (
            BookingService._utcnow()
        )
        booking.is_active = False

        if reason:
            prefix = (
                booking.notes.strip()
                if booking.notes
                else ""
            )

            line = f"Cancelled: {reason}"

            booking.notes = (
                f"{prefix}\n{line}"
                if prefix
                else line
            )

        db.commit()
        db.refresh(booking)

        return booking

    @staticmethod
    def expire_reservations(
        db: Session,
    ) -> int:
        now = BookingService._utcnow()

        expired = (
            db.query(Booking)
            .filter(
                Booking.booking_status
                == BookingStatus.RESERVED,
                Booking.reservation_expiry
                < now,
                Booking.is_active.is_(True),
            )
            .all()
        )

        for booking in expired:
            booking.booking_status = (
                BookingStatus.EXPIRED
            )
            booking.is_active = False

        db.commit()

        return len(expired)

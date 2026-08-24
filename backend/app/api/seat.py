# backend/api/seat.py

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.schedule import Schedule
from ..models.coach import Coach
from ..models.seat import Seat
from ..models.booking import (
    Booking,
    BookingStatus,
)

router = APIRouter()


def _active_blocking_bookings(
    db: Session,
    schedule_id: int,
):
    now = datetime.now(timezone.utc)

    return (
        db.query(Booking)
        .filter(
            Booking.schedule_id
            == schedule_id,
            Booking.is_active.is_(True),
            or_(
                Booking.booking_status
                == BookingStatus.CONFIRMED,
                and_(
                    Booking.booking_status
                    == BookingStatus.RESERVED,
                    or_(
                        Booking.reservation_expiry
                        .is_(None),
                        Booking.reservation_expiry
                        >= now,
                    ),
                ),
            ),
        )
        .all()
    )


@router.get("/schedule/{schedule_id}")
async def get_schedule_seat_map(
    schedule_id: int,
    db: Session = Depends(get_db),
):
    """
    Seat availability is per exact schedule_id.
    """
    schedule = (
        db.query(Schedule)
        .filter(
            Schedule.id == schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    coaches = (
        db.query(Coach)
        .filter(
            Coach.train_id == schedule.train_id,
            Coach.is_active.is_(True),
        )
        .order_by(Coach.order_number)
        .all()
    )

    coach_ids = [
        coach.id
        for coach in coaches
    ]

    seats = (
        db.query(Seat)
        .filter(
            Seat.coach_id.in_(coach_ids),
            Seat.is_active.is_(True),
        )
        .all()
        if coach_ids
        else []
    )

    blocked_bookings = (
        _active_blocking_bookings(
            db,
            schedule_id,
        )
    )

    blocked_by_seat = {
        booking.seat_id: booking
        for booking in blocked_bookings
    }

    seats_by_coach = {}

    for seat in seats:
        blocking = blocked_by_seat.get(
            seat.id
        )

        seats_by_coach.setdefault(
            seat.coach_id,
            [],
        ).append({
            "id": seat.id,
            "seat_number": seat.seat_number,
            "seat_type": seat.seat_type,
            "row_number": seat.row_number,
            "position_in_row": (
                seat.position_in_row
            ),
            "available": blocking is None,
            "booking_status": (
                blocking.booking_status.value
                if blocking
                else None
            ),
        })

    return {
        "schedule_id": schedule.id,
        "train_id": schedule.train_id,
        "schedule_status": schedule.status,
        "coaches": [
            {
                "id": coach.id,
                "name": coach.name,
                "coach_type": coach.coach_type,
                "order_number": (
                    coach.order_number
                ),
                "seats": seats_by_coach.get(
                    coach.id,
                    [],
                ),
            }
            for coach in coaches
        ],
    }


@router.get("/{seat_id}/availability")
async def check_seat_availability(
    seat_id: int,
    schedule_id: int = Query(..., gt=0),
    db: Session = Depends(get_db),
):
    schedule = (
        db.query(Schedule)
        .filter(
            Schedule.id == schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    seat = (
        db.query(Seat)
        .filter(
            Seat.id == seat_id,
            Seat.is_active.is_(True),
        )
        .first()
    )

    if not seat:
        raise HTTPException(
            status_code=404,
            detail="Seat not found",
        )

    coach = (
        db.query(Coach)
        .filter(
            Coach.id == seat.coach_id
        )
        .first()
    )

    if (
        not coach
        or coach.train_id
        != schedule.train_id
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Seat does not belong to "
                "this schedule's train"
            ),
        )

    blocked = {
        booking.seat_id
        for booking in (
            _active_blocking_bookings(
                db,
                schedule_id,
            )
        )
    }

    return {
        "schedule_id": schedule_id,
        "seat_id": seat_id,
        "available": seat_id not in blocked,
    }

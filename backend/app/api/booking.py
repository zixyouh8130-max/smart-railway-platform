# backend/api/booking.py

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy.orm import Session
from typing import Optional

from ..core.database import get_db
from ..models.booking import Booking
from ..models.schedule import Schedule
from ..models.route_station import RouteStation
from ..models.train_stop import TrainStop
from ..models.station_arrival_log import (
    StationArrivalLog,
)
from ..services.booking_service import BookingService
from ..schemas.booking import (
    BookingCreate,
    BookingResponse,
    BookingListResponse,
    BookingConfirmRequest,
    BookingCancelRequest,
)

router = APIRouter()


@router.post(
    "/reserve",
    response_model=BookingResponse,
    status_code=201,
)
async def reserve_booking(
    data: BookingCreate,
    db: Session = Depends(get_db),
):
    try:
        return BookingService.create_reservation(
            db,
            data.model_dump(),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.get(
    "/ticket/{ticket_no}/journey-status"
)
async def get_ticket_journey_status(
    ticket_no: str,
    db: Session = Depends(get_db),
):
    """
    Homepage ticket tracker.

    Actual station state is scoped strictly by booking.schedule_id.
    """
    booking = (
        db.query(Booking)
        .filter(
            Booking.ticket_no == ticket_no
        )
        .first()
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    if not booking.schedule_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This legacy booking is not linked "
                "to a schedule yet"
            ),
        )

    if (
        booking.from_route_station_id is None
        or booking.to_route_station_id is None
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This legacy booking has no "
                "boarding/destination segment"
            ),
        )

    schedule = (
        db.query(Schedule)
        .filter(
            Schedule.id == booking.schedule_id
        )
        .first()
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Booked schedule not found",
        )

    from_rs = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == booking.from_route_station_id
        )
        .first()
    )

    to_rs = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == booking.to_route_station_id
        )
        .first()
    )

    if not from_rs or not to_rs:
        raise HTTPException(
            status_code=409,
            detail="Booking route segment is invalid",
        )

    route_stations = (
        db.query(RouteStation)
        .filter(RouteStation.route_id == schedule.route_id)
        .order_by(RouteStation.order_number)
        .all()
    )

    train_stops = (
        db.query(TrainStop)
        .filter(
            TrainStop.train_id
            == schedule.train_id
        )
        .all()
    )

    stop_map = {
        stop.route_station_id: stop
        for stop in train_stops
    }

    # Critical anti-leak scope.
    logs = (
        db.query(StationArrivalLog)
        .filter(
            StationArrivalLog.schedule_id
            == schedule.id,
        )
        .order_by(
            StationArrivalLog.created_at.asc()
        )
        .all()
    )

    log_map = {}

    for log in logs:
        # If legacy duplicates exist, newest encountered wins.
        log_map[
            log.route_station_id
        ] = log

    last_reached = None
    stops = []

    for route_station in route_stations:
        train_stop = stop_map.get(
            route_station.id
        )

        log = log_map.get(
            route_station.id
        )

        if (
            log
            and log.status
            in {"ARRIVED", "DEPARTED"}
        ):
            last_reached = {
                "route_station_id": (
                    route_station.id
                ),
                "station_name": (
                    route_station.station_name
                ),
                "status": log.status,
                "arrival_time": (
                    log.arrival_time.isoformat()
                    if log.arrival_time
                    else None
                ),
                "departure_time": (
                    log.departure_time.isoformat()
                    if log.departure_time
                    else None
                ),
            }

        stops.append({
            "route_station_id": (
                route_station.id
            ),
            "station_name": (
                route_station.station_name
            ),
            "order_number": (
                route_station.order_number
            ),
            "is_boarding_station": route_station.id == from_rs.id,
            "is_destination_station": route_station.id == to_rs.id,
            "in_passenger_segment": (
                from_rs.order_number
                <= route_station.order_number
                <= to_rs.order_number
            ),
            "expected_arrival": (
                train_stop.expected_arrival_time
                .strftime("%H:%M")
                if (
                    train_stop
                    and train_stop.expected_arrival_time
                )
                else None
            ),
            "expected_departure": (
                train_stop.expected_departure_time
                .strftime("%H:%M")
                if (
                    train_stop
                    and train_stop.expected_departure_time
                )
                else None
            ),
            "actual_arrival": (
                log.arrival_time.isoformat()
                if (
                    log
                    and log.arrival_time
                )
                else None
            ),
            "actual_departure": (
                log.departure_time.isoformat()
                if (
                    log
                    and log.departure_time
                )
                else None
            ),
            "status": (
                log.status
                if log
                else "SCHEDULED"
            ),
            "arrival_delay_minutes": (
                log.arrival_delay_minutes
                if log
                else 0
            ),
        })

    return {
        "ticket_no": booking.ticket_no,
        "booking_no": booking.booking_no,
        "booking_status": (
            booking.booking_status.value
        ),
        "schedule_id": schedule.id,
        "schedule_status": schedule.status,
        "train_id": schedule.train_id,
        "travel_date": (
            schedule.departure_date.isoformat()
        ),
        "boarding_station": (
            from_rs.station_name
        ),
        "destination_station": (
            to_rs.station_name
        ),
        "last_reached": last_reached,
        "stops": stops,
    }


@router.get(
    "/ticket/{ticket_no}",
    response_model=BookingResponse,
)
async def get_booking_by_ticket(
    ticket_no: str,
    db: Session = Depends(get_db),
):
    booking = (
        db.query(Booking)
        .filter(
            Booking.ticket_no == ticket_no
        )
        .first()
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    return booking


@router.get(
    "/",
    response_model=BookingListResponse,
)
async def list_bookings(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    schedule_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Booking)

    if schedule_id is not None:
        query = query.filter(
            Booking.schedule_id
            == schedule_id
        )

    total = query.count()

    bookings = (
        query
        .order_by(Booking.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "bookings": bookings,
        "total": total,
    }


@router.get(
    "/{booking_id}",
    response_model=BookingResponse,
)
async def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
):
    booking = (
        db.query(Booking)
        .filter(
            Booking.id == booking_id
        )
        .first()
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found",
        )

    return booking


@router.post(
    "/{booking_id}/confirm",
    response_model=BookingResponse,
)
async def confirm_booking(
    booking_id: int,
    data: BookingConfirmRequest,
    db: Session = Depends(get_db),
):
    try:
        return BookingService.confirm_booking(
            db,
            booking_id,
            data.payment_amount,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
)
async def cancel_booking(
    booking_id: int,
    data: BookingCancelRequest,
    db: Session = Depends(get_db),
):
    try:
        return BookingService.cancel_booking(
            db,
            booking_id,
            data.reason,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

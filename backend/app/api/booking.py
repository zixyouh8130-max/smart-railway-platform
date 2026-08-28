# backend/api/booking.py

import asyncio
import json

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime, timedelta

from ..core.database import SessionLocal, get_db
from ..models.booking import Booking
from ..models.schedule import Schedule
from ..models.route_station import RouteStation
from ..models.train_stop import TrainStop
from ..models.train import Train
from ..models.train_rider_device import TrainRiderDevice
from ..models.location_history import LocationHistory
from ..models.station_arrival_log import (
    StationArrivalLog,
)
from ..services.booking_service import BookingService
from ..services.passenger_event_broker import passenger_event_broker
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
    train: Optional[str] = Query(
        None,
        description="Optional train number/name used to verify the ticket",
    ),
    db: Session = Depends(get_db),
):
    """
    Passenger-safe live journey tracker.

    The ticket resolves one exact dated Schedule. Runtime station state is
    always read from StationArrivalLog scoped by that schedule_id.

    `train` is optional for backwards compatibility with existing clients,
    but the public ticket status screen supplies it as a second lookup key.
    """

    def scheduled_datetime(schedule_obj, clock_time):
        if not schedule_obj.departure_date or not clock_time:
            return None

        service_date = schedule_obj.departure_date
        if (
            getattr(schedule_obj, "is_overnight", False)
            and schedule_obj.departure_time
            and clock_time < schedule_obj.departure_time
        ):
            service_date = service_date + timedelta(days=1)

        return datetime.combine(service_date, clock_time)

    def iso_or_none(value):
        return value.isoformat() if value else None

    def enum_value(value):
        return getattr(value, "value", value)

    booking = (
        db.query(Booking)
        .filter(Booking.ticket_no == ticket_no.strip())
        .first()
    )

    if not booking:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if not booking.schedule_id:
        raise HTTPException(
            status_code=409,
            detail="This booking is not linked to a schedule yet",
        )

    if (
        booking.from_route_station_id is None
        or booking.to_route_station_id is None
    ):
        raise HTTPException(
            status_code=409,
            detail="This booking has no boarding/destination segment",
        )

    schedule = (
        db.query(Schedule)
        .filter(Schedule.id == booking.schedule_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Booked schedule not found")

    train_obj = (
        db.query(Train)
        .filter(Train.id == schedule.train_id)
        .first()
    )
    if not train_obj:
        raise HTTPException(status_code=404, detail="Booked train not found")

    # The UI asks for Ticket No + Train so a mistyped/shared ticket number is
    # not enough to reveal a journey. Accept either exact train number or name.
    if train and train.strip():
        supplied = train.strip().casefold()
        valid_train_keys = {
            str(train_obj.train_no or "").strip().casefold(),
            str(train_obj.train_name or "").strip().casefold(),
        }
        if supplied not in valid_train_keys:
            raise HTTPException(
                status_code=404,
                detail="Ticket and train do not match",
            )

    from_rs = (
        db.query(RouteStation)
        .filter(RouteStation.id == booking.from_route_station_id)
        .first()
    )
    to_rs = (
        db.query(RouteStation)
        .filter(RouteStation.id == booking.to_route_station_id)
        .first()
    )
    if not from_rs or not to_rs:
        raise HTTPException(status_code=409, detail="Booking route segment is invalid")

    # Return the WHOLE run so a passenger boarding later can see where the
    # train currently is. Their booked segment is marked separately below.
    route_stations = (
        db.query(RouteStation)
        .options(joinedload(RouteStation.station))
        .filter(RouteStation.route_id == schedule.route_id)
        .order_by(RouteStation.order_number)
        .all()
    )

    train_stops = (
        db.query(TrainStop)
        .filter(TrainStop.train_id == schedule.train_id)
        .all()
    )
    stop_map = {stop.route_station_id: stop for stop in train_stops}

    # Critical anti-leak scope: never reuse logs from another run of the train.
    logs = (
        db.query(StationArrivalLog)
        .filter(StationArrivalLog.schedule_id == schedule.id)
        .order_by(StationArrivalLog.created_at.asc())
        .all()
    )
    log_map = {log.route_station_id: log for log in logs}

    full_stops = []
    last_reached = None
    latest_runtime_stop = None

    for route_station in route_stations:
        train_stop = stop_map.get(route_station.id)
        log = log_map.get(route_station.id)

        expected_arrival_dt = scheduled_datetime(
            schedule,
            train_stop.expected_arrival_time if train_stop else None,
        )
        expected_departure_dt = scheduled_datetime(
            schedule,
            train_stop.expected_departure_time if train_stop else None,
        )

        log_status = str(enum_value(log.status)) if log else "SCHEDULED"

        station_obj = getattr(route_station, "station", None)
        latitude = (
            float(station_obj.latitude)
            if station_obj is not None and station_obj.latitude is not None
            else None
        )
        longitude = (
            float(station_obj.longitude)
            if station_obj is not None and station_obj.longitude is not None
            else None
        )

        # A legacy/test Station row may not have static coordinates yet.
        # For stations the train has already reached, the runtime arrival GPS
        # is still a useful map fallback. Upcoming stations still require the
        # Station latitude/longitude to be configured.
        coordinate_source = "station" if latitude is not None and longitude is not None else None
        if (
            (latitude is None or longitude is None)
            and log is not None
            and getattr(log, "arrival_latitude", None) is not None
            and getattr(log, "arrival_longitude", None) is not None
        ):
            latitude = float(log.arrival_latitude)
            longitude = float(log.arrival_longitude)
            coordinate_source = "arrival_log"

        stop_payload = {
            "route_station_id": route_station.id,
            "station_id": route_station.station_id,
            "station_name": route_station.station_name,
            "station_code": route_station.station_code,
            "order_number": route_station.order_number,
            "latitude": latitude,
            "longitude": longitude,
            "coordinate_source": coordinate_source,
            "expected_arrival": (
                train_stop.expected_arrival_time.strftime("%H:%M")
                if train_stop and train_stop.expected_arrival_time
                else None
            ),
            "expected_departure": (
                train_stop.expected_departure_time.strftime("%H:%M")
                if train_stop and train_stop.expected_departure_time
                else None
            ),
            "expected_arrival_at": iso_or_none(expected_arrival_dt),
            "expected_departure_at": iso_or_none(expected_departure_dt),
            "actual_arrival": iso_or_none(log.arrival_time) if log else None,
            "actual_departure": iso_or_none(log.departure_time) if log else None,
            "status": log_status,
            "arrival_delay_minutes": (
                int(log.arrival_delay_minutes or 0) if log else 0
            ),
            "departure_delay_minutes": (
                int(getattr(log, "departure_delay_minutes", 0) or 0)
                if log else 0
            ),
            "in_passenger_segment": (
                from_rs.order_number
                <= route_station.order_number
                <= to_rs.order_number
            ),
            "is_boarding_station": route_station.id == from_rs.id,
            "is_destination_station": route_station.id == to_rs.id,
        }
        full_stops.append(stop_payload)

        if log and log_status in {"ARRIVED", "DEPARTED"}:
            last_reached = {
                "route_station_id": route_station.id,
                "station_name": route_station.station_name,
                "order_number": route_station.order_number,
                "status": log_status,
                "arrival_time": iso_or_none(log.arrival_time),
                "departure_time": iso_or_none(log.departure_time),
                "arrival_delay_minutes": int(log.arrival_delay_minutes or 0),
                "departure_delay_minutes": int(
                    getattr(log, "departure_delay_minutes", 0) or 0
                ),
            }
            latest_runtime_stop = stop_payload

    schedule_status = str(enum_value(schedule.status or "SCHEDULED")).upper()

    # The live TrainRiderDevice is the authoritative current/next pointer for
    # an ACTIVE run. StationArrivalLog remains the historical/runtime record,
    # but deriving the next station from log order alone is fragile during
    # manual testing or when a station row is missing.
    device_query = (
        db.query(TrainRiderDevice)
        .filter(
            TrainRiderDevice.schedule_id == schedule.id,
            TrainRiderDevice.train_id == schedule.train_id,
        )
    )

    # Prefer the device that is actively tracking this run. A stale INACTIVE
    # device may still be linked to the same schedule from earlier testing and
    # must not win simply because its generic updated_at is newer.
    tracking_device = (
        device_query
        .filter(TrainRiderDevice.status == "ACTIVE")
        .order_by(
            TrainRiderDevice.location_updated_at.desc(),
            TrainRiderDevice.updated_at.desc(),
        )
        .first()
    )

    if tracking_device is None:
        tracking_device = (
            device_query
            .order_by(
                TrainRiderDevice.location_updated_at.desc(),
                TrainRiderDevice.updated_at.desc(),
            )
            .first()
        )

    # LocationHistory is written for every successful /tracking/update-location
    # and is therefore the most reliable fallback for the passenger map.
    latest_location = (
        db.query(LocationHistory)
        .filter(LocationHistory.schedule_id == schedule.id)
        .order_by(LocationHistory.timestamp.desc())
        .first()
    )

    stop_by_id = {stop["route_station_id"]: stop for stop in full_stops}

    # Re-evaluate last_reached by the latest real runtime event rather than
    # simply the greatest route order that happens to have a log.
    runtime_logs = [
        log for log in logs
        if str(enum_value(log.status)) in {"ARRIVED", "DEPARTED"}
    ]
    if runtime_logs:
        latest_log = max(
            runtime_logs,
            key=lambda item: (
                item.departure_time
                or item.arrival_time
                or item.created_at
                or datetime.min
            ),
        )
        latest_stop = stop_by_id.get(latest_log.route_station_id)
        if latest_stop:
            latest_status = str(enum_value(latest_log.status))
            last_reached = {
                "route_station_id": latest_stop["route_station_id"],
                "station_name": latest_stop["station_name"],
                "order_number": latest_stop["order_number"],
                "status": latest_status,
                "arrival_time": iso_or_none(latest_log.arrival_time),
                "departure_time": iso_or_none(latest_log.departure_time),
                "arrival_delay_minutes": int(
                    latest_log.arrival_delay_minutes or 0
                ),
                "departure_delay_minutes": int(
                    getattr(latest_log, "departure_delay_minutes", 0) or 0
                ),
            }
            latest_runtime_stop = latest_stop

    device_current_stop = (
        stop_by_id.get(tracking_device.current_route_station_id)
        if tracking_device and tracking_device.current_route_station_id
        else None
    )
    device_next_stop = (
        stop_by_id.get(tracking_device.next_route_station_id)
        if tracking_device and tracking_device.next_route_station_id
        else None
    )

    current_station = None
    if schedule_status == "ACTIVE":
        if (
            device_current_stop
            and device_current_stop.get("status") == "ARRIVED"
        ):
            current_station = device_current_stop
        elif (
            latest_runtime_stop
            and latest_runtime_stop.get("status") == "ARRIVED"
        ):
            current_station = latest_runtime_stop

    if schedule_status == "CANCELLED":
        journey_phase = "CANCELLED"
    elif schedule_status == "COMPLETED":
        journey_phase = "COMPLETED"
    elif schedule_status == "ACTIVE":
        journey_phase = "AT_STATION" if current_station else "IN_TRANSIT"
    else:
        journey_phase = "NOT_STARTED"

    # Use the latest measured delay as a simple ETA adjustment for future
    # stations. This is intentionally a transparent demo ETA, not an ML ETA.
    live_delay_minutes = 0
    if last_reached:
        live_delay_minutes = (
            last_reached["departure_delay_minutes"]
            if last_reached["status"] == "DEPARTED"
            else last_reached["arrival_delay_minutes"]
        )

    next_station = None
    if schedule_status == "ACTIVE" and full_stops:
        # 1) First choice: pointer maintained on the ACTIVE tracking device.
        if (
            device_next_stop
            and (
                not current_station
                or device_next_stop["route_station_id"]
                != current_station["route_station_id"]
            )
            and device_next_stop.get("status") != "DEPARTED"
        ):
            next_station = device_next_stop

        # 2) Second choice: the latest runtime station log also snapshots the
        # next route-station pointer. This survives a device/context mismatch.
        if next_station is None and runtime_logs:
            latest_log_for_next = max(
                runtime_logs,
                key=lambda item: (
                    item.departure_time
                    or item.arrival_time
                    or item.created_at
                    or datetime.min
                ),
            )
            logged_next_id = getattr(
                latest_log_for_next,
                "next_route_station_id",
                None,
            )
            if logged_next_id:
                candidate = stop_by_id.get(logged_next_id)
                if candidate and candidate.get("status") != "DEPARTED":
                    next_station = candidate

        # 3) Final recovery: use the ordered route list itself, not a numeric
        # `order_number > ...` comparison. This is safer for test data with
        # odd/non-contiguous order numbers.
        if next_station is None:
            anchor_id = None
            if current_station:
                anchor_id = current_station.get("route_station_id")
            elif last_reached:
                anchor_id = last_reached.get("route_station_id")

            anchor_index = -1
            if anchor_id is not None:
                anchor_index = next(
                    (
                        idx for idx, stop in enumerate(full_stops)
                        if stop["route_station_id"] == anchor_id
                    ),
                    -1,
                )

            for stop in full_stops[anchor_index + 1:]:
                if stop.get("status") != "DEPARTED":
                    next_station = stop
                    break

    if next_station and next_station.get("expected_arrival_at"):
        eta = datetime.fromisoformat(next_station["expected_arrival_at"])
        next_station = {
            **next_station,
            "estimated_arrival": (
                eta + timedelta(minutes=live_delay_minutes)
            ).isoformat(),
        }

    train_location = None

    # Start with the live device snapshot when available.
    if (
        tracking_device
        and tracking_device.current_latitude is not None
        and tracking_device.current_longitude is not None
    ):
        train_location = {
            "latitude": float(tracking_device.current_latitude),
            "longitude": float(tracking_device.current_longitude),
            "speed_mph": (
                float(tracking_device.current_speed)
                if tracking_device.current_speed is not None
                else None
            ),
            "updated_at": iso_or_none(tracking_device.location_updated_at),
            "device_status": tracking_device.status,
            "current_route_station_id": tracking_device.current_route_station_id,
            "next_route_station_id": tracking_device.next_route_station_id,
            "source": "device",
        }

    # A 200 response from /tracking/update-location guarantees a LocationHistory
    # row was written. Prefer it when it is newer than the device snapshot, or
    # use it when the device snapshot has no coordinates.
    if latest_location is not None:
        use_history = train_location is None
        if not use_history:
            device_time = (
                tracking_device.location_updated_at
                if tracking_device is not None
                else None
            )
            if device_time is None or latest_location.timestamp >= device_time:
                use_history = True

        if use_history:
            train_location = {
                "latitude": float(latest_location.latitude),
                "longitude": float(latest_location.longitude),
                "speed_mph": (
                    float(latest_location.speed)
                    if latest_location.speed is not None
                    else None
                ),
                "updated_at": iso_or_none(latest_location.timestamp),
                "device_status": (
                    tracking_device.status if tracking_device else None
                ),
                "current_route_station_id": (
                    tracking_device.current_route_station_id
                    if tracking_device else None
                ),
                "next_route_station_id": (
                    tracking_device.next_route_station_id
                    if tracking_device else None
                ),
                "source": "location_history",
            }

    boarding_stop = next(
        (stop for stop in full_stops if stop["is_boarding_station"]),
        None,
    )
    if boarding_stop:
        estimated_boarding = boarding_stop.get("expected_arrival_at")
        if (
            schedule_status == "ACTIVE"
            and boarding_stop["status"] == "SCHEDULED"
            and estimated_boarding
        ):
            estimated_boarding = (
                datetime.fromisoformat(estimated_boarding)
                + timedelta(minutes=live_delay_minutes)
            ).isoformat()

        boarding = {
            **boarding_stop,
            "estimated_arrival": estimated_boarding,
            "is_next": bool(
                next_station
                and next_station["route_station_id"]
                == boarding_stop["route_station_id"]
            ),
            "already_departed": boarding_stop["status"] == "DEPARTED",
        }
    else:
        boarding = None

    if journey_phase == "NOT_STARTED":
        headline = "ရထား မထွက်ခွာသေးပါ။"
    elif journey_phase == "AT_STATION" and current_station:
        headline = f"ရထားသည် {current_station['station_name']} ဘူတာတွင် ရပ်နားနေပါသည်။"
    elif journey_phase == "IN_TRANSIT" and next_station:
        if last_reached:
            headline = (
                f"ရထားသည် {last_reached['station_name']} ဘူတာမှ ထွက်ခွာပြီး "
                f"{next_station['station_name']} ဘူတာသို့ ဦးတည်နေပါသည်။"
            )
        else:
            headline = f"ရထားသည် {next_station['station_name']} ဘူတာသို့ ဦးတည်နေပါသည်။"
    elif journey_phase == "COMPLETED":
        headline = "ရထားခရီးစဉ် ပြီးဆုံးပါပြီ။"
    elif journey_phase == "CANCELLED":
        headline = "ဤရထားခရီးစဉ်ကို ဖျက်သိမ်းထားပါသည်။"
    else:
        headline = "ရထားအခြေအနေကို အပ်ဒိတ်လုပ်နေပါသည်။"

    return {
        "ticket_no": booking.ticket_no,
        "booking_no": booking.booking_no,
        "booking_status": enum_value(booking.booking_status),
        "schedule_id": schedule.id,
        "schedule_status": schedule_status,
        "journey_phase": journey_phase,
        "headline": headline,
        "train_id": train_obj.id,
        "train_no": train_obj.train_no,
        "train_name": train_obj.train_name,
        "travel_date": schedule.departure_date.isoformat(),
        "scheduled_departure": (
            schedule.departure_time.strftime("%H:%M")
            if schedule.departure_time else None
        ),
        "actual_departure": iso_or_none(
            getattr(schedule, "actual_departure_time", None)
        ),
        "actual_arrival": iso_or_none(
            getattr(schedule, "actual_arrival_time", None)
        ),
        "boarding_station": from_rs.station_name,
        "destination_station": to_rs.station_name,
        "last_reached": last_reached,
        "current_station": current_station,
        "next_station": next_station,
        "train_location": train_location,
        "tracking_debug": {
            "device_found": tracking_device is not None,
            "device_status": (tracking_device.status if tracking_device else None),
            "device_current_route_station_id": (
                tracking_device.current_route_station_id
                if tracking_device else None
            ),
            "device_next_route_station_id": (
                tracking_device.next_route_station_id
                if tracking_device else None
            ),
            "latest_location_history_found": latest_location is not None,
            "latest_runtime_next_route_station_id": (
                getattr(latest_log, "next_route_station_id", None)
                if runtime_logs else None
            ),
        },
        "live_delay_minutes": live_delay_minutes,
        "boarding": boarding,
        "notification_recommended": schedule_status in {
            "SCHEDULED", "DELAYED", "ACTIVE"
        } and bool(boarding and not boarding["already_departed"]),
        "poll_after_seconds": 15,
        "stops": full_stops,
    }


@router.get("/ticket/{ticket_no}/events")
async def stream_ticket_station_events(
    ticket_no: str,
    request: Request,
    train: str = Query(
        ...,
        min_length=1,
        description="Train number/name used to verify the ticket",
    ),
):
    """Stream schedule-scoped StationArrivalLog transitions to a passenger.

    This replaces passenger-side 15-second polling. The connection stays open
    and sends data only when the train creates a real ARRIVED/DEPARTED runtime
    transition. A tiny comment ping keeps proxies from closing an otherwise
    idle stream; it does not trigger database or journey-status reads.
    """
    db = SessionLocal()
    try:
        booking = (
            db.query(Booking)
            .filter(Booking.ticket_no == ticket_no.strip())
            .first()
        )
        if not booking:
            raise HTTPException(
                status_code=404,
                detail="လက်မှတ်ကို ရှာမတွေ့ပါ",
            )
        if not booking.schedule_id:
            raise HTTPException(
                status_code=409,
                detail="ဤလက်မှတ်တွင် ခရီးစဉ်အချိန်ဇယား ချိတ်ဆက်ထားခြင်း မရှိသေးပါ",
            )

        schedule = (
            db.query(Schedule)
            .filter(Schedule.id == booking.schedule_id)
            .first()
        )
        if not schedule:
            raise HTTPException(
                status_code=404,
                detail="လက်မှတ်နှင့် သက်ဆိုင်သော ခရီးစဉ်ကို ရှာမတွေ့ပါ",
            )

        train_obj = (
            db.query(Train)
            .filter(Train.id == schedule.train_id)
            .first()
        )
        if not train_obj:
            raise HTTPException(
                status_code=404,
                detail="လက်မှတ်နှင့် သက်ဆိုင်သော ရထားကို ရှာမတွေ့ပါ",
            )

        supplied = train.strip().casefold()
        valid_train_keys = {
            str(train_obj.train_no or "").strip().casefold(),
            str(train_obj.train_name or "").strip().casefold(),
        }
        if supplied not in valid_train_keys:
            raise HTTPException(
                status_code=404,
                detail="လက်မှတ်နှင့် ရထားအချက်အလက် မကိုက်ညီပါ",
            )

        schedule_id = int(schedule.id)
    finally:
        # Never hold a SQLAlchemy connection for the lifetime of an SSE stream.
        db.close()

    queue = await passenger_event_broker.subscribe(schedule_id)

    async def event_stream():
        try:
            # EventSource uses this value for automatic reconnects.
            yield "retry: 5000\n\n"

            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    payload = json.dumps(event, ensure_ascii=False)
                    yield f"event: station-status\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    # SSE keepalive only. No DB query and no passenger refresh.
                    yield ": ချိတ်ဆက်မှုထိန်းသိမ်းခြင်း\n\n"
        finally:
            await passenger_event_broker.unsubscribe(schedule_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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

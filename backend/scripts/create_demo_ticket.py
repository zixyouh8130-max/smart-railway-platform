#!/usr/bin/env python3
"""Create one account-free demo passenger ticket for an existing Schedule.

Run from the backend project root, for example:

    python scripts/create_demo_ticket.py --schedule-id 42

The first run without --from-order/--to-order prints the route station order.
Then create the ticket:

    python scripts/create_demo_ticket.py \
        --schedule-id 42 --from-order 5 --to-order 12
"""

from __future__ import annotations

import argparse
import random
import string
import sys
from pathlib import Path

# Allow `python scripts/create_demo_ticket.py` from the backend root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal  # noqa: E402
from app.models.booking import (  # noqa: E402
    Booking,
    BookingStatus,
    PaymentStatus,
)
from app.models.coach import Coach  # noqa: E402
from app.models.route_station import RouteStation  # noqa: E402
from app.models.schedule import Schedule  # noqa: E402
from app.models.seat import Seat  # noqa: E402
from app.models.train import Train  # noqa: E402


def _token(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=length))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a confirmed demo ticket for one existing schedule."
    )
    parser.add_argument("--schedule-id", type=int, required=True)
    parser.add_argument("--from-order", type=int)
    parser.add_argument("--to-order", type=int)
    parser.add_argument(
        "--ticket-no",
        help="Optional fixed ticket number. Defaults to DEMO-<schedule>-<random>.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        schedule = (
            db.query(Schedule)
            .filter(Schedule.id == args.schedule_id)
            .first()
        )
        if not schedule:
            print(f"ERROR: schedule #{args.schedule_id} was not found.")
            return 1

        train = (
            db.query(Train)
            .filter(Train.id == schedule.train_id)
            .first()
        )
        if not train:
            print("ERROR: schedule train was not found.")
            return 1

        route_stations = (
            db.query(RouteStation)
            .filter(RouteStation.route_id == schedule.route_id)
            .order_by(RouteStation.order_number)
            .all()
        )
        if len(route_stations) < 2:
            print("ERROR: this schedule route needs at least two stations.")
            return 1

        print("\nSchedule")
        print(f"  ID:       {schedule.id}")
        print(f"  Train:    {train.train_no} - {train.train_name}")
        print(f"  Date:     {schedule.departure_date}")
        print(f"  Status:   {schedule.status}")
        print("\nRoute stations")
        for station in route_stations:
            print(
                f"  {station.order_number:>2}: "
                f"{station.station_name} (route_station_id={station.id})"
            )

        if args.from_order is None or args.to_order is None:
            print(
                "\nNo ticket created yet. Re-run with "
                "--from-order <N> --to-order <N>."
            )
            return 0

        station_by_order = {
            station.order_number: station for station in route_stations
        }
        from_rs = station_by_order.get(args.from_order)
        to_rs = station_by_order.get(args.to_order)

        if not from_rs or not to_rs:
            print("ERROR: from/to order must exist in the route list above.")
            return 1
        if from_rs.order_number >= to_rs.order_number:
            print("ERROR: destination must come after the boarding station.")
            return 1

        # Pick one real physical passenger seat belonging to this train.
        seat_candidates = (
            db.query(Seat)
            .join(Coach, Seat.coach_id == Coach.id)
            .filter(
                Coach.train_id == schedule.train_id,
                Coach.is_active.is_(True),
                Seat.is_active.is_(True),
                Coach.coach_type.notin_(["BAGGAGE", "DINING"]),
            )
            .order_by(Coach.order_number, Seat.id)
            .all()
        )

        seat = None
        for candidate in seat_candidates:
            conflict = (
                db.query(Booking.id)
                .filter(
                    Booking.schedule_id == schedule.id,
                    Booking.seat_id == candidate.id,
                    Booking.is_active.is_(True),
                    Booking.booking_status.in_([
                        BookingStatus.RESERVED,
                        BookingStatus.CONFIRMED,
                    ]),
                )
                .first()
            )
            if not conflict:
                seat = candidate
                break

        if seat is None:
            print(
                "ERROR: no free active passenger seat exists for this train. "
                "Configure coaches/seats or use a schedule with a free seat."
            )
            return 1

        ticket_no = (args.ticket_no or f"DEMO-{schedule.id}-{_token()}").strip()
        if len(ticket_no) > 50:
            print("ERROR: ticket number must be at most 50 characters.")
            return 1

        existing = (
            db.query(Booking)
            .filter(Booking.ticket_no == ticket_no)
            .first()
        )
        if existing:
            print(f"ERROR: ticket number {ticket_no!r} already exists.")
            return 1

        booking = Booking(
            customer_name="Demo Passenger",
            nrc="DEMO",
            phone=None,
            email=None,
            ticket_no=ticket_no,
            booking_no=f"DEMO-BKG-{schedule.id}-{_token(5)}",
            schedule_id=schedule.id,
            train_id=schedule.train_id,
            seat_id=seat.id,
            from_route_station_id=from_rs.id,
            to_route_station_id=to_rs.id,
            travel_date=schedule.departure_date,
            base_fare=0.0,
            tax=0.0,
            service_fee=0.0,
            total_cost=0.0,
            booking_status=BookingStatus.CONFIRMED,
            payment_status=PaymentStatus.PAID,
            passenger_count=1,
            passenger_names="Demo Passenger",
            notes="Demo ticket for live journey-status testing",
            is_active=True,
        )

        db.add(booking)
        db.commit()
        db.refresh(booking)

        print("\nDEMO TICKET CREATED")
        print(f"  Ticket No:   {booking.ticket_no}")
        print(f"  Train input: {train.train_no}")
        print(f"  Train name:  {train.train_name}")
        print(f"  Schedule:    {schedule.id}")
        print(f"  Board at:    {from_rs.station_name}")
        print(f"  Destination: {to_rs.station_name}")
        print(f"  Seat ID:     {seat.id}")
        print(
            "\nUse Ticket No + Train input on /pnr-status to test the live flow."
        )
        return 0

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

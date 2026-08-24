# services/schedule_service.py

from uuid import UUID
from datetime import time, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict

from sqlalchemy.orm import Session

from ..models import TrainStaffAssignment, AssignmentStatus, Schedule
from ..models.route import Route
from ..models.route_station import RouteStation
from ..models.train import Train
from ..models.train_stop import TrainStop
from ..models.station_arrival_log import StationArrivalLog


class ScheduleService:
    """
    Schedule/timetable service.

    TrainStop = reusable STATIC timetable template.
    StationArrivalLog = actual runtime state for one schedule_id.
    """

    LOCAL_TZ = ZoneInfo("Asia/Yangon")

    def __init__(self, db: Session):
        self.db = db

    def _local_now_naive(self) -> datetime:
        return datetime.now(self.LOCAL_TZ).replace(tzinfo=None)

    def _combine_schedule_time(
        self,
        schedule: Schedule,
        stop_time: Optional[time]
    ) -> Optional[datetime]:
        if schedule.departure_date is None or stop_time is None:
            return None

        service_date = schedule.departure_date

        if (
            schedule.is_overnight
            and schedule.departure_time is not None
            and stop_time < schedule.departure_time
        ):
            service_date = service_date + timedelta(days=1)

        return datetime.combine(service_date, stop_time)

    def _scheduled_assignment_start(self, schedule: Schedule) -> datetime:
        if schedule.departure_time:
            return datetime.combine(
                schedule.departure_date,
                schedule.departure_time
            )

        return datetime.combine(
            schedule.departure_date,
            time.min
        )

    # ============================================================
    # Static TrainStop timetable
    # ============================================================

    def get_train_schedule(
        self,
        train_id: int,
        route_id: int
    ) -> List[Dict]:
        """
        Return STATIC expected timetable data only.

        No actual times/status are read from TrainStop.
        """
        stops = (
            self.db.query(TrainStop)
            .join(
                RouteStation,
                TrainStop.route_station_id == RouteStation.id
            )
            .filter(
                TrainStop.train_id == train_id,
                RouteStation.route_id == route_id
            )
            .order_by(RouteStation.order_number)
            .all()
        )

        result = []

        for stop in stops:
            rs = stop.route_station

            result.append({
                "train_stop_id": stop.id,
                "route_station_id": stop.route_station_id,
                "station_name": rs.station_name if rs else None,
                "station_code": rs.station_code if rs else None,
                "order_number": rs.order_number if rs else None,
                "distance_from_origin": (
                    rs.distance_from_origin if rs else None
                ),
                "distance_unit": "mile",
                "is_major_stop": (
                    rs.is_major_stop if rs else False
                ),
                "expected_arrival_time": (
                    stop.expected_arrival_time.strftime("%H:%M")
                    if stop.expected_arrival_time
                    else None
                ),
                "expected_departure_time": (
                    stop.expected_departure_time.strftime("%H:%M")
                    if stop.expected_departure_time
                    else None
                ),
                "arrival_buffer_minutes": stop.arrival_buffer_minutes,
                "departure_buffer_minutes": stop.departure_buffer_minutes,
                "stop_duration_minutes": stop.stop_duration_minutes,
                "is_timed_stop": stop.is_timed_stop
            })

        return result

    def calculate_train_arrival_times(
        self,
        route_id: int,
        train_id: int,
        departure_time: Optional[str] = None
    ) -> List[Dict]:
        """
        Build/update the STATIC TrainStop timetable.

        Existing TrainStop rows are updated in place instead of being deleted
        and recreated, preserving stable IDs referenced by historical logs.
        """
        route = (
            self.db.query(Route)
            .filter(Route.id == route_id)
            .first()
        )
        if not route:
            raise ValueError("Route not found")

        train = (
            self.db.query(Train)
            .filter(Train.id == train_id)
            .first()
        )
        if not train:
            raise ValueError("Train not found")

        if train.route_id != route_id:
            raise ValueError("Train is not assigned to this route")

        stations = (
            self.db.query(RouteStation)
            .filter(RouteStation.route_id == route_id)
            .order_by(RouteStation.order_number)
            .all()
        )
        if not stations:
            raise ValueError("No stations found for this route")

        if departure_time:
            try:
                hour, minute = map(int, departure_time.split(":"))
                base_departure = time(hour, minute)
            except Exception as exc:
                raise ValueError("departure_time must be HH:MM") from exc
        else:
            route_start_time = getattr(route, "start_time", None)
            if not route_start_time:
                raise ValueError(
                    "Provide departure_time because the route "
                    "has no default start_time"
                )
            base_departure = route_start_time

        base_datetime = datetime.combine(
            datetime(2000, 1, 1).date(),
            base_departure
        )

        existing_stops = (
            self.db.query(TrainStop)
            .filter(
                TrainStop.train_id == train_id,
                TrainStop.route_station_id.in_(
                    [station.id for station in stations]
                )
            )
            .all()
        )

        existing_map = {
            stop.route_station_id: stop
            for stop in existing_stops
        }

        result = []

        try:
            for index, station in enumerate(stations):
                stop = existing_map.get(station.id)

                if stop is None:
                    stop = TrainStop(
                        train_id=train_id,
                        route_station_id=station.id,
                        stop_duration_minutes=2,
                        is_timed_stop=True,
                        arrival_buffer_minutes=0,
                        departure_buffer_minutes=0,
                    )
                    self.db.add(stop)
                    self.db.flush()
                    existing_map[station.id] = stop

                if index == 0:
                    # The supplied base time is the origin departure time.
                    arrival_dt = base_datetime
                    departure_dt = base_datetime
                else:
                    # RouteStation owns only the route-level offset. Do not
                    # invent a 30-minute leg when the offset is missing.
                    if station.time_from_origin_minutes is None:
                        raise ValueError(
                            f"Route station '{station.station_name}' "
                            "has no time_from_origin_minutes configured"
                        )

                    arrival_dt = (
                        base_datetime
                        + timedelta(
                            minutes=station.time_from_origin_minutes
                        )
                    )

                    stop_duration = (
                        stop.stop_duration_minutes
                        if stop.stop_duration_minutes is not None
                        else 2
                    )
                    departure_dt = (
                        arrival_dt
                        + timedelta(minutes=stop_duration)
                    )

                # Only TrainStop stores train-specific timetable/config.
                stop.expected_arrival_time = arrival_dt.time()
                stop.expected_departure_time = departure_dt.time()
                stop.arrival_buffer_minutes = (
                    stop.arrival_buffer_minutes or 0
                )
                stop.departure_buffer_minutes = (
                    stop.departure_buffer_minutes or 0
                )
                stop.stop_duration_minutes = (
                    stop.stop_duration_minutes
                    if stop.stop_duration_minutes is not None
                    else 2
                )
                stop.is_timed_stop = (
                    True if stop.is_timed_stop is None
                    else stop.is_timed_stop
                )

                result.append({
                    "train_stop_id": stop.id,
                    "route_station_id": station.id,
                    "station_name": station.station_name,
                    "station_code": station.station_code,
                    "order_number": station.order_number,
                    "expected_arrival_time": (
                        stop.expected_arrival_time.strftime("%H:%M")
                    ),
                    "expected_departure_time": (
                        stop.expected_departure_time.strftime("%H:%M")
                    )
                })

            self.db.commit()
            return result

        except Exception:
            self.db.rollback()
            raise

    # ============================================================
    # Dynamic "next train" lookup
    # ============================================================

    def calculate_next_train_arrival(
        self,
        route_id: int,
        train_id: int,
        station_order: int
    ) -> Optional[Dict]:
        """
        Find the next DATED schedule at a station.

        Expected time comes from TrainStop.
        Runtime state comes from StationArrivalLog scoped by schedule_id.
        """
        route_station = (
            self.db.query(RouteStation)
            .filter(
                RouteStation.route_id == route_id,
                RouteStation.order_number == station_order
            )
            .first()
        )

        if not route_station:
            return None

        train_stop = (
            self.db.query(TrainStop)
            .filter(
                TrainStop.train_id == train_id,
                TrainStop.route_station_id == route_station.id
            )
            .first()
        )

        if not train_stop or not train_stop.expected_arrival_time:
            return None

        now = self._local_now_naive()

        schedules = (
            self.db.query(Schedule)
            .filter(
                Schedule.train_id == train_id,
                Schedule.route_id == route_id,
                Schedule.status.in_([
                    "SCHEDULED",
                    "ACTIVE",
                    "DELAYED"
                ]),
                Schedule.departure_date >= (
                    now.date() - timedelta(days=1)
                )
            )
            .order_by(
                Schedule.departure_date,
                Schedule.departure_time
            )
            .all()
        )

        for schedule in schedules:
            expected_arrival = self._combine_schedule_time(
                schedule,
                train_stop.expected_arrival_time
            )

            if expected_arrival is None:
                continue

            runtime_log = (
                self.db.query(StationArrivalLog)
                .filter(
                    StationArrivalLog.schedule_id == schedule.id,
                    StationArrivalLog.route_station_id == route_station.id
                )
                .order_by(StationArrivalLog.created_at.desc())
                .first()
            )

            # That dated run has already left this station.
            if runtime_log and runtime_log.status == "DEPARTED":
                continue

            # Train is currently/actually at the station.
            if runtime_log and runtime_log.arrival_time:
                return {
                    "schedule_id": schedule.id,
                    "train_id": train_id,
                    "route_id": route_id,
                    "station_name": route_station.station_name,
                    "station_order": station_order,
                    "expected_arrival": expected_arrival.isoformat(),
                    "actual_arrival": (
                        runtime_log.arrival_time.isoformat() + "Z"
                    ),
                    "minutes_until_arrival": 0,
                    "status": runtime_log.status,
                    "timing_source": "STATION_ARRIVAL_LOG",
                    "is_timed_stop": train_stop.is_timed_stop
                }

            # Future scheduled run or active run not yet at this station.
            if expected_arrival >= now or schedule.status == "ACTIVE":
                minutes_until_arrival = max(
                    0,
                    int(
                        (
                            expected_arrival - now
                        ).total_seconds()
                        / 60
                    )
                )

                return {
                    "schedule_id": schedule.id,
                    "train_id": train_id,
                    "route_id": route_id,
                    "station_name": route_station.station_name,
                    "station_order": station_order,
                    "expected_arrival": expected_arrival.isoformat(),
                    "actual_arrival": None,
                    "minutes_until_arrival": minutes_until_arrival,
                    "status": schedule.status,
                    "timing_source": "TRAIN_STOP_EXPECTED",
                    "is_timed_stop": train_stop.is_timed_stop
                }

        return None

    def get_route_schedule(self, route_id: int) -> Dict[str, List[Dict]]:
        """Static timetable templates for all trains on a route."""
        route = (
            self.db.query(Route)
            .filter(Route.id == route_id)
            .first()
        )
        if not route:
            raise ValueError("Route not found")

        trains = (
            self.db.query(Train)
            .filter(Train.route_id == route_id)
            .all()
        )

        return {
            train.train_no: self.get_train_schedule(
                train.id,
                route_id
            )
            for train in trains
        }

    # ============================================================
    # Dated schedules + staff assignments
    # ============================================================

    def create_schedules_bulk(
        self,
        schedules_data: List[dict]
    ) -> List[Schedule]:
        created_schedules = []

        try:
            for raw_data in schedules_data:
                schedule_data = dict(raw_data)

                driver_id = schedule_data.pop("driver_id", None)
                assistant_driver_id = schedule_data.pop(
                    "assistant_driver_id",
                    None
                )
                guard_id = schedule_data.pop("guard_id", None)
                ticket_checker_ids = schedule_data.pop(
                    "ticket_checker_ids",
                    []
                )

                schedule = Schedule(**schedule_data)
                self.db.add(schedule)
                self.db.flush()

                staff_assignments = []

                if driver_id:
                    staff_assignments.append(
                        (driver_id, "TRAIN_DRIVER")
                    )
                if assistant_driver_id:
                    staff_assignments.append(
                        (assistant_driver_id, "ASSISTANT_DRIVER")
                    )
                if guard_id:
                    staff_assignments.append(
                        (guard_id, "TRAIN_GUARD")
                    )

                for checker_id in ticket_checker_ids:
                    if checker_id:
                        staff_assignments.append(
                            (checker_id, "TICKET_CHECKER")
                        )

                for staff_id, role in staff_assignments:
                    self.db.add(
                        TrainStaffAssignment(
                            staff_id=UUID(str(staff_id)),
                            train_id=schedule.train_id,
                            schedule_id=schedule.id,
                            role_on_train=role,
                            assignment_date=datetime.combine(schedule.departure_date, time.min),
                            start_time=self._scheduled_assignment_start(
                                schedule
                            ),
                            status=AssignmentStatus.SCHEDULED
                        )
                    )

                created_schedules.append(schedule)

            self.db.commit()

            for schedule in created_schedules:
                self.db.refresh(schedule)

            return created_schedules

        except Exception:
            self.db.rollback()
            raise

    def update_schedule_with_staff(
        self,
        schedule_id: int,
        update_data: dict
    ) -> Schedule:
        schedule = (
            self.db.query(Schedule)
            .filter(Schedule.id == schedule_id)
            .first()
        )

        if not schedule:
            raise ValueError("Schedule not found")

        if schedule.status != "SCHEDULED":
            raise ValueError(
                "Only SCHEDULED services can have their staff plan replaced"
            )

        payload = dict(update_data)

        driver_id = payload.pop("driver_id", None)
        assistant_driver_id = payload.pop(
            "assistant_driver_id",
            None
        )
        guard_id = payload.pop("guard_id", None)
        ticket_checker_ids = payload.pop(
            "ticket_checker_ids",
            []
        )

        try:
            for key, value in payload.items():
                if value is not None:
                    setattr(schedule, key, value)

            (
                self.db.query(TrainStaffAssignment)
                .filter(
                    TrainStaffAssignment.schedule_id == schedule_id
                )
                .delete(synchronize_session=False)
            )

            staff_assignments = []

            if driver_id:
                staff_assignments.append(
                    (driver_id, "TRAIN_DRIVER")
                )
            if assistant_driver_id:
                staff_assignments.append(
                    (assistant_driver_id, "ASSISTANT_DRIVER")
                )
            if guard_id:
                staff_assignments.append(
                    (guard_id, "TRAIN_GUARD")
                )

            for checker_id in ticket_checker_ids:
                if checker_id:
                    staff_assignments.append(
                        (checker_id, "TICKET_CHECKER")
                    )

            for staff_id, role in staff_assignments:
                self.db.add(
                    TrainStaffAssignment(
                        staff_id=UUID(str(staff_id)),
                        train_id=schedule.train_id,
                        schedule_id=schedule.id,
                        role_on_train=role,
                        assignment_date=datetime.combine(schedule.departure_date, time.min),
                        start_time=self._scheduled_assignment_start(
                            schedule
                        ),
                        status=AssignmentStatus.SCHEDULED
                    )
                )

            self.db.commit()
            self.db.refresh(schedule)
            return schedule

        except Exception:
            self.db.rollback()
            raise
# services/location_tracking_service.py

from typing import Optional
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

from sqlalchemy.orm import Session

from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..models.train_rider_device import TrainRiderDevice
from ..models.location_history import LocationHistory
from ..models.station_arrival_log import StationArrivalLog
from ..models.train_stop import TrainStop
from ..models.route_station import RouteStation
from ..models.schedule import Schedule
from ..models.station import Station
from ..models.staff import Staff, StaffStatus
from ..core.railway_time import railway_now



class LocationTrackingService:
    """
    Runtime tracking for one device bound to one exact schedule.

    Source of truth:
    - TrainStop = static expected timetable only.
    - StationArrivalLog = schedule-specific actual state.
    - LocationHistory = schedule-specific GPS history.
    - TrainRiderDevice = current live pointer.
    """

    # Phone GPS commonly varies by several metres. Use hysteresis so a noisy
    # fix cannot flap ARRIVED/DEPARTED around one boundary.
    ARRIVAL_RADIUS_METERS = 30.0
    DEPARTURE_RADIUS_METERS = 50.0

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def calculate_distance(
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float
    ) -> float:
        earth_radius_m = 6_371_000
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)

        a = (
            sin(delta_lat / 2) ** 2
            + cos(lat1_rad)
            * cos(lat2_rad)
            * sin(delta_lon / 2) ** 2
        )
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earth_radius_m * c

    # ============================================================
    # Context helpers
    # ============================================================

    def _get_device(self, device_id_str: str) -> TrainRiderDevice:
        """
        Tracking must use a device already created/assigned by start_journey.

        Do not silently create an unassigned device here because that removes
        the exact schedule context required for correct event isolation.
        """
        device = (
            self.db.query(TrainRiderDevice)
            .filter(TrainRiderDevice.device_id == device_id_str)
            .first()
        )
        if not device:
            raise ValueError("Device not found")
        return device

    def _assert_device_owner(
        self,
        device: TrainRiderDevice,
        actor_staff_id: Optional[str]
    ) -> None:
        """Ensure the authenticated train crew member owns this staff device."""
        if not actor_staff_id:
            raise ValueError("Authenticated staff identity is required")

        staff = (
            self.db.query(Staff)
            .filter(Staff.staff_id == actor_staff_id)
            .first()
        )
        if not staff:
            raise ValueError("Authenticated staff profile not found")

        if device.staff_id != staff.id:
            raise ValueError("This tracking device is not assigned to the logged-in staff member")

    def _get_schedule_for_device(self, device: TrainRiderDevice) -> Schedule:
        if not device.schedule_id:
            raise ValueError("Device is not assigned to a schedule")

        schedule = (
            self.db.query(Schedule)
            .filter(Schedule.id == device.schedule_id)
            .first()
        )
        if not schedule:
            raise ValueError("Assigned schedule not found")

        if device.train_id != schedule.train_id:
            raise ValueError(
                "Device train_id does not match schedule.train_id"
            )

        return schedule

    def _get_station_coordinates(self, route_station: RouteStation):
        if not route_station.station_id:
            return None

        station = (
            self.db.query(Station)
            .filter(Station.id == route_station.station_id)
            .first()
        )

        if (
            not station
            or station.latitude is None
            or station.longitude is None
        ):
            return None

        return float(station.latitude), float(station.longitude)

    def _get_route_context(self, schedule: Schedule):
        route_stations = (
            self.db.query(RouteStation)
            .filter(RouteStation.route_id == schedule.route_id)
            .order_by(RouteStation.order_number)
            .all()
        )

        train_stops = (
            self.db.query(TrainStop)
            .filter(TrainStop.train_id == schedule.train_id)
            .all()
        )

        train_stops_map = {
            stop.route_station_id: stop
            for stop in train_stops
        }

        return route_stations, train_stops_map

    def _get_runtime_log(
        self,
        schedule_id: int,
        route_station_id: int
    ) -> Optional[StationArrivalLog]:
        """
        Exact runtime identity for one station in one run.

        Never identify current state with train_stop_id alone, device_id alone,
        train_id alone, or "latest log".
        """
        return (
            self.db.query(StationArrivalLog)
            .filter(
                StationArrivalLog.schedule_id == schedule_id,
                StationArrivalLog.route_station_id == route_station_id
            )
            .order_by(StationArrivalLog.created_at.desc())
            .first()
        )

    def _expected_datetime(
        self,
        schedule: Schedule,
        expected_time
    ) -> Optional[datetime]:
        """
        Attach a TrainStop time-of-day to this schedule's service date.
        """
        if schedule.departure_date is None or expected_time is None:
            return None

        service_date = schedule.departure_date

        if (
            schedule.is_overnight
            and schedule.departure_time is not None
            and expected_time < schedule.departure_time
        ):
            service_date = service_date + timedelta(days=1)

        return datetime.combine(service_date, expected_time)

    def _get_next_route_station(
        self,
        schedule: Schedule,
        current_route_station: RouteStation
    ) -> Optional[RouteStation]:
        return (
            self.db.query(RouteStation)
            .filter(
                RouteStation.route_id == schedule.route_id,
                RouteStation.order_number > current_route_station.order_number
            )
            .order_by(RouteStation.order_number)
            .first()
        )

    # ============================================================
    # Location update
    # ============================================================

    def update_device_location(
        self,
        device_id: str,
        latitude: float,
        longitude: float,
        speed: Optional[float] = None,
        accuracy: Optional[float] = None,
        manual_arrival: bool = False,
        route_station_id: Optional[int] = None,
        train_stop_id: Optional[int] = None,
        actor_staff_id: Optional[str] = None
    ) -> dict:
        device = self._get_device(device_id)
        self._assert_device_owner(device, actor_staff_id)
        schedule = self._get_schedule_for_device(device)

        if schedule.status != "ACTIVE":
            raise ValueError(f"Schedule #{schedule.id} is not active")

        current_time = railway_now()

        try:
            device.current_latitude = float(latitude)
            device.current_longitude = float(longitude)
            device.current_speed = (
                float(speed) if speed is not None else None
            )
            device.location_updated_at = current_time

            # IMPORTANT: GPS history belongs to this exact schedule.
            location_log = LocationHistory(
                device_id=device.id,
                schedule_id=schedule.id,
                latitude=float(latitude),
                longitude=float(longitude),
                speed=float(speed) if speed is not None else None,
                accuracy=float(accuracy) if accuracy is not None else None,
                timestamp=current_time
            )
            self.db.add(location_log)

            result = {
                "device_id": device_id,
                "schedule_id": schedule.id,
                "status": "updated",
                "arrival_detected": False,
                "arrival_radius_m": self.ARRIVAL_RADIUS_METERS,
                "departure_radius_m": self.DEPARTURE_RADIUS_METERS
            }

            if manual_arrival:
                if not route_station_id:
                    raise ValueError(
                        "route_station_id is required for manual arrival"
                    )
                if device.current_route_station_id is not None:
                    raise ValueError(
                        "Cannot mark another arrival until the current station has departed"
                    )
                if device.next_route_station_id != route_station_id:
                    raise ValueError(
                        "Manual arrival is allowed only for the next expected station"
                    )

                result.update(
                    self._handle_manual_arrival(
                        device=device,
                        schedule=schedule,
                        route_station_id=route_station_id,
                        train_stop_id=train_stop_id,
                        latitude=latitude,
                        longitude=longitude
                    )
                )
            else:
                result.update(
                    self.check_station_proximity(
                        device=device,
                        schedule=schedule,
                        latitude=latitude,
                        longitude=longitude
                    )
                )

            self.db.commit()
            return result

        except Exception:
            self.db.rollback()
            raise

    # ============================================================
    # Automatic arrival/departure
    # ============================================================

    def check_station_proximity(
        self,
        device: TrainRiderDevice,
        schedule: Schedule,
        latitude: float,
        longitude: float
    ) -> dict:
        """
        Use StationArrivalLog for runtime state.
        TrainStop is read-only expected timetable data.
        """
        result = {
            "arrival_detected": False,
            "station_name": None,
            "next_station": None,
            "auto_departed": False
        }

        route_stations, train_stops_map = self._get_route_context(schedule)

        if not route_stations:
            return result

        current_time = railway_now()

        # 1) If currently at an ARRIVED station, test for departure.
        if device.current_route_station_id:
            current_rs = next(
                (
                    rs
                    for rs in route_stations
                    if rs.id == device.current_route_station_id
                ),
                None
            )

            if current_rs:
                current_log = self._get_runtime_log(
                    schedule.id,
                    current_rs.id
                )

                if current_log and current_log.status == "ARRIVED":
                    coords = self._get_station_coordinates(current_rs)

                    if coords:
                        distance = self.calculate_distance(
                            latitude,
                            longitude,
                            coords[0],
                            coords[1]
                        )
                        result["distance_to_station_m"] = round(distance, 1)
                        result["proximity_station_name"] = current_rs.station_name

                        if distance > self.DEPARTURE_RADIUS_METERS:
                            depart_result = self._auto_depart_from_station(
                                device=device,
                                schedule=schedule,
                                route_station=current_rs,
                                current_time=current_time
                            )
                            result.update(depart_result)

                            # Do not auto-arrive at another station in the
                            # same GPS event that triggered departure.
                            if depart_result.get("auto_departed"):
                                return result

        # 2) Determine exactly one next candidate station.
        candidate = None

        if device.next_route_station_id:
            candidate = next(
                (
                    rs
                    for rs in route_stations
                    if rs.id == device.next_route_station_id
                ),
                None
            )

        if candidate is None:
            # Recovery path: first route station without completed runtime state.
            for rs in route_stations:
                log = self._get_runtime_log(schedule.id, rs.id)

                if (
                    log is None
                    or log.status not in {"ARRIVED", "DEPARTED"}
                ):
                    candidate = rs
                    break

        if candidate is None:
            return result

        existing_log = self._get_runtime_log(
            schedule.id,
            candidate.id
        )

        if (
            existing_log
            and existing_log.status in {"ARRIVED", "DEPARTED"}
        ):
            return result

        train_stop = train_stops_map.get(candidate.id)

        if not train_stop:
            result["error"] = (
                "Static TrainStop timetable row missing for "
                f"route_station_id={candidate.id}"
            )
            return result

        coords = self._get_station_coordinates(candidate)

        if not coords:
            return result

        distance = self.calculate_distance(
            latitude,
            longitude,
            coords[0],
            coords[1]
        )
        result["distance_to_station_m"] = round(distance, 1)
        result["proximity_station_name"] = candidate.station_name

        if distance > self.ARRIVAL_RADIUS_METERS:
            return result

        is_last_station = (
            candidate.order_number
            == route_stations[-1].order_number
        )

        return self._auto_arrive_at_station(
            device=device,
            schedule=schedule,
            route_station=candidate,
            train_stop=train_stop,
            latitude=latitude,
            longitude=longitude,
            current_time=current_time,
            is_last_station=is_last_station
        )

    def _auto_arrive_at_station(
        self,
        device: TrainRiderDevice,
        schedule: Schedule,
        route_station: RouteStation,
        train_stop: TrainStop,
        latitude: float,
        longitude: float,
        current_time: datetime,
        is_last_station: bool
    ) -> dict:
        """
        Create/update one schedule-specific arrival row.
        TrainStop is never mutated.
        """
        arrival_log = self._get_runtime_log(
            schedule.id,
            route_station.id
        )

        if arrival_log:
            if arrival_log.status == "ARRIVED":
                return {
                    "arrival_detected": False,
                    "message": "Station already arrived"
                }

            if arrival_log.status == "DEPARTED":
                return {
                    "arrival_detected": False,
                    "message": "Station already departed"
                }

        if arrival_log is None:
            arrival_log = StationArrivalLog(
                device_id=device.id,
                train_id=schedule.train_id,
                schedule_id=schedule.id,
                route_station_id=route_station.id,
                train_stop_id=train_stop.id,
                schedule_date=schedule.departure_date,
                expected_arrival_time=train_stop.expected_arrival_time,
                expected_departure_time=train_stop.expected_departure_time
            )
            self.db.add(arrival_log)

        arrival_log.arrival_time = arrival_log.arrival_time or current_time
        arrival_log.arrival_latitude = float(latitude)
        arrival_log.arrival_longitude = float(longitude)
        arrival_log.status = "ARRIVED"

        expected_arrival_dt = self._expected_datetime(
            schedule,
            train_stop.expected_arrival_time
        )

        if expected_arrival_dt:
            delay = (
                current_time - expected_arrival_dt
            ).total_seconds() / 60

            arrival_log.arrival_delay_minutes = max(0, int(delay))

        next_rs = self._get_next_route_station(
            schedule,
            route_station
        )

        arrival_log.next_route_station_id = (
            next_rs.id if next_rs else None
        )
        arrival_log.next_station_name = (
            next_rs.station_name if next_rs else None
        )

        device.current_route_station_id = route_station.id
        device.next_route_station_id = (
            next_rs.id if next_rs else None
        )

        if is_last_station:
            self._complete_journey(
                device=device,
                schedule=schedule,
                arrival_log=arrival_log,
                route_station=route_station,
                current_time=current_time
            )

        result = {
            "arrival_detected": True,
            "station_name": route_station.station_name,
            "train_stop_id": train_stop.id,
            "route_station_id": route_station.id,
            "arrival_time": current_time.isoformat() + "Z",
            "is_last_station": is_last_station
        }

        if next_rs:
            result["next_station"] = {
                "name": next_rs.station_name,
                "route_station_id": next_rs.id
            }

        return result

    def _auto_depart_from_station(
        self,
        device: TrainRiderDevice,
        schedule: Schedule,
        route_station: RouteStation,
        current_time: datetime
    ) -> dict:
        arrival_log = self._get_runtime_log(
            schedule.id,
            route_station.id
        )

        if not arrival_log or arrival_log.status != "ARRIVED":
            return {"auto_departed": False}

        arrival_log.departure_time = current_time
        arrival_log.status = "DEPARTED"

        if arrival_log.arrival_time:
            duration = (
                current_time - arrival_log.arrival_time
            ).total_seconds()

            arrival_log.stop_duration_seconds = int(duration)
            arrival_log.stop_duration_minutes = int(duration / 60)

        train_stop = (
            self.db.query(TrainStop)
            .filter(
                TrainStop.train_id == schedule.train_id,
                TrainStop.route_station_id == route_station.id
            )
            .first()
        )

        if train_stop and train_stop.expected_departure_time:
            expected_departure_dt = self._expected_datetime(
                schedule,
                train_stop.expected_departure_time
            )

            if expected_departure_dt:
                delay = (
                    current_time - expected_departure_dt
                ).total_seconds() / 60

                arrival_log.departure_delay_minutes = max(0, int(delay))

        # Between stations: current station is none; next remains the next stop.
        device.current_route_station_id = None
        device.next_route_station_id = arrival_log.next_route_station_id

        return {
            "auto_departed": True,
            "station_name": route_station.station_name,
            "departure_time": current_time.isoformat() + "Z"
        }

    # ============================================================
    # Manual arrival/departure
    # ============================================================

    def manual_arrival(
        self,
        device_id: str,
        route_station_id: int,
        train_stop_id: Optional[int] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        actor_staff_id: Optional[str] = None
    ) -> dict:
        """Manual fallback for the next expected station only.

        This creates station runtime state but deliberately does not fabricate a
        LocationHistory GPS point when the browser has no fresh coordinate.
        """
        device = self._get_device(device_id)
        self._assert_device_owner(device, actor_staff_id)
        schedule = self._get_schedule_for_device(device)

        if schedule.status != "ACTIVE":
            raise ValueError(f"Schedule #{schedule.id} is not active")
        if device.current_route_station_id is not None:
            raise ValueError("Depart the current station before marking another arrival")
        if device.next_route_station_id != route_station_id:
            raise ValueError("Manual arrival is allowed only for the next expected station")

        route_station = (
            self.db.query(RouteStation)
            .filter(
                RouteStation.id == route_station_id,
                RouteStation.route_id == schedule.route_id
            )
            .first()
        )
        if not route_station:
            raise ValueError("Route station does not belong to the active schedule")

        if latitude is None or longitude is None:
            if device.current_latitude is not None and device.current_longitude is not None:
                latitude = float(device.current_latitude)
                longitude = float(device.current_longitude)
            else:
                coords = self._get_station_coordinates(route_station)
                if not coords:
                    raise ValueError(
                        "No GPS fix or station coordinates are available for manual arrival"
                    )
                latitude, longitude = coords

        try:
            result = self._handle_manual_arrival(
                device=device,
                schedule=schedule,
                route_station_id=route_station_id,
                train_stop_id=train_stop_id,
                latitude=float(latitude),
                longitude=float(longitude)
            )
            self.db.commit()
            return result
        except Exception:
            self.db.rollback()
            raise

    def _handle_manual_arrival(
        self,
        device: TrainRiderDevice,
        schedule: Schedule,
        route_station_id: int,
        train_stop_id: Optional[int],
        latitude: float,
        longitude: float
    ) -> dict:
        """
        Manual/testing arrival.

        There is deliberately no fallback that guesses the latest schedule for
        the train. device.schedule_id is authoritative.
        """
        current_time = railway_now()

        route_station = (
            self.db.query(RouteStation)
            .filter(
                RouteStation.id == route_station_id,
                RouteStation.route_id == schedule.route_id
            )
            .first()
        )

        if not route_station:
            raise ValueError(
                "Route station is not part of the device's current schedule"
            )

        train_stop_query = (
            self.db.query(TrainStop)
            .filter(
                TrainStop.train_id == schedule.train_id,
                TrainStop.route_station_id == route_station.id
            )
        )

        if train_stop_id is not None:
            train_stop_query = train_stop_query.filter(
                TrainStop.id == train_stop_id
            )

        train_stop = train_stop_query.first()

        if not train_stop:
            raise ValueError(
                "Static TrainStop timetable row not found"
            )

        route_stations, _ = self._get_route_context(schedule)

        is_last_station = bool(
            route_stations
            and route_station.order_number
            == route_stations[-1].order_number
        )

        result = self._auto_arrive_at_station(
            device=device,
            schedule=schedule,
            route_station=route_station,
            train_stop=train_stop,
            latitude=latitude,
            longitude=longitude,
            current_time=current_time,
            is_last_station=is_last_station
        )

        result["manual"] = True
        return result

    def log_departure(
        self,
        device_id: str,
        train_stop_id: int,
        manual_departure: bool = False,
        route_station_id: Optional[int] = None,
        actor_staff_id: Optional[str] = None
    ) -> dict:
        device = self._get_device(device_id)
        self._assert_device_owner(device, actor_staff_id)
        schedule = self._get_schedule_for_device(device)
        if schedule.status != "ACTIVE":
            raise ValueError(f"Schedule #{schedule.id} is not active")
        current_time = railway_now()

        train_stop = (
            self.db.query(TrainStop)
            .filter(
                TrainStop.id == train_stop_id,
                TrainStop.train_id == schedule.train_id
            )
            .first()
        )

        if not train_stop:
            raise ValueError(
                "TrainStop does not belong to the current schedule train"
            )

        resolved_route_station_id = (
            route_station_id
            if route_station_id is not None
            else train_stop.route_station_id
        )

        route_station = (
            self.db.query(RouteStation)
            .filter(
                RouteStation.id == resolved_route_station_id,
                RouteStation.route_id == schedule.route_id
            )
            .first()
        )

        if not route_station:
            raise ValueError(
                "Route station does not belong to the current schedule route"
            )

        if device.current_route_station_id != route_station.id:
            raise ValueError(
                "Manual departure is allowed only from the station currently marked ARRIVED"
            )

        arrival_log = self._get_runtime_log(
            schedule.id,
            route_station.id
        )

        if not arrival_log or arrival_log.status != "ARRIVED":
            raise ValueError("No ARRIVED station log exists for this departure")

        try:
            arrival_log.departure_time = current_time
            arrival_log.status = "DEPARTED"

            if arrival_log.arrival_time:
                duration = (
                    current_time - arrival_log.arrival_time
                ).total_seconds()
                arrival_log.stop_duration_seconds = int(duration)
                arrival_log.stop_duration_minutes = int(duration / 60)

            expected_departure_dt = self._expected_datetime(
                schedule,
                train_stop.expected_departure_time
            )

            if expected_departure_dt:
                delay = (
                    current_time - expected_departure_dt
                ).total_seconds() / 60
                arrival_log.departure_delay_minutes = max(0, int(delay))

            device.current_route_station_id = None
            device.next_route_station_id = arrival_log.next_route_station_id

            self.db.commit()

            return {
                "status": "departed",
                "schedule_id": schedule.id,
                "station_name": route_station.station_name,
                "stop_duration_seconds": arrival_log.stop_duration_seconds,
                "stop_duration_minutes": arrival_log.stop_duration_minutes,
                "departure_time": current_time.isoformat() + "Z",
                "manual": manual_departure
            }

        except Exception:
            self.db.rollback()
            raise

    # ============================================================
    # Completion
    # ============================================================

    def _complete_journey(
        self,
        device: TrainRiderDevice,
        schedule: Schedule,
        arrival_log: StationArrivalLog,
        route_station: RouteStation,
        current_time: datetime
    ):
        """
        Complete the dated run without touching TrainStop.
        """
        # The destination is complete on ARRIVAL. Do not invent a departure
        # event from the final station.
        arrival_log.status = "ARRIVED"
        arrival_log.departure_time = None

        schedule.status = "COMPLETED"
        schedule.actual_arrival_time = current_time

        staff_assignments = (
            self.db.query(TrainStaffAssignment)
            .filter(
                TrainStaffAssignment.schedule_id == schedule.id,
                TrainStaffAssignment.status.in_([
                    AssignmentStatus.ACTIVE,
                    AssignmentStatus.SCHEDULED
                ])
            )
            .all()
        )

        for assignment in staff_assignments:
            assignment.status = AssignmentStatus.COMPLETED
            assignment.end_time = current_time

            staff = (
                self.db.query(Staff)
                .filter(Staff.id == assignment.staff_id)
                .first()
            )

            if staff:
                staff.is_available = True
                staff.status = StaffStatus.ACTIVE

        device.current_route_station_id = route_station.id
        device.next_route_station_id = None
        device.status = "INACTIVE"

        # Keep schedule_id/train_id for post-journey status/history.
        # start_journey will overwrite/reset them for the next run.

    # ============================================================
    # Status
    # ============================================================

    def get_device_status(
        self,
        device_id: str,
        actor_staff_id: Optional[str] = None
    ) -> dict:
        device = self._get_device(device_id)
        self._assert_device_owner(device, actor_staff_id)

        recent_locations = []
        recent_logs = []

        if device.schedule_id:
            recent_locations = (
                self.db.query(LocationHistory)
                .filter(
                    LocationHistory.device_id == device.id,
                    LocationHistory.schedule_id == device.schedule_id
                )
                .order_by(LocationHistory.timestamp.desc())
                .limit(10)
                .all()
            )

            recent_logs = (
                self.db.query(StationArrivalLog)
                .filter(
                    StationArrivalLog.schedule_id == device.schedule_id
                )
                .order_by(StationArrivalLog.created_at.desc())
                .limit(5)
                .all()
            )

        return {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "status": device.status,
            "schedule_id": device.schedule_id,
            "current_location": {
                "latitude": device.current_latitude,
                "longitude": device.current_longitude,
                "updated_at": (
                    device.location_updated_at.isoformat()
                    if device.location_updated_at
                    else None
                )
            },
            "current_speed": device.current_speed,
            "train": (
                {
                    "id": device.train_id,
                    "name": device.train.train_name
                }
                if device.train
                else None
            ),
            "recent_locations": [
                {
                    "latitude": item.latitude,
                    "longitude": item.longitude,
                    "speed": item.speed,
                    "accuracy": item.accuracy,
                    "timestamp": (
                        item.timestamp.isoformat() + "Z"
                        if item.timestamp
                        else None
                    )
                }
                for item in recent_locations
            ],
            "recent_arrivals": [
                {
                    "station": (
                        log.route_station.station_name
                        if log.route_station
                        else None
                    ),
                    "arrival_time": (
                        log.arrival_time.isoformat() + "Z"
                        if log.arrival_time
                        else None
                    ),
                    "departure_time": (
                        log.departure_time.isoformat() + "Z"
                        if log.departure_time
                        else None
                    ),
                    "status": log.status
                }
                for log in recent_logs
            ]
        }
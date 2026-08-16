# services/location_tracking_service.py
from typing import Optional, List
from datetime import datetime, timedelta, timezone
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
from ..models.train import Train
from ..models.staff import Staff, StaffStatus


# ✅ Helper function to get current UTC time (naive, for DB compatibility)
def _utcnow():
    """Return current UTC datetime (naive, for database compatibility)"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class LocationTrackingService:
    """Service to handle train location tracking and station arrival detection"""

    ARRIVAL_RADIUS_METERS = 3.0

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two GPS coordinates in meters"""
        R = 6371000
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)
        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c

    def _get_or_create_device(self, device_id_str: str) -> TrainRiderDevice:
        """Get device by string device_id, or create if not exists"""
        device = self.db.query(TrainRiderDevice).filter(
            TrainRiderDevice.device_id == device_id_str
        ).first()
        if not device:
            device = TrainRiderDevice(
                device_id=device_id_str,
                device_name=f"Device {device_id_str}",
                device_type="STAFF_DEVICE",
                status="ACTIVE"
            )
            self.db.add(device)
            self.db.flush()
        return device

    def _get_station_coordinates(self, route_station: RouteStation):
        """Get coordinates for a route station"""
        if route_station.station_id:
            station_obj = self.db.query(Station).filter(
                Station.id == route_station.station_id
            ).first()
            if station_obj and station_obj.latitude and station_obj.longitude:
                return (float(station_obj.latitude), float(station_obj.longitude))
        return None

    def update_device_location(
            self,
            device_id: str,
            latitude: float,
            longitude: float,
            speed: Optional[float] = None,
            accuracy: Optional[float] = None,
            manual_arrival: bool = False,
            route_station_id: Optional[int] = None,
            train_stop_id: Optional[int] = None
    ) -> dict:
        """Update device location and check for station arrivals/departures"""
        device = self._get_or_create_device(device_id)

        current_time = _utcnow()

        device.current_latitude = float(latitude)
        device.current_longitude = float(longitude)
        device.current_speed = speed
        device.location_updated_at = current_time

        location_log = LocationHistory(
            device_id=device.id,
            latitude=float(latitude),
            longitude=float(longitude),
            speed=float(speed) if speed else None,
            accuracy=float(accuracy) if accuracy else None,
            timestamp=current_time
        )
        self.db.add(location_log)

        result = {
            "device_id": device_id,
            "status": "updated",
            "arrival_detected": False
        }

        if manual_arrival and route_station_id:
            arrival_check = self._handle_manual_arrival(
                device, route_station_id, train_stop_id, latitude, longitude
            )
            result.update(arrival_check)
        elif device.train_id and device.schedule_id:
            arrival_check = self.check_station_proximity(device, latitude, longitude)
            result.update(arrival_check)

        self.db.commit()
        return result

    def check_station_proximity(
            self,
            device: TrainRiderDevice,
            latitude: float,
            longitude: float
    ) -> dict:
        """
        Check proximity to all stations on route.
        Auto-arrive within 3m, auto-depart when >3m from arrived station.
        """
        result = {
            "arrival_detected": False,
            "station_name": None,
            "next_station": None,
            "auto_departed": False
        }

        if not device.train_id:
            return result

        train = self.db.query(Train).filter(Train.id == device.train_id).first()
        if not train or not train.route_id:
            return result

        route_stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == train.route_id
        ).order_by(RouteStation.order_number).all()

        train_stops = self.db.query(TrainStop).filter(
            TrainStop.train_id == device.train_id
        ).all()
        train_stops_map = {ts.route_station_id: ts for ts in train_stops}

        current_time = _utcnow()
        schedule_id = device.schedule_id  # ✅ Current schedule ID

        # First pass: Check for auto-depart
        for rs in route_stations:
            train_stop = train_stops_map.get(rs.id)
            if train_stop and train_stop.status == "ARRIVED":
                station_coords = self._get_station_coordinates(rs)
                if station_coords:
                    distance = self.calculate_distance(
                        latitude, longitude,
                        station_coords[0], station_coords[1]
                    )
                    if distance > self.ARRIVAL_RADIUS_METERS:
                        depart_result = self._auto_depart_from_station(
                            device, rs, train_stop, current_time, schedule_id
                        )
                        if depart_result.get("auto_departed"):
                            result["auto_departed"] = True

        # Second pass: Check for auto-arrive
        for rs in route_stations:
            train_stop = train_stops_map.get(rs.id)

            # Skip first station if already departed
            if rs.order_number == 1 and train_stop and train_stop.status == "DEPARTED":
                continue

            # Only auto-arrive at SCHEDULED stations
            if train_stop and train_stop.status != "SCHEDULED":
                continue

            station_coords = self._get_station_coordinates(rs)
            if not station_coords:
                continue

            distance = self.calculate_distance(
                latitude, longitude,
                station_coords[0], station_coords[1]
            )

            if distance <= self.ARRIVAL_RADIUS_METERS:
                is_last = (rs.order_number == route_stations[-1].order_number)
                arrival_result = self._auto_arrive_at_station(
                    device, rs, train_stop, latitude, longitude, current_time, is_last, schedule_id
                )
                result.update(arrival_result)
                break

        return result

    def _auto_arrive_at_station(
            self,
            device: TrainRiderDevice,
            route_station: RouteStation,
            train_stop: TrainStop,
            latitude: float,
            longitude: float,
            current_time: datetime,
            is_last_station: bool,
            schedule_id: Optional[int] = None
    ) -> dict:
        """Auto-arrive at a station when within 3m"""

        # ✅ Use device.schedule_id for filtering
        sid = schedule_id or device.schedule_id

        # Check for recent arrival with SAME schedule_id
        recent_log = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.route_station_id == route_station.id,
            StationArrivalLog.schedule_id == sid,  # ✅ Filter by current schedule
            StationArrivalLog.arrival_time >= current_time - timedelta(minutes=5)
        ).first()

        if recent_log:
            return {"arrival_detected": False}

        arrival_log = StationArrivalLog(
            device_id=device.id,
            train_id=device.train_id,
            schedule_id=sid,  # ✅ Use current schedule ID
            route_station_id=route_station.id,
            train_stop_id=train_stop.id,
            schedule_date=current_time.date(),
            arrival_time=current_time,
            expected_arrival_time=train_stop.expected_arrival_time,
            arrival_latitude=float(latitude),
            arrival_longitude=float(longitude),
            status="ARRIVED"
        )

        if train_stop.expected_arrival_time:
            expected_dt = datetime.combine(current_time.date(), train_stop.expected_arrival_time)
            delay = (current_time - expected_dt).total_seconds() / 60
            arrival_log.arrival_delay_minutes = max(0, int(delay))

        next_rs = self.db.query(RouteStation).filter(
            RouteStation.route_id == route_station.route_id,
            RouteStation.order_number > route_station.order_number
        ).order_by(RouteStation.order_number).first()

        if next_rs:
            arrival_log.next_route_station_id = next_rs.id
            arrival_log.next_station_name = next_rs.station_name

        self.db.add(arrival_log)

        device.current_route_station_id = route_station.id
        device.next_route_station_id = next_rs.id if next_rs else None

        train_stop.status = "ARRIVED"
        train_stop.actual_arrival_time = current_time.time()

        if is_last_station:
            self._complete_journey(device, arrival_log, train_stop, route_station, current_time)

        result = {
            "arrival_detected": True,
            "station_name": route_station.station_name,
            "train_stop_id": train_stop.id,
            "arrival_time": current_time.isoformat() + "Z",
            "is_last_station": is_last_station
        }

        if next_rs:
            result["next_station"] = {
                "name": next_rs.station_name,
                "route_station_id": next_rs.id
            }

        return result

    def _complete_journey(
            self,
            device: TrainRiderDevice,
            arrival_log: StationArrivalLog,
            train_stop: TrainStop,
            route_station: RouteStation,
            current_time: datetime
    ):
        """Complete the journey when arriving at the last station."""

        arrival_log.departure_time = current_time
        arrival_log.status = "DEPARTED"
        arrival_log.stop_duration_seconds = 0
        arrival_log.stop_duration_minutes = 0

        train_stop.status = "DEPARTED"
        train_stop.actual_departure_time = current_time.time()

        if device.schedule_id:
            schedule = self.db.query(Schedule).filter(
                Schedule.id == device.schedule_id
            ).first()
            if schedule:
                schedule.status = "COMPLETED"
                schedule.actual_arrival_time = current_time
                print(f"✅ Schedule {schedule.id} marked as COMPLETED")

        staff_assignments = self.db.query(TrainStaffAssignment).filter(
            TrainStaffAssignment.schedule_id == device.schedule_id,
            TrainStaffAssignment.status.in_([AssignmentStatus.ACTIVE, AssignmentStatus.SCHEDULED])
        ).all()

        for assignment in staff_assignments:
            assignment.status = AssignmentStatus.COMPLETED
            assignment.end_time = current_time
            print(f"✅ Staff assignment {assignment.id} marked as COMPLETED")

        for assignment in staff_assignments:
            staff = self.db.query(Staff).filter(Staff.id == assignment.staff_id).first()
            if staff:
                staff.is_available = True
                staff.status = StaffStatus.ACTIVE
                print(f"✅ Staff {staff.staff_id} set as available")

        device.current_route_station_id = None
        device.next_route_station_id = None
        device.status = "INACTIVE"
        print(f"✅ Device {device.device_id} status set to INACTIVE")
        print(f"🎉 Journey completed at {route_station.station_name}!")

    def _auto_depart_from_station(
            self,
            device: TrainRiderDevice,
            route_station: RouteStation,
            train_stop: TrainStop,
            current_time: datetime,
            schedule_id: Optional[int] = None
    ) -> dict:
        """Auto-depart when device moves >3m away from arrived station"""

        sid = schedule_id or device.schedule_id

        arrival_log = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.route_station_id == route_station.id,
            StationArrivalLog.schedule_id == sid,  # ✅ Filter by current schedule
            StationArrivalLog.status == "ARRIVED"
        ).order_by(StationArrivalLog.arrival_time.desc()).first()

        if arrival_log:
            arrival_log.departure_time = current_time
            arrival_log.status = "DEPARTED"

            if arrival_log.arrival_time:
                duration = (current_time - arrival_log.arrival_time).total_seconds()
                arrival_log.stop_duration_seconds = int(duration)
                arrival_log.stop_duration_minutes = int(duration / 60)

            train_stop.status = "DEPARTED"
            train_stop.actual_departure_time = current_time.time()

            device.current_route_station_id = arrival_log.next_route_station_id

            return {
                "auto_departed": True,
                "station_name": route_station.station_name,
                "departure_time": current_time.isoformat() + "Z"
            }

        return {"auto_departed": False}

    def _handle_manual_arrival(
            self,
            device: TrainRiderDevice,
            route_station_id: int,
            train_stop_id: Optional[int],
            latitude: float,
            longitude: float
    ) -> dict:
        """Handle manual station arrival for testing"""
        current_time = _utcnow()
        print(f"🕐 Setting arrival time to: {current_time}")

        route_station = self.db.query(RouteStation).filter(
            RouteStation.id == route_station_id
        ).first()
        if not route_station:
            return {"arrival_detected": False, "error": "Route station not found"}

        schedule = None
        if device.schedule_id:
            schedule = self.db.query(Schedule).filter(Schedule.id == device.schedule_id).first()
        if not schedule and device.train_id:
            schedule = self.db.query(Schedule).filter(
                Schedule.train_id == device.train_id,
                Schedule.status.in_(["SCHEDULED", "ACTIVE"])
            ).order_by(Schedule.departure_date.desc()).first()
            if schedule:
                device.schedule_id = schedule.id
        if not schedule:
            return {"arrival_detected": False, "error": "No active schedule found"}

        if not device.train_id:
            device.train_id = schedule.train_id

        train_stop = None
        if train_stop_id:
            train_stop = self.db.query(TrainStop).filter(TrainStop.id == train_stop_id).first()
        if not train_stop:
            train_stop = self.db.query(TrainStop).filter(
                TrainStop.train_id == schedule.train_id,
                TrainStop.route_station_id == route_station_id
            ).first()
            if not train_stop:
                train_stop = TrainStop(
                    train_id=schedule.train_id,
                    route_station_id=route_station_id,
                    status="SCHEDULED"
                )
                self.db.add(train_stop)
                self.db.flush()

        # ✅ Check for recent arrival with SAME schedule_id
        recent_log = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.route_station_id == route_station_id,
            StationArrivalLog.schedule_id == schedule.id,  # ✅ Current schedule
            StationArrivalLog.status == "ARRIVED",
            StationArrivalLog.arrival_time >= current_time - timedelta(minutes=5)
        ).first()
        if recent_log:
            return {"arrival_detected": False, "message": "Already arrived recently"}

        arrival_log = StationArrivalLog(
            device_id=device.id,
            train_id=schedule.train_id,
            schedule_id=schedule.id,  # ✅ Current schedule ID
            route_station_id=route_station_id,
            train_stop_id=train_stop.id,
            schedule_date=schedule.departure_date or current_time.date(),
            arrival_time=current_time,
            expected_arrival_time=train_stop.expected_arrival_time,
            arrival_latitude=float(latitude),
            arrival_longitude=float(longitude),
            status="ARRIVED"
        )
        print(f"✅ Arrival time set to: {arrival_log.arrival_time}")

        if train_stop.expected_arrival_time:
            expected_dt = datetime.combine(current_time.date(), train_stop.expected_arrival_time)
            delay = (current_time - expected_dt).total_seconds() / 60
            arrival_log.arrival_delay_minutes = max(0, int(delay))

        self.db.add(arrival_log)

        device.current_route_station_id = route_station_id
        train_stop.status = "ARRIVED"
        train_stop.actual_arrival_time = current_time.time()

        all_route_stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == schedule.route_id
        ).order_by(RouteStation.order_number).all()

        is_last_station = (route_station.order_number == all_route_stations[-1].order_number)

        next_stop = None
        if not is_last_station:
            next_stop = self.db.query(TrainStop).join(RouteStation).filter(
                TrainStop.train_id == schedule.train_id,
                RouteStation.order_number > route_station.order_number
            ).order_by(RouteStation.order_number).first()

        if next_stop and next_stop.route_station:
            arrival_log.next_route_station_id = next_stop.route_station_id
            arrival_log.next_station_name = next_stop.route_station.station_name
            device.next_route_station_id = next_stop.route_station_id

        if is_last_station:
            self._complete_journey(device, arrival_log, train_stop, route_station, current_time)

        result = {
            "arrival_detected": True,
            "station_name": route_station.station_name,
            "train_stop_id": train_stop.id,
            "arrival_time": current_time.isoformat() + "Z",
            "manual": True,
            "is_last_station": is_last_station
        }

        if next_stop and next_stop.route_station:
            result["next_station"] = {"name": next_stop.route_station.station_name}

        return result

    def log_departure(
            self,
            device_id: str,
            train_stop_id: int,
            manual_departure: bool = False,
            route_station_id: Optional[int] = None
    ) -> dict:
        """Log departure from a station"""
        device = self._get_or_create_device(device_id)
        current_time = _utcnow()
        schedule_id = device.schedule_id  # ✅ Current schedule

        arrival_log_query = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.status == "ARRIVED",
            StationArrivalLog.schedule_id == schedule_id  # ✅ Filter by current schedule
        )
        if train_stop_id:
            arrival_log_query = arrival_log_query.filter(
                StationArrivalLog.train_stop_id == train_stop_id
            )
        if route_station_id:
            arrival_log_query = arrival_log_query.filter(
                StationArrivalLog.route_station_id == route_station_id
            )

        arrival_log = arrival_log_query.order_by(
            StationArrivalLog.arrival_time.desc()
        ).first()

        if arrival_log:
            arrival_log.departure_time = current_time
            arrival_log.status = "DEPARTED"
            if arrival_log.arrival_time:
                duration = (current_time - arrival_log.arrival_time).total_seconds()
                arrival_log.stop_duration_seconds = int(duration)
                arrival_log.stop_duration_minutes = int(duration / 60)

            if arrival_log.train_stop_id:
                train_stop = self.db.query(TrainStop).filter(
                    TrainStop.id == arrival_log.train_stop_id
                ).first()
                if train_stop:
                    train_stop.status = "DEPARTED"
                    train_stop.actual_departure_time = current_time.time()

            if device.current_route_station_id == arrival_log.route_station_id:
                device.current_route_station_id = arrival_log.next_route_station_id

            self.db.commit()
            return {
                "status": "departed",
                "station_name": arrival_log.route_station.station_name if arrival_log.route_station else None,
                "stop_duration_seconds": arrival_log.stop_duration_seconds,
                "stop_duration_minutes": arrival_log.stop_duration_minutes,
                "departure_time": current_time.isoformat() + "Z",
                "manual": manual_departure
            }

        return {"status": "no_arrival_log_found"}

    def get_device_status(self, device_id: str) -> dict:
        """Get detailed status of a train rider device"""
        device = self._get_or_create_device(device_id)
        recent_locations = self.db.query(LocationHistory).filter(
            LocationHistory.device_id == device.id
        ).order_by(LocationHistory.timestamp.desc()).limit(10).all()

        # ✅ Filter recent logs by current schedule
        recent_logs = self.db.query(StationArrivalLog).filter(
            StationArrivalLog.device_id == device.id,
            StationArrivalLog.schedule_id == device.schedule_id  # ✅ Current schedule only
        ).order_by(StationArrivalLog.created_at.desc()).limit(5).all()

        return {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "status": device.status,
            "current_location": {
                "latitude": device.current_latitude,
                "longitude": device.current_longitude,
                "updated_at": device.location_updated_at.isoformat() if device.location_updated_at else None
            },
            "current_speed": device.current_speed,
            "train": {
                "id": device.train_id,
                "name": device.train.train_name if device.train else None
            } if device.train else None,
            "schedule_id": device.schedule_id,
            "recent_arrivals": [
                {
                    "station": log.route_station.station_name if log.route_station else None,
                    "arrival_time": log.arrival_time.isoformat() + "Z" if log.arrival_time else None,
                    "departure_time": log.departure_time.isoformat() + "Z" if log.departure_time else None,
                    "status": log.status,
                } for log in recent_logs
            ]
        }
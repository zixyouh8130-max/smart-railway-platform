from datetime import timedelta
from math import radians, sin, cos, sqrt, atan2
from typing import List, Dict, Optional

from sqlalchemy.orm import Session, joinedload

from ..core.railway_time import railway_now
from ..models.train_rider_device import TrainRiderDevice, DeviceType
from ..models.location_history import LocationHistory
from ..models.station_arrival_log import StationArrivalLog
from ..models.schedule import Schedule
from ..models.route_station import RouteStation
from ..models.train_stop import TrainStop
from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..models.station import Station


class TrainTrackingDashboardService:
    """Schedule-scoped real-time dashboard service.

    TrainStop is static. Runtime progress is derived only from
    StationArrivalLog rows for the exact schedule_id.
    """

    def __init__(self, db: Session):
        self.db = db

    def _device_for_schedule(self, schedule_id: int) -> Optional[TrainRiderDevice]:
        devices = (
            self.db.query(TrainRiderDevice)
            .options(
                joinedload(TrainRiderDevice.train),
                joinedload(TrainRiderDevice.schedule),
                joinedload(TrainRiderDevice.current_route_station),
                joinedload(TrainRiderDevice.next_route_station),
            )
            .filter(
                TrainRiderDevice.schedule_id == schedule_id,
                TrainRiderDevice.status == "ACTIVE",
            )
            .all()
        )
        if not devices:
            return None

        # Prefer a train-mounted device, otherwise use the assigned active device.
        for device in devices:
            if device.device_type == DeviceType.TRAIN_DEVICE:
                return device
        return devices[0]

    def _schedule_progress(self, schedule: Schedule):
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
        stop_map = {stop.route_station_id: stop for stop in train_stops}

        logs = (
            self.db.query(StationArrivalLog)
            .filter(StationArrivalLog.schedule_id == schedule.id)
            .order_by(StationArrivalLog.created_at.asc())
            .all()
        )
        log_map = {log.route_station_id: log for log in logs}

        detail = []
        for rs in route_stations:
            stop = stop_map.get(rs.id)
            log = log_map.get(rs.id)
            detail.append({
                "route_station_id": rs.id,
                "station_name": rs.station_name,
                "station_code": rs.station_code,
                "order_number": rs.order_number,
                "expected_arrival": (
                    stop.expected_arrival_time.strftime("%H:%M")
                    if stop and stop.expected_arrival_time else None
                ),
                "expected_departure": (
                    stop.expected_departure_time.strftime("%H:%M")
                    if stop and stop.expected_departure_time else None
                ),
                "actual_arrival": (
                    log.arrival_time.isoformat() if log and log.arrival_time else None
                ),
                "actual_departure": (
                    log.departure_time.isoformat() if log and log.departure_time else None
                ),
                "delay_minutes": log.arrival_delay_minutes if log else 0,
                "status": log.status if log else "SCHEDULED",
                "stop_duration": log.stop_duration_minutes if log else None,
            })

        completed = sum(1 for row in detail if row["status"] == "DEPARTED")
        total = len(detail)
        percentage = (completed / total * 100.0) if total else 0.0
        latest_log = logs[-1] if logs else None
        return detail, completed, total, percentage, latest_log

    def get_active_trains_overview(self) -> List[Dict]:
        schedules = (
            self.db.query(Schedule)
            .filter(Schedule.status == "ACTIVE")
            .order_by(Schedule.departure_date, Schedule.departure_time)
            .all()
        )

        overview = []
        for schedule in schedules:
            device = self._device_for_schedule(schedule.id)
            if not device or not device.train:
                continue

            _, completed, total, percentage, latest_log = self._schedule_progress(schedule)

            staff_assignments = (
                self.db.query(TrainStaffAssignment)
                .filter(
                    TrainStaffAssignment.schedule_id == schedule.id,
                    TrainStaffAssignment.status.in_([
                        AssignmentStatus.SCHEDULED,
                        AssignmentStatus.ACTIVE,
                    ]),
                )
                .all()
            )

            staff_list = []
            for assignment in staff_assignments:
                if not assignment.staff:
                    continue
                full_name = assignment.staff.staff_id
                if getattr(assignment.staff, "user", None):
                    full_name = (
                        getattr(assignment.staff.user, "full_name", None)
                        or assignment.staff.staff_id
                    )
                staff_list.append({
                    "staff_name": full_name,
                    "role": assignment.role_on_train,
                    "staff_id": assignment.staff.staff_id,
                })

            overview.append({
                "schedule_id": schedule.id,
                "train_id": schedule.train_id,
                "train_name": device.train.train_name,
                "train_no": device.train.train_no,
                "device_id": device.device_id,
                "current_location": {
                    "latitude": device.current_latitude,
                    "longitude": device.current_longitude,
                    "speed": device.current_speed,
                    "updated_at": (
                        device.location_updated_at.isoformat()
                        if device.location_updated_at else None
                    ),
                },
                "current_station": (
                    device.current_route_station.station_name
                    if device.current_route_station else None
                ),
                "next_station": (
                    device.next_route_station.station_name
                    if device.next_route_station else None
                ),
                "progress": {
                    "completed_stops": completed,
                    "total_stops": total,
                    "percentage": round(percentage, 1),
                },
                "delay_minutes": (
                    latest_log.arrival_delay_minutes if latest_log else 0
                ),
                "status": schedule.status,
                "staff": staff_list,
                "battery": device.battery_level,
            })

        return overview

    def get_train_detailed_status(self, train_id: int) -> Dict:
        schedule = (
            self.db.query(Schedule)
            .filter(
                Schedule.train_id == train_id,
                Schedule.status == "ACTIVE",
            )
            .order_by(Schedule.departure_date.desc(), Schedule.departure_time.desc())
            .first()
        )
        if not schedule:
            return {"error": "No active schedule found for this train"}

        device = self._device_for_schedule(schedule.id)
        if not device:
            return {"error": "No active device found for this schedule"}

        detail, _, _, _, _ = self._schedule_progress(schedule)
        cutoff = railway_now() - timedelta(hours=1)
        recent_locations = (
            self.db.query(LocationHistory)
            .filter(
                LocationHistory.device_id == device.id,
                LocationHistory.schedule_id == schedule.id,
                LocationHistory.timestamp >= cutoff,
            )
            .order_by(LocationHistory.timestamp.desc())
            .limit(50)
            .all()
        )

        return {
            "train": {
                "id": device.train.id if device.train else train_id,
                "name": device.train.train_name if device.train else None,
                "train_no": device.train.train_no if device.train else None,
                "speed": device.train.speed if device.train else None,
            },
            "schedule_id": schedule.id,
            "current_status": {
                "latitude": device.current_latitude,
                "longitude": device.current_longitude,
                "speed": device.current_speed,
                "battery": device.battery_level,
                "last_update": (
                    device.location_updated_at.isoformat()
                    if device.location_updated_at else None
                ),
            },
            "route_progress": detail,
            "location_history": [
                {
                    "latitude": item.latitude,
                    "longitude": item.longitude,
                    "speed": item.speed,
                    "accuracy": item.accuracy,
                    "timestamp": item.timestamp.isoformat(),
                }
                for item in recent_locations
            ],
            "schedule": {
                "departure_date": schedule.departure_date.isoformat(),
                "status": schedule.status,
            },
        }

    def get_nearby_stations(
        self,
        latitude: float,
        longitude: float,
        radius_miles: float = 6,
    ) -> List[Dict]:
        stations = (
            self.db.query(Station)
            .filter(
                Station.latitude.isnot(None),
                Station.longitude.isnot(None),
            )
            .all()
        )

        meters_per_mile = 1609.344
        nearby = []

        for station in stations:
            distance_meters = self.calculate_distance(
                latitude,
                longitude,
                float(station.latitude),
                float(station.longitude),
            )

            if (
                distance_meters
                <= radius_miles * meters_per_mile
            ):
                nearby.append({
                    "station_name": station.name,
                    "station_code": station.code,
                    "latitude": float(station.latitude),
                    "longitude": float(station.longitude),
                    "distance_meters": round(
                        distance_meters,
                        1,
                    ),
                    "distance_miles": round(
                        distance_meters
                        / meters_per_mile,
                        2,
                    ),
                })

        nearby.sort(
            key=lambda item: item[
                "distance_meters"
            ]
        )

        return nearby

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6_371_000
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)
        a = (
            sin(delta_lat / 2) ** 2
            + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        )
        return radius * 2 * atan2(sqrt(a), sqrt(1 - a))
